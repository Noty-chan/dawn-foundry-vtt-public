import {gadgetRollRank} from './gadgets.mjs';
import {evaluateXD6, integer, quickPool, poolSize} from "./rules.mjs";
import {display} from "./models.mjs";
import {captureTargets,targetsStillPublic,targetText} from "./targets.mjs";
import {npcActionSnapshot,npcActionUnchanged,npcDamagePreview,npcDamageAmount} from './npc-rolls.mjs';
import {actorCombatTension} from './action-values.mjs';
import {techniqueRollSnapshot,techniqueRollUnchanged} from './technique-roll-source.mjs';
import {heroAttackSnapshot,heroAttackBaseDamage} from './hero-attacks.mjs';
import {attackHasHeightDifference} from './board-height.mjs';
import {canAssassinate,assassinateRoll} from "./assassin-roll.mjs";
import {savePendingRoll,removePendingRoll,findPendingRoll,readPendingRoll,findPublishedRoll,canRepublishRoll,rememberPendingRoll,recallPendingRoll,forgetPendingRoll,startRollFlight,hasRollFlight,finishRollFlight} from "./roll-recovery.mjs";
export const label = key => game.i18n.localize(`DAWN.${key}`);
export function escape(value){return foundry.utils.escapeHTML(String(value??""));}
const anonymousTarget=n=>`${label('targetAnonymous')} ${n}`;
function selectedTargetSet(){return captureTargets(game.user.targets,anonymousTarget);}
export function selectedTargets(){return selectedTargetSet().targets;}
async function requireSafeTargets(targets,references){if(!await targetsStillPublic(targets,references,uuid=>fromUuid(uuid),anonymousTarget))throw Error(label('targetsChanged'));}
export function targetsMarkup(targets){return targetText(targets,escape,label('targets'));}
function capturePublication(actor,rollMode){return {authorId:game.user.id,speaker:structuredClone(ChatMessage.getSpeaker({actor})),visibility:structuredClone(ChatMessage.applyRollMode({},rollMode))};}
async function prepareXD6(actor, request, rollId=foundry.utils.randomID(),rollMode=game.settings.get("core","rollMode"),publication=capturePublication(actor,rollMode),targetReferences=[]) {
  if(!actor.isOwner)throw new Error(label("noPermission"));
  const result=await evaluateXD6(request,async()=>{
    const roll=await new Roll("1d6").evaluate();
    return {face:roll.total,nativeRoll:JSON.stringify(roll.toJSON())};
  });
  const candidate=request.context==='combat'&&request.kind==='normal'?npcDamageAmount(request.damagePreview,result.hits):null;
  const heroDamage=heroAttackBaseDamage(request,result.hits);
  const damageText=candidate!==null&&result.status==='complete'?`<p><strong>${escape(label('npcDamagePreview'))}: ${escape(candidate)}</strong> (${escape(result.hits)} + ${escape(request.damagePreview.multiplier)} × ${escape(request.damagePreview.tension)}). ${escape(label('npcDamagePreviewHint'))}${request.damagePreview.conditionalTier!==null?` ${escape(label('npcDamageAssassin'))}: +${escape(request.damagePreview.conditionalTier)}.`:''}</p>`:'';
  const heroDamageText=heroDamage!==null&&result.status==='complete'?`<p><strong>${escape(label('heroAttackBaseDamage'))}: ${heroDamage}</strong> · ${escape(label('heroAttackDamageHint'))}</p>${request.heroAttack?.id==='action.атаки.завершение'?`<p>${escape(label('finisherFocus'))}: ${escape(request.heroAttack.focus)} · ${escape(label('tension'))}: ${escape(request.heroAttack.tension)}. ${escape(label('finisherManualHint'))}</p>`:''}`:'';
  const content=`<div class="dawn-roll"><h3>${escape(display(actor).name)} · ${escape(request.label??label("roll"))}</h3><p>${result.initialPool}d6 · ${request.kind==="quick"?"Quick":"XD6"}</p>${targetsMarkup(request.targets)}${request.heightReminder?`<p>${escape(label('attackHeightReminder'))}</p>`:''}${request.assassinate?`<p>${escape(label("assassinateRoll"))}: +${escape(request.sources.find(source=>source.id==="vagabond.assassin.assassinate")?.count)} ${escape(label("advantage"))}, Crit ${escape(result.profile.criticalAt)}+</p>`:""}<div class="dawn-dice">${result.dice.map(d=>`<span class="dawn-die ${d.face>=result.profile.successAt?"hit":""}" title="${d.origin}">${d.face}</span>`).join("")}</div><p><strong>${result.hits} ${escape(label("hits"))}</strong> · ${result.crits} ${escape(label("crits"))}</p>${damageText}${heroDamageText}${result.outcome?`<p>${escape(label(result.outcome))}</p>`:""}${result.status!=="complete"?`<p>${escape(label("rollPaused"))}</p>`:""}</div>`;
  return {rollId,actorUuid:actor.uuid,result,targetReferences,content:content.replaceAll('[[','&#91;&#91;'),rollMode,publication,publicationAttempt:1,state:'sending-unknown'};
}
async function publishXD6(actor,draft){
  const rolls=draft.result.dice.map(d=>{const data=JSON.parse(d.nativeRoll);if(data.evaluated!==true||data.total!==d.face)throw Error('Saved die is not an evaluated matching Roll');const roll=Roll.fromJSON(d.nativeRoll);if(roll._evaluated!==true||roll.total!==d.face)throw Error('Saved die could not be restored');return roll;});
  return ChatMessage.create({speaker:draft.publication.speaker,content:draft.content,rolls,flags:{dawn:{rollId:draft.rollId,result:draft.result}},whisper:draft.publication.visibility.whisper,blind:draft.publication.visibility.blind});
}
export async function rollXD6(actor,request){
  const draft=await prepareXD6(actor,request);
  await publishXD6(actor,draft);
  return draft.result;
}
const {ApplicationV2,HandlebarsApplicationMixin}=foundry.applications.api;
export function selectedSources(actor,selection={attribute:"body"}){
  if(actor.type!=="hero")return [{kind:"base",id:"npc",count:0,name:label("npcPool")}];
  const result=[];
  if(["body","talent","spirit","mind"].includes(selection.attribute))result.push({kind:"base",id:selection.attribute,count:actor.system.attributes[selection.attribute],name:label(selection.attribute)});
  if(selection.context!=="combat")for(const type of ["skill","ability","bond"]){const item=actor.items.get(selection[type]);if(item?.type===type&&!item.system.archived)result.push({kind:"base",id:item.uuid,count:gadgetRollRank(item,actor),name:display(item).name});}
  return result;
}
export function heroRollSourcesUnchanged(actor,selection,sources){
  if(actor?.type!=='hero'||!selection)return true;
  const current=selectedSources(actor,selection),shape=rows=>rows.map(({kind,id,count})=>({kind,id,count}));
  return JSON.stringify(shape(current))===JSON.stringify(shape(sources));
}
export function rollSelection(actor,context="free"){const key=`${actor.uuid}:${context}`;if(!game.dawn.rollSelections.has(key))game.dawn.rollSelections.set(key,{attribute:"body",context});return game.dawn.rollSelections.get(key);}
function defaults(){return game.settings.get("dawn","rollDefaults");}
export class DawnRollComposer extends HandlebarsApplicationMixin(ApplicationV2){
  static DEFAULT_OPTIONS={classes:["dawn","dawn-compact","dawn-composer"],window:{title:"XD6",resizable:false},position:{width:350,height:"auto"},actions:{refreshTargets:DawnRollComposer.onRefreshTargets,kind:DawnRollComposer.onKind,adjust:DawnRollComposer.onAdjust,roll:DawnRollComposer.onRoll,checkPending:DawnRollComposer.onCheckPending,discardPending:DawnRollComposer.onDiscardPending,savePending:DawnRollComposer.onSavePending,republish:DawnRollComposer.onRepublish}};
  static PARTS={body:{template:"systems/dawn/templates/roll-composer.hbs"}};
  constructor({actor,sources,contextLabel="",context="free",npcPool=null,npcAction=null,sourceSelection=null,technique=null,techniqueLevel=null,heroAttack=null,finisher=null}){
    const sidebar=document.getElementById("sidebar")?.getBoundingClientRect(),left=Math.max(85,(sidebar?.left??window.innerWidth)-370);
    super({position:{left,top:Math.max(50,window.innerHeight-650)}});this.actor=actor;this.sources=structuredClone(sources);this.sourceSelection=sourceSelection?structuredClone(sourceSelection):null;this.contextLabel=contextLabel;this.rollContext=context;this.npcAction=npcAction;this.npcActionSnapshot=npcAction?npcActionSnapshot(actor,npcAction):null;this.technique=technique;this.techniqueLevel=techniqueLevel;this.techniqueSnapshot=technique?techniqueRollSnapshot(actor,technique,techniqueLevel):null;const selection=context==='combat'?selectedTargetSet():{targets:[],references:[]};this.targets=selection.targets;this.targetReferences=selection.references;
    this.heroAttack=heroAttack;this.heroAttackSource=heroAttack?heroAttackSnapshot(heroAttack,sourceSelection?.attribute):null;this.finisher=finisher?structuredClone(finisher):null;
    const remembered=recallPendingRoll(game.world.id,game.user.id,actor.uuid);this.pending=remembered?.draft??findPendingRoll(globalThis.sessionStorage,game.world.id,game.user.id,actor.uuid);this.pendingStored=remembered?.stored??!!this.pending;
    const d=defaults();this.defaultsSnapshot=structuredClone(d);this.rollState={kind:"normal",advantage:d.advantage,disadvantage:d.disadvantage,difficulty:actor.type==="hero"&&context!=="combat"?d.difficulty:"hits-only",target:d.target,comparison:d.comparison,quickAdjustment:0,successAt:4,criticalAt:6,explode:true,assassinate:false,npcPool};
  }
  get title(){return `${label("roll")} · ${display(this.actor).name}`;}
  request(){
    const s=this.rollState,sources=structuredClone(this.sources),evaluation=s.difficulty==="tier"?{kind:"tier-bands",tier:Math.max(1,this.actor.system.tier)}:s.difficulty==="fixed"?{kind:"threshold",requiredHits:integer(s.target,{max:200}),comparator:s.comparison}:{kind:"hits-only"};
    if(this.actor.type==='npc'){const source=sources.find(source=>source.id==='npc');if(source)source.count=s.npcPool??0;}
    if(s.advantage)sources.push({kind:s.kind==="quick"?"base":"advantage",id:"situational",name:label("advantage"),count:s.advantage});
    if(s.kind!=="quick"&&s.disadvantage)sources.push({kind:"disadvantage",id:"situational-disadvantage",count:s.disadvantage});
    let request={kind:s.kind,context:this.rollContext,targets:structuredClone(this.targets),sources,quickAdjustment:s.quickAdjustment,successAt:s.successAt,criticalAt:s.criticalAt===0?null:s.criticalAt,explode:s.explode,evaluation,label:this.contextLabel||this.sources.map(s=>s.name).join(" + "),tableDefaults:this.defaultsSnapshot,configuredDisadvantage:s.disadvantage,quickDisadvantageRuling:s.kind==="quick"&&s.disadvantage>0?{agreedPoolAdjustment:s.quickAdjustment}:null};
    if(this.heroAttackSource)request.heroAttack={...structuredClone(this.heroAttackSource),...(this.finisher?{focus:this.finisher.focus,tension:this.finisher.tension}:{})};
    if(this.finisher)request.sources.push({kind:'advantage',id:'finisher-focus',name:label('finisherFocus'),count:this.finisher.focus});
    if(s.assassinate&&s.kind==='normal'&&canAssassinate(this.actor,this.rollContext))request=assassinateRoll(request,this.actor.system.tier,label('assassinateRoll'));
    return request;
  }
  async _prepareContext(){
    const s=this.rollState,request=this.request();
    const pool=s.kind==="quick"?quickPool(request.sources,s.quickAdjustment):poolSize(request.sources).pool;
    return {...s,finisher:this.finisher,npcManualPool:this.actor.type==='npc',npcPoolMissing:this.actor.type==='npc'&&s.npcPool===null,showTargets:this.rollContext==='combat',targets:this.targets,assassinateAvailable:canAssassinate(this.actor,this.rollContext),assassinateStale:s.assassinate&&!canAssassinate(this.actor,this.rollContext),actorName:display(this.actor).name,sources:this.sources.filter(source=>this.actor.type!=='npc'||source.id!=='npc').map(source=>({...source,name:["body","talent","spirit","mind"].includes(source.id)?label(source.id):source.name,count:s.kind==="quick"?(source.count===0?0:source.count<=2?1:2):source.count})),allowQuick:this.rollContext!=="combat",normal:s.kind==="normal",quick:s.kind==="quick",fixed:s.difficulty==="fixed",tierDifficulty:s.difficulty==="tier",tier:this.actor.system.tier,pool,quickDisadvantage:s.kind==="quick"&&s.disadvantage>0,contextLabel:this.contextLabel,difficultyOptions:{...(this.rollContext!=="combat"?{tier:label("difficultyTier")}:{}),fixed:label("difficultyFixed"),"hits-only":label("hitsOnly")},busy:this.rolling,pending:this.pending,pendingStored:this.pendingStored,pendingShowDice:game.user.isGM||['publicroll','gmroll','selfroll'].includes(this.pending?.rollMode),canRepublish:this.pendingStored&&canRepublishRoll(this.pending,game.user.id,game.users)};
  }
  _onRender(context,options){
    super._onRender(context,options);
    this.element.querySelectorAll("[data-roll-field]").forEach(el=>el.addEventListener("change",()=>{const key=el.dataset.rollField;const value=el.type==="checkbox"?el.checked:el.type==="number"?(el.value.trim()===''?null:Number(el.value)):el.value;this.rollState[key]=key==='npcPool'&&(!Number.isSafeInteger(value)||value<0||value>200)?null:value;this.render();}));
  }
  static onRefreshTargets(){if(this.rolling||this.pending)return;const selection=selectedTargetSet();this.targets=selection.targets;this.targetReferences=selection.references;this.render();}
  static onKind(event,target){if(this.rollContext==="combat"&&target.dataset.kind==="quick")return;this.rollState.kind=target.dataset.kind;this.render();}
  static onAdjust(event,target){const key=target.dataset.field;this.rollState[key]=Math.clamp(this.rollState[key]+Number(target.dataset.delta),key==="quickAdjustment"?-200:0,200);this.render();}
  static async onRoll(){
    if(this.rolling||this.pending)return;this.rolling=true;await this.render();
    let flightId=null;
    try{
      if(!this.actor.isOwner)throw Error(label('noPermission'));
      if(!heroRollSourcesUnchanged(this.actor,this.sourceSelection,this.sources))throw Error(label('heroRollSourcesChanged'));
      if(this.heroAttack&&(!game.dawn.catalog.entries.includes(this.heroAttack)||JSON.stringify(heroAttackSnapshot(this.heroAttack,this.sourceSelection.attribute))!==JSON.stringify(this.heroAttackSource)))throw Error(label('heroAttackInvalid'));
      if(this.npcAction&&!npcActionUnchanged(this.actor,this.npcAction,this.npcActionSnapshot))throw Error(label('npcActionChanged'));
      if(this.technique&&!techniqueRollUnchanged(this.actor,this.technique,this.techniqueLevel,this.techniqueSnapshot))throw Error(label('techniqueRollChanged'));
      if(this.finisher&&(game.combat?.uuid!==this.finisher.combatUuid||actorCombatTension(this.actor,game.combat,game.dawn.party)!==this.finisher.tension||this.actor.system.focus?.value!==this.finisher.available))throw Error(label('finisherChanged'));
      if(this.actor.type==='npc'&&(!Number.isSafeInteger(this.rollState.npcPool)||this.rollState.npcPool<0||this.rollState.npcPool>200))throw Error(label('npcPoolRequired'));
      if(this.rollState.assassinate&&!canAssassinate(this.actor,this.rollContext))throw Error(label('assassinateUnavailable'));
      // Probe availability before generating dice; write the full result before publishing.
      const store=globalThis.sessionStorage,key=`dawn.roll-storage-probe.${game.user.id}`;store.setItem(key,'1');store.removeItem(key);
      const remembered=recallPendingRoll(game.world.id,game.user.id,this.actor.uuid);
      if(remembered){this.pending=remembered.draft;this.pendingStored=remembered.stored;this.rolling=false;await this.render();return;}
      const existing=findPendingRoll(store,game.world.id,game.user.id,this.actor.uuid);
      if(existing){this.pending=existing;this.pendingStored=true;this.rolling=false;await this.render();return;}
      const request=this.request();
      const targetReferences=structuredClone(this.targetReferences),rollId=foundry.utils.randomID(),rollMode=game.settings.get('core','rollMode'),publication=capturePublication(this.actor,rollMode);
      await requireSafeTargets(request.targets,targetReferences);
      if(this.heroAttack||this.npcAction?.system?.mechanics?.kind==='attack'){
        const scene=canvas.scene,selected=(canvas.tokens?.controlled??[]).map(t=>t.document).filter(t=>t?.actor?.uuid===this.actor.uuid);
        const tokens=Array.from(scene?.tokens??[]),targets=targetReferences.map(uuid=>tokens.find(t=>t.uuid===uuid));
        if(selected.length===1&&attackHasHeightDifference(scene,selected[0],targets))request.heightReminder=true;
      }
      if(!heroRollSourcesUnchanged(this.actor,this.sourceSelection,this.sources))throw Error(label('heroRollSourcesChanged'));
      if(this.heroAttack&&(!game.dawn.catalog.entries.includes(this.heroAttack)||JSON.stringify(heroAttackSnapshot(this.heroAttack,this.sourceSelection.attribute))!==JSON.stringify(this.heroAttackSource)))throw Error(label('heroAttackInvalid'));
      if(this.npcAction&&!npcActionUnchanged(this.actor,this.npcAction,this.npcActionSnapshot))throw Error(label('npcActionChanged'));
      if(this.technique&&!techniqueRollUnchanged(this.actor,this.technique,this.techniqueLevel,this.techniqueSnapshot))throw Error(label('techniqueRollChanged'));
      if(this.finisher&&(game.combat?.uuid!==this.finisher.combatUuid||actorCombatTension(this.actor,game.combat,game.dawn.party)!==this.finisher.tension||this.actor.system.focus?.value!==this.finisher.available))throw Error(label('finisherChanged'));
      if(!canRepublishRoll({rollMode,publication,state:'sending-unknown',result:{dice:[]},content:''},game.user.id,game.users))throw Error(label('rollAudienceUnavailable'));
      // Snapshot Tension after asynchronous target checks, immediately before
      // reserving and rolling. Later changes do not rewrite a completed attack.
      if(this.npcAction){const preview=npcDamagePreview(this.actor,this.npcAction,game.dawn.catalog.entries,actorCombatTension(this.actor,game.combat,game.dawn.party));if(preview)request.damagePreview=preview;}
      if(!startRollFlight(game.world.id,game.user.id,this.actor.uuid,rollId))throw Error(label('rollInProgress'));
      flightId=rollId;
      this.pending={rollId,actorUuid:this.actor.uuid,request,targetReferences,rollMode,publication,state:'generating'};
      savePendingRoll(store,game.world.id,game.user.id,this.pending);
      this.pendingStored=true;
      this.pending=await prepareXD6(this.actor,request,rollId,rollMode,publication,targetReferences);
      this.pendingStored=false;
      rememberPendingRoll(game.world.id,game.user.id,this.actor.uuid,this.pending,false);
      const reservation=findPendingRoll(store,game.world.id,game.user.id,this.actor.uuid);
      if(!reservation||reservation.rollId!==rollId||reservation.state!=='generating')throw Error('Roll reservation changed; reconcile before continuing');
      savePendingRoll(store,game.world.id,game.user.id,this.pending);
      this.pendingStored=true;
      rememberPendingRoll(game.world.id,game.user.id,this.actor.uuid,this.pending,true);
      if(!this.actor.isOwner)throw Error(label('noPermission'));
      if(!canRepublishRoll(this.pending,game.user.id,game.users))throw Error(label('rollAudienceUnavailable'));
      await requireSafeTargets(this.pending.result.request.targets,this.pending.targetReferences);
      const message=await publishXD6(this.actor,this.pending);
      if(!message?.id||findPublishedRoll([message],this.pending,game.user.id)!=='match')throw Error('Chat message was not confirmed');
      removePendingRoll(store,game.world.id,game.user.id,this.pending.rollId);
      forgetPendingRoll(game.world.id,game.user.id,this.actor.uuid,this.pending.rollId);this.pending=null;await this.close();
    }catch(e){this.rolling=false;ui.notifications.error(`${label(!this.pending?'rollNotStarted':this.pending.state==='generating'?'rollRecoveryGenerating':'rollPublishUncertain')} ${e.code==='DAWN_ROLL_RECOVERY_DAMAGED'?label('rollRecoveryCorrupt'):e.message}`);await this.render();}
    finally{if(flightId)finishRollFlight(game.world.id,game.user.id,this.actor.uuid,flightId);}
  }
  static async onCheckPending(){if(!this.pending||this.rolling)return;if(hasRollFlight(game.world.id,game.user.id,this.actor.uuid))return ui.notifications.warn(label('rollInProgress'));if(!this.pending.result)return ui.notifications.warn(label('rollRecoveryGenerating'));const status=findPublishedRoll(game.messages,this.pending,game.user.id);if(status==='match'){removePendingRoll(globalThis.sessionStorage,game.world.id,game.user.id,this.pending.rollId);forgetPendingRoll(game.world.id,game.user.id,this.actor.uuid,this.pending.rollId);this.pending=null;await this.close();}else ui.notifications.warn(label(status==='conflict'?'rollConflict':'rollNotFound'));
  }
  static async onSavePending(){if(!this.pending?.result||this.rolling)return;if(hasRollFlight(game.world.id,game.user.id,this.actor.uuid))return ui.notifications.warn(label('rollInProgress'));try{savePendingRoll(globalThis.sessionStorage,game.world.id,game.user.id,this.pending);this.pendingStored=true;rememberPendingRoll(game.world.id,game.user.id,this.actor.uuid,this.pending,true);await this.render();}catch(e){ui.notifications.error(`${label('rollPublishUncertain')} ${e.message}`);}}
  static async onRepublish(){
    if(!this.pending?.result||!this.pendingStored||this.rolling||this.confirmingRepublish)return;
    if(hasRollFlight(game.world.id,game.user.id,this.actor.uuid))return ui.notifications.warn(label('rollInProgress'));
    const draft=this.pending,snapshot=JSON.stringify(draft);
    let status=findPublishedRoll(game.messages,draft,game.user.id);
    if(status==='match')return DawnRollComposer.onCheckPending.call(this);
    if(status==='conflict')return ui.notifications.warn(label('rollConflict'));
    let confirmed;this.confirmingRepublish=true;
    try{confirmed=await foundry.applications.api.DialogV2.confirm({window:{title:label('rollRepublishTitle')},content:`<p>${escape(label('rollRepublishWarning'))}</p>`,rejectClose:false});}finally{this.confirmingRepublish=false;}
    if(!confirmed)return;
    const store=globalThis.sessionStorage;
    try{
      if(!this.actor.isOwner)throw Error(label('noPermission'));
      if(hasRollFlight(game.world.id,game.user.id,this.actor.uuid))throw Error(label('rollInProgress'));
      if(this.pending!==draft||!this.pendingStored||JSON.stringify(this.pending)!==snapshot)throw Error(label('rollRecoveryChanged'));
      const stored=readPendingRoll(store,game.world.id,game.user.id,draft.rollId),latest=recallPendingRoll(game.world.id,game.user.id,this.actor.uuid,draft.rollId);
      if(!stored||JSON.stringify(stored)!==JSON.stringify(draft)||(latest&&JSON.stringify(latest.draft)!==JSON.stringify(draft)))throw Error(label('rollRecoveryChanged'));
      if(!canRepublishRoll(draft,game.user.id,game.users))throw Error(label('rollAudienceUnavailable'));
      await requireSafeTargets(draft.result.request?.targets,draft.targetReferences);
      status=findPublishedRoll(game.messages,draft,game.user.id);
      if(status==='match')return DawnRollComposer.onCheckPending.call(this);
      if(status==='conflict')throw Error(label('rollConflict'));
      if(!startRollFlight(game.world.id,game.user.id,this.actor.uuid,draft.rollId))throw Error(label('rollInProgress'));
      this.rolling=true;
      try{
        const activeDraft={...draft,publicationAttempt:(draft.publicationAttempt??1)+1};
        savePendingRoll(store,game.world.id,game.user.id,activeDraft);
        this.pending=activeDraft;rememberPendingRoll(game.world.id,game.user.id,this.actor.uuid,activeDraft,true);
        const message=await publishXD6(this.actor,activeDraft);
        if(!message?.id||findPublishedRoll([message],activeDraft,game.user.id)!=='match')throw Error('Chat message was not confirmed');
        removePendingRoll(store,game.world.id,game.user.id,activeDraft.rollId);forgetPendingRoll(game.world.id,game.user.id,this.actor.uuid,activeDraft.rollId);this.pending=null;await this.close();
      }finally{finishRollFlight(game.world.id,game.user.id,this.actor.uuid,draft.rollId);this.rolling=false;}
    }catch(e){ui.notifications.warn(`${label('rollPublishUncertain')} ${e.message}`);await this.render();}
  }
  static async onDiscardPending(){
    if(!this.pending||this.rolling||this.confirmingDiscard)return;
    if(hasRollFlight(game.world.id,game.user.id,this.actor.uuid))return ui.notifications.warn(label('rollInProgress'));
    const draft=this.pending,snapshot=JSON.stringify(draft);this.confirmingDiscard=true;
    try{
      const confirmed=await foundry.applications.api.DialogV2.confirm({window:{title:label('rollDiscardTitle')},content:`<p>${escape(label('rollDiscardWarning'))}</p>`,rejectClose:false});
      if(!confirmed)return;
      if(hasRollFlight(game.world.id,game.user.id,this.actor.uuid))return ui.notifications.warn(label('rollInProgress'));
      if(this.pending!==draft||JSON.stringify(this.pending)!==snapshot)return ui.notifications.warn(label('rollRecoveryChanged'));
      const latest=recallPendingRoll(game.world.id,game.user.id,this.actor.uuid,draft.rollId),stored=readPendingRoll(globalThis.sessionStorage,game.world.id,game.user.id,draft.rollId),current=latest?.draft??stored;
      if(!current||JSON.stringify(current)!==snapshot){if(current){this.pending=current;this.pendingStored=latest?.stored??true;}ui.notifications.warn(label('rollRecoveryChanged'));await this.render();return;}
      removePendingRoll(globalThis.sessionStorage,game.world.id,game.user.id,draft.rollId);forgetPendingRoll(game.world.id,game.user.id,this.actor.uuid,draft.rollId);this.pending=null;await this.render();
    }catch(e){ui.notifications.warn(e.code==='DAWN_ROLL_RECOVERY_DAMAGED'?label('rollRecoveryCorrupt'):e.message);}finally{this.confirmingDiscard=false;}
  }
}
export function rollDialog(actor,selection=rollSelection(actor),contextLabel="",{technique=null,techniqueLevel=null,heroAttack=null,finisher=null}={}){
  if(typeof selection==="string")selection={...rollSelection(actor),attribute:selection};
  if(!actor.isOwner)throw Error(label("noPermission"));
  try{return new DawnRollComposer({actor,sources:selectedSources(actor,selection),contextLabel,context:selection.context??"free",npcPool:selection.npcPool??null,npcAction:selection.npcAction??null,sourceSelection:actor.type==='hero'?selection:null,technique,techniqueLevel,heroAttack,finisher}).render({force:true});}
  catch(error){if(error.code==='DAWN_ROLL_RECOVERY_DAMAGED')throw Error(label('rollRecoveryCorrupt'));throw error;}
}
export class DawnGMControls extends HandlebarsApplicationMixin(ApplicationV2){
  static DEFAULT_OPTIONS={id:"dawn-gm-rolls",classes:["dawn","dawn-compact","dawn-gm-controls"],window:{title:"DAWN",resizable:false},position:{left:85,top:90,width:260,height:"auto"},actions:{adjust:DawnGMControls.onAdjust,reset:DawnGMControls.onReset}};
  static PARTS={body:{template:"systems/dawn/templates/gm-rolls.hbs"}};
  get title(){return `DAWN · ${label("tableRolls")}`;}
  async _prepareContext(){const d=defaults();return {...d,fixed:d.difficulty==="fixed",difficultyOptions:{tier:label("difficultyTier"),fixed:label("difficultyFixed")}};}
  _onRender(context,options){super._onRender(context,options);this.element.querySelectorAll("[data-default-field]").forEach(el=>el.addEventListener("change",async()=>{if(!game.user.isGM)return;const key=el.dataset.defaultField,value=el.type==="number"?integer(Number(el.value),{max:200}):el.value;await game.settings.set("dawn","rollDefaults",{...defaults(),[key]:value});}));}
  static onAdjust(event,target){if(!game.user.isGM)return;const d={...defaults()},key=target.dataset.field;d[key]=Math.clamp(d[key]+Number(target.dataset.delta),0,200);return game.settings.set("dawn","rollDefaults",d);}
  static onReset(){if(game.user.isGM)return game.settings.set("dawn","rollDefaults",{difficulty:"tier",target:1,comparison:">",advantage:0,disadvantage:0});}
}
