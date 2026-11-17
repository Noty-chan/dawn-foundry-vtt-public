import {firstTurnCandidates,nextTurnChoices,isExecutor,turnSignature} from './operations.mjs';
import {label} from './rolls.mjs';
import {prepareBattle} from './battle-setup.mjs';
import {acknowledgeTransition,reconcileTurn} from './battle-recovery.mjs';
import {needsTurnReconciliation} from './turn-state.mjs';
import {fodderTurnReminder} from './fodder-reminder.mjs';
import {setBattleTension} from './battle-tension.mjs';

const {ApplicationV2,HandlebarsApplicationMixin}=foundry.applications.api;

/** Presentation of the viewed native Combat; no independent initiative storage. */
export class DawnBattle extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS={id:'dawn-battle',classes:['dawn','dawn-battle'],window:{title:'DAWN',resizable:true},position:{width:520,height:650},actions:{advance:DawnBattle.onAdvance,openActor:DawnBattle.onOpenActor,setup:DawnBattle.onSetup,recover:DawnBattle.onRecover,reconcile:DawnBattle.onReconcile,tension:DawnBattle.onTension}};
  static PARTS={body:{template:'systems/dawn/templates/battle.hbs'}};
  get title(){return `DAWN · ${label('battleTitle')}`;}
  get combat(){return ui.combat?.viewed??null;}
  async _prepareContext(){
    const combat=this.combat,executor=isExecutor(),executorHint=game.user.isGM&&!executor;
    if(!combat)return {hasCombat:false,executor,executorHint};
    const choices=combat.started?nextTurnChoices(combat):{candidates:firstTurnCandidates(combat),newRound:false};
    const visible=combat.turns.filter(c=>c.visible);
    const current=combat.started?combat.combatant:null,shownCurrent=visible.includes(current);
    const heroes=combat.getFlag('dawn','actedHeroes')??[],enemies=combat.getFlag('dawn','actedEnemies')??[];
    const rows=visible.filter(c=>['hero','npc'].includes(c.actor?.type)).map(c=>({id:c.id,name:c.name,img:c.img,hero:c.actor.type==='hero',
      current:c.id===current?.id,acted:(c.actor.type==='hero'?heroes:enemies).includes(c.id),disappeared:c.token?.getFlag('dawn','presence')==='disappeared',unavailable:!!(c.defeated||c.isDefeated||(c.token?.getFlag('dawn','presence')&&c.token?.getFlag('dawn','presence')!=='disappeared')),
      hasAP:game.user.isGM||c.permission>=CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER,ap:c.getFlag('dawn','ap')??0}));
    const recovery=!!combat.getFlag('dawn','transition'),turnMismatch=!recovery&&needsTurnReconciliation(combat);
    const options=executor&&!recovery&&!turnMismatch?choices.candidates.filter(c=>c.visible).map(c=>({id:c.id,name:c.name})):[];
    const selected=options.some(c=>c.id===this.choice)?this.choice:options[0]?.id;
    const contextId=combat.getFlag('dawn','storyContextId'),tension=game.dawn.party?.system.storyContexts?.[contextId]?.tension;
    return {hasCombat:true,combatUuid:combat.uuid,signature:executor?turnSignature(combat):null,combatName:combat.name,started:combat.started,round:combat.round,executor,executorHint,
      currentName:shownCurrent?current.name:null,hasTension:tension!==undefined,tension,
      heroes:rows.filter(r=>r.hero),enemies:rows.filter(r=>!r.hero),candidates:options.map(c=>({...c,selected:c.id===selected})),
      hasCandidates:options.length>0,newRound:choices.newRound,fodderReminder:executor&&!recovery&&!turnMismatch?fodderTurnReminder(combat,game.user,choices.newRound):null,busy:this.busy,recovery,turnMismatch};
  }
  _onRender(context,options){
    super._onRender(context,options);this.shownCombatUuid=context.combatUuid??null;this.shownSignature=context.signature??null;this.shownTension=context.tension;
    this.element.querySelector('[data-battle-choice]')?.addEventListener('change',event=>{this.choice=event.target.value;});
  }
  static async onAdvance(){
    if(this.busy||!isExecutor())return;
    const combat=this.combat,id=this.element.querySelector('[data-battle-choice]')?.value;
    if(!combat||combat.uuid!==this.shownCombatUuid||turnSignature(combat)!==this.shownSignature||!id){ui.notifications.warn(label('combatChanged'));if(this.rendered)await this.render();return;}
    this.busy=true;
    try{if(combat.started)await combat.nextTurn({combatantId:id});else await combat.startCombat({combatantId:id});}
    catch(error){ui.notifications.warn(error.message);}
    finally{this.busy=false;if(this.rendered)await this.render();}
  }
  static async onSetup(){
    if(this.busy||!isExecutor())return;
    const combat=this.combat;
    if(combat&&(combat.uuid!==this.shownCombatUuid||turnSignature(combat)!==this.shownSignature))return ui.notifications.warn(label('combatChanged'));
    this.busy=true;
    try{await prepareBattle(combat);}
    catch(error){ui.notifications.warn(error.message);}
    finally{this.busy=false;if(this.rendered)await this.render();}
  }
  static async onTension(){
    if(this.busy||!isExecutor())return;const combat=this.combat,field=this.element.querySelector('[data-battle-tension]');
    if(!combat||combat.uuid!==this.shownCombatUuid||turnSignature(combat)!==this.shownSignature||!field)return ui.notifications.warn(label('combatChanged'));
    this.busy=true;try{await setBattleTension({combat,party:game.dawn.party,value:field.value.trim()===''?NaN:Number(field.value),expected:this.shownTension});}
    catch(error){ui.notifications.warn(label(error.message));}finally{this.busy=false;if(this.rendered)await this.render();}
  }
  static async onRecover(){
    if(this.busy||!isExecutor())return;
    const combat=this.combat;
    if(!combat||combat.uuid!==this.shownCombatUuid||turnSignature(combat)!==this.shownSignature)return ui.notifications.warn(label('combatChanged'));
    this.busy=true;
    try{await acknowledgeTransition(combat);}
    catch(error){ui.notifications.warn(error.message);}
    finally{this.busy=false;if(this.rendered)await this.render();}
  }
  static async onReconcile(){
    if(this.busy||!isExecutor())return;const combat=this.combat;
    if(!combat||combat.uuid!==this.shownCombatUuid||turnSignature(combat)!==this.shownSignature)return ui.notifications.warn(label('combatChanged'));
    this.busy=true;try{await reconcileTurn(combat);}catch(error){ui.notifications.warn(error.message);}finally{this.busy=false;if(this.rendered)await this.render();}
  }
  static onOpenActor(event,target){
    const combat=this.combat,c=combat?.combatants.get(target.dataset.combatantId);
    if(!combat||combat.uuid!==this.shownCombatUuid||!c?.visible||!c.actor?.testUserPermission(game.user,'OBSERVER'))return;
    c.actor.sheet.render({force:true});
  }
}
