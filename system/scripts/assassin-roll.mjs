/** LionWing PDF 75. The user confirms an Attack made while Disappeared. */
export function canAssassinate(actor,context) {
  return actor?.type==='hero' && context==='combat' && Array.from(actor.items??[]).some(item=>
    item.type==='technique' && !item.system?.archived && item.system?.canonicalId==='vagabond.assassin' && item.system?.level>=2);
}
export function assassinateRoll(request,tier,name) {
  if(!Number.isSafeInteger(tier)||tier<1||tier>6)throw Error('Invalid Tier');
  return {...request,sources:[...request.sources,{kind:'advantage',id:'vagabond.assassin.assassinate',name,count:tier}],
    criticalAt:request.criticalAt===null?5:Math.min(request.criticalAt,5),assassinate:true};
}
