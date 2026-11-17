/** Snapshot public, visible targets without collapsing tokens which share an Actor. */
export function captureTargets(targets,anonymous) {
  const result=[],references=[],seen=new Set();
  for(const token of targets??[]){
    const doc=token?.document;
    if(!doc||doc.getFlag?.('dawn','fodderController')||doc.hidden||doc.isSecret||doc.disposition===-2||token.visible===false||!doc.uuid||seen.has(doc.uuid))continue;
    seen.add(doc.uuid);references.push(doc.uuid);
    // HOVER and ALWAYS are visible to all, including non-owners.
    const publicName=[30,50].includes(doc.displayName)&&typeof doc.name==='string'&&doc.name.trim();
    result.push(publicName?{tokenUuid:doc.uuid,name:doc.name}:{name:anonymous(result.length+1)});
  }
  return {targets:result,references};
}
export function targetSnapshot(targets,anonymous){return captureTargets(targets,anonymous).targets;}

/** Fail closed if a previously selected token is no longer safely representable. */
export async function targetsStillPublic(targets,references,resolve,anonymous){
  if(!Array.isArray(targets)||!targets.length)return true;
  if(!Array.isArray(references)||references.length!==targets.length||new Set(references).size!==references.length)return false;
  const tokens=[];
  for(const uuid of references){
    if(typeof uuid!=='string'||!uuid)return false;
    let doc;try{doc=await resolve(uuid);}catch{return false;}
    if(!doc||doc.uuid!==uuid||!doc.object||doc.object.document!==doc)return false;
    tokens.push(doc.object);
  }
  return JSON.stringify(targetSnapshot(tokens,anonymous))===JSON.stringify(targets);
}
export function targetText(targets,escape,label){
  if(!targets?.length)return '';
  return `<p class="dawn-roll-targets"><strong>${escape(label)}:</strong> ${targets.map(t=>escape(t.name)).join(', ')}</p>`;
}
