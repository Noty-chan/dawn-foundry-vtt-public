/**
 * Pure Difficult Terrain checks for an explicitly described square-grid path.
 * LionWing PDF p. 60; orthogonal connectivity and exhausted Stride are
 * project decisions DR-17 and DR-18. No Foundry globals, token updates, AP
 * costs, wall/occupancy checks, or automatic reactions belong here.
 */

const MAX_CELLS = 100000;
const MAX_STEPS = 10000;
const ORTHOGONAL = [[1,0],[-1,0],[0,1],[0,-1]];

function cellKey(cell) {
  if (!cell || !Number.isSafeInteger(cell.column) || !Number.isSafeInteger(cell.row)) {
    throw new TypeError('Expected integer grid coordinates');
  }
  return `${cell.column},${cell.row}`;
}

function fromKey(key) {
  const [column,row]=key.split(',').map(Number);
  return {column,row};
}

function cellSet(cells) {
  if (!Array.isArray(cells) || cells.length > MAX_CELLS) throw new RangeError('Invalid terrain cells');
  return new Set(cells.map(cellKey));
}

function component(terrain, seeds) {
  const visited=new Set(), queue=[];
  for (const key of seeds) if (terrain.has(key) && !visited.has(key)) {
    visited.add(key); queue.push(key);
  }
  // Indexing rather than shift keeps traversal linear in the number of cells.
  for (let i=0; i<queue.length; i++) {
    const {column,row}=fromKey(queue[i]);
    for (const [dx,dy] of ORTHOGONAL) {
      const x=column+dx,y=row+dy;
      if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) continue;
      const next=`${x},${y}`;
      if (terrain.has(next) && !visited.has(next)) {visited.add(next);queue.push(next);}
    }
  }
  return visited;
}

/**
 * Capture the connected difficult cells a 1x1 character started in. This is
 * immutable plain data owned by the caller, not a reference to live Regions.
 */
export function snapshotDifficultTerrain({turnId, position, difficultCells}) {
  if (typeof turnId!=='string' || !turnId) throw new TypeError('A stable turn ID is required');
  const origin=cellKey(position), terrain=cellSet(difficultCells);
  const ignored=component(terrain,[origin]);
  return {turnId,ignoredDifficultCells:[...ignored].map(fromKey)};
}

/**
 * Check only Difficult Terrain and path distance, not overall move legality.
 * `path` excludes the origin and contains each intermediate destination.
 * `budget` is the caller-supplied remaining distance for this movement.
 * Snapshot is required for a Stride; Jump ignores Difficult Terrain.
 * Teleport, forced movement, missing/oversized footprints, and geometry-off
 * return manual. Callers must explicitly provide the footprint.
 */
export function evaluateDifficultTerrainPath({
  origin, path, kind, budget, difficultCells, turnSnapshot, turnId,
  width, height, geometryChecks=true
}) {
  cellKey(origin);
  if (!Array.isArray(path) || path.length>MAX_STEPS) throw new RangeError('Invalid path');
  for (const cell of path) cellKey(cell);
  if (!Number.isSafeInteger(budget) || budget<0) throw new TypeError('Invalid movement budget');
  const manual = reason => ({status:'manual',reason,accepted:[],spent:0,stopCell:{...origin},speedSuppressed:false,discardStride:false});
  if (width==null || height==null) return manual('missing-footprint');
  if (!Number.isSafeInteger(width) || width<1 || !Number.isSafeInteger(height) || height<1) {
    throw new TypeError('Invalid footprint');
  }
  if (!geometryChecks) return manual('geometry-off');
  if (width!==1 || height!==1) return manual('large-footprint');
  if (!['stride','jump'].includes(kind)) return manual('unsupported-movement');
  const terrain=cellSet(difficultCells);
  let ignored=new Set(), affected=new Set();
  if (kind==='stride') {
    if (!turnSnapshot || typeof turnId!=='string' || !turnId || turnSnapshot.turnId!==turnId) return manual('missing-turn-snapshot');
    ignored=cellSet(turnSnapshot.ignoredDifficultCells);
    const current=component(terrain,ignored);
    const changed=current.size!==ignored.size || [...ignored].some(key=>!current.has(key));
    if (changed) affected=new Set([...ignored,...current]);
  }
  // Validate the complete geometric shape before returning any prefix. A caller
  // must not apply a partial result from a malformed route.
  let previous=origin, direction=null;
  for (const next of path) {
    const dx=next.column-previous.column,dy=next.row-previous.row;
    if (kind==='stride' && Math.abs(dx)+Math.abs(dy)!==1) throw Error('Stride requires orthogonal adjacent steps');
    if (kind==='jump') {
      if (Math.abs(dx)>1||Math.abs(dy)>1||(!dx&&!dy)) throw Error('Jump requires adjacent Line steps');
      if (direction && (direction[0]!==dx||direction[1]!==dy)) throw Error('Jump must follow one Line');
      direction=[dx,dy];
    }
    previous=next;
  }
  const accepted=[];
  for (const next of path) {
    if (accepted.length>=budget) return {status:'stopped',reason:'budget',accepted,spent:accepted.length,stopCell:{...(accepted.at(-1)??origin)},speedSuppressed:false,discardStride:false};
    const key=cellKey(next);
    if (affected.has(key)) return {status:'manual',reason:'terrain-changed',accepted,spent:accepted.length,stopCell:{...(accepted.at(-1)??origin)},speedSuppressed:false,discardStride:false};
    accepted.push({...next});
    if (kind==='stride' && terrain.has(key) && !ignored.has(key)) {
      return {status:'stopped',reason:'difficult-terrain',accepted,spent:accepted.length,stopCell:{...next},speedSuppressed:true,discardStride:true};
    }
  }
  return {status:'clear',reason:null,accepted,spent:accepted.length,stopCell:{...(accepted.at(-1)??origin)},speedSuppressed:false,discardStride:false};
}
