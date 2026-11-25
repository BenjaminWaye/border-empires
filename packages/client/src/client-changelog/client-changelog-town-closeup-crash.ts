import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const TOWN_CLOSEUP_CRASH_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.25",
  title: "Opening a town no longer crashes the 2D map",
  why: "On the 2D map, opening a town from the Towns tab could crash the game to the error screen, most often right after capturing it.",
  changes: [
    "The zoom into a town's close-up can no longer overshoot below the furthest zoom level",
    "If one map frame fails to draw, the map skips it and keeps going instead of stopping the game"
  ]
};
