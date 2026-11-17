/** A reaction receipt can be broadcast in an Actor or synthetic Token update.
 * Until the server's document filtering is proven, require every player to be
 * allowed to observe both the Scene and Actor, including offline users. */
export function isPublicReactionTarget(target,users){
 const scene=target?.parent,actor=target?.actor;
 if(!scene||!actor||scene.tokens?.get(target.id)!==target||target.hidden||target.isSecret||target.disposition===-2||![30,50].includes(target.displayName))return false;
 if(typeof scene.testUserPermission!=='function'||typeof actor.testUserPermission!=='function')return false;
 return Array.from(users?.values?.()??[]).every(u=>u.isGM||(scene.testUserPermission(u,'OBSERVER')&&actor.testUserPermission(u,'OBSERVER')));
}
