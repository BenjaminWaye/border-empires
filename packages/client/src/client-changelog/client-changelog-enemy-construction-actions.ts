import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_ENEMY_CONSTRUCTION_ACTIONS: ClientChangelogEntry[] = [
  {
    createdAt: 1790773392000, // frozen Date.now() value for this release
    introducedIn: "2026.09.30.7",
    title: "No more cancel or rush-buy buttons on enemy construction",
    why: "Clicking an enemy tile that was mid-construction showed \"Cancel construction\" and a rush-buy button, which you can't actually use on someone else's building.",
    changes: [
      "Enemy tiles under construction or removal now show just the timer and progress, without cancel or rush-buy buttons"
    ]
  }
];
