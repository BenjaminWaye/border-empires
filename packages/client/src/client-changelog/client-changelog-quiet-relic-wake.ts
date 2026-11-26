import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const QUIET_RELIC_WAKE_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.26",
  title: "No more pop-up when a rival's relic is running",
  why: "The green card covered the map for something the violet column already shows.",
  changes: ["A rival's running relic is listed in the Activity feed only"]
};
