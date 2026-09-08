// Split out of client-changelog-data.ts once it approached the 500-line cap.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_31: ClientChangelogEntry[] = [
  {
    createdAt: 1788674152352, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.06.03",
    title: "Click a player's name to open their profile",
    why: "There was no way to see another player's standing at a glance -- their rank, tiles, income, and diplomatic status with you were scattered across the leaderboard and alliance panels with no single place to check before allying or attacking.",
    changes: [
      "Any player's name (leaderboard, alliances) is now clickable and opens a profile card with their rank/tiles/income/techs, alliance/truce status with you, and an oathbreaker badge if they've broken a truce this season",
      "The oathbreaker badge and broken-truce list only show on your own profile for now -- other players' truce-break history isn't broadcast yet"
    ]
  },
  {
    createdAt: 1788783720884, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.07.04",
    title: "Fixed: Aether Bridge landing on empty land near another player silently did nothing",
    why: "The instant-claim fix shipped earlier today skipped claiming the landing tile whenever another player's reach happened to cover that spot -- even when the ground itself was genuinely unowned by anyone. Reported live: a bridge cast onto empty land near a rival's town resolved successfully but never claimed anything, with no error shown.",
    changes: [
      "Aether Bridge now claims a genuinely unowned landing tile regardless of whose reach covers it -- it only ever declines to claim a tile another player actually owns"
    ]
  },
  {
    createdAt: 1788792846751, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.07.05",
    title: "Fixed: dock income display and Fort placement on Harbor Exchange docks",
    why: "Two Harbor Exchange (Customs House) bugs. First, a dock's tile-menu \"Dock income\" line always showed a flat per-dock constant -- it never reflected the connected-dock bonus or the Harbor Exchange bonus that the simulation actually pays out, so owners had no way to see the real payoff of connecting docks or building a Harbor Exchange. Second, Fort (and Palisade) could not be built on a dock tile that already had an active Harbor Exchange -- it was rejected as \"tile already has structure\", even though a Fort is explicitly allowed to share a tile with a Relay Beacon and there's no design reason Harbor Exchange should be treated differently.",
    changes: [
      "The tile menu's Dock income line now reflects the connected-dock bonus and the Harbor Exchange bonus, instead of a flat constant that ignored both",
      "Fort and Palisade can now be built on a dock tile that already has an active Harbor Exchange (Customs House) -- they share the tile, same as Fort already does with a Relay Beacon"
    ]
  },
  {
    createdAt: 1788792989599, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.07.06",
    title: "Fixed: muster flag ADVANCE/MARCH ignored active Aether Bridges, and battle result popped up before the fight animation finished",
    why: "Reported live: three muster flags next to a connected Aether Bridge fired ADVANCE at enemy tiles 50 tiles away instead of the ones just across the bridge, and a MARCH target on the far side made the flags try to expand around the bridge looking for a land route instead of crossing it. Separately, the battle-result popup could appear -- sometimes declaring a loss to counter-attack -- while the walking-arrow/skirmish animation hadn't finished (or hadn't even started) playing.",
    changes: [
      "ADVANCE and MARCH auto-fire now route through your active Aether Bridges the same way manual attacks and dock crossings already do, instead of only ever searching plain adjacency through owned territory",
      "A MARCH flag's own neutral-tile EXPAND (claiming empty ground on the way to its target) no longer plays the skirmish/clash animation -- claiming empty land isn't a fight, so the marching arrow now just comes to rest on the tile",
      "The battle result banner now waits for the local walking-arrow/skirmish animation to actually finish before revealing a winner, instead of firing as soon as the server's combat timer elapsed"
    ]
  }
];
