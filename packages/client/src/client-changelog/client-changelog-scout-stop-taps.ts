import type { ClientChangelogEntry } from "./client-changelog-data.js";

// Player report 2026-11-21: a tap on a flying drone's stop added a stop beside it ("5", never placed), and trying
// to take that one off added a "7".
export const SCOUT_STOP_TAPS_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.21",
  title: "Scout drone: no stray stops",
  why: "Tapping a numbered stop while the drone was flying added a new stop beside it, numbered after the whole route.",
  changes: [
    "Tapping a stop the drone is still flying to no longer adds a stop",
    "A tap on a planned stop's number, or just beside it, takes it off the plan"
  ]
};
