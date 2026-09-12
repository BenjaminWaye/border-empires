// Older changelog entries split out of client-changelog-data.ts to keep that
// file under the 500-line cap. Entries are unordered — client-changelog.ts
// sorts the combined list by createdAt.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

// Entries that aged out of the rolling 6-day window (see client-changelog.
// test.ts's "keeps only the latest week of entries" check) are deleted here,
// not archived -- this file's job is only the 500-line split, not history.
export const CLIENT_CHANGELOG_ENTRIES_EARLIER_41: ClientChangelogEntry[] = [];
