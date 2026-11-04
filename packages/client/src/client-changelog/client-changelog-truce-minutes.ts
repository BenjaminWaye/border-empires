import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const TRUCE_MINUTES_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1793742597679, // Date.now() captured once for this entry.
    introducedIn: "2026.11.03",
    title: "Truce countdown shows minutes",
    why: "A truce in its last hour just read \"1h\", so you couldn't tell whether it ended in 55 minutes or 5.",
    changes: [
      "In a truce's final hour, the rivals strip, Diplomacy list and tile panel count down in minutes (\"Truce 42m\")"
    ]
  }
];
