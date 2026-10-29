import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const TERRITORY_EDGE_GLOW_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1793258681846, // Date.now() captured once for this entry.
    introducedIn: "2026.10.29.1",
    title: "Softer settled territory",
    why: "Settled land was one flat block of colour with a hard edge, hiding the terrain underneath.",
    changes: [
      "Settled territory is strongest at its border and fades towards the middle, so terrain shows through inside your lands.",
      "A thin line in the owner's colour traces the edge of settled land, including where it meets your own frontier."
    ]
  }
];
