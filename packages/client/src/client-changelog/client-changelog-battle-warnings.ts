import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const BATTLE_WARNINGS_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.27",
  title: "Under attack alerts",
  why: "Players lost land while in the game without noticing; one lost 14 tiles to Planetary Defense with no warning on screen.",
  changes: [
    "A red \"Under attack\" banner names the attacker and counts tiles lost, e.g. \"Under attack · Planetary Defense · 3 tiles lost\"",
    "Rapid losses add up in one banner instead of many alerts",
    "Attacks on your land show in the banner before they land",
    "Tap the banner to jump to the fight",
    "Tiles you just lost flash red on the map, in 2D and 3D"
  ]
};
