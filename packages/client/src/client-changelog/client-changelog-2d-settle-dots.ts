import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_2D_SETTLE_DOTS: ClientChangelogEntry[] = [
  {
    createdAt: 1791314970493, // frozen at authoring time
    introducedIn: "2026.10.06.1",
    title: "Settlers spread out on the 2D map",
    why: "In the 2D map renderer, every settler dot on a tile that was being settled drew in the same pixel at the tile's corner and barely moved, so settling looked like one static speck.",
    changes: [
      "Settler dots now spread across the tile and wander, pausing and walking just like on the 3D map"
    ]
  }
];
