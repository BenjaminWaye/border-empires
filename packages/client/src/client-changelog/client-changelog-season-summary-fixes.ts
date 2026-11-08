import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const SEASON_SUMMARY_FIXES_CHANGELOG: ClientChangelogEntry[] = [{
  createdAt: 1794138895074, // Date.now() captured once for this entry.
  introducedIn: "2026.11.08",
  title: "Clearer season summaries",
  why: "Season results could show an old name, hide records, or sit behind game controls.",
  changes: [
    "Season winners use their current empire name",
    "Statistics and score history stay accessible on phones, with clear messages for missing records",
    "Previously saved season records are restored when you sign in",
    "The season summary covers game controls until you choose Look Around",
    "Map preparation no longer guesses a wait from download size"
  ]
}];
