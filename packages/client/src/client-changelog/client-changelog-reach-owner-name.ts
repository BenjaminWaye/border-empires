import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const REACH_OWNER_NAME_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1792614954325, // Date.now() captured once for this entry.
    introducedIn: "2026.10.21.5",
    title: "Tile menu names the reach you're inside, even with no rival nearby",
    why: "A frontier tile could say \"Inside Enemy Reach\" with no rival territory in sight, leaving you no way to tell whose reach it was.",
    changes: [
      "The tile menu now always names the empire whose reach covers your tile, even when its towns are fogged, far away or already destroyed"
    ]
  }
];
