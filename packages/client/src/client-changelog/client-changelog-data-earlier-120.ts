import type { ClientChangelogEntry } from "./client-changelog-data.js";
import { WINS_AND_COSTS_EXPLAINED_ENTRY } from "./client-changelog-wins-and-costs-explained.js";
import { PLAYTEST_MAP_READABILITY_ENTRY } from "./client-changelog-playtest-map-readability.js";
import { INCOME_WAR_CARDS_ENTRY } from "./client-changelog-income-war-cards.js";
import { MUSTER_PANEL_SIZE_ENTRY } from "./client-changelog-muster-panel-size.js";
import { ENCIRCLEMENT_POCKET_ENTRY } from "./client-changelog-encirclement-pocket.js";
import { SUPPLY_AGREEMENT_LIMIT_ENTRY, SUPPLY_AGREEMENT_LIMIT_OTHER_HOUSE_ENTRY } from "./client-changelog-supply-agreement-limit.js";

// Split out of client-changelog-data.ts to keep it under the line cap.
export const CLIENT_CHANGELOG_ENTRIES_EARLIER_120: ClientChangelogEntry[] = [
  { ...PLAYTEST_MAP_READABILITY_ENTRY, createdAt: 1794817797219, },
  { ...WINS_AND_COSTS_EXPLAINED_ENTRY, createdAt: 1794818581757, },
  { ...INCOME_WAR_CARDS_ENTRY, createdAt: 1794819359958, },
  { ...MUSTER_PANEL_SIZE_ENTRY, createdAt: 1794826419518, },
  { ...ENCIRCLEMENT_POCKET_ENTRY, createdAt: 1794826569677, },
  { ...SUPPLY_AGREEMENT_LIMIT_ENTRY, createdAt: 1794864414517, },
  { ...SUPPLY_AGREEMENT_LIMIT_OTHER_HOUSE_ENTRY, createdAt: 1794907264173, },
];
