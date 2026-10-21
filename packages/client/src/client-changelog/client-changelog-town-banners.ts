import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const TOWN_BANNERS_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1792516992654, // Date.now() captured once for this entry.
    introducedIn: "2026.10.20.3",
    title: "Fountains and gardens in towns",
    why: "On the 3D map a town's parks and rooftops were bare.",
    changes: [
      "Parks gain fountains over mirror-still pools and flowering shrubs, some rooftops are gardens, and glass towers catch more sky the higher they rise"
    ]
  }
];
