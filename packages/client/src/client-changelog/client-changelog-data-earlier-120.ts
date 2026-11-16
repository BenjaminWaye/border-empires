import type { ClientChangelogEntry } from "./client-changelog-data.js";
import { TIMED_RESOURCE_TRADES_ENTRY } from "./client-changelog-resource-networks.js";
import { PLAYTEST_MAP_READABILITY_ENTRY } from "./client-changelog-playtest-map-readability.js";
import { WINS_AND_COSTS_EXPLAINED_ENTRY } from "./client-changelog-wins-and-costs-explained.js";
import { INCOME_WAR_CARDS_ENTRY } from "./client-changelog-income-war-cards.js";
import { SALVAGE_TRIBUTE_BALANCE_ENTRY } from "./client-changelog-salvage-tribute-balance.js";
import { SERVER_EXPLORED_MAP_ENTRY } from "./client-changelog-server-explored-map.js";

// Split out of client-changelog-data.ts to keep it under the line cap.
export const CLIENT_CHANGELOG_ENTRIES_EARLIER_120: ClientChangelogEntry[] = [
  { ...TIMED_RESOURCE_TRADES_ENTRY, createdAt: 1794762000000, },
  { ...PLAYTEST_MAP_READABILITY_ENTRY, createdAt: 1794817797219, },
  { ...WINS_AND_COSTS_EXPLAINED_ENTRY, createdAt: 1794818581757, },
  { ...INCOME_WAR_CARDS_ENTRY, createdAt: 1794819359958, },
  { ...SALVAGE_TRIBUTE_BALANCE_ENTRY, createdAt: 1794828701450, },
  { ...SERVER_EXPLORED_MAP_ENTRY, createdAt: 1794827574814, },
];
