import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_ALLIANCE_TAB_REDESIGN: ClientChangelogEntry[] = [
  {
    createdAt: 1791923038120, // Date.now() frozen for this entry, as required by the changelog gate.
    introducedIn: "2026.10.13.2",
    title: "Alliances tab redesigned around who you've met",
    why: "The Alliances tab showed four empty sections and a free-text box even before you had met anyone, and let you propose to players you had never seen.",
    changes: [
      "Until you have seen another player's territory, the tab simply says you haven't met any other players yet",
      "Players you've met are listed with one-tap Propose Alliance and Truce 12h/24h buttons, replacing the name box",
      "Only sections with something in them are shown, led by requests that need your response, and each player appears once",
      "You can no longer propose an alliance or truce to a player you haven't met"
    ]
  }
];
