// Changelog entry data only, split out from client-changelog.ts (rendering/
// visibility) to keep that file under the 500-line cap. Entries are unordered —
// client-changelog.ts sorts by createdAt. Move old entries to
// client-changelog-data-earlier.ts when this file approaches the cap.
import { CLIENT_CHANGELOG_ENTRIES_EARLIER } from "./client-changelog-data-earlier.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_2 } from "./client-changelog-data-earlier-2.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_3 } from "./client-changelog-data-earlier-3.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_4 } from "./client-changelog-data-earlier-4.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_5 } from "./client-changelog-data-earlier-5.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_7 } from "./client-changelog-data-earlier-7.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_10 } from "./client-changelog-data-earlier-10.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_11 } from "./client-changelog-data-earlier-11.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_14 } from "./client-changelog-data-earlier-14.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_16 } from "./client-changelog-data-earlier-16.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_17 } from "./client-changelog-data-earlier-17.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_18 } from "./client-changelog-data-earlier-18.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_20 } from "./client-changelog-data-earlier-20.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_22 } from "./client-changelog-data-earlier-22.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_24 } from "./client-changelog-data-earlier-24.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_26 } from "./client-changelog-data-earlier-26.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_27 } from "./client-changelog-data-earlier-27.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_28 } from "./client-changelog-data-earlier-28.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_29 } from "./client-changelog-data-earlier-29.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_30 } from "./client-changelog-data-earlier-30.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_31 } from "./client-changelog-data-earlier-31.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_32 } from "./client-changelog-data-earlier-32.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_33 } from "./client-changelog-data-earlier-33.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_34 } from "./client-changelog-data-earlier-34.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_36 } from "./client-changelog-data-earlier-36.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_37 } from "./client-changelog-data-earlier-37.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_41 } from "./client-changelog-data-earlier-41.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_42 } from "./client-changelog-data-earlier-42.js";
export type ClientChangelogEntry = {
  createdAt: number; // Unix ms. Use a frozen literal (check:client-changelog rejects Date.now()).
  introducedIn: string;
  title: string;
  why: string;
  changes: string[];
};
// Add a new entry for every user-facing client release; client-changelog.ts sorts by createdAt.
const RECENT_CLIENT_CHANGELOG_ENTRIES: ClientChangelogEntry[] = [
  {
    createdAt: 1789255054252, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.13.1",
    title: "Fixed a defended tile briefly flashing neutral when you attacked it",
    why: "A tile you attacked (or that had an active attack lock on it, as either side) could render as unowned/neutral for a split second, even though it never actually changed hands -- most reliably reproduced on a failed/repelled attack against an already-owned, defended tile. Two separate server code paths were building a tile update that omitted ownerId/ownershipState instead of including their real (unchanged) values, which the client always reads as an explicit ownership clear.",
    changes: [
      "A tile visible to you only because you have an active attack lock on it now still reports its real owner instead of stripping ownership info entirely",
      "A repelled attack against a defended tile no longer sends a battle-effect update that omits the tile's ownership, which was momentarily flashing it neutral client-side"
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
    createdAt: 1789114974044, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.11.01",
    title: "Halved EXPAND (frontier claim) time",
    why: "Claiming a neutral tile felt slow relative to how often players expand, especially early game.",
    changes: [
      "EXPAND now takes 7.5s on plain land instead of 15s",
      "Forest and hills tiles keep their same 1.5x multiplier, so they now take 11.25s instead of 22.5s"
    ]
  },
  {
    createdAt: 1789114531477, // frozen, 1s after the muster-flag-reuse entry -- keeps ordering stable
    introducedIn: "2026.09.11.2",
    title: "A monument's unlock tech now shows \"already built\" once it's claimed",
    why: "Each monument (Imperial Exchange/World Engine/Aegis Dome/Astral Dock/Population Bureau/Titanium Levy) can only ever be completed once per season, and the build command already rejected a second attempt -- but the tech tree kept offering the monument's unlock tech to research for free, gold-and-resources spent, with no way to tell it had become pointless the moment someone else's assembly finished.",
    changes: [
      "A monument's unlock tech is removed from research choices for every player who doesn't already have it as soon as that monument is completed by anyone",
      "The tech tree, tech detail panel, and research command now show \"monument already built this season\" instead of a misleading \"ready to unlock\" or generic locked state"
    ]
  },
  {
    createdAt: 1789114530477, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.11.01",
    title: "Launch Attack now prefers reusing a nearby muster flag over staging a new one",
    why: "Launching an attack with no fully-funded flag right next to the target used to auto-create a brand new muster flag even when an existing owned flag was just a few tiles away but under-staffed -- and if the player was already at their muster-flag cap, that create was silently rejected server-side and only discovered 5 seconds later, cancelling the attack.",
    changes: [
      "An attack with no fully-funded flag nearby now first looks for any owned, unreserved flag already within remote-funding range (or touching the target), even if it isn't fully staffed yet, and reroutes the attack onto it instead of staging a new flag",
      "If the player is already at their muster-flag cap and no existing flag is usable, the attack is now cancelled immediately with a clear \"Muster flags full\" message, instead of silently requesting a doomed new flag and waiting 5 seconds to find out it was rejected",
      "The muster-flag cap shown in that message (and in the equivalent MUSTER_LIMIT fallback message) now reflects the player's real cap, including tech/domain/wonder bonuses, instead of a hardcoded \"max 3\""
    ]
  },
  {
    createdAt: 1789073088458, // frozen, 1s after the selection-ring-outline entry -- keeps ordering stable without widening the "latest week" bundle window past older earlier-N entries
    introducedIn: "2026.09.11.1",
    title: "Fixed queued waypoints past #20 showing no map marker",
    why: "The waypoint queue's map overlay (a flag for each queued march/expand step, numbered by position) is sized to the same 20-entry cap the durable server-side queue enforces -- but two of the ways a waypoint gets queued (a plain adjacent-tile \"Expand Here\" click, and starting a Relay Beacon from an unowned frontier tile) pushed straight onto the local queue without checking that cap first, unlike every other way to queue a waypoint. A player who queued past 20 that way got a real, server-synced entry -- visible in the tile's own progress tab -- with no marker on the map at all, because the overlay simply has no flag slot beyond position 20.",
    changes: [
      "Both queuing paths now show the same \"Waypoint queue is full (20/20)\" warning every other queuing action already gives once the queue is at its cap, instead of silently accepting an entry the map can't display"
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
    createdAt: 1789019366000, // frozen, 1ms after the MARCH-pathfinding fix entry -- keeps ordering stable
    introducedIn: "2026.09.10.6",
    title: "Fixed a failed attack's tile-flip sometimes showing as unowned until you reselected it",
    why: "When a failed ATTACK counter-captured the attacker's own origin tile back to the defender, the server's follow-up notification for that flip (clearing the origin's muster flag) could be silently dropped for the very players who most needed it -- the attacker who lost the tile and the defender who just reclaimed it -- if the flip also happened to change either player's fog-of-war coverage of that tile in the same instant. The tile's real ownership was correct on the server the whole time; the client's cached copy just never got the update, so it kept rendering the tile as if it belonged to neither side until an unrelated reselect forced a full refetch.",
    changes: [
      "A failed attack that flips your origin tile back to the defender (or a defender reclaiming their tile) now always shows the correct new owner right away, instead of sometimes rendering as an unowned/neutral tile until you click it again"
    ]
  },
  {
    createdAt: 1789019365999, // frozen, 1ms after the muster-3D-overlay fix entry -- keeps ordering stable
    introducedIn: "2026.09.10.5",
    title: "MARCH muster flags now take genuinely shorter routes to their target",
    why: "MARCH picked its next tile using a distance estimate that (1) didn't account for the world wrapping at its edges, so a target actually close by wrap could look ~440 tiles away and get rejected outright, and (2) charged ground already owned (free to move through) the same as a future capture, biasing it toward a tile merely close to the flag over one that continued straight down an already-secured corridor. On top of that, the remaining-distance estimate was always a straight line, so it couldn't tell a clear path from one blocked by water.",
    changes: [
      "MARCH now measures distance to a march target the same way the map actually wraps, so a target near the opposite edge routes across the seam instead of stalling out with \"no target in range\"",
      "MARCH no longer penalizes a candidate for being reached via a longer stretch of already-owned territory -- that ground is free to cross, so it no longer loses out to a closer-to-the-flag candidate that's actually a worse route",
      "MARCH now floods out from the target tile to find real routes around water and other impassable terrain, instead of guessing a straight line that might run straight through an obstacle"
    ]
  },
  {
    createdAt: 1789019365998, // frozen, 1ms after the Great City revert entry -- keeps ordering stable
    introducedIn: "2026.09.10.4",
    title: "Fixed a muster flag's auto-fired attack showing no march animation and flipping the tile before the siege actually resolved",
    why: "An ADVANCE/MARCH flag's attack is fired by the server, not by this client, so it never went through the code that arms the marching-company supply line in 3D (the 2D map already drew it correctly). Separately, the fight's early predicted result -- the same kind of prediction a manually-launched attack always holds back until the real resolution -- was being applied the instant the siege lock started instead, so the contested tile appeared to change hands right away, before the ~30s combat-lock countdown (and its overlay) ever had a chance to show.",
    changes: [
      "A muster flag's auto-fired ADVANCE/MARCH attack now shows the marching supply-line animation on the 3D map while its company is still traveling to the front, matching the 2D map",
      "A muster flag's auto-fired attack no longer flips the contested tile's ownership at the moment the siege starts -- the tile now stays with its current owner and shows the combat-lock overlay for the whole countdown, only changing hands once the real resolution arrives"
    ]
  },
  {
    createdAt: 1788979082413, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.09.1",
    title: "3D ground terrain looks more detailed and less flat",
    why: "The painted ground texture's bump/sheen detail and the flat land's height variation both read as a little too clean and uniform up close. This pushes further within the game's existing hand-painted 3D style -- not a shift to photorealism -- for terrain with more visible texture and a gentler, more natural roll to the land.",
    changes: [
      "Ground texture now has sharper relief and more contrast between duller and shinier patches",
      "Flat land gently rolls instead of reading as a dead-flat plane",
      "Hills now cast and catch shadows like the rest of the terrain, so their shaded side no longer looks flat-lit"
    ]
  },
  {
    createdAt: 1788972991596, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.05.7",
    title: "New worlds place real jungle, marsh, snow, and plains -- plus oases in the desert, and towns that follow rivers",
    why: "Given how much bigger this world is than a typical strategy-game map, the previous 4-biome palette (grass/sand/tundra/coastal) read as repetitive at that scale. This adds four more genuinely distinct visual biomes, oasis landmarks in the desert, and biases new-season town placement toward river paths, so following a river is a real way to find towns instead of towns being placed with no relationship to the map's rivers at all.",
    changes: [
      "New seasons place real jungle (tropical forest), marsh (wet ground near coasts/lakes), snow (the coldest tundra), and plains (a lighter, drier grassland) as genuinely distinct biomes",
      "New seasons scatter oasis landmarks -- a small lake with a fertile ring -- inside large desert regions",
      "New seasons place roughly a third of their towns along river paths, so exploring along a river is a real way to find settlements",
      "Already-running seasons are unaffected -- this only applies to worlds generated from here on"
    ]
  },
  {
    createdAt: 1789050708100, // frozen, 1ms after the monument-announcement entry -- keeps ordering stable
    introducedIn: "2026.09.10.8",
    title: "Great City's second support ring is back, and now actually shows up",
    why: "The second support ring (distance-2 tiles, 24 total instead of 8) for Great City/Metropolis towns was reverted the same day it shipped over a server-cost concern -- restored here with that cost fixed at the source instead. Separately, the ring overlay and support-tile menu logic never actually consulted a town's tier at all: they were hardcoded to the base 8-tile square from the start, so a Great City/Metropolis town's outer ring never rendered, highlighted, or offered tile actions client-side even while the feature was live.",
    changes: [
      "Great City and Metropolis towns draw support structures/tiles from a second ring again (24 tiles total instead of 8)",
      "The support-tile overlay (the glowing ring/hatch highlight) and the tile-action menu now actually show and offer the full ring on Great City/Metropolis towns, instead of only ever the base 8 tiles",
      "The \"Upgrade City to Great City\" tile action mentions the added ring again"
    ]
  },
  {
    createdAt: 1789019365997, // frozen, 1ms after the MARCH-stall fix entry -- keeps ordering stable
    introducedIn: "2026.09.10.3",
    title: "Reverted Great City's second support ring",
    why: "Great City and Metropolis towns briefly drew support structures/tiles from a second ring (24 tiles instead of 8). That's reverted for now -- it added meaningful server cost to a hot per-tile lookup that every town of every tier paid, not just the towns actually using the second ring.",
    changes: [
      "Great City and Metropolis towns are back to the standard 8-tile support ring, same as every other tier",
      "The \"Upgrade City to Great City\" tile action no longer mentions a second ring of build tiles"
    ]
  },
  {
    createdAt: 1789017727269, // frozen, 1ms after the "10-tile radius" entry -- keeps ordering stable
    introducedIn: "2026.09.10.2",
    title: "Fixed MARCH muster flags stalling out and \"fighting\" tiles nowhere near their target",
    why: "MARCH's candidate search only considered expanding onto neutral tiles inside the flag's fixed reach border, but claiming land outside reach has always been allowed (at the cost of out-of-reach decay). A flag whose target lay just past the reach edge found no candidate anywhere near the target, silently fell back to the cheapest candidate reachable through owned territory instead -- sometimes a fight on the far side of the empire -- and just sat there reporting it, with manpower staged and nothing actually happening.",
    changes: [
      "MARCH can now expand onto neutral land outside the flag's reach border, same as a manual EXPAND already could, so a march toward a just-out-of-reach target now actually walks there instead of stalling",
      "MARCH now refuses to fire on any candidate that isn't strictly closer to the target than the flag already is, so it can no longer wander off toward an unrelated fight while reporting itself as \"on track\"",
      "When a march genuinely has nowhere to go, the flag now reports it can't find a target instead of showing a misleading \"Fighting at (x, y)\" status"
    ]
  },
  {
    createdAt: 1789017727268, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.10.1",
    title: "Muster flags now search a 10-tile radius instead of your whole empire, fixing server slowdowns during busy fights",
    why: "Both auto-fire modes searched by walking outward across every tile you own, every tick, for every raised flag. ADVANCE had a range limit but only applied it to the target it picked -- the search itself still crossed the entire empire and threw the far results away -- and MARCH had no limit at all. With several large empires fighting at once that became the server's heaviest work by far, which is what players saw as the game becoming unresponsive or reporting the simulation as unavailable.",
    changes: [
      "Muster flags (ADVANCE and MARCH) now look for targets within 10 tiles of the flag, instead of anywhere in your territory",
      "A MARCH can no longer divert to attack something on the far side of your empire; it stays on the local route toward its target, picking the shortest way there whether that means expanding or attacking",
      "No change to how a target is chosen within range -- only how far the search reaches"
    ]
  },
  {
    createdAt: 1788986490659, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.09.07",
    title: "Restored Town's manpower cap after the population-tier rebalance made Thunder Bastion forts unbuildable at Town tier",
    why: "Halving every tier's manpower-cap increase (including Town's) dropped a Town-tier town's manpower cap to 945 -- below the 960 manpower a Thunder Bastion fort costs, so no Town-tier player could ever build the top fort tier. Only City-and-above tiers were meant to have their increase halved.",
    changes: [
      "Town's manpower cap/regen is back to its original (unhalved) value: 300 cap / +0.42 per-min regen, same as before the population-tier rebalance",
      "City, Great City, and Metropolis keep their halved per-tier increase, now stacking on top of Town's restored value: City 450 cap, Great City 750 cap, Metropolis 1,350 cap"
    ]
  },
  {
    createdAt: 1788954892104, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.09.06",
    title: "Added a \"Go to tile\" button to the capture result popup",
    why: "The on-map capture-alert popup (the card that flashes up with the result of an attack/claim/expand) already showed the tile's name and coordinates as plain text -- but unlike the Activity Feed's matching entry, it had no way to actually jump to that tile.",
    changes: [
      "The capture result popup now shows a \"Go to tile\"/\"Center\" button whenever the result names a specific tile, matching the Activity Feed's existing behavior",
      "Clicking it centers the map on that tile, same as the Activity Feed's button"
    ]
  },
  {
    createdAt: 1788954892103, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.09.05",
    title: "Space View got a full steampunk visual redesign -- brass, copper, and riveted panels",
    why: "The galactic layer's chrome, Senate panel, and Fleets panel each used a different generic dark-UI palette that didn't feel like part of the same game, let alone a future-steampunk empire.",
    changes: [
      "Space View's top bar, launcher, and settings panel now use a shared brass/copper instrument-panel look -- aged leather and gunmetal backgrounds, amber-glow brass accents, parchment-cream text",
      "The Senate panel now reads in verdigris-copper and the Fleets panel in forge-copper/orange, each keeping a distinct accent on top of the same shared base so the panels stay easy to tell apart",
      "Incoming-raid warnings in the Fleets panel keep their red alarm color on purpose -- that's a deliberate warning, not part of the decorative theme",
      "The first-visit Voyager's Briefing modal is now reconciled with the same palette"
    ]
  },
  {
    createdAt: 1788954702870, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.09.04",
    title: "Space View now greets first-time visitors with a briefing on what the galactic layer actually is",
    why: "Entering Space View for the first time dropped you straight into a 3D galaxy with a Senate button, a Fleets button, and no explanation of what any of it does, what Influence/Production are for, or how a raid works.",
    changes: [
      "First time you open Space View, a one-time \"📜 Voyager's Briefing\" explains what the galactic layer is, your Influence/Production economy, the Senate, Fleets, Garrison defense, and how to navigate the 3D map",
      "Dismissing it (or clicking outside the card) is remembered for good -- it won't show again on this or any other device you're signed into"
    ]
  },
  {
    createdAt: 1788951636486, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.09.03",
    title: "Space View now warns you when a raid is inbound at one of your territories",
    why: "Sending a fleet against a rival was completely invisible to them until it landed -- there was no way to know an attack was coming, no time to react, no counterplay at all.",
    changes: [
      "A pulsing red warning ring now appears around any of your solar systems with a raid en route, distinct from the existing orange \"contested\" ring",
      "The Fleets panel now shows a dedicated \"⚠️ Incoming\" section listing which of your territories are threatened and roughly when the fleet arrives",
      "Deliberately anonymous: who's attacking and what they're bringing stay hidden until the raid actually resolves -- you get a warning, not a spoiler",
      "New GET /hq/galaxy/fleets/incoming endpoint powers this"
    ]
  },
  {
    createdAt: 1788950228122, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.09.02",
    title: "Space View: click a system to fly the camera to it, instead of being stuck orbiting the whole galaxy",
    why: "Player feedback: there was no way to move around in Space View's 3D galaxy -- the camera only ever orbited one fixed point at the galaxy's origin, so you could zoom in/out and rotate the whole cluster of systems but never actually go look at one up close.",
    changes: [
      "Clicking an unfocused system now flies the camera to it (keeping your current viewing angle) so you can freely orbit and zoom around just that one system",
      "Clicking the system you're already focused on now commits to entering its Sector",
      "Clicking empty space, or the new \"Galaxy View\" button in the top bar, flies the camera back out to the full galaxy view",
      "The camera can now zoom in much closer (down to a single system's own scale) than the old fixed minimum distance allowed"
    ]
  },
  {
    createdAt: 1788904106589, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.09.01",
    title: "Activity Feed now shows tile coordinates for plain-terrain conquests",
    why: "When a captured tile had no town, dock, or resource on it, the Activity Feed just said e.g. \"Tundra was conquered from Empire X\" with no way to tell which of your many tundra tiles it meant -- unlike town/dock/resource captures, which already read distinctly by name.",
    changes: [
      "Conquest entries for plain terrain now include the tile's coordinates, e.g. \"Tundra (12, 34) was conquered from Empire X\"",
      "The existing \"Center\" button on these entries still jumps the map straight to that tile"
    ]
  },
  {
    createdAt: 1788904106588, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.08.05",
    title: "Fixed: Space View's Senate/Fleets/Settings tabs stacked instead of replacing each other",
    why: "Player-reported: clicking a different top-right tab in Space View while one was already open didn't close the previous one -- each of the three toggle buttons only ever flipped its own panel's visibility, with no idea the other two existed, so opening Fleets while Senate was open just stacked Fleets on top of it instead of replacing it.",
    changes: [
      "Opening the Senate, Fleets, or Settings tab in Space View now closes whichever of the other two was already open, so only one panel is ever visible at a time",
      "Clicking a tab's own button while it's already open still just closes it, unchanged"
    ]
  },
  {
    createdAt: 1788902995508, // frozen, 2ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.08.4",
    title: "Removed the Shard storage cap",
    why: "Shard was capped at just 3 in storage, one of the tightest caps in the game. With Wonder parts now also costing Shard on top of the finished Wonder, that cap meant Shard collected faster than it could be spent was wasted overflow instead of banked for the next build.",
    changes: [
      "Shard no longer has a storage cap -- collect and stockpile as much as you can gather"
    ]
  },
  {
    createdAt: 1788902995507, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.08.3.5",
    title: "Wonder parts now cost Shard, not just the finished Wonder",
    why: "Each Wonder's 3 prerequisite parts only ever cost manpower to build, with the Shard cost only charged on the final assembly. That let a player stockpile every part for free and made the Shard gate trivially easy to clear at the very end.",
    changes: [
      "Every Wonder part building now also costs 1 Shard to build, on top of its existing manpower cost",
      "A completed Wonder now consumes 5 Shard total across its build chain (3 for the parts, 2 for the final assembly), up from 2"
    ]
  },
  {
    createdAt: 1788902995506, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.08.03",
    title: "Fleets now take real build time, can hold at home as a garrison, and the Senate/Fleets target pickers say what they're for",
    why: "Player feedback: a Dreadnought costs 500 Production against a Planet's 6-8/Cycle trickle, but a fleet departed the instant it was paid for -- there was no way to just build a fleet and keep it at home, the unlabeled ⚡ speed stat next to damage read as an unexplained \"electricity\" icon, and the Senate panel's unlabeled target dropdown below the two proposal cards had no indication of what it picked.",
    changes: [
      "Sending a fleet now takes real build time (3 minutes per point of Production cost) before it actually departs -- the fleet panel shows a BUILDING status with a \"departs in ~Xh\" countdown, then TRAVELING once it's underway; the composition summary now shows a Build time alongside Cost/Damage/Travel",
      "The fleet target picker now has a \"Hold at home (garrison, no combat)\" group listing your own territories -- sending there creates a standing garrison fleet with no raid resolution, battle log entry, or Stability effect, shown with a house icon and a \"(home)\" label",
      "Each hull card's stat row now reads \"80 cost / 50 dmg / 4 spd\" instead of bare icons+numbers, so the ⚡ speed stat can't be misread as unrelated to the damage number next to it",
      "Both the Fleets and Senate target dropdowns now have a \"Target\" label and a disabled \"Choose a target...\" placeholder instead of silently defaulting to whichever option happened to load first",
      "New optional departsAt/orderKind fields on GET /hq/galaxy/fleets orders power this -- purely additive, existing callers are unaffected"
    ]
  },
  {
    createdAt: 1788876273396, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.08.02",
    title: "Hints and the new-player checklist now stay dismissed for good, and you can turn them off",
    why: "Discovery tips and the onboarding checklist only remembered what you'd dismissed in this browser's local storage, so clearing browser data or logging in on a different device made them reappear as if you'd never seen them.",
    changes: [
      "Dismissed discovery tips, the discovery-tip mute, and onboarding checklist completion are now saved on your account (server-side) instead of only in this browser, so they stay dismissed across devices and browser data clears",
      "Added a \"Show Hints\" checkbox under Settings > Gameplay to turn discovery tips off entirely"
    ]
  },
  {
    createdAt: 1788876273395, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.08.01",
    title: "Activity Feed now backfills the last 24h after you log back in",
    why: "The Activity Feed was always empty right after logging in or reloading -- it only ever showed events that happened after you connected, silently discarding everything that came in while you were offline even though the server already kept that history.",
    changes: [
      "On login/reconnect, the Activity Feed now backfills entries from the last 24 hours instead of starting empty",
      "Backfilled entries, and any that arrive later while the feed panel isn't open, are marked unread with a highlighted left border so you can see what's new since you last checked",
      "Opening the Activity Feed panel clears the unread markers, same as it already did for the feed's notification badge"
    ]
  },
  {
    createdAt: 1788846244625, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.08.1",
    title: "Freshly-planted muster flags now show a live rate immediately instead of sitting at 0 for up to 30s",
    why: "The muster-smoothing fix from 2026.09.07.10 could only interpolate a flag's progress once the server had sent at least one real sample -- but a brand-new flag had no rate at all until the next periodic tick, up to 30 seconds later, so it sat frozen at exactly 0 with nothing to animate from.",
    changes: [
      "Setting (or planting a sibling) muster flag now stamps a correct accrual rate on the very same response, so the tile menu and manpower panel start climbing immediately instead of waiting on the next server sweep",
      "Planting a new flag also immediately refreshes the accrual rate shown on that player's other active flags (since sharing throughput across more flags changes everyone's rate), instead of leaving them stale until the next sweep"
    ]
  },
  {
    createdAt: 1788819326452, // frozen from `node -e "console.log(Date.now())"` -- was `Date.now()` on main, which check:client-changelog rejects (non-frozen) and which continuously invalidates the "keeps only the latest week" freshness window on every test run
    introducedIn: "2026.09.07.10",
    title: "Muster flag progress now animates smoothly instead of jumping every ~30s",
    why: "Manpower staged on a muster flag only updated server-side in sparse ticks, so the tile menu, manpower panel, and the 3D map's fill bar all showed frozen numbers for long stretches, then a visible jump. Sustained clicking/dragging traffic could also starve other queued actions (like the flag's own status updates) behind it indefinitely.",
    changes: [
      "The tile menu, manpower panel's Active muster flags list, and the 3D map's muster fill bar now interpolate a flag's staged amount continuously between server updates instead of holding flat then jumping",
      "The tile menu now repaints a muster tile's staged/cap readout roughly every 250ms while its menu is open, and the manpower panel's flag list now animates HOLD flags too (previously only Advance/March flags got a live repaint)",
      "Fixed a job-queue fairness issue where a steady stream of interactive commands (clicks, drags) could indefinitely starve background command types (including muster-flag status updates) queued behind them"
    ]
  },
  {
    createdAt: 1788814731427, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.07.09",
    title: "Fleets in flight are now visible in Space View's 3D scene",
    why: "Sending a fleet was invisible outside the Fleets panel -- the 3D galaxy scene had no idea a raid or recon mission was even underway. Nothing showed a fleet leaving your territory, traveling, or approaching its target.",
    changes: [
      "Each hull class (Scout, Raider, Battleline, Dreadnought, Tanker) now has its own distinct 3D ship model -- a small nosecone for Scout, a dart-shaped Raider, a plain Battleline hull, a larger spiked Dreadnought, and a tanker-shaped logistics hull for Tanker",
      "While your fleet is TRAVELING, its ships now fly a straight line from your territory to the target in the 3D scene, oriented to face the direction of travel, and land exactly when the order actually resolves server-side",
      "A fleet with a mixed composition shows one ship model per hull class present, arranged in a small formation, rather than a single generic marker",
      "New optional originSeasonId field on GET /hq/galaxy/fleets orders (your own first held territory at send time) purely powers this visual -- existing callers are unaffected, and a fleet from a player who holds no territory still gets a deterministic (if anonymous) launch point rather than being skipped",
      "This only shows your own fleets today -- there's no detection/visibility model yet for seeing an enemy fleet en route to your own territory"
    ]
  },
  {
    createdAt: 1788813121920, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.07.08",
    title: "Fleets panel redesign: hull cards, a live cost/damage/travel-time summary, and combat-report battle log entries",
    why: "Sending a fleet meant staring at five bare number inputs with no feedback on what you were building -- no visible cost, no damage estimate, no sense of how long the trip would take until you hit send. The battle log and fleet list were just plain text rows with no way to tell a recon ping apart from a raid at a glance.",
    changes: [
      "Each hull class is now a clickable card (icon, Production cost, damage, speed) with a +/- stepper instead of a bare number input, highlighting once you've added at least one",
      "A live summary above the Send Fleet button shows total Production cost, total damage (or \"Recon only\" for an all-Scout composition), and estimated travel time as you build the composition",
      "Your fleets list now shows a rocket/magnifying-glass/crossed-swords icon per order and an \"arrives ~Xh\" countdown while traveling, plus a status pill instead of plain text",
      "The battle log now renders each entry as a small combat-report card (attacker -> defender, an icon distinguishing a recon ping from a raid, and the damage/Stability outcome) instead of a plain text row"
    ]
  },
  {
    createdAt: 1788811800000, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.07.07",
    title: "Senate proposals now show a live quorum bar instead of just PENDING/PASSED/FAILED",
    why: "The Senate panel gave no sense of stakes while a vote was live -- a proposal just sat there labeled PENDING with a Vote button, no visible tally, no idea how close it was to passing or when it would resolve. Casting a vote felt like clicking into a void.",
    changes: [
      "Each pending proposal now shows an animated progress bar for its cast Dominion weight against the quorum it needs to clear, with a tick mark at the quorum threshold and a distinct-voters count (e.g. \"2/3 voters\")",
      "The bar turns green once both the quorum and distinct-voter floor are cleared",
      "Each proposal shows roughly when it resolves (e.g. \"resolves ~3h\")",
      "Raising a proposal now picks EMBARGO or CONTEST from two clickable cards showing their icon, Influence cost, and effect, instead of a bare dropdown",
      "New GET /hq/galaxy/senate fields (castWeight, totalWeight, quorumPct, distinctVoters, minDistinctVoters, resolvesAt) power this -- purely additive, existing callers are unaffected"
    ]
  },
  {
    createdAt: 1788810535277, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.07.05",
    title: "Fixed: a rare \"Frontier sync mismatch\" popup rejecting an attack on a tile you'd just fought over",
    why: "A losing attack's combat result can describe an unrelated effect on the target tile (like a post-attack shock marker) without saying anything about ownership at all. The client was treating that silence as \"this tile has no owner,\" wiping the real owner from its local map. If a queued action then reached that tile before the next full resync, it fired an illegal territory claim (EXPAND) at what was actually enemy-held land, got rejected, and surfaced a confusing \"Frontier sync mismatch\" warning telling the player to manually refresh.",
    changes: [
      "Combat-result updates no longer clear a tile's owner unless the server actually says ownership changed -- an update about something else on the tile (e.g. a post-attack shock timer) leaves current ownership alone",
      "This removes one cause of the \"Frontier sync mismatch\" popup and of an auto-queued action misfiring as a territory claim against land that was never actually neutral"
    ]
  },
  {
    createdAt: 1788811285234, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.07.1",
    title: "Forests now mix in leaf/deciduous trees, not just conifers",
    why: "Every forest tile only ever rendered conifers (pine and spruce, both cone-shaped) in both the true-3D and 2D-fallback map renderers, so forests read as visually uniform regardless of how much biome variety the terrain itself had.",
    changes: [
      "Forest tiles now mix in a third, leaf/deciduous tree species (a rounder, warmer-green canopy) alongside the existing pine and spruce conifers, in both the true-3D renderer and the 2D-canvas accessibility fallback",
      "Light-shaded grass tiles (which never had any trees at all) now get a sparse, purely decorative scattering of leaf saplings, so they don't read as completely bare next to dense dark-grass forest -- this has no gameplay effect (no vision or claim-timing change), unlike real forest tiles",
      "Each world tile's mix of tree species (and whether it gets a decorative sapling) is fixed (deterministic per-tile), so a forest -- or a light-grass tile's sapling -- doesn't flicker as you pan or reconnect"
    ]
  },
];
export const CLIENT_CHANGELOG_ENTRIES: ClientChangelogEntry[] = [
  ...RECENT_CLIENT_CHANGELOG_ENTRIES,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_2,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_3,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_4,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_5,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_7,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_10,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_11,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_14,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_16,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_17,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_18,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_20,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_22,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_24,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_26,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_27,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_28,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_29,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_30,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_31,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_32,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_33,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_34,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_36,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_37,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_41,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_42
];
