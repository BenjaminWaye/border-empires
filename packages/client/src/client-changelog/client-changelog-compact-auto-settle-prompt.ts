import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_COMPACT_AUTO_SETTLE_PROMPT: ClientChangelogEntry[] = [
  {
    createdAt: 1790958525864, // frozen, 1ms after the newest develop changelog entry -- keeps the "latest week" rolling window from dropping older ones
    introducedIn: "2026.10.03.1",
    title: "A smaller, quieter settle prompt",
    why: "The \"Settle what's in reach?\" dialog covered the whole screen with a wall of text, which was a lot to take in on your first minutes in the game.",
    changes: [
      "The prompt is now a small card at the bottom of the screen instead of a full-screen dialog, so the map stays visible and clickable behind it",
      "Each kind of tile is one short row with its count, cost and an \"auto-settle in future\" tick",
      "The town row now shows the food upkeep of the towns you are about to settle",
      "Shorter wording throughout, including the not-enough-food warning"
    ]
  }
];
