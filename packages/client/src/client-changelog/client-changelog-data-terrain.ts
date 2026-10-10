import type { ClientChangelogEntry } from "./client-changelog-data.js";

// Older entries aged out of the "keeps only the latest week" window and were
// moved to client-changelog-data-earlier-93.ts (historical record, left
// unreferenced) -- see the maintenance note atop client-changelog-data.ts.
export const CLIENT_CHANGELOG_ENTRIES_TERRAIN: ClientChangelogEntry[] = [
  {
    createdAt: 1791663119915, // Date.now() frozen for this entry, as required by the changelog gate.
    introducedIn: "2026.10.10.3",
    title: "Rivers start at a spring",
    why: "Rivers began with a flat, square cut on open ground, as if chopped off.",
    changes: [
      "Rivers that run along tile borders (newer seasons) now begin in a small spring pool with a wet bank around it, narrowing into the stream",
      "Trees no longer stand in the pool",
      "Shown on both the 3D map and the 2D map"
    ]
  },
  {
    createdAt: 1791665034483, // Date.now() frozen for this entry, as required by the changelog gate.
    introducedIn: "2026.10.10.5",
    title: "Rivers rise in the mountains (new seasons)",
    why: "Rivers began wherever the generator happened to start them, often on open plains.",
    changes: [
      "In seasons started from now on, nearly every river begins right beside a mountain and runs down to the sea",
      "Running seasons keep their rivers, towns and resources exactly as they are"
    ]
  }
];
