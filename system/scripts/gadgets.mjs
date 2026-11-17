/** Gearhead Gadgets are physical Ability Items, never Skills or a second personal Ability. */
export const isGadget=item=>item?.type==='ability'&&item.system?.mechanics?.gadget===true;
export const isPersonalAbility=item=>item?.type==='ability'&&!isGadget(item);
export const hasGearhead=items=>Array.from(items??[]).some(i=>i.type==='boon'&&!i.system?.archived&&i.system?.canonicalId==='quiet.gearhead');
export const gadgetCreatorKey=actor=>actor?.getFlag?.('dawn','legacyImport')?.sourceId??actor?.flags?.dawn?.legacyImport?.sourceId??actor?.uuid;
export function gadgetRollRank(item,actor){
 const creator=item?.system?.mechanics?.gadgetCreator;
 return isGadget(item)&&creator&&creator!==gadgetCreatorKey(actor)?Math.min(2,item.system.rank):item.system.rank;
}
export function rankExpenditure(items){
 const live=Array.from(items??[]).filter(i=>!i.system?.archived),skills=live.filter(i=>i.type==='skill'),abilities=live.filter(i=>i.type==='ability');
 const cost=i=>Math.max(1,i.system.purchaseCost??1)+i.system.rank-1;
 const skillRanks=skills.reduce((n,i)=>n+i.system.rank,0),abilityRanks=abilities.filter(i=>!isGadget(i)).reduce((n,i)=>n+cost(i),0),gadgetRanks=abilities.filter(isGadget).reduce((n,i)=>n+cost(i),0),gadgetAllowance=hasGearhead(live)?3:0;
 return {skillRanks,abilityRanks,gadgetRanks,gadgetAllowance,ranks:skillRanks+abilityRanks+Math.max(0,gadgetRanks-gadgetAllowance)};
}
