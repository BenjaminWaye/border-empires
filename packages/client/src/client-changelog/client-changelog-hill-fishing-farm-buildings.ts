import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const HILL_FISHING_FARM_BUILDINGS_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1793791695913, // Date.now() captured once for this entry.
    introducedIn: "2026.11.04",
    title: "Fishing on hills and buildings on farms look right",
    why: "On the 3D map, fishing sites on hill tiles stood on a tall gray box, and buildings on farm tiles were half-buried in the crops.",
    changes: [
      "Fishing sites on hill tiles now sit on levelled ground at the shore",
      "Buildings, forts and district buildings on farm tiles now stand on top of the fields, which stay visible"
    ]
  }
];
