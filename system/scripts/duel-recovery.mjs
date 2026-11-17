import {isSupportedBoard} from './board.mjs';
import {duelReturnPositions} from './duel-return.mjs';
import {isPublicReactionTarget} from './reaction-privacy.mjs';
import {acquireTurnLock,releaseTurnLock,needsTurnReconciliation} from './turn-state.mjs';

const validId=id=>typeof id==='string'&&/^[A-Za-z0-9]{16}$/.test(id);
const pos=t=>({x:t._source?.x??t.x,y:t._source?.y??t.y,width:t.width,height:t.height});
const overlap=(a,b)=>a.x<b.x+b.width*100&&a.x+a.width*100>b.x&&a.y<b.y+b.height*100&&a.y+a.height*100>b.y;

/** Only acknowledge a fully observed end state; never retry movement or cost. */
export async function reconcileDuelTransfer({party,combat,scene,duelId,initiator,target,user,users,isExecutor,expectedContext,confirmed=false,currentCombat=()=>game.combat,currentScene=()=>canvas.scene}){
 if(!user?.isGM||!isExecutor()||!party?.isOwner||!scene?.isOwner)throw Error('duelPermission');
 if(!validId(duelId)||!combat?.uuid||confirmed!==true)throw Error('duelRecoveryManual');
 if(!acquireTurnLock(combat.uuid))throw Error('battleTurnBusy');
 try{
  const context=party.system?.storyContexts?.[duelId],d=context?.duel,tokens=[initiator,target];
  if(!context||JSON.stringify(context)!==JSON.stringify(expectedContext))throw Error('duelChanged');
  if(!isExecutor()||currentCombat()!==combat||currentScene()!==scene||!combat.started||combat.getFlag('dawn','transition')||needsTurnReconciliation(combat)||combat.uuid!==d?.combatUuid||combat.getFlag('dawn','timelineId')!==d.timelineId)throw Error('combatChanged');
  if(context.status!=='active'||!['departing','returning'].includes(d.phase)||d.initiatorTokenUuid!==initiator?.uuid||d.targetTokenUuid!==target?.uuid||!isSupportedBoard(scene)||scene.tokenVision!==false||scene.fog?.exploration!==false||!tokens.every(t=>t?.isOwner&&t.parent===scene&&scene.tokens.get(t.id)===t&&isPublicReactionTarget(t,users)&&(!t.movement||['completed','stopped'].includes(t.movement.state))))throw Error('duelRecoveryManual');
  let next;
  if(d.phase==='departing'){
   const positions=tokens.map(pos);
   if(tokens.some(t=>t.getFlag('dawn','presence')!=='duel')||positions.some(p=>![p.x,p.y,p.width,p.height].every(Number.isInteger)||p.width<1||p.height<1||p.x<1000||p.y<1100||p.x+p.width*100>1700||p.y+p.height*100>1400||(p.x-1000)%100||(p.y-1100)%100)||overlap(...positions))throw Error('duelRecoveryManual');
   for(const other of scene.tokens){if(tokens.includes(other))continue;const p=pos(other);if(![p.x,p.y,p.width,p.height].every(Number.isFinite)||positions.some(v=>overlap(v,p)))throw Error('duelRecoveryManual');}
   const departed=tokens.map((t,i)=>({tokenUuid:t.uuid,position:positions[i]}));
   next={...context,duel:{...d,phase:'awaitingResolution',nextTokenIndex:2,departed,departureReconciledBy:user.id}};
  }else{
   if(!Array.isArray(d.returnPositions)||d.returnPositions.length!==2||tokens.some((t,i)=>t.getFlag('dawn','presence')||JSON.stringify(pos(t))!==JSON.stringify(d.returnPositions[i])))throw Error('duelRecoveryManual');
   const ox=d.initiatorPosition?.x>=1000?1000:100;
   const cells=d.returnPositions.map(p=>({column:(p.x-ox)/100,row:(p.y-300)/100}));
   const checked=duelReturnPositions(scene,d,initiator,target,cells);
   if(JSON.stringify(checked)!==JSON.stringify(d.returnPositions))throw Error('duelRecoveryManual');
   next={...context,status:'completed',duel:{...d,phase:'complete',returned:tokens.map((t,i)=>({tokenUuid:t.uuid,position:checked[i]})),teleportConsequences:'manual',returnReconciledBy:user.id}};
  }
  try{
   const saved=await party.update({[`system.storyContexts.${duelId}`]:next});
   if(!saved||JSON.stringify(party.system.storyContexts?.[duelId])!==JSON.stringify(next))throw Error('Unconfirmed');
  }catch(cause){const error=new Error('duelRecoveryUncertain',{cause});error.duelId=duelId;throw error;}
  return next;
 }finally{releaseTurnLock(combat.uuid);}
}
