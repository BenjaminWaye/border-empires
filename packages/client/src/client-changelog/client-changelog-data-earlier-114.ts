import type { ClientChangelogEntry } from "./client-changelog-data.js";
import { AUTO_RESOURCE_SWITCHES_CHANGELOG } from "./client-changelog-auto-resource-switches.js";
import { FRONTIER_MATERIALS_CUT_ENTRY } from "./client-changelog-frontier-materials-cut.js";
import { STRATEGIC_DEPOSIT_REACH_ENTRY } from "./client-changelog-strategic-deposit-reach.js";
import { DOCK_ART_ENTRY } from "./client-changelog-dock-art.js";
import { TOWN_REFINERIES_ENTRY } from "./client-changelog-town-refineries.js";

// Split out of client-changelog-data.ts to keep it under the line cap.
export const CLIENT_CHANGELOG_ENTRIES_EARLIER_114: ClientChangelogEntry[] = [
  ...AUTO_RESOURCE_SWITCHES_CHANGELOG,
  { ...FRONTIER_MATERIALS_CUT_ENTRY, createdAt: 1794520574739, },
  { ...STRATEGIC_DEPOSIT_REACH_ENTRY, createdAt: 1794522009490, },
  { ...DOCK_ART_ENTRY, createdAt: 1794521176798, },
  { ...TOWN_REFINERIES_ENTRY, createdAt: 1794522848705, },
];
