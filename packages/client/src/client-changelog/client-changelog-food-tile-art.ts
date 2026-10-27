import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const FOOD_TILE_ART_CHANGELOG: ClientChangelogEntry[] = [{
  createdAt: 1793055094781, // Date.now() captured once for this entry.
  introducedIn: "2026.10.26.1",
  title: "Richer farms and fishing sites",
  why: "Food tiles needed more depth, material detail and a clearer sense of a working place.",
  changes: ["Farms have richer crop beds, irrigation, silo bands and barn trim.", "Fishing sites retain their holding basins and loading hoists, with a smaller footprint, a clean gray apron and placement closer to adjacent water. Both map renderers have matching artwork. Production and gameplay are unchanged."]
}];
