import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const ACTIVITY_RESTART_WINDOW_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1792699612331, // Date.now() captured once for this entry.
    introducedIn: "2026.10.22.2",
    title: "Your activity keeps its full day after server updates",
    why: "Each server restart kept only the newest few thousand events from the whole world, so on busy days Yours lost everything older than a few hours.",
    changes: [
      "Yours and World Pulse keep the full last 24 hours of activity through server restarts and updates"
    ]
  }
];
