import {inPreparedDiscard} from './board.mjs';

/** The GM can change a zone's side using the native token disposition control. */
export function fodderSide(token){
  if(token?.disposition===1)return 'players';
  if(token?.disposition===-1)return 'narrator';
  const explicit=token?.getFlag?.('dawn','fodderSide');
  if(explicit==='players'||explicit==='narrator')return explicit;
  return null;
}

/** The active side may move; round-end damage is considered for either side. */
export function fodderTurnReminder(combat,user,newRound){
  if(!user?.isGM||!combat?.started||!['hero','npc'].includes(combat.combatant?.actor?.type))return null;
  const tokens=combat.scene?.tokens;
  const currentSide=combat.combatant.actor.type==='hero'?'players':'narrator';
  if(!tokens||!Array.from(tokens).some(t=>{
    if(t.actor?.getFlag?.('dawn','fodderTemplate')!==true||!(Number(t.actor.system?.health?.value)>0))return false;
    // Removed zones remain as tokens in reserve/discard, but are not on the board.
    const presence=t.getFlag?.('dawn','presence');if(presence||inPreparedDiscard(combat.scene,t))return false;
    const side=fodderSide(t);return newRound||side===null||side===currentSide;
  }))return null;
  return newRound?'fodderReminderRound':'fodderReminderTurn';
}
