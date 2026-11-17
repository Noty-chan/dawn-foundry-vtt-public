import {isSupportedBoard} from './board.mjs';

const origins=Object.freeze({main:{x:100,y:300},second:{x:1000,y:300}});
const cellSize=100,maxZones=49;
const busy=new Set();

/** A1 is top-left of the requested 7x7 board; explicit cells, no guessed placement. */
export function parseFodderCells(input){
  if(typeof input!=='string')throw Error('fodderCellsInvalid');
  const words=input.trim().split(/[\s,;]+/).filter(Boolean);
  if(!words.length||words.length>maxZones)throw Error('fodderCellsInvalid');
  return words.map(word=>{
    const match=/^([a-g])([1-7])$/i.exec(word);
    if(!match)throw Error('fodderCellsInvalid');
    return {column:match[1].toUpperCase().charCodeAt(0)-65,row:Number(match[2])-1};
  });
}

export function fodderPositions(scene,board,cells){
  if(!isSupportedBoard(scene))throw Error('boardChanged');
  const origin=origins[board];if(!origin||!Array.isArray(cells)||!cells.length||cells.length>maxZones)throw Error('fodderCellsInvalid');
  return cells.map(cell=>{
    const {column,row}=cell??{};
    if(!Number.isSafeInteger(column)||!Number.isSafeInteger(row)||column<0||column>6||row<0||row>6)throw Error('fodderCellsInvalid');
    return {x:origin.x+column*cellSize,y:origin.y+row*cellSize};
  });
}

/**
 * Make unique, explicitly placed token instances. This never deletes or retries.
 * An error after creation starts carries batchId, confirmedTokenIds and uncertainIndex.
 */
export async function createFodderBatch({scene,template,user,board,cells,side='narrator',currentScene=()=>canvas.scene,currentTemplate=()=>game.actors.get(template.id),newId=()=>foundry.utils.randomID()}){
  const validate=()=>{
    if(!user?.isGM||user.can?.('TOKEN_CREATE')===false||!scene?.isOwner)throw Error('fodderPermission');
    if(currentScene()!==scene||!isSupportedBoard(scene))throw Error('boardChanged');
    if(!template?.id||currentTemplate()!==template||!template.isOwner||template.type!=='npc'||template.getFlag('dawn','fodderTemplate')!==true||template.system?.presentation?.role!=='obstacle')throw Error('fodderTemplateInvalid');
  };
  validate();if(!['players','narrator'].includes(side))throw Error('fodderSideInvalid');const positions=fodderPositions(scene,board,cells);
  if(busy.has(scene.uuid))throw Error('fodderBusy');
  const batchId=newId();
  if(typeof batchId!=='string'||!/^[A-Za-z0-9]{16}$/.test(batchId)||Array.from(scene.tokens.values()).some(t=>t.getFlag?.('dawn','fodderBatch')?.id===batchId))throw Error('fodderBatchInvalid');
  busy.add(scene.uuid);const confirmedTokenIds=[];
  let uncertainIndex=null;
  try{
    const prototype=await template.getTokenDocument({},{parent:scene});
    if(!prototype)throw Error('fodderTemplateInvalid');
    const base=prototype.toObject();
    for(let i=0;i<positions.length;i++){
      validate();fodderPositions(scene,board,cells);
      const data=structuredClone(base);delete data._id;
      data.x=positions[i].x;data.y=positions[i].y;data.width=1;data.height=1;data.actorLink=false;data.disposition=side==='players'?1:-1;
      data.name=`${base.name||template.name||'Fodder Zone'} · ${batchId.slice(0,6)}-${i+1}`;
      data.delta??={};data.delta.system={...(data.delta.system??{}),health:{value:1},evasion:{value:0}};
      data.flags??={};data.flags.dawn={...(data.flags.dawn??{}),fodderSide:side,fodderBatch:{id:batchId,index:i+1,count:positions.length}};
      uncertainIndex=i+1;
      const created=await scene.createEmbeddedDocuments('Token',[data]);
      const token=created?.[0],marker=token?.getFlag?.('dawn','fodderBatch');
      if(created?.length!==1||!token?.id||scene.tokens.get(token.id)!==token||marker?.id!==batchId||marker?.index!==i+1||token.getFlag('dawn','fodderSide')!==side||token.disposition!==data.disposition||token.actorId!==template.id||token.x!==positions[i].x||token.y!==positions[i].y||token.name!==data.name||token.width!==1||token.height!==1||token.actorLink!==false||token.actor?.system?.health?.value!==1||token.actor?.system?.evasion?.value!==0)throw Error('fodderBatchUnconfirmed');
      confirmedTokenIds.push(token.id);uncertainIndex=null;
    }
    return {batchId,confirmedTokenIds};
  }catch(cause){
    if(!confirmedTokenIds.length&&uncertainIndex===null)throw cause;
    const error=new Error('fodderBatchUnconfirmed',{cause});
    Object.assign(error,{batchId,confirmedTokenIds:[...confirmedTokenIds],uncertainIndex});throw error;
  }finally{busy.delete(scene.uuid);}
}
