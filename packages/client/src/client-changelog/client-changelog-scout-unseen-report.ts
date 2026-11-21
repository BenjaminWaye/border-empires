import type { ClientChangelogEntry } from "./client-changelog-data.js";

// Player report 2026-11-21: logging back in after a drone run showed no report.
export const SCOUT_UNSEEN_REPORT_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.21",
  title: "Scout drone: reports wait for you",
  why: "A drone that landed while you were logged off sent its report to nobody, so you came back to nothing.",
  changes: ["A report from a drone that landed while you were away shows when you log back in (within a day)"]
};
