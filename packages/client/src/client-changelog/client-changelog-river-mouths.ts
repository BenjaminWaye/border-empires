import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const RIVER_MOUTHS_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1794105149109, // Date.now() captured once for this entry.
    introducedIn: "2026.11.08.1",
    title: "Rivers flow cleanly into the sea",
    why: "Where a river met the coast, the beach pinched it to a narrow neck and it burst out into a wide funnel on the sea.",
    changes: ["Rivers keep their width across the beach, between sandy banks, and spill gently into the sea"]
  }
];
