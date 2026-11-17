import {turnAnchorMatches,hasTimeline} from './turn-state.mjs';
import {effectTurnExpiry,hasOrdinaryTurnDuration} from './effect-rules.mjs';

const active=e=>!e.disabled&&!e.isSuppressed;
const sameEffect=(actor,id)=>Array.from(actor.effects).filter(e=>active(e)&&e.flags?.dawn?.canonicalId===id);
const uniqueCombatant=(combat,actor)=>Array.from(combat.combatants).filter(c=>c.actor?.uuid===actor.uuid).length===1;

/** Old, unknown and other-combat generations never expire automatically. */
export function effectDurationTimelineMatches(effect,combat){
  const applied=effect?.flags?.dawn?.applied;
  return !!(hasTimeline(combat)&&applied?.combatUuid===combat.uuid&&applied.timelineId===combat.getFlag('dawn','timelineId'));
}

/** Only an explicit, known application during the present settled turn can be opted in. */
export function canUseStandardDuration(actor,effect,combat){
  const flags=effect?.flags?.dawn,applied=flags?.applied;
  return !!(actor?.uuid&&actor.system?.kind!=='compound'&&effect&&active(effect)&&combat?.started&&turnAnchorMatches(combat)&&!combat.getFlag('dawn','transition')&&
    hasOrdinaryTurnDuration(flags?.canonicalId)&&!flags.durationOverride&&effectDurationTimelineMatches(effect,combat)&&
    applied?.combatUuid===combat.uuid&&applied.turnId&&applied.turnId===combat.getFlag('dawn','turnId')&&
    uniqueCombatant(combat,actor)&&sameEffect(actor,flags.canonicalId).length===1);
}

/** Invoked within a guarded transition; per-effect update combines state and receipt. */
export async function finishStandardEffects(combat,combatant,turnId,transitionId,assertAuthority){
  const actor=combatant?.actor;if(!actor?.uuid||actor.system?.kind==='compound')return;
  const selected=Array.from(actor.effects??[]).filter(e=>active(e)&&e.flags?.dawn?.autoDuration===true&&hasOrdinaryTurnDuration(e.flags?.dawn?.canonicalId)&&effectDurationTimelineMatches(e,combat));
  if(!selected.length)return;
  if(!turnId||!uniqueCombatant(combat,actor))throw Error('effectDurationAmbiguous');
  for(const effect of selected){
    assertAuthority();
    const flags=effect.flags.dawn,id=flags.canonicalId;
    if(sameEffect(actor,id).length!==1)throw Error('effectDurationAmbiguous');
    const event={phase:'end',combatUuid:combat.uuid,turnId,ownerUuid:actor.uuid,currentActorUuid:actor.uuid};
    const decision=effectTurnExpiry({canonicalId:id,applied:flags.applied,disabled:effect.disabled,durationOverride:flags.durationOverride},event);
    if(decision==='manual')throw Error('effectDurationAmbiguous');
    if(decision!=='expire')continue;
    const receipt={transitionId,turnId,combatUuid:combat.uuid};
    const updated=await effect.update({disabled:true,'flags.dawn.expired':receipt});
    if(!updated||!effect.disabled||effect.getFlag('dawn','expired')?.transitionId!==transitionId)throw Error('effectDurationUnconfirmed');
  }
}
