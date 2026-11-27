import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CHRONICLE_OPENS_YOURS_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.26",
  title: "Chronicle opens on Yours",
  why: "Joining with unread release notes opened the Chronicle on Updates instead of your own timeline.",
  changes: [
    "When new release notes open the Chronicle as you join, it starts on Yours",
    "The notes show as a badge on the Updates tab, and open the Chronicle only once per batch"
  ]
};
