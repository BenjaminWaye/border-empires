import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const AUTO_GARRISON_QUEUE_CLOG_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1793480823368, // Date.now() captured once for this entry.
    introducedIn: "2026.10.31",
    title: "Auto-garrison catches up on towns and captured land",
    why: "Tiles from a category you had switched off filled the auto-garrison queue, so towns stopped garrisoning. Switching a category on later only reached a few of the tiles you already held, and support tiles had no Garrison button.",
    changes: [
      "Switched-off categories no longer block towns, docks and support tiles from auto-garrisoning",
      "Switching auto-garrison on for a category now garrisons the tiles of that type you already hold",
      "Support tiles around your towns always offer Garrison"
    ]
  }
];
