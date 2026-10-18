import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const RIVAL_REACH_OVER_MY_TILES_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1792318122167, // frozen Date.now() value for this release
    introducedIn: "2026.10.18.2",
    title: "Your land inside a rival's reach is now marked on the map",
    why: "Taking a tile by attack never moves a reach border, so land you captured from a rival stays inside their reach: you can't build a Relay Beacon there. Their tiles inside your reach were already hatched, but your tiles inside theirs looked like the rest of your empire.",
    changes: [
      "Your own tiles inside a rival's reach now show thin lines in that rival's colour, running along the opposite diagonal to the hatch on rival tiles inside your reach",
      "Shown on both the 3D map and the 2D map"
    ]
  }
];
