import type { ClientChangelogEntry } from "./client-changelog-data.js";
import { AUTO_RESOURCE_SWITCHES_CHANGELOG } from "./client-changelog-auto-resource-switches.js";
import { FRONTIER_MATERIALS_CUT_ENTRY } from "./client-changelog-frontier-materials-cut.js";

// Split out of client-changelog-data.ts to keep it under the line cap.
export const CLIENT_CHANGELOG_ENTRIES_EARLIER_114: ClientChangelogEntry[] = [
  ...AUTO_RESOURCE_SWITCHES_CHANGELOG,
  { ...FRONTIER_MATERIALS_CUT_ENTRY, createdAt: 1794520574739, },
];
