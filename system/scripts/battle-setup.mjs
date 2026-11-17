import {isExecutor} from './operations.mjs';
import {acquireTurnLock,releaseTurnLock,needsTurnReconciliation} from './turn-state.mjs';
import {label} from './rolls.mjs';

// The tracker and the popout have separate button locks. Serialize the shared
// setup operation so overlapping clicks cannot create or populate two drafts.
let setupBusy=false;

/** Create a draft from explicit selection, or add selected tokens to a draft. */
export async function prepareBattle(combat=null){
  if(setupBusy)throw Error(label('battleTurnBusy'));
  setupBusy=true;
  try{return await prepareBattleOnce(combat);}finally{setupBusy=false;}
}

async function prepareBattleOnce(combat){
  if(!isExecutor())throw Error(label('executorOnly'));
  const scene=canvas.scene,selected=canvas.tokens?.controlled??[];
  if(!scene||!selected.length)throw Error(label('selectCombatTokens'));
  const tokens=selected.map(placeable=>placeable.document);
  if(new Set(tokens.map(t=>t.id)).size!==tokens.length||tokens.some(t=>{const presence=t.getFlag('dawn','presence');return scene.tokens.get(t.id)!==t||!t.actor||!['hero','npc'].includes(t.actor.type)||t.actor.system.presentation?.role==='obstacle'||(presence&&presence!=='disappeared');}))throw Error(label('combatChanged'));
  if(combat){
    if(combat.getFlag('dawn','transition'))throw Error(label('battleTransitionPending'));
    if(combat.scene?.id!==scene.id||ui.combat.viewed!==combat)throw Error(label('combatChanged'));
    const existing=new Set([...combat.combatants].map(c=>c.tokenId));
    if(tokens.some(t=>existing.has(t.id)))throw Error(label('battleAlreadyAdded'));
    if(combat.started)return addReinforcements(combat,scene,tokens);
  }else if(ui.combat.viewed||game.combats.active)throw Error(label('battleExisting'));

  if(!combat){
    combat=await Combat.create({scene:scene.id,active:true});
    if(!combat)throw Error(label('combatRecovery'));
    // Keep a partially created draft visible if adding participants fails.
    ui.combat.viewed=combat;
  }
  try{
    if(!isExecutor()||canvas.scene!==scene||combat.started||ui.combat.viewed!==combat||tokens.some(t=>scene.tokens.get(t.id)!==t))throw Error(label('combatChanged'));
    const created=await combat.createEmbeddedDocuments('Combatant',tokens.map(t=>({tokenId:t.id,sceneId:scene.id,actorId:t.actorId,hidden:!!t.hidden,initiative:0,flags:{dawn:{ap:0}}})));
    if(!created||created.length!==tokens.length)throw Error(label('combatRecovery'));
    return combat;
  }catch(error){throw Error(`${label('battleSetupRecovery')} ${error.message}`);}
}

async function addReinforcements(combat,scene,tokens){
  const validNpc=t=>{const presence=t.getFlag('dawn','presence');return scene.tokens.get(t.id)===t&&t.actor?.type==='npc'&&t.actor.system?.presentation?.role!=='obstacle'&&(!presence||presence==='disappeared');};
  if(tokens.some(t=>t.actor.type!=='npc'))throw Error(label('battleReinforcementsNpcOnly'));
  if(tokens.some(t=>!validNpc(t)))throw Error(label('combatChanged'));
  if(needsTurnReconciliation(combat))throw Error(label('battleTurnMismatch'));
  if(!acquireTurnLock(combat.uuid))throw Error(label('battleTurnBusy'));
  try{
    const state=()=>JSON.stringify({round:combat.round,current:combat.combatant?.id,turnId:combat.getFlag('dawn','turnId'),timeline:combat.getFlag('dawn','timelineId'),anchor:combat.getFlag('dawn','turnAnchor'),heroes:combat.getFlag('dawn','actedHeroes')??[],enemies:combat.getFlag('dawn','actedEnemies')??[]});
    const before=state(),oldIds=new Set([...combat.combatants].map(c=>c.id));
    const marker={id:foundry.utils.randomID(),kind:'reinforcements',fromRound:combat.round,fromId:combat.combatant?.id??null,tokenIds:tokens.map(t=>t.id)};
    if(!await combat.update({'flags.dawn.transition':marker},{turnEvents:false})||combat.getFlag('dawn','transition')?.id!==marker.id)throw Error(label('combatRecovery'));
    if(!isExecutor()||ui.combat.viewed!==combat||canvas.scene!==scene||state()!==before||needsTurnReconciliation(combat)||tokens.some(t=>!validNpc(t)||[...combat.combatants].some(c=>c.tokenId===t.id)))throw Error(label('combatRecovery'));
    const created=await combat.createEmbeddedDocuments('Combatant',tokens.map(t=>({tokenId:t.id,sceneId:scene.id,actorId:t.actorId,hidden:!!t.hidden,initiative:0,flags:{dawn:{ap:0}}})));
    const currentIds=new Set([...combat.combatants].map(c=>c.id));
    if(!isExecutor()||combat.getFlag('dawn','transition')?.id!==marker.id||state()!==before||needsTurnReconciliation(combat)||tokens.some(t=>!validNpc(t))||!created||created.length!==tokens.length||currentIds.size!==oldIds.size+tokens.length||[...oldIds].some(id=>!currentIds.has(id))||created.some((c,i)=>!currentIds.has(c.id)||c.tokenId!==tokens[i].id||c.getFlag('dawn','ap')!==0))throw Error(label('combatRecovery'));
    if(!await combat.update({'flags.dawn.-=transition':null},{turnEvents:false})||combat.getFlag('dawn','transition'))throw Error(label('combatRecovery'));
    return combat;
  }catch(error){throw Error(`${label('battleSetupRecovery')} ${error.message}`);}
  finally{releaseTurnLock(combat.uuid);}
}
