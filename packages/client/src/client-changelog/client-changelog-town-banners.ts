import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const TOWN_BANNERS_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1792516992654, // Date.now() captured once for this entry.
    introducedIn: "2026.10.20.3",
    title: "Towns fly their owner's banners",
    why: "On the 3D map you couldn't tell whose town was whose from the town itself, and its parks and rooftops were bare.",
    changes: [
      "Every town flies rippling banners in its owner's colour from the corners of its plate, and a metropolis hangs them down its great tower",
      "Towns nobody holds fly undyed canvas",
      "Parks gain fountains over mirror-still pools and flowering shrubs, some rooftops are gardens, and glass towers catch more sky the higher they rise"
    ]
  }
];
