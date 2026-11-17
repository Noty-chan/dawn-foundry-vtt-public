/** Cross-tab locks for a single browser profile, including insecure LAN HTTP.
 * IndexedDB add is atomic. A crashed client deliberately leaves a stale lock:
 * never time it out or repeat an operation whose outcome could be uncertain. */
export function indexedDbLockManager(indexedDB,{database='dawn-operation-locks'}={}){
 if(!indexedDB?.open)return null;
 let opened;
 const db=()=>opened??=new Promise((resolve,reject)=>{
  const request=indexedDB.open(database,1);
  request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('locks'))request.result.createObjectStore('locks');};
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error??Error('attackJournalUnavailable'));
  request.onblocked=()=>reject(Error('attackJournalUnavailable'));
 });
 async function acquire(name){
  const database=await db();
  return new Promise((resolve,reject)=>{
   const tx=database.transaction('locks','readwrite'),request=tx.objectStore('locks').add({created:Date.now()},name);let conflict=false;
   request.onerror=event=>{if(request.error?.name==='ConstraintError'){conflict=true;event.preventDefault();event.stopPropagation();}};
   tx.oncomplete=()=>resolve(!conflict);tx.onabort=()=>reject(tx.error??Error('attackJournalUnavailable'));tx.onerror=()=>{};
  });
 }
 async function release(name){
  const database=await db();return new Promise((resolve,reject)=>{
   const tx=database.transaction('locks','readwrite');tx.objectStore('locks').delete(name);
   tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error??Error('attackJournalUncertain'));tx.onerror=()=>{};
  });
 }
 return {async request(name,options,callback){
  if(typeof name!=='string'||!name||options?.mode!=='exclusive'||options?.ifAvailable!==true||typeof callback!=='function')throw Error('attackInvalid');
  if(!await acquire(name))return callback(null);
  try{return await callback({name,mode:'exclusive'});}finally{await release(name);}
 }};
}
let fallback;
export function reactionLockManager(){
 if(globalThis.navigator?.locks?.request)return globalThis.navigator.locks;
 return fallback??=indexedDbLockManager(globalThis.indexedDB);
}
