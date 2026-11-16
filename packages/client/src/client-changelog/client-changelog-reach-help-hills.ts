import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const REACH_HELP_HILLS_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1794806313203, // Date.now() captured once for this entry.
    introducedIn: "2026.11.16",
    title: "Clearer reach info and hill bonuses",
    why: "Tapping the reach badge opened the full tile details, and hill bonuses didn't say they came from the hill.",
    changes: [
      "Tapping the reach badge (ⓘ) shows only what it means. Details ▾ still opens the full tile overview",
      "Hill bonuses read \"Hills: vision +1\" and \"Hills: defense +20% when garrisoned\""
    ]
  }
];
