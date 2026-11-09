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

export const AI_EXPANSION_FIXES_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.09",
  title: "AI empires keep claiming open land",
  why: "Late in a season AI empires stalled with open land next to them: they kept trying attacks they had no mustered troops for, stopped building Relay Beacons as soon as any enemy touched their border, and switched beacons off to make FOOD room for other buildings.",
  changes: [
    "AI attacks only when a muster flag in range can pay for it",
    "AI keeps building Relay Beacons on quiet borders unless its core is under threat",
    "Short of FOOD, AI switches off surplus mines and rigs and fully overlapped beacons first, and keeps beacons that hold land",
    "AI only builds Hydroworks next to Hydrogardens it can actually boost",
    "AI out of FOOD offers to buy FOOD supply from Houses with spare FOOD, paying in surplus resources or coin"
  ]
};
