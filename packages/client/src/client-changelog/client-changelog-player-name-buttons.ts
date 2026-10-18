import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_PLAYER_NAME_BUTTONS: ClientChangelogEntry[] = [
  {
    createdAt: 1792320920363, // Date.now() frozen for this entry, as required by the changelog gate.
    introducedIn: "2026.10.18.2",
    title: "Player names in the Alliances tab show their colour and open their card",
    why: "On tablets and desktop, player names in the Alliances tab sat in pale grey boxes with light text and looked broken, there was no way to tell which empire on the map was which, and tapping a name did nothing.",
    changes: [
      "Player names in the Alliances tab now show as plain text on every screen size, not only on phones",
      "Each name has a dot in that player's map colour",
      "Tapping a name opens that player's card with their score, tiles, income and techs; tap it again to close it",
      "Manpower and player cards keep the same spacing on larger screens as on phones"
    ]
  }
];
