import {isSupportedBoard} from './board.mjs';

const queues=new WeakMap();
/** Controller area is a service space on the prepared scene, not game geometry. */
export function controllerReservePosition(scene){
 if(!isSupportedBoard(scene))throw Error('fodderControllerUnsupportedBoard');
 for(const token of scene.tokens){
  if(!Number.isFinite(token.x)||!Number.isFinite(token.y)||!Number.isFinite(token.width)||!Number.isFinite(token.height)||token.width<=0||token.height<=0)throw Error('fodderControllerReserveInvalid');
 }
 for(let y=800;y<1100;y+=100)for(let x=1900;x<2400;x+=100){
  const occupied=Array.from(scene.tokens).some(t=>x<t.x+t.width*100&&x+100>t.x&&y<t.y+t.height*100&&y+100>t.y);
  if(!occupied)return {x,y};
 }
 throw Error('fodderControllerReserveFull');
}

/** Prepared placement only. Creates no actor, deletes nothing, never retries an uncertain write. */
export async function createFodderController({scene,actor,user,controllerName,currentScene=()=>canvas.scene,newId=()=>foundry.utils.randomID()}){
 if(!scene||!actor)throw Error('fodderControllerInvalid');
 const previous=queues.get(scene)??Promise.resolve();
 const operation=previous.catch(()=>{}).then(async()=>{
  if(!user?.isGM||user.can?.('TOKEN_CREATE')===false||!scene.isOwner||!actor.isOwner||actor.type!=='npc'||!actor.id||!['lionwing.npc.swarm','lionwing.npc.bodyguards'].includes(actor.system?.canonicalId)||actor.system?.deployment?.requiresManual!==true||actor.system?.deployment?.profile!==actor.system.canonicalId)throw Error('fodderControllerInvalid');
  if(currentScene()!==scene)throw Error('fodderControllerUnsupportedBoard');
  let position=controllerReservePosition(scene);
  const id=newId();if(typeof id!=='string'||!id)throw Error('fodderControllerInvalid');
  const prototype=await actor.getTokenDocument({},{parent:scene});if(!prototype)throw Error('fodderControllerInvalid');
  if(!user.isGM||user.can?.('TOKEN_CREATE')===false||!scene.isOwner||!actor.isOwner)throw Error('fodderControllerInvalid');
  if(currentScene()!==scene)throw Error('fodderControllerUnsupportedBoard');
  position=controllerReservePosition(scene);
  const data=prototype.toObject();delete data._id;data.x=position.x;data.y=position.y;data.width=1;data.height=1;data.hidden=true;data.actorLink=false;
  data.name=`${controllerName}: ${actor.name} · ${id.slice(0,6)}`;
  data.delta??={};data.delta.system={...(data.delta.system??{}),health:{value:1},evasion:{value:0},aceUsed:false};
  data.flags??={};data.flags.dawn={...(data.flags.dawn??{}),fodderController:{id,profile:actor.system.canonicalId},deployment:{id,status:'ready',profile:actor.system.canonicalId}};
  let created;
  try{created=await scene.createEmbeddedDocuments('Token',[data]);}
  catch(cause){const error=new Error('fodderControllerUnconfirmed',{cause});error.controllerId=id;throw error;}
  const token=created?.[0],marker=token?.getFlag?.('dawn','fodderController');
  if(created?.length!==1||!token?.id||scene.tokens.get(token.id)!==token||marker?.id!==id||marker?.profile!==actor.system.canonicalId||token.actorId!==actor.id||token.x!==position.x||token.y!==position.y||token.width!==1||token.height!==1||token.hidden!==true||token.actorLink!==false||token.actor?.system?.health?.value!==1||token.actor?.system?.deployment?.requiresManual!==true){const error=Error('fodderControllerUnconfirmed');error.controllerId=id;throw error;}
  return token;
 });
 queues.set(scene,operation);
 try{return await operation;}finally{if(queues.get(scene)===operation)queues.delete(scene);}
}
