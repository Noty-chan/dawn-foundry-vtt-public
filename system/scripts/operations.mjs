import {label,escape} from "./rolls.mjs";
import {integer} from "./rules.mjs";
import {combatantStartingAP} from "./effect-rules.mjs";
import {needsTurnReconciliation,newTurnAnchor,acquireTurnLock,releaseTurnLock} from "./turn-state.mjs";
import {finishStandardEffects} from "./effect-expiry.mjs";
import {duelForCombatant,duelTurnBlock} from './duel-timing.mjs';
let queue=Promise.resolve();
export const whenOperationsIdle=()=>queue;
const actions=new Set(["breathe","startCombat","initializeNpc"]);
function availableTurns(combat){return combat.turns.filter(c=>{const presence=c.token?.getFlag('dawn','presence'),duelist=presence==='duel'&&duelForCombatant(combat,globalThis.game?.dawn?.party,c);return !c.defeated&&!c.isDefeated&&(!presence||presence==='disappeared'||duelist)&&['hero','npc'].includes(c.actor?.type)&&c.actor?.system?.presentation?.role!=='obstacle';});}
function requireReturned(combatant){if(combatant?.token?.getFlag('dawn','presence')==='disappeared')throw Error(label('battleReturnBeforeTurn'));}
export function firstTurnCandidates(combat){const available=availableTurns(combat),heroes=available.filter(c=>c.actor.type==='hero');return heroes.length?heroes:available;}
export function nextTurnChoices(combat){
  const current=combat.combatant,heroes=[...(combat.getFlag('dawn','actedHeroes')??[])],enemies=[...(combat.getFlag('dawn','actedEnemies')??[])];
  if(current?.actor?.type==='hero'&&!heroes.includes(current.id))heroes.push(current.id);
  if(current?.actor?.type==='npc'&&!enemies.includes(current.id))enemies.push(current.id);
  const available=availableTurns(combat),pcs=available.filter(c=>c.actor.type==='hero'),npcs=available.filter(c=>c.actor.type==='npc');
  let candidates=[],newRound=false;
  if(current?.actor?.type==='hero'&&npcs.length)candidates=npcs.filter(c=>!enemies.includes(c.id));
  if(!candidates.length&&current?.actor?.type==='hero'&&npcs.length)candidates=npcs;
  if(!candidates.length)candidates=pcs.filter(c=>!heroes.includes(c.id));
  if(!candidates.length){newRound=true;candidates=pcs.length?pcs:npcs;}
  return {candidates,newRound,heroes,enemies};
}
export function turnSignature(combat){return JSON.stringify({started:combat.started,round:combat.round,turn:combat.turn,turnId:combat.getFlag('dawn','turnId')??null,timelineId:combat.getFlag('dawn','timelineId')??null,transition:combat.getFlag('dawn','transition')??null,anchor:combat.getFlag('dawn','turnAnchor')??null,heroes:combat.getFlag('dawn','actedHeroes')??[],enemies:combat.getFlag('dawn','actedEnemies')??[],turns:combat.turns.map(c=>({id:c.id,actor:c.actor?.uuid,type:c.actor?.type,initiative:c.initiative,defeated:!!(c.defeated||c.isDefeated),presence:c.token?.getFlag('dawn','presence')??null}))});}
function transitionSignature(combat){const value=JSON.parse(turnSignature(combat));delete value.transition;return JSON.stringify(value);}
async function chooseCombatant(candidates,title){return foundry.applications.api.DialogV2.prompt({classes:['dawn','dawn-modal'],position:{width:620},window:{title:label(title)},content:`<select name="combatant">${candidates.map(c=>`<option value="${escape(c.id)}">${escape(c.name)}</option>`).join('')}</select>`,ok:{label:label(title),callback:(_event,button)=>button.form.elements.combatant.value},rejectClose:false});}
export function isExecutor(){return game.user.isGM&&game.settings.get("dawn","executorUserId")===game.user.id;}
function checkTransition(combat,id){if(!isExecutor()||combat.getFlag('dawn','transition')?.id!==id)throw Error(label('combatRecovery'));}
async function beginTransition(combat,kind,nextId){
  if(combat.getFlag('dawn','transition'))throw Error(label('battleTransitionPending'));
  const marker={id:foundry.utils.randomID(),kind,fromRound:combat.round,fromId:combat.started?combat.combatant?.id??null:null,nextId};
  if(!await combat.update({'flags.dawn.transition':marker},{turnEvents:false}))throw Error(label('combatRecovery'));
  checkTransition(combat,marker.id);return marker.id;
}
async function finishTransition(combat,id){
  checkTransition(combat,id);
  if(!await combat.update({'flags.dawn.-=transition':null},{turnEvents:false})||combat.getFlag('dawn','transition'))throw Error(label('combatRecovery'));
}
// LionWing p.55: both PCs and NPCs get AP at the start of their own turn,
// and lose unspent AP at its end. Defensive reactions cost Focus instead.
async function clearInitialAP(combat,transitionId){
  for(const c of combat.combatants.filter(c=>['hero','npc'].includes(c.actor?.type))){
    checkTransition(combat,transitionId);
    if(c.getFlag('dawn','ap')!==0&&(!await c.update({'flags.dawn.ap':0})||c.getFlag('dawn','ap')!==0))throw Error(label('combatRecovery'));
  }
}
async function startParticipantAP(combat,combatant,transitionId){
  checkTransition(combat,transitionId);
  if(!combatant)throw Error(label('combatRecovery'));
  const ap=combatantStartingAP(combatant.actor);
  if(combatant.getFlag('dawn','ap')!==ap&&(!await combatant.update({'flags.dawn.ap':ap})||combatant.getFlag('dawn','ap')!==ap))throw Error(label('combatRecovery'));
}
/** Bind Breathe to a particular DAWN turn, not just the current actor or round. */
export function breatheTurn(combat,actor,expected=null){
  const turnId=combat?.getFlag('dawn','turnId'),current=combat?.combatant;
  if(combat?.getFlag('dawn','transition'))throw Error(label('battleTransitionPending'));
  if(needsTurnReconciliation(combat))throw Error(label('battleTurnMismatch'));
  if(!combat?.started||game.combat?.uuid!==combat.uuid||!turnId||!current||current.actor?.uuid!==actor?.uuid)throw Error(label('notYourTurn'));
  const snapshot={combatUuid:combat.uuid,combatantId:current.id,turnId,timelineId:combat.getFlag('dawn','timelineId')};
  if(expected&&Object.keys(snapshot).some(key=>snapshot[key]!==expected[key]))throw Error(label('combatChanged'));
  return snapshot;
}
function validateBreathe(combat,actor,expected){
  if(actor.type!=='hero')throw Error(label('heroOnly'));
  breatheTurn(combat,actor,expected);
  const combatant=combat.combatant,ap=combatant.getFlag('dawn','ap')??0,roundKey=String(combat.round);
  if(ap<1)throw Error(label('notEnoughAP'));
  if(combatant.getFlag('dawn','breatheRound')===roundKey)throw Error(label('onceRound'));
  return {combatant,ap,roundKey};
}
export async function requestAction(actor,actionId,payload={}){
  if(!actor.isOwner||!actions.has(actionId))throw Error(label("noPermission"));
  if(actionId==='breathe')payload={...payload,...breatheTurn(game.combat,actor)};
  if(actionId==='startCombat'){
    if(!game.user.isGM)throw Error(label('gmOnly'));
    const scene=canvas.scene,tokenIds=(canvas.tokens?.controlled??[]).map(t=>t.document.id);
    if(!scene||!tokenIds.length)throw Error(label('selectCombatTokens'));
    payload={...payload,sceneId:scene.id,tokenIds};
  }
  const executor=game.users.get(game.settings.get("dawn","executorUserId"));
  if(!executor?.active||!executor.isGM)throw Error(label("executorOffline"));
  return ChatMessage.create({type:"dawnRequest",content:`<p>DAWN: ${escape(actor.name)} · ${escape(label(actionId))} — ${escape(label("pending"))}</p>`,whisper:[game.user.id,executor.id],system:{operationId:foundry.utils.randomID(),actorUuid:actor.uuid,actionId,status:"pending",payload:{...payload,combatUuid:actionId==='breathe'?payload.combatUuid:game.combat?.uuid??null}}});
}
export function handleRequest(message){
  if(message.type!=="dawnRequest"||!isExecutor())return;
  queue=queue.then(()=>executeRequest(message)).catch(e=>{console.error("DAWN request",e);ui.notifications.error(e.message);});
}
export async function executeRequest(message){
  if(!isExecutor()||message.system.status!=="pending")return;
  const s=message.system,actor=await fromUuid(s.actorUuid),author=message.author;
  if(!/^[A-Za-z0-9]{16}$/.test(s.operationId)||!actor||!author||!actor.testUserPermission(author,"OWNER")||!actions.has(s.actionId)){
    await message.update({"system.status":"rejected"});return;
  }
  const key=`${author.id}-${s.operationId}`;
  if(actor.getFlag("dawn",`receipts.${key}`)){
    await message.update({"system.status":"completed",content:`<p>DAWN · ${escape(label("alreadyApplied"))}</p>`});return;
  }
  const lockUuid=s.actionId==='breathe'?s.payload.combatUuid:null;
  if(lockUuid&&!acquireTurnLock(lockUuid)){await message.update({"system.status":"rejected",content:`<p>DAWN · ${escape(label('battleTurnBusy'))}</p>`});return;}
  try{
  // Reject stale turn-bound requests before declaring that any stage was applied.
  if(s.actionId==='breathe'){
    try{const combat=s.payload.combatUuid?await fromUuid(s.payload.combatUuid):null;validateBreathe(combat,actor,s.payload);}
    catch(error){await message.update({"system.status":"rejected",content:`<p>DAWN · ${escape(error.message)}</p>`});return;}
  }
  await message.update({"system.status":"applying"});
  try{
    let changes={},result={};
    if(s.actionId==="breathe"){
      const combat=s.payload.combatUuid?await fromUuid(s.payload.combatUuid):null;
      const {combatant:c,ap,roundKey}=validateBreathe(combat,actor,s.payload); // recheck after the asynchronous status write
      if(!await c.update({"flags.dawn.ap":ap-1,"flags.dawn.breatheRound":roundKey,[`flags.dawn.receipts.${key}`]:true})||c.getFlag("dawn","ap")!==ap-1||c.getFlag("dawn","breatheRound")!==roundKey||c.getFlag("dawn",`receipts.${key}`)!==true)throw Error(label("combatRecovery"));
      changes["system.focus.value"]=integer(actor.system.focus.value)+1;result={focus:changes["system.focus.value"],ap:ap-1};
    }else if(s.actionId==="initializeNpc"){
      if(!author.isGM||actor.type!=="npc")throw Error(label("gmOnly"));
      if(actor.system.deployment.status==="initialized")throw Error(label("alreadyApplied"));
      changes={"system.health.value":actor.system.health.max,"system.evasion.value":actor.system.initialEvasion,"system.deployment.status":"initialized"};
    }else if(s.actionId==="startCombat"){
      if(!author.isGM)throw Error(label("gmOnly"));
      const scene=game.scenes.get(s.payload.sceneId),ids=s.payload.tokenIds;
      if(!scene||canvas.scene?.id!==scene.id||!Array.isArray(ids)||!ids.length||new Set(ids).size!==ids.length)throw Error(label('selectCombatTokens'));
      const tokens=ids.map(id=>scene.tokens.get(id));
      if(tokens.some(t=>{const presence=t?.getFlag('dawn','presence');return !t?.actor||!["hero","npc"].includes(t.actor.type)||t.actor.system.presentation?.role==="obstacle"||(presence&&presence!=='disappeared');}))throw Error(label('combatChanged'));
      if(game.combat?.started)throw Error(label("combatExists"));
      const combat=await Combat.create({scene:scene.id,active:true,flags:{dawn:{id:s.operationId}}});
      const sorted=tokens.sort((a,b)=>(a.actor.type==="hero"?0:1)-(b.actor.type==="hero"?0:1));
      await combat.createEmbeddedDocuments("Combatant",sorted.map((t,i)=>({tokenId:t.id,sceneId:scene.id,actorId:t.actorId,initiative:1000-i,flags:{dawn:{ap:0}}})));
      ui.combat.viewed=combat;
      await combat.startCombat();if(!combat.started)throw Error(label('combatNotStarted'));result={combatUuid:combat.uuid};
    }
    changes[`flags.dawn.receipts.${key}`]={action:s.actionId,requestUuid:message.uuid};
    if(!await actor.update(changes)||actor.getFlag("dawn",`receipts.${key}`)?.requestUuid!==message.uuid||(s.actionId==="breathe"&&actor.system.focus.value!==result.focus))throw Error(label("combatRecovery"));
    await message.update({"system.status":"completed","system.result":result,content:`<div class="dawn-roll"><h3>${escape(actor.name)} · ${escape(label(s.actionId))}</h3><p>${escape(label("completed"))}</p>${result.focus!==undefined?`<p>${escape(label("focus"))}: ${result.focus} · ${escape(label("ap"))}: ${result.ap}</p>`:""}</div>`});
  }catch(e){
    // A confirmed earlier step is never rolled back or silently replayed.
    await message.update({"system.status":"recovery-required",content:`<p>DAWN · ${escape(label("recovery"))}: ${escape(e.message)}</p>`});
    throw e;
  }
  }finally{if(lockUuid)releaseTurnLock(lockUuid);}
}

export class DawnCombat extends Combat {
  // The native tracker assumes linear initiative; rewinding it would silently
  // desynchronise DAWN's acted flags, AP and Tension. Use the DAWN transition.
  async nextRound(){ui.notifications.warn(label('battleNativeTransition'));return this;}
  async previousRound(){ui.notifications.warn(label('battleNativeTransition'));return this;}
  async previousTurn(){ui.notifications.warn(label('battleNativeTransition'));return this;}
  async startCombat({combatantId=null}={}){
    if(this.getFlag('dawn','transition'))throw Error(label('battleTransitionPending'));
    if(this.started)return this;
    if(!isExecutor())throw Error(label("executorOnly"));
    if(this._dawnTransitioning)return;
    if(!acquireTurnLock(this.uuid))throw Error(label('battleTurnBusy'));
    this._dawnTransitioning=true;
    try{
    const candidates=firstTurnCandidates(this);
    if(!candidates.length)throw Error(label('needTokens'));
    const signature=turnSignature(this),firstId=combatantId??await chooseCombatant(candidates,'firstTurn');
    if(!firstId)return this;
    if(!isExecutor()||turnSignature(this)!==signature||!candidates.some(c=>c.id===firstId))throw Error(label('combatChanged'));
    const firstIndex=this.turns.findIndex(c=>c.id===firstId);
    if(firstIndex<0)throw Error(label('combatChanged'));
    requireReturned(this.turns[firstIndex]);
    const transitionSnapshot=transitionSignature(this),transitionId=await beginTransition(this,'start',firstId),turnId=foundry.utils.randomID();
    const party=game.dawn.party;
    const contextId=foundry.utils.randomID();
    if(!await party.update({[`system.storyContexts.${contextId}`]:{kind:"structured",status:"active",tension:0,linkedCombatUuid:this.uuid}})||party.system.storyContexts?.[contextId]?.linkedCombatUuid!==this.uuid||party.system.storyContexts?.[contextId]?.tension!==0)throw Error(label('combatRecovery'));
    checkTransition(this,transitionId);
    if(!await this.update({"flags.dawn.storyContextId":contextId,"flags.dawn.actedHeroes":[],"flags.dawn.actedEnemies":[]})||this.getFlag('dawn','storyContextId')!==contextId||JSON.stringify(this.getFlag('dawn','actedHeroes'))!=='[]'||JSON.stringify(this.getFlag('dawn','actedEnemies'))!=='[]')throw Error(label('combatRecovery'));
    const heroesToInitialize=new Map(this.combatants.filter(c=>c.actor?.type==='hero').map(c=>[c.actor.uuid,c.actor]));
    for(const hero of heroesToInitialize.values()){
      checkTransition(this,transitionId);
      const focus=hero.system.startingFocus;
      if(hero.system.focus?.value!==focus&&(!await hero.update({"system.focus.value":focus})||hero.system.focus?.value!==focus))throw Error(label('combatRecovery'));
    }
    // Foundry V13's startCombat uses {round:1,turn:0}; supply the chosen turn
    // to the same public hook before the first update, so no other hero starts.
    this._playCombatSound('startEncounter');
    if(transitionSignature(this)!==transitionSnapshot)throw Error(label('combatRecovery'));
    const currentIndex=this.turns.findIndex(c=>c.id===firstId);if(currentIndex<0)throw Error(label('combatRecovery'));
    const startData={round:1,turn:currentIndex},timelineId=foundry.utils.randomID();Hooks.callAll('combatStart',this,startData);
    checkTransition(this,transitionId);
    if(!await this.update({...startData,'flags.dawn.turnId':turnId,'flags.dawn.turnAnchor':newTurnAnchor(1,firstId,turnId),'flags.dawn.timelineId':timelineId},{turnEvents:false})||needsTurnReconciliation(this)||this.getFlag('dawn','timelineId')!==timelineId)throw Error(label('combatRecovery'));
    await clearInitialAP(this,transitionId);
    await startParticipantAP(this,this.combatant,transitionId);
    if(needsTurnReconciliation(this)||this.combatant?.id!==firstId||this.round!==1||this.getFlag('dawn','timelineId')!==timelineId)throw Error(label('combatRecovery'));
    await finishTransition(this,transitionId);
    return this;
    }finally{this._dawnTransitioning=false;releaseTurnLock(this.uuid);}
  }
  async nextTurn({combatantId=null}={}){
    if(!isExecutor())throw Error(label("executorOnly"));
    if(this.getFlag('dawn','transition'))throw Error(label('battleTransitionPending'));
    if(!this.started)return this.startCombat({combatantId});
    if(needsTurnReconciliation(this))throw Error(label('battleTurnMismatch'));
    if(this._dawnTransitioning)return;
    if(!acquireTurnLock(this.uuid))throw Error(label('battleTurnBusy'));
    this._dawnTransitioning=true;
    try{
    const due=duelTurnBlock(this,game.dawn.party);if(due)throw Error(label(due.reason));
    const current=this.combatant,{candidates,newRound,heroes,enemies}=nextTurnChoices(this);
    if(!candidates.length)return;
    const signature=turnSignature(this),next=combatantId??await chooseCombatant(candidates,'nextTurn');
    if(!next)return;
    if(!isExecutor()||turnSignature(this)!==signature||!candidates.some(c=>c.id===next)||!current)throw Error(label('combatChanged'));
    const nextIndex=this.turns.findIndex(c=>c.id===next);if(nextIndex<0)throw Error(label('combatChanged'));
    const duel=duelTurnBlock(this,game.dawn.party,this.turns[nextIndex]);if(duel)throw Error(label(duel.reason));
    requireReturned(this.turns[nextIndex]);
    const transitionSnapshot=transitionSignature(this),transitionId=await beginTransition(this,'next',next),turnId=foundry.utils.randomID();
    try{await finishStandardEffects(this,current,this.getFlag('dawn','turnId'),transitionId,()=>{checkTransition(this,transitionId);if(transitionSignature(this)!==transitionSnapshot||needsTurnReconciliation(this)||this.combatant?.id!==current.id)throw Error(label('combatRecovery'));});}
    catch(error){if(['effectDurationAmbiguous','effectDurationUnconfirmed'].includes(error.message))throw Error(label(error.message));throw error;}
    if(current.getFlag('dawn','ap')!==0&&(!await current.update({"flags.dawn.ap":0})||current.getFlag('dawn','ap')!==0))throw Error(label('combatRecovery'));
    checkTransition(this,transitionId);
    if(transitionSignature(this)!==transitionSnapshot||needsTurnReconciliation(this)||this.combatant?.id!==current.id)throw Error(label('combatRecovery'));
    const latestIndex=this.turns.findIndex(c=>c.id===next),expectedRound=this.round+(newRound?1:0);
    if(latestIndex<0||!nextTurnChoices(this).candidates.some(c=>c.id===next))throw Error(label('combatRecovery'));
    if(duelTurnBlock(this,game.dawn.party,this.turns[latestIndex]))throw Error(label('combatRecovery'));
    if(!await this.update({turn:latestIndex,round:expectedRound,"flags.dawn.turnId":turnId,"flags.dawn.turnAnchor":newTurnAnchor(expectedRound,next,turnId),"flags.dawn.actedHeroes":newRound?[]:heroes,"flags.dawn.actedEnemies":newRound?[]:enemies},{turnEvents:false})||needsTurnReconciliation(this)||this.combatant?.id!==next||this.round!==expectedRound)throw Error(label('combatRecovery'));
    await startParticipantAP(this,this.combatant,transitionId);
    if(newRound){
      checkTransition(this,transitionId);
      const id=this.getFlag("dawn","storyContextId"),p=game.dawn.party,context=p?.system.storyContexts?.[id];
      if(!context||!Number.isSafeInteger(context.tension)||context.tension<0)throw Error(label('combatRecovery'));
      const tension=context.tension+1;
      if(!await p.update({[`system.storyContexts.${id}.tension`]:tension})||p.system.storyContexts?.[id]?.tension!==tension)throw Error(label('combatRecovery'));
    }
    if(needsTurnReconciliation(this)||this.combatant?.id!==next||this.round!==expectedRound||this.getFlag('dawn','turnId')!==turnId)throw Error(label('combatRecovery'));
    await finishTransition(this,transitionId);
    return this;
    }finally{this._dawnTransitioning=false;releaseTurnLock(this.uuid);}
  }
}
