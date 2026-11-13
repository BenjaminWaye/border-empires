import type { ClientChangelogEntry } from "./client-changelog-data.js";
import { FORT_SIEGE_TIER_PICKER_ENTRY } from "./client-changelog-fort-siege-tiers.js";
import { AFC_CAPTURE_NO_DROP_ENTRY } from "./client-changelog-afc-capture-no-drop.js";
import { DIPLOMACY_DEALS_CHANGELOG } from "./client-changelog-diplomacy-deals.js";
import { RELIC_CLEAR_SITE_ENTRY } from "./client-changelog-relic-clear-site.js";
import { LANDMARK_SUPER_TILE_ENTRY } from "./client-changelog-landmark-super-tile.js";

// Split out of client-changelog-data.ts to keep it under the line cap.
export const CLIENT_CHANGELOG_ENTRIES_EARLIER_113: ClientChangelogEntry[] = [
  { ...FORT_SIEGE_TIER_PICKER_ENTRY, createdAt: 1794418877252, },
  { ...AFC_CAPTURE_NO_DROP_ENTRY, createdAt: 1794437873725, },
  ...DIPLOMACY_DEALS_CHANGELOG,
  { ...RELIC_CLEAR_SITE_ENTRY, createdAt: 1794519247645, },
  { ...LANDMARK_SUPER_TILE_ENTRY, createdAt: 1794561227674, },
];
