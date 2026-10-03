import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_SETTLE_PROMPT_AFTER_WHATS_NEW: ClientChangelogEntry[] = [
  {
    createdAt: 1791052155804,
    introducedIn: "2026.10.03.2",
    title: "Settle prompt waits for the map",
    why: "The \"Settle nearby tiles?\" card could pop up on top of What's New or the tutorial before you had seen the map.",
    changes: [
      "The settle prompt now holds back while What's New, the tutorial or any other opening dialog is on screen, and appears once the map is clear"
    ]
  }
];
