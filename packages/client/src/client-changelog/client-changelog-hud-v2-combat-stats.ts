import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const HUD_V2_COMBAT_STATS_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1793962862145, // Date.now() captured once for this entry.
    introducedIn: "2026.11.06",
    title: "Your Attack and Defense are on your profile",
    why: "The new HUD had nowhere to read your empire's Attack and Defense outside a battle.",
    changes: [
      "Your Empire shows Attack and Defense next to Score and Manpower cap",
      "Attack and Defense panels list each Manifest, AFC upgrade, weapons factory and precursor salvage bonus, then the total",
      "These numbers now match the battle screen's base strength: they count Weapons Workshops, precursor salvage and towns backed by several factories",
      "Only shown on your own profile, never a rival's"
    ]
  }
];
