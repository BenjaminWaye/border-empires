import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const VICTORY_HOLD_TIME_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1794074813000, // Date.now() captured once for this entry.
    introducedIn: "2026.11.07",
    title: "Economic hold timer restored",
    why: "Economic Hegemony holds showed no time remaining, and the victory alert stayed silent.",
    changes: [
      "Ranks and the season clock show the time left on an Economic Hegemony hold",
      "The victory alert now warns everyone when Economic Hegemony is being held"
    ]
  }
];
