import {isExecutor} from './operations.mjs';
import {acquireTurnLock,releaseTurnLock} from './turn-state.mjs';

/** Absolute correction; never infer a KO or replay a possibly successful write. */
export async function setBattleTension({combat,party,value,expected,viewed=()=>ui.combat?.viewed}){
  if(!isExecutor())throw Error('executorOnly');
  if(!Number.isSafeInteger(value)||value<0)throw Error('tensionInvalid');
  if(!combat?.uuid||!combat.started||viewed()!==combat||!party?.isOwner)throw Error('combatChanged');
  if(!acquireTurnLock(combat.uuid))throw Error('battleTurnBusy');
  try{
    if(combat._dawnTransitioning)throw Error('battleTurnBusy');
    const id=combat.getFlag('dawn','storyContextId'),context=party.system?.storyContexts?.[id];
    if(!id||!context||context.linkedCombatUuid!==combat.uuid||!Number.isSafeInteger(context.tension)||context.tension<0||context.tension!==expected)throw Error('combatChanged');
    if(value===expected)return value;
    try{
      const result=await party.update({[`system.storyContexts.${id}.tension`]:value});
      if(!result||party.system?.storyContexts?.[id]?.tension!==value||party.system?.storyContexts?.[id]?.linkedCombatUuid!==combat.uuid)throw Error('Unconfirmed tension update');
    }catch(cause){throw new Error('tensionWriteUncertain',{cause});}
    return value;
  }finally{releaseTurnLock(combat.uuid);}
}
