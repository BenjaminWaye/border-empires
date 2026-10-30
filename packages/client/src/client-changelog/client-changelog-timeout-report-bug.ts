import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const TIMEOUT_REPORT_BUG_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1793227102779, // Date.now() captured once for this entry.
    introducedIn: "2026.10.28.5",
    title: "Report bug on delayed actions",
    why: "Every warning popup offered a debug log download, even for ordinary messages like being out of coin.",
    changes: [
      "Only delayed-result popups (an action or battle result the server didn't confirm in time) now show a button.",
      "That button is now Report bug and opens the in-game bug report, which attaches recent logs for you."
    ]
  }
];
