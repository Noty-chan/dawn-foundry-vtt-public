import {heroReactionSnapshot,planHeroReaction,commitHeroReaction,applyReactedAttack,planReactedAttack} from './hero-reaction.mjs';
import {damageSnapshot} from './damage.mjs';

// The GM-owned private record is created by a trusted attack workflow. It is
// separate from the visible roll card: hidden target identifiers never belong
// in public ChatMessage flags. This module does not create/validate that record.
const locks=new WeakSet();
const validId=id=>typeof id==='string'&&/^[A-Za-z0-9]{16}$/.test(id);
function read(record,actor,target,executor,isExecutor){
  if(!executor?.isGM||!isExecutor()||record.author?.id!==executor.id||!record.isOwner||!actor?.isOwner)throw Error('attackPermission');
  if(!Array.isArray(record.whisper)||record.whisper.length!==1||record.whisper[0]!==executor.id||record.blind)throw Error('attackPrivacy');
  const s=record.getFlag('dawn','attackResolution');
  if(!s||!validId(s.attackId)||!validId(s.targetId)||s.actorUuid!==actor.uuid||!target||target.uuid!==s.tokenUuid||target.id!==s.targetId||target.actor?.uuid!==actor.uuid||!target.parent?.tokens?.get||target.parent.tokens.get(target.id)!==target||!Number.isSafeInteger(s.amount)||s.amount<0)throw Error('attackInvalid');
  return structuredClone(s);
}
async function write(record,before,after,actor,target,executor,isExecutor){
  if(JSON.stringify(read(record,actor,target,executor,isExecutor))!==JSON.stringify(before))throw Error('attackChanged');
  let saved;
  try{saved=await record.update({'flags.dawn.attackResolution':after});}
  catch(cause){throw new Error('attackWriteUncertain',{cause});}
  if(!saved||JSON.stringify(read(record,actor,target,executor,isExecutor))!==JSON.stringify(after))throw Error('attackWriteUncertain');
}
async function exclusive(record,fn){
  if(locks.has(record))throw Error('attackBusy');
  locks.add(record);try{return await fn();}finally{locks.delete(record);}
}

/** An authenticated response is a request, not permission to update the record. */
export async function resolveHeroResponse({record,actor,target,executor,isExecutor,author,choice,snapshot}){
  return exclusive(record,async()=>{
    const s=read(record,actor,target,executor,isExecutor);
    if(s.phase!=='awaitingReaction'||!author||!actor.testUserPermission(author,'OWNER'))throw Error('attackResponseUnavailable');
    if(JSON.stringify(heroReactionSnapshot(actor))!==JSON.stringify(snapshot))throw Error('reactionChanged');
    planHeroReaction(snapshot,choice); // Reject invalid responses before writing a marker.
    const marker={...s,phase:'resolvingReaction',response:{choice,authorId:author.id}};
    await write(record,s,marker,actor,target,executor,isExecutor);
    const current=read(record,actor,target,executor,isExecutor);
    if(JSON.stringify(current)!==JSON.stringify(marker)||!actor.testUserPermission(author,'OWNER'))throw Error('attackRecovery');
    const receipt=await commitHeroReaction({actor,author,executor,authorized:true,snapshot,choice,attackId:s.attackId,targetId:s.targetId});
    const next={...marker,phase:receipt.movement?'awaitingMovement':'readyForDamage'};
    await write(record,marker,next,actor,target,executor,isExecutor);
    return next;
  });
}

/** The GM affirms movement or an agreed manual resolution, before damage. */
export async function confirmReactionMovement({record,actor,target,executor,isExecutor}){
  return exclusive(record,async()=>{
    const s=read(record,actor,target,executor,isExecutor);
    if(s.phase!=='awaitingMovement')throw Error('attackMovementUnavailable');
    const receipt=actor.getFlag('dawn',`reactionReceipts.${s.attackId}-${s.targetId}`);
    if(!receipt?.movement||receipt.choice!==s.response?.choice)throw Error('attackRecovery');
    const next={...s,phase:'readyForDamage',movementConfirmedBy:executor.id};
    await write(record,s,next,actor,target,executor,isExecutor);return next;
  });
}

/** The GM explicitly confirms the damage; a marker prevents blind retries. */
export async function confirmAttackDamage({record,actor,target,executor,isExecutor,operationId,snapshot,standardWound=false}){
  return exclusive(record,async()=>{
    const s=read(record,actor,target,executor,isExecutor);
    if(s.phase!=='readyForDamage')throw Error('attackDamageUnavailable');
    if(JSON.stringify(damageSnapshot(actor))!==JSON.stringify(snapshot))throw Error('damageChanged');
    const receipt=actor.getFlag('dawn',`reactionReceipts.${s.attackId}-${s.targetId}`);
    if(!receipt||receipt.choice!==s.response?.choice)throw Error('attackRecovery');
    if(receipt.movement&&!s.movementConfirmedBy)throw Error('reactionMovementPending');
    const expectedResult=planReactedAttack(snapshot,s.amount,receipt,{attackId:s.attackId,targetId:s.targetId,standardWound});
    const marker={...s,phase:'applyingDamage',operationId,expectedResult};
    if(!validId(operationId))throw Error('attackInvalid');
    await write(record,s,marker,actor,target,executor,isExecutor);
    if(JSON.stringify(read(record,actor,target,executor,isExecutor))!==JSON.stringify(marker))throw Error('attackRecovery');
    const result=await applyReactedAttack({actor,user:executor,isExecutor:isExecutor(),snapshot,amount:s.amount,attackId:s.attackId,targetId:s.targetId,operationId,standardWound,movementResolved:!!s.movementConfirmedBy});
    const next={...marker,phase:'complete',result};await write(record,marker,next,actor,target,executor,isExecutor);return next;
  });
}

/** Reconcile only an operation proven by an atomic Actor receipt. Never replay. */
export async function reconcileInterruptedAttack({record,actor,target,executor,isExecutor}){
 return exclusive(record,async()=>{
  const s=read(record,actor,target,executor,isExecutor);
  if(s.phase==='resolvingReaction'){
   const receipt=actor.getFlag('dawn',`reactionReceipts.${s.attackId}-${s.targetId}`);
   if(!receipt||receipt.attackId!==s.attackId||receipt.targetId!==s.targetId||receipt.choice!==s.response?.choice||receipt.authorId!==s.response?.authorId)throw Error('attackRecoveryManual');
   // Validate the receipt's core shape, including one-attack armor semantics.
   if(!['accept','block','dodgeTalent','dodgeMind'].includes(receipt.choice)||!Number.isSafeInteger(receipt.armorBonus)||receipt.armorBonus<0||(receipt.choice!=='block'&&receipt.armorBonus!==0)||receipt.movement!==({accept:null,block:'pushAwayOne',dodgeTalent:'chooseOneOrTwo',dodgeMind:'chooseOneOrTwo'})[receipt.choice]||receipt.stopForcedMovement!==['dodgeTalent','dodgeMind'].includes(receipt.choice)||!Number.isSafeInteger(receipt.focus)||receipt.focus<0||!Number.isSafeInteger(receipt.evasion)||receipt.evasion<0)throw Error('attackRecoveryManual');
   const next={...s,phase:receipt.movement?'awaitingMovement':'readyForDamage'};
   await write(record,s,next,actor,target,executor,isExecutor);return next;
  }
  if(s.phase==='applyingDamage'){
   const receipt=actor.getFlag('dawn',`damageReceipts.attack-${s.attackId}-${s.targetId}`);
   const reaction=actor.getFlag('dawn',`reactionReceipts.${s.attackId}-${s.targetId}`);
   if(!validId(s.operationId)||!s.expectedResult||!receipt||receipt.operationId!==s.operationId||receipt.kind!=='attack'||receipt.amount!==s.amount||!reaction||reaction.attackId!==s.attackId||reaction.targetId!==s.targetId||reaction.choice!==s.response?.choice||reaction.authorId!==s.response?.authorId||receipt.armorBonus!==reaction.armorBonus||JSON.stringify(receipt.result)!==JSON.stringify(s.expectedResult))throw Error('attackRecoveryManual');
   const next={...s,phase:'complete',result:structuredClone(receipt.result)};
   await write(record,s,next,actor,target,executor,isExecutor);return next;
  }
  throw Error('attackRecoveryUnavailable');
 });
}
