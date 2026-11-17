// These primitives do not open a response window or establish that an attack
// exists. Only an authoritative workflow which has validated that attack may
// call commitHeroReaction. A receipt is stored on the particular Actor (also
// the synthetic Actor of an unlinked token), in the same update as resources.
import {planDamage,applyDamage} from './damage.mjs';

const pending=new WeakSet();
const validNumber=n=>Number.isSafeInteger(n)&&n>=0;

export function heroReactionSnapshot(actor){
  if(actor?.type!=='hero'||!actor.uuid)throw Error('reactionUnsupported');
  const {focus,evasion,attributes}=actor.system??{};
  const values=[focus?.value,evasion?.value,attributes?.body,attributes?.talent,attributes?.mind];
  if(!values.every(validNumber))throw Error('reactionInvalid');
  return {uuid:actor.uuid,focus:focus.value,evasion:evasion.value,body:attributes.body,talent:attributes.talent,mind:attributes.mind};
}

/** Resolve only the core numerical effect; movement is an explicit pending step. */
export function planHeroReaction(snapshot,choice){
  if(!snapshot||!['accept','block','dodgeTalent','dodgeMind'].includes(choice))throw Error('reactionInvalid');
  if(!['focus','evasion','body','talent','mind'].every(k=>validNumber(snapshot[k])))throw Error('reactionInvalid');
  if(choice==='accept')return {choice,focus:snapshot.focus,evasion:snapshot.evasion,armorBonus:0,movement:null,stopForcedMovement:false};
  if(snapshot.focus<2)throw Error('reactionInsufficientFocus');
  if(choice==='block')return {choice,focus:snapshot.focus-2,evasion:snapshot.evasion,armorBonus:snapshot.body,movement:'pushAwayOne',stopForcedMovement:false};
  const attribute=choice==='dodgeTalent'?'talent':'mind';
  const evasion=snapshot.evasion+Math.ceil(snapshot[attribute]/2);
  if(!validNumber(evasion))throw Error('reactionInvalid');
  return {choice,focus:snapshot.focus-2,evasion,armorBonus:0,movement:'chooseOneOrTwo',stopForcedMovement:true};
}

/** Use the block bonus for this one attack, never by changing the hero's base Armor. */
export function planReactedAttack(snapshot,amount,receipt,{attackId,targetId,standardWound=false}){
  if(!receipt||receipt.attackId!==attackId||receipt.targetId!==targetId||
    !['accept','block','dodgeTalent','dodgeMind'].includes(receipt.choice)||!validNumber(receipt.armorBonus)||
    (receipt.choice!=='block'&&receipt.armorBonus!==0))throw Error('reactionInvalid');
  const armor=snapshot.armor+receipt.armorBonus;
  if(!validNumber(armor))throw Error('reactionInvalid');
  return planDamage({...snapshot,armor},{kind:'attack',amount,standardWound});
}

/** Resolve only after the caller authenticates the attack and confirms movement. */
export async function applyReactedAttack({actor,user,isExecutor,snapshot,amount,attackId,targetId,operationId,standardWound=false,movementResolved=false}){
  if(!user?.isGM||!isExecutor||!actor?.isOwner)throw Error('reactionPermission');
  if(!/^[A-Za-z0-9]{16}$/.test(attackId)||!/^[A-Za-z0-9]{16}$/.test(targetId))throw Error('reactionInvalid');
  const receipt=actor.getFlag('dawn',`reactionReceipts.${attackId}-${targetId}`);
  if(!receipt)throw Error('reactionMissing');
  planReactedAttack(snapshot,amount,receipt,{attackId,targetId,standardWound});
  if(receipt.movement&&movementResolved!==true)throw Error('reactionMovementPending');
  return applyDamage({actor,user,isExecutor,snapshot,intent:{kind:'attack',amount,standardWound},operationId,armorBonus:receipt.armorBonus,dedupeKey:`attack-${attackId}-${targetId}`});
}

/** Caller validates attack and response window; this commits one decision once. */
export async function commitHeroReaction({actor,author,executor,authorized,snapshot,choice,attackId,targetId}){
  if(!executor?.isGM||authorized!==true||!actor?.isOwner||!author||!actor.testUserPermission(author,'OWNER'))throw Error('reactionPermission');
  if(!/^[A-Za-z0-9]{16}$/.test(attackId)||!/^[A-Za-z0-9]{16}$/.test(targetId))throw Error('reactionInvalid');
  if(pending.has(actor))throw Error('reactionBusy');
  pending.add(actor);
  try{
    const key=`${attackId}-${targetId}`;
    if(actor.getFlag('dawn',`reactionReceipts.${key}`))throw Error('reactionAlreadyResolved');
    if(JSON.stringify(heroReactionSnapshot(actor))!==JSON.stringify(snapshot))throw Error('reactionChanged');
    const result=planHeroReaction(snapshot,choice),receipt={attackId,targetId,authorId:author.id,...result};
    try{
      const saved=await actor.update({'system.focus.value':result.focus,'system.evasion.value':result.evasion,[`flags.dawn.reactionReceipts.${key}`]:receipt});
      const actual=actor.getFlag('dawn',`reactionReceipts.${key}`);
      if(!saved||Object.keys(receipt).some(k=>actual?.[k]!==receipt[k])||actor.system.focus.value!==result.focus||actor.system.evasion.value!==result.evasion)throw Error('Update not confirmed');
    }catch(cause){throw new Error('reactionWriteUncertain',{cause});}
    return receipt;
  }finally{pending.delete(actor);}
}
