import type { ClientChangelogEntry } from "./client-changelog-data.js";

// Earlier entries aged out of the "keeps only the latest week" window and were
// moved to client-changelog-data-earlier-93.ts (historical record, left
// unreferenced) -- see the maintenance note atop client-changelog-data.ts.
export const CLIENT_CHANGELOG_ENTRIES_ACTIVITY_DASHBOARD: ClientChangelogEntry[] = [
  {
    createdAt: 1791818706351 /* Date.now() frozen for the changelog gate */,
    introducedIn: "2026.10.12.2",
    title: "Current building names everywhere",
    why: "Several screens still showed old or internal building names, like TRADE_NEXUS in the Yours activity view or Incubation Engine in tile history.",
    changes: [
      "Yours activity view, build queue and in-progress builds now use in-game names like Trade Nexus",
      "Waystation tech grants in Yours show the tech's name",
      "Tile history, error messages, economy breakdown and help text use the current names (Aether Tower, Sky Dock, Hydroworks, Sovereign Siege Engine and others)"
    ]
  },
  {
    createdAt: 1792204070169 /* Date.now() frozen for the changelog gate */,
    introducedIn: "2026.10.17.1",
    title: "AI empires named properly in your activity",
    why: "The Yours activity view called AI empires by a placeholder like AI 5 instead of the name shown on the leaderboard.",
    changes: [
      "Battles and territory changes in Yours now name AI empires the same way the leaderboard does"
    ]
  },
  {
    createdAt: 1792966817522 /* Date.now() frozen for the changelog gate */,
    introducedIn: "2026.10.25.1",
    title: "Activity counts each tile once",
    why: "A tile that changed hands back and forth was counted on every flip, inflating tiles taken and lost.",
    changes: [
      "Activity summaries, rival tallies, territory momentum and the open-war story count each tile once",
      "The timeline still lists every flip, and frontline hotspots still show how often a tile changed hands"
    ]
  }
];
