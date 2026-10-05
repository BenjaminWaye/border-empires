import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_WAYSTATION_POPUP_AFTER_WHATS_NEW: ClientChangelogEntry[] = [
  {
    createdAt: 1791195878001, // frozen, 1ms after the newest existing entry -- keeps the "latest week" rolling window from shifting past older entries
    introducedIn: "2026.10.05.2",
    title: "What's New only opens when there is something new",
    why: "What's New reopened on every login even with nothing new, and a captured-waystation popup could appear on top of it.",
    changes: [
      "What's New no longer reopens on every login; it opens only when there are release notes you haven't seen",
      "It also stays closed on your first login of a new season, so you aren't greeted by a pile of dialogs; the Updates tab still has the notes",
      "The waystation captured popup now waits until What's New (or the tutorial) is closed, then appears"
    ]
  }
];
