import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const AI_TRUCE_PRICES_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1794075196542, // Date.now() captured once for this entry.
    introducedIn: "2026.11.07.1",
    title: "AI truce and alliance prices now follow real income",
    why: "AI empires priced deals as if everyone earned at least 1 coin a minute, far above real income, so a neighbour truce cost 720 to 1,080 coin or more.",
    changes: [
      "AI prices are based on what the richer empire really earns, with a minimum of 10 coin a day",
      "Gifts and payments win AI goodwill in proportion to that same income"
    ]
  }
];
