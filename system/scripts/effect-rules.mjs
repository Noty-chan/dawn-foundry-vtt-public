/**
 * LionWing, PDF p. 61. Turn events must carry a unique, persistent turnId assigned
 * by DAWN, not a mutable Foundry round/turn index. This module never mutates a
 * document or assumes a combat event has happened.
 */
const ordinary = new Set([
  'positive.ускорен', 'positive.укреплен', 'positive.устойчив', 'positive.усилен',
  'negative.ошеломлен', 'negative.испуган', 'negative.обездвижен',
  'negative.замедлен', 'negative.разорван', 'negative.пойман',
  'negative.спровоцирован', 'negative.ослаблен'
]);
const persistent = new Set([
  'positive.невидим', 'positive.регенерирует', 'negative.порчен', 'negative.помечен'
]);
const atStart = new Set(['positive.изгнан', 'negative.подброшен']);
export function hasOrdinaryTurnDuration(canonicalId){return ordinary.has(canonicalId);}

/** Dazed changes the AP granted at the start of a turn, not current AP. */
export function initialTurnAP(effects = [], base = 3) {
  if (!Number.isSafeInteger(base) || base < 0) throw new TypeError('Invalid initial AP');
  const dazed=Array.from(effects).some(effect=>!effect.disabled&&!effect.isSuppressed&&effect.flags?.dawn?.canonicalId==='negative.ошеломлен');
  return Math.max(0,base-(dazed?1:0));
}

/** Canonical Ronin begins each of its own turns with one extra AP. */
export function combatantStartingAP(actor){
  const base=actor?.type==='npc'&&actor.system?.canonicalId==='lionwing.npc.ronin'?4:3;
  return initialTurnAP(actor?.allApplicableEffects?.()??actor?.effects??[],base);
}

/** Derived values only: no document updates, expiry or movement side effects. */
export function effectStatistics({speed, armor, tier}, effects = []) {
  const active = new Set();
  for (const effect of effects) {
    if (effect.disabled || effect.isSuppressed) continue;
    const id = effect.flags?.dawn?.canonicalId;
    if (id) active.add(id);
  }
  const hastened = active.has('positive.ускорен');
  const slowed = active.has('negative.замедлен');
  const speedConflict = hastened && slowed;
  return {
    speed: speedConflict ? speed : hastened ? speed * 2 : slowed ? Math.ceil(speed / 2) : speed,
    armor: armor + (active.has('positive.укреплен') ? tier : 0),
    speedConflict
  };
}

/**
 * Returns 'expire', 'keep', or 'manual'.  The event must concern the effect
 * owner's own turn. 'manual' means the caller must not silently remove it.
 * Origin-dependent and exceptional removal triggers are not inferred here.
 */
export function effectTurnExpiry({canonicalId, applied, disabled=false, durationOverride=false}, event) {
  if (disabled) return 'keep';
  if (!event || !['start','end'].includes(event.phase)) return 'manual';
  if (durationOverride) return 'manual';
  if (persistent.has(canonicalId)) return 'keep';
  // Disappeared must be reappeared at a legal location when removed, so the
  // transition cannot safely be reduced to deleting an ActiveEffect.
  if (canonicalId === 'positive.исчез') return 'manual';
  if (!ordinary.has(canonicalId) && !atStart.has(canonicalId)) return 'manual';
  if (!event.combatUuid || !event.turnId || !event.ownerUuid || !event.currentActorUuid) return 'manual';
  if (event.ownerUuid !== event.currentActorUuid) return 'keep';
  if (!applied?.combatUuid || !applied?.turnId || applied.combatUuid !== event.combatUuid) return 'manual';
  if (atStart.has(canonicalId)) return event.phase === 'start' ? 'expire' : 'keep';
  if (event.phase !== 'end') return 'keep';
  return applied.turnId === event.turnId ? 'keep' : 'expire';
}

/** Safe, read-only evaluation of an Actor's current effects for one transition. */
export function planEffectTurn(actorUuid, effects, event) {
  const result={expire:[],manual:[]};
  for (const effect of effects) {
    const flags=effect.flags?.dawn;
    if (!flags?.canonicalId) continue;
    const decision=effectTurnExpiry({canonicalId:flags.canonicalId,applied:flags.applied,disabled:effect.disabled,durationOverride:flags.durationOverride||flags.manual},
      {...event,ownerUuid:actorUuid});
    if (decision==='expire') result.expire.push(effect.id);
    else if (decision==='manual') result.manual.push(effect.id);
  }
  return result;
}
