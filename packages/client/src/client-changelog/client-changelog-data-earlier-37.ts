// Older changelog entries split out of client-changelog-data.ts to keep that
// file under the 500-line cap. Entries are unordered — client-changelog.ts
// sorts the combined list by createdAt.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_37: ClientChangelogEntry[] = [];
  // Pruned (aged out of the 6-day rolling window, client-changelog.test.ts
  // "keeps only the latest week of entries"): the "Researching Grand
  // Bazaars... unlocks the Ambaric Transformer Station" entry, the MARCH
  // neutral-ground-claim fix (2026.09.04.5), the Aether Tower description fix,
  // the captured-structure auto-settle change (both 2026.09.04.12), and the
  // Great-Cities-second-build-ring / population-tier-bonus-halving entry
  // (2026.09.09.07).
