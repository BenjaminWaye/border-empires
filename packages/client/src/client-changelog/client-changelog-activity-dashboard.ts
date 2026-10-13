import type { ClientChangelogEntry } from "./client-changelog-data.js";

// Earlier entries aged out of the "keeps only the latest week" window and were
// moved to client-changelog-data-earlier-93.ts (historical record, left
// unreferenced) -- see the maintenance note atop client-changelog-data.ts.
export const CLIENT_CHANGELOG_ENTRIES_ACTIVITY_DASHBOARD: ClientChangelogEntry[] = [
  {
    createdAt: 1791818706351 /* Date.now() frozen for the changelog gate */,
    introducedIn: "2026.10.12.2",
    title: "Current building names everywhere",
    why: "Several screens still showed old or internal building names, like CARAVANARY in the Yours activity view or Granary in tile history.",
    changes: [
      "Yours activity view, build queue and in-progress builds now use in-game names like Trade Nexus",
      "Waystation tech grants in Yours show the tech's name",
      "Tile history, error messages, economy breakdown and help text use the current names (Aether Tower, Sky Dock, Hydroworks, Sovereign Siege Engine and others)"
    ]
  }
];
