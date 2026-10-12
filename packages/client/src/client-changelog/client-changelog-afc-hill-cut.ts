import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_AFC_HILL_CUT: ClientChangelogEntry[] = [
  {
    createdAt: 1791839078882, // Date.now() captured once for this release.
    introducedIn: "2026.10.12.1",
    title: "AFCs level the hills around them",
    why: "On the 3D map, an AFC next to hills had its module bays, cables, arms and docked modules buried inside the neighbouring hills.",
    changes: [
      "3D map: hills next to an AFC are levelled into a flat pad under its module ring, with the rest of each hill still rising behind it",
      "3D map: an AFC built on a hill now sits on the levelled ground instead of floating above it",
      "Purely visual: those tiles are still hills for vision and claim time. The 2D map is unchanged, since it draws the AFC on its own tile only"
    ]
  }
];
