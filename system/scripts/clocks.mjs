import {label,escape} from './rolls.mjs';
import {isExecutor} from './operations.mjs';

const {ApplicationV2,HandlebarsApplicationMixin}=foundry.applications.api;
export class DawnClocks extends HandlebarsApplicationMixin(ApplicationV2){
  static DEFAULT_OPTIONS={id:'dawn-clocks',classes:['dawn','dawn-clocks'],window:{title:'DAWN',resizable:true},position:{width:390,height:'auto'},actions:{add:this.add,change:this.change,remove:this.remove}};
  static PARTS={body:{template:'systems/dawn/templates/clocks.hbs'}};
  constructor({actor=null,...options}={}){
    super(actor?{...options,id:`dawn-clocks-${actor.uuid.replaceAll('.','-')}`}:options);
    this.actor=actor;
  }
  get title(){return `DAWN · ${this.actor?`${label('personalClocks')} · ${this.actor.name}`:label('clocksTitle')}`;}
  get canEdit(){return this.actor?this.actor.isOwner:isExecutor();}
  read(){return this.actor?this.actor.getFlag('dawn','personalClocks')??[]:game.settings.get('dawn','sharedClocks');}
  async _prepareContext(){return {gm:this.canEdit,otherGM:!this.actor&&game.user.isGM&&!this.canEdit,clocks:this.read().map(c=>({...c,segments:Array.from({length:c.total},(_,i)=>({filled:i<c.value}))}))};}
  async mutate(fn){
    if(!this.canEdit||this.busy)return;
    this.busy=true;
    try{
      const next=fn(structuredClone(this.read()));
      if(next&&this.actor)await this.actor.setFlag('dawn','personalClocks',next);
      else if(next)await game.settings.set('dawn','sharedClocks',next);
    }
    catch(e){ui.notifications.error(label('clocksSaveError'));console.error('DAWN clocks',e);}
    finally{this.busy=false;if(this.rendered)this.render();}
  }
  static async add(){
    if(!this.canEdit||this.busy)return;
    const result=await foundry.applications.api.DialogV2.prompt({window:{title:label('clocksAdd')},content:`<label>${escape(label('clocksName'))}<input name="clockName" maxlength="80" required></label><label>${escape(label('clocksSegments'))}<input type="number" name="clockSegments" value="4" min="2" max="12" required></label><label>${escape(label('clocksConsequence'))}<input name="clockConsequence" maxlength="240"></label>`,ok:{label:label('clocksAdd'),callback:(_event,button)=>({name:button.form.elements.clockName.value.trim(),total:Number(button.form.elements.clockSegments.value),consequence:button.form.elements.clockConsequence.value.trim()})},rejectClose:false});
    if(!result)return;
    if(!result.name||!Number.isInteger(result.total)||result.total<2||result.total>12)return ui.notifications.warn(label('clocksInvalid'));
    await this.mutate(clocks=>[...clocks,{id:foundry.utils.randomID(),name:result.name,total:result.total,value:0,consequence:result.consequence}]);
  }
  static async change(event,target){const id=target.dataset.id,delta=Number(target.dataset.delta);if(![-1,1].includes(delta))return;await this.mutate(clocks=>{const c=clocks.find(c=>c.id===id);if(!c)return null;c.value=Math.max(0,Math.min(c.total,c.value+delta));return clocks;});}
  static async remove(event,target){
    if(!this.canEdit)return;const id=target.dataset.id,c=this.read().find(c=>c.id===id);if(!c)return;const snapshot=JSON.stringify(c);
    const yes=await foundry.applications.api.DialogV2.confirm({window:{title:label('clocksRemove')},content:`<p>${escape(label('clocksRemoveConfirm'))} <strong>${escape(c.name)}</strong>?</p>`,rejectClose:false});
    if(yes)await this.mutate(clocks=>{const current=clocks.find(c=>c.id===id);if(!current||JSON.stringify(current)!==snapshot){ui.notifications.warn(label('clocksChanged'));return null;}return clocks.filter(c=>c.id!==id);});
  }
}
