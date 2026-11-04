import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const TOWN_SCREEN_AUTO_GARRISON_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1793825789000, // Date.now() captured once for this entry.
    introducedIn: "2026.11.04",
    title: "Auto-garrison checkbox on the town screen",
    why: "Selecting a town's support tile showed a Garrison button with no way to turn on automatic garrisoning.",
    changes: ["The town screen's Garrison button now has the same \"garrison automatically from now on\" checkbox as the tile panel."]
  }
];
