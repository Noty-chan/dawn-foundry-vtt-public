import {turnAnchorMatches} from './turn-state.mjs';

// Serialise same-client applications for an Actor to avoid duplicate documents.
// Cross-client concurrency still requires the designated executor; this is not a lock.
const queues=new WeakMap();
const uncertain=cause=>Object.assign(new Error('effectWriteUncertain',{cause}),{code:'DAWN_EFFECT_WRITE_UNCERTAIN'});
/** Translate only our known write error; do not mask unrelated exceptions. */
export function effectErrorMessage(error,label){return error?.code==='DAWN_EFFECT_WRITE_UNCERTAIN'?label('effectWriteUncertain'):error?.message==='fodderControllerNotTarget'?label('fodderControllerNotTarget'):error?.message??String(error);}

/** Apply a library template to one Actor. Duration and complex consequences are manual. */
export async function applyEffectTemplate(actor, template, options={}) {
  if (!actor || typeof actor !== 'object') throw Error('Invalid effect target or template');
  const previous=queues.get(actor)??Promise.resolve();
  const pending=previous.catch(()=>{}).then(()=>applyNow(actor,template,options));
  queues.set(actor,pending);
  try{return await pending;}finally{if(queues.get(actor)===pending)queues.delete(actor);}
}

async function applyNow(actor, template, {sourceUuid, canonicalId, name=null, combat=null, turnId=null, applierUuid=null, canApply=null}={}) {
  if(actor?.isToken&&actor.token?.getFlag?.('dawn','fodderController'))throw Error('fodderControllerNotTarget');
  if (!actor?.isOwner || !template || !canonicalId || !sourceUuid) throw Error('Invalid effect target or template');
  if(canApply&&!canApply())throw Error('Effect source is no longer available');
  // round/turn are presentation only. Never manufacture a stable turn ID from them.
  const currentId=combat?.getFlag?.('dawn','turnId'),timeline=combat?.getFlag?.('dawn','timelineId');
  const trusted=!!(combat?.started&&turnAnchorMatches(combat)&&!combat.getFlag('dawn','transition')&&typeof timeline==='string'&&timeline&&(turnId==null||turnId===currentId));
  const context = combat ? {uuid:combat.uuid,combatUuid:combat.uuid,round:combat.round,turn:combat.turn,turnId:trusted?currentId:null,timelineId:trusted?timeline:null,applierUuid:applierUuid??null} : null;
  const existing = actor.effects.find(effect => !effect.disabled && effect.getFlag('dawn','canonicalId')===canonicalId && effect.origin===sourceUuid);
  if (existing) {
    const previousApplied=existing.getFlag('dawn','applied');
    const changes={'flags.dawn.applied':context};
    if(!trusted||previousApplied?.timelineId!==timeline||previousApplied?.combatUuid!==combat.uuid)changes['flags.dawn.autoDuration']=false;
    // Foundry may return no document for an unchanged update. Identical
    // reapplication in the same context is already confirmed, not a failed write.
    if(JSON.stringify(previousApplied)===JSON.stringify(context)&&(!('flags.dawn.autoDuration' in changes)||existing.getFlag('dawn','autoDuration')===false))return existing;
    try{
      const updated=await existing.update(changes);
      if(!updated||JSON.stringify(existing.getFlag('dawn','applied'))!==JSON.stringify(context)||(changes['flags.dawn.autoDuration']===false&&existing.getFlag('dawn','autoDuration')!==false))throw Error('Unconfirmed effect update');
      return updated;
    }catch(cause){throw uncertain(cause);}
  }
  const data=template.toObject();
  delete data._id;
  data.disabled=false;
  data.transfer=false;
  data.origin=sourceUuid;
  if (name) data.name=name;
  data.flags={...(data.flags??{}),dawn:{...(data.flags?.dawn??{}),canonicalId,applied:context,manual:true}};
  try{
    const created=await actor.createEmbeddedDocuments('ActiveEffect',[data]);
    if(!created?.[0]||created[0].origin!==sourceUuid||created[0].getFlag?.('dawn','canonicalId')!==canonicalId||JSON.stringify(created[0].getFlag?.('dawn','applied'))!==JSON.stringify(context))throw Error('Unconfirmed effect creation');
    return created[0];
  }catch(cause){throw uncertain(cause);}
}
