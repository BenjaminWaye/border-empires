import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_GARRISON_RENAME: ClientChangelogEntry[] = [
  {
    createdAt: 1791620306586, // frozen at authoring time
    introducedIn: "2026.10.10.1",
    title: "\"Settle\" is now \"Garrison\"",
    why: "Players read \"Settle\" as founding a town or putting a building on the tile. Nothing is built: you station troops on a frontier tile so it can be defended, built on and start producing.",
    changes: [
      "The Settle Land and Settle Connected buttons are now Garrison and Garrison Connected, and auto-settle is now auto-garrison",
      "Settled land is now called garrisoned land everywhere: tile menus, building placement hints, alerts, the leaderboard and player profiles",
      "Garrisoning works exactly as settling did: same manpower and coin cost, same timer, and the tile becomes defendable, buildable and counts toward victory"
    ]
  }
];
