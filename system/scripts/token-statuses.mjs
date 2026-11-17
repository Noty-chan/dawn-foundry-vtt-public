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

export function tokenStatusConfigs(entries,language){
  return entries.flatMap(entry=>{
    if(entry.type!=='effect')return [];
    const canonicalId=entry.system.canonicalId,definition=definitions[canonicalId];
    if(!definition)return [];
    const [id,icon]=definition;
    return [{
      id:`dawn-${id}`,
      name:entry.system.content[language]?.name??entry.name,
      img:`icons/svg/${icon}.svg`,
      flags:{dawn:{canonicalId,manual:true}}
    }];
  });
}
