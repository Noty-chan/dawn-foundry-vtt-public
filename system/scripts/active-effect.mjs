/** Defer only a known derived change; everything else uses Foundry's normal apply. */
export class DawnActiveEffect extends ActiveEffect {
  apply(actor,change) {
    if (actor.deferDerivedEffect?.(this,change)) return {};
    return super.apply(actor,change);
  }
}
