// Older client-changelog entries, split out of client-changelog-data.ts to keep
// that file under the repo's 500-line cap (see the comment at its top). Same
// shape and rules apply here: unordered, append-only, frozen createdAt literals.
// client-changelog-data.ts merges this array into CLIENT_CHANGELOG_ENTRIES.
//
// Entries here are still bound by the "latest week only" rule enforced in
// client-changelog.test.ts — this file exists purely to keep
// client-changelog-data.ts under its line cap when the current week has a lot
// of entries, not as a permanent archive. Prune entries here once they fall
// outside the trailing week, same as in client-changelog-data.ts.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

// Every entry that used to live here fell outside the rolling 6-day window
// and was pruned (see the file's top-of-file rule). Kept as an empty export
// so client-changelog-data.ts's import doesn't need touching every time this
// file empties out.
export const CLIENT_CHANGELOG_ENTRIES_EARLIER: ClientChangelogEntry[] = [];
