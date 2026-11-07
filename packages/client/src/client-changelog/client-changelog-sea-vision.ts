import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const SEA_VISION_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1794051272770, // Date.now() captured once for this entry.
    introducedIn: "2026.11.07",
    title: "Narrow sea channels show as water and no longer block vision",
    why: "One-tile sea channels carved into the map looked like a thin line between two shores in 3D, and still counted as forest, cutting off Relay Beacon and territory vision across them.",
    changes: [
      "Sea tiles never block line of sight, even where the map's forest pattern runs through a carved channel",
      "Relay Beacons and other vision sources next to such channels now see across the water",
      "In the 3D map, beaches leave most of a one-tile strait or inlet open, so the channel reads as water instead of land"
    ]
  }
];
