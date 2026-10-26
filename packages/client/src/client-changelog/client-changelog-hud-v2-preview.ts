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
    title: "HUD preview: tile facts and top three",
    why: "The new tile panel had no way to see what a tile does, and the Ranks race showed only the leader and you.",
    changes: [
      "Selecting a tile shows a short strip of facts: a building's state, what it gives and its upkeep; a dock's coin and links; a town's tier, coin and food; your odds against an enemy tile.",
      "Details ▾ in the tile panel opens the full tile overview in place.",
      "Ranks race tracks show the top three on each path, plus you."
    ]
  }
];
