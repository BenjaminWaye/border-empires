import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const PLAYTEST_MAP_READABILITY_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.16",
  title: "Clearer weak tiles, borders and reach highlights",
  why: "Playtesters saw scout drone reveals vanish, couldn't find their weak tiles, saw a reach tint spill over the sea, struggled to tell owned land from unclaimed land without colour, and found the Integrity panel cramped.",
  changes: [
    "Land your scout drone reveals now appears as soon as it comes into view, and stays on the map as remembered terrain once the drone moves on",
    "Show weak tiles now moves the camera to your weakest tile and says why it is weak; the Integrity panel lists each weak tile's open sides with a button to jump to it",
    "Selecting a town, dock or Relay Beacon tints only the visible land it reaches, not the sea or the fog around it, on both maps",
    "On the 2D map, ungarrisoned territory now has a dashed outline, so owned land stands out from unclaimed land without relying on colour",
    "Integrity, Economy and Manpower panels stay tall enough to read on shorter screens"
  ]
};
