import {acquireTurnLock,releaseTurnLock,needsTurnReconciliation} from './turn-state.mjs';
import {npcActionCost} from './npc-rolls.mjs';
const validId=id=>typeof id==='string'&&/^[A-Za-z0-9]{16}$/.test(id);

/** Swift Stride costs 1 AP and may be repeated; movement remains manual. */
export async function spendNpcStrideAP({actor,combat,user,isExecutor,operationId,currentCombat=()=>game.combat}){
 if(!user?.isGM||!isExecutor()||!actor?.isOwner||actor.type!=='npc')throw Error('npcActionPermission');
 if(!combat?.uuid||!validId(operationId))throw Error('npcActionInvalid');
 if(!acquireTurnLock(combat.uuid))throw Error('battleTurnBusy');
 try{
  if(!isExecutor()||currentCombat()!==combat||!combat.started||combat._dawnTransitioning||combat.getFlag('dawn','transition')||needsTurnReconciliation(combat))throw Error('combatChanged');
  const c=combat.combatant,turnId=combat.getFlag('dawn','turnId');
  if(!c||c.actor?.uuid!==actor.uuid||!turnId)throw Error('notYourTurn');
  const ap=c.getFlag('dawn','ap');if(!Number.isSafeInteger(ap)||ap<0)throw Error('npcActionInvalid');
  if(ap<1)throw Error('notEnoughAP');
  if(c.getFlag('dawn',`npcActionReceipts.${operationId}`))throw Error('npcActionAlreadyUsed');
  const receipt={turnId,key:'swift-stride',cost:1,ap:ap-1};
  try{
   const saved=await c.update({'flags.dawn.ap':receipt.ap,[`flags.dawn.npcActionReceipts.${operationId}`]:receipt});
   if(!saved||c.getFlag('dawn','ap')!==receipt.ap||JSON.stringify(c.getFlag('dawn',`npcActionReceipts.${operationId}`))!==JSON.stringify(receipt))throw Error('Unconfirmed');
  }catch(cause){throw new Error('npcActionWriteUncertain',{cause});}
  return receipt;
 }finally{releaseTurnLock(combat.uuid);}
}
/** One explicit AP bookkeeping operation, not execution of the action effects. */
export async function spendNpcActionAP({actor,item,combat,user,isExecutor,operationId,currentCombat=()=>game.combat}){
 if(!user?.isGM||!isExecutor()||!actor?.isOwner||actor.type!=='npc')throw Error('npcActionPermission');
 if(!combat?.uuid||!validId(operationId))throw Error('npcActionInvalid');
 if(!acquireTurnLock(combat.uuid))throw Error('battleTurnBusy');
 try{
  const validate=()=>{
   if(!isExecutor()||currentCombat()!==combat||!combat.started||combat._dawnTransitioning||combat.getFlag('dawn','transition')||needsTurnReconciliation(combat))throw Error('combatChanged');
   const c=combat.combatant,turnId=combat.getFlag('dawn','turnId');
   if(!c||c.actor?.uuid!==actor.uuid||!turnId)throw Error('notYourTurn');
   if(!item?.id||actor.items.get(item.id)!==item||item.type!=='action'||item.system?.archived||!['action','attack'].includes(item.system?.mechanics?.kind))throw Error('npcActionInvalid');
   const cost=npcActionCost(item),ap=c.getFlag('dawn','ap'),key=item.system.canonicalId||`item:${item.id}`;
   if(!Number.isSafeInteger(cost)||!Number.isSafeInteger(ap)||ap<0||typeof key!=='string'||!key)throw Error('npcActionInvalid');
   if(ap<cost)throw Error('notEnoughAP');
   const history=c.getFlag('dawn','npcActionUse');
   if(history&&(!Array.isArray(history.actions)||typeof history.turnId!=='string'))throw Error('npcActionInvalid');
   const actions=history?.turnId===turnId?history.actions:[];
   if(actions.includes(key))throw Error('npcActionAlreadyUsed');
   if(c.getFlag('dawn',`npcActionReceipts.${operationId}`))throw Error('npcActionAlreadyUsed');
   return {c,turnId,ap,cost,key,actions};
  };
  const before=validate(),receipt={turnId:before.turnId,key:before.key,cost:before.cost,ap:before.ap-before.cost};
  try{
   const saved=await before.c.update({'flags.dawn.ap':receipt.ap,'flags.dawn.npcActionUse':{turnId:before.turnId,actions:[...before.actions,before.key]},[`flags.dawn.npcActionReceipts.${operationId}`]:receipt});
   const actual=before.c.getFlag('dawn',`npcActionReceipts.${operationId}`),history=before.c.getFlag('dawn','npcActionUse');
   if(!saved||before.c.getFlag('dawn','ap')!==receipt.ap||JSON.stringify(actual)!==JSON.stringify(receipt)||history?.turnId!==before.turnId||!history.actions?.includes(before.key))throw Error('Unconfirmed');
  }catch(cause){throw new Error('npcActionWriteUncertain',{cause});}
  return receipt;
 }finally{releaseTurnLock(combat.uuid);}
}
