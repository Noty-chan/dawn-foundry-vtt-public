import {isSupportedBoard} from './board.mjs';

/** Interpret only a whole, aligned 1×1 token on either known board. */
export function boardHeightAt(scene,token){
  if(!isSupportedBoard(scene))return {status:'unsupported'};
  const marks=Array.from(scene.tiles?.values()??[]).filter(t=>{const m=t.getFlag?.('dawn','boardMarker');return m?.version===1&&['low','high'].includes(m.type);});
  if(!marks.length)return {status:'inactive'};
  const x=token._source?.x??token.x,y=token._source?.y??token.y;
  if(token.width!==1||token.height!==1||!Number.isInteger(x)||!Number.isInteger(y))return {status:'manual'};
  const boards=[{id:'main',x:100,y:300},{id:'second',x:1000,y:300}];
  const board=boards.find(b=>x>=b.x&&y>=b.y&&x<b.x+700&&y<b.y+700&&(x-b.x)%100===0&&(y-b.y)%100===0);
  if(!board)return {status:'outside'};
  const levels=new Set(marks.filter(t=>{const m=t.getFlag('dawn','boardMarker');return m.board===board.id&&t.x===x&&t.y===y;}).map(t=>t.getFlag('dawn','boardMarker').type));
  if(levels.size>1)return {status:'manual'};
  return {status:'ok',elevation:levels.has('high')?1:levels.has('low')?-1:0};
}

/** Only confirmed public, single-cell tokens on the prepared board qualify. */
export function attackHasHeightDifference(scene,attacker,targets){
  const level=token=>{
    if(!token||token.parent!==scene||scene.tokens?.get(token.id)!==token||token.hidden||token.isSecret||token.disposition===-2)return null;
    const result=boardHeightAt(scene,token),actual=token._source?.elevation??token.elevation;
    return result.status==='ok'&&actual===result.elevation?result.elevation:null;
  };
  const source=level(attacker);if(source===null)return false;
  return Array.from(targets??[]).some(target=>{const height=level(target);return height!==null&&height!==source;});
}
