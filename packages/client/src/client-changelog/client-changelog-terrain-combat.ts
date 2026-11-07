import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const TERRAIN_COMBAT_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1794081806137, // Date.now() captured once for this entry.
    introducedIn: "2026.11.07",
    title: "Hills and rivers shape battles",
    changes: [
      "Garrisoned and freshly captured tiles on hills defend at +20%.",
      "Attacking across a river attacks at -20%. A diagonal attack counts as crossing only when both ways around the corner cross the river.",
      "The attack odds breakdown shows Hills and River crossing rows when they apply. Undefended frontier is still captured outright."
    ],
    why: "High ground and rivers now make natural defensive lines worth holding and planning around."
  }
];
