// Explicitly verified LionWing attack IDs, not a parser of descriptive prose.
const formulas=Object.freeze({
  'lionwing.npc.assassin.slice':[3,1],
  'lionwing.npc.bruiser.skulduggery':[4,1],
  'lionwing.npc.executioner.cleave':[6,2],
  'lionwing.npc.bodyguards.behind-me':[5,1],
  'lionwing.npc.revenant.tear-from-the-soul':[5,1],
  'lionwing.npc.hound-master.shove':[5,1],
  'lionwing.npc.necromancer.terrifying-shot':[4,1],
  'lionwing.npc.swarm.tear':[5,1]
});
/** Display only a cost explicitly stored on an NPC action; never invent one. */
export function npcActionCost(item){
  const cost=item?.system?.mechanics?.cost;
  return item?.type==='action'&&cost?.resource==='ap'&&Number.isSafeInteger(cost.amount)&&cost.amount>=0?cost.amount:null;
}
/** A threshold is meaningful only for an explicitly classified Ace. */
export function npcAceThreshold(item){
  const mechanics=item?.system?.mechanics;
  return item?.type==='action'&&mechanics?.kind==='ace'&&Number.isSafeInteger(mechanics.tension)&&mechanics.tension>=0?mechanics.tension:null;
}
/** This answers only the Tension threshold, not whether an Ace can be used. */
export function npcAceTensionStatus(item,tension){
  const threshold=npcAceThreshold(item);
  if(threshold===null||!Number.isSafeInteger(tension)||tension<0)return null;
  return tension>=threshold?'npcAceThresholdMet':'npcAceThresholdNotMet';
}
export function verifiedNpcPool(actor,item,entries){
  const id=item?.system?.canonicalId,formula=formulas[id];
  const parts=actor?.system?.kind==='compound'?actor.system.relations?.parts:null;
  const profile=Array.isArray(parts)?parts.find(part=>part.canonicalId&&id?.startsWith(`${part.canonicalId}.`))?.canonicalId:actor?.system?.canonicalId;
  if(actor?.type!=='npc'||item?.type!=='action'||item.system.archived||!formula||!profile||!id.startsWith(`${profile}.`))return null;
  const entry=entries?.find(e=>e.type==='npc'&&e.system?.canonicalId===profile);
  const source=entry?.items?.find(i=>i.type==='action'&&i.system?.canonicalId===id);
  if(!source||item.system.overrides?.description)return null;
  for(const lang of ['en','ru'])if(item.system.content?.[lang]?.description!==source.system.content?.[lang]?.description)return null;
  const tier=actor.system.tier;if(!Number.isSafeInteger(tier)||tier<0||tier>6)return null;
  return formula[0]+formula[1]*tier;
}

/** Snapshot the rules visible when the action window opened, not a public chat payload. */
export function npcActionSnapshot(actor,item){
  if(actor?.type!=='npc'||!actor.uuid||!item?.id||item.type!=='action'||item.system?.archived||actor.items?.get(item.id)!==item)return null;
  return JSON.stringify({actorUuid:actor.uuid,profile:actor.system?.canonicalId,tier:actor.system?.tier,itemId:item.id,type:item.type,name:item.name,
    canonicalId:item.system?.canonicalId,archived:item.system?.archived,content:item.system?.content,overrides:item.system?.overrides,mechanics:item.system?.mechanics});
}
export function npcActionUnchanged(actor,item,snapshot){return typeof snapshot==='string'&&npcActionSnapshot(actor,item)===snapshot;}
const VERIFIED_MULTIPLIERS=Object.freeze({
 'lionwing.npc.assassin.slice':1,'lionwing.npc.bruiser.skulduggery':1,
 'lionwing.npc.executioner.cleave':2,'lionwing.npc.bodyguards.behind-me':1,
 'lionwing.npc.revenant.tear-from-the-soul':1,'lionwing.npc.hound-master.shove':1,
 'lionwing.npc.necromancer.terrifying-shot':2,'lionwing.npc.swarm.tear':1
});
/** Candidate reward damage only, after source text was checked by verifiedNpcPool.
 * Target-specific conditions, defenses and the question of a hit stay manual. */
export function npcDamagePreview(actor,item,entries,tension){
 const multiplier=VERIFIED_MULTIPLIERS[item?.system?.canonicalId];
 if(!multiplier||!Number.isSafeInteger(tension)||tension<0||verifiedNpcPool(actor,item,entries)===null)return null;
 return {tension,multiplier,conditionalTier:item.system.canonicalId==='lionwing.npc.assassin.slice'?actor.system.tier:null};
}
export function npcDamageAmount(preview,hits){
 if(!preview||!Number.isSafeInteger(hits)||hits<0||!Number.isSafeInteger(preview.tension)||preview.tension<0||![1,2].includes(preview.multiplier))return null;
 const result=hits+preview.multiplier*preview.tension;return Number.isSafeInteger(result)?result:null;
}
