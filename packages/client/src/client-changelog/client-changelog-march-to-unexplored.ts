import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const MARCH_TO_UNEXPLORED_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1793351138554, // Date.now() captured once for this entry.
    introducedIn: "2026.10.30.1",
    title: "Tap unexplored ground to march toward it",
    why: "Tapping a distant unexplored tile means you want to explore that way, not pay to claim every tile on the way to that exact spot.",
    changes: [
      "An unexplored tile's menu now offers March To instead of Expand To: one of your muster flags, or a new flag raised on your nearest land, scouts toward it and claims land along the route",
      "If the tile turns out to be a mountain, water or out of reach, the march stops at the closest point and the flag returns to Hold",
      "Until you unlock muster flags by meeting an enemy, unexplored tiles still offer Expand To. Unexplored tiles next to your land are still claimed with a single tap"
    ]
  }
];
