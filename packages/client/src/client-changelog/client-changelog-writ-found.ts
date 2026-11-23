import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const WRIT_FOUND_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.23",
  title: "Writ of Correction updates faster",
  why: "A held Writ kept its search circle and could take a while to show as held.",
  changes: [
    "Show on map drops the search circle once you find the rival's AFC or hold the Writ, and rings the AFC instead.",
    "The card shows the Writ as held within a second of garrisoning the AFC."
  ]
};
