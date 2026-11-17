# DAWN for Foundry VTT

*English guide · LionWing Edition · Foundry V13*

[Russian](guide-ru.md) · [Create a hero](#create-a-hero) · [Narrator guide](#narrator-guide)

**Start here.** Open the Actors sidebar and select **DAWN** at the bottom. From there you can create a hero, open the libraries, choose an enemy profile or prepare a scene. DAWN follows your client language in Foundry’s settings. Reload after changing it.

| Feature | Where to find it and how it works |
| --- | --- |
| Hero sheet | **Overview** holds your character’s concept, attributes, health and advancement. **Unstructured Play** holds skills, abilities, boons and bonds. **Structured Play** holds actions, Techniques and combat resources. **Settings** holds manual adjustments and notes. |
| XD6 rolls | Select an attribute and relevant sources on the sheet. The roll window shows the pool and lets you adjust Advantage and Disadvantage. The chat card shows the dice, Hits and critical results. |
| Libraries | Character and Narrator libraries contain native documents. Search by name or tag, drag entries to a sheet and open their sources. The search button sends links to your personal chat. |
| Inventory and bonds | Record possessions in inventory. A bond can point to another hero or use a name you enter. Bond actions are available in the library. |
| Status effects | DAWN icons appear in the token HUD. The library can apply effects to selected targets. Supported effects affect calculations. The Narrator resolves other consequences. |
| Clocks | Open shared clocks from the DAWN scene tools. Everyone can see them and the designated Narrator manages them. Owners open character clocks from the Unstructured Play tab. |

## Create a hero

1. Select **Actors → DAWN → Create Character**. The creation assistant saves completed steps. You can close it and return later.
2. Enter a name and concept. Assign the starting array **4, 3, 2, 2** to your four attributes. The assistant shows how many ranks and Technique levels you can spend.
3. Choose skills or add your own. Set a linked attribute for each skill. Build your ability from rules words, choose an Outlook and select boons. When adding a bond, select another hero or enter a name.
4. Choose Techniques from the library. Open the card to read all three levels and see which ones you learned. Check the total budget in the assistant.
5. Finish creation and review **Overview**. Use **Art / Token** to set separate images. Drag your Actor to the scene and verify the token. Unlock the sheet to make changes later.
6. For a first check, choose an attribute and skill and open the roll window. For an attack, use Foundry’s target control before opening the roll and verify the target on the chat card.

## Narrator guide

1. **Prepare the scene.** DAWN creates its starter board on first launch. The **DAWN** tools on the left cover heights, markers, fodder and clocks. Set heights on cells so tokens receive the cell’s elevation when moving. Attacks can show a reminder about relative height. Test geometry on custom maps before play.
2. **Deploy enemies.** Choose a profile in the Narrator library, set its Tier and drag it to the scene. Review its Health, actions and effects. Create Compound Enemies from **Actors → DAWN**. DAWN calculates shared statistics and copies part actions. Track separate part turns, health gates and round expiry manually.
3. **Start combat.** Use the Foundry tracker on the right or open the **Battle** window. The designated Narrator chooses the next turn. Watch the active combatant’s AP and Tension. If you use the knockout rule, enable automatic handling for defeated heroes in system settings. Handle repeat and special cases manually.
4. **Resolve an action.** Open actions on the actor sheet. They show their cost and description. Supported formulas fill in values from the hero or enemy. Use the chat card and damage tool for ordinary targets. Check the target, Health and defenses before confirming damage.
5. **Handle special rules.** Experimental reactions and duels are off by default. For Finisher, spend 2 AP and the selected Focus after rolling. Check the Technique text when movement or effects depend on a special rule. Keep removed combat tokens in the reserve area to preserve their state.

Before your first session, run one full round with a player client. Check turn changes, shared clocks and whether resources survive a reload.
