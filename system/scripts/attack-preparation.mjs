// A GM explicitly identifies an attack, target and already calculated amount.
// Ordinary rolls are never silently converted to attacks. This helper prepares
// a private record; UI, player response and server privacy checks are separate.
const flights=new Set();
const validId=id=>typeof id==='string'&&/^[A-Za-z0-9]{16}$/.test(id);
export function validateAttackPreparation({source,target,scene,user,isExecutor,amount}){
  if(!user?.isGM||!isExecutor())throw Error('attackPermission');
  if(!source?.uuid||source.visible!==true||source.isContentVisible!==true)throw Error('attackSourceInvalid');
  const result=source.getFlag?.('dawn','result'),rollId=source.getFlag?.('dawn','rollId');
  if(!validId(rollId)||result?.status!=='complete'||result?.request?.context!=='combat'||!Number.isSafeInteger(result.hits)||result.hits<0||!Array.isArray(result.dice)||result.dice.some(d=>!Number.isInteger(d.face)||d.face<1||d.face>6))throw Error('attackSourceInvalid');
  if(!scene||target?.parent!==scene||scene.tokens?.get(target.id)!==target||!validId(target.id)||!target.uuid||target.actor?.type!=='hero'||!target.actor.uuid)throw Error('attackTargetInvalid');
  const recordedTargets=result.request.targets;
  if(recordedTargets?.length&&recordedTargets.every(t=>t?.tokenUuid)&&!recordedTargets.some(t=>t.tokenUuid===target.uuid))throw Error('attackTargetMismatch');
  if(!Number.isSafeInteger(amount)||amount<0)throw Error('attackAmountInvalid');
  return {sourceUuid:source.uuid,rollId,targetId:target.id,tokenUuid:target.uuid,actorUuid:target.actor.uuid,amount};
}
function existing(messages,s){
  return Array.from(messages).some(m=>m.author?.isGM===true&&m.getFlag?.('dawn','attackResolution')?.sourceUuid===s.sourceUuid&&m.getFlag('dawn','attackResolution')?.tokenUuid===s.tokenUuid);
}
export async function prepareAttack({source,target,scene,user,isExecutor,amount,messages,create,randomId}){
  const state=validateAttackPreparation({source,target,scene,user,isExecutor,amount}),key=JSON.stringify([state.sourceUuid,state.tokenUuid]);
  if(flights.has(key))throw Error('attackBusy');
  if(existing(messages,state))throw Error('attackAlreadyPrepared');
  const attackId=randomId();if(!validId(attackId))throw Error('attackInvalid');
  flights.add(key);
  try{
    // Revalidate immediately before the one authoritative write.
    if(JSON.stringify(validateAttackPreparation({source,target,scene,user,isExecutor,amount}))!==JSON.stringify(state)||existing(messages,state))throw Error('attackChanged');
    const payload={...state,attackId,phase:'awaitingReaction'};
    let record;
    try{record=await create({content:'DAWN',whisper:[user.id],blind:false,flags:{dawn:{attackResolution:payload}}});}
    catch(cause){throw new Error('attackPrepareUncertain',{cause});}
    const actual=record?.getFlag?.('dawn','attackResolution');
    if(!record?.id||record.author?.id!==user.id||!Array.isArray(record.whisper)||record.whisper.length!==1||record.whisper[0]!==user.id||record.blind||!actual||Object.keys(payload).some(k=>actual[k]!==payload[k]))throw Error('attackPrepareUncertain');
    return record;
  }finally{flights.delete(key);}
}
