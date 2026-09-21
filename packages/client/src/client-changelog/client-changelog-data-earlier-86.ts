import type { ClientChangelogEntry } from "./client-changelog-data.js";

// Aged out of the "latest week" rolling window by newer entries merged in from
// another branch. Not imported/spread into client-changelog-data.ts -- kept
// here only as a historical record, per the header comment there.
export const CLIENT_CHANGELOG_ENTRIES_EARLIER_86: ClientChangelogEntry[] = [
  {
    createdAt: 1789225435141, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.12.06",
    title: "Attacking an undefended frontier tile is now an instant capture, no battle",
    why: "Frontier (claimed but unsettled) land has always had zero defense in the combat math, so an ATTACK on it was already an effectively guaranteed win -- but it still played the full march/clash/rout battle animation and ran a (near-100%) combat roll as if there were a real fight to lose. There isn't: nothing was ever actually contested.",
    changes: [
      "Attacking an enemy's undefended frontier tile now captures it outright with no combat roll -- there is no chance of losing to a tile that was never defended",
      "That capture plays the same expansion-style \"claiming this land\" animation EXPAND uses, instead of the battle skirmish/clash overlay, on both the 3D and 2D map renderers",
      "Attacking a settled (defended) tile is unchanged -- full combat still applies there"
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
