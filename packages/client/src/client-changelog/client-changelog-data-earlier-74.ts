// Aged out of client-changelog-data.ts's "latest week" rolling window by a
// newer entry (see that file's header comment) -- kept here as an
// unreferenced historical record, not imported/spread anywhere.
import type { ClientChangelogEntry } from "./client-changelog.js";

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
  },
  {
    createdAt: 1789073087458, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.10.10",
    title: "Fixed the 3D map's selection-ring outline for a Great City/Metropolis town",
    why: "Selecting one of your own towns draws a highlighted outline around its support tiles on the true-3D map, distinct from the settle-tile hatch overlay. That outline was still hardcoded to the base 8-tile ring for every tier, so a Great City or Metropolis town's real second ring (its outer 16 tiles) never got the selection highlight even though those tiles do contribute to the town.",
    changes: [
      "A selected Great City or Metropolis town's 3D selection-ring outline now covers its full support ring (24 tiles), matching the settle-tile hatch overlay and every other support-ring consumer"
    ]
  },
  {
    createdAt: 1789050708101, // frozen, 1ms after the EXPAND claim-animation fix entry -- keeps ordering stable
    introducedIn: "2026.09.10.9",
    title: "Fixed a muster flag's auto-fired EXPAND showing no marching-company approach on the 3D map",
    why: "The server always computes a muster flag's mechanical travel-time delay the same way for an auto-fired ATTACK and EXPAND alike, but the gateway only ever forwarded it on the message ATTACK gets -- EXPAND has no equivalent message, so its only broadcast silently dropped the delay. The client-side code waiting on it was already correct and untouched by this fix; it simply never received the fields it needed, so a MARCH flag fighting through neutral ground on its way to a target showed no marching approach at all, only the claim-sweep animation (fixed separately) starting immediately.",
    changes: [
      "A muster flag's auto-fired EXPAND now shows the marching-company approach on the 3D map for the whole time its company is still traveling to the tile, matching what an auto-fired ATTACK already showed"
    ]
  },
  {
    createdAt: 1789050708100, // frozen, 1ms after the monument-announcement entry -- keeps ordering stable
    introducedIn: "2026.09.10.8",
    title: "Fixed a muster flag's auto-fired EXPAND showing no claim animation on the 3D map",
    why: "A muster flag's ADVANCE/MARCH auto-fired EXPAND (claiming neutral ground the flag fights through on its way to a march target, or the nearest open land for ADVANCE) is dispatched by the server, not by this client, so it never occupied the single 3D claim-animation slot that only ever tracked this client's own manually-dispatched claim. The marching-company travel animation already played correctly on the way there (fixed separately); once the flag actually started claiming the tile, though, the tile-filling sweep animation simply never appeared.",
    changes: [
      "A muster flag's auto-fired EXPAND now shows the same empire-color claim-sweep animation on the 3D map that a manually-dispatched EXPAND already showed, for the whole time the tile is being claimed",
      "Any number of a player's muster flags claiming neutral ground at once now each get their own claim animation, instead of only ever being able to show one at a time"
    ]
  },
  {
    createdAt: 1789050708099, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.10.7",
    title: "Added an announcement when a rival starts building a monument",
    why: "Monuments (Imperial Exchange, World Engine, Aegis Dome, Astral Dock, Population Bureau, Titanium Levy) are a season-unique, winner-takes-all race, but nobody knew a race had even started until someone finished it. Everyone now hears about it the moment ground actually breaks.",
    changes: [
      "Every player now gets an Activity Feed entry the moment any player's monument construction begins -- specifically, when the first of its 3 parts starts building, not when the intent is queued or when it finishes"
    ]
  },
  {
    createdAt: 1789118559125, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.11.01",
    title: "Great City's second support ring now becomes frontier immediately on upgrade",
    why: "Capturing a Town auto-claims its whole support ring as frontier the instant it settles, but upgrading a City to Great City -- which doubles the support ring outward to a second ring of tiles -- never did the same for that new ring. Those tiles sat as plain unowned ground until you happened to Frontier Expand onto them, at which point they'd start settling as if nothing unusual had happened.",
    changes: [
      "Upgrading a town to Great City (or beyond) now immediately claims its newly-eligible second support ring as frontier, matching what a Town capture's support ring already does -- no more waiting on a manual Frontier Expand to make those tiles behave normally"
    ]
  }
];
