import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const TOWN_RETURN_ROW_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.21",
  title: "Return a town list fixed",
  why: "Town names were cut off and the tier and position wrapped one word per line.",
  changes: ["Towns on the trade screen show their full name, tier and position on one row, with a town icon"]
};
