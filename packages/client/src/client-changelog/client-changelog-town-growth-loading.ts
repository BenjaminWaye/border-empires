import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_TOWN_GROWTH_LOADING: ClientChangelogEntry[] = [
  {
    createdAt: 1792042896056, // frozen Date.now() value for this release
    introducedIn: "2026.10.15.1",
    title: "Town growth no longer shows as paused while loading",
    why: "Opening one of your towns could show \"0.00/m — City growth paused\" for a moment, even though the town was growing, because its growth rate hadn't arrived from the server yet.",
    changes: [
      "The town Overview shows \"Growth rate loading…\" until the real rate arrives",
      "The game now asks the server for the missing rate straight away",
      "Towns no longer lose their growth rate on the server's once-a-minute population update"
    ]
  }
];
