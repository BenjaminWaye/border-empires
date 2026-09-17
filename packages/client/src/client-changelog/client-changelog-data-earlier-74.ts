// Archived older changelog entries, split out of client-changelog-data.ts to
// keep it under the 500-line cap. See that file's header comment.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_74: ClientChangelogEntry[] = [
  {
    createdAt: 1789121341436, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.11.03",
    title: "The buildings menu now shows a Wonder part's Shard cost, not just its manpower cost",
    why: "Wonder parts started costing 1 Shard each (2026.09.08.3.5), but the buildings menu's cost line only ever read gold and manpower -- it never displayed Shard at all, so every Wonder part silently showed just its manpower cost with no mention of the Shard it also requires. (An earlier version of this fix also tried to show Food/Titanium/Crystal/Umbrite build costs the same way, but those four are vestigial numbers left over from before the resource-slot rewrite and are never actually charged -- only Shard is still a real, enforced stockpile spend -- so that part was reverted before it reached players.)",
    changes: [
      "A structure with a Shard build cost now shows that cost in the buildings menu alongside gold/manpower",
      "Wonder parts now correctly show \"1 shard\" and finished Wonders show \"2 shard\" in their cost line"
    ]
  },
  {
    createdAt: 1789121341435, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.11.02",
    title: "AI empires no longer clutter their own territory with redundant Relay Beacons",
    why: "AI-controlled empires were building Relay Beacons on tiles already deep inside another beacon's coverage, sometimes tiling an entire base with them, because a candidate site only needed to scrape a sliver of positive score from unexplored fog, plain land, or even an enemy's own tiles at the far edge of its scan radius -- including fog over permanent ocean that could never reveal anything, and enemy land a beacon can never actually claim (only ATTACK captures owned ground).",
    changes: [
      "AI no longer builds a Relay Beacon on ground already covered by one of its own towns, docks, or other beacons unless that site also reaches a genuinely new, valuable tile (a town, resource, dock, or natural wonder)",
      "Unexplored tiles that are actually permanent ocean no longer count toward a beacon site's score -- only fog that might plausibly hide real land does",
      "Another player's owned land no longer counts toward a beacon site's score -- a beacon can never claim owned ground, so only genuinely unowned land is credited"
    ]
  }
];
