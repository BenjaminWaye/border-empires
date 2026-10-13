import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_DIPLOMACY_TILE_ACTION: ClientChangelogEntry[] = [
  {
    createdAt: 1791923940435, // Date.now() frozen for this entry, as required by the changelog gate.
    introducedIn: "2026.10.13.3",
    title: "One Diplomacy action on other players' tiles",
    why: "Pressing another player's tile only offered two separate truce lengths, never an alliance, and an ally's tile offered nothing at all.",
    changes: [
      "Offer Truce 12h and 24h are replaced by a single Diplomacy action that opens that player's card in the Alliances tab, where you can propose an alliance or a truce",
      "Diplomacy also appears on an ally's tile, and its subtitle shows where you stand: allied, truce active, request pending, or a request waiting for your answer",
      "A request waiting for your answer puts Diplomacy at the top of the tile's actions",
      "Break Truce stays on the tile while a truce is active, and is now also on the player's card in the Alliances tab"
    ]
  }
];
