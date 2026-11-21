import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const THREE_SEATS_MAP_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.21",
  title: "Three Seats charge shows its landmass",
  why: "Show on map for Founding of the Three Seats only drew a rough circle, so it was unclear which landmass or towns counted.",
  changes: [
    "Show on map shades the explored part of the landmass and rings every town on it you have found.",
    "Any town on the landmass counts toward the charge."
  ]
};
