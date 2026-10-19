import type { ClientChangelogEntry } from "./client-changelog-data.js";
import { ALLIANCES_TAB_TRADE_SCREEN_CHANGELOG } from "./client-changelog-alliances-tab-trade-screen.js";
import { CLIENT_CHANGELOG_ENTRIES_ALLIANCE_TAB_REDESIGN } from "./client-changelog-alliance-tab-redesign.js";
import { CLIENT_CHANGELOG_ENTRIES_DIPLOMACY_TILE_ACTION } from "./client-changelog-diplomacy-tile-action.js";
import { CLIENT_CHANGELOG_ENTRIES_COMPACT_MET_PLAYERS } from "./client-changelog-compact-met-players.js";
import { CLIENT_CHANGELOG_ENTRIES_PLAYER_NAME_BUTTONS } from "./client-changelog-player-name-buttons.js";

// Every changelog entry about the Alliances tab, in one place so the main
// index (client-changelog-data.ts) stays under the 500-line cap.
export const ALLIANCES_TAB_CHANGELOG: ClientChangelogEntry[] = [
  ...ALLIANCES_TAB_TRADE_SCREEN_CHANGELOG,
  ...CLIENT_CHANGELOG_ENTRIES_ALLIANCE_TAB_REDESIGN,
  ...CLIENT_CHANGELOG_ENTRIES_DIPLOMACY_TILE_ACTION,
  ...CLIENT_CHANGELOG_ENTRIES_COMPACT_MET_PLAYERS,
  ...CLIENT_CHANGELOG_ENTRIES_PLAYER_NAME_BUTTONS,
];
