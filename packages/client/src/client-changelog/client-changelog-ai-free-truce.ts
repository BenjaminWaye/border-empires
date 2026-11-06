import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const AI_FREE_TRUCE_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1793962398137, introducedIn: "2026.11.06",
    title: "AI peace offers you can accept",
    why: "An AI could offer a free truce, then reject its own offer when you accepted after logging in.",
    changes: ["Free AI truce offers now keep their offered terms until they expire or your empires fight again."]
  }
];
