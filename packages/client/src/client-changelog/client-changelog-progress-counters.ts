import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const PROGRESS_COUNTERS_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.26",
  title: "Fixed: progress numbers that disagreed",
  why: "A scout report, Cartographer, Town Control, your rank and truce offers each showed a different number for the same thing.",
  changes: [
    "A scout report's +Tiles counts only new ground, the same tiles Cartographer counts, and Cartographer updates when the drone lands",
    "Town Control counts your towns as soon as you take one",
    "Chronicle World shows the same rank as your profile",
    "A truce offer shows the time the truce has left; it runs from when it was sent"
  ]
};
