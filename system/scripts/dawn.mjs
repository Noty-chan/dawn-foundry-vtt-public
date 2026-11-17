import {installReactionSocket,renderReactionControls} from './reaction-runtime.mjs';
import {stopBoardBrush} from './board-brush.mjs';
import {DawnClocks} from './clocks.mjs';
import {HeroData,NPCData,PartyData,ControllerData,DawnItemData,RequestData,display} from "./models.mjs";
import {DawnActorSheet,DawnItemSheet} from "./sheets.mjs";
import {DawnCatalog,loadCatalog,acquireItem,createNPC,catalogUuid} from "./catalog.mjs";
import {libraryEntryName,libraryPackLabel,indexCatalogPacks} from './library-index.mjs';
import {DawnCombat,handleRequest,isExecutor} from "./operations.mjs";
import {recordKnockoutTension} from './battle-ko-tension.mjs';
import {label,escape,DawnGMControls} from "./rolls.mjs";
import {DawnCreation} from "./creation.mjs";
import {legacyTechniqueUpdates} from "./techniques.mjs";
import {droppedNPCEntry,droppedWorldNPC,deployNPC} from "./npc-deployment.mjs";
import {DawnActor} from "./actor.mjs";
import {DawnActiveEffect} from "./active-effect.mjs";
import {effectErrorMessage} from "./effect-application.mjs";
import {boardSceneData,moveToDiscard} from "./board.mjs";
import {DawnBattle} from "./battle.mjs";
import {renderBattleSidebar} from "./battle-sidebar.mjs";
import {createFodderTemplate} from "./fodder.mjs";
import {openFodderBatch,fodderBatchError} from "./fodder-dialog.mjs";
import "./fi.mjs";
import {dawnTokenHudClass} from "./token-hud.mjs";
import {tokenStatusConfigs} from './token-statuses.mjs';
import {formatRuleText} from './rich-text.mjs';
import {systemLanguage} from './language.mjs';
import {executorChoices} from './executor-choices.mjs';
import {addDawnSceneControls} from './scene-controls.mjs';
import {updateBoardHeight} from './scene-markers.mjs';
import {refreshSheetWhenIdle} from './sheet-refresh.mjs';
import {compoundActorData,isCompoundProfile} from './compound.mjs';
const {ApplicationV2,HandlebarsApplicationMixin}=foundry.applications.api;

Hooks.on('moveToken',(token,movement)=>{
  const last=movement?.passed?.waypoints?.at(-1),origin=movement?.origin;
  if(!last||!origin||(last.x===origin.x&&last.y===origin.y))return;
  updateBoardHeight(token,{x:last.x,y:last.y}).catch(error=>console.error('DAWN height update',error));
});

export class DawnHome extends HandlebarsApplicationMixin(ApplicationV2){
  static DEFAULT_OPTIONS={id:"dawn-home",classes:["dawn"],window:{title:"DAWN",resizable:true},position:{width:650,height:600},actions:{hero:DawnHome.createHero,npc:DawnHome.createNPC,compound:DawnHome.createCompound,catalog:DawnHome.catalog,narratorCatalog:DawnHome.narratorCatalog,test:DawnHome.test,coreTest:DawnHome.coreTest,importTestHeroes:DawnHome.importTestHeroes,prepareTestActors:DawnHome.prepareTestActors,fodder:DawnHome.fodder,fodderBatch:DawnHome.fodderBatch,party:DawnHome.party,gmControls:DawnHome.gmControls,createBoard:DawnHome.createBoard,discardToken:DawnHome.discardToken,battle:DawnHome.battle}};
  static PARTS={body:{template:"systems/dawn/templates/home.hbs"}};
  async _prepareContext(){
    const testWorld=game.user.isGM&&game.world.id==="dawn-development"
      && await (this.testToolsAvailable??=fetch('systems/dawn/data/test-enemies.json',{method:'HEAD'}).then(r=>r.ok).catch(()=>false));
    return {gm:game.user.isGM,canCreateHero:game.user.can('ACTOR_CREATE'),testWorld,version:game.system.version,language:game.dawn.language,counts:game.dawn.catalog.entries.length};
  }
  static async createHero(){if(!game.user.can('ACTOR_CREATE'))return ui.notifications.warn(label('noPermission'));const a=await Actor.create({name:label("newHero"),type:"hero",system:{attributes:{body:4,talent:3,spirit:2,mind:2},health:{value:16}},prototypeToken:{actorLink:true,disposition:1}});a.sheet.editing=true;a.sheet.creationApp=new DawnCreation(a);a.sheet.creationApp.render({force:true});}
  static createNPC(){game.dawn.openCatalog(null,{role:"narrator",filter:"npc"});}
  static async createCompound(){
    if(!game.user.isGM||!game.user.can('ACTOR_CREATE'))return ui.notifications.warn(label('noPermission'));
    const profiles=game.dawn.catalog.entries.filter(isCompoundProfile);
    const choices=profiles.map(entry=>`<label><input type="checkbox" name="parts" value="${escape(entry._id)}"> ${escape(display(entry).name)}</label>`).join('');
    const input=await foundry.applications.api.DialogV2.prompt({
      classes:['dawn','dawn-modal'],position:{width:610},window:{title:label('compoundCreate')},
      content:`<p>${escape(label('compoundHint'))}</p>
        <label>${escape(label('name'))}<input name="name" value="${escape(label('compoundName'))}"></label>
        <label>${escape(label('tier'))}<input name="tier" type="number" min="0" max="6" value="1" required></label>
        <label>${escape(label('compoundTie'))}<select name="defense"><option value="armor">${escape(label('armor'))}</option><option value="evasion">${escape(label('evasion'))}</option></select></label>
        <div class="dawn-compound-choices">${choices}</div>`,
      ok:{label:label('create'),callback:(_event,button)=>new FormData(button.form)},rejectClose:false
    });
    if(!input)return;
    const ids=new Set(input.getAll('parts'));
    if(ids.size<2)return ui.notifications.warn(label('compoundInvalid'));
    try{
      const data=compoundActorData(profiles.filter(p=>ids.has(p._id)),{
        tier:Number(input.get('tier')),tieDefense:input.get('defense'),name:input.get('name')?.trim()||label('compoundName')
      });
      const actor=await Actor.create(data);
      actor?.sheet.render({force:true});
    }catch(error){console.error('DAWN compound creation',error);ui.notifications.warn(label('compoundInvalid'));}
  }
  static gmControls(){if(game.user.isGM)game.dawn.gmControls.render({force:true});}
  static battle(){return game.dawn.battle.render({force:true,window:{title:game.dawn.battle.title}});}
  static async createBoard(event,target){
    if(!game.user.isGM)return ui.notifications.warn(label('gmOnly'));
    target.disabled=true;
    try{const scene=await Scene.create(boardSceneData(label('boardName')));ui.notifications.info(label('boardCreated'));await scene.view();}
    catch(e){ui.notifications.error(`${label('boardFailed')} ${e.message}`);}finally{target.disabled=false;}
  }
  static async discardToken(event,target){
    if(!game.user.isGM)return ui.notifications.warn(label('gmOnly'));
    const selected=canvas.tokens?.controlled??[];
    if(selected.length!==1)return ui.notifications.warn(label('boardSelectOne'));
    target.disabled=true;
    try{await moveToDiscard({scene:canvas.scene,token:selected[0].document,isGM:game.user.isGM});ui.notifications.info(label('boardMoved'));}
    catch(e){ui.notifications.warn(e.message?.startsWith('board')?label(e.message):e.message);}finally{target.disabled=false;}
  }
  static catalog(){game.dawn.openCatalog();}
  static narratorCatalog(){game.dawn.openCatalog(null,{role:"narrator"});}
  static party(){game.dawn.party?.sheet.render({force:true});}
  static async test(event,target){target.disabled=true;try{const {runRuntimeChecks}=await import('./runtime-checks.mjs');const report=await runRuntimeChecks();await foundry.applications.api.DialogV2.prompt({window:{title:"DAWN — Runtime checks"},content:`<pre>${escape(JSON.stringify(report,null,2))}</pre>`,ok:{label:label("close")},rejectClose:false});}catch(e){ui.notifications.error(e.stack??e.message);}finally{target.disabled=false;}}
  static async coreTest(event,target){target.disabled=true;try{const {runCoreChecks}=await import('./runtime-checks.mjs');const report=await runCoreChecks();await foundry.applications.api.DialogV2.prompt({window:{title:"DAWN — Core checks"},position:{width:700},content:`<pre data-core-report>${escape(JSON.stringify(report,null,2))}</pre>`,ok:{label:label("close")},rejectClose:false});}catch(e){ui.notifications.error(e.stack??e.message);}finally{target.disabled=false;}}
  static async fodderBatch(event,target){
    target.disabled=true;
    try{const result=await openFodderBatch();if(result)ui.notifications.info(`${label('fodderBatchDone')} ${result.confirmedTokenIds.length}.`);}
    catch(error){ui.notifications.warn(fodderBatchError(error));console.error('DAWN fodder placement',error);}
    finally{target.disabled=false;}
  }
  static async fodder(event,target){
    if(!game.user.isGM)return ui.notifications.warn(label('gmOnly'));
    target.disabled=true;
    try{
      const result=await createFodderTemplate({user:game.user,actors:game.actors,create:data=>Actor.create(data),name:label('fodderTemplateName')});
      ui.notifications.info(label(result.created?'fodderCreated':'fodderExisting'));
    }catch(e){ui.notifications.warn(label(e.message?.startsWith('fodder')?e.message:'fodderUnconfirmed'));console.error('DAWN fodder template',e);}
    finally{target.disabled=false;}
  }
  static async prepareTestActors(event,target){
    target.disabled=true;
    try{
      const {prepareTestActors}=await import('./test-actors-setup.mjs');
      const fetchJson=async path=>{const response=await fetch(path);if(!response.ok)throw Error('testHeroMissing');return response.json();};
      const selections=await fetchJson('systems/dawn/data/test-enemies.json');
      const result=await prepareTestActors({worldId:game.world.id,user:game.user,isAuthorized:()=>game.user.isGM&&game.users.activeGM?.id===game.user.id,
        actors:game.actors,folders:game.folders,entries:game.dawn.catalog.entries,selections,
        loadHeroes:()=>Promise.all(['nari','neel','ren'].map(name=>fetchJson(`worlds/dawn-development/dawn-import/${name}.json`))),
        createActor:data=>Actor.create(data),createFolder:data=>Folder.create(data),randomId:()=>foundry.utils.randomID(),
        folderNames:{heroes:label('testSetupHeroesFolder'),enemies:label('testSetupEnemiesFolder')},nameForNpc:entry=>display(entry).name,
        prepareFodder:folderId=>createFodderTemplate({user:game.user,actors:game.actors,create:data=>Actor.create(data),folderId,name:label('fodderTemplateName')})});
      ui.notifications.info(`${label('testSetupDone')} ${label('testSetupHeroes')}: ${result.heroes.created}/${result.heroes.existing}; ${label('testSetupEnemies')}: ${result.npcs.created}/${result.npcs.existing}; ${label(result.fodder.created?'fodderCreated':'fodderExisting')}`);
      if(result.npcs.conflicts)ui.notifications.warn(`${label('testSetupConflicts')} ${result.npcs.conflicts}`);
      if(result.npcs.manual)ui.notifications.warn(`${label('testSetupManual')} ${result.npcs.manual}`);
    }catch(e){ui.notifications.warn(label(e.message?.startsWith('testSetup')||e.message?.startsWith('testHero')||e.message?.startsWith('fodder')?e.message:'testSetupUnconfirmed'));console.error('DAWN test actor setup',e);}
    finally{target.disabled=false;}
  }
  static async importTestHeroes(event,target){
    target.disabled=true;
    try {
      const {importTestHeroes}=await import('./test-hero-import.mjs');
      const load=async()=>Promise.all(['nari','neel','ren'].map(async name=>{const response=await fetch(`worlds/dawn-development/dawn-import/${name}.json`);if(!response.ok)throw Error('testHeroMissing');return response.json();}));
      const result=await importTestHeroes({worldId:game.world.id,user:game.user,activeGM:game.users.activeGM,actors:game.actors,create:data=>Actor.create(data),load});
      ui.notifications.info(`${label('testHeroDone')} ${result.created}; ${label('testHeroAlready')} ${result.existing}`);
    }catch(e){ui.notifications.warn(label(e.message?.startsWith('testHero')?e.message:'testHeroUnconfirmed'));console.error('DAWN test hero import',e);}finally{target.disabled=false;}
  }
}

Hooks.once("init",()=>{
  CONFIG.Token.hudClass=dawnTokenHudClass(CONFIG.Token.hudClass);
  game.settings.register('dawn','experimentalDuels',{name:'DAWN.duelExperimental',hint:'DAWN.duelExperimentalHint',scope:'world',config:true,type:Boolean,default:false});
  game.settings.register('dawn','experimentalReactions',{name:'DAWN.reactionExperimental',hint:'DAWN.reactionExperimentalHint',scope:'world',config:true,type:Boolean,default:false});
  game.settings.register('dawn','autoHeroKnockoutTension',{name:'DAWN.koTensionAutoHero',hint:'DAWN.koTensionAutoHeroHint',scope:'world',config:true,type:Boolean,default:false});
  game.settings.register("dawn","geometryChecks",{name:"DAWN.geometryChecks",hint:"DAWN.geometryHint",scope:"world",config:true,type:Boolean,default:true});
  game.settings.register("dawn","executorUserId",{name:"DAWN.executor",hint:"DAWN.executorHint",scope:"world",config:true,type:String,default:"",choices:()=>executorChoices(game.users,game.settings.get('dawn','executorUserId'),label('executorUnset'),label('executorUnavailable'))});
  game.settings.register('dawn','sharedClocks',{scope:'world',config:false,type:Array,default:[],onChange:()=>{const app=game.dawn?.clocks;if(app?.rendered&&!app.busy)app.render();}});
  game.settings.register("dawn","partyUuid",{scope:"world",config:false,type:String,default:""});
  game.settings.register("dawn","runtimeProbe",{scope:"world",config:false,type:Object,default:{}});
  game.settings.register("dawn","contentMigrationVersion",{scope:"world",config:false,type:Number,default:0});
  game.settings.register("dawn","boardInitialized",{scope:"world",config:false,type:Boolean,default:false});
  game.settings.register("dawn","rollDefaults",{scope:"world",config:false,type:Object,default:{difficulty:"tier",target:1,comparison:">",advantage:0,disadvantage:0},onChange:()=>{const app=game.dawn?.gmControls;if(app?.rendered)app.render();}});
  // Retain the legacy client setting for old installs; Foundry's own language
  // preference is the single visible selector and applies after a reload.
  game.settings.register("dawn","language",{scope:"client",config:false,type:String,default:"auto"});
  game.settings.register('dawn','guideSeen',{scope:'client',config:false,type:Object,default:{}});
  CONFIG.Actor.documentClass=DawnActor;
  CONFIG.ActiveEffect.documentClass=DawnActiveEffect;
  CONFIG.Actor.dataModels={hero:HeroData,npc:NPCData,party:PartyData,controller:ControllerData};
  CONFIG.Item.dataModels=Object.fromEntries(["skill","ability","bond","technique","boon","equipment","action","modifier","effect"].map(t=>[t,DawnItemData]));
  CONFIG.ChatMessage.dataModels.dawnRequest=RequestData;
  CONFIG.Combat.documentClass=DawnCombat;
  for(const type of ["hero","npc","party","controller"])CONFIG.Actor.typeLabels[type]=`DAWN.${type}`;
  for(const type of Object.keys(CONFIG.Item.dataModels))CONFIG.Item.typeLabels[type]=`DAWN.${type}`;
  foundry.applications.apps.DocumentSheetConfig.registerSheet(Actor,"dawn",DawnActorSheet,{types:["hero","npc","party","controller"],makeDefault:true,label:"DAWN"});
  foundry.applications.apps.DocumentSheetConfig.registerSheet(Item,"dawn",DawnItemSheet,{types:Object.keys(CONFIG.Item.dataModels),makeDefault:true,label:"DAWN"});
  Handlebars.registerHelper("dawnLabel",key=>label(key));
  Handlebars.registerHelper('dawnRich',value=>new Handlebars.SafeString(formatRuleText(value)));
  const pluralRules={en:new Intl.PluralRules('en'),ru:new Intl.PluralRules('ru')};
  Handlebars.registerHelper("dawnEntryCount",count=>`${count} ${label(`entryForms.${pluralRules[game.dawn.language].select(Number(count))}`)}`);
  Handlebars.registerHelper("dawnRoles",()=>Object.fromEntries(["narrative","enemy","obstacle"].map(k=>[k,label(k)])));
  Handlebars.registerHelper("dawnComparisons",()=>({">":">",">=":"≥"}));
  game.dawn={catalog:null,home:null,gmControls:null,rollSelections:new Map(),catalogApps:{},acquireItem,openCatalog:(actor=null,options={})=>{const role=options.role??(["npc","action","modifier","effect"].includes(options.filter)?"narrator":"character");if(role==="narrator"&&!game.user.isGM)return ui.notifications.warn(label("gmOnly"));const app=game.dawn.catalogApps[role]??=new DawnCatalog({role});app.actor=actor;app.canModify=options.canModify??null;app.filter=options.filter??(role==="narrator"?"npc":"technique");app.query="";app.archetype="";return app.render({force:true,window:{title:app.title}});},get language(){return systemLanguage(game.i18n.lang);},get party(){return game.actors.find(a=>a.uuid===game.settings.get("dawn","partyUuid"));}};
});

Hooks.once("ready",async()=>{
  installReactionSocket();
  try{
    const [catalog,creation]=await Promise.all([
      loadCatalog(),
      fetch("systems/dawn/data/creation.json").then(response=>{
        if(!response.ok)throw Error(`DAWN creation data: HTTP ${response.status}`);
        return response.json();
      })
    ]);
    game.dawn.catalog=catalog;
    game.dawn.creation=creation;
    game.dawn.catalogPacks=indexCatalogPacks(catalog.entries);
    const configuredStatuses=new Set(CONFIG.statusEffects.map(status=>status.id));
    CONFIG.statusEffects.push(...tokenStatusConfigs(catalog.entries,game.dawn.language).filter(status=>!configuredStatuses.has(status.id)));
    if(game.user.isGM&&game.users.activeGM?.id===game.user.id){
      // Put the newly installed Bonds pack beside the existing character pack
      // once; never move a pack the GM has already organized elsewhere.
      const bonds=game.packs.get('dawn.bonds'),bondFolder=game.folders.find(f=>f.type==='Compendium'&&f.name==='DAWN · Персонажи и связи'&&!f.folder);
      if(bonds&&bondFolder&&!bonds.folder)try{await bonds.configure({folder:bondFolder.id});}catch(error){console.warn('DAWN: could not arrange Bonds compendium',error);}
      if(game.settings.get("dawn","contentMigrationVersion")<2){
        for(const actor of game.actors){const updates=legacyTechniqueUpdates(actor.items.contents,game.dawn.catalog.entries);if(updates.length)await actor.updateEmbeddedDocuments("Item",updates);}
        const itemUpdates=legacyTechniqueUpdates(game.items.contents,game.dawn.catalog.entries);if(itemUpdates.length)await Item.updateDocuments(itemUpdates);
        for(const scene of game.scenes)for(const token of scene.tokens){if(token.actorLink||!token.actor)continue;const updates=legacyTechniqueUpdates(token.actor.items.contents,game.dawn.catalog.entries);if(updates.length)await token.actor.updateEmbeddedDocuments("Item",updates);}
        await game.settings.set("dawn","contentMigrationVersion",2);
      }
      for(const hero of game.actors.filter(a=>a.type==='hero'&&!a.system.primaryArchetype)){const first=hero.items.find(i=>i.type==='technique'&&!i.system.archived);if(first)await hero.update({'system.primaryArchetype':first.system.archetypeId});}
      if(!game.settings.get("dawn","executorUserId"))await game.settings.set("dawn","executorUserId",game.user.id);
      if(!game.dawn.party){const a=await Actor.create({name:label("party"),type:"party"});await game.settings.set("dawn","partyUuid",a.uuid);}
      if(!game.settings.get('dawn','boardInitialized')){
        try{if(!game.scenes.some(s=>s.getFlag('dawn','boardPreset')===1))await Scene.create(boardSceneData(label('boardName')));await game.settings.set('dawn','boardInitialized',true);}
        catch(e){console.error('DAWN board initialization',e);ui.notifications.warn(`${label('boardFailed')} ${e.message}`);}
      }
    }
    game.dawn.home=new DawnHome();
    game.dawn.battle=new DawnBattle();
    game.dawn.clocks=new DawnClocks();
    game.dawn.gmControls=new DawnGMControls();if(game.user.isGM)game.dawn.gmControls.render({force:true});
    if(ui.combat?.rendered)ui.combat.render();
    announceRuleGuides().catch(error=>console.warn('DAWN guide announcement',error));
  }catch(error){console.error("DAWN initialization",error);ui.notifications.error(`DAWN: ${error.message}`);}
});
async function announceRuleGuides(){
  const key=`${game.world.id}:${game.user.id}`,version=game.system.version;
  const seen=game.settings.get('dawn','guideSeen');
  if(seen[key]===version||!ChatMessage.canUserCreate(game.user))return;
  const base='https://github.com/Noty-chan/dawn-foundry-vtt-public/blob/main';
  const languages=game.dawn.language==='ru'?['ru','en']:['en','ru'];
  const links=languages.map(lang=>`<a href="${base}/guide-${lang}.md" target="_blank" rel="noopener noreferrer">${escape(label(lang==='ru'?'guideRussian':'guideEnglish'))}</a>`).join(' · ');
  const message=await ChatMessage.create({
    content:`<div class="dawn-roll"><h3>${escape(label('guideTitle'))}</h3><p>${escape(label('guideIntro'))}</p><p>${links}</p></div>`,
    whisper:[game.user.id]
  });
  if(message)await game.settings.set('dawn','guideSeen',{...game.settings.get('dawn','guideSeen'),[key]:version});
}
Hooks.on("createChatMessage",message=>handleRequest(message));
Hooks.on('getSceneControlButtons',addDawnSceneControls);
Hooks.on('renderChatMessageHTML',(message,html)=>renderReactionControls(message,html instanceof HTMLElement?html:html?.[0]));
Hooks.on('canvasTearDown',stopBoardBrush);
// Compendium source documents keep stable English names; localize only their
// displayed labels, without rewriting shared data or world-provided packs.
Hooks.on('renderCompendium',(app,html)=>{
  const pack=app.collection?.collection,root=html instanceof HTMLElement?html:html?.[0];
  if(!pack?.startsWith('dawn.')||!root||!game.dawn?.catalog)return;
  const entries=game.dawn.catalogPacks?.get(pack);
  for(const row of root.querySelectorAll('[data-entry-id]')){
    const entry=entries?.get(row.dataset.entryId),link=row.querySelector('.entry-name');
    if(entry&&link)link.textContent=libraryEntryName(entry,game.dawn.language);
  }
  if(game.dawn.language==='en'){
    for(const title of root.querySelectorAll('.compendium-header .compendium-name strong'))title.textContent=libraryPackLabel(title.textContent.trim(),'en');
    for(const image of root.querySelectorAll('.compendium-header img[alt]'))image.alt=libraryPackLabel(image.alt,'en');
  }
});
Hooks.on('renderCompendiumDirectory',(_app,html)=>{
  const root=html instanceof HTMLElement?html:html?.[0];if(!root||game.dawn?.language!=='en')return;
  for(const row of root.querySelectorAll('[data-pack^="dawn."]')){const title=row.querySelector('.compendium-name strong');if(title)title.textContent=libraryPackLabel(title.textContent,'en');const image=row.querySelector('img[alt]');if(image)image.alt=libraryPackLabel(image.alt,'en');}
  const names={'DAWN · Техники':'DAWN · Techniques','DAWN · Персонажи и связи':'DAWN · Characters and Bonds','DAWN · Нарратор и бой':'DAWN · Narrator and Combat'};
  for(const node of root.querySelectorAll('.folder-name'))if(names[node.textContent.trim()])node.textContent=names[node.textContent.trim()];
});
function refreshBattle(){const app=game.dawn?.battle;if(app?.rendered&&!app.busy)app.render();}
for(const event of ['createCombat','updateCombat','deleteCombat','createCombatant','updateCombatant','deleteCombatant','renderCombatTracker'])Hooks.on(event,refreshBattle);
Hooks.on('updateActor',actor=>{
  if(actor.uuid===game.dawn?.party?.uuid||game.dawn?.battle?.combat?.combatants.some(c=>c.actor?.uuid===actor.uuid))refreshBattle();
});
Hooks.on('renderCombatTracker',(app,html)=>renderBattleSidebar(app,html instanceof HTMLElement?html:html?.[0]));
Hooks.on("updateCombatant",combatant=>{
  for(const app of foundry.applications.instances.values())if(app.rendered&&app instanceof DawnActorSheet&&app.actor.uuid===combatant.actor?.uuid)refreshSheetWhenIdle(app);
});
Hooks.on('updateCombatant',(combatant,changes)=>{
  if(changes.defeated!==true||combatant.actor?.type!=='hero'||!isExecutor()
    ||!game.settings.get('dawn','autoHeroKnockoutTension')||!game.dawn?.party)return;
  recordKnockoutTension({
    combat:combatant.parent,combatant,party:game.dawn.party,user:game.user,users:game.users,isExecutor,eligibilityConfirmed:true
  }).catch(error=>{
    console.warn('DAWN knockout tension',error);
    ui.notifications.warn(label(['koTensionPrivate','koTensionUncertain','battleTurnBusy'].includes(error.message)?error.message:'koTensionInvalid'));
  });
});
Hooks.on("renderActorDirectory",(app,html)=>{
  const root=html instanceof HTMLElement?html:html?.[0];
  const footer=root?.querySelector(".directory-footer");
  if(footer&&!footer.querySelector("[data-dawn-home]")){const b=document.createElement("button");b.type="button";b.dataset.dawnHome="";b.textContent="DAWN";b.addEventListener("click",()=>game.dawn.home?.render({force:true}));footer.append(b);}
});
Hooks.on("dropCanvasData",(board,data,event)=>{
  const entries=game.dawn.catalog?.entries??[];
  const world=droppedWorldNPC(data,game.actors,entries);
  const entry=world?.entry??droppedNPCEntry(data,entries);
  if(!entry)return;
  // Foundry's hook is synchronous. Returning false prevents its normal Compendium import.
  deployNPC(entry,{scene:board.scene,event,data,createNPC,existingActor:world?.actor??null,notify:key=>ui.notifications.warn(label(key)),lookupEffect:async canonicalId=>{
    const effect=game.dawn.catalog.entries.find(e=>e.type==='effect'&&e.system.canonicalId===canonicalId);
    const item=effect?await fromUuid(catalogUuid(effect)):null;
    return {item,template:item?.effects?.contents?.[0],name:item?display(item).name:null};
  }}).catch(e=>ui.notifications.error(`${label('npcDeploymentFailed')} ${(e.message?.startsWith('board')||e.message?.startsWith('fodderController'))?label(e.message):effectErrorMessage(e,label)}${e.controllerId?` (${e.controllerId})`:''}`));
  return false;
});

// DAWN uses an open board by default. Existing Scenes and tokens are not rewritten.
Hooks.on("preCreateActor",(actor,data)=>{actor.updateSource({"prototypeToken.sight.enabled":false});if(actor.type==="hero"&&!data.system?.attributes)actor.updateSource({"system.attributes":{body:4,talent:3,spirit:2,mind:2}});});
Hooks.on("preCreateToken",token=>token.updateSource({"sight.enabled":false}));
Hooks.on("preCreateScene",scene=>scene.updateSource({tokenVision:false,"fog.exploration":false}));

// Never replace an editor while it has pending input. Its own operation saves
// first and renders once afterwards; external changes refresh a clean form.
function refreshCreation(actor){const app=actor?.sheet?.creationApp;if(app?.rendered&&!app.busy&&!app.formDirty)app.render();}
for(const event of ["createItem","updateItem","deleteItem"])Hooks.on(event,item=>{
  refreshCreation(item.actor);
  if(!item.parent)for(const app of Object.values(game.dawn?.catalogApps??{}))if(app.rendered)app.render();
});
Hooks.on("updateActor",actor=>refreshCreation(actor));
Hooks.on('updateActor',(actor,changes)=>{
  if(!Object.hasOwn(changes.flags?.dawn??{},'personalClocks'))return;
  for(const app of foundry.applications.instances.values()){
    if(app instanceof DawnClocks&&app.actor?.uuid===actor.uuid&&app.rendered&&!app.busy)app.render();
  }
});
// Tension lives on the party Actor, not Combat. Refresh the native tracker and
// open sheets on each client when that Actor changes so they do not show stale
// values after a manual correction or a round transition.
Hooks.on('updateActor',actor=>{
  if(actor.uuid!==game.dawn?.party?.uuid)return;
  if(ui.combat?.rendered)ui.combat.render();
  for(const app of foundry.applications.instances.values())if(app.rendered&&app instanceof DawnActorSheet)refreshSheetWhenIdle(app);
});
