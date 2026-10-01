import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_SMALLER_TREES: ClientChangelogEntry[] = [
  {
    createdAt: 1790824885550,
    introducedIn: "2026.10.01.1",
    title: "Forests no longer tower over mountains",
    why: "Trees in the 3D map stood taller than the mountains, so forests looked out of scale next to mountain ranges.",
    changes: [
      "3D trees, including tropical palms, are now about half the height of a mountain",
      "Forest tiles now hold 7 to 9 smaller trees instead of 5, so forests still look full"
    ]
  }
];
