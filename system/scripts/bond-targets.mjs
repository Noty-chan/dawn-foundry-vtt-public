/** Only world heroes visible to this user can be linked to a Bond. */
export function availableBondTargets(actors, owner, user) {
  const ownerActorId = owner?.isToken ? owner.token?.actorId : null;
  return Array.from(actors ?? []).filter(actor => actor.type === 'hero' && actor.uuid !== owner?.uuid
    && (!ownerActorId || actor.id !== ownerActorId)
    && typeof actor.testUserPermission === 'function' && actor.testUserPermission(user, 'OBSERVER'));
}

export function bondTargetUpdate(item, uuid, actors, owner, user, displayName) {
  if (item?.type !== 'bond' || item.system?.archived) throw Error('invalidBondTarget');
  if (!uuid) return {'system.mechanics.actorUuid': ''};
  const actor = availableBondTargets(actors, owner, user).find(candidate => candidate.uuid === uuid);
  if (!actor) throw Error('invalidBondTarget');
  const name = displayName(actor);
  return {'system.mechanics.actorUuid': actor.uuid, name, 'system.overrides.name': name};
}
