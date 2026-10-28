import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const FOG_HILL_HAZE_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1793226139398, // Date.now() captured once for this entry.
    introducedIn: "2026.10.28.4",
    title: "Hills stay inside the fog",
    why: "On the 3D map, hills on land you could no longer see broke through the mist as dark patches.",
    changes: [
      "Remembered hills now get the same drifting mist as the flat ground around them",
      "3D map only: the 2D map has no raised hills to rise out of its mist"
    ]
  }
];
