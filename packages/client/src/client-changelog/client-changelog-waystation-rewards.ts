import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_WAYSTATION_REWARDS: ClientChangelogEntry[] = [
  {
    createdAt: 1789933799389, // frozen, 1ms after the newest existing entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.26.2",
    title: "Waystations can now grant gold or manpower, and never give nothing",
    why: "A waystation that rolled a free technology gave you nothing once you already knew every first-tier technology, wasting its one-time activation.",
    changes: [
      "Waystations can now grant gold: 25, 50 or (rarely) 100. That is a big boost early in the season and a smaller one later",
      "Waystations can now grant 1,000 manpower, which can take you above your manpower cap. Regeneration pauses until you spend back below the cap",
      "If a waystation rolls a free technology and you already know every first-tier technology, you get gold instead"
    ]
  }
];
