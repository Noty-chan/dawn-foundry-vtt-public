/** Preserve native transfer semantics, except for features removed from the build. */
export class DawnActor extends Actor {
  *allApplicableEffects() {
    for (const effect of super.allApplicableEffects()) {
      if (effect.parent?.documentName === 'Item' && effect.parent.system?.archived) continue;
      yield effect;
    }
  }

  /** Let Foundry collect, sort, apply and publish statuses in its normal phase. */
  applyActiveEffects() {
    this._dawnDeferredChanges=[];
    this._dawnCollectingEffects=true;
    try {
      return super.applyActiveEffects();
    } catch (error) {
      this._dawnDeferredChanges=[];
      throw error;
    } finally {
      this._dawnCollectingEffects=false;
    }
  }

  deferDerivedEffect(effect,change) {
    if (!this._dawnCollectingEffects || !['hero','npc'].includes(this.type)) return false;
    const keys=['system.speed','system.armor','system.health.max'];
    if (this.type==='hero') keys.push('system.startingFocus');
    if (!keys.includes(change.key)) return false;
    this._dawnDeferredChanges.push({effect,change});
    return true;
  }

  applyDeferredDerivedEffects() {
    const overrides={};
    for (const {effect,change} of this._dawnDeferredChanges??[]) Object.assign(overrides,effect.apply(this,change));
    foundry.utils.mergeObject(this.overrides,foundry.utils.expandObject(overrides));
    this._dawnDeferredChanges=[];
  }
}
