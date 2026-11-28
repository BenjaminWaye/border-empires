import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const WORLD_MAP_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.28",
  title: "Whole-world map",
  why: "New players could not tell where their land sat in the world or how much was left to explore.",
  changes: [
    "Tap the minimap to open the whole world; drag on it still pans",
    "On a phone, World on the map screen opens it",
    "It shows the land you have explored, your own land and your current view; the rest stays fog",
    "Tap a place to go there"
  ]
};
