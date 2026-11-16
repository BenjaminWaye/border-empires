import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const FORT_BUILDING_SIZE_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.16",
  title: "Buildings keep their size inside forts",
  why: "On the 3D map a building on a fort tile was drawn at half size in a corner, as if it shared the tile with a town.",
  changes: [
    "A building inside a fort now stands in the middle of the walls at full size",
    "While it is being built, its crates and crew stay inside the walls"
  ]
};
