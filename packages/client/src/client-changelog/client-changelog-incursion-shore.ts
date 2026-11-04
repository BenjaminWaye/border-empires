import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const INCURSION_SHORE_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1793823472000, // Date.now() captured once for this entry.
    introducedIn: "2026.11.04",
    title: "Reach stripes reach the waterline",
    why: "On the 3D map, striped territory stopped at the square tile edge and left the curved beach unstriped.",
    changes: ["Reach hatching now continues over coastal sand to the water's edge, with the same colours and stripe spacing."]
  }
];
