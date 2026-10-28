import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const AI_VICTORY_STANDINGS_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1793173333217, // Date.now() captured once for this entry.
    introducedIn: "2026.10.28.2",
    title: "AI empires chase real victories",
    why: "AI empires judged victory against their own size, so each thought it was already winning and none pushed for a win.",
    changes: [
      "AI empires now pick the victory path they are actually closest to from the season standings, switch when another path gets clearly closer, and defend a victory they are already holding.",
      "AI empires no longer waste turns trying to re-enable Relay Beacons on unsettled land."
    ]
  }
];
