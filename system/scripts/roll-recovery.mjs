const prefix=(world,user)=>`dawn.pending-roll.${encodeURIComponent(world)}.${encodeURIComponent(user)}.`;
const memory=new Map();
const flights=new Map();
const memoryKey=(world,user,actorUuid,rollId)=>JSON.stringify([world,user,actorUuid,rollId]);
export function rememberPendingRoll(world,user,actorUuid,draft,stored){memory.set(memoryKey(world,user,actorUuid,draft.rollId),{world,user,actorUuid,draft,stored});}
export function recallPendingRoll(world,user,actorUuid,rollId=null){return [...memory.values()].find(entry=>entry.world===world&&entry.user===user&&entry.actorUuid===actorUuid&&(!rollId||entry.draft.rollId===rollId))??null;}
export function forgetPendingRoll(world,user,actorUuid,rollId){memory.delete(memoryKey(world,user,actorUuid,rollId));}
const flightKey=(world,user,actorUuid)=>JSON.stringify([world,user,actorUuid]);
export function startRollFlight(world,user,actorUuid,rollId){const key=flightKey(world,user,actorUuid);if(flights.has(key))return false;flights.set(key,rollId);return true;}
export function hasRollFlight(world,user,actorUuid){return flights.has(flightKey(world,user,actorUuid));}
export function finishRollFlight(world,user,actorUuid,rollId){const key=flightKey(world,user,actorUuid);if(flights.get(key)===rollId)flights.delete(key);}
function damaged(){const error=Error('A saved roll recovery record is damaged; manual reconciliation is required');error.code='DAWN_ROLL_RECOVERY_DAMAGED';return error;}
function validDraft(draft){
  if(!draft||typeof draft.rollId!=='string'||!/^[A-Za-z0-9]{1,128}$/.test(draft.rollId)||typeof draft.actorUuid!=='string'||!draft.actorUuid) return false;
  if(!['publicroll','gmroll','blindroll','selfroll'].includes(draft.rollMode)) return false;
  if(draft.state==='generating')return !draft.result;
  const result=draft.result;
  return draft.state==='sending-unknown'&&Array.isArray(result?.dice)&&result.dice.every(d=>Number.isInteger(d.face)&&d.face>=1&&d.face<=6)
    &&Number.isSafeInteger(result.hits)&&result.hits>=0&&Number.isSafeInteger(result.crits)&&result.crits>=0;
}

export function savePendingRoll(storage,world,user,draft) {
  if (!storage) throw Error('Roll recovery storage is unavailable');
  if (!validDraft(draft)) throw damaged();
  storage.setItem(prefix(world,user)+draft.rollId,JSON.stringify(draft));
}

export function removePendingRoll(storage,world,user,rollId) {
  storage.removeItem(prefix(world,user)+rollId);
}

export function readPendingRoll(storage,world,user,rollId){
  const key=prefix(world,user)+rollId,raw=storage.getItem(key);
  if(raw===null)return null;
  let draft;try{draft=JSON.parse(raw);}catch{throw damaged();}
  if(!validDraft(draft)||draft.rollId!==rollId)throw damaged();
  return draft;
}

export function findPendingRoll(storage,world,user,actorUuid) {
  if (!storage) throw Error('Roll recovery storage is unavailable');
  const head=prefix(world,user);
  for (let i=0;i<storage.length;i++) {
    const key=storage.key(i);
    if (!key?.startsWith(head)) continue;
    let draft;
    try {draft=JSON.parse(storage.getItem(key));}
    catch {throw damaged();}
    if (!validDraft(draft) || key!==head+draft.rollId) throw damaged();
    if (draft.actorUuid===actorUuid) return draft;
  }
  return null;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value==='object') return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])]));
  return value;
}
export function findPublishedRoll(messages,draft,userId) {
  const found=Array.from(messages).filter(message=>message.author?.id===userId && message.getFlag('dawn','rollId')===draft.rollId);
  if (!found.length) return 'missing';
  if (found.length!==1 || JSON.stringify(stable(found[0].getFlag('dawn','result')))!==JSON.stringify(stable(draft.result))) return 'conflict';
  if(draft.publication){
    const expected=draft.publication.visibility,actual=found[0];
    if(!expected||!Array.isArray(actual.whisper)||actual.blind!==expected.blind||JSON.stringify([...actual.whisper].sort())!==JSON.stringify([...expected.whisper].sort()))return 'conflict';
  }
  return 'match';
}

/** Old drafts remain readable, but only a complete audience snapshot may be resent. */
export function canRepublishRoll(draft,userId,users) {
  const snapshot=draft?.publication,visibility=snapshot?.visibility,recipients=visibility?.whisper;
  if(draft?.state!=='sending-unknown'||!draft.result||typeof draft.content!=='string'||draft.content.includes('[[')||!snapshot?.speaker||snapshot.authorId!==userId)return false;
  if(!Array.isArray(recipients)||!recipients.every(id=>typeof id==='string'&&id)||typeof visibility.blind!=='boolean')return false;
  if(!draft.result.dice.every(d=>typeof d.nativeRoll==='string'))return false;
  if(draft.rollMode==='publicroll')return !visibility.blind&&recipients.length===0;
  if(draft.rollMode==='selfroll')return !visibility.blind&&recipients.length===1&&recipients[0]===userId;
  if(!['gmroll','blindroll'].includes(draft.rollMode)||visibility.blind!==(draft.rollMode==='blindroll')||!recipients.length)return false;
  return recipients.every(id=>users?.get(id)?.isGM===true);
}
