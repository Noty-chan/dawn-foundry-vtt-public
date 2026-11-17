import {setBattleTension} from './battle-tension.mjs';
import {label} from './rolls.mjs';
import {startBoardBrush,stopBoardBrush} from './board-brush.mjs';
import {prepareBattle} from './battle-setup.mjs';
import {openDuelTool} from './duel-ui.mjs';

async function adjustTension(delta){
  const combat=game.combat,party=game.dawn.party,id=combat?.getFlag('dawn','storyContextId'),shown=party?.system?.storyContexts?.[id]?.tension;
  if(!combat?.started||!Number.isSafeInteger(shown))throw Error('combatChanged');
  await setBattleTension({combat,party,value:Math.max(0,shown+delta),expected:shown,viewed:()=>game.combat});
  ui.notifications.info(`${label('tension')}: ${Math.max(0,shown+delta)}`);
}
function tensionTool(delta){if(!game.user.isGM)return;return adjustTension(delta).catch(error=>ui.notifications.warn(label(error.message)));}

async function startSelectedBattle(){
  stopBoardBrush();
  try{
    // prepareBattle refuses an existing encounter, validates the selection and
    // leaves any partially created draft available for explicit recovery.
    const combat=await prepareBattle();
    ui.sidebar.activateTab('combat');
    await combat.startCombat(); // Native DAWN first-turn choice can be cancelled.
  }catch(error){ui.sidebar.activateTab('combat');ui.notifications.warn(error.message);}
}

const brush=(name,order,title,icon,mode)=>({name,order,title,icon,onChange:(_event,active)=>{if(active)startBoardBrush(mode);else stopBoardBrush();}});
/** Compact native scene tools; all participants can open shared clocks. */
export function addDawnSceneControls(controls){
  const tools={
    panel:{name:'panel',order:0,title:'DAWN.sceneControls',icon:'fa-solid fa-sun'},
    clocks:{name:'clocks',order:1,title:'DAWN.clocksTitle',icon:'fa-solid fa-clock',button:true,onChange:()=>game.dawn?.clocks?.render({force:true,window:{title:game.dawn.clocks.title}})}
  };
  if(game.user.isGM)Object.assign(tools,{
    select:{name:'select',order:2,title:'CONTROLS.BasicSelect',icon:'fa-solid fa-expand',button:true,onChange:()=>{stopBoardBrush();canvas.tokens.activate();}},
    battle:{name:'battle',order:3,title:'DAWN.sceneBattle',icon:'fa-solid fa-swords',button:true,onChange:()=>{stopBoardBrush();ui.sidebar.activateTab('combat');}},
    battleStart:{name:'battleStart',order:3.5,title:'DAWN.sceneBattleStart',icon:'fa-solid fa-play',button:true,onChange:()=>startSelectedBattle()},
    tensionUp:{name:'tensionUp',order:11,title:'DAWN.tensionIncrease',icon:'fa-solid fa-plus',button:true,onChange:()=>tensionTool(1)},
    tensionDown:{name:'tensionDown',order:12,title:'DAWN.tensionDecrease',icon:'fa-solid fa-minus',button:true,onChange:()=>tensionTool(-1)},
    high:brush('high',4,'DAWN.boardBrushHigh','fa-solid fa-angles-up','high'),
    low:brush('low',5,'DAWN.boardBrushLow','fa-solid fa-angles-down','low'),
    difficult:brush('difficult',6,'DAWN.boardBrushDifficult','fa-solid fa-mountain','difficult'),
    note:brush('note',7,'DAWN.boardBrushNote','fa-solid fa-map-pin','note'),
    fodderEnemy:brush('fodderEnemy',8,'DAWN.boardBrushEnemy','fa-solid fa-users','fodderEnemy'),
    fodderAlly:brush('fodderAlly',9,'DAWN.boardBrushAlly','fa-solid fa-user-group','fodderAlly'),
    fodderMove:brush('fodderMove',10,'DAWN.fodderMoveTitle','fa-solid fa-arrows-up-down-left-right','move')
  });
  if(game.user.isGM&&game.settings?.get('dawn','experimentalDuels')===true)tools.duel={name:'duel',order:10.5,title:'DAWN.duelTitle',icon:'fa-solid fa-hand-fist',button:true,onChange:()=>{stopBoardBrush();return openDuelTool();}};
  controls.dawn={name:'dawn',order:100,title:'DAWN.sceneControls',icon:'fa-solid fa-sun',activeTool:'panel',onChange:(_event,active)=>{if(!active)stopBoardBrush();},tools};
}
