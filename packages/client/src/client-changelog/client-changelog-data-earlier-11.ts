// Older changelog entries split out of client-changelog-data.ts to keep that
// file under the 500-line cap. Entries are unordered — client-changelog.ts
// sorts the combined list by createdAt.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

// All entries previously here have aged out of the 6-day rolling window
// (see client-changelog.test.ts's "keeps only the latest week" check) and
// were removed. Kept as an empty export rather than deleting the file/import
// wiring, since another agent may still be mid-edit on a sibling entry.
export const CLIENT_CHANGELOG_ENTRIES_EARLIER_11: ClientChangelogEntry[] = [];
