import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const MAP_BROWSING_FIXES_CHANGELOG: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.08",
  why: "Exploring a revealed world should stay responsive and show occupation clearly.",
  title: "Smoother map browsing and clearer occupation",
  changes: [
    "Map browsing reuses roads until tile data changes and skips unused canvas road work in 3D.",
    "Territory held inside another House's reach is hatched even when both Houses are rivals, in 2D and 3D.",
    "Unrecognized structure data shows a reload hint instead of crashing tile details."
  ]
};
