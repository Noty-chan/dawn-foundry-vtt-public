import {isPersonalAbility,rankExpenditure} from './gadgets.mjs';
/** Pure DAWN rules. No Foundry globals, IO or resource writes. */
export const EDITION = "dawn-en-lionwing-cb2f8e67";
export const ATTRIBUTES = ["body", "talent", "spirit", "mind"];
export function integer(value, {min = 0, max = Number.MAX_SAFE_INTEGER} = {}) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`Invalid integer: ${value}`);
  return value;
}
export function heroStatistics({tier, attributes}) {
  integer(tier, {min: 1});
  ATTRIBUTES.forEach(k => integer(attributes[k]));
  return {health: 10 + attributes.body + 2 * tier, speed: 2 + Math.ceil(attributes.talent / 2), startingFocus: 1 + Math.ceil(attributes.spirit / 2), armor: 0};
}
export function npcStatistics({tier, statistics}) {
  integer(tier);
  return Object.fromEntries(["health", "speed", "armor", "evasion"].map(k => {
    const s = statistics[k] ?? {};
    const n = s.override ?? (s.base ?? 0) + (s.perTier ?? 0) * tier;
    return [k, integer(n)];
  }));
}
export function poolSize(sources) {
  let base = 0, advantage = 0, disadvantage = 0;
  for (const source of sources) {
    const count = integer(source.count);
    if (source.kind === "base") base += count;
    else if (source.kind === "advantage") advantage += count;
    else if (source.kind === "disadvantage") disadvantage += count;
    else throw new Error("Unknown source kind");
  }
  const cancelled = Math.min(advantage, disadvantage);
  return {base, advantage, disadvantage, cancelled, pool: Math.max(0, base + advantage - disadvantage)};
}
export function quickPool(sources, adjustment = 0) {
  integer(adjustment, {min: -200, max: 200});
  return Math.max(0, sources.reduce((n, s) => n + (integer(s.count) === 0 ? 0 : s.count <= 2 ? 1 : 2), 0) + adjustment);
}
export function classify(hits, {kind = "hits-only", tier = 1, requiredHits = 1, comparator = ">="} = {}) {
  integer(hits);
  if (kind === "hits-only") return null;
  if (kind === "quick") return hits >= 2 ? "extreme" : hits === 1 ? "minimum" : "failure";
  if (kind === "tier-bands") {integer(tier, {min: 1}); return hits >= 2 * tier ? "extreme" : hits > tier ? "minimum" : "failure";}
  if (kind === "threshold") return (comparator === ">" ? hits > requiredHits : hits >= requiredHits) ? "minimum" : "failure";
  throw new Error("Unknown evaluation kind");
}
export function countDice(dice, {successAt = 4, criticalAt = 6} = {}) {
  let hits = 0, crits = 0;
  for (const d of dice) if (d.active !== false) {
    integer(d.face, {min: 1, max: 6});
    if (d.face >= successAt) hits++;
    if (criticalAt !== null && d.face >= criticalAt) crits++;
  }
  return {hits, crits};
}
/** Injectable die evaluator only for testing; live adapter always uses Foundry Roll. */
export async function evaluateXD6(request, rollDie) {
  const quick = request.kind === "quick";
  const count = quick ? quickPool(request.sources, request.quickAdjustment ?? 0) : poolSize(request.sources).pool;
  if (count > 200) throw new Error("Pool exceeds 200 initial dice");
  const profile = {successAt: request.successAt ?? 4, criticalAt: quick ? null : (request.criticalAt === null ? null : request.criticalAt ?? 6), explode: !quick && request.explode !== false};
  integer(profile.successAt, {min: 2, max: 6});
  if (profile.criticalAt !== null) integer(profile.criticalAt, {min: 2, max: 6});
  const dice = [], pending = Array.from({length: count}, () => ({parentDieId: null, origin: "initial"}));
  while (pending.length && dice.length < 2000) {
    const next = pending.shift();
    const rolled = await rollDie();
    const face = integer(rolled.face, {min: 1, max: 6});
    const die = {...next, id: `d${dice.length}`, face, nativeRoll: rolled.nativeRoll ?? null, active: true};
    dice.push(die);
    if (profile.explode && profile.criticalAt !== null && face >= profile.criticalAt) pending.unshift({parentDieId: die.id, origin: "critical"});
  }
  const {hits, crits} = countDice(dice, profile);
  return {schemaVersion: 1, request: structuredClone(request), profile, initialPool: count, dice, pending, hits, crits, status: pending.length ? "limit-paused" : "complete", outcome: pending.length ? null : classify(hits, quick ? {kind: "quick"} : request.evaluation)};
}
export function opposed(a, b) {return a === b ? "rebound" : a > b ? "a" : "b";}
export function group(hits) {return hits.length ? Math.max(...hits.map(v => integer(v))) : 0;}
export function attackDamage({amount, armor = 0, evasion = 0, canArmor = true, canEvasion = true, unreducible = false}) {
  [amount, armor, evasion].forEach(v => integer(v));
  const afterArmor = unreducible || !canArmor || amount === 0 ? amount : Math.max(1, amount - armor);
  const absorbed = unreducible || !canEvasion ? 0 : Math.min(evasion, afterArmor);
  return {healthDamage: afterArmor - absorbed, evasion: evasion - absorbed, absorbed, fullyEvaded: amount > 0 && absorbed === afterArmor};
}
export function manhattan(a, b) {return Math.abs(a.column - b.column) + Math.abs(a.row - b.row);}
export function occupiedCells({column, row, width = 1, height = 1}) {
  integer(width, {min: 1}); integer(height, {min: 1});
  if(width*height>10000)throw Error("Footprint exceeds the technical cell limit");
  return Array.from({length: width * height}, (_, i) => ({column: column + i % width, row: row + Math.floor(i / width)}));
}
export function footprintDistance(a,b){
  const aw=a.width??1,ah=a.height??1,bw=b.width??1,bh=b.height??1;
  for(const n of [aw,ah,bw,bh])integer(n,{min:1});
  return Math.max(0,a.column-(b.column+bw-1),b.column-(a.column+aw-1))+Math.max(0,a.row-(b.row+bh-1),b.row-(a.row+ah-1));
}
export function adjacent(a, b) {return a.id !== b.id && footprintDistance(a, b) <= 1;}
export function lineCells(origin, direction, length) {
  if (![-1, 0, 1].includes(direction.column) || ![-1, 0, 1].includes(direction.row) || (!direction.column && !direction.row)) throw new Error("Invalid Line direction");
  integer(length, {max: 200});
  return Array.from({length}, (_, i) => ({column: origin.column + direction.column * (i + 1), row: origin.row + direction.row * (i + 1)}));
}
export function remainingBudget(awards, kind) {return awards.reduce((n, a) => n + (a.remaining?.[kind] ?? 0), 0);}
export function validateCreation(system, items) {
  items=Array.from(items).filter(i=>!i.system.archived);
  const errors = [];
  const values = ATTRIBUTES.map(k => system.attributes[k]);
  if (system.tier !== 1) errors.push("tierCreation");
  if (values.sort((a,b)=>a-b).join(",") !== "2,2,3,4") errors.push("attributeArray");
  const skills = items.filter(i=>i.type === "skill");
  const abilities = items.filter(i=>i.type === "ability");
  if ([...skills,...abilities].some(i=>!Number.isInteger(i.system.rank)||i.system.rank<1||i.system.rank>3)) errors.push("invalidRank");
  if (abilities.some(i=>!Number.isInteger(i.system.purchaseCost)||i.system.purchaseCost<1)) errors.push("invalidAbilityCost");
  const ranks = rankExpenditure(items).ranks;
  if (skills.reduce((n,i)=>n+i.system.rank,0) < 4) errors.push("fourSkills");
  if (ranks !== 8) errors.push("eightRanks");
  if (abilities.filter(isPersonalAbility).length > 1) errors.push("oneAbility");
  const levels = items.filter(i=>i.type === "technique");
  if (levels.reduce((n,i)=>n+i.system.level,0) !== 5) errors.push("fiveLevels");
  const groups = new Map();
  for (const i of levels) {
    const g=i.system.groupId || i.system.canonicalId;
    if (!groups.has(g)) groups.set(g,[]);
    groups.get(g).push(i.system.level);
  }
  for (const a of groups.values()) if (a.length!==1||!Number.isInteger(a[0])||a[0]<1||a[0]>3) errors.push("levelOrder");
  const archetypes = new Set(levels.map(i=>i.system.archetypeId));
  if (archetypes.size > 3) errors.push("threeArchetypes");
  if (!system.primaryOutlook) errors.push("primaryOutlook");
  const boons=items.filter(i=>i.type === "boon"&&!i.system.inherent);
  if (boons.length !== 2 || boons.some(i=>i.system.groupId!==system.primaryOutlook)) errors.push("twoBoons");
  return [...new Set(errors)];
}
