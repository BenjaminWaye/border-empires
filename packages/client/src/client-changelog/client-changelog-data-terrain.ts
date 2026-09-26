import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_TERRAIN: ClientChangelogEntry[] = [
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
