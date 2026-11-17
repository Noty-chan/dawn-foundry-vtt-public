import {ATTRIBUTES, EDITION, heroStatistics, npcStatistics} from "./rules.mjs";
import {effectStatistics} from "./effect-rules.mjs";
const f = foundry.data.fields;
const number = (initial = 0, min = 0) => new f.NumberField({required:true, nullable:false, integer:true, min, initial});
const text = (initial = "") => new f.StringField({required:true, nullable:false, initial});
const object = () => new f.ObjectField({required:true, nullable:false, initial:{}});
const resource = (initial = 0) => new f.SchemaField({value:number(initial)});
const common = () => ({schemaVersion:number(1), editionId:text(EDITION), canonicalId:text(), content:object(), overrides:object(), notes:text(),archived:new f.BooleanField({initial:false})});

export class HeroData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {...common(),biography:text(), tier:new f.NumberField({required:true,nullable:false,integer:true,min:1,max:6,initial:1}), build:new f.SchemaField({status:text("draft"), standard:new f.BooleanField({initial:true})}),
      attributes:new f.SchemaField(Object.fromEntries(ATTRIBUTES.map(k=>[k,number(2)]))),
      health:resource(), wounds:resource(), stress:resource(), focus:resource(), evasion:resource(),
      primaryOutlook:text(), primaryArchetype:text(), controllerParticipantId:text(),
      progression:new f.SchemaField({experience:number(), awards:new f.ArrayField(new f.ObjectField(),{initial:[]})}),
      manualStatistics:object()};
  }
  prepareDerivedData() {
    const d=heroStatistics(this);
    this.health.max=d.health;this.speed=d.speed;this.startingFocus=d.startingFocus;this.armor=d.armor;
    // Spellcrafter II increases starting Focus by Mind, once even if duplicate Items exist.
    const techniques=Array.from(this.parent?.items??[]);
    if(techniques.some(i=>i.type==='technique'&&!i.system?.archived&&i.system?.canonicalId==='ruiner.spellcrafter'&&i.system.level>=2))this.startingFocus+=this.attributes.mind;
    for(const k of ["speed","armor","startingFocus"])if(Number.isSafeInteger(this.manualStatistics[k]))this[k]=this.manualStatistics[k];
    if(Number.isSafeInteger(this.manualStatistics.health))this.health.max=this.manualStatistics.health;
    this.parent?.applyDeferredDerivedEffects?.();
    const effects=effectStatistics({speed:this.speed,armor:this.armor,tier:this.tier},this.parent?.allApplicableEffects?.()??this.parent?.effects??[]);
    this.speed=effects.speed;this.armor=effects.armor;this.speedEffectConflict=effects.speedConflict;
  }
}
export class NPCData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const stat=()=>new f.SchemaField({base:number(),perTier:number(),override:new f.NumberField({integer:true,min:0,nullable:true,initial:null})});
    return {...common(),tier:number(1),presentation:new f.SchemaField({role:text("narrative")}),kind:text("standard"),
      statistics:new f.SchemaField({health:stat(),speed:stat(),armor:stat(),evasion:stat()}),health:resource(),evasion:resource(),
      passive:text(),aceUsed:new f.BooleanField({initial:false}),deployment:object(),relations:object()};
  }
  prepareDerivedData(){const d=npcStatistics(this);this.health.max=d.health;this.speed=d.speed;this.armor=d.armor;this.initialEvasion=d.evasion;this.parent?.applyDeferredDerivedEffects?.();const effects=effectStatistics({speed:this.speed,armor:this.armor,tier:this.tier},this.parent?.allApplicableEffects?.()??this.parent?.effects??[]);this.speed=effects.speed;this.armor=effects.armor;this.speedEffectConflict=effects.speedConflict;}
}
export class PartyData extends foundry.abstract.TypeDataModel {
  static defineSchema(){return {...common(),participants:object(),chapter:object(),storyContexts:object(),activeStoryContextId:text()};}
}
export class ControllerData extends foundry.abstract.TypeDataModel {
  static defineSchema(){return {...common(),hostUuid:text(),modifierUuid:text(),parameters:object()};}
}
export class DawnItemData extends foundry.abstract.TypeDataModel {
  static defineSchema(){return {...common(),groupId:text(),archetypeId:text(),level:new f.NumberField({required:true,nullable:false,integer:true,min:1,max:3,initial:1}),rank:new f.NumberField({required:true,nullable:false,integer:true,min:1,max:3,initial:1}),purchaseCost:number(1),
    complexity:number(1),inherent:new f.BooleanField({initial:false}),mechanics:object(),origin:object(),support:text("manual")};}
}
export class RequestData extends foundry.abstract.TypeDataModel {
  static defineSchema(){return {operationId:text(),actorUuid:text(),actionId:text(),status:text("pending"),payload:object(),result:object()};}
}

export function display(document, language = game.dawn?.language??game.i18n.lang) {
  const s=document.system, lang=language.startsWith("ru")?"ru":"en";
  const source=s?.content?.[lang]??{},fallback=s?.content?.[lang==='ru'?'en':'ru']??{};
  return {...source,name:s?.overrides?.name??source.name??fallback.name??document.name,description:s?.overrides?.description??source.description??source.text??fallback.description??fallback.text??""};
}
