import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const TITANIUM_ARMOUR_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1792704205914, // Date.now() captured once for this entry.
    introducedIn: "2026.10.22.2",
    title: "Titanium Weapons Factories send titanium war-walkers into battle",
    why: "A Titanium Weapons Factory already made your troops tougher, but nothing in a battle showed it.",
    changes: [
      "On the 3D map, an empire that owns a Titanium Weapons Factory now fields sealed titanium war-walkers in its battles and garrisons instead of foot soldiers. They stand taller than infantry and carry a laser gatling and a buzz-saw claw",
      "The walkers are cosmetic. The factory's attack and defence bonuses work exactly as before",
      "The 2D map does not draw battle soldiers, so the walkers only show on the 3D map"
    ]
  }
];
