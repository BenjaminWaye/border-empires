import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CAPTURED_TOWN_FIST_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.23",
  title: "Captured towns show a raised fist",
  why: "The planted flag on a just-captured town looked like the muster flag, not a town whose growth is paused.",
  changes: ["The Recently captured badge on town nameplates is now a raised fist"]
};
