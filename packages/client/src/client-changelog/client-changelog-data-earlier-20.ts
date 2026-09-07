// Older changelog entries split out of client-changelog-data.ts to keep that
// file under the 500-line cap. Entries are unordered — client-changelog.ts
// sorts the combined list by createdAt.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

// Pruned: this array's one entry (Space View 3D galaxy screen launch,
// 2026.09.01.1) aged out of the "keeps only the latest week of entries"
// window (client-changelog.test.ts) as real time advanced. Kept as an empty
// export rather than deleting the module, since other changelog-data files
// still import/spread it by name.
export const CLIENT_CHANGELOG_ENTRIES_EARLIER_20: ClientChangelogEntry[] = [];
