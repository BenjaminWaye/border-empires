import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const DEV_SLOT_PROGRESS_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1793308645370, // Date.now() captured once for this entry.
    introducedIn: "2026.10.29.3",
    title: "Dev slot progress bars fill steadily",
    why: "Progress bars for buildings in the Dev slots list jumped back to empty every few seconds instead of filling up.",
    changes: [
      "Build and removal progress bars in Dev slots and the development panel now fill steadily from start to finish.",
      "A build paused by an attack keeps its timer still in Dev slots instead of counting down and jumping back.",
      "Queued garrisons and builds no longer show their coordinates twice."
    ]
  }
];
