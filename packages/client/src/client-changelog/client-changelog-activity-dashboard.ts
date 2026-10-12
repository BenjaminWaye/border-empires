import type { ClientChangelogEntry } from "./client-changelog-data.js";

// Earlier entries aged out of the "keeps only the latest week" window and were
// moved to client-changelog-data-earlier-93.ts (historical record, left
// unreferenced) -- see the maintenance note atop client-changelog-data.ts.
export const CLIENT_CHANGELOG_ENTRIES_ACTIVITY_DASHBOARD: ClientChangelogEntry[] = [
  {
    createdAt: 1791818706351 /* Date.now() frozen for the changelog gate */,
    introducedIn: "2026.10.12.2",
    title: "Building names in Yours",
    why: "Completed buildings in the Yours activity view showed internal names like CARAVANARY.",
    changes: ["Completed buildings now use their in-game names, e.g. Trade Nexus"]
  }
];
