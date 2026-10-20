import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const TOWN_MARBLE_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1792528071311, // Date.now() captured once for this entry.
    introducedIn: "2026.10.20.4",
    title: "Towns stand on marble",
    why: "A town's base still read as a plain grey tray next to the polished muster flags.",
    changes: [
      "Every town now stands on a polished marble base, its streets black marble veined in gold",
      "Muster flags' plinths are now the same black, gold-veined marble all over, so flags and towns match"
    ]
  }
];
