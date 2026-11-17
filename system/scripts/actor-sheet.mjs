import {spendNpcActionAP,spendNpcStrideAP} from './npc-action-spend.mjs';
import {formatRuleText} from './rich-text.mjs';
import {isGadget,isPersonalAbility,hasGearhead,gadgetCreatorKey} from './gadgets.mjs';
import {verifiedNpcPool,npcActionCost,npcAceThreshold,npcAceTensionStatus} from './npc-rolls.mjs';
import {ATTRIBUTES,validateCreation,poolSize} from "./rules.mjs";
import {display} from "./models.mjs";
import {label,escape,rollDialog,rollSelection,selectedSources,selectedTargets,targetsMarkup} from "./rolls.mjs";
import {activeItems,techniqueRanks,techniqueView} from "./techniques.mjs";
import {acquireItem,setTechniqueLevel,restoreArchivedItem} from "./catalog.mjs";
import {DawnCreation,finishCreation} from "./creation.mjs";
import {creationBudget,tierIncrease,developmentBudget} from "./creation-rules.mjs";
import {requestAction,isExecutor} from "./operations.mjs";
import {damageSnapshot,applyDamage} from "./damage.mjs";
import {selectFeature} from "./skill-selection.mjs";
import {applyEffectTemplate,effectErrorMessage} from "./effect-application.mjs";
import {finishDisappeared,returnTokenForActor} from "./effect-return.mjs";
import {effectDisplayName,effectDisplayDescription} from "./effect-display.mjs";
import {setCombatantAP} from "./combat-ap.mjs";
import {canReadItemSource,canReadEffectSource} from "./library-index.mjs";
import {canUseStandardDuration,effectDurationTimelineMatches} from "./effect-expiry.mjs";
import {availableBondTargets,bondTargetUpdate} from './bond-targets.mjs';
import {inventoryChange} from './inventory.mjs';
import {actionValues,actorCombatTension} from './action-values.mjs';
import {heroAttackDefinition} from './hero-attacks.mjs';
import {createPartyAccount} from './party-account.mjs';
import {DawnClocks} from './clocks.mjs';
const {HandlebarsApplicationMixin}=foundry.applications.api;
export class DawnActorSheet extends HandlebarsApplicationMixin(foundry.applications.sheets.ActorSheetV2){
 static DEFAULT_OPTIONS={classes:["dawn","dawn-actor"],position:{width:900,height:860},window:{resizable:true},form:{submitOnChange:true,closeOnSubmit:false},actions:{clocks:DawnActorSheet.onClocks,sheetTab:DawnActorSheet.onTab,editing:DawnActorSheet.onEditing,source:DawnActorSheet.onSource,roll:DawnActorSheet.onRoll,item:DawnActorSheet.onItem,addItem:DawnActorSheet.onAddItem,archive:DawnActorSheet.onArchive,restore:DawnActorSheet.onRestore,removeEffect:DawnActorSheet.onRemoveEffect,effectDuration:DawnActorSheet.onEffectDuration,catalog:DawnActorSheet.onCatalog,level:DawnActorSheet.onLevel,techniqueChat:DawnActorSheet.onTechniqueChat,techniqueRoll:DawnActorSheet.onTechniqueRoll,finalize:DawnActorSheet.onFinalize,initialArray:DawnActorSheet.onArray,basic:DawnActorSheet.onBasic,portraitMode:DawnActorSheet.onPortraitMode,art:DawnActorSheet.onArt,advancement:DawnActorSheet.onAdvancement,actionChat:DawnActorSheet.onActionChat,heroAttackRoll:DawnActorSheet.onHeroAttackRoll,bondActionChat:DawnActorSheet.onBondActionChat,npcActionRoll:DawnActorSheet.onNpcActionRoll,npcActionSpend:DawnActorSheet.onNpcActionSpend,npcStride:DawnActorSheet.onNpcStride,npcActionChat:DawnActorSheet.onNpcActionChat,party:DawnActorSheet.onParty,partyAccount:DawnActorSheet.onPartyAccount,creation:DawnActorSheet.onCreation,tierUp:DawnActorSheet.onTierUp,damage:DawnActorSheet.onDamage}};
 static PARTS={body:{template:"systems/dawn/templates/actor.hbs",templates:["systems/dawn/templates/hero.hbs","systems/dawn/templates/actor-other.hbs"]}};
 expandedSections=new Map();
 currentTab="overview";editing=false;portraitMode="art";showAdvancement=false;
 get title(){return display(this.actor).name;}
 static onClocks(){
  if(this.actor.type!=='hero'||!this.actor.isOwner)return;
  this.clockWindow??=new DawnClocks({actor:this.actor});
  return this.clockWindow.render({force:true});
 }
 get rollContext(){return this.currentTab==="combat"||this.actor.type==="npc"?"combat":"free";}
 async _prepareContext(options){
  const context=await super._prepareContext(options),actor=this.actor,s=actor.system,lang=game.dawn.language,selection=rollSelection(actor,this.rollContext),items=activeItems(actor.items),hero=actor.type==="hero",editing=this.editing&&this.isEditable;
  if(!hero&&this.currentTab==="overview")this.currentTab="sheet";
  const actionTension=actorCombatTension(actor,game.combat,game.dawn.party);
  const compoundParts=s.kind==='compound'&&Array.isArray(s.relations?.parts)
    ?s.relations.parts.map(part=>part.content?.[lang]??part.content?.en).filter(Boolean):[];
  const bondTargets=availableBondTargets(game.actors,actor,game.user);
  const rows=items.map(i=>{const linked=i.type==='bond'&&bondTargets.find(a=>a.uuid===i.system.mechanics?.actorUuid);return {id:i.id,type:i.type,...display(i),...(linked?{name:display(linked).name}:{}),description:actor.type==='npc'&&i.type==='action'?actionValues(display(i).description||i.system.notes,s,actionTension,lang):(display(i).description||i.system.notes),rank:i.system.rank,notes:i.system.notes,quantity:Number.isSafeInteger(i.system.mechanics?.quantity)?i.system.mechanics.quantity:1,selected:selection[i.type]===i.id,editing,isBond:i.type==='bond',bondLinked:!!linked,bondTargetOptions:bondTargets.map(a=>({uuid:a.uuid,name:display(a).name,selected:a.uuid===i.system.mechanics?.actorUuid})),isBondRule:i.type==='action'&&i.system.groupId==='bond-rules',isBondAction:i.type==='action'&&i.system.groupId==='bond-rules'&&['bond-action','antagonistic-bond-action'].includes(i.system.mechanics?.kind),isNpcAction:i.type==='action',npcCost:npcActionCost(i),npcHasCost:npcActionCost(i)!==null,npcIsAce:i.type==='action'&&i.system.mechanics?.kind==='ace',npcAceThreshold:npcAceThreshold(i),npcHasAceThreshold:npcAceThreshold(i)!==null,npcAceTensionStatus:actor.type==='npc'?npcAceTensionStatus(i,actionTension):null,isSkill:i.type==='skill',skillAttribute:i.system.mechanics?.attribute??'',attributeOptions:Object.fromEntries(ATTRIBUTES.map(key=>[key,label(key)]))};});
  for(const details of this.element?.querySelectorAll('details[data-expand]')??[])this.expandedSections.set(details.dataset.expand,details.open);
  const opened=new Set(Array.from(this.element?.querySelectorAll('.dawn-tech-card[open]')??[]).map(el=>el.dataset.itemId));
  const techniqueArchetypes=[...game.dawn.catalog.archetypes];for(const item of items.filter(i=>i.type==='technique')){const id=item.system.archetypeId??'';if(!techniqueArchetypes.some(a=>a.id===id))techniqueArchetypes.push({id,[lang]:id||label('otherArchetype')});}
  const techniqueGroups=techniqueArchetypes.map(a=>({id:a.id,name:a[lang],items:items.filter(i=>i.type==="technique"&&(i.system.archetypeId??'')===a.id).map(i=>({...techniqueView(i,lang),open:opened.has(i.id),editing}))})).filter(a=>a.items.length);
  const combatants=game.combat?.combatants.filter(c=>c.actor?.uuid===actor.uuid)??[],sources=selectedSources(actor,selection),combatContext=game.dawn.party?.system.storyContexts[game.combat?.getFlag("dawn","storyContextId")];
  const tabDefinitions=hero?[["overview","overview","fa-address-card"],["free","unstructuredPlay","fa-comments"],["combat","structuredPlay","fa-khanda"],["settings","sheetSettings","fa-sliders"]]:[["sheet","sheet","fa-address-card"],["configuration","configuration","fa-sliders"],["notes","notes","fa-pen"]];
  const basicActions=game.dawn.catalog.entries.filter(e=>e.type==="action"&&e.system.groupId!=='bond-rules').map(e=>{const view=display(e),attack=hero?heroAttackDefinition(e):null;return {id:e._id,...view,description:hero?actionValues(view.description,s,actionTension,lang):view.description,cost:e.system.mechanics.cost,breathe:e.system.content.en.name==="Breathe",attackAttributes:attack?.attributes.map(id=>({id,name:label(id)}))??[]};});
  return {...context,actor,system:s,name:display(actor).name,editable:this.isEditable,editing,isGM:game.user.isGM,isHero:hero,isNpc:actor.type==="npc",isFodder:actor.getFlag?.('dawn','fodderTemplate')===true,fodderDescription:display(actor).passive,isParty:actor.type==="party",isController:actor.type==="controller",isPreset:s.canonicalId?.startsWith("lionwing.npc."),locked:!editing,isDraft:s.build?.status==='draft',budget:hero?creationBudget(s,items):null,development:hero?developmentBudget(s,items):null,isReady:s.build?.status==='ready',
   tabs:tabDefinitions.map(([id,key,icon])=>({id,label:label(key),shortLabel:label(`tabShort.${id}`),icon,active:this.currentTab===id})),showOverview:this.currentTab==="overview",showFree:this.currentTab==="free",showCombat:this.currentTab==="combat",showSettings:this.currentTab==="settings",showSheet:this.currentTab==="sheet",showConfiguration:this.currentTab==="configuration",showBuilder:this.currentTab==="configuration",showNotes:this.currentTab==="notes",showAdvancement:this.showAdvancement,
   attributes:ATTRIBUTES.map(key=>({key,label:label(key),value:s.attributes?.[key],selected:selection.attribute===key})),sourceGroups:["skill","ability","gadget","bond"].filter(type=>type!=="gadget"||hasGearhead(items)||items.some(isGadget)).map(type=>({type,label:label(`sourceGroups.${type}`),hint:type==="gadget"?label("gadgetHint"):null,ability:type==="ability",editing:editing&&(type!=="gadget"||hasGearhead(items)),items:rows.filter(i=>type==="gadget"?isGadget(actor.items.get(i.id)):type==="ability"?isPersonalAbility(actor.items.get(i.id)):i.type===type)})),selectedSources:sources,pool:poolSize(sources).pool,techniqueGroups,techniqueCount:techniqueGroups.reduce((n,g)=>n+g.items.length,0),techniqueRanks:techniqueRanks(items),boons:rows.filter(i=>i.type==="boon"),bondRules:rows.filter(i=>i.isBondRule),inventory:rows.filter(i=>i.type==='equipment'),otherFeatures:rows.filter(i=>!i.isBondRule&&!['skill','ability','bond','technique','boon','equipment'].includes(i.type)),
   activeEffects:actor.effects.filter(e=>!e.disabled&&!e.isSuppressed).map(e=>{const configured=e.getFlag('dawn','autoDuration')===true,valid=effectDurationTimelineMatches(e,game.combat);return {id:e.id,name:effectDisplayName(e,game.dawn.catalog.entries,lang),description:effectDisplayDescription(e,game.dawn.catalog.entries,lang),manual:e.getFlag('dawn','manual')&&!configured,autoDuration:configured&&valid,durationStale:configured&&!valid,canSetDuration:isExecutor()&&(configured||canUseStandardDuration(actor,e,game.combat)),disappeared:e.getFlag('dawn','canonicalId')==='positive.исчез'};}),archivedItems:actor.items.filter(i=>i.system.archived&&!i.system.origin?.supersededBy).map(i=>({id:i.id,...display(i)})),passive:display(actor).passive??s.passive??"",statusLabel:label(s.build?.status??"draft"),primaryArchetype:game.dawn.catalog.archetypes.find(a=>a.id===s.primaryArchetype)?.[lang]??'',outlook:game.dawn.catalog.outlooks.find(o=>o.id===s.primaryOutlook)?.[lang]??"",outlooks:game.dawn.catalog.outlooks.map(o=>({id:o.id,name:o[lang],selected:o.id===s.primaryOutlook})),validation:hero&&s.build.status==='draft'?validateCreation(s,items).map(k=>label(`validation.${k}`)):[],
   compoundParts,compoundGate:compoundParts.length?new Intl.NumberFormat(lang,{maximumFractionDigits:2}).format(s.health.max/compoundParts.length):null,
   portraitSrc:this.portraitMode==="token"?(actor.isToken?actor.token.texture.src:actor.prototypeToken.texture.src):actor.img,tokenPortrait:this.portraitMode==="token",artPortrait:this.portraitMode==="art",tokenTarget:actor.isToken?label("currentTokenArt"):label("tokenArt"),
   statisticRows:actor.type==="npc"?["health","speed","armor","evasion"].map(key=>({key,label:label(key),...s.statistics[key]})):[],manualRows:hero?["health","speed","armor","startingFocus"].map(key=>({key,label:label(key),value:s.manualStatistics[key]??""})):[],
   combatant:combatants.length===1?combatants[0]:null,ap:combatants.length===1?combatants[0].getFlag("dawn","ap")??0:null,tension:combatContext?.tension??null,hasTension:combatContext?.tension!==undefined,basicActions,damageLog:game.user.isGM?Object.entries(actor.getFlag('dawn','damageReceipts')??{}).slice(-5).reverse().map(([key,receipt])=>({id:key.split('-').at(-1),amount:receipt.amount,kind:label(`damageKinds.${receipt.kind}`),health:receipt.result?.health,evasion:receipt.result?.evasion})):[],accounts:actor.type==="party"?Object.entries(s.participants).map(([id,a])=>({id,...a})):[]};
 }
 async _onRender(context,options){
  await super._onRender(context,options);this.element.classList.toggle("dawn-four-tabs",this.actor.type==="hero");this.element.classList.toggle("dawn-unlocked",this.editing);
  for(const details of this.element.querySelectorAll('details[data-expand]'))if(this.expandedSections.has(details.dataset.expand))details.open=this.expandedSections.get(details.dataset.expand);
  const header=this.element.querySelector('.window-header');let lock=header.querySelector('.dawn-lock-toggle');
  if(!this.isEditable){lock?.remove();return;}
  if(!lock){lock=document.createElement('button');lock.type='button';lock.className='dawn-lock-toggle';lock.dataset.action='editing';lock.addEventListener('pointerdown',e=>e.stopPropagation());lock.addEventListener('dblclick',e=>e.stopPropagation());header.prepend(lock);}
  lock.innerHTML=`<i class="fa-solid ${this.editing?'fa-lock-open':'fa-lock'}" aria-hidden="true"></i>`;lock.setAttribute('aria-label',label(this.editing?'lockSheet':'unlockSheet'));lock.setAttribute('aria-pressed',String(this.editing));lock.title=label(this.editing?'lockSheet':'unlockSheet');
 }
 _onChangeForm(formConfig,event){
  const target=event.target,key=target.dataset.itemField;
  if(target.hasAttribute('data-combat-ap')){const value=target.value.trim()===''?NaN:Number(target.value);setCombatantAP({actor:this.actor,combat:game.combat,user:game.user,value}).catch(e=>{ui.notifications.warn(label(e.message));this.render();});return;}
  if(key==='system.mechanics.actorUuid'){if(!this.isEditable||!this.editing)return;const item=this.actor.items.get(target.closest('[data-item-id]')?.dataset.itemId);try{const update=bondTargetUpdate(item,target.value,game.actors,this.actor,game.user,a=>display(a).name);item.update(update).then(()=>this.render()).catch(e=>ui.notifications.warn(e.message));}catch(e){ui.notifications.warn(label(e.message));this.render();}return;}
  if(key){const item=this.actor.items.get(target.closest('[data-item-id]')?.dataset.itemId);if(!this.isEditable||!item||item.system.archived)return;
   const inventory=inventoryChange(item,key,target.value,{editable:this.isEditable});if(inventory){item.update(inventory).catch(e=>ui.notifications.warn(e.message));return;}
   if(!this.editing||!['name','system.rank','system.notes','system.overrides.description','system.mechanics.attribute'].includes(key))return;
   if(key==='system.mechanics.attribute'&&(item.type!=='skill'||!ATTRIBUTES.includes(target.value)))return;item.update({[key]:target.type==='number'?Number(target.value):target.value,...(key==='name'&&(item.system.content.en?.name||item.type==='bond')?{'system.overrides.name':target.value}:{}),...(key==='name'&&item.type==='bond'?{'system.mechanics.actorUuid':''}:{})}).catch(e=>ui.notifications.warn(e.message));return;}
  if(!this.editing&&!['system.health.value','system.focus.value','system.evasion.value','system.wounds.value','system.stress.value','system.notes'].includes(target.name)&&!target.name?.startsWith('system.participants.'))return;
  return super._onChangeForm(formConfig,event);
 }
 _processFormData(event,form,formData){const data=super._processFormData(event,form,formData);for(const key of ['health','speed','armor','startingFocus'])if(data.system?.manualStatistics?.[key]==='')data.system.manualStatistics[key]=null;return data;}
 static onTab(event,target){this.currentTab=target.dataset.tab;this.render();}
 static async onEditing(){this.editing=!this.editing;await this.render();if(this.creationApp?.rendered&&!this.creationApp.formDirty&&!this.creationApp.busy)this.creationApp.render();for(const app of Object.values(game.dawn.catalogApps??{}))if(app.rendered&&app.actor?.uuid===this.actor.uuid)app.render();for(const item of this.actor.items)if(item.sheet.rendered)item.sheet.render();}
 static onSource(event,target){const selection=rollSelection(this.actor,this.rollContext);if(target.dataset.attribute){const a=target.dataset.attribute;selection.attribute=selection.attribute===a?null:a;}else{if(this.rollContext==='combat')return;const item=this.actor.items.get(target.dataset.itemId);Object.assign(selection,selectFeature(selection,item));}this.render();}
 static onRoll(){return rollDialog(this.actor,rollSelection(this.actor,this.rollContext)).catch(e=>ui.notifications.warn(e.message));}
 static async onHeroAttackRoll(event,target){
  const entry=game.dawn.catalog.entries.find(e=>e._id===target.dataset.id),attribute=target.dataset.attribute,attack=heroAttackDefinition(entry);
  if(!this.isEditable||this.actor.type!=='hero'||!attack?.attributes.includes(attribute))return;
  let finisher=null;
  if(attack.id==='action.атаки.завершение'){
   const combatUuid=game.combat?.uuid,tension=actorCombatTension(this.actor,game.combat,game.dawn.party),available=this.actor.system.focus?.value;
   if(!Number.isSafeInteger(tension)||!Number.isSafeInteger(available)||available<0)return ui.notifications.warn(label('finisherCombatRequired'));
   const focus=await foundry.applications.api.DialogV2.prompt({window:{title:display(entry).name},position:{width:390},content:`<p>${escape(label('finisherManualHint'))}</p><p>${escape(label('tension'))}: ${tension} · ${escape(label('focus'))}: ${available}</p><label>${escape(label('finisherFocus'))}<input name="focus" type="number" min="0" max="${Math.min(tension,available)}" value="0" step="1"></label>`,ok:{label:label('roll'),callback:(_e,b)=>b.form.elements.focus.value.trim()===''?NaN:Number(b.form.elements.focus.value)},rejectClose:false});
   if(focus===null||focus===undefined)return;
   if(!Number.isSafeInteger(focus)||focus<0||focus>Math.min(tension,available)||game.combat?.uuid!==combatUuid||actorCombatTension(this.actor,game.combat,game.dawn.party)!==tension||this.actor.system.focus?.value!==available)return ui.notifications.warn(label('finisherChanged'));
   finisher={focus,tension,available,combatUuid};
  }
  const selection={...rollSelection(this.actor,'combat'),attribute,context:'combat'};
  return rollDialog(this.actor,selection,display(entry).name,{heroAttack:entry,finisher}).catch(e=>ui.notifications.warn(e.message));
 }
 static onItem(event,target){this.actor.items.get(target.dataset.itemId)?.sheet.render({force:true});}
 static async onAddItem(event,target){const type=target.dataset.type;if(!this.isEditable||(!this.editing&&type!=='equipment'))return;if(!['skill','ability','gadget','bond','equipment','action'].includes(type))return;if(type==='gadget'&&!hasGearhead(this.actor.items))return ui.notifications.warn(label('gadgetRequiresGearhead'));if(type==='ability'&&this.actor.system.build?.standard&&activeItems(this.actor.items).some(isPersonalAbility))return ui.notifications.warn(label('validation.oneAbility'));await this.actor.createEmbeddedDocuments('Item',[{name:label(`newSource.${type}`),type:type==='gadget'?'ability':type,...(type==='skill'?{system:{mechanics:{attribute:'body'}}}:type==='gadget'?{system:{purchaseCost:0,mechanics:{gadget:true,gadgetCreator:gadgetCreatorKey(this.actor),definitionIncomplete:true},notes:label('gadgetDefinitionMissing')}}:type==='equipment'?{system:{mechanics:{quantity:1}}}:{})}]);}
 static async onArchive(event,target){const item=this.actor.items.get(target.dataset.itemId);if(!this.isEditable||!item||(!this.editing&&item.type!=='equipment'))return;const selection=rollSelection(this.actor,'free');if(selection[item.type]===item.id)selection[item.type]=null;await item.update({'system.archived':true});}
 static async onRestore(event,target){if(!this.isEditable||!this.editing)return;try{await restoreArchivedItem(this.actor,this.actor.items.get(target.dataset.itemId));}catch(e){ui.notifications.warn(e.message);}}
 static async onRemoveEffect(event,target){
  if(!this.isEditable)return;const effect=this.actor.effects.get(target.dataset.effectId);if(!effect)return;
  try{
   if(effect.getFlag('dawn','canonicalId')!=='positive.исчез')return await effect.delete();
   if(!game.user.isGM)return ui.notifications.warn(label('gmOnly'));
   const token=returnTokenForActor(this.actor,game.scenes);
   const confirmed=await foundry.applications.api.DialogV2.confirm({window:{title:label('returnDisappeared')},content:`<p>${escape(label(token?'returnDisappearedHint':'returnDisappearedActorHint'))}</p>`,rejectClose:false});
   if(!confirmed)return;
   if(returnTokenForActor(this.actor,game.scenes)!==token)throw Error('Token placement changed; review before retrying');
   await finishDisappeared({actor:this.actor,effect,token,isGM:game.user.isGM});
  }catch(e){ui.notifications.warn(`${label('effectReturnFailed')} ${e.message}`);}
 }
 static async onEffectDuration(event,target){
  if(!this.isEditable||!isExecutor())return ui.notifications.warn(label('executorOnly'));
  const effect=this.actor.effects.get(target.dataset.effectId),combat=game.combat;
  if(!effect||combat?.getFlag('dawn','transition'))return ui.notifications.warn(label('combatChanged'));
  const enabled=effect.getFlag('dawn','autoDuration')===true;
  if(!enabled&&!canUseStandardDuration(this.actor,effect,combat))return ui.notifications.warn(label('effectDurationAmbiguous'));
  try{await effect.update({'flags.dawn.autoDuration':!enabled});}
  catch(error){ui.notifications.warn(error.message);}
 }
 static onCatalog(event,target){game.dawn.openCatalog(this.actor,{filter:target.dataset.filter??'technique',canModify:()=>this.isEditable&&this.editing});}
 static async onLevel(event,target){if(!this.isEditable||!this.editing)return;try{const item=this.actor.items.get(target.dataset.itemId),n=Number(target.dataset.level);await setTechniqueLevel(this.actor,item,n===item.system.level?n-1:n);}catch(e){ui.notifications.warn(e.message);}}
 static async onTechniqueChat(event,target){const item=this.actor.items.get(target.dataset.itemId);if(!item||item.system.archived)return;const n=Number(target.dataset.level),view=techniqueView(item,game.dawn.language),level=view.levels.find(l=>l.n===n);if(!level||n>item.system.level)return;const targets=selectedTargets();await ChatMessage.create({speaker:ChatMessage.getSpeaker({actor:this.actor}),content:`<div class="dawn-roll"><h3>${escape(view.name)} · ${escape(level.name)}</h3>${targetsMarkup(targets)}<p class="dawn-pre">${formatRuleText(level.text)}</p></div>`.replaceAll('[[','&#91;&#91;'),flags:{dawn:{techniqueUuid:item.uuid,level:n,targets}}});}
 static onTechniqueRoll(event,target){const item=this.actor.items.get(target.dataset.itemId);if(!item||item.system.archived)return;const n=Number(target.dataset.level),view=techniqueView(item,game.dawn.language),level=view.levels.find(l=>l.n===n);if(level&&n<=item.system.level)return rollDialog(this.actor,rollSelection(this.actor,'combat'),`${view.name} · ${level.name}`,{technique:item,techniqueLevel:n}).catch(e=>ui.notifications.warn(e.message));}
 static async onArray(){if(this.isEditable&&this.editing)await this.actor.update({'system.attributes':{body:4,talent:3,spirit:2,mind:2}});}
 static async onFinalize(){if(!this.isEditable||!this.editing)return;try{await finishCreation(this.actor);}catch(e){ui.notifications.warn(e.message);}}
 static onCreation(){if(!this.isEditable)return;this.editing=true;this.render();const app=this.creationApp??=new DawnCreation(this.actor);if(app.rendered&&app.formDirty)return;return app.render({force:true});}

 static onBasic(event,target){return requestAction(this.actor,target.dataset.basic).catch(e=>ui.notifications.warn(e.message));}
 static async onDamage(){
  if(this.damageBusy)return;
  if(!isExecutor()||!this.isEditable)return ui.notifications.warn(label('damagePermission'));
  this.damageBusy=true;const actor=this.actor,operationId=foundry.utils.randomID();
  try {
   const snapshot=damageSnapshot(actor);
   const intent=await foundry.applications.api.DialogV2.prompt({classes:['dawn','dawn-modal'],position:{width:560},window:{title:label('damageTitle')},
    content:`<p>${escape(label('damageHint'))}</p><label>${escape(label('damageAmount'))}<input name="amount" type="number" min="0" step="1" value="0"></label><label>${escape(label('damageKind'))}<select name="kind"><option value="attack">${escape(label('damageAttack'))}</option><option value="ordinary">${escape(label('damageOrdinary'))}</option><option value="unreducible">${escape(label('damageUnreducible'))}</option></select></label>${actor.type==='hero'?`<label class="dawn-check"><input name="standardWound" type="checkbox">${escape(label('damageStandardWound'))}</label><p>${escape(label('damageWoundHint'))}</p>`:''}`,
    ok:{label:label('damageApply'),callback:(_event,button)=>({amount:button.form.elements.amount.value.trim()===''?NaN:Number(button.form.elements.amount.value),kind:button.form.elements.kind.value,standardWound:button.form.elements.standardWound?.checked===true})},rejectClose:false});
   if(!intent)return;
   if(await fromUuid(actor.uuid)!==actor)throw Error('damageChanged');
   const result=await applyDamage({actor,user:game.user,isExecutor:isExecutor(),snapshot,intent,operationId});
   const note=result.wound?` ${label('damageWoundApplied')} ${result.wounds}. ${label('damageInfluenceManual')}`:result.fullyEvaded?` ${label('damageFullyEvaded')}`:result.knockout?` ${label(actor.getFlag?.('dawn','fodderTemplate')===true?'fodderZeroHealth':'damageNpcKnockout')}`:'';
   ui.notifications.info(`${label('damageDone')} ${label('health')}: ${result.health}; ${label('evasion')}: ${result.evasion}.${note}`);
  }catch(e){const preview=e.damage?` ${label('damagePreview')}: ${label('health')} −${e.damage.healthDamage}, ${label('evasion')} ${e.damage.evasion} (${label('damageAbsorbed')}: ${e.damage.absorbed}).`:'';ui.notifications.warn(`${e.message?.startsWith('damage')?label(e.message):e.message}${preview}${e.message==='damageWriteUncertain'?` (${operationId})`:''}`);}
  finally{this.damageBusy=false;}
 }
 static onPortraitMode(event,target){this.portraitMode=target.dataset.mode;this.render();}
 static async onArt(){
  if(!this.isEditable||!this.editing)return;const token=this.portraitMode==='token',doc=token&&this.actor.isToken?this.actor.token:this.actor,path=token?(this.actor.isToken?'texture.src':'prototypeToken.texture.src'):'img';
  const picker=new foundry.applications.apps.FilePicker.implementation({type:'image',current:foundry.utils.getProperty(doc,path),document:doc,callback:async value=>{if(!this.editing)return;await doc.update({[path]:value});await this.render();}});await picker.browse();
 }
 static async onTierUp(){
  if(!this.isEditable||!this.editing||this.advancing||this.actor.system.build.status!=='ready')return;
  if(this.actor.system.tier>=6)return ui.notifications.info(label('maximumTier'));
  const options=ATTRIBUTES.map(k=>`<option value="${k}">${escape(label(k))}</option>`).join('');
  this.advancing=true;
  try{const choices=await foundry.applications.api.DialogV2.prompt({classes:['dawn','dawn-modal'],position:{width:620},window:{title:label('increaseTier')},content:`<p>${escape(label('tierUpHint'))}</p><label>${escape(label('firstAttribute'))}<select name="first">${options}</select></label><label>${escape(label('secondAttribute'))}<select name="second">${options.replace('value="talent"','value="talent" selected')}</select></label>`,ok:{label:label('increaseTier'),callback:(event,button)=>({first:button.form.elements.first.value,second:button.form.elements.second.value})},rejectClose:false});if(!choices)return;
   const next=tierIncrease(this.actor.system,choices.first,choices.second);
   await this.actor.update({'system.tier':next.tier,'system.attributes':next.attributes,'system.progression.awards':[...this.actor.system.progression.awards,next.award]});
  }catch(e){ui.notifications.warn(e.message);}finally{this.advancing=false;}
 }
 static onAdvancement(){if(!this.isEditable||!this.editing)return ui.notifications.info(label('unlockToChange'));this.showAdvancement=!this.showAdvancement;this.render();}
 static async onNpcStride(){
  const operationId=foundry.utils.randomID();
  try{const receipt=await spendNpcStrideAP({actor:this.actor,combat:game.combat,user:game.user,isExecutor,operationId});ui.notifications.info(`${label('npcStridePaid')} ${label('ap')}: ${receipt.ap}. ${label('npcStrideMoveManual')}`);}
  catch(error){ui.notifications.warn(`${label(error.message)}${error.message==='npcActionWriteUncertain'?` (${operationId})`:''}`);}
 }
 static async onNpcActionSpend(event,target){
  const actor=this.actor,item=actor.items.get(target.dataset.itemId),operationId=foundry.utils.randomID();
  try{const receipt=await spendNpcActionAP({actor,item,combat:game.combat,user:game.user,isExecutor,operationId});ui.notifications.info(`${label('npcActionPaid')} ${label('ap')}: ${receipt.ap}. ${label('npcActionEffectsManual')}`);}
  catch(error){ui.notifications.warn(`${label(error.message)}${error.message==='npcActionWriteUncertain'?` (${operationId})`:''}`);}
 }
 static onNpcActionRoll(event,target){const item=this.actor.items.get(target.dataset.itemId);if(this.actor.type!=='npc'||!this.actor.isOwner||!item||item.type!=='action'||item.system.archived)return;const npcPool=verifiedNpcPool(this.actor,item,game.dawn.catalog.entries);return rollDialog(this.actor,{...rollSelection(this.actor,'combat'),context:'combat',npcPool,npcAction:item},display(item).name).catch(e=>ui.notifications.warn(e.message));}
 static async onNpcActionChat(event,target){
  const actor=this.actor,item=actor.items.get(target.dataset.itemId);
  if(actor.type!=='npc'||!actor.isOwner||!item||item.type!=='action'||item.system.archived)return;
  const view=display(item),targets=selectedTargets(),description=actionValues(view.description||item.system.notes,actor.system,actorCombatTension(actor,game.combat,game.dawn.party),game.dawn.language);
  await ChatMessage.create({speaker:ChatMessage.getSpeaker({actor}),content:`<div class="dawn-roll"><h3>${escape(view.name)}</h3>${targetsMarkup(targets)}<p class="dawn-pre">${formatRuleText(description)}</p></div>`.replaceAll('[[','&#91;&#91;'),flags:{dawn:{npcActionUuid:item.uuid,targets}}});
 }
 static async onActionChat(event,target){const entry=game.dawn.catalog.entries.find(e=>e._id===target.dataset.id);if(!entry||entry.type!=='action')return;const text=display(entry),targets=selectedTargets(),description=this.actor.type==='hero'?actionValues(text.description,this.actor.system,actorCombatTension(this.actor,game.combat,game.dawn.party),game.dawn.language):text.description;await ChatMessage.create({speaker:ChatMessage.getSpeaker({actor:this.actor}),content:`<div class="dawn-roll"><h3>${escape(text.name)}</h3>${targetsMarkup(targets)}<p class="dawn-pre">${formatRuleText(description)}</p></div>`.replaceAll('[[','&#91;&#91;'),flags:{dawn:{actionId:entry.system.canonicalId,targets}}});}
 static async onBondActionChat(event,target){
  const actor=this.actor,item=actor.items.get(target.dataset.itemId);
  if(!actor.isOwner||actor.type!=='hero'||!item||item.system.archived||item.type!=='action'||item.system.groupId!=='bond-rules'||!['bond-action','antagonistic-bond-action'].includes(item.system.mechanics?.kind))return;
  const bonds=activeItems(actor.items).filter(i=>i.type==='bond');
  if(!bonds.length)return ui.notifications.warn(label('bondActionNeedsBond'));
  const bondName=b=>{const linked=availableBondTargets(game.actors,actor,game.user).find(a=>a.uuid===b.system.mechanics?.actorUuid);return display(linked??b).name;};
  const view=display(item),options=bonds.map(b=>`<option value="${escape(b.id)}">${escape(bondName(b))} · ${escape(label('rank'))} ${b.system.rank}</option>`).join('');
  const chosen=await foundry.applications.api.DialogV2.prompt({classes:['dawn','dawn-modal'],position:{width:580},window:{title:view.name},content:`<p class="dawn-pre">${formatRuleText(view.description)}</p><label>${escape(label('bondActionChooseBond'))}<select name="bond">${options}</select></label><p>${escape(label('bondActionManualHint'))}</p>`,ok:{label:label('showChat'),callback:(_event,button)=>button.form.elements.bond.value},rejectClose:false});
  if(!chosen)return;
  const bond=actor.items.get(chosen),current=actor.items.get(item.id);
  if(!actor.isOwner||!bond||bond.type!=='bond'||bond.system.archived||current!==item||item.system.archived)return ui.notifications.warn(label('libraryUnavailable'));
  await ChatMessage.create({speaker:ChatMessage.getSpeaker({actor}),content:`<div class="dawn-roll"><h3>${escape(view.name)} · ${escape(bondName(bond))}</h3><p class="dawn-pre">${formatRuleText(view.description)}</p><p>${escape(label('bondActionManualHint'))}</p></div>`.replaceAll('[[','&#91;&#91;'),flags:{dawn:{bondActionUuid:item.uuid,bondUuid:bond.uuid}}});
 }
 static onParty(){game.dawn.party?.sheet.render({force:true});}
 static async onPartyAccount(){
  if(this.actor.type!=='party'||!isExecutor())return ui.notifications.warn(label('partyAccountPermission'));
  const heroes=game.actors.filter(a=>a.type==='hero'&&a.isOwner),players=game.users.filter(u=>!u.isGM);
  if(!heroes.length||!players.length)return ui.notifications.warn(label('partyAccountInvalid'));
  const options=(items,name)=>items.map(item=>`<option value="${escape(item.id)}">${escape(name(item))}</option>`).join('');
  const result=await foundry.applications.api.DialogV2.prompt({window:{title:label('partyAccountCreate')},position:{width:380},
   content:`<p>${escape(label('partyAccountHint'))}</p><label>${escape(label('hero'))}<select name="hero">${options(heroes,h=>display(h).name)}</select></label><label>${escape(label('partyAccountPlayer'))}<select name="player">${options(players,p=>p.name)}</select></label><label>${escape(label('influence'))}<input name="influence" type="number" min="0" step="1" value="0" required></label>`,
   ok:{label:label('partyAccountCreate'),callback:(_event,button)=>({hero:button.form.elements.hero.value,player:button.form.elements.player.value,influence:button.form.elements.influence.value.trim()===''?NaN:Number(button.form.elements.influence.value)})},rejectClose:false});
  if(!result)return;
  try{await createPartyAccount({party:this.actor,hero:game.actors.get(result.hero),player:game.users.get(result.player),user:game.user,isExecutor,actors:game.actors,users:game.users,id:foundry.utils.randomID(),influence:result.influence});await this.render();}
  catch(error){ui.notifications.warn(`${label(error.message)}${error.accountId?` (${error.accountId})`:''}`);}
 }
 async _onDropItem(event,item){
  if(!this.isEditable)return null;
  const sourceVisible=()=>canReadItemSource(item,{packs:game.packs,worldItems:game.items,worldActors:game.actors,scenes:game.scenes,user:game.user});
  if(!sourceVisible()){ui.notifications.warn(label('libraryUnavailable'));return null;}
  try{
   // Applying a temporary state is a play action; the lock protects the build.
   if(item.type==='effect'){const template=item.effects?.contents?.[0];if(!template)throw Error(label('effectTemplateMissing'));const effect=await applyEffectTemplate(this.actor,template,{sourceUuid:item.uuid,canonicalId:item.system.canonicalId||item.uuid,name:display(item).name,combat:game.combat,canApply:()=>this.isEditable&&sourceVisible()});ui.notifications.info(label('effectAppliedManual'));return effect;}
   if(!this.editing&&item.type!=='equipment'){ui.notifications.info(label('unlockToChange'));return null;}
   if(item.parent?.uuid===this.actor.uuid)return super._onDropItem(event,item);
   return await acquireItem(this.actor,item.toObject(),{level:item.type==='technique'?item.system.level:1,sourceUuid:item.uuid,sourceDocument:item,canModify:()=>this.isEditable&&(this.editing||item.type==='equipment')&&sourceVisible()});
  }catch(e){ui.notifications.warn(effectErrorMessage(e,label));return null;}
 }
 async _onDropActiveEffect(event,effect){
  if(!this.isEditable)return null;
  if(effect?.target===this.actor)return null;
  const sourceVisible=()=>canReadEffectSource(effect,{packs:game.packs,worldItems:game.items,worldActors:game.actors,scenes:game.scenes,user:game.user});
  if(!sourceVisible()){ui.notifications.warn(label('libraryUnavailable'));return null;}
  const canonicalId=effect?.getFlag('dawn','canonicalId');
  if(!canonicalId)return super._onDropActiveEffect(event,effect);
  try{const applied=await applyEffectTemplate(this.actor,effect,{sourceUuid:effect.uuid,canonicalId,name:effect.name,combat:game.combat,canApply:()=>this.isEditable&&sourceVisible()});ui.notifications.info(label('effectAppliedManual'));return applied;}
  catch(e){ui.notifications.warn(effectErrorMessage(e,label));return null;}
 }
}
