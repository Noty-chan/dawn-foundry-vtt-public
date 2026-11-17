import {isSupportedBoard} from './board.mjs';
import {changeBoardMarkers} from './scene-markers.mjs';
import {createFodderBatch} from './fodder-batch.mjs';
import {fodderMovementSnapshot,moveFodderZone} from './fodder-movement.mjs';
import {label} from './rolls.mjs';

let active=null,busy=false;
export function boardCellAt(scene,x,y){
  if(!isSupportedBoard(scene)||!Number.isFinite(x)||!Number.isFinite(y))return null;
  for(const [board,ox] of [['main',100],['second',1000]]){
    if(x>=ox&&x<ox+700&&y>=300&&y<1000)return {board,cells:[{column:Math.floor((x-ox)/100),row:Math.floor((y-300)/100)}]};
  }
  return null;
}
export function stopBoardBrush(){
  if(!active)return;
  active.view.removeEventListener('pointerdown',active.click,true);
  window.removeEventListener('keydown',active.key);
  active=null;
}
export function startBoardBrush(mode){
  stopBoardBrush();
  if(!game.user.isGM||!canvas.ready||!isSupportedBoard(canvas.scene)){ui.notifications.warn(label('boardChanged'));return;}
  const scene=canvas.scene,view=canvas.app.view,stage=canvas.stage;
  let token,snapshot;
  if(mode==='move'){
    try{const selected=canvas.tokens.controlled;if(selected.length!==1)throw Error('fodderMoveSelect');token=selected[0].document;snapshot=fodderMovementSnapshot(scene,token);}
    catch(error){ui.notifications.warn(label(error.message));return;}
  }
  const finish=()=>{if(active?.click!==click)return;stopBoardBrush();if(ui.controls?.control?.name==='dawn')ui.controls.activate({control:'dawn',tool:'panel'});};
  const key=event=>{if(event.key==='Escape')finish();};
  const click=async event=>{
    if(event.button!==0||!active)return;
    if(busy){event.preventDefault();event.stopImmediatePropagation();return;}
    if(canvas.scene!==scene||!game.user.isGM){finish();return;}
    const rect=view.getBoundingClientRect();
    const point=stage.worldTransform.applyInverse({x:(event.clientX-rect.left)*canvas.app.screen.width/rect.width,y:(event.clientY-rect.top)*canvas.app.screen.height/rect.height});
    const cell=boardCellAt(scene,point.x,point.y);
    event.preventDefault();event.stopImmediatePropagation();
    if(!cell){ui.notifications.warn(label('boardBrushOutside'));return;}
    busy=true;
    try{
      if(mode==='move'){await moveFodderZone({scene,token,user:game.user,snapshot,...cell});finish();}
      else if(mode==='fodderEnemy'||mode==='fodderAlly'){
        const matching=game.actors.filter(a=>a.getFlag('dawn','fodderTemplate')===true);
        if(matching.length!==1)throw Error(matching.length?'fodderDuplicate':'fodderTemplateMissing');
        await createFodderBatch({scene,template:matching[0],user:game.user,side:mode==='fodderAlly'?'players':'narrator',...cell});
      }else{
        const remove=event.shiftKey;
        await changeBoardMarkers({scene,user:game.user,type:mode,remove,...cell});
      }
    }catch(error){ui.notifications.warn(label(error.message));console.error('DAWN brush',error);if(mode==='move'||error.message==='sceneMarkerUncertain'||error.message==='fodderBatchUnconfirmed')finish();}
    finally{busy=false;}
  };
  active={view,click,key};view.addEventListener('pointerdown',click,true);window.addEventListener('keydown',key);
  ui.notifications.info(label(mode==='move'?'boardBrushMoveHint':'boardBrushHint'));
}
