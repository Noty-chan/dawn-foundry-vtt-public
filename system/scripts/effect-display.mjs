/** Localize a canonical effect while preserving a deliberate personal rename. */
export function effectDisplayName(effect, entries, language='en') {
  const canonicalId=effect?.getFlag?.('dawn','canonicalId');
  const entry=entries.find(e=>e.type==='effect'&&e.system?.canonicalId===canonicalId);
  if(!entry)return effect?.name??'';
  const en=entry.system.content?.en?.name,ru=entry.system.content?.ru?.name;
  if(effect.name&&effect.name!==en&&effect.name!==ru)return effect.name;
  return (language.startsWith('ru')?ru:en)??effect.name??'';
}

/** Canonical reminder; custom effect descriptions are never replaced with guessed rules. */
export function effectDisplayDescription(effect, entries, language='en') {
  const canonicalId=effect?.getFlag?.('dawn','canonicalId');
  const entry=entries.find(e=>e.type==='effect'&&e.system?.canonicalId===canonicalId);
  if(!entry)return '';
  const lang=language.startsWith('ru')?'ru':'en';
  return entry.system.content?.[lang]?.description??entry.system.content?.[lang]?.text??entry.system.content?.en?.description??entry.system.content?.en?.text??'';
}
