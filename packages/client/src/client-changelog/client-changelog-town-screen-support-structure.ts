import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const TOWN_SCREEN_SUPPORT_STRUCTURE_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1793745640446, // Date.now() captured once for this entry.
    introducedIn: "2026.11.03",
    title: "See what's built on a support tile",
    why: "Pressing a support tile opened its town's screen, which said nothing about the building already standing on that tile.",
    changes: ["The town screen now shows a Built here card for the selected support tile's building: its name, whether it's active, what it gives and its upkeep"]
  }
];
