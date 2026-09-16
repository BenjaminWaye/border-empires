import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_60: ClientChangelogEntry[] = [
  {
    createdAt: 1789225435142, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.12.07",
    title: "Resolved battles no longer restart the run-in-from-the-tile-edge sequence after a skirmish",
    why: "The pre-resolution skirmish already shows both 7-soldier squads running in from the tile edge and settling into a firing line. Once combat actually resolved, the animation used to try to replay that same approach from scratch (with a timing hand-off from the skirmish that could also be dropped by an unrelated message-ordering race on the attacker's own client), so soldiers would visibly snap back to the tile edge and run in again right as the fight resolved.",
    changes: [
      "The resolved battle animation now always starts already standing at the firing line -- it no longer replays the run-in-from-the-tile-edge approach a moment after the skirmish just showed it"
    ]
  },
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
    createdAt: 1789225435140, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.12.05",
    title: "Great City/Metropolis's second support ring is back, properly cost-bounded this time",
    why: "The second ring was reverted twice for the same underlying reason: its extra cost was gated on \"does this player own a Great City/Metropolis anywhere,\" which -- once true -- widened every support-tile check for that player, including ones nowhere near the actual Great City. On a large, spread-out empire that meant thousands of oversized checks that had nothing to do with the town using the ring, which is what caused the last server slowdown. This time the cost is scoped to the tile actually being checked, not the player's whole empire.",
    changes: [
      "Great City and Metropolis towns draw support structures/tiles from a second ring again (24 tiles total instead of 8)",
      "Only a tile check that's actually near a Great City/Metropolis town pays the wider scan now -- a check anywhere else in a large empire (e.g. evaluating frontier tiles far from that town) costs the same as it would for a player with no wide-ring town at all"
    ]
  }
];
