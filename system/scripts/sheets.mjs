import {formatRuleText} from './rich-text.mjs';
import {display} from "./models.mjs";
import {label,escape} from "./rolls.mjs";
import {techniqueView,mergeTechniqueLevels,techniqueEditSnapshot} from "./techniques.mjs";
import {setTechniqueLevel,validateTechniqueChange} from "./catalog.mjs";
import {DawnActorSheet} from "./actor-sheet.mjs";
export {DawnActorSheet};
const {HandlebarsApplicationMixin}=foundry.applications.api;
export class DawnItemSheet extends HandlebarsApplicationMixin(foundry.applications.sheets.ItemSheetV2){
  static DEFAULT_OPTIONS={classes:["dawn","dawn-item"],position:{width:650,height:750},window:{resizable:true},form:{submitOnChange:true,closeOnSubmit:false},actions:{show:DawnItemSheet.onShow,level:DawnItemSheet.onLevel,saveTechnique:DawnItemSheet.onSaveTechnique}};
  static PARTS={body:{template:"systems/dawn/templates/item.hbs"}};
  get title(){return display(this.item).name;}
  get isEditable(){return super.isEditable&&(!this.item.actor||this.item.actor.sheet.editing);}
  techniqueDirty=false;techniqueSaving=false;definitionOpen=false;
  render(options){if(this.techniqueDirty&&this.rendered)return Promise.resolve(this);return super.render(options);}
  async close(options){
    if(this.techniqueSaving){ui.notifications.warn(label('techniqueSaving'));return;}
    if(this.techniqueDirty){const confirmed=await foundry.applications.api.DialogV2.confirm({window:{title:label('unsavedTechniqueTitle')},content:`<p>${escape(label('unsavedTechniqueWarning'))}</p>`,rejectClose:false});if(!confirmed||this.techniqueSaving)return;this.techniqueDirty=false;}
    return super.close(options);
  }
  async _prepareContext(options){const s=this.item.system,lang=game.dawn.language,archetypes=[...game.dawn.catalog.archetypes];this.definitionOpen=this.element?.querySelector('[data-technique-editor]')?.open??this.definitionOpen;if(s.archetypeId&&!archetypes.some(a=>a.id===s.archetypeId))archetypes.push({id:s.archetypeId,[lang]:s.archetypeId});const definition=techniqueView({id:this.item.id,name:this.item.name,system:{content:s.content,level:s.level,archetypeId:s.archetypeId,complexity:s.complexity,overrides:{}}},lang);return {...await super._prepareContext(options),item:this.item,system:s,text:display(this.item),technique:techniqueView(this.item,lang),definition,definitionOpen:this.definitionOpen,editorLanguage:lang,archetypeOptions:archetypes.map(a=>({id:a.id,name:a[lang],selected:a.id===s.archetypeId})),editable:this.isEditable,source:display(this.item).source??s.content.en?.source,hasContent:!!s.content.en?.name,isTechnique:this.item.type==="technique",isRanked:["skill","ability","bond"].includes(this.item.type),supportLabel:label(s.support),legacyNotes:s.origin.legacyLevels??[]};}
  _onRender(context,options){super._onRender(context,options);const editor=this.element.querySelector('[data-technique-editor]');if(editor){this.techniqueSnapshot=techniqueEditSnapshot(this.item,editor.dataset.language);for(const type of ['input','change'])editor.addEventListener(type,()=>{this.techniqueDirty=true;});}}
  _onChangeForm(config,event){if(event.target.closest?.('[data-technique-editor]'))return;return super._onChangeForm(config,event);}
  _processFormData(event,form,formData){const data=super._processFormData(event,form,formData);for(const k of ["name","description"])if(data.system?.overrides?.[k]===""&&this.item.system.overrides[k]===undefined)delete data.system.overrides[k];return data;}
  static async onSaveTechnique(){
    if(!this.isEditable)return ui.notifications.warn(label('unlockToChange'));
    if(this.techniqueSaving)return;
    let editor,controls=[];
    try{
      editor=this.element.querySelector('[data-technique-editor]');const lang=editor?.dataset.language;
      if(!editor||!['ru','en'].includes(lang))throw Error(label('invalidTechniqueDefinition'));
      if(this.techniqueSnapshot!==undefined&&this.techniqueSnapshot!==techniqueEditSnapshot(this.item,lang))throw Error(label('techniqueEditConflict'));
      const value=key=>editor.querySelector(`[data-definition-field="${key}"]`)?.value;
      const name=value('name')?.trim(),archetype=value('archetype'),complexity=Number(value('complexity'));
      if(!name||!game.dawn.catalog.archetypes.some(a=>a.id===archetype)||!Number.isSafeInteger(complexity)||complexity<1)throw Error(label('invalidTechniqueDefinition'));
      if(this.item.actor&&archetype!==this.item.system.archetypeId)validateTechniqueChange(this.item.actor,{system:{archetypeId:archetype}},this.item.system.level,this.item);
      const rows=[1,2,3].map(n=>({name:editor.querySelector(`[data-level="${n}"][data-level-field="name"]`)?.value,text:editor.querySelector(`[data-level="${n}"][data-level-field="text"]`)?.value}));
      const levels=mergeTechniqueLevels(this.item.system.content?.[lang]?.levels,rows);
      if(!this.isEditable)throw Error(label('unlockToChange'));
      this.techniqueSaving=true;this.techniqueDirty=true;controls=[...editor.querySelectorAll('input,textarea,select,button')];controls.forEach(control=>control.disabled=true);
      await this.item.update({...(this.item.system.canonicalId?{}:{name}), 'system.archetypeId':archetype,'system.complexity':complexity,[`system.content.${lang}.name`]:name,[`system.content.${lang}.tags`]:value('tags'),[`system.content.${lang}.flavor`]:value('flavor'),[`system.content.${lang}.levels`]:levels});
      this.techniqueDirty=false;await this.render();
    }catch(e){ui.notifications.warn(e.message);}finally{controls.forEach(control=>control.disabled=false);this.techniqueSaving=false;}
  }
  static async onLevel(event,target){if(!this.isEditable)return;try{const level=Number(target.dataset.level);if(this.item.actor)await setTechniqueLevel(this.item.actor,this.item,level);else await this.item.update({"system.level":level});}catch(e){ui.notifications.warn(e.message);}}
  static async onShow(){const v=display(this.item),tech=this.item.type==="technique"?techniqueView(this.item,game.dawn.language):null;const text=tech?tech.levels.filter(l=>l.learned).map(l=>`<h4>${l.n}. ${escape(l.name)}</h4><p class="dawn-pre">${formatRuleText(l.text)}</p>`).join(""):`<p class="dawn-pre">${formatRuleText(v.description)}</p>`;await ChatMessage.create({speaker:ChatMessage.getSpeaker({actor:this.item.actor}),content:`<div class="dawn-roll"><h3>${escape(v.name)}</h3>${text}</div>`});}
}
