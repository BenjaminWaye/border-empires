import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const RAW_DEPOSIT_UNDER_IMPROVEMENT_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1793226737948, // Date.now() captured once for this entry.
    introducedIn: "2026.10.28.5",
    title: "Mines and Umbrite Rigs replace their deposit on the 3D map",
    why: "Building a Mine on Titanium or Crystal, or an Umbrite Rig on Umbrite, left the raw deposit drawn on the tile, so the rocks poked through the new building.",
    changes: ["On the 3D map, the raw Titanium, Crystal or Umbrite deposit is no longer drawn once a Mine or Umbrite Rig stands on it. The 2D map already showed only the building."]
  }
];
