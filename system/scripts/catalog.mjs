import {isGadget,isPersonalAbility} from './gadgets.mjs';
import {display} from "./models.mjs";
import {escape,label} from "./rolls.mjs";
import {activeItems,techniqueRanks,techniqueView} from "./techniques.mjs";
import {applyEffectTemplate,effectErrorMessage} from "./effect-application.mjs";
import {catalogPack,searchLibraryPacks,searchWorldItems,resolveLibraryEntry,sameLibrarySource,canReadItemSource} from "./library-index.mjs";
import {prepareNPCData} from "./npc-deployment.mjs";
const {ApplicationV2,HandlebarsApplicationMixin,DialogV2}=foundry.applications.api;
export async function loadCatalog(){const response=await fetch("systems/dawn/data/catalog.json");if(!response.ok)throw Error("DAWN catalog unavailable");return response.json();}
export function catalogUuid(entry){return `Compendium.${catalogPack(entry)}.${entry.type==="npc"?"Actor":"Item"}.${entry._id}`;}
export class DawnCatalog extends HandlebarsApplicationMixin(ApplicationV2){
  static DEFAULT_OPTIONS={id:"dawn-catalog",classes:["dawn","dawn-library"],window:{title:"DAWN",resizable:true},position:{width:850,height:800},actions:{searchChat:DawnCatalog.onSearchChat,type:DawnCatalog.onType,archetype:DawnCatalog.onArchetype,learn:DawnCatalog.onLearn,take:DawnCatalog.onTake,applyEffect:DawnCatalog.onApplyEffect,document:DawnCatalog.onDocument,createTechnique:DawnCatalog.onCreateTechnique}};
  static PARTS={body:{template:"systems/dawn/templates/catalog.hbs"}};
  actor=null;filter="technique";archetype="";query="";
  constructor(options={}){const role=options.role==="narrator"?"narrator":"character";super({...options,id:`dawn-catalog-${role}`});this.role=role;this.actor=options.actor??null;this.filter=options.filter??(role==="narrator"?"npc":"technique");}
  get title(){return `DAWN · ${label(this.role==="narrator"?"narratorLibrary":"characterLibrary")}${this.actor?` · ${display(this.actor).name}`:""}`;}
  async _prepareContext(){
    const lang=game.dawn.language,data=game.dawn.catalog,query=this.query;
    const itemTypes=['bondRules','bond'].includes(this.filter)?['bond','action']:[this.filter];
    const index=await searchLibraryPacks(game.packs,{types:itemTypes,query,language:lang,catalogPacks:game.dawn.catalogPacks});
    index.entries.push(...searchWorldItems(game.items,{user:game.user,types:itemTypes,query,language:lang,label:label('worldItems')}));
    if(['bondRules','bond'].includes(this.filter))index.entries=index.entries.filter(e=>e.type==='bond'||e.system?.groupId==='bond-rules');
    else if(this.filter==='action')index.entries=index.entries.filter(e=>e.system?.groupId!=='bond-rules');
    index.entries.sort((a,b)=>a.displayName.localeCompare(b.displayName,lang)||a.uuid.localeCompare(b.uuid));
    const initialOutlook=this.actor?.type==='hero'&&this.actor.system.build.standard&&this.actor.system.build.status==='draft'?this.actor.system.primaryOutlook:null;
    const entries=index.entries.filter(e=>(!initialOutlook||e.type!=='boon'||e.system?.groupId===initialOutlook)&&(!this.archetype||e.type!=="technique"||e.system?.archetypeId===this.archetype)).map(e=>({...e,system:e.system??{}}));
    this.libraryRows=entries;
    this.libraryQuery=query;
    const owned=activeItems(this.actor?.items??[]),canAdd=this.canModifyActor();
    const findOwned=e=>owned.find(i=>sameLibrarySource(i,{uuid:e.uuid,canonicalId:e.system?.canonicalId}));
    const rows=entries.map(e=>{const text=display(e),item=findOwned(e);return {...text,name:e.displayName,id:e._id,uuid:e.uuid,packLabel:e.packLabel,type:e.type,isNpc:e.type==="npc",isEffect:e.type==="effect",owned:!!item,level:item?.system.level??0,canAdd:canAdd||["npc","effect"].includes(e.type)&&game.user.isGM,source:e.system?.content?.en?.source?.pdfPage};});
    const archetypes=[...data.archetypes];for(const e of entries.filter(e=>e.type==='technique')){const id=e.system?.archetypeId??'';if(!archetypes.some(a=>a.id===id))archetypes.push({id,[lang]:id||label('otherArchetype')});}
    const groups=archetypes.map(a=>({id:a.id,name:a[lang],rows:entries.filter(e=>e.type==="technique"&&(e.system?.archetypeId??'')===a.id).map(e=>{const item=findOwned(e),view=techniqueView(e,lang);return {...view,id:e._id,uuid:e.uuid,packLabel:e.packLabel,ownedLevel:item?.system.level??0,canAdd,levels:view.levels.map(l=>({...l,chosen:l.n<=(item?.system.level??0)}))};})})).filter(a=>a.rows.length);
    return {libraryTitle:label(this.role==="narrator"?"narratorLibrary":"characterLibrary"),query:this.query,indexFailures:index.failures,target:this.actor?display(this.actor).name:"",actorUuid:this.actor?.uuid,actors:game.actors.filter(a=>a.type==="hero"&&a.isOwner).map(a=>({uuid:a.uuid,name:a.name,selected:a.uuid===this.actor?.uuid})),types:(this.role==="narrator"?["npc","modifier","action","effect","technique","boon","bondRules"]:["technique","boon","skill","ability","bondRules","equipment"]).map(t=>({id:t,name:label(t),active:t===this.filter})),isTechniques:this.filter==="technique",canCreateTechnique:this.filter==='technique'&&globalThis.Item?.canUserCreate?.(game.user)===true,archetypes:[{id:"",name:label("allArchetypes"),active:!this.archetype},...data.archetypes.map(a=>({id:a.id,name:a[lang],active:a.id===this.archetype}))],groups,rows,count:entries.length,rankTotal:this.actor?techniqueRanks(this.actor.items):0,startingBudget:this.actor?.type==="hero"&&this.actor.system.build.standard&&this.actor.system.build.status==="draft"&&this.actor.system.tier===1,canAdd};
  }
  canModifyActor(){return !!this.actor?.isOwner&&(this.canModify?this.canModify():!!this.actor.sheet.editing);}
  _onRender(context,options){
    super._onRender(context,options);clearTimeout(this.searchTimer);
    this.element.querySelector("[data-search]").addEventListener("input",e=>{this.query=e.target.value;const query=this.query,caret=e.target.selectionStart;clearTimeout(this.searchTimer);this.searchTimer=setTimeout(async()=>{if(!this.rendered)return;await this.render();if(!this.rendered||this.query!==query)return;const input=this.element.querySelector("[data-search]");input?.focus();input?.setSelectionRange(caret,caret);},200);});
    this.element.querySelector("[data-target-actor]")?.addEventListener("change",async e=>{this.actor=e.target.value?await fromUuid(e.target.value):null;this.canModify=null;await this.render({window:{title:this.title}});});
    this.element.querySelectorAll("[draggable=true][data-uuid]").forEach(el=>el.addEventListener("dragstart",event=>{event.dataTransfer.setData("text/plain",JSON.stringify({type:el.dataset.documentType??"Item",uuid:el.dataset.uuid}));}));
  }
  static onType(event,target){this.filter=target.dataset.type;this.render();}
  static onArchetype(event,target){this.archetype=target.dataset.archetype;this.render();}
  static async onSearchChat(event,target){
    if(target.disabled)return;
    const query=this.query.trim();
    if(!query||this.libraryQuery!==this.query)return;
    const rows=(this.libraryRows??[]).filter(row=>!this.archetype||row.type!=='technique'||row.system?.archetypeId===this.archetype);
    target.disabled=true;
    try{
      const list=document.createElement('ul');
      const resolved=await Promise.allSettled(rows.slice(0,50).map(async row=>{
        const doc=await resolveLibraryEntry(game.packs,row,{worldItems:game.items,user:game.user});
        return doc?.toAnchor({name:row.displayName});
      }));
      for(const result of resolved){
        if(result.status!=='fulfilled'||!result.value)continue;
        const item=document.createElement('li');
        item.append(result.value);
        list.append(item);
      }
      if(!list.childElementCount)return ui.notifications.info(label('noEntries'));
      const omitted=list.childElementCount<rows.length?`<p>${escape(label('librarySearchChatLimited'))}</p>`:'';
      await ChatMessage.create({content:`<h3>${escape(label('search'))} · ${escape(query)}</h3>${list.outerHTML}${omitted}`,whisper:[game.user.id]});
    }catch(error){console.error('DAWN search results',error);ui.notifications.warn(label('libraryUnavailable'));}
    finally{target.disabled=false;}
  }
  async resolveRow(target){const uuid=target.dataset.uuid??target.closest('[data-uuid]')?.dataset.uuid;const row=this.libraryRows?.find(e=>e.uuid===uuid);const doc=await resolveLibraryEntry(game.packs,row,{worldItems:game.items,user:game.user});if(!doc)throw Error(label('libraryUnavailable'));return doc;}
  static async onCreateTechnique(){if(!Item.canUserCreate(game.user))return ui.notifications.warn(label('noPermission'));const item=await Item.create({name:label('newTechnique'),type:'technique',system:{archetypeId:game.dawn.catalog.archetypes[0]?.id??''}});if(item){item.sheet.definitionOpen=true;item.sheet.render({force:true});}}
  static async onDocument(event,target){try{const doc=await this.resolveRow(target);doc.sheet.render({force:true});}catch(e){ui.notifications.warn(e.message);}}
  static async onApplyEffect(event,target){
    try{
      if(!game.user.isGM)throw Error(label('gmOnly'));
      const targets=Array.from(game.user.targets??[]),actors=[...new Map(targets.filter(t=>t.actor&&!t.document?.getFlag?.('dawn','fodderController')).map(t=>[t.actor.uuid,t.actor])).values()];
      if(!actors.length)throw Error(label('effectChooseTargets'));
      const item=await this.resolveRow(target),template=item?.effects?.contents?.[0];
      if(!item||!template)throw Error(label('effectTemplateMissing'));
      let applied=0;
      for(const actor of actors){
        try{const canApply=()=>game.user.isGM&&canReadItemSource(item,{packs:game.packs,worldItems:game.items,user:game.user});if(!canApply())throw Error(label('libraryUnavailable'));await applyEffectTemplate(actor,template,{sourceUuid:item.uuid,canonicalId:item.system.canonicalId||item.uuid,name:display(item).name,combat:game.combat,canApply});applied++;}
        catch(e){ui.notifications.warn(`${label('effectPartial')} ${applied}/${actors.length}: ${effectErrorMessage(e,label)}`);return;}
      }
      ui.notifications.info(label('effectAppliedManual'));
    }catch(e){ui.notifications.warn(e.message);}
  }
  static async onLearn(event,target){
    try{const actor=this.actor;if(!actor)throw Error(label("selectActor"));if(!this.canModifyActor())throw Error(label("unlockToChange"));const doc=await this.resolveRow(target);if(doc.type!=='technique')throw Error(label('libraryUnavailable'));const canModify=()=>this.actor===actor&&this.canModifyActor()&&canReadItemSource(doc,{packs:game.packs,worldItems:game.items,user:game.user});await acquireItem(actor,doc.toObject(),{level:Number(target.dataset.level),sourceUuid:doc.uuid,sourceDocument:doc,canModify});await this.render();}catch(e){ui.notifications.warn(e.message);}
  }
  static async onTake(event,target){
    try{const actor=this.actor;const doc=await this.resolveRow(target);const canModify=()=>this.actor===actor&&this.canModifyActor()&&canReadItemSource(doc,{packs:game.packs,worldItems:game.items,user:game.user});if(doc.type==="npc"){
      if(!game.user.isGM)throw Error(label('gmOnly'));
      let actor;if(doc.pack==='dawn.npc')actor=await createNPC(doc);else{const data=doc.toObject();delete data._id;delete data.folder;actor=await Actor.create(data);}
      actor?.sheet.render({force:true});
    }else{if(!actor)throw Error(label("selectActor"));if(!canModify())throw Error(label("unlockToChange"));await acquireItem(actor,doc.toObject(),{sourceUuid:doc.uuid,sourceDocument:doc,canModify});await this.render();}}catch(e){ui.notifications.warn(e.message);}
  }
}
const acquisitionQueues=new Map();
export async function acquireItem(actor,entry,options={}){
  const key=actor.uuid,previous=acquisitionQueues.get(key)??Promise.resolve();
  const pending=previous.catch(()=>{}).then(()=>acquireItemNow(actor,entry,options));
  acquisitionQueues.set(key,pending);
  try{return await pending;}finally{if(acquisitionQueues.get(key)===pending)acquisitionQueues.delete(key);}
}
async function acquireItemNow(actor,entry,{level=1,sourceUuid=null,sourceDocument=null,canModify=null}={}){
  if(!actor.isOwner)throw Error(label("noPermission"));
  if(canModify&&!canModify())throw Error(label('unlockToChange'));
  if(sourceDocument){if(sourceDocument.uuid!==sourceUuid||sourceDocument.type!==entry?.type)throw Error(label('libraryUnavailable'));entry=sourceDocument.toObject();}
  if(!entry||!["skill","ability","bond","technique","boon","equipment","action","modifier"].includes(entry.type))throw Error("Invalid Item type");
  const all=actor.items.contents,existing=all.find(i=>sameLibrarySource(i,{uuid:sourceUuid,canonicalId:entry.system.canonicalId}));
  if(existing&&existing.type!==entry.type)throw Error(label('libraryUnavailable'));
  if(isPersonalAbility(entry)&&actor.type==='hero'&&actor.system.build?.standard&&activeItems(actor.items).some(i=>isPersonalAbility(i)&&i!==existing))throw Error(label('validation.oneAbility'));
  if(entry.type==='boon'&&actor.type==='hero'&&actor.system.build.standard&&actor.system.build.status==='draft'&&!entry.system.inherent){
    if(entry.system.groupId!==actor.system.primaryOutlook)throw Error(label('validation.twoBoons'));
    const owned=activeItems(actor.items).filter(i=>i.type==='boon'&&!i.system.inherent);
    if(owned.length>=2&&!owned.includes(existing))throw Error(label('validation.twoBoons'));
  }
  if(entry.type==="technique"){
    if(!Number.isSafeInteger(level)||level<1||level>3)throw Error("Invalid Technique level");
    if(existing&&!existing.system.archived&&existing.system.level>=level)return existing;
    validateTechniqueChange(actor,entry,level,existing);
    if(existing){await existing.update({"system.level":level,"system.archived":false});return existing;}
  }else if(existing){if(existing.system.archived)await restoreArchivedItem(actor,existing);return existing;}
  const data=foundry.utils.deepClone(entry);delete data._id;delete data.folder;
  if(entry.type==="technique"){data.system.level=level;if(!data.system.groupId)data.system.groupId=sourceUuid??foundry.utils.randomID();}
  data.name=display(entry).name;data.system.archived=false;
  data.system.origin={...data.system.origin,canonicalId:entry.system.canonicalId??"",uuid:sourceUuid??(game.dawn.catalog.entries.some(e=>e._id===entry._id&&e.type===entry.type)?catalogUuid(entry):entry.system.origin?.uuid??null),catalogVersion:game.system.version};
  const created=(await actor.createEmbeddedDocuments("Item",[data]))[0];
  if(entry.type==='technique'&&actor.type==='hero'&&!actor.system.primaryArchetype)await actor.update({'system.primaryArchetype':entry.system.archetypeId});
  return created;
}
/** Restore the same embedded document, keeping its notes, identity and overrides. */
export async function restoreArchivedItem(actor,item){
  if(!actor?.isOwner||item?.parent?.uuid!==actor.uuid||!item.system.archived)throw Error(label('noPermission'));
  const live=activeItems(actor.items);
  if(isPersonalAbility(item)&&actor.system.build?.standard&&live.some(isPersonalAbility))throw Error(label('validation.oneAbility'));
  if(item.type==='technique')validateTechniqueChange(actor,item,item.system.level,item);
  if(item.type==='boon'&&actor.type==='hero'&&actor.system.build?.standard&&actor.system.build?.status==='draft'){
    if(item.system.groupId!==actor.system.primaryOutlook)throw Error(label('validation.twoBoons'));
    if(!item.system.inherent&&live.filter(i=>i.type==='boon'&&!i.system.inherent).length>=2)throw Error(label('validation.twoBoons'));
  }
  return item.update({'system.archived':false});
}
export function validateTechniqueChange(actor,entry,level,existing){
  if(actor.type!=="hero"||!actor.system.build.standard)return;
  const tech=activeItems(actor.items).filter(i=>i.type==="technique"&&i.id!==existing?.id);
  const archetypes=new Set([...tech.map(i=>i.system.archetypeId),entry.system.archetypeId]);
  if(archetypes.size>3)throw Error(label("threeArchetypes"));
  if(actor.system.build.status==="draft"&&techniqueRanks(tech)+level>5)throw Error(label("fiveLevels"));
  if(actor.system.build.status==="ready"&&techniqueRanks(tech)+level>5+2*(actor.system.tier-1))throw Error(label("developmentBudgetExceeded"));
}
export async function setTechniqueLevel(actor,item,level){
  if(!actor.isOwner)throw Error(label("noPermission"));
  if(!item||item.type!=="technique"||!Number.isSafeInteger(level)||level<0||level>3)throw Error("Invalid Technique level");
  if(level===0)return item.update({"system.archived":true});
  validateTechniqueChange(actor,item,level,item);
  return item.update({"system.level":level});
}
export async function createNPC(entry,{tier}={}){
  if(!game.user.isGM)throw Error(label("gmOnly"));
  if(entry?.type!=="npc"||!entry.system.canonicalId.startsWith("lionwing.npc."))throw Error("Choose a book NPC profile");
  tier??=await DialogV2.prompt({classes:["dawn","dawn-modal"],position:{width:620},window:{title:display(entry).name},content:`<p>${escape(label("presetTierHint"))}</p><label>${escape(label("tier"))}<input name="tier" type="number" value="1" min="0" max="6"></label>`,ok:{label:label("create"),callback:(event,button)=>Number(button.form.elements.tier.value)},rejectClose:false});
  if(tier===null||tier===undefined)return null;
  const data=prepareNPCData(entry,{tier,deploymentId:foundry.utils.randomID(),name:display(entry).name});
  if(data.system.deployment.requiresManual)ui.notifications.warn(label("specialDeployment"));
  return Actor.create(data);
}
