import {acquireTurnLock,releaseTurnLock,needsTurnReconciliation} from './turn-state.mjs';
import {footprintDistance} from './rules.mjs';
import {isPublicReactionTarget} from './reaction-privacy.mjs';
import {discardPairFits} from './board.mjs';

const validId=id=>typeof id==='string'&&/^[A-Za-z0-9]{16}$/.test(id);
const pos=t=>({x:t._source?.x??t.x,y:t._source?.y??t.y,width:t.width,height:t.height});

/** A supported grid can establish adjacency; other layouts need a human ruling. */
export function duelAdjacent(scene,a,b){
 const size=scene?.grid?.size,pa=pos(a),pb=pos(b);
 if(scene?.grid?.type!==1||!Number.isSafeInteger(size)||size<=0)return null;
 const footprint=p=>{
  if(![p.x,p.y,p.width,p.height].every(Number.isSafeInteger)||p.width<1||p.height<1||p.x%size||p.y%size)return null;
  return {column:p.x/size,row:p.y/size,width:p.width,height:p.height};
 };
 const aa=footprint(pa),bb=footprint(pb);if(!aa||!bb)return null;
 // DAWN explicitly regards characters in the same space as adjacent.
 return a.id!==b.id&&footprintDistance(aa,bb)<=1;
}

/**
 * Reserve a combat Duel in its own StoryContext and pay Influence in one
 * Party update. Departure, opposed rolls, resolution and return are separate
 * stages and must not be inferred from this record's existence.
 */
export async function reserveCombatDuel({combat,party,scene,initiator,target,user,users,isExecutor,geometryChecks=true,manualAdjacency=false,stake='',stakeIsPublic=false,duelId,currentCombat=()=>game.combat,currentScene=()=>canvas.scene}){
 if(!user?.isGM||!isExecutor()||!party?.isOwner)throw Error('duelPermission');
 if(stakeIsPublic!==true)throw Error('duelPrivacy');
 if(!validId(duelId)||typeof stake!=='string'||stake.length>500||typeof geometryChecks!=='boolean'||typeof manualAdjacency!=='boolean')throw Error('duelInvalid');
 if(!combat?.uuid||!acquireTurnLock(combat.uuid))throw Error('battleTurnBusy');
 try{
  const validate=()=>{
   if(!isExecutor()||currentCombat()!==combat||currentScene()!==scene||!combat.started||combat._dawnTransitioning||combat.getFlag('dawn','transition')||needsTurnReconciliation(combat)||combat.scene?.id!==scene?.id)throw Error('combatChanged');
   if(!initiator||!target||initiator.id===target.id||scene.tokens.get(initiator.id)!==initiator||scene.tokens.get(target.id)!==target||combat.combatant?.tokenId!==initiator.id||initiator.actor?.type!=='hero'||target.actor?.type!=='npc')throw Error('duelParticipants');
   // This record includes positions. Do not expose a token hidden only by
   // vision or unexplored fog through a globally broadcast Party update.
   if(scene.tokenVision!==false||scene.fog?.exploration!==false||!isPublicReactionTarget(initiator,users)||!isPublicReactionTarget(target,users))throw Error('duelPrivacy');
   if(initiator.getFlag?.('dawn','presence')||target.getFlag?.('dawn','presence')||!Array.from(combat.combatants).some(c=>c.tokenId===target.id))throw Error('duelParticipants');
   discardPairFits(scene,initiator,target);
   const adjacency=duelAdjacent(scene,initiator,target);
   if(geometryChecks&&adjacency!==true)throw Error(adjacency===false?'duelNotAdjacent':'duelGeometryUnknown');
   if(!geometryChecks&&!manualAdjacency)throw Error('duelManualAdjacency');
   const parentId=combat.getFlag('dawn','storyContextId'),parent=party.system?.storyContexts?.[parentId];
   if(!validId(parentId)||parent?.linkedCombatUuid!==combat.uuid||!Number.isSafeInteger(parent.tension)||parent.tension<0)throw Error('combatChanged');
   const actorUuids=[initiator.actor.uuid,initiator.actor.baseActor?.uuid].filter(Boolean);
   const explicit=initiator.actor.system?.controllerParticipantId;
   const matching=Object.entries(party.system?.participants??{}).filter(([,account])=>actorUuids.includes(account?.heroUuid));
   const participantId=explicit||(matching.length===1?matching[0][0]:null),participant=party.system?.participants?.[participantId];
   if(matching.length!==1||matching[0][0]!==participantId)throw Error('duelParticipantAccount');
   if(!validId(participantId)||!participant||!actorUuids.includes(participant.heroUuid)||!Number.isSafeInteger(participant.influence)||participant.influence<0)throw Error('duelParticipantAccount');
   const cost=Math.max(1,4-parent.tension);if(participant.influence<cost)throw Error('duelInfluence');
   const contexts=party.system.storyContexts;
   if(contexts[duelId])throw Error('duelAlreadyExists');
   if(Object.values(contexts).some(c=>c?.duel&&c.status==='active'&&[initiator.uuid,target.uuid].some(uuid=>[c.duel.initiatorTokenUuid,c.duel.targetTokenUuid].includes(uuid))))throw Error('duelParticipantBusy');
   return {parentId,tension:parent.tension,participantId,influence:participant.influence,cost,turnId:combat.getFlag('dawn','turnId'),timelineId:combat.getFlag('dawn','timelineId'),initiatorPosition:pos(initiator),targetPosition:pos(target)};
  };
  const before=validate();
  const context={kind:'unstructured',status:'active',tension:before.tension,parentContextId:before.parentId,
   duel:{version:1,phase:'awaitingDeparture',combatUuid:combat.uuid,turnId:before.turnId,timelineId:before.timelineId,initiatorTokenUuid:initiator.uuid,targetTokenUuid:target.uuid,initiatorPosition:before.initiatorPosition,targetPosition:before.targetPosition,participantId:before.participantId,cost:before.cost,stake:stake.trim(),geometry:geometryChecks?'checked':'manual',attempt:1}};
  if(JSON.stringify(validate())!==JSON.stringify(before))throw Error('combatChanged');
  try{
   const saved=await party.update({[`system.participants.${before.participantId}.influence`]:before.influence-before.cost,[`system.storyContexts.${duelId}`]:context});
   if(!saved||party.system.participants?.[before.participantId]?.influence!==before.influence-before.cost||JSON.stringify(party.system.storyContexts?.[duelId])!==JSON.stringify(context))throw Error('Unconfirmed');
  }catch(cause){const error=new Error('duelWriteUncertain',{cause});error.duelId=duelId;throw error;}
  return {id:duelId,context};
 }finally{releaseTurnLock(combat.uuid);}
}
