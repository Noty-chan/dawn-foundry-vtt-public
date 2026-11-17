import {readReactionPrompt,sendReactionSignal} from './reaction-channel.mjs';
import {heroReactionSnapshot,planHeroReaction} from './hero-reaction.mjs';

// Separate from socket registration: server-side authenticated sender and
// current document permissions are prerequisites, not data supplied by UI.
const pending=new Set();
export async function handleReactionPrompt({data,senderId,executorId,users,user,resolveUuid,socket,choose,notify}){
 const prompt=await readReactionPrompt(data,senderId,{executorId,users,user,resolveUuid});
 if(pending.has(prompt.attackId))return 'already-open';
 pending.add(prompt.attackId);
 try{
  const actor=prompt.actor,snapshot=heroReactionSnapshot(actor);
  // No core reaction is affordable; special reactions remain a manual ruling.
  const autoSkip=snapshot.focus<2;
  const choice=autoSkip?'accept':await choose({actor,source:prompt.source,snapshot,choices:['accept','block','dodgeTalent','dodgeMind']});
  if(choice===null||choice===undefined)return 'cancelled';
  const executor=users.get(executorId);
  if(!executor?.active||!executor.isGM||senderId!==executorId)throw Error('reactionExecutorOffline');
  if(await resolveUuid(actor.uuid)!==actor||!actor.testUserPermission(user,'OWNER')||!prompt.source.visible||!prompt.source.isContentVisible)throw Error('reactionChanged');
  const current=heroReactionSnapshot(actor);
  if(JSON.stringify(snapshot)!==JSON.stringify(current))throw Error('reactionChanged');
  planHeroReaction(current,choice);
  sendReactionSignal(socket,executorId,{attackId:prompt.attackId,choice});
  notify(autoSkip?'reactionAutoSentUnconfirmed':'reactionSentUnconfirmed');
  return 'sent-unconfirmed';
 }finally{pending.delete(prompt.attackId);}
}

/** Foundry dialog adapter: selecting or closing does not itself change any Actor. */
export async function chooseReactionDialog({actor,snapshot,choices},{dialog,label,escape}){
 const allowed=new Set(['accept','block','dodgeTalent','dodgeMind']);
 if(!choices?.length||choices.some(c=>!allowed.has(c)))throw Error('reactionInvalid');
 const text={accept:label('reactionChoiceAccept'),block:label('reactionChoiceBlock'),dodgeTalent:label('reactionChoiceDodgeTalent'),dodgeMind:label('reactionChoiceDodgeMind')};
 const buttons=choices.map(choice=>({action:choice,label:text[choice],callback:()=>choice}));
 return dialog.wait({classes:['dawn','dawn-modal','dawn-reaction-dialog'],window:{title:label('reactionTitle')},position:{width:450},
  content:`<h3>${escape(actor.name)}</h3><p>${escape(label('reactionPrompt'))}</p><p>${escape(label('focus'))}: ${escape(snapshot.focus)}</p><p>${escape(snapshot.focus<2?label('reactionLowFocus'):label('reactionMoveManual'))}</p><p>${escape(label('reactionSpecialManual'))}</p>`,
  buttons,rejectClose:false});
}
