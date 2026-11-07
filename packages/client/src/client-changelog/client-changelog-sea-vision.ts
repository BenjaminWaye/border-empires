import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const SEA_VISION_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1794051272770, // Date.now() captured once for this entry.
    introducedIn: "2026.11.07",
    title: "Water no longer blocks vision like forest",
    why: "Narrow sea channels carved into the map still counted as forest, cutting off Relay Beacon and territory vision across them.",
    changes: [
      "Sea tiles never block line of sight, even where the map's forest pattern runs through a carved channel",
      "Relay Beacons and other vision sources next to such channels now see across the water"
    ]
  }
];
