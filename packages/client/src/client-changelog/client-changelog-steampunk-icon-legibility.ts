import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_STEAMPUNK_ICON_LEGIBILITY: ClientChangelogEntry[] = [
  {
    createdAt: 1791839800377,
    introducedIn: "2026.10.12.2",
    title: "Simpler, clearer steampunk icons",
    why: "The painted steampunk icons were too detailed to read at small sizes, the Settings gear looked like the Gold coin, and Crystal looked like Shard.",
    changes: [
      "Resource icons, menu tabs and Buildings-tab categories now use bold, simple brass-and-steel icons that read at a glance, like emoji",
      "Food is a basket of wheat and fish (it comes from both farms and fishing), Crystal is a cut gem so it no longer looks like a Shard, Allies shows two figures, and Settings is a steel gear",
      "Tab and resource bar icons are bigger",
      "Resource tile badges on the map show the icon on a dark plate with a coloured rim, so it no longer blends into the tile",
      "Plunder alerts and the Alerts feed show resource icons instead of emoji",
      "Shard markers on the minimap use the Shard icon, with a warm glow for falling shards and a cyan glow for landed ones"
    ]
  }
];
