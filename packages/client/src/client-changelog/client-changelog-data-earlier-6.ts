// Older changelog entries split out of client-changelog-data.ts to keep that
// file under the 500-line cap. Entries are unordered — client-changelog.ts
// sorts the combined list by createdAt.
//
// Entries here are still bound by the "latest week only" rule enforced in
// client-changelog.test.ts. All entries previously in this file fell outside
// the trailing week and were pruned; left as an empty array (rather than
// deleting the file) since client-changelog-data.ts still imports and
// spreads it.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_6: ClientChangelogEntry[] = [];
