import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const TITANIUM_ARMOUR_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1792704205914, // Date.now() captured once for this entry.
    introducedIn: "2026.10.22.2",
    title: "Titanium Weapons Factories put your soldiers in titanium armour",
    why: "A Titanium Weapons Factory already made your troops tougher, but nothing in a battle showed it.",
    changes: [
      "On the 3D map, an empire that owns a Titanium Weapons Factory now sends soldiers in heavier, polished titanium plate into battle, and its garrisons wear it too",
      "The armour is cosmetic. The factory's attack and defence bonuses work exactly as before",
      "The 2D map does not draw battle soldiers, so the armour only shows on the 3D map"
    ]
  }
];
