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
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_10 } from "./client-changelog-data-earlier-10.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_11 } from "./client-changelog-data-earlier-11.js";
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
    createdAt: 1788499023922, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.04.1",
    title: "ADVANCE and MARCH mustering flags now have real travel time too",
    why: "Manually-clicked attacks got real travel time and a marching-company visualization, but a flag's own ADVANCE/MARCH auto-fire attacks still resolved the instant the server dispatched them -- geography had no bearing on when an auto-fired attack landed, and there was nothing to see beforehand. Auto-fire is dispatched by the server with no client-side send delay to wait on, so this had to be a genuine mechanical delay in the server's own combat timing, not just a client-side wait.",
    changes: [
      "An ADVANCE/MARCH flag's auto-fired attack now waits for its funding flag's company to reach the front before combat resolves, at the same per-tile rate manual attacks already use",
      "The true-3D map now shows that march too: the same marching-company overlay manual attacks get, now also playing for ADVANCE auto-fire",
      "MARCH-mode auto-fire gets the same mechanical delay, but not yet the marching visualization -- MARCH attacks have no skirmish overlay at all client-side yet, a separate pre-existing gap"
    ]
  },
  {
    createdAt: 1788470470712, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.03.6",
    title: "Mustering flags now have real travel time -- and you can watch the company march there",
    why: "A muster-funded attack used to fire the instant you clicked it, no matter how far the funding flag actually was from the fight -- geography had no bearing on when an attack landed, and there was nothing to see between clicking and the 30-second siege starting. Manual attacks now genuinely wait for the flag's company to reach the front before the attack is even sent, and the true-3D map shows that march happening -- a company of dots walking the real tile-by-tile route from the flag to the target tile, dashing across any dock crossing along the way.",
    changes: [
      "A muster-funded manual attack now marches for real: the ATTACK isn't sent to the server (and its 30s combat lock doesn't start) until the funding flag's company actually reaches the front, instead of firing the instant you click",
      "The true-3D map now shows that march: a company of dots walks the real tile-by-tile route from your flag to the target, bending around corners and dashing across dock crossings, instead of no visualization at all",
      "ADVANCE/MARCH auto-fire attacks are unaffected -- this only changes manually-clicked attacks funded by a ready muster flag",
      "3D-renderer only for now -- the 2D canvas map fallback has no muster visualization of any kind yet, matching its existing gap for muster flags in general"
    ]
  },
  {
    createdAt: 1788468553704, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.03.6",
    title: "Fixed settled tiles staying settled after your border retreats past them",
    why: "Losing ground to a rival only ever unsettled the exact tile they overtook -- if that tile was the only corridor connecting one of your settled tiles (or a whole pocket of them) back to any of your own towns/outposts/docks, the stranded ground stayed marked as settled indefinitely instead of reverting to frontier, unless a rival later happened to contest that exact spot too.",
    changes: [
      "A border change now also sweeps outward from the affected tile for any of your other settled ground it just cut off from every one of your live anchors, and reverts it to frontier in the same update"
    ]
  },
  {
    createdAt: 1788468575080, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.03.5",
    title: "Fort no longer blocks building an Aether Tower on the same tile",
    why: "A Fort was rejecting every other structure build on its tile except a Relay Beacon, including the Aether Tower (Observatory) -- but a Fort and a Siege Outpost are the only structures that genuinely can't share a tile field. Aether Tower belongs on its own tile field and has no real conflict with a Fort.",
    changes: [
      "You can now build an Aether Tower on a tile that already has a Fort. A Siege Outpost still can't be built on a Fort tile."
    ]
  },
  {
    createdAt: 1788458684672, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.03.4",
    title: "ADVANCE mustering flags now strike the nearest enemy tile, not just whichever one the search reaches first",
    why: "ADVANCE auto-fire used to stop its search the instant it found any attackable enemy tile, so once nearby fronts were locked by other combat (including your own sibling flags) it could keep walking through your territory and end up firing on a tile far across your empire, simply because that was the first unlocked tile it happened to reach -- even when a genuinely closer target existed nearby.",
    changes: [
      "ADVANCE auto-fire now compares every reachable attackable enemy tile and strikes the one nearest the flag instead of the first one its search encounters",
      "Added a hard range cap: if the nearest reachable target is too far away (every closer front locked or contested), the flag idles instead of launching a moon-shot attack on the far side of the map",
      "The range cap is measured in hops through owned territory, not raw map distance, so a flag on a dock is still not penalized for a legitimate cross-water strike"
    ]
  },
  {
    createdAt: 1788462934856, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.03.4",
    title: "Fixed being able to build more than one of the same monument component",
    why: "Each monument component (e.g. Imperial Exchange's Golden Ledger) is meant to be a unique one-of -- a player assembles exactly one of each of a monument's 3 parts before the monument itself can go up. Nothing stopped building the same part type on multiple tiles instead of building the other two, so a player could stockpile duplicates of one part and never actually assemble the monument. The build menu also didn't warn about this until the server rejected the command.",
    changes: [
      "Building a monument component you already own (anywhere, active or still under construction) is now rejected server-side",
      "The build menu button for a component you already own is now disabled up front and shows \"Part already built in nearby town\" instead of only failing after you submit"
    ]
  },
  {
    createdAt: 1788434136633, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.03.3",
    title: "Fixed muster flags surviving on tiles you just captured deep in enemy territory",
    why: "ATTACK only requires your origin tile to be owned, not the target to be inside your own live vision -- so a raid chained through your own previously-claimed (possibly out-of-reach) frontier ground could capture a tile you have no coverage of at all. The server always destroyed the defender's muster flag on capture, but the corrected tile update was only ever force-delivered to the defender who lost it, not to you as the attacker. If the newly-captured tile sat outside your own vision, your own game's normal visibility check silently dropped that update, leaving your client showing the enemy's stale muster flag on ground that was already yours.",
    changes: [
      "A captured tile's resolved state (ownership, and any muster flag being cleared) is now always force-delivered to the attacker as well as the previous owner, regardless of whether the tile is inside the attacker's own current vision"
    ]
  },
  {
    createdAt: 1788433124761, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.03.2",
    title: "Fixed muster flags surviving on tiles auto-claimed from a previous owner",
    why: "A tile that lost its owner without going through a normal capture (e.g. cut off by encirclement, or decayed and then re-entering someone's reach border) could still be carrying a stale muster flag -- and its pooled manpower -- staged by whoever held it before. The instant-claim-on-reach path that grants such neutral tiles to the new owner for free copied that leftover flag straight over instead of clearing it, so a captured/claimed tile could visibly show an enemy's muster marker on ground you now owned.",
    changes: [
      "Auto-claiming a neutral tile via reach now always strips any leftover muster flag from a previous owner, matching every other ownership-changing path (attack/expand capture, encirclement cutoff, out-of-reach decay)"
    ]
  },
  {
    createdAt: 1788432985707, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.03.3",
    title: "Fixed occasional camera stutter while panning the 3D map",
    why: "The true-3D renderer rebuilds its visible terrain window whenever tilesRevision changes, but that counter bumps on any visually-relevant tile change anywhere on the whole known map -- not just tiles near your camera. An opponent building on the far side of the world, or a distant frontier decay tick, was forcing a full rebuild of your entire visible terrain (mesh, roads, ~25 overlays) even though nothing on screen changed, and could collide with a pan-triggered rebuild to cause a visible stutter.",
    changes: [
      "The 3D renderer's terrain rebuild now only fires for a tile change when the changed tile actually falls inside your current camera view, instead of any tile change anywhere on the map"
    ]
  },
  {
    createdAt: 1788430951671, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.03.2",
    title: "Fixed the 3D border line briefly following the camera during a pan",
    why: "The 3D border/reach overlay's pylons and connecting lines are placed relative to a fixed terrain anchor that only jumps when the terrain streamed around the camera actually rebuilds, and their own placement recompute is throttled separately (for idle-camera performance) from that terrain rebuild. A rebuild landing inside that placement throttle's cooldown window left the border rendering at its stale, pre-rebuild position for a moment after the terrain and camera had already moved on -- reading as the border briefly detaching and drifting with the pan before snapping back into place.",
    changes: [
      "The 3D border line (Aether Survey Line) and its glow no longer visibly detach and follow the camera for a moment mid-pan before snapping back -- it now re-anchors in the same frame as every terrain rebuild"
    ]
  },
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
    createdAt: 1788420347209, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.03.1",
    title: "You can now hold a truce with more than one empire at a time",
    why: "Truces and truce offers were capped globally: accepting or offering a truce with anyone blocked you from having any other active truce or pending outgoing offer, even with a completely different empire. Alliances were never capped this way -- you could always ally with multiple players at once -- so the truce restriction was an inconsistent, unannounced limit rather than an intentional design constraint. Truces are now tracked per pair of players, matching how alliances already worked.",
    changes: [
      "Truces (and pending outgoing truce offers) are no longer limited to one at a time -- you can hold an independent truce, or have a pending offer, with each opponent separately",
      "Offering, accepting, or having an active truce with one empire no longer blocks truce actions toward any other empire"
    ]
  },
  {
    createdAt: 1788463537342, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.03.1",
    title: "Space View follow-ups: one launcher button, real Influence/Production, and a fixed Manage Planet action",
    why: "Early feedback on the first Space View pass found the chrome carried over more of the season HUD than belonged there, and a real bug: Manage Planet appeared to do nothing because the overlay it opens lives inside #hud, which Space View hides via CSS visibility -- and visibility is inherited, so the overlay stayed invisible even once it was no longer [hidden] itself.",
    changes: [
      "Manage Planet now actually opens the planet/christening overlay -- it was rendering correctly all along, just invisible, since #hud's visibility:hidden (used to hide the season HUD behind Space View) was silently inherited by the overlay nested inside it",
      "The Space View launcher is now the single button in both directions: it opens Space View from the season HUD and doubles as the return-to-season action once inside, so there's no separate \"Return to Season\" button anymore",
      "That launcher now sits above the minimap (matching where the old galaxy overlay's launcher used to sit) instead of overlapping its top edge",
      "The top bar now shows the account's real Influence and Production balance (when the gateway's galactic economy is wired up; 0/0 otherwise) instead of the season's Food/Titanium/Crystal/Umbrite/Shard ribbon, which has no meaning at the galactic layer"
    ]
  },
  {
    createdAt: 1788297789549, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.01.1",
    title: "Space View: a navigable 3D galaxy screen for planet-owning empires",
    why: "The galactic meta-layer's persistent planet records existed with no way to actually look at the galaxy -- only a flat placeholder overlay. Players who've won a durable galaxy Planet now get a real, full-screen 3D scene to see their holdings and the wider galaxy in, laying the groundwork for the galactic layer's future systems.",
    changes: [
      "New Space View screen (a 🌌 launcher button, shown only to accounts owning at least one galaxy Planet) with a real 3D starfield/nebula backdrop, orbit-controllable camera, and planets rendered as glowing shader-lit spheres",
      "Planets are visually distinguished by state: your own worlds glow bright, other-owned worlds render dim/neutral, unclaimed frontier worlds are near-invisible markers, and contested worlds pulse a warning ring -- though no backend signal for contestation exists yet, so that state is currently unreachable in practice",
      "Click a planet to signal re-entering its Sector campaign (season) -- dragging to orbit the camera no longer misfires this, only a genuine stationary click of the primary button does; the callback seam itself is wired and typed, but doesn't yet switch seasons",
      "Space View is 3D-only for this first pass, with no 2D fallback -- unlike the existing tile map, it has no accessibility renderer yet",
      "Planet owners see one entry-point button, not two -- Space View absorbs the old galaxy overlay's launcher, which stays reachable from a new \"Manage Planet\" action inside Space View for christening your planet's name and endorsing an Emperor candidate. Outpost/Stipend-only accounts (no Planet, so no Space View) keep the old launcher as their only entry point",
      "An account's own Outpost, not just its Planet(s), now correctly highlights as owned in the scene rather than rendering as an unclaimed/rival world"
    ]
  },
  {
    createdAt: 1788379533532, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.02.16",
    title: "March-To now marks its destination tile, can be cancelled there, and holds war music longer",
    why: "A \"March To…\" order gave no visual sign of where the flag was actually headed, and cancelling it required going back to the origin flag's own menu -- unlike a waypoint, whose destination tile marks itself and offers a one-click cancel. Separately, the war-music soundtrack re-evaluated combat/tension every frame straight off live signals (an ADVANCE/MARCH flag, an active battle), so a manual attack that resolved in a couple of seconds -- with no muster flag involved -- flipped the track straight back out of war music, and a March-To order itself didn't count as combat at all until an actual skirmish landed.",
    changes: [
      "March-To now plants a war-red flag marker (reusing the waypoint flag model) on the tile you're marching toward -- true-3D renderer only for now; the 2D-fallback renderer doesn't draw a waypoint flag marker either, so this doesn't introduce a new gap between them",
      "Clicking that destination tile now offers Cancel March, the same way a waypoint's destination offers Cancel Waypoint",
      "Setting a March-To order now counts as combat immediately, so the soundtrack switches to war music right away instead of waiting for the first attack to land",
      "War/combat music now holds for 2 minutes after the last live combat signal instead of dropping straight back to tension/calm the instant a manual attack resolves",
      "Fixed the destination tile's Cancel March action sometimes cancelling the wrong flag, and the marker/menu pool being sized too small, when several of a player's own flags share a destination or one tile is both an origin and a destination"
    ]
  },
  {
    createdAt: 1788380033810, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.02.1",
    title: "Settle + Build Relay Beacon shows construction immediately, not just after reselecting the tile",
    why: "Settling a tile and having it auto-start a structure build (e.g. \"Settle and Build Relay Beacon\") ran two server-side steps in the same instant: the build tail started the structure, then the settle step broadcast its own tile update built from a snapshot taken just before the build ran. That stale snapshot explicitly said \"no structure here,\" which arrived after the build's own update and wiped it from the client's view -- the tile just looked settled with no construction indicator or timer until you clicked it again, which force-fetched the real (and correctly in-progress) server state.",
    changes: [
      "A tile with an auto-started structure build now shows its construction indicator and timer right away instead of only after reselecting the tile"
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
    createdAt: 1788128230679, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.30.7",
    title: "Fixed Trade Nexus showing a duplicate 2D overlay on the 3D map",
    why: "Trade Nexus (CARAVANARY) draws its own dedicated range overlay directly in the 3D renderer, bypassing the generic 3D structure-overlay set that the 2D canvas checks to decide whether to skip its own overlay image. Because Trade Nexus wasn't in that set, the 2D fallback overlay kept drawing on top of the 3D one for every player on the 3D renderer.",
    changes: [
      "Trade Nexus no longer shows a flat 2D overlay image layered on top of its 3D range overlay"
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
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_9,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_10,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_11
];
