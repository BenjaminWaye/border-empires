import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const SCOUT_SHORTEST_HOME_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.23",
  title: "Scout drone takes the short way home",
  why: "A drone whose line home crossed a rival border flew its whole route back, and its timer covered the Town captured card's Garrison button.",
  changes: [
    "When a rival border lies between your scout drone and your AFC, it now flies the shortest way round instead of retracing its route",
    "The drone's timer and report step aside while a full-screen card such as Town captured is open, so its buttons are never hidden"
  ]
};
