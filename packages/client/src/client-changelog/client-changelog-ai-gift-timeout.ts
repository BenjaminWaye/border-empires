import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const AI_GIFT_TIMEOUT_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1793689072062, // Date.now() captured once for this entry.
    introducedIn: "2026.11.03",
    title: "Gifts to AI empires go through",
    why: "Offering an AI empire a gift sat on \"Offering your gift…\" and then said the deal timed out, even though nothing was wrong with the gift.",
    changes: ["A gift to an AI empire is confirmed right away instead of timing out"]
  }
];
