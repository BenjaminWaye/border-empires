// Changelog entry data only, split out from client-changelog.ts (rendering/
// visibility) to keep that file under the 500-line cap. Entries are unordered —
// client-changelog.ts sorts by createdAt. Move old entries to
// client-changelog-data-earlier.ts when this file approaches the cap.
import { CLIENT_CHANGELOG_ENTRIES_EARLIER } from "./client-changelog-data-earlier.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_2 } from "./client-changelog-data-earlier-2.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_3 } from "./client-changelog-data-earlier-3.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_4 } from "./client-changelog-data-earlier-4.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_5 } from "./client-changelog-data-earlier-5.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_6 } from "./client-changelog-data-earlier-6.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_7 } from "./client-changelog-data-earlier-7.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_8 } from "./client-changelog-data-earlier-8.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_9 } from "./client-changelog-data-earlier-9.js";
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
    createdAt: 1788381652688, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.02.1",
    title: "New worlds have smaller, more varied hill/biome regions",
    why: "Newly generated worlds broke land into just five region types selected by noise wavelengths (180/120/260 tiles) that on a 450x450 map spanned nearly half the map per octave -- so a single region (and the hill density / sand-vs-grass threshold it gated) could form one unbroken blob hundreds of tiles across, reading as hills for ~1000 tiles then grass for ~1000 tiles with a hard edge between them. Hill-ness, biome, and forest shading aren't frozen into a season's saved tiles the way land/sea/mountain is -- they're recomputed live from the season's seed on both server and client -- so this is gated behind a new worldgenVersion stamped on each season at creation, and every already-running season keeps reproducing its original (version 1) terrain untouched.",
    changes: [
      "Newly created seasons get region noise wavelengths shrunk (180/120/260 -> 60/38/95) so a single hills/grass/sand region no longer spans most of the map",
      "Newly created seasons also get hills punched with clearings from two independent short-wavelength noise layers instead of one, so hilly stretches read as rolling country with breaks rather than a solid slab",
      "Every season already in progress keeps generating hills/biome/forest exactly as it always has -- this ships as an opt-in worldgen version, not a retroactive change to live seasons"
    ]
  },
  {
    createdAt: 1788166898915, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.31.2",
    title: "Dock sea-route lines actually render again",
    why: "The islands mapgen was reworked on Aug 27-28 (bigger islands, more land). Seasons generated before that rework play on terrain frozen at their creation, but the client re-derives terrain procedurally using whatever worldgen code is in the current build -- so the client started seeing land where the season actually has sea, its route pathfinder could no longer find a sea path, and the dashed line silently stopped drawing. The two prior fixes for this shipped the correct route from the server but it never survived the trip: the simulation-to-gateway message schema had no field for it, so it was dropped in transit every time.",
    changes: [
      "The dashed dock-to-dock sea route line draws again, following the season's real frozen terrain instead of a recomputed approximation that drifts whenever map generation changes"
    ]
  },
  {
    createdAt: 1788165265487, // frozen: one ms after this file's prior newest entry
    introducedIn: "2026.08.31.2",
    title: "Fixed the decay countdown missing entirely on some out-of-reach frontier tiles",
    why: "A frontier tile decaying because it's out of your reach re-stamps its decay deadline on every reach recheck, but the server only sent the paired \"why it's decaying\" tag alongside a deadline the very first time either one changed. A tile whose deadline kept refreshing while that tag itself never changed again could end up with a connection that had simply never received the tag -- the client then had a decay deadline with no matching reason, so it couldn't tell the countdown apart from an ordinary \"outside your reach\" tile and just showed \"Outside reach\" with no timer at all.",
    changes: [
      "The server now always resends both the decay deadline and its reason together, so a decaying frontier tile's tile menu reliably shows its \"decays in Xs\" countdown instead of sometimes silently falling back to a plain \"Outside reach\" line."
    ]
  },
  {
    createdAt: 1788165265486, // frozen: one ms after this file's prior newest entry
    introducedIn: "2026.08.31.1",
    title: "Aether Purge now alerts the empire that lost the tile",
    why: "Aether Purge silently turned a hostile tile neutral with no signal to the empire that lost it — unlike a conventional attack, which alerts the defender in the Activity Feed and by email. Purge victims found out only by noticing the tile had changed color on the map.",
    changes: [
      "Getting Aether Purged now posts a drastic 'Aether Attack!' Activity Feed alert naming the attacker and the tile lost, with a Center action to jump to it",
      "Purge victims also get an email alert (subject to the same one-email-per-hour throttle as conventional attack alerts) if they have email notifications set up"
    ]
  },
  {
    createdAt: 1788167711819, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.31.2",
    title: "Fixed Mercantile Charter's bonus never showing, and support buildings near the map edge (or built on the town itself) not being counted",
    why: "Two separate bugs compounded into \"my town's bonuses aren't showing\": (1) the tile-detail fetch that opening a tile's popup uses never computed Mercantile Charter's gold/growth bonus at all -- the field was stripped before being cached, and the popup's own fallback math never looked it up in the first place; (2) Mintworks and other support buildings can legally be built directly on a town's own tile, but the counting code only ever scanned the 8 surrounding tiles, silently missing an on-tile building; (3) that same counting code built neighbor-tile lookups without accounting for the map wrapping at its edges, so a support building on a tile reachable only by wrapping around the map's east/south edge was also silently missed.",
    changes: [
      "Mercantile Charter's gold/growth bonus now shows correctly on a town's tile popup instead of disappearing after the first load",
      "A Mintworks (or Garrison Hall, Weapons Workshop, Titanium/Umbrite Works, Clearing House, Logistics Guild) built directly on a town's own tile now counts toward that town's bonuses",
      "Support buildings on a tile reachable only by wrapping around the map's edge now count toward the nearby town's bonuses"
    ]
  },
  {
    createdAt: 1788162511005, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.30.9",
    title: "3D map lighting: buildings now show real light and shadow, not just a subtle tint",
    why: "An earlier pass repositioned the key light to align with the camera's fixed viewing angle, but only rotated its compass direction while leaving it nearly straight overhead -- an overhead light mostly lights roofs regardless of which way it's rotated, so vertical wall faces (the part that actually reads as 'which side is lit') barely changed. It looked the same as before.",
    changes: [
      "The 3D map's key light now comes in at a noticeably lower, more raking angle instead of nearly overhead, so building walls facing the camera read clearly lit and far-side walls read clearly shadowed"
    ]
  },
  {
    createdAt: 1788162021253, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.30.8",
    title: "Fixed the 3D water surface's waves visibly jumping while panning or clicking a tile",
    why: "The wave animation's spatial pattern was phased off each vertex's on-screen position rather than its fixed world position, so a tile's on-screen position shifting slightly as you panned (before the next terrain rebuild caught up) reset the whole crest/trough pattern into a different shape -- showing up as the water visibly re-rendering every time a rebuild fired, including ones triggered just by clicking a tile.",
    changes: [
      "Ocean and lake waves now keep animating smoothly across terrain rebuilds instead of visibly jumping into a different pattern while panning or selecting a tile"
    ]
  },
  {
    createdAt: 1788128230679, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.30.7",
    title: "Fixed Trade Nexus showing a duplicate 2D overlay on the 3D map",
    why: "Trade Nexus (CARAVANARY) draws its own dedicated range overlay directly in the 3D renderer, bypassing the generic 3D structure-overlay set that the 2D canvas checks to decide whether to skip its own overlay image. Because Trade Nexus wasn't in that set, the 2D fallback overlay kept drawing on top of the 3D one for every player on the 3D renderer.",
    changes: [
      "Trade Nexus no longer shows a flat 2D overlay image layered on top of its 3D range overlay"
    ]
  },
  {
    createdAt: 1788127316489, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.30.6",
    title: "Selected-structure reach highlight now also shows on the 3D map",
    why: "The green reach-disk highlight for a selected town/dock/outpost-family structure only drew on the 2D canvas overlay, so most players (on the 3D renderer) never saw it -- only players on the 2D fallback (used on lower-end/broken hardware) did.",
    changes: [
      "Selecting a town, dock, or outpost-family structure (Relay Beacon, Siege Outpost, Siege Tower, Dread Tower) now shows its green reach-disk ring on the 3D map too, matching the 2D overlay"
    ]
  },
  {
    createdAt: 1788126287875, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.30.5",
    title: "Tile debug download now includes dock connection-line diagnostics",
    why: "Reports of a dock's yellow dashed connection line never appearing were hard to triage remotely -- there was no way to see, from a single tile, whether the dock actually has a paired-dock entry, whether the visibility gate was allowing it, or whether the sea-route pathfinder found a route.",
    changes: [
      "The tile debug download (dev/support tool, not a player-facing feature) now includes a dockDebug section on dock tiles with their pairing, visibility-gate result, and route status"
    ]
  },
  {
    createdAt: 1788108392688, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.30.4",
    title: "You can now build a Palisade on a tile that already has a Relay Beacon",
    why: "A Palisade and a Relay Beacon both occupy the same build slot on a tile, so trying to build a Palisade where a Relay Beacon already stood was rejected outright with \"tile already has structure\" -- even though a full Fort is explicitly allowed to take that slot from a Relay Beacon. Palisade is the entry tier of the same Fort ladder and had no equivalent carve-out.",
    changes: [
      "Building a Palisade on a tile with an existing Relay Beacon now succeeds and replaces the beacon, matching how building a Fort there already worked",
      "The Relay Beacon's vision bonus ends once it's replaced by the Palisade, the same as any other structure it's built over"
    ]
  },
  {
    createdAt: 1788124049918, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.30.2",
    title: "Fixed forest trees visibly reshuffling into a different arrangement while panning the 3D map",
    why: "Which tree species and spacing layout a forest tile got was picked by hashing its on-screen position rather than its fixed world position -- so a tile's on-screen position drifting slightly as you panned (before the next terrain rebuild caught up) could flip it to a different species/layout, showing up as trees visibly popping into a different arrangement mid-pan.",
    changes: [
      "Forest tiles now keep the same tree species and layout regardless of camera position, instead of occasionally reshuffling while panning"
    ]
  },
  {
    createdAt: 1788088515738, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.30.1",
    title: "Settle Land now queues on a tile you're already expanding into",
    why: "Pressing Settle Land on a neutral tile that was already mid-expansion (an active claim, or one still waiting its turn in the frontier queue) used to be rejected as a duplicate/locked target -- there was no way to line up the settle ahead of time, so you had to watch for the expansion to land and click again.",
    changes: [
      "Settle Land on a tile you're already expanding into now queues the settlement and fires it automatically once that tile becomes your frontier -- instead of being rejected",
      "The tile's progress tab shows queued settle (and settle + build) actions lined up behind the active expansion, with a cancel button for each"
    ]
  },
  {
    createdAt: 1788107851889, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.30.1",
    title: "Fixed waypoints stalling behind a large queue of manually-claimed tiles",
    why: "A waypoint's next leg refused to enqueue at all while the frontier action queue held anything, so queuing up several individual tiles (adjacency/frontier-expansion clicks) alongside an active waypoint could stall it indefinitely -- the waypoint never got a turn as long as the player kept adding to the manual queue.",
    changes: [
      "An active waypoint now keeps advancing alongside manually-queued frontier tiles instead of waiting for that queue to fully drain"
    ]
  },
  {
    createdAt: 1788091013204, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.30.2",
    title: "Mercantile Charter's \"first three towns\" no longer counts a bare starting settlement",
    why: "Every settled tile carries basic town data, not just a player's actual named/grown cities -- so an early, unnamed starting settlement silently occupied one of Mercantile Charter's three bonus slots ahead of the player's real towns, exactly matching the domain's own description (\"your first three cities\") but not what it actually checked. An established player with more than a couple of settled tiles could end up with none of their real towns receiving the bonus at all.",
    changes: [
      "Mercantile Charter's first-three-towns bonus now only considers TOWN tier and above -- a bare settlement can no longer take one of the three slots"
    ]
  },
  {
    createdAt: 1788091180198, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.30.3",
    title: "Fixed the Gold Production stat not matching its own \"Sell Off gold\" modifier line",
    why: "The tile popup's gold-production number and its \"MODIFIERS\" list are computed on two separate code paths in the gateway's tile-detail lookup. The modifiers list was already fixed to detect a support-ring converter correctly, but the gold-production number's own formula was never updated to include it, so the two figures on the same screen disagreed -- and a Refine-mode converter (which earns no gold) could incorrectly show a \"Sell Off gold\" line at all.",
    changes: [
      "A settled town tile's Gold Production number now includes a support-ring Sell Off converter's contribution, matching the modifier line below it",
      "A converter in Refine mode no longer shows a \"Sell Off gold\" modifier it doesn't actually earn"
    ]
  },
  {
    createdAt: 1788207240438, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.31.4",
    title: "Fixed the 3D border overlay disappearing on islands the camera isn't near",
    why: "The true-3D renderer only keeps map chunks loaded near the camera's current position, so a player-owned island elsewhere on the map has no locally-cached tile data even after it's been discovered. The border-overlay renderer treated a missing local tile the same as a genuinely fogged one, so the Aether Survey Line boundary silently vanished on every island except whichever one the camera happened to be near.",
    changes: [
      "The 3D map's border overlay (Aether Survey Line) now stays visible on previously-discovered islands even when their chunks aren't currently streamed in near the camera"
    ]
  },
  {
    createdAt: 1788176142270, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.29.1",
    title: "AI empires now push Relay Beacons into unexplored territory, not just what they can already see",
    why: "Relay Beacon placement only scored land the AI had already synced locally, so once a nearby town/resource/dock was claimed out, beacons stopped scoring as worthwhile even when real, unclaimed land plausibly sat just past current vision -- AI empires would sit idle for long stretches (some built only a handful of beacons all game) instead of continuing to push their border outward.",
    changes: [
      "AI empires now also value genuinely unexplored (fogged) land when deciding where to place a Relay Beacon, not only land they've already seen",
      "Relay Beacon placement no longer waits for an in-reach expansion opportunity to run out first -- it competes on its own merits every tick, so AI empires build beacons far more consistently over a season"
    ]
  },
  {
    createdAt: 1788211204796, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.31.5",
    title: "Fixed the 3D map's sea lighting and wave animation restarting when you click a tile",
    why: "Clicking a tile refreshes its detail from the server, and that refresh arrives back as a TILE_DELTA even when nothing about the tile actually changed. The client bumped its tile-revision counter on every TILE_DELTA unconditionally, and that counter is the only signal the true-3D renderer's rebuild loop watches -- so a no-op detail refresh forced a full terrain + water-surface rebuild anyway, visibly restarting the sea's wave and lighting animation once for the click and again a moment later when the server's reply landed.",
    changes: [
      "Clicking a tile no longer restarts the 3D map's sea wave/lighting animation when the server's tile-detail refresh comes back unchanged"
    ]
  },
  {
    createdAt: 1788210175810, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.31.5",
    title: "Fixed a muster flag's auto-fired attacks missing their skirmish animation and briefly flipping the tile back to the defender",
    why: "A muster flag's ADVANCE-mode attack is dispatched by the server, not submitted by this client, so it never occupied the single slot the skirmish animation and combat-outcome prediction were built around -- the pre-resolution clash never rendered (only the final capture flourish did), and an unrelated leftover prediction from an earlier fight could get stamped onto the wrong tile, flipping it to the defender for a moment before the next correction reasserted the real outcome.",
    changes: [
      "A muster flag's auto-fired ADVANCE attack now plays the same pre-resolution skirmish animation a manually-dispatched attack does",
      "A resolved attack no longer applies a stale, unrelated prediction to the wrong tile -- fixing the brief attacker-to-defender-and-back ownership flicker on muster-fired captures"
    ]
  },
  {
    createdAt: 1788274542099, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.01.1",
    title: "Fixed the 3D map's selected dock's sea-route line drifting as you panned the camera",
    why: "The true-3D dock route overlay only recomputes its segment positions when the selected tile or dock list changes, but it was anchoring those positions to the live, continuously-panning camera position instead of the terrain's stable rebuild anchor that every other 3D overlay uses -- so once a dock was selected, its dashed sea-route line stayed glued to wherever the camera happened to be at that moment and visibly slid away from the actual route as you panned, instead of tracking the terrain underneath it.",
    changes: [
      "A selected dock's sea-route line on the 3D map now stays fixed to the terrain while you pan the camera, instead of drifting with it"
    ]
  },
  {
    createdAt: 1788276180062, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.01.2",
    title: "Trees and most structures now cast real shadows on the 3D map",
    why: "The 3D renderer never turned on WebGL shadow mapping, so nothing in the scene ever cast or received a real shadow no matter how a mesh's own castShadow/receiveShadow flags were set -- trees especially read as flatly lit and \"pasted on\" the ground instead of grounded, most noticeably under the raking sun angle from a recent lighting pass.",
    changes: [
      "Trees and most structures (economic, late-game, civic, infrastructure, industrial, manpower, worldbreaker, imperial exchange, astral dock, and population bureau buildings) now cast a real shadow onto the ground and onto each other on the 3D map, instead of only the flat contact-shadow decal underneath them",
      "Town buildings, forts, watchtowers, mountains, resource deposits, and docks don't cast real shadows yet -- they still only show the flat contact-shadow decal"
    ]
  },
  {
    createdAt: 1788275769776, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.01.3",
    title: "AI empires now keep a manpower reserve so they can actually fight back",
    why: "AI empires spent every point of manpower regen on expanding the moment it became affordable (unlocked at just 10 manpower), while attacking required 60 -- so an AI's manpower could mathematically never climb high enough to launch an attack. Confirmed live: several AI empires lost dozens of tiles a day to barbarian raids while sitting completely idle, unable to ever fight back.",
    changes: [
      "AI empires now hold back a manpower reserve for attacking instead of spending every point on expansion and building, so they can actually respond to sustained threats"
    ]
  },
  {
    createdAt: 1788283561968, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.02.1",
    title: "AI empires now go on a war footing under sustained attack",
    why: "AI empires only reacted to enemy or barbarian pressure by nudging a few scores -- never enough to actually stop building granaries and grabbing scattered land while a real, ongoing incursion was underway. Confirmed live: an AI empire lost dozens of tiles a day to barbarian raids while its planner kept treating every tick as business as usual.",
    changes: [
      "AI empires now recognize a sustained, land-connected threat and shift into a focused war footing -- expansion redirects toward retaking ground instead of scattering outward, non-essential building is put on hold, and attacking/fortifying get a real priority boost",
      "An ocean-separated threat (nothing reachable without crossing water) doesn't trigger this -- it still raises alarm normally, just doesn't put the whole empire on a war footing",
      "The war footing holds for a few ticks after the threat clears before easing off, so it doesn't flicker on and off with every single tile that changes hands"
    ]
  },
  {
    createdAt: 1788295630309, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.02.2",
    title: "3D map shadows: lighter, visible through owned/settled tile color, and extended to more buildings",
    why: "The first shadow pass left three visible problems. The shadow itself defaulted to fully dark (three.js's shadow.intensity = 1), reading harsher than intended. The owned/settled tile color overlay used a straight alpha blend, which puts 85%/50% weight on its own flat color and only 15%/50% on the ground's real (possibly shadowed) color underneath -- so a tile's real cast shadow barely showed through the ownership tint at all. And mountains, town buildings, forts, watchtowers, and docks build their own meshes outside the shared structure-piece factory the first pass wired up, so they were skipped and kept reading as flatly lit no matter the sun's angle -- worsened by the shadow map's texel density being too coarse at typical zoom for fine building/tree detail, which read as pervasive self-shadowing acne rather than clean lighting.",
    changes: [
      "The 3D map's cast shadows are noticeably softer than before",
      "A tile's real cast shadow now visibly darkens its owned/settled color fill instead of being hidden underneath it",
      "Mountains, town buildings, forts, watchtowers, and docks now cast and receive real shadows too, matching trees and most other structures",
      "Raised the shadow map's resolution and retuned its bias to cut down on shadow-acne flicker on building/tree surfaces, which was making them look unlit even with shadows enabled"
    ]
  },
  {
    createdAt: 1788295509867, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.02.2",
    title: "AI empires now react to a barbarian on their doorstep immediately, not just once things get serious",
    why: "The war footing added moments ago required the same \"is this serious\" bar for a barbarian tile as for an enemy empire's tile -- reasonable for a rival player (a single ordinary border touch with a neighbor is normal), but wrong for barbarians, which grow by eating neighboring tiles and periodically split into two independent barbarians once they've eaten enough. Waiting for that bar meant waiting for the barbarian to have already multiplied before reacting.",
    changes: [
      "A single land-connected barbarian tile now puts an AI empire on a war footing immediately, without needing the same sustained-pressure threshold a rival empire's border tile requires"
    ]
  },
  {
    createdAt: 1788297346755, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.02.3",
    title: "Fixed the 3D map's sea wave/lighting animation still restarting on nearly every tile update",
    why: "The two earlier fixes for this only closed the click-triggered REQUEST_TILE_DETAIL path. The much more common path -- the ordinary TILE_DELTA_BATCH stream that reflects every visible tile's server-side economy tick (yield, upkeep, and view-history bookkeeping recompute on essentially every step) -- bumped the tile-revision counter unconditionally on every single delta, even though neither map renderer reads any of those economy-only fields. Since that counter is the only signal the true-3D renderer's rebuild loop watches, a tile's gold ticking up a fraction anywhere in view kept forcing a full terrain + water-surface rebuild, which is what kept restarting the sea's wave/lighting animation with no player action at all.",
    changes: [
      "The 3D map's sea wave/lighting animation (and the rest of the terrain) no longer restarts from routine economy ticks -- only from a change that's actually visible on the map"
    ]
  },
  {
    createdAt: 1788296407361, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.02.3",
    title: "3D border line (Aether Survey Line) no longer disappears on distant islands or hides rival borders",
    why: "The border overlay's pylon/segment render pool had a fixed 96-slot cap sized against a wrong assumption (\"a pylon every ~10-15 boundary tiles\") -- a real reach boundary samples nearly every corner, so a modest 3-4 anchor empire already exceeded the cap on its own. The pool filled in list order (the local player's own pylons first, every other owner appended last), so islands beyond the first couple traced -- not the one the camera was looking at -- silently went unrendered, and a rival's border could never render at all once the local player's own pylons alone reached the cap.",
    changes: [
      "Border pylons/segments are now culled to the on-screen area before competing for a render slot, so whatever island the camera is actually looking at always gets its border drawn",
      "Remaining slots are shared fairly across every owner (round-robin) instead of draining in list order, so a rival's border can no longer be starved just by being computed after the local player's own",
      "The pool itself is larger, with more headroom for the connecting line (a dropped line segment leaves a visible gap) than for the decorative pylons along it"
    ]
  },
  {
    createdAt: 1788299049899, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.02.4",
    title: "Fixed login sometimes hanging forever on \"Connecting your empire...\"",
    why: "A recent change to how the client sends its login credentials to the server marked a login attempt as \"in progress\" before checking whether Google sign-in had actually finished loading. On a normal page load, that check can very plausibly lose the race and come back empty for the first attempt -- but the code path that handled \"not ready yet\" forgot to clear the in-progress marker, so every later attempt (including the one after Google sign-in finished) saw the marker still set and silently gave up before sending anything. The result was a login that connected fine but sat on the loading screen forever.",
    changes: [
      "Login retries again correctly after Google sign-in finishes loading, instead of getting stuck if the very first attempt happened before that"
    ]
  },
  {
    createdAt: 1788300674075, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.02.5",
    title: "Fixed a false \"missing weapons factory\" attack-preview penalty against offline opponents",
    why: "An earlier fix made the attack preview look up a target's Titanium/Umbrite Weapons Factory counts from that player's own server-side data instead of the attacker's own limited view of the map, so breaking an alliance (which drops shared vision) couldn't cause a false penalty anymore. But that server-side data is only kept in memory while a player is actively connected -- so previewing an attack against an opponent who happened to be offline at that moment still fell back to scanning the attacker's own limited view, reproducing the same false penalty under a different trigger.",
    changes: [
      "Attack previews against an offline opponent's territory now correctly reflect their real weapons-factory counts, instead of sometimes wrongly applying the missing-factory penalty"
    ]
  },
  {
    createdAt: 1788301428581, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.02.6",
    title: "3D map: frontier tint and fog-of-war are transparent again",
    why: "The previous shadow-visibility fix switched the ownership-tint overlay to a multiply blend so a tile's cast shadow shows through settled territory's tint -- but that overlay's rendering code is shared with frontier tint and both fog-of-war layers, and multiply blending always darkens the ground rather than mixing toward the tint color the way the old alpha blend did. Frontier tiles and fogged (unrevealed) tiles started reading as a heavy, near-opaque wash instead of a subtle one, and the ground under them looked darker overall.",
    changes: [
      "Frontier tint and fog-of-war are back to their original translucent look",
      "Settled/owned territory keeps the new shadow-visible-through-tint look unchanged"
    ]
  },
  {
    createdAt: 1788325360893, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.02.7",
    title: "3D map: fog-of-war is a solid dark tint again, not a washed-out one",
    why: "The previous fix reverted fog-of-war's black darkening quad to the original translucent alpha blend, which read as too washed-out/see-through against the ground's real lit-and-shadowed color -- undoing the fog effect's whole point of hiding stale, out-of-vision terrain. Frontier tint is genuinely meant to be a subtle wash and stays that way; fog-of-war is meant to read as solidly dark, which is what the multiply blend (the same one settled/owned territory uses) actually gives it.",
    changes: [
      "Fog-of-war (previously-seen but currently out-of-vision territory) is back to a solid, near-opaque dark tint instead of a washed-out translucent one"
    ]
  },
  {
    createdAt: 1788329843239, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.02.8",
    title: "Fixed clicking a fogged tile sometimes doing nothing",
    why: "Whether a tile counts as fogged is decided by discoveredTiles, which is restored from localStorage across a page reload -- but the actual remembered tile data (owner, terrain, structures) in state.tiles is not restored, only refetched as tiles come back into live vision. A tile fogged before the current session started therefore had no local record at all, and the click handler only opened the tile info panel when that local record existed -- so clicking it silently did nothing, with no error and no feedback.",
    changes: [
      "Clicking a fogged tile with no remembered local data now opens the tile info panel with what's actually knowable (its terrain) instead of doing nothing"
    ]
  },
  {
    createdAt: 1788331350303, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.02.9",
    title: "Fogged and unexplored tiles now offer Expand To, and show a Fogged/Unexplored status",
    why: "A fogged (previously-explored, currently out-of-vision) tile's menu unconditionally showed zero actions, even on ordinary claimable neutral land -- there was no way to expand toward ground you'd already seen once but had since lost vision of. An unexplored tile's menu offered a waypoint in some cases but no plain adjacent claim, and neither menu said anything about why the tile looked the way it did.",
    changes: [
      "Fogged and unexplored land tiles now offer \"Expand To\" (adjacent claim or a routed waypoint chain, same as any other neutral target) instead of no actions at all",
      "Both menus now show a status line (\"Fogged — showing last known data\" / \"Unexplored — terrain unknown\") explaining why the tile's info might be incomplete or out of date"
    ]
  },
  {
    createdAt: 1788334721333, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.02.10",
    title: "3D map: fixed rival border lines crossing your own near an inactive neighbor",
    why: "The server pushes each rival's true, contest-resolved territory to you on connect so their border can be drawn correctly instead of guessed; that push is bounded by a total tile-scan budget so a large season can't turn login into an unbounded scan. The budget was charged against every rival's territory before checking whether you could even see it, so enough rivals outside your vision could exhaust the budget before the scan reached a genuinely adjacent, visible neighbor. If that neighbor was also inactive/offline, nothing ever re-triggered a retry, so their border stayed on the client's rough guess indefinitely -- visibly overlapping your own.",
    changes: [
      "A visible neighbor's territory is no longer skipped on connect just because other, invisible rivals happened to be scanned first"
    ]
  },
  {
    createdAt: 1788359660679, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.02.11",
    title: "3D map: settled territory tint is back to its original look",
    why: "A recent shadow-visibility change also switched settled/owned territory's tint to a multiply blend, so a tile's cast shadow shows through it -- after living with it, that read as the wrong color for settled land. Reverted to the original translucent alpha blend, matching frontier tint and fog-of-war, which were already reverted for the same reason.",
    changes: [
      "Settled/owned territory's tint is back to its original color and blend, matching frontier tint and fog-of-war"
    ]
  },
  {
    createdAt: 1788361363158, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.02.12",
    title: "Rejected adjacent-tile expand clicks now tell you why, instead of doing nothing",
    why: "Clicking to claim an adjacent tile that turned out unreachable (e.g. no path from your territory) used to fail completely silently -- no message, no console output, nothing on screen distinguished it from a successful click, making a genuine rejection look like the game just wasn't responding.",
    changes: [
      "A rejected adjacent-tile expand click now shows a \"Frontier claim blocked\" message explaining why (no path, already owned, allied/truced target, or no territory to expand from)"
    ]
  },
  {
    createdAt: 1788361914825, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.02.13",
    title: "Fixed the Overview tab not responding on a fogged tile with no cached data",
    why: "Clicking a fogged tile with no locally-remembered data opens its menu using a terrain-only placeholder built on the spot, but that placeholder was never saved into the client's own tile store -- only handed to the menu for that first render. Switching to the Overview tab re-fetches the tile by its map key to rebuild the view, and for this exact case that lookup came back empty, so the tab switch silently updated internal state without ever re-rendering, leaving the previous tab's contents on screen looking unresponsive.",
    changes: [
      "The Overview tab (and any other tab) now switches correctly on a fogged tile you have no prior data for"
    ]
  },
  {
    createdAt: 1788365301449, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.02.14",
    title: "Fixed chain-clicking adjacent tiles to expand stalling after a couple of tiles",
    why: "A plain adjacent-tile expand click enqueues into a durable server-side queue now instead of the old in-memory one, but it's only promoted into the live action queue lazily, the next time the queue drains itself with nothing else in flight. The check that lets one queued-but-not-yet-dispatched claim count as a valid launch point for the next click was never updated for that -- it only ever looked at the old in-memory queue -- so a tile still waiting behind an in-flight claim was invisible to it, and the very next click adjacent to it opened the tile menu instead of chaining onward.",
    changes: [
      "Chain-clicking adjacent neutral tiles to expand your border now keeps working past the first couple of tiles instead of stalling and opening the tile menu"
    ]
  },
  {
    createdAt: 1788373475633, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.02.15",
    title: "3D map: rival border lines no longer cross yours (real fix, not just the connect-time budget patch)",
    why: "The earlier fix for crossing border lines only patched how rival borders got pushed to you on connect -- but the 3D map's rival-border overlay itself still fell back to guessing a rival's territory from a plain union of their town/dock/outpost radii whenever authoritative server data hadn't arrived yet for that owner. That guess could never see the server's own contest resolution between neighboring empires, so two owners' boundary lines still didn't reliably land on the same shared line: they'd either miss each other or visibly cross. The 3D overlay now reads each tile's actual, already-contest-resolved reach owner straight from the tile data you already have, the same way ownership itself is drawn, instead of guessing.",
    changes: [
      "Rival territory borders on the 3D map are now traced from the server's real, already-resolved reach data instead of a local guess, so they no longer visibly cross your own or a neighbor's border"
    ]
  },
  {
    createdAt: 1788373600000, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.02.16",
    title: "Titanium and Thunder Bastions now appear on the 3D map after being built",
    why: "The 3D renderer only ever drew FORT, Wooden Fort, and Siege Outpost meshes — the TITANIUM_BASTION and THUNDER_BASTION variants were never wired into the fort overlay's instance switch, so a bastion tile stayed completely bare on the 3D map even though the game state had the active structure. Only the 2D canvas fallback (which reuses the same fort ring for all fort tiers) ever showed them.",
    changes: [
      "Titanium Bastions and Thunder Bastions now render on the 3D map with their own metal-tinted walls and towers, including the same gate opening as the 2D renderer"
    ]
  },
  {
    createdAt: 1788378181284, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.02.17",
    title: "New players now spawn farther from existing empires",
    why: "Joining players were placed at the first precomputed spawn site that happened to still be open, in the site roster's original fill order -- a spread-out roster overall, but not necessarily the best remaining choice once other players had already claimed nearby sites. Picking is now based on which open site is actually farthest from every currently-settled player, so a new empire lands with as much breathing room as the map allows instead of settling for whichever open slot came first in list order.",
    changes: [
      "Joining and respawning players are now placed on the open starting location farthest from every other player's territory, instead of just the first available site in the precomputed roster"
    ]
  }
];
export const CLIENT_CHANGELOG_ENTRIES: ClientChangelogEntry[] = [
  ...RECENT_CLIENT_CHANGELOG_ENTRIES,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_2,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_3,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_4,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_5,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_6,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_7,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_8,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_9
];
