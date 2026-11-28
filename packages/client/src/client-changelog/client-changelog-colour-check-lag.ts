import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const COLOUR_CHECK_LAG_ENTRY: ClientChangelogEntry = {
  createdAt: 1795870034071, // Date.now() captured once for this entry.
  introducedIn: "2026.11.28",
  title: "No more stutter in busy sectors",
  why: "In a crowded sector the game kept re-checking nation colours several times a second, even after you were on the map. Each check froze the game for about a third of a second, so taps and moves lagged, worst on phones.",
  changes: [
    "Nation colours are only checked while the colour picker is open",
    "Each check is worked out once and reused until someone's colour changes"
  ]
};
