import {needsTurnReconciliation,newTurnAnchor,turnAnchorMatches,acquireTurnLock,releaseTurnLock} from './turn-state.mjs';
import {isExecutor} from './operations.mjs';
import {label,escape} from './rolls.mjs';

/** Acknowledgement never retries a failed transition or changes game resources. */
export async function acknowledgeTransition(combat,viewed=()=>ui.combat?.viewed){
  if(!isExecutor())throw Error(label('executorOnly'));
  const marker=combat?.getFlag('dawn','transition');
  if(!marker?.id||combat._dawnTransitioning||viewed()!==combat)throw Error(label('combatChanged'));
  const snapshot=()=>JSON.stringify({marker:combat.getFlag('dawn','transition'),round:combat.round,current:combat.combatant?.id??null,
    turnId:combat.getFlag('dawn','turnId'),anchor:combat.getFlag('dawn','turnAnchor'),timeline:combat.getFlag('dawn','timelineId')});
  const before=snapshot();
  const confirmed=await foundry.applications.api.DialogV2.confirm({window:{title:label('battleRecoveryTitle')},content:`<p>${escape(label('battleRecoveryWarning'))}</p>`,rejectClose:false});
  if(!confirmed)return false;
  if(!isExecutor())throw Error(label('executorOnly'));
  if(!acquireTurnLock(combat.uuid))throw Error(label('battleTurnBusy'));
  try{
    if(viewed()!==combat||combat._dawnTransitioning||snapshot()!==before)throw Error(label('combatChanged'));
    if(!await combat.update({'flags.dawn.-=transition':null},{turnEvents:false})||combat.getFlag('dawn','transition'))throw Error(label('combatRecovery'));
    return true;
  }finally{releaseTurnLock(combat.uuid);}
}

/** Re-anchoring creates a new timeline; old effect durations become manual. */
export async function reconcileTurn(combat,viewed=()=>ui.combat?.viewed){
  if(!isExecutor())throw Error(label('executorOnly'));
  const safe=()=>{
    if(viewed()!==combat||combat._dawnTransitioning||combat.getFlag('dawn','transition')||!needsTurnReconciliation(combat)||!combat.combatant?.id)throw Error(label('combatChanged'));
  };
  safe();const before=JSON.stringify({round:combat.round,id:combat.combatant.id,turnId:combat.getFlag('dawn','turnId'),anchor:combat.getFlag('dawn','turnAnchor'),timelineId:combat.getFlag('dawn','timelineId')});
  const confirmed=await foundry.applications.api.DialogV2.confirm({window:{title:label('battleReconcileTitle')},content:`<p>${escape(label('battleReconcileWarning'))}</p>`,rejectClose:false});
  if(!confirmed)return false;
  if(!isExecutor())throw Error(label('executorOnly'));
  if(!acquireTurnLock(combat.uuid))throw Error(label('battleTurnBusy'));
  try{
    safe();
    if(before!==JSON.stringify({round:combat.round,id:combat.combatant.id,turnId:combat.getFlag('dawn','turnId'),anchor:combat.getFlag('dawn','turnAnchor'),timelineId:combat.getFlag('dawn','timelineId')}))throw Error(label('combatChanged'));
    const id=foundry.utils.randomID(),timelineId=foundry.utils.randomID(),anchor=newTurnAnchor(combat.round,combat.combatant.id,id);
    if(!await combat.update({'flags.dawn.turnId':id,'flags.dawn.turnAnchor':anchor,'flags.dawn.timelineId':timelineId},{turnEvents:false})||!turnAnchorMatches(combat)||combat.getFlag('dawn','timelineId')!==timelineId)throw Error(label('combatRecovery'));
    return true;
  }finally{releaseTurnLock(combat.uuid);}
}
