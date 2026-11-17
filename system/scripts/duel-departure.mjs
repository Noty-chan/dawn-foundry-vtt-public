import {isSupportedBoard,placeInDiscard,discardPairFits} from './board.mjs';
import {acquireTurnLock,releaseTurnLock,needsTurnReconciliation} from './turn-state.mjs';
import {isPublicReactionTarget} from './reaction-privacy.mjs';

const validId=id=>typeof id==='string'&&/^[A-Za-z0-9]{16}$/.test(id);
const position=t=>({x:t._source?.x??t.x,y:t._source?.y??t.y,width:t.width,height:t.height});

/**
 * Depart as a recoverable multi-document operation. A pending marker is never
 * automatically replayed: a failed flag write or movement needs human review.
 */
export async function departCombatDuel({party,combat,scene,duelId,initiator,target,user,users,isExecutor,currentCombat=()=>game.combat,currentScene=()=>canvas.scene}){
 if(!user?.isGM||!isExecutor()||!party?.isOwner||!scene?.isOwner)throw Error('duelPermission');
 if(!validId(duelId)||!combat?.uuid)throw Error('duelInvalid');
 if(!acquireTurnLock(combat.uuid))throw Error('battleTurnBusy');
 try{
  const context=party.system?.storyContexts?.[duelId],d=context?.duel;
  const unchanged=()=>{
   if(!isExecutor()||currentCombat()!==combat||currentScene()!==scene||!combat.started||combat._dawnTransitioning||combat.getFlag('dawn','transition')||needsTurnReconciliation(combat)||combat.uuid!==d?.combatUuid||combat.getFlag('dawn','turnId')!==d?.turnId||combat.getFlag('dawn','timelineId')!==d?.timelineId||combat.combatant?.tokenId!==initiator?.id)throw Error('combatChanged');
   if(!isSupportedBoard(scene)||scene.tokenVision!==false||scene.fog?.exploration!==false)throw Error('duelGeometryUnknown');
   if(![initiator,target].every(t=>t?.isOwner&&t.parent===scene&&scene.tokens.get(t.id)===t&&isPublicReactionTarget(t,users)))throw Error('duelPrivacy');
  };
  if(context?.status!=='active'||d?.phase!=='awaitingDeparture'||d.initiatorTokenUuid!==initiator?.uuid||d.targetTokenUuid!==target?.uuid)throw Error('duelDepartureUnavailable');
  unchanged();
  if(JSON.stringify(position(initiator))!==JSON.stringify(d.initiatorPosition)||JSON.stringify(position(target))!==JSON.stringify(d.targetPosition)||initiator.getFlag('dawn','presence')||target.getFlag('dawn','presence'))throw Error('duelParticipants');
  // Check both slots before writing the phase marker.
  discardPairFits(scene,initiator,target);
  const save=async(before,after)=>{
   if(JSON.stringify(party.system.storyContexts?.[duelId])!==JSON.stringify(before))throw Error('duelChanged');
   try{
    const result=await party.update({[`system.storyContexts.${duelId}`]:after});
    if(!result||JSON.stringify(party.system.storyContexts?.[duelId])!==JSON.stringify(after))throw Error('Unconfirmed');
   }catch(cause){const error=new Error('duelDepartureUncertain',{cause});error.duelId=duelId;throw error;}
  };
  let current=structuredClone(context),next={...current,duel:{...current.duel,phase:'departing',nextTokenIndex:0,departed:[]}};
  await save(current,next);current=next;
  const checkDeparted=()=>{
   for(const entry of current.duel.departed){
    const token=[initiator,target].find(t=>t.uuid===entry.tokenUuid);
    if(!token||token.getFlag('dawn','presence')!=='duel'||JSON.stringify(position(token))!==JSON.stringify(entry.position))throw Error('duelDepartureUncertain');
   }
  };
  for(const [index,token] of [initiator,target].entries()){
   unchanged();checkDeparted();
   if(token.getFlag('dawn','presence')||JSON.stringify(position(token))!==JSON.stringify(index?d.targetPosition:d.initiatorPosition))throw Error('duelDepartureUncertain');
   try{
    const saved=await token.update({'flags.dawn.presence':'duel'});
    if(!saved||token.getFlag('dawn','presence')!=='duel')throw Error('Unconfirmed presence');
    unchanged();
    await placeInDiscard(scene,token);
   }catch(cause){const error=new Error('duelDepartureUncertain',{cause});error.duelId=duelId;throw error;}
   next={...current,duel:{...current.duel,nextTokenIndex:index+1,departed:[...current.duel.departed,{tokenUuid:token.uuid,position:position(token)}]}};
   await save(current,next);current=next;
  }
  unchanged();checkDeparted();
  next={...current,duel:{...current.duel,phase:'awaitingResolution'}};
  await save(current,next);return next;
 }finally{releaseTurnLock(combat.uuid);}
}
