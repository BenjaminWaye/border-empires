import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const TOWN_TIER_CELEBRATION_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1794040803550, // Date.now() captured once for this entry.
    introducedIn: "2026.11.07",
    title: "Town upgrades are celebrated on the map",
    why: "Growing a town to a new tier changed its model with no fanfare, so a big milestone was easy to miss.",
    changes: [
      "When one of your towns grows to a new tier, a light column rises from it, golden shockwaves roll out across the ground and sparks spiral up",
      "Bigger tiers get a bigger, longer celebration, from a fresh Town up to a Monumental City",
      "The 3D map shows the new tier's name above the town, and your feed announces it",
      "The celebration plays in both the 2D and 3D maps"
    ]
  }
];
