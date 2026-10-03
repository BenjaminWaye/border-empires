import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_SETTLE_PROMPT_AFTER_WHATS_NEW: ClientChangelogEntry[] = [
  {
    createdAt: 1791052155804,
    introducedIn: "2026.10.03.2",
    title: "Settle prompt is now a map marker",
    why: "The \"Settle nearby tiles?\" card popped up on top of What's New and the tutorial before you had seen the map.",
    changes: [
      "Towns and resources you can settle are now marked with a green ring on the map instead of a dialog opening by itself",
      "Click a ringed tile to open the settle card; \"Not now\" clears the rings until new tiles show up"
    ]
  }
];
