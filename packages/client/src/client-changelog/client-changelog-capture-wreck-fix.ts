import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CAPTURE_WRECK_FIX_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1793962806795, // Date.now() captured once for this entry.
    introducedIn: "2026.11.06",
    title: "Captured Relay Beacons leave wreckage",
    why: "A Relay Beacon or siege engine destroyed in a capture vanished with no wreckage when you were in the fight, and any wreck cleared after a minute.",
    changes: [
      "A Relay Beacon, Siege Battery, Siege Tower or Dread Tower destroyed in a capture now lies wrecked on the tile for 24 hours",
      "Everyone sees the wreck, including players who arrive later",
      "Building on the tile clears the wreck from view"
    ]
  }
];
