import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const BATTLE_TILE_SOUND_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1792444719540, // Date.now() captured once for this release.
    introducedIn: "2026.10.19.5",
    title: "Battles now sound like battles",
    why: "Tapping a tile with a fight on it was silent, while towns, docks and wonders already played their own sound.",
    changes: [
      "Tapping a tile where a battle is going on now plays the sound of regiments clashing",
      "This covers your own attacks, attacks on your land once the enemy arrives, and battles you can see between other empires",
      "A town under attack plays the battle sound instead of the town theme"
    ]
  }
];
