import type { ClientChangelogEntry } from "./client-changelog-data.js";
import { WAYSTATION_FORT_MODULE_ENTRY } from "./client-changelog-waystation-fort-module.js";
import { READABLE_REALM_NAMES_ENTRY } from "./client-changelog-readable-realm-names.js";
import { RELIC_REVEAL_ENTRY } from "./client-changelog-relic-reveal.js";

// Split out of client-changelog-data.ts to keep it under the line cap.
export const CLIENT_CHANGELOG_ENTRIES_EARLIER_112: ClientChangelogEntry[] = [
  { ...WAYSTATION_FORT_MODULE_ENTRY, createdAt: 1794394297385, },
  { ...READABLE_REALM_NAMES_ENTRY, createdAt: 1794410558462, },
  { ...RELIC_REVEAL_ENTRY, createdAt: 1794422720232, },
];
