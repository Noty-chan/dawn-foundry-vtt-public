// Foundry V13 custom sockets append the authenticated sender ID on the server.
// This module validates narrowly scoped signals; they are requests only, never
// authority to spend resources. Caller must revalidate attack state and ownership.
const id=value=>typeof value==='string'&&/^[A-Za-z0-9]{16}$/.test(value);
const choices=new Set(['accept','block','dodgeTalent','dodgeMind']);
const exact=(data,keys)=>data&&typeof data==='object'&&!Array.isArray(data)&&Object.keys(data).length===keys.length&&keys.every(k=>Object.hasOwn(data,k));

export function makeReactionSignal({attackId,choice}){
 if(!id(attackId)||!choices.has(choice))throw Error('reactionSignalInvalid');
 return {version:1,type:'response',attackId,choice};
}
/** No target UUID, roll contents, resource data, or claimed sender are sent. */
export function readReactionSignal(data,senderId,{executorId,users}){
 if(!exact(data,['version','type','attackId','choice'])||data.version!==1||data.type!=='response'||!id(data.attackId)||!choices.has(data.choice)||!id(senderId)||!id(executorId))throw Error('reactionSignalInvalid');
 const sender=users?.get(senderId),executor=users?.get(executorId);
 if(!sender||sender.id!==senderId||!sender.active||!executor?.isGM||executor.id!==executorId||senderId===executorId)throw Error('reactionSignalUnauthorized');
 return {attackId:data.attackId,choice:data.choice,author:sender};
}
/** Acknowledgement means only server receipt; never presume GM acceptance. */
export function sendReactionSignal(socket,executorId,data){
 if(!id(executorId))throw Error('reactionSignalInvalid');
 const safe=makeReactionSignal(data);
 socket.emit('system.dawn',safe,{recipients:[executorId]});
}

/** Send a minimal prompt only to currently active owners of the targeted hero.
 * Source and actor references are sent solely to those owners, never broadcast. */
export function sendReactionPrompt({socket,attackId,source,actor,executorId,users}){
 if(!id(attackId)||!id(executorId)||!source?.uuid||!Array.isArray(source.whisper)||source.whisper.length||source.blind||source.visible!==true||!actor?.uuid||actor.type!=='hero')throw Error('reactionSignalInvalid');
 const recipients=Array.from(users.values()).filter(u=>u.active&&!u.isGM&&id(u.id)&&actor.testUserPermission(u,'OWNER')).map(u=>u.id);
 if(!recipients.length)throw Error('reactionOwnerOffline');
 socket.emit('system.dawn',{version:1,type:'prompt',attackId,sourceUuid:source.uuid,actorUuid:actor.uuid},{recipients});
 return recipients.length;
}
/** Sender ID must be the configured GM; the receiver must own the actor. */
export async function readReactionPrompt(data,senderId,{executorId,users,user,resolveUuid}){
 if(!exact(data,['version','type','attackId','sourceUuid','actorUuid'])||data.version!==1||data.type!=='prompt'||!id(data.attackId)||!id(senderId)||senderId!==executorId||typeof data.sourceUuid!=='string'||typeof data.actorUuid!=='string')throw Error('reactionSignalInvalid');
 const gm=users.get(senderId);if(!gm?.isGM||!gm.active||!user?.active)throw Error('reactionSignalUnauthorized');
 const [actor,source]=await Promise.all([resolveUuid(data.actorUuid),resolveUuid(data.sourceUuid)]);
 if(!actor||actor.uuid!==data.actorUuid||actor.type!=='hero'||!actor.testUserPermission(user,'OWNER')||!source||source.uuid!==data.sourceUuid||source.visible!==true||source.isContentVisible!==true)throw Error('reactionSignalUnauthorized');
 return {attackId:data.attackId,actor,source};
}
