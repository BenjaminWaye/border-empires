import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const FRONTIER_SUPPLY_LINES_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1792267552682, // frozen Date.now() value for this release
    introducedIn: "2026.10.17.1",
    title: "Supply lines show how far your frontier is stretched",
    why: "Frontier beyond your reach lives only as long as its chain back to your settled land holds, and nothing on the map showed that chain.",
    changes: [
      "Glowing supply lines now run from the edge of your reach out to the tips of any frontier past it, with pulses flowing outward",
      "Lines are thicker where more land depends on them and fade the further they run past your reach",
      "If an enemy takes a tile on a line and there's another way round, the line redraws along it",
      "Works on both the 3D and the 2D map"
    ]
  }
];
