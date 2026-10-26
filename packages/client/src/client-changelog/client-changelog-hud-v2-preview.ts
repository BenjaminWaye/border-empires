import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const HUD_V2_PREVIEW_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1792967953137, // Date.now() captured once for this entry.
    introducedIn: "2026.10.25.1",
    title: "New desktop HUD preview (opt-in)",
    why: "The whole interface is being redesigned; this preview is opt-in so it can be tried without replacing the current HUD.",
    changes: [
      "Add ?hud=v2 to the game URL on desktop to try it, and ?hud=legacy to switch back.",
      "Map: one resource bar with settings, your crest and screen buttons under it, a tracker on the left, truces and allies top-right, the minimap bottom-left (with a Diplomacy toggle that tints other empires' land as ally, truce or no agreement) and manpower as an orb. Selecting a tile shows its main actions at the bottom; neutral land next to yours is claimed on the click.",
      "Selecting your town or a tile around it opens the town screen with its build list. Attacking a garrisoned tile opens the battle screen with both sides' strength and your odds, then follows the fight.",
      "New Manifest tree, Diplomacy, Ranks race and Chronicle screens. Esc goes back; with nothing open it opens Settings."
    ]
  },
  {
    createdAt: 1793042494163, // Date.now() captured once for this entry.
    introducedIn: "2026.10.26.1",
    title: "HUD preview fixes",
    why: "Fixes from the first round of testing the opt-in ?hud=v2 preview.",
    changes: [
      "The new HUD no longer shows over the loading and join screens.",
      "Manifest: techs you can research but can't afford show as available, not locked. Card text is larger and easier to read.",
      "AFC upgrades fill the screen. Clicking a resource in the top bar opens its breakdown.",
      "Your own tiles show Relay Beacon first, then Raise flag and Build ▸, which opens a build list at the side. Other actions such as Garrison sit in a row of small buttons below, not in a hidden menu.",
      "Selecting a waystation shows the bonus it gives straight away."
    ]
  },
  {
    createdAt: 1793045263832, // Date.now() captured once for this entry.
    introducedIn: "2026.10.26.1",
    title: "HUD preview: tile facts, dev slots and more fixes",
    why: "Fixes from the second round of testing the opt-in ?hud=v2 preview.",
    changes: [
      "Selecting a tile shows a short strip of facts: a building's state, what it gives and its upkeep; a dock's coin and links; a town's tier, coin, food and growth; a wonder's name and boon; your odds against an enemy tile.",
      "Details ▾ in the tile panel opens the full tile overview in place.",
      "Development slots are always shown in the tracker. Frontier expansion shows as Expanding, not Battle.",
      "Resource, town and dock tiles lead with Garrison. Empires you've only met show by name and in their map colour.",
      "The town screen shows growth rate and stays open when you use its build list; a town still being garrisoned no longer shows NaN.",
      "Sending a truce or alliance offer confirms it, and the reply shows above the open screen.",
      "Chronicle now holds Yours, World and Updates (release notes) tabs and replaces the old Activity dashboard; its badge counts new activity and unread updates.",
      "Ranks race tracks show the top three on each path, plus you.",
      "Pressing a building or ability in the Manifest opens its info card. Settings opens in the middle of the screen over a dimmed map. Player profiles open as a full screen like the Manifest, and screens hide the crest so their Map / Esc button stays visible."
    ]
  }
];
