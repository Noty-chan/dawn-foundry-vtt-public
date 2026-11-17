import {isPublicReactionTarget} from './reaction-privacy.mjs';
import {isExecutor} from './operations.mjs';
import {label,escape} from './rolls.mjs';
import {sendReactionPrompt} from './reaction-channel.mjs';
import {handleReactionPrompt,chooseReactionDialog} from './reaction-prompt-ui.mjs';
import {preparePrivateAttackLocked,acceptPrivateAttackAsGM,listPrivateAttacks,dispatchReactionSignal,continuePrivateAttack} from './private-attack-journal.mjs';
import {reactionLockManager} from './reaction-locks.mjs';
import {npcDamageAmount} from './npc-rolls.mjs';
import {heroAttackBaseDamage} from './hero-attacks.mjs';

const enabled=()=>game.settings.get('dawn','experimentalReactions')===true;
const environment=()=>({storage:globalThis.localStorage,world:game.world.id,executor:game.user,isExecutor,users:game.users,resolveUuid:uuid=>fromUuid(uuid)});
const refresh=()=>{if(ui.chat?.rendered)ui.chat.render();};
const warn=error=>{console.error('DAWN reaction',error);ui.notifications.warn(label(error?.message?.startsWith('reaction')||error?.message?.startsWith('attack')?error.message:'reactionFailed'));};
function button(text,action){const el=document.createElement('button');el.type='button';el.textContent=text;el.addEventListener('click',async event=>{event.preventDefault();event.stopPropagation();if(el.disabled)return;el.disabled=true;try{await action();}catch(error){warn(error);}finally{el.disabled=false;refresh();}});return el;}
function checkAvailability(){if(!game.socket?.connected)throw Error('reactionSocketOffline');if(!reactionLockManager())throw Error('attackJournalUnavailable');}
function publicTarget(target){return target?.parent===canvas.scene&&isPublicReactionTarget(target,game.users);}
/** A suggestion is editable and never proves a hit or resolves conditional bonuses. */
export function suggestedReactionDamage(result){
 if(result?.status!=='complete'||result.request?.context!=='combat'||result.request?.kind!=='normal')return null;
 return heroAttackBaseDamage(result.request,result.hits)??npcDamageAmount(result.request.damagePreview,result.hits);
}
async function promptOwners(state){
 const target=await fromUuid(state.tokenUuid),source=await fromUuid(state.sourceUuid);if(!target||!publicTarget(target))throw Error('attackPrivacy');
 return sendReactionPrompt({socket:game.socket,attackId:state.attackId,source,actor:target.actor,executorId:game.user.id,users:game.users});
}
async function prepare(source){
 if(!isExecutor())throw Error('attackPermission');checkAvailability();
 if(!Array.isArray(source.whisper)||source.whisper.length||source.blind)throw Error('attackPrivacy');
 const selected=Array.from(game.user.targets??[]);if(selected.length!==1)throw Error('reactionSelectTarget');
 const target=selected[0].document;if(target?.actor?.type!=='hero'||!publicTarget(target))throw Error('attackPrivacy');
 const suggestion=suggestedReactionDamage(source.getFlag?.('dawn','result'));
 const entered=await foundry.applications.api.DialogV2.prompt({window:{title:label('reactionPrepare')},position:{width:390},content:`<p>${escape(label('reactionPrepareHint'))}</p>${suggestion!==null?`<p>${escape(label('reactionSuggestedDamage'))}</p>`:''}<label>${escape(label('reactionAmount'))}<input name="damage" type="number" min="0" step="1" value="${suggestion??''}" required></label>`,ok:{label:label('reactionSendPrompt'),callback:(_e,b)=>b.form.elements.damage.value.trim()===''?NaN:Number(b.form.elements.damage.value)},rejectClose:false});
 if(entered===null||entered===undefined)return;
 if(!isExecutor()||!publicTarget(target)||!game.user.targets.has(target.object)||!Array.isArray(source.whisper)||source.whisper.length||source.blind)throw Error('attackChanged');
 const state=await preparePrivateAttackLocked({...environment(),source,target,scene:canvas.scene,amount:entered,randomId:()=>foundry.utils.randomID()});
 await promptOwners(state);ui.notifications.info(label('reactionSentUnconfirmed'));
}
async function continueAttack(state,operation){
 if(!isExecutor())throw Error('attackPermission');checkAvailability();
 if(operation==='damage'){
  const choice=await confirmDamageChoice(foundry.applications.api.DialogV2);
  if(choice===null||choice===undefined)return;
  await continuePrivateAttack({...environment(),id:state.attackId,operation,operationId:foundry.utils.randomID(),standardWound:choice.standardWound});
 }else{
  const accepted=await foundry.applications.api.DialogV2.confirm({window:{title:label('reactionConfirmMovement')},content:`<p>${escape(label('reactionConfirmMovementHint'))}</p>`,rejectClose:false});
  if(accepted)await continuePrivateAttack({...environment(),id:state.attackId,operation,operationId:foundry.utils.randomID()});
 }
}
/** Explicitly opt in to the supported non-KO wound; Influence remains manual. */
export async function confirmDamageChoice(dialog){
 return dialog.prompt({window:{title:label('reactionConfirmDamage')},position:{width:390},
  content:`<p>${escape(label('reactionConfirmDamageHint'))}</p><label><input type="checkbox" name="standardWound"> ${escape(label('reactionStandardWound'))}</label><p>${escape(label('reactionStandardWoundHint'))}</p>`,
  ok:{label:label('reactionConfirmDamage'),callback:(_event,button)=>({standardWound:button.form.elements.standardWound.checked===true})},rejectClose:false});
}
export function renderReactionControls(message,root){
 if(!enabled()||!isExecutor()||!root?.querySelector||!message?.uuid)return;
 const result=message.getFlag?.('dawn','result');if(result?.status!=='complete'||result.request?.context!=='combat')return;
 const content=root.querySelector('.message-content');if(!content)return;
 root.querySelector('.dawn-reaction-actions')?.remove();const section=document.createElement('section');section.className='dawn-reaction-actions';
 section.append(button(label('reactionPrepare'),()=>prepare(message)));
 try{
  for(const state of listPrivateAttacks({...environment(),sourceUuid:message.uuid})){
   const row=document.createElement('div');row.className='dawn-reaction-row';
   const status=document.createElement('small'),target=fromUuidSync(state.tokenUuid);status.textContent=`${target?.name??state.attackId.slice(0,6)} · ${label('reactionAmount')}: ${state.amount} · ${label(`reactionPhase.${state.phase}`)}`;row.append(status);
   if(state.phase==='awaitingReaction'){row.append(button(label('reactionResend'),()=>promptOwners(state)));row.append(button(label('reactionSkipGM'),async()=>{const ok=await foundry.applications.api.DialogV2.confirm({window:{title:label('reactionSkipGM')},content:`<p>${escape(label('reactionSkipGMHint'))}</p>`,rejectClose:false});if(ok)await acceptPrivateAttackAsGM({...environment(),id:state.attackId});}));}
   if(['resolvingReaction','applyingDamage'].includes(state.phase))row.append(button(label('reactionReconcile'),async()=>{await continuePrivateAttack({...environment(),id:state.attackId,operation:'reconcile'});}));
   if(state.phase==='awaitingMovement')row.append(button(label('reactionConfirmMovement'),()=>continueAttack(state,'movement')));
   if(state.phase==='readyForDamage')row.append(button(label('reactionConfirmDamage'),()=>continueAttack(state,'damage')));
   section.append(row);
  }
 }catch(error){const message=document.createElement('small');message.textContent=label('attackJournalUnavailable');section.append(message);console.error('DAWN reaction journal',error);}
 content.append(section);
}
export function installReactionSocket(){
 game.socket.on('system.dawn',async(data,senderId)=>{
  if(!enabled()||!data||data.version!==1)return;
  try{
   if(data.type==='prompt'){
    const executorId=game.settings.get('dawn','executorUserId');
    await handleReactionPrompt({data,senderId,executorId,users:game.users,user:game.user,resolveUuid:uuid=>fromUuid(uuid),socket:game.socket,
      choose:args=>chooseReactionDialog(args,{dialog:foundry.applications.api.DialogV2,label,escape}),notify:key=>ui.notifications.info(label(key))});
   }else if(data.type==='response'&&isExecutor()){
    await dispatchReactionSignal({...environment(),data,senderId});refresh();
   }
  }catch(error){warn(error);}
 });
}
