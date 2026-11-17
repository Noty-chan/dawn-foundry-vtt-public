/**
 * The Narrator has placed the same token at an agreed legal location.
 * Clear only the matching service presence, then remove the effect. If removal
 * fails the effect remains visible and the Narrator can retry; never recreate a token.
 */
export function returnTokenForActor(actor, scenes) {
  if (actor.isToken) {
    if (!actor.token) throw Error('Synthetic Actor has no token');
    return actor.token;
  }
  // Linked tokens share the Actor. Never guess which of several placements is returning.
  const matches=[];
  for (const scene of scenes) for (const token of scene.tokens) {
    if (token.actorLink && token.actorId===actor.id) matches.push(token);
  }
  if (matches.length>1) throw Error('Multiple linked tokens require manual reconciliation');
  return matches[0]??null;
}

export async function finishDisappeared({actor,effect,token=null,isGM=false}) {
  if(!isGM||!actor?.isOwner||!effect||effect.getFlag('dawn','canonicalId')!=='positive.исчез')throw Error('Narrator and valid effect required');
  if(token){
    if(!isGM||token.actor?.uuid!==actor.uuid)throw Error('Narrator and matching token required');
    const presence=token.getFlag('dawn','presence');
    if(presence&&presence!=='disappeared')throw Error('Token has a different absence reason');
    if(presence==='disappeared')await token.unsetFlag('dawn','presence');
  }
  await effect.delete();
}
