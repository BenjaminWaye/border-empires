import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const MUSTER_SIEGE_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1792446323566, // Date.now() captured for this entry.
    introducedIn: "2026.10.19.5",
    title: "Muster flags under siege",
    why: "When an enemy attacked the tile your muster flag stood on, your queued attack from that flag fired anyway and failed with \"the tile is already in combat\", as if the enemy tile you picked was the problem.",
    changes: [
      "A flag whose tile is under attack is now under siege: a red ring pulses round it and its soldiers stand guard (3D and 2D)",
      "While under siege, Set Advance, March To and Clear Muster are greyed out with a countdown; Hold and Expand Capacity still work",
      "An attack waiting on a besieged flag now waits and launches when the siege ends, instead of failing",
      "Attacks launch from a neighbouring tile that isn't under attack whenever there is one",
      "Blocked attacks now say whether your own muster is under siege (and for how long) or another battle already holds the target"
    ]
  }
];
