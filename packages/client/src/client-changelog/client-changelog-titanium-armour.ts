import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const TITANIUM_ARMOUR_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1792704205914, // Date.now() captured once for this entry.
    introducedIn: "2026.10.22.2",
    title: "Your weapons factories now show up in your battle squads",
    why: "Titanium and Umbrite Weapons Factories already made your troops tougher, but nothing in a battle showed it.",
    changes: [
      "On the 3D map, an empire that owns a Titanium Weapons Factory now fields two towering titanium war-walkers among its infantry, in battles and garrisons. One charges into close combat with its buzz-saw claw, the other holds back and fires its laser gatling. Their bare titanium shines as real metal, trimmed in your colour",
      "An empire that owns an Umbrite Weapons Factory fields two Umbrite heavy troopers in dark iron and brass, firing glowing shoulder cannons from a braced kneel. Owning both factories gives you both",
      "Your marching companies now bring the same specialists along, with the walkers leading and closing the column",
      "These units are cosmetic. The factories' attack and defence bonuses work exactly as before",
      "The 2D map does not draw battle soldiers, so these units only show on the 3D map"
    ]
  }
];
