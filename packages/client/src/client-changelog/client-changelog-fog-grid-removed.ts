import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const FOG_GRID_REMOVED_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.14",
  title: "The map no longer draws a tile grid",
  why: "On the 3D map, the grid inside the unexplored fog floated above the ground, so a selected fog tile looked offset from the grid around it. The grid on explored land added clutter without helping you read territory.",
  changes: [
    "Removed the tile grid from the unexplored fog, so the selection square no longer straddles misaligned lines.",
    "Removed the tile grid from explored ground. Territory borders and tile highlights still mark tiles."
  ]
};
