// Older changelog entries split out of client-changelog-data.ts to keep that
// file under the 500-line cap. Entries are unordered — client-changelog.ts
// sorts the combined list by createdAt.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_52: ClientChangelogEntry[] = [];
  // Pruned (aged out of the 6-day rolling window): the Space View
  // Senate/Fleets/Settings tab-stacking fix (2026.09.08.05), the Shard
  // storage-cap removal (2026.09.08.4), and the Wonder-parts-cost-Shard
  // change (2026.09.08.3.5). "Fleets now take real build time..." was
  // dropped here earlier: also landed via a concurrent branch's own
  // earlier-50.ts split, so keeping both would have duplicated the entry
  // (and its createdAt) in the combined changelog.
