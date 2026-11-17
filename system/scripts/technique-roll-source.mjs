/** Capture the learned level and text which gave the roll its meaning. */
export function techniqueRollSnapshot(actor,item,level){
  if(actor?.type!=='hero'||!actor.uuid||!item?.id||item.type!=='technique'||actor.items?.get(item.id)!==item||item.system?.archived||!Number.isSafeInteger(level)||level<1||level>3||level>item.system.level)return null;
  return JSON.stringify({actorUuid:actor.uuid,itemId:item.id,level,type:item.type,name:item.name,learned:item.system.level,archived:item.system.archived,canonicalId:item.system.canonicalId,content:item.system.content,overrides:item.system.overrides});
}
export function techniqueRollUnchanged(actor,item,level,snapshot){return typeof snapshot==='string'&&techniqueRollSnapshot(actor,item,level)===snapshot;}
