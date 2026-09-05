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
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_8 } from "./client-changelog-data-earlier-8.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_9 } from "./client-changelog-data-earlier-9.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_10 } from "./client-changelog-data-earlier-10.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_11 } from "./client-changelog-data-earlier-11.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_12 } from "./client-changelog-data-earlier-12.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_13 } from "./client-changelog-data-earlier-13.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_14 } from "./client-changelog-data-earlier-14.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_15 } from "./client-changelog-data-earlier-15.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_16 } from "./client-changelog-data-earlier-16.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_17 } from "./client-changelog-data-earlier-17.js";
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
    createdAt: 1788558265905, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.04.14",
    title: "Building a structure on a forest tile now clears its trees in the true-3D renderer too",
    why: "The true-3D renderer added a forest instance to every forest tile unconditionally, with no regard for whether an economic structure had since been built there -- so trees kept showing through/around a built structure in 3D even though the 2D canvas renderer already correctly clears them (its structure sprite paints over the tile). The two renderers disagreed on what a built forest tile should look like.",
    changes: [
      "The true-3D renderer no longer places a forest tree instance on a tile once an economic structure is built there, matching the 2D renderer's existing behavior"
    ]
  },
  {
    createdAt: 1788555326849, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.04.13",
    title: "Attacks that couldn't stage a new muster flag, or whose staged flag wasn't right on the border, now still launch",
    why: "Attacking an enemy-owned tile with no adjacent or remotely-funded ready flag nearby makes the client auto-create a fresh muster flag on your origin tile to stage the attack. If you were already at your muster-flag cap, that auto-create was silently rejected with MUSTER_LIMIT and the attack just sat parked until a 5-second timeout cancelled it outright. Separately, a staged attack only ever launched once its funding flag literally bordered the enemy tile, even though the server funds an ATTACK from any owned flag within 10 tiles of wherever you're actually attacking from -- the same remote-funding range ADVANCE auto-fire already relies on -- so a flag a few tiles back that had already filled up never got used.",
    changes: [
      "When staging a new muster flag for an attack hits the muster-flag cap, the attack now reroutes onto your closest usable existing flag and waits for it to fill/march instead of being cancelled",
      "A staged attack now also launches once any owned flag within remote-funding range of your attacking tile is ready, not only one standing directly on the enemy's border",
      "A feed message now explains when a reroute happens, naming which existing flag the attack will use"
    ]
  },
  {
    createdAt: 1788554890356, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.04.13",
    title: "Aether Purge is now actually blocked by a defending Aether Tower",
    why: "The only real check AETHER_LANCE (\"Aether Purge\") ran server-side was for an enemy Aegis Dome -- an enemy Aether Tower's protection was purely a client-side courtesy that only decided what a well-behaved client greyed out as untargetable, so it never stopped the ability from actually landing. A target within a defending, active, off-cooldown Aether Tower's protection radius could still be purged.",
    changes: [
      "AETHER_LANCE (Aether Purge) now rejects server-side when the target is within an enemy's active, off-cooldown, non-dormant Aether Tower's protection radius, matching what the client already implied was true"
    ]
  },
  {
    createdAt: 1788522282038, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.04.2",
    title: "Researching Grand Bazaars, Grand Levy Doctrine, and other Aether Tower-powered techs also unlocks the Ambaric Transformer Station",
    why: "Imperial Exchange, Titanium Levy, World Engine, Aegis Dome, Astral Dock, Airport, and Radar System all need a nearby active Ambaric Transformer Station (Aether Tower) to power their abilities -- but the tower's own tech (Ambaric Engineering) lived in a completely separate branch (plastics/industrial-extraction) from any of theirs. A player could research and build one of those seven, then find its ability permanently unusable unless they also detoured through an entire unrelated tech branch just to be able to build the tower it needs power from, with no warning anywhere in the tech tree that the two were linked.",
    changes: [
      "Researching any of Grand Bazaars, Grand Levy Doctrine, Worldbreaker Doctrine, Aegis Doctrine, Astral Doctrine, Sky Vessel Engineering, or Resonance Detection now also unlocks the Ambaric Transformer Station for free, immediately",
      "Ambaric Engineering is no longer a separate, standalone tech to research on its own -- it's only ever granted as part of researching one of the 7 techs above",
      "Each of those 7 techs now shows an \"Aether Tower\" tag on its tech-tree card, so it's visible up front that researching it also unlocks the Ambaric Transformer Station"
    ]
  },
  {
    createdAt: 1788552677550, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.04.5",
    title: "MARCH mustering flags now claim neutral ground blocking their route, instead of idling",
    why: "MARCH auto-fire only ever attacked enemy tiles reachable through territory you already owned -- if the route to your march target ran through unclaimed land instead of an enemy border, the flag just idled, even though claiming that ground was exactly what a player would do by hand to keep advancing.",
    changes: [
      "A MARCH flag now expands onto a neutral tile blocking its route to the target when no enemy tile is reachable at all, instead of idling -- an attackable enemy tile still always wins over expanding when both are reachable",
      "Every command a MARCH (or ADVANCE) flag issues -- attacks and, now, expands alike -- is attributed to the flag's own tile for mechanical travel-time purposes, so an expand claimed by a MARCH flag takes real time to complete just like an attack does, rather than resolving instantly regardless of distance"
    ]
  },
  {
    createdAt: 1788553008691, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.04.12",
    title: "Aether Tower descriptions now show the protection radius and cooldown caveat",
    why: "The Aether Tower's build tooltip and tile-menu status line both claimed it \"blocks hostile crystal actions nearby\" without ever stating the radius, and without saying that the block only applies while the tower is off cooldown -- pickReadyOwnedObservatoryForTarget/hostileObservatoryProtectingTileAt already skip a tower on cooldown when computing protection, so an owner reading the old copy could reasonably assume a nearby tower always shields them, even mid-cooldown, and be surprised when an Aether Purge went through.",
    changes: [
      "Aether Tower's build tooltip now states its exact protection radius",
      "The tile-menu status line for an active Aether Tower now says explicitly when it is on cooldown and therefore not currently blocking hostile crystal actions"
    ]
  },
  {
    createdAt: 1788552669215, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.04.12",
    title: "Captured forts and economic structures now auto-settle",
    why: "A captured tile always landed as Frontier, and a Frontier tile's fort or economic structure produces no income and is barely defensible -- so a captured building sat idle until you remembered to manually Settle it. Towns and docks already had this problem solved for the out-of-reach case; this extends the same auto-settle behavior to any captured building, on any capture.",
    changes: [
      "A captured fort, observatory, or economic structure now tries to auto-settle immediately, at the same manpower/points cost and development-slot requirement as a manual Settle",
      "If you can't afford it or have no free development slot, the tile falls back to landing Frontier as before, so you can settle it manually once you're able to"
    ]
  },
  {
    createdAt: 1788534052315, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.04.4",
    title: "Aether Purge alerts now show the attacker's real display name",
    why: "The simulation never learns a player's real display name -- ATTACK_ALERT already got its attackerName patched up to the attacker's live profile name at the gateway, but AETHER_PURGE_ALERT was left out of that same hydration path, so a purge from a player with a set display name still showed the anonymized \"Empire XXXXXX\" fallback in both the in-app alert and the email.",
    changes: [
      "Aether Purge in-app alerts and emails now show the attacker's real display name when they have one set, instead of always falling back to an anonymized Empire ID"
    ]
  },
  {
    createdAt: 1788511900000, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.04.11",
    title: "The Galactic Senate is now reachable from Space View",
    why: "The Senate backend (Galactic Senate v1) shipped with no way for a real player to use it -- proposing and voting only existed as raw HTTP endpoints. This adds the missing client surface: a Senate panel inside Space View, next to Manage Planet and Settings.",
    changes: [
      "New Senate button in Space View opens a panel listing recent proposals and lets you cast a Dominion-weighted vote on any still-pending one",
      "The same panel lets you raise a new Embargo or Contest proposal against any publicly held territory other than your own",
      "Clear inline messages for the common failure cases: not enough Influence, not a Planet-holder, target on cooldown, or already voted"
    ]
  },
  {
    createdAt: 1788511800000, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.04.10",
    title: "Defense Campaign seasons now actually spin up and transfer ownership",
    why: "A passed Senate CONTEST vote already forced a territory's Stability to 0, but nothing turned that into a real consequence -- no season ever opened to fight over it, so a Contest was a permanent, un-actionable stability hit rather than the reopened-territory mechanic the design intends. This wires up the missing half: contested territories now automatically queue for and spin up as real seasons, and winning one transfers ownership going forward.",
    changes: [
      "A passed CONTEST now also queues its target territory for a Defense Campaign season, in addition to zeroing its Stability",
      "The natural end-of-season rollover now automatically opens a Defense Campaign season for the oldest queued target roughly two out of every three times a new season starts, reserving the remaining slot for a fresh Frontier campaign",
      "Winning a Defense Campaign season transfers ownership of the original contested territory to you going forward -- it shows up under your held Planets, and its Stability resets to full under your ownership",
      "Planet naming rights are not affected by a Defense Campaign transfer -- they permanently stay with whoever first won and named that territory"
    ]
  },
  {
    createdAt: 1788504160127, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.04.3",
    title: "Fixed enemies keeping settled tiles inside your own borders after a server restart",
    why: "Your reach border isn't saved -- it's rebuilt from your towns/outposts/docks every time the server restarts. That rebuild was skipping the contest that normally decides who keeps contested ground, so if your reach covered a tile a rival held settled, the border quietly became yours while the tile itself stayed theirs. Nothing ever reconciled the two, and because the rebuild ran the same way on every restart, it re-created the same split every time -- leaving rivals parked on settled tiles (resource deposits included) deep inside your border indefinitely.",
    changes: [
      "The border rebuild on server start now runs the same contest a live border push does: a rival settled tile your reach covers is either left alone because they still cover it themselves, or taken and reverted to frontier -- no more permanent split between who owns a tile and who owns the border under it",
      "Existing tiles stuck in that state are reconciled automatically on the next server start"
    ]
  },
  {
    createdAt: 1788466496585, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.04.1",
    title: "Galactic Senate v1 (backend only -- not reachable from the UI yet)",
    why: "The galactic meta-layer's Cycle economy engine (Influence/Production trickle, Stability drain/recovery) has been running live since Space View shipped, but the doc's other half -- the Senate -- didn't exist at all: no way for empires to act on each other politically, only the passive economy tick. This ships a first slice: EMBARGO and CONTEST proposals, Dominion-weighted voting, and quorum resolution on a shared galaxy-wide Cycle clock. There is no client UI for any of this yet -- it's reachable only via the new HTTP endpoints -- so no real player can trigger it today; this entry exists only because the changelog gate covers server behavior changes too.",
    changes: [
      "New endpoints: POST /hq/galaxy/senate/propose (raise an EMBARGO or CONTEST proposal against a held territory, costing Influence), POST /hq/galaxy/senate/vote (cast your Dominion-weighted vote), GET /hq/galaxy/senate (recent proposals)",
      "Proposals resolve automatically once the galaxy's shared weekly Cycle clock advances past the Cycle they were raised in, requiring both a quorum percentage of total galaxy voting weight and at least 3 distinct voters to pass",
      "A passed EMBARGO halves the target empire's Influence/Production trickle for 2 Cycles; a passed CONTEST forces the named territory's Stability to 0 immediately -- though nothing yet turns that into an actual Defense Campaign season, since no season-creation hook for it exists yet",
      "Each target has a per-action cooldown after a proposal against it resolves (1 Cycle for EMBARGO, 2 for CONTEST) before the same action can be raised against them again",
      "Weapons Inspection, Blockade, Travel Ban, War Reparations, and the Terrain vote are deliberately not included in this pass -- the first four act on Fleets, which don't exist yet"
    ]
  },
  {
    createdAt: 1788469164663, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.03.1",
    title: "AI empires now truce when their manpower runs low",
    why: "An AI player's truce auto-responder judged whether to accept a truce from a stale, seed-time snapshot of its economy and territory that never reflected real battle losses, so an AI could be fighting on fumes and still keep rejecting every truce offer. The decision now reads the AI's actual current manpower straight from the simulation, and manpower -- its real remaining capacity to keep fighting -- is the only thing it weighs.",
    changes: [
      "AI players now accept a truce once their manpower runs low relative to their own cap, based on their true current strength instead of a stale snapshot"
    ]
  },
  {
    createdAt: 1788503276365, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.04.2",
    title: "MARCH mustering flags now show the marching-company visualization too",
    why: "MARCH-mode auto-fire attacks already got the mechanical travel-time delay, but the client only ever recognized ADVANCE's own command prefix as a server-dispatched muster attack -- so a MARCH flag's attack never got a skirmish overlay or a marching company on the map, even though the same march was genuinely happening.",
    changes: [
      "MARCH auto-fire attacks now show the same marching-company overlay and pre-resolution skirmish ADVANCE auto-fire attacks already show"
    ]
  },
  {
    createdAt: 1788469315776, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.03.6",
    title: "Manage Planet no longer gets buried behind the Space View screen",
    why: "The Space View launcher and full-screen map were mounted as siblings of the HUD element instead of inside it, so their z-index always painted above the HUD's entire stacking context -- including the Manage Planet overlay, which lives inside the HUD so it can layer correctly against other HUD overlays. Opening Manage Planet from within Space View rendered it underneath the Space View screen, invisible until Space View was closed.",
    changes: [
      "Manage Planet now opens on top of the Space View screen as intended, instead of being hidden behind it until you leave Space View"
    ]
  },
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
    createdAt: 1788469608148, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.03.6",
    title: "Fixed two hovering map badges that stopped appearing: town upgrade-ready and Aether Tower cooldown",
    why: "The town's upgrade-ready badge was computed correctly by the simulation but stripped out before reaching any client by a snapshot field allowlist, so it never showed for anyone, including the town's own owner. Separately, the Aether Tower's crystal-cooldown badge was still being added to the scene every frame, but the badge's float height was never raised when the Aether Tower got its full 3D model, so the badge ended up floating inside the tower's own solid geometry and was invisible even though the paused countdown in the tile overview was correct the whole time.",
    changes: [
      "The town upgrade-ready badge now correctly appears over any of your towns eligible to upgrade to the next population tier.",
      "The Aether Tower's recharging badge now floats above the tower instead of inside it, so it's visible again while the tower is on cooldown."
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
    createdAt: 1788515318987, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.03.1",
    title: "Fixed a repeating \"tile already has structure\" error while queued buildings drain",
    why: "The server-side dev-queue auto-drain (which exists so queued builds/settles keep progressing while a player is offline) fired on every freed development slot regardless of whether the player's own client was connected and already draining the same queue -- so an online player's client and the server could both dispatch the same queued build. The loser hit a real BUILD_INVALID \"tile already has structure\" rejection once the winner's structure landed. The waypoint/expand queue already stands down while its owning client is online; the build/settle queue never got the equivalent guard.",
    changes: [
      "The server no longer auto-drains a player's build/settle queue while that player is online -- their own client now owns dispatch exclusively, the same as it already did for the waypoint/expand queue",
      "Queued builds no longer occasionally throw a spurious \"tile already has structure\" error toast"
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
    createdAt: 1788465026903, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.03.01",
    title: "Aether Towers can now be switched off and back on, like any other structure",
    why: "Every Aether Tower you own occupies CRYSTAL slots, and progressively more of them per tower -- the 1st costs 1 slot, the 2nd costs 2, and so on. Economic structures have always had an Enable/Disable switch for exactly this situation, but the tower had none: the only way to stop paying its CRYSTAL bill was to demolish it and lose the build cost. The tile menu's Disable button simply wasn't there for towers.",
    changes: [
      "An owned, finished Aether Tower now has Disable / Enable actions in its tile menu",
      "A disabled tower stops occupying CRYSTAL slots, stops giving its vision bonus, and stops powering crystal abilities and Sky Docks -- the tower itself stays built and can be switched back on at any time",
      "Disabling a tower also frees the progressive CRYSTAL rank behind it, so your remaining towers get cheaper, not just fewer"
    ]
  },
  {
    createdAt: 1788536800696,
    introducedIn: "2026.09.04.1",
    title: "Defenders now see an approaching company for an incoming attack's full travel-time window",
    why: "Muster flags now have real mechanical travel time before an attack lands, but the incoming-attack skirmish animation on the defender's side still only played its normal ~3.4s approach before clashing, regardless of how long the attacker's company actually had left to march. A defender could see troops already fighting on a tile that, mechanically, hadn't been reached yet.",
    changes: [
      "An incoming attack's skirmish animation now holds its \"company approaching\" stance for the attacker's real remaining travel time instead of clashing after a fixed ~3.4s, without ever revealing the attacker's muster flag location — only the general direction was ever shown"
    ]
  },
  {
    createdAt: 1788552891612,
    introducedIn: "2026.09.04.2",
    title: "Fixed Aether Bridge rejecting every target as \"not coastal land\"",
    why: "Worldgen flips any sea tile touching land -- including diagonally -- into LAND, so genuine open sea is never orthogonally adjacent to a land tile, only diagonally. The Aether Bridge's coastal-land check (both the server's validation and the client's targeting/highlight logic) only looked at the 4 orthogonal neighbors, so it could never find a real coastal tile and rejected every target with \"target must be coastal land\".",
    changes: [
      "Aether Bridge targeting and casting now check all 8 neighboring tiles for open sea, so real coastal land is recognized again and the ability can be cast"
    ]
  },
  {
    createdAt: 1788552483010, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.04.12",
    title: "Muster flags now say what they're actually doing: traveling, fighting, or planning their next move",
    why: "An Advance or March flag's tile menu, HUD panel row, and on-map alert only ever said \"Advancing\"/\"Holding\" -- with no way to tell whether it was mid-fight, waiting out its auto-fire cooldown, or just idle. A March flag was worse off: it fell all the way through to the generic \"Holding\" text since only Advance was special-cased, hiding its real target and progress. The server now tracks each flag's live auto-fire status (in combat vs. cooling down, and which enemy tile it's fighting for) and syncs it down so all three surfaces show the same real story.",
    changes: [
      "Muster flags now show \"Fighting at (x, y)\" while an attack they funded is in progress, instead of just \"Advancing\"",
      "An idle Advance/March flag now shows a live \"Planning next move — Ns\" countdown to its next auto-fire search instead of no timing info at all",
      "That countdown now says why it's waiting when it can: \"No target within range\" when nothing attackable exists nearby, or \"Not enough manpower for the nearest target\" when a real target is in range but this flag can't afford to hit it yet",
      "March flags now get their own accurate status text (fighting/cooldown/target) instead of silently falling back to the generic \"Holding\" wording meant for Hold-mode flags"
    ]
  },
  {
    createdAt: 1788555541310, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.04.13",
    title: "Fixed the daily activity digest reading much shorter than the day actually was",
    why: "Every headline was scored on a 0-100 scale, hard-clamped at 100 -- so on a genuinely big day, several unrelated metrics (a 226-tile defeat, a 301-tile war, 4,424 manpower spent attacking) all simultaneously blew past their calibration and tied at the ceiling, with only the first few in build order surviving. Worse, a specific-tile headline (Bloodiest Battle, Fiercest Fighting) was dropped whenever it named the same two players a higher-ranked headline already had, even though naming the actual location is new information, not a repeat.",
    changes: [
      "Headline scores are no longer clamped at 100, so a real outlier day ranks its headlines by how big each one actually was instead of several tying at the ceiling",
      "A headline naming a specific tile (Bloodiest Battle, Fiercest Fighting) is no longer dropped just because it shares its two players with an already-told headline -- the location itself is new information"
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
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_7,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_8,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_9,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_10,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_11,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_12,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_13,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_14,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_15,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_16,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_17
];
