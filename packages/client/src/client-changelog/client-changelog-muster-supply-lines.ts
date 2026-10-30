import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const MUSTER_SUPPLY_LINES_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1793225997250, // Date.now() captured once for this entry.
    introducedIn: "2026.10.28.4",
    title: "No more lines from muster flags on the 3D map",
    why: "The thin line from a muster flag to the tile it was attacking cluttered the 3D map, where the marching troops and target marker already show where the attack is going.",
    changes: [
      "On the 3D map, muster flags no longer draw a line to their attack target. The troops marching to the front and the target marker are unchanged.",
      "The 2D map keeps the line, since it has no marching troops or target marker to show the attack."
    ]
  }
];
