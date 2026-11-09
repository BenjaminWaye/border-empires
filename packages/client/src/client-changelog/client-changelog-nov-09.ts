import type { ClientChangelogEntry } from "./client-changelog-data.js";

// createdAt is set where these are listed in client-changelog-data.ts, which is
// the only file the changelog gate (scripts/check-client-changelog-update.mjs) reads.
export const SEASON_SCORES_SAVED_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.09",
  title: "See the season scores that were saved",
  why: "A season with one score sample per empire could look like it had no history.",
  changes: ["The Score Graph shows saved scores even without enough samples for a trend", "Report a bug appears next to the missing season record"]
};

export const NEUTRAL_TOWN_NAMES_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.09",
  title: "Neutral towns show their names",
  why: "Only owned towns had a name banner, so the unclaimed towns worth capturing were the hard ones to pick out.",
  changes: ["Neutral towns get a name banner above them on both the 2D and 3D maps, in plain colours with no owner line"]
};
