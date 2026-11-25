import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const FOGGED_RESOURCES_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.25",
  title: "Resources stay on the map under the fog",
  why: "Resources you had already seen vanished as soon as their tile went back under the fog, so you couldn't plan around the farms, fish and deposits you had scouted.",
  changes: [
    "Tiles you have seen but can't see now show their resource as you last saw it, faded under the fog, on both the 3D and the 2D map.",
    "On the 3D map, forest on remembered tiles now clears around their buildings and deposits as it does in sight."
  ]
};
