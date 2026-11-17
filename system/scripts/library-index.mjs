/**
 * Read-only Compendium search for the two library applications.
 *
 * The pack remains the source of truth. An index row is not an Item/Actor and
 * must never be written to an Actor or treated as proof of access to a pack.
 * Resolve a selected row through resolveLibraryEntry at the time of the action.
 */
export const LIBRARY_ITEM_TYPES = Object.freeze([
  'skill', 'ability', 'bond', 'boon', 'technique', 'equipment', 'action', 'modifier', 'effect'
]);
const ITEM_TYPES = new Set(LIBRARY_ITEM_TYPES);
const ACTOR_TYPES = new Set(['npc']);
const INDEX_FIELDS = Object.freeze([
  'name', 'type', 'img', 'system.canonicalId', 'system.groupId',
  'system.archetypeId', 'system.content', 'system.overrides', 'system.inherent',
  'system.level', 'system.complexity', 'system.support'
]);

const text = value => typeof value === 'string' ? value : '';
export function libraryPackLabel(name,language='en') {
  const title=text(name);
  return language.startsWith('en')?title.replace(/^DAWN · .*? \/ /,'DAWN · '):title;
}
export function catalogPack(entry) {
  const id=entry.system?.groupId==='bond-rules'?'bonds'
    :entry.type==='technique'?`techniques-${entry.system.archetypeId}`:entry.type;
  return `dawn.${id}`;
}

export function indexCatalogPacks(entries) {
  const packs=new Map();
  for(const entry of entries){
    const collection=catalogPack(entry);
    if(!packs.has(collection))packs.set(collection,new Map());
    packs.get(collection).set(entry._id,entry);
  }
  return packs;
}
const idPattern = /^[A-Za-z0-9]{16}$/;

/** A known source UUID takes precedence; legacy items without one use canonical ID. */
export function sameLibrarySource(item, {uuid=null,canonicalId=null}={}) {
  const origin=item?.system?.origin?.uuid;
  if (uuid && origin) return uuid===origin;
  return !!canonicalId && item?.system?.canonicalId===canonicalId;
}

/** Prefer explicit user overrides, then translated fields, then the stored name. */
export function libraryEntryName(entry, language='en') {
  const system = entry?.system ?? {};
  const lang = language.toLowerCase().startsWith('ru') ? 'ru' : 'en';
  const override=text(system.overrides?.name), ru=text(system.content?.ru?.name), en=text(system.content?.en?.name);
  if(override)return override;
  if(lang==='ru'&&ru&&en&&ru!==en)return `${ru} / ${en}`;
  return (lang==='ru'?ru||en:en||ru) || text(entry?.name);
}

/** Recheck permissions and existence on each action, including after queue waits. */
function canReadActorSource(actor,{packs,worldActors,scenes,user}={}){
  if(actor.pack){const pack=Array.from(packs??[]).find(p=>p.collection===actor.pack);return !!pack?.visible&&typeof pack.getUuid==='function'&&pack.getUuid(actor.id)===actor.uuid;}
  if(typeof actor.testUserPermission!=='function'||!actor.testUserPermission(user,'OBSERVER'))return false;
  if(actor.isToken){const token=actor.token,scene=token?.parent;return !!scene&&scenes?.get(scene.id)===scene&&scene.tokens?.get(token.id)===token&&token.actor?.uuid===actor.uuid;}
  return worldActors?.get(actor.id)===actor;
}

export function canReadItemSource(item,{packs,worldItems,worldActors,scenes,user}={}) {
  if(!item||item.documentName!=='Item'||!ITEM_TYPES.has(item.type)||item.system?.archived)return false;
  if(item.parent)return item.parent.documentName==='Actor'&&item.parent.items?.get(item.id)===item&&canReadActorSource(item.parent,{packs,worldActors,scenes,user});
  if(item.pack){const pack=Array.from(packs??[]).find(p=>p.collection===item.pack);return !!pack?.visible&&typeof pack.getUuid==='function'&&pack.getUuid(item.id)===item.uuid;}
  if(typeof item.testUserPermission!=='function'||!item.testUserPermission(user,'OBSERVER'))return false;
  return worldItems?.get(item.id)===item&&item.uuid===`Item.${item.id}`;
}

export function canReadEffectSource(effect,{packs,worldItems,worldActors,scenes,user}={}) {
  const parent=effect?.parent;
  if(!parent||parent.effects?.get(effect.id)!==effect)return false;
  if(parent.documentName==='Item')return canReadItemSource(parent,{packs,worldItems,worldActors,scenes,user});
  if(parent.documentName!=='Actor')return false;
  return canReadActorSource(parent,{packs,worldActors,scenes,user});
}

/** World Items are independent source documents, never embedded actor copies. */
export function searchWorldItems(items,{user,types=null,query='',language='en',label='World Items'}={}) {
  const wanted=types?new Set(types):null,entries=[],needle=normalizeSearch(query);
  for(const item of items??[]){
    if(item.parent||!idPattern.test(text(item.id))||!ITEM_TYPES.has(item.type)||(wanted&&!wanted.has(item.type))||item.system?.archived)continue;
    if(typeof item.testUserPermission!=='function'||!item.testUserPermission(user,'OBSERVER')||item.uuid!==`Item.${item.id}`)continue;
    if(!matchesSearch(item,needle))continue;
    const row={...item.toObject(),_id:item.id,uuid:item.uuid,documentName:'Item',sourceKind:'world',packLabel:label};
    entries.push({...row,displayName:libraryEntryName(row,language)});
  }
  return entries;
}

const normalizeSearch=query=>text(query).trim().toLocaleLowerCase();
function matchesSearch(entry, needle) {
  if (!needle) return true;
  const fields=[entry.name,entry.system?.canonicalId,entry.system?.groupId];
  for (const lang of ['ru','en']) {
    const content=entry.system?.content?.[lang] ?? {};
    fields.push(content.name,content.description,content.text,content.flavor);
    if (Array.isArray(content.aliases)) fields.push(...content.aliases);
    if (Array.isArray(content.tags)) fields.push(...content.tags);
    else fields.push(content.tags);
    if (Array.isArray(content.levels)) for (const level of content.levels) fields.push(level?.name,level?.text);
  }
  fields.push(entry.system?.overrides?.name,entry.system?.overrides?.description);
  return fields.some(value => text(value).toLocaleLowerCase().includes(needle));
}

/**
 * Search available visible packs. Each row records an opaque Foundry UUID and
 * the owning pack, not merely a document ID (IDs can collide across packs).
 * Individual pack failures are returned to the caller; a partial result must
 * not be represented as a complete search.
 */
export async function searchLibraryPacks(packs, {types=null, query='', language='en', catalogPacks=null}={}) {
  const wanted=types ? new Set(types) : null;
  const needle=normalizeSearch(query);
  const eligible=Array.from(packs).filter(pack=>{
    if(pack?.visible!==true||typeof pack.getIndex!=='function'||typeof pack.getUuid!=='function')return false;
    const documentName=pack.documentName??pack.metadata?.type;
    const accepted=documentName==='Item'?ITEM_TYPES:documentName==='Actor'?ACTOR_TYPES:null;
    if(!accepted)return false;
    if(!wanted)return true;
    if(![...wanted].some(type=>accepted.has(type)))return false;
    const entries=catalogPacks?.get(pack.collection);
    return !entries||Array.from(entries.values()).some(entry=>wanted.has(entry.type));
  });
  const results=await Promise.allSettled(eligible.map(async pack => {
    const documentName=pack.documentName ?? pack.metadata.type;
    const accepted=documentName === 'Item' ? ITEM_TYPES : ACTOR_TYPES;
    const index=await pack.getIndex({fields:[...INDEX_FIELDS]});
    // Visibility may have changed while awaiting the server.
    if (!pack.visible) return [];
    return Array.from(index).filter(entry => idPattern.test(text(entry?._id))
      && accepted.has(entry.type) && (!wanted || wanted.has(entry.type)) && matchesSearch(entry,needle))
      .map(entry => ({
        ...entry, uuid:pack.getUuid(entry._id), documentName,
        packCollection:pack.collection, packLabel:libraryPackLabel(pack.title ?? pack.metadata?.label,language),
        displayName:libraryEntryName(entry,language)
      }));
  }));
  const entries=[], failures=[];
  for (let index=0;index<results.length;index++) {
    const result=results[index], pack=eligible[index];
    if (result.status==='fulfilled') entries.push(...result.value);
    else if(pack.visible) failures.push({packCollection:pack.collection,packLabel:libraryPackLabel(pack.title ?? pack.metadata?.label,language)});
  }
  entries.sort((a,b) => a.displayName.localeCompare(b.displayName,language)
    || a.uuid.localeCompare(b.uuid));
  return {entries,failures};
}

/**
 * Re-check the live pack's visibility and the actual document's class/type.
 * Pass only a row returned by searchLibraryPacks, never a raw drop payload.
 */
export async function resolveLibraryEntry(packs, row,{worldItems,user}={}) {
  if (!row || !idPattern.test(text(row._id))) return null;
  if(row.sourceKind==='world'){
    const item=worldItems?.get(row._id);
    return canReadItemSource(item,{packs,worldItems,user})&&item.uuid===row.uuid&&item.type===row.type?item:null;
  }
  const pack=Array.from(packs).find(p => p?.collection===row.packCollection);
  if (!pack?.visible || typeof pack.getUuid!=='function' || typeof pack.getDocument!=='function') return null;
  const documentName=pack.documentName ?? pack.metadata?.type;
  if (!['Item','Actor'].includes(documentName) || documentName!==row.documentName
      || pack.getUuid(row._id)!==row.uuid) return null;
  const document=await pack.getDocument(row._id);
  if (!pack.visible || !document || document.documentName!==documentName || document.uuid!==row.uuid) return null;
  if (!(documentName==='Item'?ITEM_TYPES:ACTOR_TYPES).has(document.type) || document.type!==row.type) return null;
  return document;
}
