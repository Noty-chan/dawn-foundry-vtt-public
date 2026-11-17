/** Persistent identity links an opaque turn ID to a combatant and round, not an index. */
export function turnAnchorMatches(combat){
  if(!combat?.started)return false;
  const anchor=combat.getFlag('dawn','turnAnchor'),id=combat.getFlag('dawn','turnId');
  return !!(anchor&&typeof id==='string'&&id&&Number.isSafeInteger(combat.round)&&combat.round>0&&typeof anchor.combatantId==='string'&&anchor.combatantId&&anchor.turnId===id&&anchor.round===combat.round&&anchor.combatantId===combat.combatant?.id);
}
export function hasTimeline(combat){const id=combat?.getFlag?.('dawn','timelineId');return typeof id==='string'&&id.length>0;}
export function needsTurnReconciliation(combat){return !!combat?.started&&(!turnAnchorMatches(combat)||!hasTimeline(combat));}
export function newTurnAnchor(round,combatantId,turnId){return {round,combatantId,turnId};}

// Serializes DAWN turn-dependent writes on one executor client only.
const locks=new Set();
export function acquireTurnLock(uuid){if(!uuid||locks.has(uuid))return false;locks.add(uuid);return true;}
export function releaseTurnLock(uuid){locks.delete(uuid);}
