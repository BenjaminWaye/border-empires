import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const REMEMBERED_BUILDINGS_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1793276217391, // Date.now() captured once for this entry.
    introducedIn: "2026.10.29.2",
    title: "Buildings you've seen stay on the map under fog",
    why: "Once land went out of sight, its towns, forts and buildings disappeared, even though you had seen them.",
    changes: [
      "Towns, structures, forts, siege camps, Relay Beacons, Aether Towers, Aether Fabrication Complexes (with their modules), docks, watchtowers and waystations you've seen stay on fogged land, as you last saw them",
      "They stand still under the fog: no turning parts, smoke or steam, no building in progress, and their lights are dimmed",
      "Both the 3D map and the 2D map"
    ]
  }
];
