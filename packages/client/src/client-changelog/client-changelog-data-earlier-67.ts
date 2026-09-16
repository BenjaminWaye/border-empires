// Archived older changelog entries, split out of client-changelog-data.ts to
// keep it under the 500-line cap. See that file's header comment.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_67: ClientChangelogEntry[] = [
  // "Fixed a failed attack's tile-flip sometimes showing as unowned until
  // you reselected it" (createdAt 1789019366000, 2026.09.10.6) aged out of
  // the "latest week" rolling window once the hill-shape/frontier-reach
  // entries landed -- see git history for the original entry text.
  // Its 3 sibling entries here (EXPAND approach/claim-animation fixes,
  // monument announcement) moved to client-changelog-data-earlier-68.ts
  // instead of duplicating them in both files.
];
