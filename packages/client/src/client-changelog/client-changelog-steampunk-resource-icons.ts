import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_STEAMPUNK_RESOURCE_ICONS: ClientChangelogEntry[] = [
  {
    createdAt: 1791749477457,
    introducedIn: "2026.10.11.1",
    title: "New steampunk resource and menu icons",
    why: "Resources and the menu tabs used plain emoji that didn't match the brass-and-aether look of the rest of the game.",
    changes: [
      "Each resource now has its own steampunk icon: a gear-rimmed coin, a ration canister, a riveted ingot, an aether orb, an Umbrite vial and a white crystal shard",
      "The new icons appear in the resource bar, economy panel, tile production and upkeep lines, and the resource-reveal card",
      "Resource tiles show the new icon in their corner badge, and the 3D map's missing-resource badges use it too",
      "The menu tabs (Tech, Allies, Ranks, Alerts, Activity, Sharding, Settings, and Core on mobile) have matching steampunk icons"
    ]
  }
];
