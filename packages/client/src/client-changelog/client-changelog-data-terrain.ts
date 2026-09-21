import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_TERRAIN: ClientChangelogEntry[] = [
  {
    createdAt: 1789891188418,
    introducedIn: "2026.09.20.1",
    title: "Town terrain now defines economic identity",
    why: "Each town now has a persistent mechanical terrain profile, making Trade, Fertile, and Tundra Towns meaningfully different throughout their growth.",
    changes: ["Town overviews now show terrain-adjusted output and Arsenal District concentration bonuses for local Weapons Factories"]
  },
  {
    createdAt: 1789912208606,
    introducedIn: "2026.09.20.2",
    title: "Captured towns now explain their terrain output",
    why: "Towns created before terrain identities were introduced had no stored profile and capture reports still showed generic Town values, making a coastal desert capture appear to grant only the normal 10 gold and 300 manpower.",
    changes: [
      "Legacy towns now recover their permanent Civic Character from their mechanical map biome",
      "Capture reports now show the town's Civic Character and the terrain calculation behind its gold, manpower capacity, and regeneration"
    ]
  },
  {
    createdAt: 1789926100448,
    introducedIn: "2026.09.20.3",
    title: "Town terrain now reads as part of the town sheet",
    why: "Terrain identity appeared as a verbose modifier list and could calculate an invalid internal gold value from a partial town snapshot, which made the overview difficult to trust.",
    changes: [
      "Town character and terrain output now appear directly with Gold and Manpower, using the same card system as the rest of the town overview",
      "Town overviews no longer show an internal terrain-base-gold figure"
    ]
  },
  {
    createdAt: 1789933799380,
    introducedIn: "2026.09.20.4",
    title: "Coastal towns now stack with their terrain",
    why: "Coastal identity used to replace a town's terrain, which made every coastal town desert-only and could reduce manpower despite a coast being intended as a constrained, high-output location.",
    changes: [
      "Coastal Town is now a separate +20% gold, manpower-capacity, and manpower-regeneration modifier that stacks with Trade, Tundra, or Fertile terrain at every population tier",
      "Every town now names its character beneath the town name; Gold and Manpower cards show short, separate terrain and coastal modifier lines, while neutral fertile terrain shows no zero-effect text"
    ]
  }
];
