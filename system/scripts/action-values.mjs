/** Annotate only known book placeholders; unknown and roll-dependent terms remain formulas. */
export function actionValues(text,system,tension,lang){
  const a=system?.attributes??{},isValue=v=>Number.isSafeInteger(v)&&v>=0;
  const values=lang==='ru'?{
    'Тело':a.body,'Талант':a.talent,'Дух':a.spirit,'Разум':a.mind,'Скорость':system?.speed,'Ступень':system?.tier,'Напряжение':tension,
    'Талант / 2':isValue(a.talent)?Math.ceil(a.talent/2):null,'Разум / 2':isValue(a.mind)?Math.ceil(a.mind/2):null
  }:{
    'Body':a.body,'Talent':a.talent,'Spirit':a.spirit,'Mind':a.mind,'Speed':system?.speed,'Tier':system?.tier,'Tension':tension,
    'Talent / 2':isValue(a.talent)?Math.ceil(a.talent/2):null,'Mind / 2':isValue(a.mind)?Math.ceil(a.mind/2):null
  };
  return String(text??'').replace(/\[([^\[\]]+)\]/g,(match,key)=>{
    if(isValue(values[key]))return `[${key}: ${values[key]}]`;
    // Book NPC actions often use [Tier × 2] or [Tension × 2]. Only
    // multiply known integer values, never evaluate arbitrary source text.
    const product=/^(.*?)\s*[×x*]\s*(\d+)$/.exec(key);
    if(!product||!isValue(values[product[1]]))return match;
    const result=values[product[1]]*Number(product[2]);
    return isValue(result)?`[${key}: ${result}]`:match;
  });
}

/** Tension belongs to a particular active combat and is not assumed outside it. */
export function actorCombatTension(actor,combat,party){
  if(!combat?.started||!combat.combatants?.some(c=>c.actor?.uuid===actor.uuid))return null;
  const context=party?.system?.storyContexts?.[combat.getFlag('dawn','storyContextId')];
  return context?.linkedCombatUuid===combat.uuid&&Number.isSafeInteger(context.tension)&&context.tension>=0?context.tension:null;
}
