import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const TOWN_PLATE_ZOOM_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1793225610563, // Date.now() captured once for this entry.
    introducedIn: "2026.10.28.3",
    title: "Town nameplates grow as you zoom in",
    why: "Close up, town nameplates stayed small and on the 3D map floated over the tile behind the town.",
    changes: ["Town nameplates grow as you zoom in and sit just above their own town on both maps."]
  }
];
