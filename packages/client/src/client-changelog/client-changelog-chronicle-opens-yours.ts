import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CHRONICLE_OPENS_YOURS_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.26",
  title: "Chronicle opens on Yours",
  why: "Joining with unread release notes opened the Chronicle on Updates instead of your own timeline.",
  changes: [
    "The Chronicle that opens when you join now always starts on Yours",
    "New release notes still show as a badge on the Updates tab"
  ]
};
