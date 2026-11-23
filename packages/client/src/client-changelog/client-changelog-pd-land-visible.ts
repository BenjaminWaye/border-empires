import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const PD_LAND_VISIBLE_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.23",
  title: "Planetary Defense land is easy to see",
  why: "Its land was a near-black tint that looked like a shadow, so players didn't notice it spreading toward them.",
  changes: [
    "Planetary Defense land is a light ash grey on both maps, and its 2D border matches"
  ]
};
