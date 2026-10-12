import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_STEAMPUNK_ICON_LEGIBILITY: ClientChangelogEntry[] = [
  {
    createdAt: 1791839800377,
    introducedIn: "2026.10.12.2",
    title: "Clearer steampunk icons",
    why: "Several of the new steampunk icons were too detailed to read at their small size, and the Settings gear looked like the Gold coin.",
    changes: [
      "Tech, Allies and Settings tabs have bold new icons (lightning bolt, handshake, steel wrench and gear), and all tab icons are bigger",
      "Resource bar icons are bigger; Food is now wheat and a fish (it comes from both farms and fishing), and Umbrite is a single glowing ore chunk",
      "Resource tile badges on the map show the icon on a dark plate with a coloured rim, so it no longer blends into the tile",
      "Plunder alerts and the Alerts feed show resource icons instead of emoji",
      "Shard markers on the minimap use the new Shard icon, with a warm glow for falling shards and a cyan glow for landed ones"
    ]
  }
];
