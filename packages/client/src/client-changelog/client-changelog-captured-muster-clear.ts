import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CAPTURED_MUSTER_CLEAR_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1792617131105, // Date.now() captured once for this entry.
    introducedIn: "2026.10.21.5",
    title: "Enemy muster flags vanish when their tile is taken",
    why: "After an enemy tile with a muster flag was captured, the flag kept showing on the map until you tapped the tile.",
    changes: [
      "An enemy muster flag disappears from the map as soon as its tile changes hands",
      "Destroyed buildings and razed settlements on tiles you haven't opened also disappear right away"
    ]
  }
];
