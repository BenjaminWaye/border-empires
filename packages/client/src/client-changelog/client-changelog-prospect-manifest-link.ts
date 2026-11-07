import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const PROSPECT_MANIFEST_LINK_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1794086740134, // Date.now() captured once for this entry.
    introducedIn: "2026.11.07",
    title: "Clearer clue tile link",
    why: "The Manifest link on clue tiles looked like a stray white button.",
    changes: [
      "Clue tiles now say which Manifest reveals the resource, with its name underlined to open it"
    ]
  }
];
