import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const AI_BEACON_SPACING_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1793225832045, // Date.now() captured once for this entry.
    introducedIn: "2026.10.28.3",
    title: "AI relay beacons spread out",
    why: "AI empires packed relay beacons a couple of tiles apart, ringing a small island with dozens where two or three would do.",
    changes: ["AI empires now keep their relay beacons at least a reach radius apart."]
  }
];
