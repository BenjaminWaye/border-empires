import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const AI_RIVALS_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1793515772800, // Date.now() captured once for this entry.
    introducedIn: "2026.11.01",
    title: "Rival empires stop stalling",
    why: "AI empires misjudged their own coin income and some kept switching the same Relay Beacon off and on, so they sat idle for hours.",
    changes: ["AI empires plan around the coin they actually earn", "AI empires no longer flip a Relay Beacon off and on when Food slots are full"]
  }
];
