// Keep Foundry's native token HUD and its signed/absolute health input behavior.
// Older tokens can have no configured bar; provide health without changing the scene.
export function dawnTokenHudClass(BaseTokenHUD) {
  return class DawnTokenHUD extends BaseTokenHUD {
    _dawnHealthFallback() {
      const token = this.document;
      if (!['hero', 'npc'].includes(token?.actor?.type) || token.getBarAttribute('bar1')) return null;
      // Respect a deliberately configured, different first bar, even if it is invalid.
      if (token.bar1?.attribute && token.bar1.attribute !== 'health') return null;
      return token.getBarAttribute('bar1', {alternative: 'health'});
    }

    async _prepareContext(options) {
      const context = await super._prepareContext(options);
      const health = this._dawnHealthFallback();
      if (health) Object.assign(context, {displayBar1: true, bar1Data: health});
      return context;
    }

    _parseAttributeInput(name, attr, input) {
      const health = name === 'bar1' ? this._dawnHealthFallback() : null;
      return health ? super._parseAttributeInput('health', health, input) : super._parseAttributeInput(name, attr, input);
    }
  };
}
