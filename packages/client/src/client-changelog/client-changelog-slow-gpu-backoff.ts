import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const SLOW_GPU_BACKOFF_ENTRY: ClientChangelogEntry = {
  createdAt: 1795866873262, // Date.now() captured once for this entry.
  introducedIn: "2026.11.28",
  title: "3D map backs off on phones it overwhelms",
  why: "On some phones the 3D map asked the graphics chip for more than it could draw, so the whole game stalled for a third of a second at a time, taps and all.",
  changes: [
    "If the 3D map keeps running below 10 frames a second, it now drops to a lighter picture (lower resolution, no shadows) instead of staying slow",
    "The phone remembers this for a week, so the next load starts light",
    "If 3D is still slow after that, you are offered the 2D map as before"
  ]
};
