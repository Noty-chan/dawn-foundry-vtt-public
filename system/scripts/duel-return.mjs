import {isSupportedBoard} from './board.mjs';
import {acquireTurnLock,releaseTurnLock,needsTurnReconciliation} from './turn-state.mjs';
import {isPublicReactionTarget} from './reaction-privacy.mjs';

const validId=id=>typeof id==='string'&&/^[A-Za-z0-9]{16}$/.test(id);
const pos=t=>({x:t._source?.x??t.x,y:t._source?.y??t.y,width:t.width,height:t.height});
const origins={main:{x:100,y:300},second:{x:1000,y:300}};
const overlaps=(a,b)=>a.x<b.x+b.width*100&&a.x+a.width*100>b.x&&a.y<b.y+b.height*100&&a.y+a.height*100>b.y;
function originBoard(p){
 return Object.entries(origins).find(([,o])=>Number.isInteger(p?.x)&&Number.isInteger(p?.y)&&Number.isInteger(p?.width)&&Number.isInteger(p?.height)&&p.width>0&&p.height>0&&p.x>=o.x&&p.y>=o.y&&p.x+p.width*100<=o.x+700&&p.y+p.height*100<=o.y+700&&(p.x-o.x)%100===0&&(p.y-o.y)%100===0)?.[0]??null;
}

/** Validate full footprints on the same board edge, avoiding occupied spaces. */
export function duelReturnPositions(scene,duel,initiator,target,destinations){
 if(!isSupportedBoard(scene)||!Array.isArray(destinations)||destinations.length!==2)throw Error('duelReturnInvalid');
 const board=originBoard(duel.initiatorPosition);
 if(!board||originBoard(duel.targetPosition)!==board)throw Error('duelReturnInvalid');
 const o=origins[board],tokens=[initiator,target];
 const positions=destinations.map((cell,i)=>{
  const t=tokens[i],w=t.width,h=t.height;
  if(!Number.isInteger(cell?.column)||!Number.isInteger(cell?.row)||!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||cell.column<0||cell.row<0||cell.column+w>7||cell.row+h>7||!(cell.column===0||cell.row===0||cell.column+w===7||cell.row+h===7))throw Error('duelReturnInvalid');
  return {x:o.x+cell.column*100,y:o.y+cell.row*100,width:w,height:h};
 });
 if(overlaps(positions[0],positions[1]))throw Error('duelReturnOccupied');
 for(const token of scene.tokens){
  if(tokens.includes(token)||token.actor?.getFlag?.('dawn','fodderTemplate')===true)continue;
  if(!Number.isFinite(token.x)||!Number.isFinite(token.y)||!Number.isFinite(token.width)||!Number.isFinite(token.height))throw Error('duelReturnInvalid');
  if(positions.some(p=>overlaps(p,token)))throw Error('duelReturnOccupied');
 }
 return positions;
}

/** Return is an in-game Teleport; follow-on reactions and terrain are manual. */
export async function returnCombatDuel({party,combat,scene,duelId,initiator,target,user,users,isExecutor,expectedContext,destinations,currentCombat=()=>game.combat,currentScene=()=>canvas.scene,teleportSupported=()=>CONFIG.Token.movement.actions.blink?.teleport===true}){
 if(!user?.isGM||!isExecutor()||!party?.isOwner||!scene?.isOwner)throw Error('duelPermission');
 if(!validId(duelId)||!combat?.uuid||!teleportSupported())throw Error('duelReturnInvalid');
 if(!acquireTurnLock(combat.uuid))throw Error('battleTurnBusy');
 try{
  const context=party.system?.storyContexts?.[duelId],d=context?.duel,tokens=[initiator,target];
  if(!context||JSON.stringify(context)!==JSON.stringify(expectedContext))throw Error('duelChanged');
  if(context.status!=='active'||d?.phase!=='awaitingReturn'||d.initiatorTokenUuid!==initiator?.uuid||d.targetTokenUuid!==target?.uuid)throw Error('duelReturnInvalid');
  const verify=()=>{
   if(!isExecutor()||currentCombat()!==combat||currentScene()!==scene||!combat.started||combat._dawnTransitioning||combat.getFlag('dawn','transition')||needsTurnReconciliation(combat)||combat.uuid!==d.combatUuid||combat.getFlag('dawn','timelineId')!==d.timelineId)throw Error('combatChanged');
   if(!isSupportedBoard(scene)||scene.tokenVision!==false||scene.fog?.exploration!==false||!tokens.every(t=>t?.isOwner&&t.parent===scene&&scene.tokens.get(t.id)===t&&isPublicReactionTarget(t,users)))throw Error('duelPrivacy');
  };
  verify();
  if(tokens.some(t=>t.getFlag('dawn','presence')!=='duel'||(t.movement&&!['completed','stopped'].includes(t.movement.state))))throw Error('duelReturnInvalid');
  const positions=duelReturnPositions(scene,d,initiator,target,destinations);
  const save=async(before,after)=>{
   if(JSON.stringify(party.system.storyContexts?.[duelId])!==JSON.stringify(before))throw Error('duelChanged');
   try{const result=await party.update({[`system.storyContexts.${duelId}`]:after});if(!result||JSON.stringify(party.system.storyContexts?.[duelId])!==JSON.stringify(after))throw Error('Unconfirmed');}
   catch(cause){const error=new Error('duelReturnUncertain',{cause});error.duelId=duelId;throw error;}
  };
  let current=structuredClone(context),next={...current,duel:{...current.duel,phase:'returning',returnPositions:positions,returned:[]}};
  await save(current,next);current=next;
  const checkReturned=()=>{for(const e of current.duel.returned){const t=tokens.find(t=>t.uuid===e.tokenUuid);if(!t||t.getFlag('dawn','presence')||JSON.stringify(pos(t))!==JSON.stringify(e.position))throw Error('duelReturnUncertain');}};
  for(const [i,token] of tokens.entries()){
   verify();checkReturned();
   if(token.getFlag('dawn','presence')!=='duel')throw Error('duelReturnUncertain');
   // Recheck occupancy after every awaited write; the two reserved destinations
   // remain disjoint even after one of the original tokens has moved.
   duelReturnPositions(scene,d,initiator,target,destinations);
   const p=positions[i];
   try{
    const moved=await token.move({x:p.x,y:p.y,action:'blink'},{animate:false,dawnMovement:{kind:'duel-return',duelId}});
    if(!moved||JSON.stringify(pos(token))!==JSON.stringify(p)||(token.movement&&!['completed','stopped'].includes(token.movement.state)))throw Error('Unconfirmed teleport');
    verify();
    const saved=await token.unsetFlag('dawn','presence');
    if(!saved||token.getFlag('dawn','presence'))throw Error('Unconfirmed presence');
   }catch(cause){const error=new Error('duelReturnUncertain',{cause});error.duelId=duelId;throw error;}
   next={...current,duel:{...current.duel,returned:[...current.duel.returned,{tokenUuid:token.uuid,position:p}]}};
   await save(current,next);current=next;
  }
  verify();checkReturned();
  next={...current,status:'completed',duel:{...current.duel,phase:'complete',teleportConsequences:'manual'}};
  await save(current,next);return next;
 }finally{releaseTurnLock(combat.uuid);}
}
