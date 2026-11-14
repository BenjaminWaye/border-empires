import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const TOWNS_TABLE_HEADERS_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.14",
  title: "Readable Towns table on phones",
  why: "On a phone the Towns table's column names ran into each other.",
  changes: [
    "The Towns table's columns are now Coin/day, Pop, Growth and Slots, and wrap instead of overlapping."
  ]
};
