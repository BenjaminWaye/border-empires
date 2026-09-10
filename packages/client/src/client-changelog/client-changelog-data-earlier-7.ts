// Older changelog entries split out of client-changelog-data.ts to keep that
// file under the 500-line cap. Entries are unordered — client-changelog.ts
// sorts the combined list by createdAt.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

// Both entries previously here have aged out of the 6-day rolling window
// (client-changelog.test.ts "keeps only the latest week of entries") and
// were pruned. Kept as an empty export so client-changelog-data.ts's import
// doesn't need touching every time this file empties out.
export const CLIENT_CHANGELOG_ENTRIES_EARLIER_7: ClientChangelogEntry[] = [];
