import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_SHARD_ALERT_AFTER_WHATS_NEW: ClientChangelogEntry[] = [
  {
    createdAt: 1791321087720,
    introducedIn: "2026.10.06.6",
    title: "Shard rain alert waits for What's New",
    why: "The Shard Rain Begun alert could pop up on top of What's New when you logged in during a rain.",
    changes: ["The shard rain alert now waits until What's New (or the tutorial) is closed, then appears"]
  }
];
