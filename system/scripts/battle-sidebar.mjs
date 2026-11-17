import {firstTurnCandidates,nextTurnChoices,isExecutor,turnSignature} from './operations.mjs';
import {prepareBattle} from './battle-setup.mjs';
import {label,escape} from './rolls.mjs';
import {acknowledgeTransition,reconcileTurn} from './battle-recovery.mjs';
import {needsTurnReconciliation} from './turn-state.mjs';
import {fodderTurnReminder} from './fodder-reminder.mjs';
import {setBattleTension} from './battle-tension.mjs';
import {recordKnockoutTension} from './battle-ko-tension.mjs';

/** Add DAWN controls to the native tracker without replacing its document or list. */
export function renderBattleSidebar(app,root){
  if(!root?.querySelector||!game.dawn)return;
  const footer=root.querySelector('.combat-controls');
  if(!footer?.parentElement)return;
  root.classList.add('dawn-tracker-enabled');
  root.querySelector('.dawn-tracker-controls')?.remove();
  const combat=app.viewed??null,executor=isExecutor(),signature=combat&&executor?turnSignature(combat):null;
  for(const row of root.querySelectorAll('.combatant[data-combatant-id]')){
    row.querySelector('.dawn-tracker-status')?.remove();
    row.querySelector('.dawn-tracker-ap')?.remove();
    const c=combat?.combatants.get(row.dataset.combatantId),container=row.querySelector('.token-name');
    if(!c?.visible||!container)continue;
    const values=[],acted=combat.getFlag('dawn',c.actor?.type==='hero'?'actedHeroes':'actedEnemies')??[];
    if(combat.started&&combat.combatant?.id===c.id)values.push(label('battleCurrentShort'));
    else if(combat.started&&acted.includes(c.id))values.push(label('battleActed'));
    if(c.token?.getFlag('dawn','presence')==='disappeared')values.push(label('battleDisappeared'));
    if(values.length){const status=document.createElement('small');status.className='dawn-tracker-status';status.textContent=values.join(' · ');container.append(status);}
    if(combat.started&&(game.user.isGM||c.permission>=CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER)){
      const badge=document.createElement('span');badge.className='dawn-tracker-ap';badge.textContent=`${label('ap')}: ${c.getFlag('dawn','ap')??0}`;
      container.append(badge);
    }
  }
  const panel=document.createElement('section');panel.className='dawn-tracker-controls';
  const heading=document.createElement('div');heading.className='dawn-tracker-heading';
  const title=document.createElement('strong');title.textContent=label('battleTitle');heading.append(title);
  const open=document.createElement('button');open.type='button';open.textContent=label('battleOpenWindow');
  open.addEventListener('click',()=>game.dawn.battle?.render({force:true,window:{title:game.dawn.battle.title}}));heading.append(open);panel.append(heading);
  if(game.user.isGM&&!executor){const hint=document.createElement('small');hint.textContent=label('battleExecutorHint');panel.append(hint);}
  if(combat?.started){
    const values=[],current=combat.combatant;
    const contextId=combat.getFlag('dawn','storyContextId'),tension=game.dawn.party?.system.storyContexts?.[contextId]?.tension;
    if(tension!==undefined)values.push(`${label('tension')}: ${tension}`);
    if(current?.visible&&(game.user.isGM||current.permission>=CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER))values.push(`${label('ap')}: ${current.getFlag('dawn','ap')??0}`);
    if(values.length){const summary=document.createElement('small');summary.textContent=values.join(' · ');panel.append(summary);}
  }
  const clocks=document.createElement('button');clocks.type='button';clocks.textContent=label('clocksTitle');
  clocks.addEventListener('click',()=>game.dawn.clocks?.render({force:true,window:{title:game.dawn.clocks.title}}));panel.append(clocks);
  let busy=false;
  const run=async operation=>{
    if(busy||!isExecutor())return;
    if((app.viewed??null)!==combat||(combat&&turnSignature(combat)!==signature)){ui.notifications.warn(label('combatChanged'));app.render();return;}
    busy=true;for(const button of panel.querySelectorAll('button,select'))button.disabled=true;
    try{await operation();}catch(error){ui.notifications.warn(error.message);}
    finally{busy=false;app.render();}
  };
  if(executor){
    const recovery=!!combat?.getFlag('dawn','transition');
    const contextId=combat?.getFlag('dawn','storyContextId'),shownTension=game.dawn.party?.system.storyContexts?.[contextId]?.tension;
    if(combat?.started&&Number.isSafeInteger(shownTension)&&shownTension>=0){
      const field=document.createElement('input');field.type='number';field.min='0';field.value=String(shownTension);field.setAttribute('aria-label',label('tensionCorrection'));
      const save=document.createElement('button');save.type='button';save.textContent=label('tensionSave');
      save.addEventListener('click',()=>run(async()=>{try{await setBattleTension({combat,party:game.dawn.party,value:field.value.trim()===''?NaN:Number(field.value),expected:shownTension,viewed:()=>app.viewed});}catch(error){throw Error(label(error.message));}}));
      panel.append(field);panel.append(save);
    }
    const defeated=combat?.started?[...combat.combatants.values()].filter(c=>c.visible&&c.defeated===true&&['hero','npc'].includes(c.actor?.type)):[];
    if(defeated.length){
      const select=document.createElement('select');select.setAttribute('aria-label',label('koTensionSelect'));
      for(const c of defeated){const option=document.createElement('option');option.value=c.id;option.textContent=c.name;select.append(option);}
      const apply=document.createElement('button');apply.type='button';apply.textContent=label('koTensionApply');
      apply.addEventListener('click',()=>run(async()=>{
        const c=combat.combatants.get(select.value);if(!c||!c.visible||!c.defeated)throw Error(label('koTensionInvalid'));
        const ok=await foundry.applications.api.DialogV2.confirm({window:{title:label('koTensionApply')},content:`<p><strong>${escape(c.name)}</strong></p><p>${escape(label('koTensionConfirm'))}</p>`,rejectClose:false});
        if(!ok)return;
        try{const result=await recordKnockoutTension({combat,combatant:c,party:game.dawn.party,user:game.user,users:game.users,isExecutor,eligibilityConfirmed:true});ui.notifications.info(label(result.applied?'koTensionApplied':'koTensionAlready'));}
        catch(error){throw Error(label(error.message));}
      }));
      panel.append(select,apply);
    }
    if(recovery){
      const warning=document.createElement('small');warning.textContent=label('battleTransitionPending');panel.append(warning);
      const recover=document.createElement('button');recover.type='button';recover.textContent=label('battleRecoveryButton');recover.addEventListener('click',()=>run(()=>acknowledgeTransition(combat,()=>app.viewed)));panel.append(recover);
    }
    const turnMismatch=combat&&!recovery&&needsTurnReconciliation(combat);
    if(turnMismatch){const warning=document.createElement('small');warning.textContent=label('battleTurnMismatch');panel.append(warning);const fix=document.createElement('button');fix.type='button';fix.textContent=label('battleReconcileButton');fix.addEventListener('click',()=>run(()=>reconcileTurn(combat,()=>app.viewed)));panel.append(fix);}
    if(combat&&!recovery&&!turnMismatch){
      const choiceData=combat.started?nextTurnChoices(combat):{candidates:firstTurnCandidates(combat),newRound:false};
      const candidates=choiceData.candidates.filter(c=>c.visible);
      const caption=document.createElement('label');caption.textContent=label(combat.started?'battleNext':'firstTurn');
      const select=document.createElement('select');select.setAttribute('aria-label',caption.textContent);
      for(const candidate of candidates){const option=document.createElement('option');option.value=candidate.id;option.textContent=candidate.name;select.append(option);}
      select.disabled=!candidates.length;caption.append(select);panel.append(caption);
      const advance=document.createElement('button');advance.type='button';advance.textContent=label(combat.started?'battleAdvance':'battleStart');advance.disabled=!candidates.length;
      advance.addEventListener('click',()=>run(()=>combat.started?combat.nextTurn({combatantId:select.value}):combat.startCombat({combatantId:select.value})));panel.append(advance);
      if(choiceData.newRound){const hint=document.createElement('small');hint.textContent=label('battleNewRound');panel.append(hint);}
      const reminder=fodderTurnReminder(combat,game.user,choiceData.newRound);
      if(reminder){const hint=document.createElement('small');hint.className='dawn-fodder-reminder';hint.textContent=label(reminder);panel.append(hint);}
    }
    if(!recovery&&!turnMismatch){
      const setup=document.createElement('button');setup.type='button';setup.textContent=label(combat?'battleAddSelected':'battleCreateSelected');
      setup.addEventListener('click',()=>run(()=>prepareBattle(combat)));panel.append(setup);
    }
  }
  footer.before(panel);
}
