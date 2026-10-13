import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_STEAMPUNK_ICON_LEGIBILITY: ClientChangelogEntry[] = [
  {
    createdAt: 1791839800377,
    introducedIn: "2026.10.12.2",
    title: "Simpler, clearer steampunk icons",
    why: "The painted steampunk icons were too detailed to read at small sizes, the Settings gear looked like the Gold coin, and Crystal looked like Shard.",
    changes: [
      "Resource icons, menu tabs and Buildings-tab categories now use bold, simple brass-and-steel icons that read at a glance, like emoji",
      "Food is an ear of corn, Crystal is a cut gem so it no longer looks like a Shard, the Manifest tab is a sealed ledger, Allies shows two figures, and Settings is a steel gear",
      "Tab and resource bar icons are bigger",
      "Resource and dock badges on the map keep their coloured square when zoomed out, so you can still tell food, titanium, crystal, umbrite and docks apart; zoomed in, they show the icon (docks now have a brass anchor)",
      "Removed the blinking \"ready to collect\" marker from map tiles: tiles no longer hold yield, and it was covering the resource badge",
      "Plunder alerts and the Alerts feed show resource icons instead of emoji",
      "Shard markers on the minimap use the Shard icon, with a warm glow for falling shards and a cyan glow for landed ones"
    ]
  }
];
