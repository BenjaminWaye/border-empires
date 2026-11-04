import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const OWNERSHIP_HELP_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1793776906386, // Date.now() captured once for this entry.
    introducedIn: "2026.11.04",
    title: "Fixed: tapping \"Your frontier\" explained unclaimed land",
    why: "Tapping the ownership label under a tile's name listed every ownership state with Unclaimed first, so tapping \"Your frontier\" seemed to talk about unclaimed land.",
    changes: [
      "Tapping the ownership label (\"Your frontier\", \"Unclaimed\", \"Your garrisoned land\") now explains only that tile's state"
    ]
  }
];
