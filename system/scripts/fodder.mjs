/** Reusable world Actor for individual Fodder Zones, not a combatant. */
export function fodderTemplateData({name,folderId}={}){
  return {
    name:name||'Fodder Zone',type:'npc',img:'systems/dawn/assets/fodder.svg',
    ...(folderId?{folder:folderId}:{}),
    flags:{dawn:{fodderTemplate:true}},
    system:{editionId:'dawn-en-lionwing-cb2f8e67',canonicalId:'',kind:'standard',tier:0,
      presentation:{role:'obstacle'},health:{value:1},evasion:{value:0},
      statistics:{health:{base:1,perTier:0,override:null},speed:{base:0,perTier:0,override:null},armor:{base:0,perTier:0,override:null},evasion:{base:0,perTier:0,override:null}},
      content:{
        en:{name:'Fodder Zone',passive:'A valid target with 1 Health. Difficult Terrain for opponents; may overlap characters and takes no turns. After each NPC turn, move Narrator-controlled zones up to 2 spaces. At the end of the round, each may deal 2 damage to one player within 1 space. Player-controlled zones move after player turns and may damage enemies. Resolve movement, sides and damage manually.'},
        ru:{name:'Зона Приспешников',passive:'Цель с 1 Здоровьем. Сложная местность для противников; может находиться в одной клетке с персонажами и не совершает ходы. После хода NPC Нарратор может переместить каждую свою зону на расстояние до 2 клеток. В конце раунда каждая может нанести 2 урона одному игроку в пределах 1 клетки. Зоны игроков перемещаются после их ходов и могут наносить урон врагам. Стороны, перемещение и урон определяются вручную.'}
      }},
    prototypeToken:{name:name||'Fodder Zone',texture:{src:'systems/dawn/assets/fodder.svg'},width:1,height:1,actorLink:false,disposition:-1,sight:{enabled:false},displayName:30}
  };
}
let pending=null;
/** One explicit template per world, never overwrite or silently recover an uncertain write. */
export async function createFodderTemplate({user,actors,create,folderId=null,name}){
  if(!user?.isGM||user.can?.('ACTOR_CREATE')===false)throw Error('fodderPermission');
  if(pending)throw Error('fodderBusy');
  pending=true;
  try{
    const matches=Array.from(actors??[]).filter(a=>a.getFlag?.('dawn','fodderTemplate')===true);
    if(matches.length>1)throw Error('fodderDuplicate');
    if(matches.length===1){if(matches[0].type!=='npc')throw Error('fodderDuplicate');return {actor:matches[0],created:false};}
    let actor;
    try{actor=await create(fodderTemplateData({name,folderId}));}
    catch(cause){throw new Error('fodderUnconfirmed',{cause});}
    if(!actor||actor.type!=='npc'||actor.getFlag?.('dawn','fodderTemplate')!==true)throw Error('fodderUnconfirmed');
    return {actor,created:true};
  }finally{pending=null;}
}
