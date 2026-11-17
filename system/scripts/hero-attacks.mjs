// LionWing pp. 62–63: these two basic attacks use Hits as their base damage.
// This preview deliberately does not apply modifiers, pay AP, or resolve a hit.
const attacks={
  'action.атаки.заклинание':{attributes:['spirit'],description:'Choose a target within 5 range. Roll Spirit. Reward: Deal [Hits] damage.'},
  'action.атаки.стычка':{attributes:['body','talent'],description:'Choose up to 2 adjacent targets. Roll Body or Talent. Reward: Deal [Hits] damage.'},
  'action.атаки.завершение':{attributes:['body','talent','spirit','mind'],cost:2,description:'Choose an adjacent target, spend up to [Tension] Focus, and roll any Attribute at that much Advantage. Reward: Deal [Hits] + [Tension] damage.'}
};

export function heroAttackDefinition(entry){
  const id=entry?.system?.canonicalId,definition=attacks[id];
  if(!definition||entry.type!=='action'||entry.system?.mechanics?.kind!=='action'||entry.system?.mechanics?.cost?.resource!=='ap'||entry.system.mechanics.cost.amount!==(definition.cost??1)||entry.system.content?.en?.description!==definition.description)return null;
  return {id,attributes:[...definition.attributes]};
}

export function heroAttackSnapshot(entry,attribute){
  const definition=heroAttackDefinition(entry);
  if(!definition?.attributes.includes(attribute))throw Error('heroAttackInvalid');
  return {id:definition.id,attribute};
}

export function heroAttackBaseDamage(request,hits){
  const source=request?.heroAttack,definition=attacks[source?.id];
  if(request?.context!=='combat'||request?.kind!=='normal'||!definition?.attributes.includes(source?.attribute)||!Number.isSafeInteger(hits)||hits<0)return null;
  if(!Array.isArray(request.sources)||!request.sources.some(s=>s.kind==='base'&&s.id===source.attribute))return null;
  if(source.id==='action.атаки.завершение'){
    const {tension,focus}=source;
    if(!Number.isSafeInteger(tension)||tension<0||!Number.isSafeInteger(focus)||focus<0||focus>tension||!request.sources.some(s=>s.kind==='advantage'&&s.id==='finisher-focus'&&s.count===focus))return null;
    return Number.isSafeInteger(hits+tension)?hits+tension:null;
  }
  return hits;
}
