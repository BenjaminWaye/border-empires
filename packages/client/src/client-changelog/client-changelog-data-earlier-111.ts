import type { ClientChangelogEntry } from "./client-changelog-data.js";
import { FRONTIER_MAP_NAMES_ENTRY } from "./client-changelog-frontier-map-names.js";
import { WAYSTATION_CAPTURE_ENTRY } from "./client-changelog-waystation-capture.js";
import { TOWN_LIST_BUILD_SLOTS_ENTRY } from "./client-changelog-town-list-build-slots.js";
import { NEXT_CONTEST_ENTRY } from "./client-changelog-next-contest.js";
import { SECTOR_BOARD_ENTRY } from "./client-changelog-nov-10.js";

// Split out of client-changelog-data.ts to keep it under the line cap.
export const CLIENT_CHANGELOG_ENTRIES_EARLIER_111: ClientChangelogEntry[] = [
  { ...NEXT_CONTEST_ENTRY, createdAt: 1794337809927, },
  { ...SECTOR_BOARD_ENTRY, createdAt: 1794268104791, },
  { ...WAYSTATION_CAPTURE_ENTRY, createdAt: 1794342387101, },
  { ...FRONTIER_MAP_NAMES_ENTRY, createdAt: 1794312655623, },
  { ...TOWN_LIST_BUILD_SLOTS_ENTRY, createdAt: 1794383457964, },
];
