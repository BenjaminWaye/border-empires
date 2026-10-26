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
  }
];
