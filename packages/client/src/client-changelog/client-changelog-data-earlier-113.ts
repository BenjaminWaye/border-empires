import type { ClientChangelogEntry } from "./client-changelog-data.js";
import { FORT_SIEGE_TIER_PICKER_ENTRY } from "./client-changelog-fort-siege-tiers.js";
import { AFC_CAPTURE_NO_DROP_ENTRY } from "./client-changelog-afc-capture-no-drop.js";
import { DIPLOMACY_DEALS_CHANGELOG } from "./client-changelog-diplomacy-deals.js";
import { SCIFI_ROADS_ENTRY } from "./client-changelog-scifi-roads.js";

// Split out of client-changelog-data.ts to keep it under the line cap.
export const CLIENT_CHANGELOG_ENTRIES_EARLIER_113: ClientChangelogEntry[] = [
  { ...FORT_SIEGE_TIER_PICKER_ENTRY, createdAt: 1794418877252, },
  { ...AFC_CAPTURE_NO_DROP_ENTRY, createdAt: 1794437873725, },
  ...DIPLOMACY_DEALS_CHANGELOG,
  { ...SCIFI_ROADS_ENTRY, createdAt: 1794519394469, },
];
