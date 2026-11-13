import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const FOG_GRID_REMOVED_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.13",
  title: "Unexplored fog no longer draws a misaligned tile grid",
  why: "On the 3D map, the faint grid inside the unexplored fog floated above the ground, so a selected fog tile looked offset from the grid squares around it.",
  changes: ["Removed the grid lines from the unexplored fog. The selection square now sits on clean cloud, and explored land keeps its own aligned grid."]
};
