import {isSupportedBoard} from './board.mjs';
import {fodderPositions} from './fodder-batch.mjs';
import {fodderDialogContent,readFodderDialog} from './fodder-dialog.mjs';
import {label,escape} from './rolls.mjs';

const flights=new WeakSet();
const stored=(token,key)=>token._source?.[key]??token[key];

export function fodderMovementSnapshot(scene,token){
  if(!isSupportedBoard(scene))throw Error('boardChanged');
  if(!token?.uuid||token.parent!==scene||scene.tokens.get(token.id)!==token||!token.isOwner||token.actor?.getFlag?.('dawn','fodderTemplate')!==true||!(Number(token.actor.system?.health?.value)>0)||token.width!==1||token.height!==1)throw Error('fodderMoveSelect');
  const x=stored(token,'x'),y=stored(token,'y');
  const board=[{id:'main',x:100,y:300},{id:'second',x:1000,y:300}].find(b=>x>=b.x&&x<b.x+700&&y>=b.y&&y<b.y+700&&(x-b.x)%100===0&&(y-b.y)%100===0);
  if(!board)throw Error('fodderMoveSelect');
  return {uuid:token.uuid,x,y,board:board.id,health:token.actor.system.health.value};
}

/** Move the same zone once per explicit command; no implicit retry or deletion. */
export async function moveFodderZone({scene,token,user,board,cells,snapshot,currentScene=()=>canvas.scene}){
  if(!user?.isGM||!scene?.isOwner||currentScene()!==scene)throw Error('fodderPermission');
  if(flights.has(token))throw Error('fodderBusy');
  const current=fodderMovementSnapshot(scene,token);
  if(JSON.stringify(current)!==JSON.stringify(snapshot))throw Error('fodderMoveChanged');
  if(board!==current.board||!Array.isArray(cells)||cells.length!==1)throw Error('fodderMoveDestination');
  const [destination]=fodderPositions(scene,board,cells);
  if((Math.abs(destination.x-current.x)+Math.abs(destination.y-current.y))/100>2)throw Error('fodderMoveDistance');
  if(token.movement&&!['completed','stopped'].includes(token.movement.state))throw Error('fodderMoveBusy');
  if(destination.x===current.x&&destination.y===current.y)return false;
  flights.add(token);
  try{
    if(currentScene()!==scene||!user.isGM||JSON.stringify(fodderMovementSnapshot(scene,token))!==JSON.stringify(snapshot))throw Error('fodderMoveChanged');
    try{
      const result=await token.move({...destination,action:'walk'},{animate:false});
      if(!result||stored(token,'x')!==destination.x||stored(token,'y')!==destination.y)throw Error('Unconfirmed');
    }catch(cause){throw new Error('fodderMoveUncertain',{cause});}
    return true;
  }finally{flights.delete(token);}
}

export async function openFodderMovement(){
  if(!game.user.isGM)throw Error('fodderPermission');
  const scene=canvas.scene,selected=canvas.tokens?.controlled??[];
  if(selected.length!==1)throw Error('fodderMoveSelect');
  const token=selected[0].document,snapshot=fodderMovementSnapshot(scene,token);
  const grid=fodderDialogContent(label,escape,null).replace(`value="${snapshot.board}"`,`value="${snapshot.board}" selected`);
  const content=`<p>${escape(label('fodderMoveHint'))}</p>${grid}`;
  const intent=await foundry.applications.api.DialogV2.prompt({classes:['dawn','dawn-modal','dawn-fodder-dialog'],position:{width:510},window:{title:label('fodderMoveTitle')},content,
    ok:{label:label('fodderMoveApply'),callback:(_event,button)=>readFodderDialog(button.form)},rejectClose:false});
  if(!intent)return null;
  return moveFodderZone({scene,token,user:game.user,snapshot,...intent});
}
