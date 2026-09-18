// Archived older changelog entries, split out of client-changelog-data.ts to
// keep it under the 500-line cap. See that file's header comment.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_78: ClientChangelogEntry[] = [
  {
    createdAt: 1789549757916, // frozen, newer than every existing entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.17.2",
    title: "Auto-settle now starts the instant a tile qualifies, instead of waiting up to 30 seconds",
    why: "The previous fix (2026.09.17.1) cached the auto-settle queue instead of rebuilding it from scratch, but every cache rebuild still re-scanned every one of a player's frontier tiles, including a wide town-support scan for tiles already known not to qualify. That kept a steady, avoidable cost on the server for large empires. Auto-settle now tracks eligibility directly at the moment it can actually change -- claiming a tile, a town growing a tier, a town changing hands, or a relevant tech finishing research -- instead of periodically re-checking everything.",
    changes: [
      "A tile that qualifies for free auto-settle (already inside your border, next to a big-enough town, or newly tech-revealed) now starts settling the same instant it qualifies, if a settle slot is free, instead of up to 30 seconds later",
      "When a settle finishes and frees up a slot, the next eligible tile now starts immediately instead of waiting for the next automation pass",
      "No other change to auto-settle's cost, manpower, or timing once started"
    ]
  }
];
