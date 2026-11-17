import {attackDamage,integer} from './rules.mjs';

const affects=new Set(['negative.разорван','negative.обездвижен','negative.пойман']);
const inFlight=new WeakSet();

/** Capture only data that affects this damage calculation. */
export function damageSnapshot(actor) {
  if(!actor?.uuid||!['hero','npc'].includes(actor.type))throw Error('damageUnsupported');
  const system=actor.system;
  if(actor.type==='npc'&&(system.kind==='compound'||system.deployment?.requiresManual||system.relations?.parts?.length))throw Error('damageUnsupported');
  const states=[...new Set(Array.from(actor.allApplicableEffects?.()??actor.effects??[])
    .filter(e=>!e.disabled&&!e.isSuppressed)
    .map(e=>e.flags?.dawn?.canonicalId).filter(id=>affects.has(id)))].sort();
  const snapshot={uuid:actor.uuid,type:actor.type,health:integer(system.health.value),evasion:integer(system.evasion.value),armor:integer(system.armor),states};
  if(actor.type==='hero'){snapshot.healthMax=integer(system.health.max);snapshot.wounds=integer(system.wounds.value);}
  return snapshot;
}

/** The amount already includes all source modifiers and non-Armor reductions. */
export function planDamage(snapshot,{kind,amount,standardWound=false}) {
  if(!['attack','ordinary','unreducible'].includes(kind))throw Error('damageInvalid');
  if(!Number.isSafeInteger(amount)||amount<0)throw Error('damageInvalid');
  if(snapshot.health===0)throw Error('damageAlreadyZero');
  const res=attackDamage({amount,armor:kind==='attack'?snapshot.armor:0,evasion:snapshot.evasion,
    canArmor:kind==='attack'&&!snapshot.states.includes('negative.разорван'),
    canEvasion:!snapshot.states.includes('negative.обездвижен')&&!snapshot.states.includes('negative.пойман'),unreducible:kind==='unreducible'});
  const health=Math.max(0,snapshot.health-res.healthDamage);
  if(snapshot.type==='hero'&&health===0){
    if(standardWound===true&&snapshot.wounds<2&&snapshot.healthMax>0)return {health:snapshot.healthMax,evasion:res.evasion,wounds:snapshot.wounds+1,wound:true,healthDamage:Math.min(snapshot.health,res.healthDamage),absorbed:res.absorbed,fullyEvaded:false,knockout:false};
    const error=Error('damageHeroWoundManual');error.damage={healthDamage:res.healthDamage,absorbed:res.absorbed,evasion:res.evasion};throw error;
  }
  return {health,evasion:res.evasion,healthDamage:Math.min(snapshot.health,res.healthDamage),absorbed:res.absorbed,
    fullyEvaded:kind==='attack'&&res.fullyEvaded,knockout:health===0};
}

/** Never retry a failed update: the caller must reconcile the live document. */
export async function applyDamage({actor,user,isExecutor,snapshot,intent,operationId,armorBonus=0,dedupeKey=null}) {
  if(!user?.isGM||!isExecutor||!actor?.isOwner)throw Error('damagePermission');
  if(!/^[A-Za-z0-9]{16}$/.test(operationId))throw Error('damageInvalid');
  if(dedupeKey!==null&&!/^attack-[A-Za-z0-9]{16}-[A-Za-z0-9]{16}$/.test(dedupeKey))throw Error('damageInvalid');
  if(!Number.isSafeInteger(armorBonus)||armorBonus<0||(armorBonus&&intent?.kind!=='attack'))throw Error('damageInvalid');
  if(inFlight.has(actor))throw Error('damageBusy');
  inFlight.add(actor);
  try {
    if(JSON.stringify(damageSnapshot(actor))!==JSON.stringify(snapshot))throw Error('damageChanged');
    const key=dedupeKey??`${user.id}-${operationId}`;
    if(actor.getFlag('dawn',`damageReceipts.${key}`))throw Error('damageAlreadyApplied');
    const armor=snapshot.armor+armorBonus;
    if(!Number.isSafeInteger(armor))throw Error('damageInvalid');
    const result=planDamage({...snapshot,armor},intent);
    try {
      const saved=await actor.update({'system.health.value':result.health,'system.evasion.value':result.evasion,
        ...(result.wound?{'system.wounds.value':result.wounds}:{}),
        [`flags.dawn.damageReceipts.${key}`]:{operationId,kind:intent.kind,amount:intent.amount,armorBonus,result}});
      const receipt=actor.getFlag('dawn',`damageReceipts.${key}`);
      if(!saved||receipt?.operationId!==operationId||receipt?.kind!==intent.kind||receipt?.amount!==intent.amount||receipt?.armorBonus!==armorBonus||
        JSON.stringify(receipt?.result)!==JSON.stringify(result)||
        actor.system.health.value!==result.health||actor.system.evasion.value!==result.evasion||
        (result.wound&&actor.system.wounds.value!==result.wounds))throw Error('Update not confirmed');
    } catch (cause) {throw new Error('damageWriteUncertain',{cause});}
    return result;
  } finally {inFlight.delete(actor);}
}
