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
  },
  {
    createdAt: 1794261037363, // Date.now() captured once for this entry.
    introducedIn: "2026.11.09",
    title: "Carved sea channels draw as water in 3D",
    why: "The 3D map's shoreline still treated one-tile channels carved at season start as land, so they showed as a strip of green diamonds while the tile panel said Open sea.",
    changes: ["In the 3D map, carved one-tile sea channels now draw as open water with beaches on both banks, matching the tile's terrain"]
  }
];
