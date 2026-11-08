import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CONNECTED_DISTRICTS_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1792870664672, // Date.now() captured once when this entry was created.
    introducedIn: "2026.10.24.1",
    title: "Towns and their support buildings now form connected districts",
    why: "Town industries and services now share a consistent architectural style and show which town they serve.",
    changes: [
      "Support buildings and Project preparations have been remodeled on matching marble platforms, with shared brass detailing and distinct machinery.",
      "Service connections follow the town's actual support assignments, including second-ring plots, terrain and overlapping towns. Connections are visual and do not change building costs or bonuses.",
      "The 2D fallback has matching building artwork and service links. Construction, inactive buildings and existing saved structures retain their normal behavior."
    ]
  }
];
