import {createFodderBatch} from './fodder-batch.mjs';
import {label,escape} from './rolls.mjs';

/** Form controls keep the 7x7 choice accessible without relying on a custom canvas. */
export function fodderDialogContent(localize=label,htmlEscape=escape,hint='fodderBatchHint'){
 const cells=Array.from({length:49},(_,i)=>{const column=i%7,row=Math.floor(i/7),coordinate=`${String.fromCharCode(65+column)}${row+1}`;
  return `<label class="dawn-fodder-cell"><input type="checkbox" name="fodderCell" value="${column},${row}"><span>${coordinate}</span></label>`;}).join('');
 return `${hint?`<p>${htmlEscape(localize(hint))}</p>`:''}<label>${htmlEscape(localize('fodderBoard'))}<select name="fodderBoard"><option value="main">${htmlEscape(localize('fodderBoardMain'))}</option><option value="second">${htmlEscape(localize('fodderBoardSecond'))}</option></select></label><div class="dawn-fodder-grid" role="group" aria-label="${htmlEscape(localize('fodderGrid'))}">${cells}</div>`;
}
export function readFodderDialog(form){
 const board=form.elements.fodderBoard.value;
 const cells=Array.from(form.querySelectorAll('input[name="fodderCell"]:checked'),input=>{const [column,row]=input.value.split(',').map(Number);return {column,row};});
 return {board,cells};
}
/** Explicitly choose positions on the current prepared board; never auto-retry. */
export async function openFodderBatch(){
 if(!game.user.isGM)throw Error('fodderPermission');
 const scene=canvas.scene,matching=game.actors.filter(a=>a.getFlag('dawn','fodderTemplate')===true);
 if(matching.length!==1)throw Error(matching.length?'fodderDuplicate':'fodderTemplateMissing');
 const template=matching[0];
  const content=`<label>${escape(label('fodderSide'))}<select name="fodderSide"><option value="narrator">${escape(label('fodderSideNarrator'))}</option><option value="players">${escape(label('fodderSidePlayers'))}</option></select></label><p>${escape(label('fodderSideHint'))}</p>${fodderDialogContent()}`;
  const intent=await foundry.applications.api.DialogV2.prompt({classes:['dawn','dawn-modal','dawn-fodder-dialog'],position:{width:510},window:{title:label('fodderBatchTitle')},content,
  ok:{label:label('fodderBatchPlace'),callback:(_event,button)=>({...readFodderDialog(button.form),side:button.form.elements.fodderSide?.value??'narrator'})},rejectClose:false});
 if(!intent)return null;
 const current=game.actors.filter(a=>a.getFlag('dawn','fodderTemplate')===true);
 if(current.length!==1||current[0]!==template)throw Error('fodderTemplateInvalid');
 return createFodderBatch({scene,template,user:game.user,board:intent.board,cells:intent.cells,side:intent.side??'narrator'});
}
export function fodderBatchError(error,localize=label){
 const known=['fodderPermission','boardChanged','fodderTemplateInvalid','fodderTemplateMissing','fodderCellsInvalid','fodderBusy','fodderBatchInvalid','fodderBatchUnconfirmed','fodderDuplicate','fodderSideInvalid'];
 const code=known.includes(error?.message)?error.message:'fodderBatchUnconfirmed';
 if(code!=='fodderBatchUnconfirmed')return localize(code);
 const details=error?.batchId?` ID: ${error.batchId}; ${localize('fodderBatchConfirmed')}: ${error.confirmedTokenIds?.length??0}${error.uncertainIndex?`; ${localize('fodderBatchUncertainIndex')}: ${error.uncertainIndex}`:''}.`:'';
 return `${localize(code)}${details}`;
}
