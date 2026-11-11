import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const ZOOMED_OUT_PAN_PERF_CHANGELOG: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.09",
  why: "Dragging a zoomed-out 3D map could stall for a third of a second at a time.",
  title: "Smoother zoomed-out panning in 3D",
  changes: [
    "The 3D map refreshes its tiles less often while you drag or zoom, keeping the camera responsive.",
    "Hills and map names rebuild faster."
  ]
};
