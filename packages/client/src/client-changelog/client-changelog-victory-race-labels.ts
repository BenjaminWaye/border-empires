import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const VICTORY_RACE_LABELS_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1793482654419, // Date.now() captured once for this entry.
    introducedIn: "2026.10.31.1",
    title: "Clearer victory race",
    why: "Each victory path showed the leader's name above your own numbers, and close crests hid each other.",
    changes: [
      "Each victory path now shows the leader's progress under their name, and yours on its own line.",
      "Crests that would overlap step above or below the track, with a mark at their real position."
    ]
  }
];
