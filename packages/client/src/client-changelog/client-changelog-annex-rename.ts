import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_ANNEX_RENAME: ClientChangelogEntry[] = [
  {
    createdAt: 1791620306586, // frozen at authoring time
    introducedIn: "2026.10.10.1",
    title: "\"Settle\" is now \"Annex\"",
    why: "Players read \"Settle\" as founding a town or putting a building on the tile. Nothing is built: the tile just stops being loose frontier land and becomes a full part of your empire.",
    changes: [
      "The Settle Land and Settle Connected buttons are now Annex Land and Annex Connected, and auto-settle is now auto-annex",
      "Settled land is now called annexed land everywhere: tile menus, building placement hints, alerts, the leaderboard and player profiles",
      "Annexing works exactly as settling did: same cost, same timer, and the tile becomes defendable, buildable and counts toward victory"
    ]
  }
];
