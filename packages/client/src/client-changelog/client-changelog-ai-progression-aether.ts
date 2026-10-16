import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const AI_PROGRESSION_AETHER_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1792083271471,
    introducedIn: "2026.10.15.1",
    title: "AI empires grow, use aether and negotiate",
    why: "Some AI empires stalled because their plans used outdated resource costs or tried to abandon protected territory.",
    changes: [
      "AI builds now check resource-slot capacity and allow FOOD improvements without retired stockpile costs",
      "AI FOOD recovery preserves free relay beacons and never abandons its own AFC",
      "AI research follows current unlocks, and town upgrades wait for FOOD capacity",
      "AI empires build Aether Towers and use Purge, EMP, Siphon, bridges, walls and terrain shaping against useful visible targets",
      "AI empires can propose truces when threatened and alliances against a shared enemy"
    ]
  }
];
