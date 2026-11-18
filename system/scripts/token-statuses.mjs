const definitions={
  'positive.изгнан': ['banished','sleep'],
  'positive.ускорен': ['hastened','wingfoot'],
  'positive.исчез': ['disappeared','blind'],
  'positive.невидим': ['invisible','invisible'],
  'positive.регенерирует': ['regenerating','regen'],
  'positive.укреплен': ['reinforced','shield'],
  'positive.устойчив': ['steadied','statue'],
  'positive.усилен': ['strengthened','upgrade'],
  'negative.порчен': ['blighted','blood'],
  'negative.ошеломлен': ['dazed','daze'],
  'negative.испуган': ['feared','terror'],
  'negative.обездвижен': ['immobilized','cancel'],
  'negative.подброшен': ['launched','falling'],
  'negative.помечен': ['marked','target'],
  'negative.замедлен': ['slowed','stoned'],
  'negative.разорван': ['shredded','hazard'],
  'negative.пойман': ['snared','trap'],
  'negative.спровоцирован': ['taunted','combat'],
  'negative.ослаблен': ['weakened','downgrade']
};

/** Effect Listing, LionWing PDF p. 61 (printed p. 60). Older editions share IDs. */
export function isLionWingEffect(entry){
  const source=entry?.system?.content?.en?.source;
  return entry?.type==='effect'&&Object.hasOwn(definitions,entry.system?.canonicalId)&&
    source?.editionId==='dawn-en-lionwing-cb2f8e67'&&source.locale==='en'&&source.pdfPage===61;
}

export function tokenStatusConfigs(entries,language){
  return entries.flatMap(entry=>{
    if(!isLionWingEffect(entry))return [];
    const canonicalId=entry.system.canonicalId,[id,icon]=definitions[canonicalId];
    return [{
      id:`dawn-${id}`,
      name:entry.system.content[language]?.name??entry.name,
      img:`icons/svg/${icon}.svg`,
      flags:{dawn:{canonicalId,manual:true}}
    }];
  });
}
