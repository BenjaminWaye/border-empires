import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CHRONICLE_ROW_TIME_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.23",
  title: "Chronicle times no longer overlap",
  why: "Yesterday's Chronicle rows printed \"yesterday 21:54\", which spilled over the row's icon.",
  changes: [
    "Rows under a day heading show just the time",
    "Results and losses since you last looked show a short day above the time"
  ]
};
