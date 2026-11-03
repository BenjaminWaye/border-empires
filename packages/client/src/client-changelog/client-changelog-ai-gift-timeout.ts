import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const AI_GIFT_TIMEOUT_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1793689072062, // Date.now() captured once for this entry.
    introducedIn: "2026.11.03",
    title: "Gifts and deals with AI empires go through",
    why: "A payment only got its confirmation back while the receiving empire was online. AI empires never are, so a gift sat on \"Offering your gift…\" and then said the deal timed out.",
    changes: [
      "A gift to an AI empire is confirmed right away instead of timing out",
      "A truce or alliance deal with coin, Shards or supplies that an AI empire accepts is paid right away instead of timing out"
    ]
  }
];
