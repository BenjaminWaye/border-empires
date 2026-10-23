import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const FOGGED_MIST_FEATURES_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1792701740000, // Date.now() captured once for this entry.
    introducedIn: "2026.10.22.1",
    title: "Trees and peaks sit inside the fog, not on top of it",
    why: "On the 3D map, trees, mountains and hill tops on land you could no longer see rose crisp and dark out of the mist, so they looked pasted over the fog.",
    changes: [
      "Trees, palms, mountains and hills out of sight now get the same drifting mist as the ground around them",
      "3D map only: the 2D map already drew its mist over the trees"
    ]
  }
];
