import type { ClientChangelogEntry } from "./client-changelog-data.js";

// createdAt is set where this is listed in client-changelog-nov-27-28.ts.
export const CONTEST_START_PROGRESS_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.28",
  title: "See progress while the next Sector Contest starts",
  why: "Building the next world can take a minute, and the summary screen showed only Starting the next Sector Contest… with no sign anything was happening.",
  changes: [
    "While the next world is built, committed Houses see Building the next world with a running clock",
    "If it takes longer than usual, the screen says so",
    "Once the world is ready, a countdown shows when you'll be brought into it"
  ]
};
