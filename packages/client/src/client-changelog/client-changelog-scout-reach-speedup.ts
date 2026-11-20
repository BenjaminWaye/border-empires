import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const SCOUT_REACH_SPEEDUP_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.19",
  title: "Scout drones speed over your reach",
  why: "A drone kept crawling at scouting pace over ground that had just come into your reach, even though you could already see it.",
  changes: [
    "Unclaimed ground inside your reach now counts as home ground: the drone crosses it at home pace, and it doesn't use up the drone's range",
    "If ground on the drone's path becomes your reach or your land while it flies, the drone jumps forward over it, there and back, and lands sooner"
  ]
};
