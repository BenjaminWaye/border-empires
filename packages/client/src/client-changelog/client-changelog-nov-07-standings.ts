import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const NOV_07_STANDINGS_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1794091694190, // Date.now() captured once for this entry.
    introducedIn: "2026.11.07",
    title: "Standings show power score",
    why: "The Ranks standings were ordered by power score but displayed tile counts, making the order and bars confusing.",
    changes: ["Standings now show power scores and scale each bar by score instead of tile count"]
  }
];
