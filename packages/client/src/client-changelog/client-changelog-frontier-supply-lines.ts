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
  },
  {
    createdAt: 1792320592301, // frozen Date.now() value for this release
    introducedIn: "2026.10.18.1",
    title: "Supply lines are quieter on the map",
    why: "The supply line itself drew too much attention away from the rest of the map.",
    changes: [
      "The line is now pale and barely visible; you follow it from the pulses moving along it",
      "The arrowhead at each frontier tip lights up as a pulse reaches it",
      "Works on both the 3D and the 2D map"
    ]
  },
  {
    createdAt: 1792431480104, // frozen Date.now() value for this release
    introducedIn: "2026.10.19.3",
    title: "Supply lines only mark land that hangs on one tile",
    why: "Supply lines were drawn to all land beyond your reach and their bright pulses pulled the eye, even where losing a tile changed nothing.",
    changes: [
      "Supply lines now only appear where land beyond your reach hangs on a single tile: lose that tile and everything past it is lost",
      "That tile gets a small ring, and a thin, still, dashed line runs from it out to the land it holds",
      "No more pulses or arrowheads; land with more than one way back is left unmarked",
      "Works on both the 3D and the 2D map"
    ]
  }
];
