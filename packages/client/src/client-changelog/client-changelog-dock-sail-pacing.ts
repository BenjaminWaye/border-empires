import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const DOCK_SAIL_PACING_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1793807767561, // Date.now() captured for this entry.
    introducedIn: "2026.11.4.1",
    title: "Sea landings take their time",
    why: "Attacks launched from a dock showed the ship dashing across the sea in about a second, so you barely saw it arrive or the troops land.",
    changes: [
      "Ships now sail noticeably slower, and farther dock crossings take longer to arrive",
      "The troops land and the fight starts only once the ship has reached the beach"
    ]
  }
];
