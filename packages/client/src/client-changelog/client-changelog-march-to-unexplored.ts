import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const MARCH_TO_UNEXPLORED_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1793351138554, // Date.now() captured once for this entry.
    introducedIn: "2026.10.30.1",
    title: "Tap unexplored ground to march toward it",
    why: "Tapping a distant unexplored tile means you want to explore that way, not pay to claim every tile on the way to that exact spot.",
    changes: [
      "An unexplored tile's menu now has a single March To button instead of Expand To",
      "Pressing it asks where to march from: select one of your nearby muster flags (listed when you have one), or tap a tile of your land to raise a new flag there",
      "The flag scouts toward the tile and claims land on the way. If the tile turns out to be a mountain, water or out of reach, the march stops at the closest point and the flag returns to Hold",
      "Until you unlock muster flags by meeting an enemy, unexplored tiles still offer Expand To. Unexplored tiles next to your land are still claimed with a single tap"
    ]
  }
];
