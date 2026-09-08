// Older changelog entries split out of client-changelog-data.ts to keep that
// file under the 500-line cap. Entries are unordered — client-changelog.ts
// sorts the combined list by createdAt.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_32: ClientChangelogEntry[] = [
  {
    createdAt: 1788674152352, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.06.03",
    title: "Click a player's name to open their profile",
    why: "There was no way to see another player's standing at a glance -- their rank, tiles, income, and diplomatic status with you were scattered across the leaderboard and alliance panels with no single place to check before allying or attacking.",
    changes: [
      "Any player's name (leaderboard, alliances) is now clickable and opens a profile card with their rank/tiles/income/techs, alliance/truce status with you, and an oathbreaker badge if they've broken a truce this season",
      "The oathbreaker badge and broken-truce list only show on your own profile for now -- other players' truce-break history isn't broadcast yet"
    ]
  }
];
