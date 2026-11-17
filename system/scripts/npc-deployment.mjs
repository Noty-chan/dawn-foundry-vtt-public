import {npcStatistics, integer} from './rules.mjs';
import {applyEffectTemplate} from './effect-application.mjs';
import {placeInDiscard} from './board.mjs';
import {controllerReservePosition,createFodderController} from './fodder-controller.mjs';

/** Facts verified in LionWing: these profiles require an initial effect after deployment. */
export const INITIAL_EFFECTS=Object.freeze({
  'lionwing.npc.assassin':'positive.исчез',
  'lionwing.npc.oni':'positive.усилен'
});
export const MULTI_ZONE_PROFILES=Object.freeze(['lionwing.npc.bodyguards','lionwing.npc.swarm']);

/** Create fresh, independent data; no writes and no derived resource reset outside creation. */
export function prepareNPCData(entry,{tier,deploymentId,name}){
  if(entry?.type!=='npc'||!entry.system?.canonicalId?.startsWith('lionwing.npc.'))throw Error('Invalid NPC profile');
  integer(tier,{min:0,max:6});
  if(typeof deploymentId!=='string'||!deploymentId)throw Error('Missing deployment ID');
  const data=typeof entry.toObject==='function'?entry.toObject():structuredClone(entry);
  delete data._id;delete data.folder;
  for(const item of data.items??[])delete item._id;
  data.name=name||data.name;data.prototypeToken??={};data.prototypeToken.name=data.name;data.prototypeToken.actorLink=false;
  data.system.tier=tier;
  data.system.deployment={...data.system.deployment,id:deploymentId,status:'created'};
  const stats=npcStatistics(data.system);
  data.system.health={...(data.system.health??{}),value:stats.health};
  data.system.evasion={...(data.system.evasion??{}),value:stats.evasion};
  return data;
}

/** Match only our canonical enemy pack, leaving ordinary Actor drops to Foundry. */
export function droppedNPCEntry(data,entries){
  if(data?.type!=='Actor'||typeof data.uuid!=='string')return null;
  const match=/^Compendium\.dawn\.npc\.Actor\.([A-Za-z0-9]{16})$/.exec(data.uuid);
  return match?entries.find(e=>e.type==='npc'&&e._id===match[1])??null:null;
}

/** Existing world Actors created from our presets keep their edits; they are not cloned. */
export function droppedWorldNPC(data,actors,entries){
  if(data?.type!=='Actor'||typeof data.uuid!=='string')return null;
  const match=/^Actor\.([A-Za-z0-9]{16})$/.exec(data.uuid);
  if(!match)return null;
  const actor=actors.get(match[1]),deployment=actor?.system?.deployment,canonicalId=actor?.system?.canonicalId;
  if(actor?.type!=='npc'||!deployment?.id||deployment.profile!==canonicalId||!canonicalId?.startsWith('lionwing.npc.'))return null;
  const entry=entries.find(e=>e.type==='npc'&&e.system?.canonicalId===canonicalId);
  return entry?{actor,entry}:null;
}

/**
 * A scene deployment owns its independent world Actor and unlinked token.
 * Once a token exists, failures are persisted as recovery-required; never retry blindly.
 */
export async function deployNPC(entry,{scene,event,data,createNPC,lookupEffect,notify,existingActor=null,newId=()=>foundry.utils.randomID()}){
  if(!game.user.isGM||!game.user.can('TOKEN_CREATE'))throw Error('NPC deployment requires GM and TOKEN_CREATE');
  if(!scene||canvas.scene!==scene||!canvas.dimensions?.rect?.contains(data.x,data.y))throw Error('Invalid deployment position');
  if(MULTI_ZONE_PROFILES.includes(entry.system.canonicalId)){
    if(canvas.scene!==scene)throw Error('fodderControllerUnsupportedBoard');
    controllerReservePosition(scene); // refuse before creating a new Actor
    let actor=existingActor;
    if(!actor){try{actor=await createNPC(entry);}catch(cause){throw new Error('fodderControllerUnconfirmed',{cause});}}
    if(!actor)return null;
    try{
      const token=await createFodderController({scene,actor,user:game.user,controllerName:game.i18n.localize('DAWN.fodderControllerName'),newId});
      notify('fodderControllerCreated');return token;
    }catch(cause){
      // Actor creation was already requested; preserve it and require inspection.
      if(!existingActor&&cause.message!=='fodderControllerUnconfirmed'){
        const error=new Error('fodderControllerUnconfirmed',{cause});error.controllerId=cause.controllerId;throw error;
      }
      throw cause;
    }
  }
  const actor=existingActor??await createNPC(entry);
  if(!actor)return null; // dialog cancellation: no token or deployment
  if(!actor.isOwner)throw Error('NPC Actor ownership required');
  // A world Actor can be dropped many times: each unlinked token has its own deployment identity.
  const deploymentId=existingActor?newId():actor.system.deployment.id;
  if(!deploymentId)throw Error('Missing deployment ID');
  let token=null;
  try{
    const checkContext=()=>{if(canvas.scene!==scene||!game.user.isGM||!game.user.can('TOKEN_CREATE')||!actor.isOwner)throw Error('NPC deployment context changed');};
    checkContext();
    const prototype=await actor.getTokenDocument({hidden:!!event?.altKey},{parent:scene});
    checkContext();
    const position=CONFIG.Token.objectClass._getDropActorPosition(prototype,{x:data.x,y:data.y,elevation:data.elevation},{snap:!event?.shiftKey});
    prototype.updateSource(position);
    const tokenData=prototype.toObject();
    tokenData.actorLink=false;
    // An unlinked ActorDelta otherwise inherits unchanged resource fields from the world Actor.
    // Snapshot current values explicitly; spawning must neither heal nor later share resource changes.
    tokenData.delta??={};tokenData.delta.system={...(tokenData.delta.system??{}),
      health:{value:actor.system.health.value},evasion:{value:actor.system.evasion.value},aceUsed:actor.system.aceUsed??false};
    tokenData.flags??={};tokenData.flags.dawn={...(tokenData.flags.dawn??{}),deployment:{id:deploymentId,status:'initializing',profile:entry.system.canonicalId}};
    if(entry.system.canonicalId==='lionwing.npc.assassin'){
      tokenData.flags.dawn.presence='disappeared';
      tokenData.flags.dawn.lastPosition={x:position.x,y:position.y};
    }
    [token]=await scene.createEmbeddedDocuments('Token',[tokenData]);
    if(!token?.actor)throw Error('Created token has no Actor');
    const effectId=INITIAL_EFFECTS[entry.system.canonicalId];
    if(effectId){
      const effect=await lookupEffect(effectId);
      if(!effect?.item||!effect.template)throw Error('Missing initial effect template');
      await applyEffectTemplate(token.actor,effect.template,{sourceUuid:effect.item.uuid,canonicalId:effectId,name:effect.name});
    }
    // Prevent the generic initialisation action from healing an already deployed token later.
    if(!await token.actor.update({'system.deployment.status':'initialized'})||token.actor.system?.deployment?.status!=='initialized')throw Error('NPC initialization unconfirmed');
    let status='ready';
    if(entry.system.canonicalId==='lionwing.npc.assassin'){
      try{await placeInDiscard(scene,token);}
      catch(error){if(!['boardChanged','boardTokenSize','boardDiscardFull'].includes(error.message))throw error;status='manual-placement';}
    }
    if(!await token.update({'flags.dawn.deployment.status':status}))throw Error('Unconfirmed deployment status');
    if(status==='manual-placement')notify('assassinManualPlacement');
    if(entry.system.canonicalId==='lionwing.npc.cannoneer')notify('cannoneerManualClock');
    return token;
  }catch(error){
    // A timeout/failure may still have persisted data: leave all objects intact for inspection.
    if(token)await token.update({'flags.dawn.deployment.status':'recovery-required'}).catch(()=>{});
    else if(!existingActor)await actor.update({'system.deployment.status':'recovery-required'}).catch(()=>{});
    throw error;
  }
}
