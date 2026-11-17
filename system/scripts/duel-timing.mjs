/** All active duel records for this combat, including those needing recovery. */
export function activeCombatDuels(combat,party){
 const contexts=party?.system?.storyContexts??{};
 if(!combat?.uuid)return [];
 return Object.entries(contexts).filter(([,c])=>c?.status==='active'&&c.duel?.combatUuid===combat.uuid).map(([id,context])=>({id,context}));
}
export function duelForCombatant(combat,party,combatant){
 const uuid=combatant?.token?.uuid;if(!uuid)return null;
 return activeCombatDuels(combat,party).find(({context})=>[context.duel.initiatorTokenUuid,context.duel.targetTokenUuid].includes(uuid))??null;
}

/**
 * Block rather than silently granting a turn to a duelist. Immediate resolution
 * is required when no other active hero or NPC remains on the board.
 */
export function duelTurnBlock(combat,party,nextCombatant=null){
 const duels=activeCombatDuels(combat,party);if(!duels.length)return null;
 const stale=duels.find(({context})=>!context.duel.timelineId||context.duel.timelineId!==combat.getFlag('dawn','timelineId'));
 if(stale)return {id:stale.id,reason:'duelTimelineChanged'};
 const incomplete=duels.find(({context})=>context.duel.phase!=='awaitingResolution');
 if(incomplete)return {id:incomplete.id,reason:'duelStagePending'};
 const remaining=(combat.turns??[]).filter(c=>{
  const presence=c.token?.getFlag?.('dawn','presence');
  return !c.defeated&&!c.isDefeated&&(!presence||presence==='disappeared')&&['hero','npc'].includes(c.actor?.type)&&c.actor?.system?.presentation?.role!=='obstacle';
 });
 if(!remaining.some(c=>c.actor.type==='hero')||!remaining.some(c=>c.actor.type==='npc'))return {id:duels[0].id,reason:'duelResolveNow'};
 const selected=duelForCombatant(combat,party,nextCombatant);
 return selected?{id:selected.id,reason:'duelResolveTurn'}:null;
}
