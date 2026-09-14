// Older changelog entries split out of client-changelog-data.ts to keep that
// file under the 500-line cap. Entries are unordered — client-changelog.ts
// sorts the combined list by createdAt.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_56: ClientChangelogEntry[] = [
  {
    createdAt: 1788954702870, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.09.04",
    title: "Space View now greets first-time visitors with a briefing on what the galactic layer actually is",
    why: "Entering Space View for the first time dropped you straight into a 3D galaxy with a Senate button, a Fleets button, and no explanation of what any of it does, what Influence/Production are for, or how a raid works.",
    changes: [
      "First time you open Space View, a one-time \"📜 Voyager's Briefing\" explains what the galactic layer is, your Influence/Production economy, the Senate, Fleets, Garrison defense, and how to navigate the 3D map",
      "Dismissing it (or clicking outside the card) is remembered for good -- it won't show again on this or any other device you're signed into"
    ]
  }
];
