import type { ClientChangelogEntry } from "./client-changelog-data.js";

// First-time player reviews 2026-11-21: the flight paid out only when it landed.
export const SCOUT_FIND_POPS_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.21",
  title: "Scout drone: finds pop as it flies",
  why: "A two-to-three minute flight showed nothing until the drone was home.",
  changes: [
    "What the drone spots pops over the map as it flies: \"+1 Town\", \"+3 Grain\"",
    "On the landing card, tap a find to fly the camera to it, ringed in gold; tap again for the next one"
  ]
};
