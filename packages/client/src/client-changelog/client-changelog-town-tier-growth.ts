import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const TOWN_TIER_GROWTH_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1794040803550, // Date.now() captured once for this entry.
    introducedIn: "2026.11.07",
    title: "Towns grow into their new tier",
    why: "Growing a town to a new tier swapped its model in an instant, so a big milestone was easy to miss.",
    changes: [
      "When one of your towns grows to a new tier, the old town sinks into the ground and the new buildings grow up out of it, starting at the centre and rippling outward",
      "Each building springs up a little past full height and settles, while dust billows round the town",
      "Your feed announces the new tier",
      "The transition plays in both the 2D and 3D maps"
    ]
  }
];
