import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const FRONTIER_SUPPLY_LINES_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1792267552682, // frozen Date.now() value for this release
    introducedIn: "2026.10.17.1",
    title: "Supply lines show how thin your far frontier is",
    why: "Frontier beyond your reach lives only as long as its chain back to your settled land holds, and nothing on the map showed that chain or where it was weakest.",
    changes: [
      "Faint arrows now flow from the edge of your reach into any frontier past it, fading the further out it goes",
      "Where the line narrows to a single tile, the arrows turn amber and a pulsing diamond marks the pinch: lose that tile and everything past it goes",
      "Tap a pinch tile to see how many tiles depend on it",
      "Works on both the 3D and the 2D map"
    ]
  }
];
