import {isPublicReactionTarget} from './reaction-privacy.mjs';
import {reactionLockManager} from './reaction-locks.mjs';
import {readReactionSignal} from './reaction-channel.mjs';
import {heroReactionSnapshot} from './hero-reaction.mjs';
import {resolveHeroResponse,confirmReactionMovement,confirmAttackDamage,reconcileInterruptedAttack} from './attack-resolution.mjs';
import {damageSnapshot} from './damage.mjs';
import {validateAttackPreparation} from './attack-preparation.mjs';

// Browser-local, GM-only recovery journal: never place secret UUIDs in a
// Foundry Document or socket broadcast. Different browsers cannot share it.
const validId=value=>typeof value==='string'&&/^[A-Za-z0-9]{16}$/.test(value);
const phase=new Set(['awaitingReaction','resolvingReaction','awaitingMovement','readyForDamage','applyingDamage','complete']);
const locked=new Set();
const key=(world,gm,id)=>`dawn.privateAttack.${encodeURIComponent(world)}.${encodeURIComponent(gm)}.${id}`;
function valid(s,id){return s&&s.attackId===id&&validId(id)&&validId(s.rollId)&&validId(s.targetId)&&typeof s.actorUuid==='string'&&s.actorUuid.length>0&&typeof s.tokenUuid==='string'&&s.tokenUuid.length>0&&typeof s.sourceUuid==='string'&&s.sourceUuid.length>0&&Number.isSafeInteger(s.amount)&&s.amount>=0&&phase.has(s.phase);}
function read(storage,world,gm,id){
 const raw=storage.getItem(key(world,gm,id));if(raw===null)return null;
 let value;try{value=JSON.parse(raw);}catch{throw Error('attackJournalCorrupt');}
 if(!valid(value,id))throw Error('attackJournalCorrupt');return value;
}
function write(storage,world,gm,id,value){
 if(!valid(value,id))throw Error('attackInvalid');
 try{storage.setItem(key(world,gm,id),JSON.stringify(value));if(JSON.stringify(read(storage,world,gm,id))!==JSON.stringify(value))throw Error('Unconfirmed');}
 catch(cause){throw new Error('attackJournalUncertain',{cause});}
}
/** Persist an already validated prepared attack, before sending any prompt. */
export function createPrivateAttack({storage,world,executor,isExecutor,state}){
 if(!storage||typeof world!=='string'||!world||!executor?.isGM||!validId(executor.id)||!isExecutor())throw Error('attackPermission');
 if(!valid(state,state?.attackId)||state.phase!=='awaitingReaction')throw Error('attackInvalid');
 if(read(storage,world,executor.id,state.attackId))throw Error('attackAlreadyPrepared');
 write(storage,world,executor.id,state.attackId,structuredClone(state));
}
/** GM explicitly identifies the source roll, exact target and precomputed damage.
 * No claim is made that arbitrary combat rolls are automatically attacks. */
export function preparePrivateAttack({storage,world,executor,isExecutor,source,target,scene,amount,randomId}){
 const data=validateAttackPreparation({source,target,scene,user:executor,isExecutor,amount});
 if(!Number.isSafeInteger(storage?.length)||typeof storage.key!=='function')throw Error('attackJournalUnavailable');
 const prefix=key(world,executor.id,'');
 for(let i=0;i<storage.length;i++){
  const name=storage.key(i);if(typeof name!=='string'||!name.startsWith(prefix))continue;
  const id=name.slice(prefix.length),prior=read(storage,world,executor.id,id);
  if(prior?.sourceUuid===data.sourceUuid&&prior?.tokenUuid===data.tokenUuid)throw Error('attackAlreadyPrepared');
 }
 const attackId=randomId();if(!validId(attackId))throw Error('attackInvalid');
 const state={...data,attackId,phase:'awaitingReaction'};
 // Revalidate after ID allocation, before the single local write.
 if(JSON.stringify(validateAttackPreparation({source,target,scene,user:executor,isExecutor,amount}))!==JSON.stringify(data))throw Error('attackChanged');
 createPrivateAttack({storage,world,executor,isExecutor,state});return state;
}
/** Serialize preparation for the same source/target across tabs of one profile. */
export async function preparePrivateAttackLocked(options){
 const {source,target,world,executor,isExecutor,lockManager=reactionLockManager()}=options;
 if(!executor?.isGM||!isExecutor())throw Error('attackPermission');
 if(!source?.uuid||!target?.uuid||!world)throw Error('attackInvalid');
 if(!lockManager?.request)throw Error('attackJournalUnavailable');
 const name=`dawn.prepare.${encodeURIComponent(world)}.${encodeURIComponent(executor.id)}.${encodeURIComponent(source.uuid)}.${encodeURIComponent(target.uuid)}`;
 return lockManager.request(name,{mode:'exclusive',ifAvailable:true},async held=>{
  if(!held)throw Error('attackBusy');
  return preparePrivateAttack(options);
 });
}
/** Minimal local adapter for the guarded resolution state machine. */
function recordFor({storage,world,executor,id}){
 return {author:executor,isOwner:true,whisper:[executor.id],blind:false,
  getFlag(_scope,name){return name==='attackResolution'?read(storage,world,executor.id,id):undefined;},
  async update(changes){const state=changes?.['flags.dawn.attackResolution'];write(storage,world,executor.id,id,state);return this;}};
}
async function verifySource(state,target,executor,isExecutor,resolveUuid){
 const source=await resolveUuid(state.sourceUuid);
 if(!source||source.uuid!==state.sourceUuid||!Array.isArray(source.whisper)||source.whisper.length||source.blind)throw Error('attackChanged');
 const current=validateAttackPreparation({source,target,scene:target?.parent,user:executor,isExecutor,amount:state.amount});
 if(current.rollId!==state.rollId||current.tokenUuid!==state.tokenUuid||current.actorUuid!==state.actorUuid)throw Error('attackChanged');
 return source;
}
/** Server-supplied sender is checked again against the current target actor. */
export async function dispatchReactionSignal({data,senderId,executor,isExecutor,users,storage,world,resolveUuid,lockManager=reactionLockManager()}){
 if(!executor?.isGM||!isExecutor())throw Error('attackPermission');
 const signal=readReactionSignal(data,senderId,{executorId:executor.id,users});
 const lockKey=key(world,executor.id,signal.attackId);if(!lockManager?.request)throw Error('attackJournalUnavailable');
 return lockManager.request(lockKey,{mode:'exclusive',ifAvailable:true},async lock=>{
 if(!lock||locked.has(lockKey))throw Error('attackBusy');locked.add(lockKey);
 try{
  const state=read(storage,world,executor.id,signal.attackId);if(!state||state.phase!=='awaitingReaction')throw Error('attackResponseUnavailable');
  const target=await resolveUuid(state.tokenUuid),actor=target?.actor;
  if(!isExecutor()||!target||target.uuid!==state.tokenUuid||target.id!==state.targetId||actor?.uuid!==state.actorUuid||!actor.testUserPermission(signal.author,'OWNER'))throw Error('attackResponseUnavailable');
  // Actor update broadcasts can expose receipt keys. Restrict this unconnected
  // path to openly named, non-hidden tokens whose actor every active player can see.
  const publicTarget=()=>isPublicReactionTarget(target,users);
  if(!publicTarget())throw Error('attackPrivacy');
  const source=await verifySource(state,target,executor,isExecutor,resolveUuid);
  const actorLock=`dawn.reactionActor.${encodeURIComponent(world)}.${encodeURIComponent(actor.uuid)}`;
  return await lockManager.request(actorLock,{mode:'exclusive',ifAvailable:true},async held=>{
   if(!held)throw Error('reactionBusy');
   if(!publicTarget())throw Error('attackPrivacy');
   if(await verifySource(state,target,executor,isExecutor,resolveUuid)!==source)throw Error('attackChanged');
   if(!isExecutor()||target.parent?.tokens?.get(target.id)!==target||target.actor!==actor||!actor.testUserPermission(signal.author,'OWNER'))throw Error('attackResponseUnavailable');
   const snapshot=heroReactionSnapshot(actor),record=recordFor({storage,world,executor,id:signal.attackId});
   return resolveHeroResponse({record,actor,target,executor,isExecutor,author:signal.author,choice:signal.choice,snapshot});
  });
 }finally{locked.delete(lockKey);}
 });
}

/** Explicit GM fallback when the player is absent or the table resolves manually. */
export async function acceptPrivateAttackAsGM({storage,world,executor,isExecutor,id,users,resolveUuid,lockManager=reactionLockManager()}){
 if(!executor?.isGM||!isExecutor())throw Error('attackPermission');
 if(!validId(id)||!lockManager?.request)throw Error('attackJournalUnavailable');
 return lockManager.request(key(world,executor.id,id),{mode:'exclusive',ifAvailable:true},async held=>{
  if(!held)throw Error('attackBusy');
  const state=read(storage,world,executor.id,id),target=state&&await resolveUuid(state.tokenUuid),actor=target?.actor;
  if(!state||state.phase!=='awaitingReaction'||!target||target.id!==state.targetId||target.uuid!==state.tokenUuid||actor?.uuid!==state.actorUuid||target.parent?.tokens?.get(target.id)!==target||!actor.testUserPermission(executor,'OWNER'))throw Error('attackResponseUnavailable');
  const isPublic=()=>isPublicReactionTarget(target,users);
  if(!isPublic())throw Error('attackPrivacy');
  const source=await verifySource(state,target,executor,isExecutor,resolveUuid);
  const actorLock=`dawn.reactionActor.${encodeURIComponent(world)}.${encodeURIComponent(actor.uuid)}`;
  return lockManager.request(actorLock,{mode:'exclusive',ifAvailable:true},async actorHeld=>{
   if(!actorHeld)throw Error('reactionBusy');
   if(await verifySource(state,target,executor,isExecutor,resolveUuid)!==source)throw Error('attackChanged');
   if(!isExecutor()||!isPublic()||target.parent?.tokens?.get(target.id)!==target||target.actor!==actor)throw Error('attackChanged');
   const record=recordFor({storage,world,executor,id});
   return resolveHeroResponse({record,actor,target,executor,isExecutor,author:executor,choice:'accept',snapshot:heroReactionSnapshot(actor)});
  });
 });
}
/** List only this executor's local records; missing/corrupt entries fail closed. */
export function listPrivateAttacks({storage,world,executor,isExecutor,sourceUuid=null}){
 if(!executor?.isGM||!isExecutor())throw Error('attackPermission');
 if(!Number.isSafeInteger(storage?.length)||typeof storage.key!=='function')throw Error('attackJournalUnavailable');
 const prefix=key(world,executor.id,''),states=[];
 for(let i=0;i<storage.length;i++){
  const name=storage.key(i);if(typeof name!=='string'||!name.startsWith(prefix))continue;
  const state=read(storage,world,executor.id,name.slice(prefix.length));
  if(state&&(!sourceUuid||state.sourceUuid===sourceUuid))states.push(state);
 }
 return states;
}
/** Guarded GM-side movement/damage continuation of the same local journal. */
export async function continuePrivateAttack({storage,world,executor,isExecutor,id,users,resolveUuid,operation,operationId,standardWound=false,lockManager=reactionLockManager()}){
 if(!executor?.isGM||!isExecutor())throw Error('attackPermission');
 if(!validId(id)||!['movement','damage','reconcile'].includes(operation))throw Error('attackInvalid');
 if(!lockManager?.request)throw Error('attackJournalUnavailable');
 const attackLock=key(world,executor.id,id);
 return lockManager.request(attackLock,{mode:'exclusive',ifAvailable:true},async held=>{
  if(!held)throw Error('attackBusy');
  const state=read(storage,world,executor.id,id),target=state&&await resolveUuid(state.tokenUuid),actor=target?.actor;
  if(!state||!isExecutor()||!target||target.id!==state.targetId||target.uuid!==state.tokenUuid||actor?.uuid!==state.actorUuid||target.parent?.tokens?.get(target.id)!==target)throw Error('attackInvalid');
  const isPublic=()=>isPublicReactionTarget(target,users);
  if(!isPublic())throw Error('attackPrivacy');
  const source=await verifySource(state,target,executor,isExecutor,resolveUuid);
  const actorLock=`dawn.reactionActor.${encodeURIComponent(world)}.${encodeURIComponent(actor.uuid)}`;
  return lockManager.request(actorLock,{mode:'exclusive',ifAvailable:true},async actorHeld=>{
   if(!actorHeld)throw Error('reactionBusy');
   if(await verifySource(state,target,executor,isExecutor,resolveUuid)!==source)throw Error('attackChanged');
   if(!isExecutor()||!isPublic()||target.parent?.tokens?.get(target.id)!==target||target.actor!==actor)throw Error('attackChanged');
   const record=recordFor({storage,world,executor,id});
   if(operation==='reconcile')return reconcileInterruptedAttack({record,actor,target,executor,isExecutor});
   if(operation==='movement')return confirmReactionMovement({record,actor,target,executor,isExecutor});
   return confirmAttackDamage({record,actor,target,executor,isExecutor,operationId,snapshot:damageSnapshot(actor),standardWound});
  });
 });
}
