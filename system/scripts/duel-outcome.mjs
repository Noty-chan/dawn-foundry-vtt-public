import {acquireTurnLock,releaseTurnLock,needsTurnReconciliation} from './turn-state.mjs';
import {isPublicReactionTarget} from './reaction-privacy.mjs';

const validId=id=>typeof id==='string'&&/^[A-Za-z0-9]{16}$/.test(id);
const score=n=>Number.isSafeInteger(n)&&n>=0&&n<=2000;

/** Values here are manually accepted results, not verified dice rolls. */
export function planDuelOutcome(context,{initiatorHits,targetHits,choice,targetTier}){
 const d=context?.duel,tension=context?.tension;
 if(context?.status!=='active'||d?.phase!=='awaitingResolution'||![1,2].includes(d.attempt)||!Number.isSafeInteger(tension)||tension<0||!score(initiatorHits)||!score(targetHits)||initiatorHits===targetHits)throw Error('duelOutcomeInvalid');
 const lost=initiatorHits<targetHits,history=[...(d.attempts??[]),{attempt:d.attempt,initiatorHits,targetHits,tension}];
 if(!lost){
  if(choice!==null||!Number.isSafeInteger(targetTier)||targetTier<0)throw Error('duelOutcomeInvalid');
  const damage=2*tension+5*targetTier;if(!Number.isSafeInteger(damage))throw Error('duelOutcomeInvalid');
  return {tension,refund:0,duel:{...d,attempts:history,phase:'awaitingConsequences',outcome:{winner:'initiator',loser:'target',stake:true,manualDamage:damage,targetTier}}};
 }
 if(d.attempt===2&&choice!=='take')throw Error('duelForcedTake');
 if(d.attempt===1&&choice==='double'){
  if(!Number.isSafeInteger(tension+2))throw Error('duelOutcomeInvalid');
  return {tension:tension+2,refund:0,duel:{...d,attempt:2,attempts:history}};
 }
 if(choice==='bail'&&d.attempt===1)return {tension,refund:0,duel:{...d,attempts:history,phase:'awaitingReturn',outcome:{winner:'target',loser:null,stake:false}}};
 if(choice==='take'&&Number.isSafeInteger(d.cost)&&d.cost>=1)return {tension,refund:d.cost,duel:{...d,attempts:history,phase:'awaitingConsequences',outcome:{winner:'target',loser:'initiator',stake:true,manualWounds:1}}};
 throw Error('duelOutcomeInvalid');
}

/** Resolve one attempt; a refund and the new context share a Party update. */
export async function recordDuelOutcome({party,combat,scene,duelId,initiator,target,user,users,isExecutor,expectedContext,initiatorHits,targetHits,choice=null,timingConfirmed=false,currentCombat=()=>game.combat,currentScene=()=>canvas.scene}){
 if(!user?.isGM||!isExecutor()||!party?.isOwner)throw Error('duelPermission');
 if(!validId(duelId)||!combat?.uuid||timingConfirmed!==true)throw Error('duelOutcomeInvalid');
 if(!acquireTurnLock(combat.uuid))throw Error('battleTurnBusy');
 try{
  const context=party.system?.storyContexts?.[duelId],d=context?.duel;
  if(!context||JSON.stringify(context)!==JSON.stringify(expectedContext))throw Error('duelChanged');
  if(!isExecutor()||currentCombat()!==combat||currentScene()!==scene||!combat.started||combat.getFlag('dawn','transition')||needsTurnReconciliation(combat)||combat.uuid!==d?.combatUuid||combat.getFlag('dawn','timelineId')!==d.timelineId)throw Error('combatChanged');
  if(scene.tokenVision!==false||scene.fog?.exploration!==false||![initiator,target].every(t=>t?.parent===scene&&scene.tokens.get(t.id)===t&&isPublicReactionTarget(t,users)&&t.getFlag('dawn','presence')==='duel')||initiator.uuid!==d.initiatorTokenUuid||target.uuid!==d.targetTokenUuid)throw Error('duelPrivacy');
  const result=planDuelOutcome(context,{initiatorHits,targetHits,choice,targetTier:target.actor?.system?.tier}),next={...context,tension:result.tension,duel:result.duel};
  const changes={[`system.storyContexts.${duelId}`]:next};let refundValue=null;
  if(result.refund){
   const account=party.system?.participants?.[d.participantId];
   if(!validId(d.participantId)||![initiator.actor?.uuid,initiator.actor?.baseActor?.uuid].includes(account?.heroUuid)||!Number.isSafeInteger(account?.influence)||account.influence<0||!Number.isSafeInteger(account.influence+result.refund))throw Error('duelParticipantAccount');
   refundValue=account.influence+result.refund;changes[`system.participants.${d.participantId}.influence`]=refundValue;
  }
  try{
   const saved=await party.update(changes);
   if(!saved||JSON.stringify(party.system.storyContexts?.[duelId])!==JSON.stringify(next)||(refundValue!==null&&party.system.participants?.[d.participantId]?.influence!==refundValue))throw Error('Unconfirmed');
  }catch(cause){const error=new Error('duelOutcomeUncertain',{cause});error.duelId=duelId;throw error;}
  return next;
 }finally{releaseTurnLock(combat.uuid);}
}

/** Explicit GM acknowledgement; this does not itself inflict damage or Wounds. */
export async function confirmDuelConsequences({party,combat,duelId,user,isExecutor,expectedContext,confirmed=false,currentCombat=()=>game.combat}){
 if(!user?.isGM||!isExecutor()||!party?.isOwner)throw Error('duelPermission');
 if(!validId(duelId)||!combat?.uuid||confirmed!==true)throw Error('duelOutcomeInvalid');
 if(!acquireTurnLock(combat.uuid))throw Error('battleTurnBusy');
 try{
  const context=party.system?.storyContexts?.[duelId];
  if(!context||JSON.stringify(context)!==JSON.stringify(expectedContext))throw Error('duelChanged');
  if(!isExecutor()||currentCombat()!==combat||!combat.started||combat.getFlag('dawn','transition')||needsTurnReconciliation(combat)||combat.uuid!==context.duel?.combatUuid||combat.getFlag('dawn','timelineId')!==context.duel.timelineId)throw Error('combatChanged');
  if(context.status!=='active'||context.duel?.phase!=='awaitingConsequences'||!context.duel.outcome?.stake)throw Error('duelOutcomeInvalid');
  const next={...context,duel:{...context.duel,phase:'awaitingReturn',consequencesConfirmedBy:user.id}};
  try{
   const saved=await party.update({[`system.storyContexts.${duelId}`]:next});
   if(!saved||JSON.stringify(party.system.storyContexts?.[duelId])!==JSON.stringify(next))throw Error('Unconfirmed');
  }catch(cause){const error=new Error('duelOutcomeUncertain',{cause});error.duelId=duelId;throw error;}
  return next;
 }finally{releaseTurnLock(combat.uuid);}
}
