import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const MARCH_ACROSS_WATER_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1792613609036, // Date.now() captured for this entry.
    introducedIn: "2026.10.21.4",
    title: "March orders cross water through docks",
    why: "A muster flag told to march to a tile across water walked to the nearest beach and stopped there, because it never considered the docks that actually cross.",
    changes: [
      "Marching flags now route through docks and aether bridges to reach targets on another landmass",
      "If your side of the crossing isn't yours yet, the flag expands toward the dock first instead of piling onto the shoreline"
    ]
  }
];
