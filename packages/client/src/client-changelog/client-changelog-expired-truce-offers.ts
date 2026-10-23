import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const EXPIRED_TRUCE_OFFERS_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1792718647917, // Date.now() captured once for this entry.
    introducedIn: "2026.10.23.1",
    title: "Expired truce offers no longer linger in the Alliances tab",
    why: "A truce offer expires after 5 minutes, but its card and ally badge stayed up, so pressing Accept only failed with \"request invalid or expired\".",
    changes: [
      "Truce offers disappear from the Alliances tab and the ally badge as soon as they expire",
      "If an offer is already gone when you answer it, the panel refreshes and removes it"
    ]
  }
];
