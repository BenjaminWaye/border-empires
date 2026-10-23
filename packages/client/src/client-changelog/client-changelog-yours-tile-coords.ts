import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const YOURS_TILE_COORDS_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1792611391912, // Date.now() captured once for this entry.
    introducedIn: "2026.10.21.4",
    title: "Tile coordinates in your activity",
    why: "Rows in the Yours activity list said what happened but not where, so you had to press Center to find out.",
    changes: ["Each row in the Yours tab now shows the tile's X, Y coordinates"]
  }
];
