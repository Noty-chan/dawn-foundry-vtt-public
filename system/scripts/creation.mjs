import {isGadget,isPersonalAbility} from './gadgets.mjs';
import {label} from './rolls.mjs';
import {display} from './models.mjs';
import {activeItems,techniqueView} from './techniques.mjs';
import {creationBudget,abilityCost} from './creation-rules.mjs';
import {acquireItem,restoreArchivedItem} from './catalog.mjs';
const {ApplicationV2,HandlebarsApplicationMixin}=foundry.applications.api;
const finishing=new Map();
export async function finishCreation(actor){
 if(finishing.has(actor.uuid))return finishing.get(actor.uuid);
 const pending=finishCreationNow(actor);finishing.set(actor.uuid,pending);
 try{return await pending;}finally{if(finishing.get(actor.uuid)===pending)finishing.delete(actor.uuid);}
}
async function finishCreationNow(actor){
 if(!actor.isOwner)throw Error(label('noPermission'));
 if(actor.system.build.status==='ready')return false;
 const budget=creationBudget(actor.system,actor.items);
 if(actor.system.build.standard&&budget.errors.length)throw Error(budget.errors.map(k=>label(`validation.${k}`)).join('; '));
 const inherent=game.dawn.catalog.outlooks.find(o=>o.id===actor.system.primaryOutlook)?.inherent;
 if(inherent){const removed=actor.items.find(i=>i.system.canonicalId===inherent&&i.system.archived);if(removed)throw Error(label('restoreRequiredBoon'));const entry=game.dawn.catalog.entries.find(e=>e.type==='boon'&&e.system.canonicalId===inherent);if(!entry)throw Error(label('requiredBoonMissing'));await acquireItem(actor,entry);}
 await actor.update({'system.build.status':'ready','system.health.value':actor.system.health.max,'system.focus.value':0,'system.evasion.value':0});
 actor.sheet.editing=false;await actor.sheet.render({force:true});return true;
}
export class DawnCreation extends HandlebarsApplicationMixin(ApplicationV2){
 static DEFAULT_OPTIONS={classes:['dawn','dawn-creation'],position:{width:830,height:820},window:{resizable:true},actions:{step:DawnCreation.onStep,next:DawnCreation.onNext,previous:DawnCreation.onPrevious,save:DawnCreation.onSave,ability:DawnCreation.onAbility,catalog:DawnCreation.onCatalog,finish:DawnCreation.onFinish,sheet:DawnCreation.onSheet,addSkill:DawnCreation.onAddSkill,archive:DawnCreation.onArchive,restore:DawnCreation.onRestore}};
 static PARTS={body:{template:'systems/dawn/templates/creation.hbs'}};
 step=0;busy=false;formDirty=false;abilityDirty=false;wordSelection={};
 constructor(actor){super();this.actor=actor;}
 get title(){return `DAWN · ${label('createCharacter')} · ${this.actor.name}`;}
 async _prepareContext(){
  const actor=this.actor,system=actor.system,items=activeItems(actor.items),lang=game.dawn.language,refs=game.dawn.creation,budget=creationBudget(system,items),ability=items.find(isPersonalAbility);
  const steps=['concept','attributes','features','outlook','techniques','review'];
  const saved=ability?.system.mechanics.words??{};
  const wordGroups=Object.entries(refs.words).map(([kind,rows])=>({kind,label:label(`abilityWord.${kind}`),rows:rows.map(w=>({id:w.id,name:w[lang==='ru'?'ru':'name'],cost:w.costLabel??w.cost,marks:w.marks,selected:(this.wordSelection[kind]??saved[kind])===w.id}))}));
  return {actor,system,budget,steps:steps.map((key,index)=>({index,label:label(`creationSteps.${key}`),active:index===this.step})),concept:this.step===0,attributesStep:this.step===1,featuresStep:this.step===2,outlookStep:this.step===3,techniquesStep:this.step===4,review:this.step===5,first:this.step===0,last:this.step===5,busy:this.busy,locked:!this.actor.sheet.editing,ready:system.build.status==='ready',
   attributes:['body','talent','spirit','mind'].map(key=>({key,label:label(key),value:system.attributes[key]})),skills:refs.skills.map(s=>{const item=items.find(i=>i.system.canonicalId===s.id);return {id:s.id,name:lang==='ru'?s.ru:s.name,attribute:label(s.attribute),ranks:[0,1,2,3].map(n=>({n,selected:n===(item?.system.rank??0)}))};}),wordGroups,extraNouns:refs.words.nouns.map(w=>({id:w.id,name:lang==='ru'?w.ru:w.name,cost:w.cost,selected:ability?.system.mechanics.extraNoun===w.id})),freeCondition:ability?.system.mechanics.freeCondition??false,freeSelectedCondition:ability?.system.mechanics.freeSelectedCondition??false,freeConditionText:ability?.system.mechanics.freeConditionText??'',specialization:ability?.system.mechanics.specialization??'',ability:ability?{id:ability.id,...display(ability),rank:ability.system.rank,cost:ability.system.purchaseCost,totalCost:Math.max(1,ability.system.purchaseCost)+ability.system.rank-1}:null,
   customSkills:items.filter(i=>i.type==='skill'&&!refs.skills.some(s=>s.id===i.system.canonicalId)).map(i=>({id:i.id,...display(i),rank:i.system.rank,attribute:i.system.mechanics?.attribute??'',attributeOptions:Object.fromEntries(['body','talent','spirit','mind'].map(k=>[k,label(k)]))})),archivedItems:actor.items.filter(i=>i.system.archived&&!i.system.origin?.supersededBy&&['skill','ability','boon','technique'].includes(i.type)).map(i=>({id:i.id,...display(i)})),
   outlooks:game.dawn.catalog.outlooks.map(o=>({id:o.id,name:o[lang],selected:o.id===system.primaryOutlook})),boons:items.filter(i=>i.type==='boon').map(i=>({id:i.id,...display(i),inherent:i.system.inherent})),techniques:items.filter(i=>i.type==='technique').map(i=>techniqueView(i,lang)),errors:budget.errors.map(k=>label(`validation.${k}`)),canFinish:!budget.errors.length||!system.build.standard};
 }
 async _onRender(context,options){await super._onRender(context,options);this.formDirty=false;this.abilityDirty=false;const body=this.element.querySelector('.dawn-creation-body');const markDirty=event=>{this.formDirty=true;if(event.target.closest?.('.dawn-ability-builder'))this.abilityDirty=true;};body?.addEventListener('input',markDirty);body?.addEventListener('change',markDirty);this.element.querySelectorAll('[data-word]').forEach(el=>el.addEventListener('change',()=>{this.wordSelection[el.dataset.word]=el.value;}));}
 async saveStep({skipSkillId=null}={}){
  if(!this.actor.isOwner||!this.actor.sheet.editing)throw Error(label('unlockToChange'));
  if(this.actor.system.build.status==='ready')throw Error(label('alreadyReady'));
  const get=name=>this.element.querySelector(`[name="${name}"]`),actor=this.actor;
  if(this.step===0)await actor.update({name:get('heroName').value.trim()||label('newHero'),'system.biography':get('biography').value});
  if(this.step===1){const values=Object.fromEntries(['body','talent','spirit','mind'].map(key=>[key,Number(get(key).value)]));await actor.update({'system.attributes':values});}
  if(this.step===2){
   const updates=[],creates=[];
   for(const s of game.dawn.creation.skills){const n=Number(get(s.id).value),old=actor.items.find(i=>i.system.canonicalId===s.id);if(old){updates.push({_id:old.id,'system.rank':n||old.system.rank,'system.archived':n===0});}else if(n){creates.push({name:game.dawn.language==='ru'?s.ru:s.name,type:'skill',system:{canonicalId:s.id,rank:n,content:{en:{name:s.name,description:s.description?.[0]??""},ru:{name:s.ru,description:s.description?.[1]??""}},mechanics:{attribute:s.attribute}}});}}
   for(const el of this.element.querySelectorAll('[data-custom-skill]')){const id=el.dataset.customSkill,item=actor.items.get(id);if(id===skipSkillId||!item||item.type!=='skill'||item.system.archived)continue;const name=el.querySelector('[data-custom-name]').value.trim(),description=el.querySelector('[data-custom-description]').value,rank=Number(el.querySelector('[data-custom-rank]').value),attribute=el.querySelector('[data-custom-attribute]').value;if(!name||!Number.isInteger(rank)||rank<1||rank>3||!['body','talent','spirit','mind'].includes(attribute))throw Error(label('invalidCustomSkill'));updates.push({_id:id,name,'system.overrides.name':name,'system.overrides.description':description,'system.rank':rank,'system.mechanics.attribute':attribute});}
   if(updates.length)await actor.updateEmbeddedDocuments('Item',updates);if(creates.length)await actor.createEmbeddedDocuments('Item',creates);
  }
  if(this.step===3){const primary=get('outlook').value;if(primary!==actor.system.primaryOutlook){await actor.update({'system.primaryOutlook':primary});const obsolete=activeItems(actor.items).filter(i=>i.type==='boon'&&i.system.groupId!==primary);if(obsolete.length)await actor.updateEmbeddedDocuments('Item',obsolete.map(i=>({_id:i.id,'system.archived':true})));}}
  if(actor.sheet.rendered)await actor.sheet.render();
 }
 async run(action){if(this.busy)return;this.busy=true;let succeeded=false;try{await action();succeeded=true;}catch(e){ui.notifications.warn(e.message);}finally{this.busy=false;if(succeeded&&this.rendered){this.formDirty=false;await this.render({window:{title:this.title}});}}}
 async saveCurrent(options={}){if(this.step===2&&this.abilityDirty)return this.saveAbility(options);return this.saveStep(options);}
 static onStep(event,target){return this.run(async()=>{await this.saveCurrent();this.step=Number(target.dataset.step);});}
 static onNext(){return this.run(async()=>{await this.saveCurrent();this.step=Math.min(5,this.step+1);});}
 static onPrevious(){return this.run(async()=>{await this.saveCurrent();this.step=Math.max(0,this.step-1);});}
 static onSave(){return this.run(()=>this.saveCurrent());}
 static onAbility(){return this.run(()=>this.saveAbility());}
 async saveAbility(options={}){
  const selected={},words=[],refs=game.dawn.creation;
  const freeCondition=this.element.querySelector('[name="freeCondition"]').checked,freeSelectedCondition=this.element.querySelector('[name="freeSelectedCondition"]').checked,freeConditionText=this.element.querySelector('[name="freeConditionText"]').value.trim(),specialization=this.element.querySelector('[name="specialization"]').value.trim(),extraNoun=refs.words.nouns.find(w=>w.id===this.element.querySelector('[name="extraNoun"]').value);
  if(freeCondition&&freeSelectedCondition)throw Error(label('abilityConditionConflict'));
  for(const [kind,rows] of Object.entries(refs.words)){
   let id=this.element.querySelector(`[data-word="${kind}"]`).value;
   if(kind==='conditions'&&freeCondition)id='';
   const w=rows.find(w=>w.id===id);
   if(kind==='conditions'&&freeSelectedCondition&&freeConditionText&&w)throw Error(label('abilityConditionConflict'));
   if(!w&&!(kind==='conditions'&&(freeCondition||(freeSelectedCondition&&freeConditionText))))throw Error(label('chooseAbilityWords'));
   selected[kind]=id;words.push(w??{name:'',ru:'',cost:0});
  }
  const rank=Number(this.element.querySelector('[name="abilityRank"]').value),cost=abilityCost(words,rank,{freeCondition:freeCondition||freeSelectedCondition,specializedNoun:!!specialization,extraNoun});
  const verb=locale=>words[0][locale].replace(/X/g,extraNoun?.[locale]??'X');
  const condition=locale=>freeCondition?'':freeSelectedCondition&&freeConditionText?freeConditionText:words[2][locale].replace(/X/g,extraNoun?.[locale]??'X');
  const en=`You can ${verb('name')} ${specialization||words[1].name}${condition('name')?`, so long as ${condition('name')}`:''}.`,ru=`Вы можете: ${verb('ru')} ${specialization||words[1].ru}${condition('ru')?`, при условии: ${condition('ru')}`:''}.`;

  await this.saveStep(options);
  const old=activeItems(this.actor.items).find(isPersonalAbility),data={name:game.dawn.language==='ru'?`${verb('ru')} · ${specialization||words[1].ru}`:`${verb('name')} · ${specialization||words[1].name}`,type:'ability',system:{rank,purchaseCost:cost.purchaseCost,content:{en:{name:`${verb('name')} · ${specialization||words[1].name}`,description:en},ru:{name:`${verb('ru')} · ${specialization||words[1].ru}`,description:ru}},mechanics:{words:selected,freeCondition,freeSelectedCondition,freeConditionText:freeSelectedCondition?freeConditionText:'',specialization,extraNoun:extraNoun?.id??null}}};
  if(old)await old.update({'system.rank':rank,'system.purchaseCost':cost.purchaseCost,'system.content':data.system.content,'system.mechanics':data.system.mechanics});else await this.actor.createEmbeddedDocuments('Item',[data]);
  this.abilityDirty=false;
 }
 static onCatalog(){return this.run(async()=>{await this.saveStep();game.dawn.openCatalog(this.actor,{filter:this.step===3?'boon':'technique',canModify:()=>this.actor.isOwner&&this.actor.sheet.editing});});}
 static onAddSkill(){return this.run(async()=>{await this.saveCurrent();await this.actor.createEmbeddedDocuments('Item',[{name:label('newSource.skill'),type:'skill',system:{mechanics:{attribute:'body'}}}]);});}
 static onArchive(event,target){return this.run(async()=>{const item=this.actor.items.get(target.dataset.itemId);if(!item||item.system.archived)return;if(item.type==='ability')await this.saveStep();else await this.saveCurrent({skipSkillId:item.type==='skill'?item.id:null});await item.update({'system.archived':true});if(item.type==='ability')this.wordSelection={};});}
 static onRestore(event,target){return this.run(async()=>{await this.saveCurrent();const item=this.actor.items.get(target.dataset.itemId);if(item?.system.archived)await restoreArchivedItem(this.actor,item);});}
 static onSheet(){return this.run(async()=>{await this.saveCurrent();this.actor.sheet.currentTab=this.step===2?'free':this.step===4?'combat':'overview';this.actor.sheet.render({force:true});});}
 static onFinish(){return this.run(async()=>{await this.saveStep();await finishCreation(this.actor);await this.close();});}
}
