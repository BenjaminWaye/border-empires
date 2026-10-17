import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const RESTART_TILE_STATE_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1791840005628, // frozen Date.now() value for this release
    introducedIn: "2026.10.12.3",
    title: "Server updates no longer reset waystations, muster flags or decay timers",
    why: "Every server update quietly forgot which waystations had already been used, which flags you had mustered troops into and when frontier tiles were due to decay. Used waystations then paid out again, which is why manpower kept jumping past its cap by 1,000 after updates.",
    changes: [
      "Used waystations stay used across server updates and no longer pay out a second time",
      "Muster flags and the manpower in them survive server updates",
      "Frontier decay countdowns keep running across server updates instead of restarting"
    ]
  }
];
