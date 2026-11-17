import {acquireTurnLock,releaseTurnLock} from './turn-state.mjs';

/** Explicit Narrator correction for one unambiguous combatant. */
export async function setCombatantAP({actor,combat,user,value}) {
  if(!user?.isGM||!actor||!combat?.uuid)throw Error('apCorrectionUnavailable');
  if(!Number.isSafeInteger(value)||value<0)throw Error('apInvalid');
  if(!acquireTurnLock(combat.uuid))throw Error('battleTurnBusy');
  try{
    if(combat._dawnTransitioning)throw Error('battleTurnBusy');
    const matches=combat.combatants.filter(c=>c.actor?.uuid===actor.uuid);
    if(matches.length!==1)throw Error('apCorrectionUnavailable');
    const combatant=matches[0];
    if(combatant.getFlag('dawn','ap')===value)return combatant;
    if(!await combatant.update({'flags.dawn.ap':value})||combatant.getFlag('dawn','ap')!==value)throw Error('combatRecovery');
    return combatant;
  }finally{releaseTurnLock(combat.uuid);}
}
