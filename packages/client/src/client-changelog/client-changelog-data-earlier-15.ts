import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_15: ClientChangelogEntry[] = [
  // Pruned: four entries here (3D sea-animation restart fix, 3D border
  // line render-pool fix -- both 2026.09.02.3 -- the login-hang fix,
  // 2026.09.02.4, and the offline-opponent weapons-factory fix, 2026.09.02.5)
  // aged out of the "keeps only the latest week of entries" window
  // (client-changelog.test.ts) as real time advanced.
  {
    createdAt: 1788301428581, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.02.6",
    title: "3D map: frontier tint and fog-of-war are transparent again",
    why: "The previous shadow-visibility fix switched the ownership-tint overlay to a multiply blend so a tile's cast shadow shows through settled territory's tint -- but that overlay's rendering code is shared with frontier tint and both fog-of-war layers, and multiply blending always darkens the ground rather than mixing toward the tint color the way the old alpha blend did. Frontier tiles and fogged (unrevealed) tiles started reading as a heavy, near-opaque wash instead of a subtle one, and the ground under them looked darker overall.",
    changes: [
      "Frontier tint and fog-of-war are back to their original translucent look",
      "Settled/owned territory keeps the new shadow-visible-through-tint look unchanged"
    ]
  }
];
