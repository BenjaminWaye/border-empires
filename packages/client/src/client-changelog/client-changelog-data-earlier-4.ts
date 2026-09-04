// Older client-changelog entries, split out of client-changelog-data.ts to keep
// that file under the repo's 500-line cap (see the comment at that file's top).
// Same shape and rules apply here: unordered, append-only, frozen createdAt
// literals.
//
// Entries here are still bound by the "latest week only" rule enforced in
// client-changelog.test.ts — this file exists purely to keep the other
// changelog data files under their line cap when the trailing week has a lot
// of entries, not as a permanent archive. Prune entries here once they fall
// outside the trailing week, same as in the other files.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_4: ClientChangelogEntry[] = [
  {
    createdAt: 1788128033639, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.31",
    title: "Renamed the Observatory and Ambaric Tower",
    why: "Two structure names were due for a refresh to better fit the empire's aether/power theming.",
    changes: [
      "The Observatory is now called the Aether Tower everywhere in the UI (build menu, tile overview, tech unlocks, upkeep) -- no change to what it does",
      "The Ambaric Tower is now called the Ambaric Transformer Station everywhere in the UI -- no change to what it does"
    ]
  },
  {
    createdAt: 1788162346509, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.31",
    title: "Fixed a fake \"plundered FOOD\" notice on town captures",
    why: "Capturing a settled FARM/FISH tile always showed a \"Plundered 1 FOOD\" line in the combat alert, but plunder has only ever transferred gold -- no food was ever actually taken from the defender or given to the attacker.",
    changes: [
      "Combat/raid alerts no longer show a fake FOOD plunder amount when capturing a resource tile -- plunder remains gold-only, matching what actually happens to both players' stockpiles"
    ]
  },
  {
    createdAt: 1788162890008, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.31.1",
    title: "Fixed a town's full tile detail sometimes showing stale data right after opening it",
    why: "Opening a tile's full detail (or the debug download tool) reused the same \"only send what changed\" logic as the regular live tile updates -- so if nothing else about the tile had changed since the last regular update, fields like a town's bonus modifiers were silently left out of the response, and the client kept showing whatever it already had cached, which could be out of date.",
    changes: [
      "Opening a tile's full detail now always fetches the complete, current data instead of a partial update that can omit fields nothing else recently touched"
    ]
  },
  {
    createdAt: 1788088074612, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.30.2",
    title: "The Overall leaderboard now shows each empire's manpower cap",
    why: "The leaderboard's Overall row showed score, settled tiles, income, and tech count but nothing about manpower capacity, so you couldn't compare your army ceiling against rivals without opening their empire directly.",
    changes: [
      "Each row in the Overall leaderboard now lists a \"manpower cap\" figure alongside score, settled tiles, income, and tech count"
    ]
  },
  {
    createdAt: 1788107095722, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.30.4",
    title: "Aether Purge and Aether EMP no longer offer to target allied tiles",
    why: "The tile-action menu only checked whether a tile was your own before offering Aether Purge or Aether EMP, so an allied empire's tile looked like a valid, enabled target -- clicking it just got silently rejected by the server with a confusing \"target hostile settled or frontier land\" error, since allies were never actually strikeable.",
    changes: [
      "Aether Purge and Aether EMP now show as disabled with a \"Cannot purge/EMP your own or allied tiles\" reason when selecting an allied tile, instead of appearing available and then failing server-side"
    ]
  },
  {
    createdAt: 1788175437827, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.31.3",
    title: "Fixed the Launch Attack win chance disappearing while you were reading it",
    why: "The win-chance calculation and \"how this is calculated\" breakdown were cached for only 5 seconds. Leaving an enemy tile's menu open past that -- while reading the math, or just deciding -- meant the next routine tile update silently re-rendered the panel against an expired cache, so the win chance and breakdown just vanished even though nothing about the battle odds had changed.",
    changes: [
      "The Launch Attack panel now quietly refreshes its win chance in the background while it's open on an enemy tile, so the calculation and breakdown stay visible instead of disappearing every few seconds"
    ]
  }
];
