// Older changelog entries split out of client-changelog-data.ts to keep that
// file under the 500-line cap. Entries are unordered — client-changelog.ts
// sorts the combined list by createdAt.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_56: ClientChangelogEntry[] = [];
  // Pruned (aged out of the 6-day rolling window): "Space View now greets
  // first-time visitors with a briefing on what the galactic layer actually
  // is" (2026.09.09.04).
