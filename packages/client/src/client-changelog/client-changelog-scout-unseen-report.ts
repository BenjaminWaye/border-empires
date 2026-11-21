import type { ClientChangelogEntry } from "./client-changelog-data.js";

// Player report 2026-11-21: logging back in after a drone run showed no report.
export const SCOUT_UNSEEN_REPORT_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.21",
  title: "Scout drone: reports wait for you",
  why: "A drone that landed while you were logged off, or with the game in the background, left you no report to come back to.",
  changes: [
    "A report from a drone that landed while you were away shows when you come back (within a day), once, on whichever device you open",
    "A report that arrives while the game is in the background waits until you look"
  ]
};
