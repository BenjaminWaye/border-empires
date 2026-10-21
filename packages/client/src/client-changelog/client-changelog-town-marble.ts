import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const TOWN_MARBLE_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1792528071311, // Date.now() captured once for this entry.
    introducedIn: "2026.10.21.1",
    title: "Towns stand on marble",
    why: "On the 3D map a town's base still read as a plain grey tray next to the polished muster flags.",
    changes: [
      "On the 3D map every town now stands on a polished marble base, its streets black marble veined in gold",
      "The marble of muster flags' plinths is now that same black and gold, so flags and towns match"
    ]
  }
];
