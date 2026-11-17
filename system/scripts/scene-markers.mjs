import {isSupportedBoard} from './board.mjs';
import {fodderPositions} from './fodder-batch.mjs';
import {fodderDialogContent,readFodderDialog} from './fodder-dialog.mjs';
import {label,escape} from './rolls.mjs';
import {isExecutor} from './operations.mjs';
import {boardHeightAt} from './board-height.mjs';
export {boardHeightAt,attackHasHeightDifference} from './board-height.mjs';

const TYPES=['difficult','low','high','note'];
const locks=new WeakSet();

/** Markers are annotations, not terrain automation. Deletion is strictly scoped. */
export async function changeBoardMarkers({scene,user,board,cells,type,remove=false,currentScene=()=>canvas.scene}){
  if(!user?.isGM||!scene?.isOwner)throw Error('sceneMarkerPermission');
  if(currentScene()!==scene||!isSupportedBoard(scene))throw Error('boardChanged');
  if(!TYPES.includes(type)||typeof remove!=='boolean')throw Error('sceneMarkerInvalid');
  const positions=fodderPositions(scene,board,cells),keys=new Set(positions.map(p=>`${p.x},${p.y}`));
  if(keys.size!==positions.length)throw Error('sceneMarkerInvalid');
  if(locks.has(scene))throw Error('sceneMarkerBusy');
  locks.add(scene);
  try{
    const matching=Array.from(scene.tiles?.values()??[]).filter(tile=>{
      const mark=tile.getFlag?.('dawn','boardMarker');
      return mark?.version===1&&mark.board===board&&mark.type===type&&keys.has(`${tile.x},${tile.y}`);
    });
    if(remove){
      if(!matching.length)return 0;
      try{
        const deleted=await scene.deleteEmbeddedDocuments('Tile',matching.map(t=>t.id));
        if(deleted?.length!==matching.length||matching.some(t=>scene.tiles.get(t.id)))throw Error('Unconfirmed');
      }catch(cause){throw new Error('sceneMarkerUncertain',{cause});}
      return matching.length;
    }
    // A cell has only one height. Create the requested height first, then
    // remove only our opposite-height markers; unrelated tiles stay intact.
    const opposite=type==='high'?'low':type==='low'?'high':null;
    const replaced=opposite?Array.from(scene.tiles?.values()??[]).filter(tile=>{
      const mark=tile.getFlag?.('dawn','boardMarker');
      return mark?.version===1&&mark.board===board&&mark.type===opposite&&keys.has(`${tile.x},${tile.y}`);
    }):[];
    const existing=new Set(matching.map(t=>`${t.x},${t.y}`));
    const fresh=positions.filter(p=>!existing.has(`${p.x},${p.y}`));
    const data=fresh.map(({x,y})=>({x,y,width:100,height:100,texture:{src:`systems/dawn/assets/marker-${type}.svg`},alpha:0.75,overhead:false,flags:{dawn:{boardMarker:{version:1,board,type}}}}));
    try{
      if(data.length){
        const created=await scene.createEmbeddedDocuments('Tile',data);
        if(created?.length!==data.length||created.some((t,i)=>!t?.id||scene.tiles.get(t.id)!==t||t.x!==data[i].x||t.y!==data[i].y||t.getFlag('dawn','boardMarker')?.type!==type))throw Error('Unconfirmed');
      }
      if(replaced.length){
        if(!user.isGM||!scene.isOwner||currentScene()!==scene||!isSupportedBoard(scene))throw Error('Board changed');
        const deleted=await scene.deleteEmbeddedDocuments('Tile',replaced.map(t=>t.id));
        if(deleted?.length!==replaced.length||replaced.some(t=>scene.tiles.get(t.id)))throw Error('Unconfirmed');
      }
    }catch(cause){throw new Error('sceneMarkerUncertain',{cause});}
    return fresh.length||replaced.length;
  }finally{locks.delete(scene);}
}

export async function openBoardMarkers(initialType='difficult'){
  if(!game.user.isGM)throw Error('sceneMarkerPermission');
  const scene=canvas.scene;
  if(!isSupportedBoard(scene))throw Error('boardChanged');
  const types=TYPES.map(type=>`<option value="${type}" ${type===initialType?'selected':''}>${escape(label(`sceneMarkerTypes.${type}`))}</option>`).join('');
  const result=await foundry.applications.api.DialogV2.prompt({classes:['dawn','dawn-modal','dawn-fodder-dialog'],position:{width:510},window:{title:label('sceneMarkerTitle')},
    content:`<p>${escape(label('sceneMarkerHint'))}</p><label>${escape(label('sceneMarkerType'))}<select name="markerType">${types}</select></label><label>${escape(label('sceneMarkerOperation'))}<select name="markerRemove"><option value="create">${escape(label('sceneMarkerCreate'))}</option><option value="remove">${escape(label('sceneMarkerRemove'))}</option></select></label>${fodderDialogContent(label,escape,null)}`,
    ok:{label:label('sceneMarkerApply'),callback:(_event,button)=>({...readFodderDialog(button.form),type:button.form.elements.markerType.value,remove:button.form.elements.markerRemove.value==='remove'})},rejectClose:false});
  if(!result)return null;
  return changeBoardMarkers({scene,user:game.user,...result});
}

const movingHeights=new WeakMap();
/** One elected GM applies only the final observed cell, then posts a rules reminder. */
export async function updateBoardHeight(token,changes,{executor=isExecutor,notify=(key)=>ui.notifications.warn(label(key)),announce=postHeightReminder}={}){
  if(!executor()||!('x' in changes||'y' in changes))return;
  const scene=token?.parent;if(!scene?.isOwner||scene.tokens?.get(token.id)!==token||!token.isOwner)return;
  const previous=movingHeights.get(token)??Promise.resolve();
  const run=previous.catch(()=>{}).then(async()=>{
    if(!executor()||scene.tokens.get(token.id)!==token)return;
    const position={x:token._source?.x??token.x,y:token._source?.y??token.y},result=boardHeightAt(scene,token);
    if(['inactive','unsupported','outside'].includes(result.status))return;
    if(result.status==='manual'){notify('sceneHeightManual');return;}
    const old=token._source?.elevation??token.elevation;if(old===result.elevation)return;
    if((token._source?.x??token.x)!==position.x||(token._source?.y??token.y)!==position.y)return;
    try{
      const updated=await token.update({elevation:result.elevation},{animate:false});
      if(!updated||(token._source?.elevation??token.elevation)!==result.elevation)throw Error('Unconfirmed');
    }catch(cause){notify('sceneHeightUncertain');console.error('DAWN elevation',cause);return;}
    await announce(token,old,result.elevation);
  });
  movingHeights.set(token,run);
  try{await run;}finally{if(movingHeights.get(token)===run)movingHeights.delete(token);}
}

async function postHeightReminder(token,oldHeight,newHeight){
  // Whispered document updates are broadcast by V13; never publish hidden movement.
  if(token.hidden||token.isSecret||token.disposition===-2){ui.notifications.info(label('sceneHeightHidden'));return;}
  const publicName=!token.hidden&&!token.isSecret&&[30,50].includes(token.displayName)&&token.name;
  const name=publicName?token.name:label('sceneHeightCharacter');
  const content=`<div class="dawn-roll"><h3>${escape(label('sceneHeightTitle'))}</h3><p>${escape(name)}: ${escape(oldHeight)} → ${escape(newHeight)}</p><p>${escape(label('sceneHeightRules'))}</p></div>`;
  await ChatMessage.create({content});
}
