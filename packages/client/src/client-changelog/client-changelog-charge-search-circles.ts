import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CHARGE_SEARCH_CIRCLES_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.18",
  title: "Clearer Charge search areas",
  why: "Show on map for two unscouted towns drew a ring of separate markers that looked like many towns.",
  changes: [
    "Each unscouted Charge town gets its own dotted circle. The town is inside it, but not at the centre.",
    "A Charter's two towns are joined by a dotted line."
  ]
};
