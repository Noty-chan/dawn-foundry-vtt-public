import {escape,label} from './rolls.mjs';

const IMAGES={light:'worlds/dawn-development/assets/game-prep/fey-light.png',purple:'worlds/dawn-development/assets/game-prep/fey-purple.png'};
let socket;

async function placeFi(request){
  if(!game.user.isGM) throw new Error('GM required');
  const user=game.users.get(this.socketdata.userId), actor=game.actors.get(request?.actorId), scene=game.scenes.get(request?.sceneId);
  if(!user || !actor || !scene || !actor.testUserPermission(user,'OWNER') || !scene.testUserPermission(user,'OBSERVER')) throw new Error('Access denied');
  if(!Object.hasOwn(IMAGES,request.color) || !Number.isFinite(request.x) || !Number.isFinite(request.y)) throw new Error('Invalid request');
  const dims=scene.dimensions;
  if(request.x<0 || request.y<0 || request.x>=dims.width || request.y>=dims.height) throw new Error('Outside scene');
  const size=scene.grid.size, x=request.x+size*0.55, y=request.y+size*0.55;
  if(request.tileId){
    const tile=scene.tiles.get(request.tileId), fi=tile?.flags?.dawn?.fi;
    if(!tile || fi?.actorId!==actor.id || fi?.color!==request.color) throw new Error('Not an owned Fi');
    await tile.update({x,y}); return {id:tile.id,created:false};
  }
  const [tile]=await scene.createEmbeddedDocuments('Tile',[{texture:{src:IMAGES[request.color]},x,y,width:size*0.6,height:size*0.6,hidden:false,flags:{dawn:{fi:{actorId:actor.id,color:request.color}}}}]);
  return {id:tile.id,created:true};
}

async function chooseFi(color){
  if(!canvas.ready || !socket) return ui.notifications.warn(label('fiUnavailable'));
  const actor=game.user.character ?? (game.user.isGM ? canvas.tokens.controlled[0]?.actor : null);
  if(!actor || !actor.testUserPermission(game.user,'OWNER')) return ui.notifications.warn(label('fiActorMissing'));
  const scene=canvas.scene, list=scene.tiles.contents.filter(t=>t.flags?.dawn?.fi?.actorId===actor.id && t.flags?.dawn?.fi?.color===color);
  const options=[`<option value="">${escape(label('fiCreate'))}</option>`,...list.map((tile,i)=>`<option value="${escape(tile.id)}">${escape(label('fiMove'))} ${i+1} (x ${Math.round(tile.x)}, y ${Math.round(tile.y)})</option>`)].join('');
  const tileId=await foundry.applications.api.DialogV2.prompt({window:{title:color==='light'?label('fiLight'):label('fiPurple')},content:`<p>${escape(label('fiChoose'))}</p><select name="fi">${options}</select>`,ok:{label:label('fiChoosePlace'),callback:(_event,button)=>button.form.elements.fi.value || '__new__'},rejectClose:false});
  if(!tileId)return;
  const stage=canvas.stage, sceneId=scene.id;
  const cleanup=()=>{stage.off('pointerdown',click);window.removeEventListener('keydown',cancel);};
  const cancel=event=>{if(event.key==='Escape'){cleanup();ui.notifications.info(label('fiCancelled'));}};
  const click=async event=>{if(event.button!==0)return;cleanup();try{
    if(!canvas.ready || canvas.scene.id!==sceneId) throw new Error(label('fiSceneChanged'));
    const point=event.getLocalPosition(canvas.tiles), pos=canvas.grid.getTopLeftPoint(point);
    await socket.executeAsGM('dawn.placeFi',{actorId:actor.id,sceneId,color,tileId:tileId==='__new__'?null:tileId,x:pos.x,y:pos.y});
    ui.notifications.info(label('fiPlaced'));
  }catch(error){console.error('DAWN Fi',error);ui.notifications.error(label('fiFailed'));}};
  stage.on('pointerdown',click);window.addEventListener('keydown',cancel);ui.notifications.info(label('fiClick'));
}

Hooks.once('ready',()=>{
  if(!game.modules.get('socketlib')?.active || !game.modules.get('sequencer')?.active)return;
  socket=socketlib.registerModule('sequencer');
  socket?.register('dawn.placeFi',placeFi);
});
Hooks.on('chatMessage',(_log,message)=>{
  const match=message.trim().match(/^\/dawn-fi\s+(light|purple)$/i);
  if(!match)return;
  void chooseFi(match[1].toLowerCase()); return false;
});
