import {reserveCombatDuel} from './duel-start.mjs';
import {departCombatDuel} from './duel-departure.mjs';
import {recordDuelOutcome,confirmDuelConsequences} from './duel-outcome.mjs';
import {returnCombatDuel} from './duel-return.mjs';
import {reconcileDuelTransfer} from './duel-recovery.mjs';
import {activeCombatDuels} from './duel-timing.mjs';
import {isExecutor} from './operations.mjs';
import {label,escape} from './rolls.mjs';

const dialog=()=>foundry.applications.api.DialogV2;
const prompt=(title,content,callback,ok='duelContinue')=>dialog().prompt({window:{title:label(title)},position:{width:390},content,ok:{label:label(ok),callback:(_event,button)=>callback(button.form)},rejectClose:false});
const getContext=(party,id)=>structuredClone(party.system.storyContexts[id]);
function environment(){return {party:game.dawn.party,combat:game.combat,scene:canvas.scene,user:game.user,users:game.users,isExecutor};}
function tokens(env,context){
 const list=Array.from(env.scene?.tokens??[]),a=list.find(t=>t.uuid===context.duel.initiatorTokenUuid),b=list.find(t=>t.uuid===context.duel.targetTokenUuid);
 if(!a||!b)throw Error('duelParticipants');return {initiator:a,target:b};
}
function errorMessage(error){return `${label(error?.message?.startsWith('duel')||error?.message?.startsWith('board')||error?.message==='combatChanged'||error?.message==='battleTurnBusy'?error.message:'duelFailure')}${error?.duelId?` (${error.duelId})`:''}`;}
async function start(env){
 const initiator=env.combat?.combatant?.token,selected=Array.from(game.user.targets??[]);
 if(!initiator||selected.length!==1)throw Error('duelSelectTarget');
 const target=selected[0].document,geometryChecks=game.settings.get('dawn','geometryChecks');
 const result=await prompt('duelStart',`<p>${escape(label('duelStartHint'))}</p><label>${escape(label('duelStake'))}<input name="stake" maxlength="500"></label><label><input type="checkbox" name="public"> ${escape(label('duelPublicStake'))}</label>${geometryChecks?'':`<label><input type="checkbox" name="adjacent"> ${escape(label('duelAdjacentManual'))}</label>`}`,
  form=>({stake:form.elements.stake.value,stakeIsPublic:form.elements.public.checked,manualAdjacency:geometryChecks?false:form.elements.adjacent.checked}),'duelStart');
 if(!result)return;
 if(Array.from(game.user.targets??[]).length!==1||!game.user.targets.has(target.object))throw Error('duelChanged');
 const duelId=foundry.utils.randomID(),created=await reserveCombatDuel({...env,initiator,target,duelId,geometryChecks,...result});
 await departCombatDuel({...env,initiator,target,duelId:created.id});
 ui.notifications.info(label('duelDeparted'));
}
async function resolve(env,id,context,pair){
 const result=await prompt('duelResolve',`<p>${escape(label('duelResolveHint'))}</p><p>${escape(label('tension'))}: ${escape(context.tension)}</p><label>${escape(label('duelInitiatorHits'))}<input type="number" name="initiatorHits" min="0" max="2000" required></label><label>${escape(label('duelTargetHits'))}<input type="number" name="targetHits" min="0" max="2000" required></label><label>${escape(label('duelFailureChoice'))}<select name="choice"><option value="take">${escape(label('duelTake'))}</option>${context.duel.attempt===1?`<option value="bail">${escape(label('duelBail'))}</option><option value="double">${escape(label('duelDouble'))}</option>`:''}</select></label><label><input type="checkbox" name="timing"> ${escape(label('duelTimingConfirmed'))}</label>`,
  form=>({initiatorHits:form.elements.initiatorHits.value.trim()===''?NaN:Number(form.elements.initiatorHits.value),targetHits:form.elements.targetHits.value.trim()===''?NaN:Number(form.elements.targetHits.value),choice:form.elements.choice.value,timingConfirmed:form.elements.timing.checked}));
 if(!result)return;
 if(result.initiatorHits>result.targetHits)result.choice=null;
 const next=await recordDuelOutcome({...env,...pair,duelId:id,expectedContext:context,...result});
 ui.notifications.info(label(next.duel.phase==='awaitingResolution'?'duelRetry':'duelOutcomeSaved'));
}
async function consequences(env,id,context){
 const result=context.duel.outcome,details=result.loser==='target'?`${label('duelNpcDamage')}: ${result.manualDamage}`:`${label('duelHeroWound')}: ${result.manualWounds}`;
 const confirmed=await dialog().confirm({window:{title:label('duelConsequences')},position:{width:390},content:`<p>${escape(details)}</p><p>${escape(label('duelConsequencesHint'))}</p>`,rejectClose:false});
 if(confirmed)await confirmDuelConsequences({...env,duelId:id,expectedContext:context,confirmed:true});
}
async function finish(env,id,context,pair){
 const fields=(prefix,name)=>`<fieldset><legend>${escape(name)}</legend><label>${escape(label('duelColumn'))}<input name="${prefix}Column" type="number" min="1" max="7" value="1" required></label><label>${escape(label('duelRow'))}<input name="${prefix}Row" type="number" min="1" max="7" value="1" required></label></fieldset>`;
 const cells=await prompt('duelReturn',`<p>${escape(label('duelReturnHint'))}</p>${fields('a',pair.initiator.name)}${fields('b',pair.target.name)}<p>${escape(label('duelTeleportManual'))}</p>`,form=>['a','b'].map(p=>({column:Number(form.elements[`${p}Column`].value)-1,row:Number(form.elements[`${p}Row`].value)-1})));
 if(!cells)return;
 await returnCombatDuel({...env,...pair,duelId:id,expectedContext:context,destinations:cells});ui.notifications.info(label('duelReturned'));
}
async function existing(env,id){
 const context=getContext(env.party,id),pair=tokens(env,context);
 if(context.duel.phase==='awaitingDeparture'){
  const ok=await dialog().confirm({window:{title:label('duelDeparture')},position:{width:390},content:`<p>${escape(label('duelDepartureHint'))}</p>`,rejectClose:false});
  if(ok){await departCombatDuel({...env,...pair,duelId:id});ui.notifications.info(label('duelDeparted'));}
 }else if(context.duel.phase==='awaitingResolution')await resolve(env,id,context,pair);
 else if(context.duel.phase==='awaitingConsequences')await consequences(env,id,context);
 else if(context.duel.phase==='awaitingReturn')await finish(env,id,context,pair);
 else if(['departing','returning'].includes(context.duel.phase)){
  const ok=await dialog().confirm({window:{title:label('duelReconcile')},position:{width:390},content:`<p>${escape(label('duelReconcileHint'))}</p>`,rejectClose:false});
  if(ok){await reconcileDuelTransfer({...env,...pair,duelId:id,expectedContext:context,confirmed:true});ui.notifications.info(label('duelReconciled'));}
 }
 else throw Object.assign(Error('duelRecoveryManual'),{duelId:id});
}
/** One compact, contextual tool: the form changes with the selected stage. */
export async function openDuelTool(){
 if(!isExecutor())return ui.notifications.warn(label('duelPermission'));
 const env=environment();
 try{
  if(!env.party||!env.combat?.started||!env.scene)throw Error('combatChanged');
  const duels=activeCombatDuels(env.combat,env.party);
  if(!duels.length)return await start(env);
  const options=duels.map(({id,context})=>{const pair=tokens(env,context);return `<option value="${escape(id)}">${escape(pair.initiator.name)} ↔ ${escape(pair.target.name)} · ${escape(label(`duelPhases.${context.duel.phase}`))}</option>`;}).join('');
  const id=await prompt('duelTitle',`<label>${escape(label('duelChoose'))}<select name="duel">${options}<option value="new">${escape(label('duelStart'))}</option></select></label>`,form=>form.elements.duel.value);
  if(!id)return;if(id==='new')return await start(env);
  if(!duels.some(d=>d.id===id))throw Error('duelChanged');await existing(env,id);
 }catch(error){ui.notifications.warn(errorMessage(error));console.error('DAWN duel',error);}
}
