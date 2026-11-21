import type { ClientChangelogEntry } from "./client-changelog-data.js";

// Player report 2026-11-21: taps meant to close a card started a drone plan and added stops.
export const SCOUT_CLOSING_TAPS_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.21",
  title: "Scout drone: closing taps stay closing taps",
  why: "Tapping the map to close a tile menu or the drone's report card started a drone route, and each further tap added a stop.",
  changes: [
    "A tap that closes a menu or the report card only closes it; tap the fog again to plan",
    "Your AFC's Send scout drone shows your charges, and the AFC screen shows when the next one comes back",
    "The white drone marker over a flying scout drone only shows when you zoom out"
  ]
};
