/** A Technique is one Item with three canonical levels and one learned level. */
export function activeItems(items){return Array.from(items).filter(i=>!i.system.archived);}
export function techniqueRanks(items){return activeItems(items).filter(i=>i.type==="technique").reduce((n,i)=>n+i.system.level,0);}
export function techniqueView(item,language="en"){
  const s=item.system,lang=language.startsWith('ru')?'ru':'en',content=s.content?.[lang]??{},fallback=s.content?.[lang==='ru'?'en':'ru']??{};
  const ownLevels=Array.isArray(content.levels)?content.levels:[],fallbackLevels=Array.isArray(fallback.levels)?fallback.levels:[];
  const levels=[1,2,3].map(n=>{const own=ownLevels.find(l=>l?.n===n)??{},other=fallbackLevels.find(l=>l?.n===n)??{};return {n,name:own.name??other.name??'',text:own.text??other.text??'',learned:n<=s.level};});
  return {id:item.id??item._id,name:s.overrides?.name??content.name??fallback.name??item.name,description:s.overrides?.description??content.flavor??content.description??fallback.flavor??fallback.description??"",archetypeId:s.archetypeId,level:s.level,complexity:s.complexity??1,tags:content.tags??fallback.tags??"",source:content.source??fallback.source,levels};
}

/** Normalize form values to three levels while retaining additional level metadata. */
export function mergeTechniqueLevels(existing,submitted){
  return [1,2,3].map((n,index)=>{
    const row=submitted?.[index],previous=Array.isArray(existing)?existing.find(level=>level.n===n):null;
    if(typeof row?.name!=='string'||typeof row?.text!=='string')throw Error('Invalid Technique level fields');
    return {...previous,n,name:row.name,text:row.text};
  });
}
export function techniqueEditSnapshot(item,language){
  return JSON.stringify({name:item.name,archetypeId:item.system.archetypeId,complexity:item.system.complexity,content:item.system.content?.[language]??null});
}
/** Preserve every legacy note and document ID while consolidating split levels. */
export function legacyTechniqueUpdates(items,catalog){
  const groups=new Map();
  for(const i of items){if(i.type!=="technique"||i.system.archived||i.system.content?.en?.levels)continue;const key=i.system.groupId;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(i);}
  const updates=[];
  for(const [key,rows] of groups){
    const canonical=catalog.find(e=>e.type==="technique"&&e.system.groupId===key);if(!canonical)continue;
    rows.sort((a,b)=>a.system.level-b.system.level);
    const first=rows[0],legacy=rows.map(i=>({id:i.id??i._id,level:i.system.level,name:i.name,notes:i.system.notes??"",overrides:i.system.overrides??{}}));
    updates.push({_id:first.id??first._id,name:canonical.name,"system.schemaVersion":2,"system.canonicalId":key,"system.content":structuredClone(canonical.system.content),"system.complexity":canonical.system.complexity,"system.level":Math.max(...rows.map(i=>i.system.level)),"system.origin.legacyLevels":legacy});
    for(const i of rows.slice(1))updates.push({_id:i.id??i._id,"system.archived":true,"system.origin.supersededBy":first.id??first._id});
  }
  return updates;
}
