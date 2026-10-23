import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const FOGGED_MIST_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1792529029782, // Date.now() captured once for this entry.
    introducedIn: "2026.10.20.4",
    title: "Remembered land lies under fog",
    why: "Tiles you had explored but could no longer see were tinted a pale tan that looked like the map had glitched, not like fog.",
    changes: [
      "Land and sea out of sight now sit under drifting grey mist, dimmed and desaturated, so it's clear you're looking at what you last saw",
      "The fog stops just past the edge of your vision with a soft, rounded, wavy bank, like the storm over unexplored land",
      "Both the 3D map and the 2D map"
    ]
  }
];
