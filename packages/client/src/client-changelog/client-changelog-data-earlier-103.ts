import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_103: ClientChangelogEntry[] = [
  {
    createdAt: 1791748295340, // frozen Date.now() value for this release
    introducedIn: "2026.10.11.1",
    title: "Garrison works on towns, docks and captured buildings outside your reach",
    why: "Your troops already garrisoned a captured town, dock or building outside your reach on their own, but the tile menu's Garrison button was greyed out with \"Outside your reach\" (and the server refused captured buildings).",
    changes: [
      "Garrison is now available from the tile menu on towns, docks and captured forts, observatories and economic structures, even outside your reach",
      "Plain land outside your reach still can't be garrisoned"
    ]
  }
];