import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_26: ClientChangelogEntry[] = [
  {
    createdAt: 1788726356653, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.06.09",
    title: "Tile owner names are now clickable too, and player profiles show active alliances and truces",
    why: "A foreign-owned tile's name in the tile overview only opened a profile card if that player happened to be an ally or a Founding Engineer -- everyone else's name was plain text. Separately, a player's profile card had no way to see who they're currently allied or at truce with, only your own relationship to them.",
    changes: [
      "Any foreign-owned tile's owner name in the tile overview now opens their profile card, not just allies'",
      "Any player's profile now shows their current Active Alliances and Active Truces for this season"
    ]
  },
  {
    createdAt: 1788762481509, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.07.02",
    title: "Reverted: clicking land next to a connected dock no longer attempts an expand that always fails",
    why: "A recent change let clicking a neutral tile adjacent to (not exactly on) a connected dock instantly attempt to claim it, matching how a plain bordering tile behaves. But a dock crossing is only ever allowed to land on the dock tile itself -- you have to capture the dock before claiming land beyond it, a rule enforced server-side and by the AI's own planner. The server always rejected these adjacent-tile attempts, so the change just replaced the useful tile menu with a claim that silently failed.",
    changes: [
      "Clicking a neutral tile merely adjacent to a connected dock opens its tile menu again instead of attempting a claim the server would reject",
      "Clicking the dock tile itself is unaffected and still claims it directly"
    ]
  }
];
