import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_COMPACT_MET_PLAYERS: ClientChangelogEntry[] = [
  {
    createdAt: 1791970793925, // Date.now() frozen for this entry, as required by the changelog gate.
    introducedIn: "2026.10.14.2",
    title: "Shorter list of players you've met",
    why: "Each player you'd met took up most of a phone screen with three large buttons, so a few dozen players meant a lot of scrolling in the Alliances tab.",
    changes: [
      "Players you've met are now one short line each: name, current agreement and a ▾ button",
      "Tap a player's line to show Propose Alliance and Truce 12h/24h (or Break Truce); opening another player closes the previous one",
      "Using Diplomacy on a tile opens that player's line with its buttons already showing",
      "Numbered names sort naturally (AI 2 before AI 10)"
    ]
  }
];
