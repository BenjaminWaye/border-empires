import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const AUTO_GARRISON_REQUEUE_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1791811310071 /* Date.now() frozen for the changelog gate */,
    introducedIn: "2026.10.12.1",
    title: "Auto-garrison queue fixes",
    why: "A tile could start garrisoning again when its earlier garrison completed.",
    changes: ["Completed garrisons no longer restart from an earlier queued order", "Tiles already garrisoning are removed from the waiting queue"]
  },
];
