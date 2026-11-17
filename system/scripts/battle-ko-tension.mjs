import {acquireTurnLock,releaseTurnLock,needsTurnReconciliation} from './turn-state.mjs';
import {isPublicReactionTarget} from './reaction-privacy.mjs';

const validId=id=>typeof id==='string'&&/^[A-Za-z0-9]{16}$/.test(id);
/** One automatic KO event per combatant per combat; revived repeats are manual. */
export async function recordKnockoutTension({combat,combatant,party,user,users,isExecutor,eligibilityConfirmed=false,currentCombat=()=>game.combat}){
 if(!user?.isGM||!isExecutor()||!party?.isOwner)throw Error('koTensionPermission');
 // NPC type alone cannot distinguish Summons, which never raise Tension on KO.
 // A caller must also account for optional rules and special scene mechanics.
 if(eligibilityConfirmed!==true)throw Error('koTensionEligibility');
 if(!combat?.uuid||!validId(combatant?.id))throw Error('koTensionInvalid');
 if(!acquireTurnLock(combat.uuid))throw Error('battleTurnBusy');
 try{
  if(!isExecutor()||currentCombat()!==combat||!combat.started||combat._dawnTransitioning||combat.getFlag('dawn','transition')||needsTurnReconciliation(combat)||combat.combatants.get(combatant.id)!==combatant||combatant.defeated!==true)throw Error('koTensionInvalid');
  const token=combatant.token,scene=combat.scene,actor=combatant.actor;
  if(!scene||token?.parent!==scene||scene.tokens?.get(token.id)!==token||!actor||!['hero','npc'].includes(actor.type)||actor.system?.presentation?.role==='obstacle'||actor.getFlag?.('dawn','fodderTemplate')||token.getFlag?.('dawn','presence')==='duel')throw Error('koTensionInvalid');
  if(scene.tokenVision!==false||scene.fog?.exploration!==false||!isPublicReactionTarget(token,users))throw Error('koTensionPrivate');
  const id=combat.getFlag('dawn','storyContextId'),context=party.system?.storyContexts?.[id];
  if(!validId(id)||context?.linkedCombatUuid!==combat.uuid||!Number.isSafeInteger(context.tension)||context.tension<0||!Number.isSafeInteger(context.tension+1))throw Error('koTensionInvalid');
  const event=context.koEvents?.[combatant.id];
  if(event)return {applied:false,tension:context.tension};
  const value=context.tension+1,receipt={combatantId:combatant.id,round:combat.round};
  try{
   const saved=await party.update({[`system.storyContexts.${id}.tension`]:value,[`system.storyContexts.${id}.koEvents.${combatant.id}`]:receipt});
   const actual=party.system.storyContexts?.[id];
   if(!saved||actual?.linkedCombatUuid!==combat.uuid||actual.tension!==value||JSON.stringify(actual.koEvents?.[combatant.id])!==JSON.stringify(receipt))throw Error('Unconfirmed');
  }catch(cause){throw new Error('koTensionUncertain',{cause});}
  return {applied:true,tension:value};
 }finally{releaseTurnLock(combat.uuid);}
}
