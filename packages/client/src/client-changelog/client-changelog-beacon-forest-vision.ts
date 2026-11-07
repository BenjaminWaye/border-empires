import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const BEACON_FOREST_VISION_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1794067871508, // Date.now() captured once for this entry.
    introducedIn: "2026.11.07",
    title: "Relay Beacons see over forest",
    why: "Forest cut a beacon's 5-tile vision down to a couple of tiles, so beacons in woodland revealed little of what their range promised.",
    changes: [
      "Relay Beacon vision is no longer blocked by forest; mountains still block it",
      "Territory, town and Aether Tower vision still stop a tile past the first forest"
    ]
  }
];
