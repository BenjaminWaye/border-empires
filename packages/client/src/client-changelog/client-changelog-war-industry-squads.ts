import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const WAR_INDUSTRY_SQUADS_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1792786941462, // Date.now() captured once for this entry.
    introducedIn: "2026.10.23.1",
    title: "Your weapons factories now show on your soldiers in battle",
    why: "Titanium and Umbrite Weapons Factories already made your troops tougher, but nothing in a battle showed it.",
    changes: [
      "On the 3D map, every soldier of an empire that owns a Titanium Weapons Factory wears heavy armour: thick plates in your colour with polished titanium edging, stacked shoulder plates and an enclosed helmet, in battles, garrisons and marches",
      "An empire that owns an Umbrite Weapons Factory fires Umbrite rounds: heavier violet-and-orange shots that burst in embers on impact. Owning both factories gives you both",
      "This is cosmetic. The factories' attack and defence bonuses work exactly as before",
      "The 2D map does not draw battle soldiers, so this only shows on the 3D map"
    ]
  }
];
