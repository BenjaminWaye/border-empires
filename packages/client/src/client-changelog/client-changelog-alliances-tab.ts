import type { ClientChangelogEntry } from "./client-changelog-data.js";
import { ALLIANCES_TAB_TRADE_SCREEN_CHANGELOG } from "./client-changelog-alliances-tab-trade-screen.js";
import { CLIENT_CHANGELOG_ENTRIES_ALLIANCE_TAB_REDESIGN } from "./client-changelog-alliance-tab-redesign.js";
import { CLIENT_CHANGELOG_ENTRIES_DIPLOMACY_TILE_ACTION } from "./client-changelog-diplomacy-tile-action.js";
import { CLIENT_CHANGELOG_ENTRIES_COMPACT_MET_PLAYERS } from "./client-changelog-compact-met-players.js";
import { CLIENT_CHANGELOG_ENTRIES_PLAYER_NAME_BUTTONS } from "./client-changelog-player-name-buttons.js";

// Every changelog entry about the Alliances tab, in one place so the main
// index (client-changelog-data.ts) stays under the 500-line cap.
export const ALLIANCES_TAB_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1793827094197, // Date.now() captured once for this entry.
    introducedIn: "2026.11.04",
    title: "War and Met labels in the Alliances tab",
    why: "Players you had met but had no truce or alliance with said \"No agreement\", which hid whether you were actually in a fight.",
    changes: [
      "In the Alliances tab, a met player now shows War while a battle with them is live, a muster flag of yours is engaged against their land, either side's land is within reach of the other's muster flag, or their flag is staged at your border",
      "War holds for 2 minutes after the last of those, like the war music, then goes back to Met",
      "Players you have a truce or alliance with never show War"
    ]
  },
  ...ALLIANCES_TAB_TRADE_SCREEN_CHANGELOG,
  ...CLIENT_CHANGELOG_ENTRIES_ALLIANCE_TAB_REDESIGN,
  ...CLIENT_CHANGELOG_ENTRIES_DIPLOMACY_TILE_ACTION,
  ...CLIENT_CHANGELOG_ENTRIES_COMPACT_MET_PLAYERS,
  ...CLIENT_CHANGELOG_ENTRIES_PLAYER_NAME_BUTTONS,
];
