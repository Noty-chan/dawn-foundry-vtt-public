export const BOARD_IMAGE='systems/dawn/assets/board.png';
const CELL=100, WIDTH=2500, HEIGHT=1500;
const discard={x:1000,y:1100,width:700,height:300};

export function boardSceneData(name) {
  return {name,width:WIDTH,height:HEIGHT,padding:0,background:{src:BOARD_IMAGE},
    grid:{type:1,size:CELL,distance:1,units:'cells',color:'#000000',alpha:0},
    tokenVision:false,fog:{exploration:false},flags:{dawn:{boardPreset:1}}};
}

export function isSupportedBoard(scene) {
  return scene?.getFlag?.('dawn','boardPreset')===1 && scene.width===WIDTH && scene.height===HEIGHT &&
    scene.padding===0 && scene.grid?.type===1 && scene.grid?.size===CELL && scene.background?.src===BOARD_IMAGE &&
    (scene.background?.offsetX??0)===0 && (scene.background?.offsetY??0)===0;
}

/** Recognize only a whole token inside the unchanged preset's discard area. */
export function inPreparedDiscard(scene,token){
  if(!isSupportedBoard(scene))return false;
  const x=token?._source?.x??token?.x,y=token?._source?.y??token?.y,w=token?.width,h=token?.height;
  return Number.isFinite(x)&&Number.isFinite(y)&&Number.isFinite(w)&&Number.isFinite(h)&&w>0&&h>0&&
    x>=discard.x&&y>=discard.y&&x+w*CELL<=discard.x+discard.width&&y+h*CELL<=discard.y+discard.height;
}

/** Find a whole-cell slot with no overlapping token. Never change the token data. */
export function discardPosition(scene, token) {
  if (!isSupportedBoard(scene)) throw Error('boardChanged');
  const w=token.width, h=token.height;
  if (!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||w>7||h>3) throw Error('boardTokenSize');
  const others=Array.from(scene.tokens).filter(t=>t.id!==token.id);
  for(let y=discard.y;y+h*CELL<=discard.y+discard.height;y+=CELL) {
    for(let x=discard.x;x+w*CELL<=discard.x+discard.width;x+=CELL) {
      const overlaps=others.some(t=>x<t.x+t.width*CELL&&x+w*CELL>t.x&&y<t.y+t.height*CELL&&y+h*CELL>t.y);
      if (!overlaps) return {x,y};
    }
  }
  throw Error('boardDiscardFull');
}

/** Verify room for two footprints before initiating a multi-token transfer. */
export function discardPairFits(scene,first,second){
  const check=(a,b)=>{
    const firstPosition=discardPosition(scene,a);
    const surrogate={width:scene.width,height:scene.height,padding:scene.padding,grid:scene.grid,background:scene.background,
      getFlag:(...args)=>scene.getFlag(...args),tokens:[...scene.tokens,{id:'dawn-planned-slot',...firstPosition,width:a.width,height:a.height}]};
    discardPosition(surrogate,b);
  };
  // Departure currently moves the initiator first; its first-fit slot must
  // leave room for the second participant as well.
  check(first,second);
  return true;
}

let moving=false;
const discardQueues=new WeakMap();
/** Serialise slot selection and the confirmed move on this client, per scene. */
export async function placeInDiscard(scene,token){
  const previous=discardQueues.get(scene)??Promise.resolve();
  const operation=previous.catch(()=>{}).then(async()=>{
    if(token.parent!==scene||scene.tokens.get(token.id)!==token||!token.isOwner)throw Error('boardSelectOne');
    const position=discardPosition(scene,token);
    // V13 infers ordinary path movement from update({x,y}); it can be split or
    // constrained by regions/walls. A service transfer uses an explicit
    // no-cost displacement waypoint instead, without deleting the token.
    if(token.movement&&!['completed','stopped'].includes(token.movement.state))throw Error('boardMoveUnconfirmed');
    const result=await token.move({...position,action:'displace'},{animate:false});
    if(!result||token.x!==position.x||token.y!==position.y||token._source?.x!==position.x||token._source?.y!==position.y||
      (token.movement&&!['completed','stopped'].includes(token.movement.state)))throw Error('boardMoveUnconfirmed');
    return result;
  });
  discardQueues.set(scene,operation);
  try{return await operation;}finally{if(discardQueues.get(scene)===operation)discardQueues.delete(scene);}
}
export async function moveToDiscard({scene,token,isGM}) {
  if (!isGM||!scene||!token||token.parent!==scene||scene.tokens.get(token.id)!==token||!token.isOwner) throw Error('boardSelectOne');
  if (moving) throw Error('boardBusy');
  moving=true;
  try {
    return await placeInDiscard(scene,token);
  } finally { moving=false; }
}
