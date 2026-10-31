import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const STORM_EDGE_BANDING_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1793287622004, // Date.now() captured once for this entry.
    introducedIn: "2026.10.29.2",
    title: "Unbroken brass edge on the unexplored border",
    why: "On some phones the brass line around unexplored territory broke into offset segments in the 3D map.",
    changes: ["The brass edge and storm clouds at the unexplored border now draw as one continuous line on mobile GPUs."]
  }
];
