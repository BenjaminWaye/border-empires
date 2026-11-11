import type { ClientChangelogEntry } from "./client-changelog-data.js";
import { SEASON_ELO_CHANGELOG } from "./client-changelog-season-elo.js";

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
}, { ...SEASON_ELO_CHANGELOG, createdAt: 1794209550379 }];

export const MISSING_HISTORY_REPORT_CHANGELOG: ClientChangelogEntry = {
  createdAt: 1794140696933,
  introducedIn: "2026.11.08",
  title: "Report missing season history",
  why: "Missing historical statistics should be easy to report for investigation.",
  changes: ["Missing statistics and timelines now offer a bug-report button with the affected records and winner details filled in"]
};

export const SEASON_RECORD_DETAILS_CHANGELOG: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.08",
  title: "The empires behind the season records",
  why: "Road lengths and battlefield losses needed the players and places behind them.",
  changes: [
    "Longest Road names its empire and both endpoint cities, with their coordinates",
    "Most Deadly Tile shows where the fighting happened and which empire lost the most manpower there",
    "Player loss records persist across restarts; missing older details can be reported as a bug"
  ]
};
