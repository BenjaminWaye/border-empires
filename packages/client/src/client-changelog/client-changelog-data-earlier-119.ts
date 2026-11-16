import type { ClientChangelogEntry } from "./client-changelog-data.js";
import { PLACE_ANOTHER_ENTRY } from "./client-changelog-place-another.js";
import { BEACON_CLAIMS_REACH_ENTRY } from "./client-changelog-beacon-claims-reach.js";

// Split out of client-changelog-data.ts to keep it under the line cap.
export const CLIENT_CHANGELOG_ENTRIES_EARLIER_119: ClientChangelogEntry[] = [
  { ...PLACE_ANOTHER_ENTRY, createdAt: 1794861771175, },
  { ...BEACON_CLAIMS_REACH_ENTRY, createdAt: 1794864280133, },
];
