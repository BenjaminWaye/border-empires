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
    createdAt: 1788293619717, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.02.3",
    title: "Expand clicks no longer vanish if you close the browser before they're sent",
    why: "Clicking to claim an adjacent tile queued the claim only in an in-memory client array that was never sent to the server until it was actually dispatched one at a time. Click expand several times in a row, close the browser before they all went out, and everything still waiting in that local queue was silently discarded on reload -- with zero record of it ever having existed, since it never reached the server in the first place. Multi-hop waypoint plans and \"Build Relay Beacon\" already avoided this by submitting through a durable, server-side queue that keeps draining even while offline.",
    changes: [
      "A plain adjacent-tile expand click now submits through the same durable server-side queue as multi-hop waypoint plans, so queued claims survive closing and reopening the browser"
    ]
  },
  {
    createdAt: 1788292380551, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.02.2",
    title: "Added a localhost-only developer login bypass (no player-facing effect)",
    why: "Testing gameplay and visual fixes end-to-end required a real Firebase sign-in even on localhost, which blocked automated/agent-driven testing against a local dev server. This entry exists only because this file gates all packages/client/src changes -- there is no change to how any real player signs in.",
    changes: [
      "On localhost only, opening the client with ?devPlayerId=<id> now authenticates directly as that player id instead of going through Firebase sign-in -- inert everywhere else, including staging and production"
    ]
  },
  {
    createdAt: 1788277344382, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.01.3",
    title: "Fixed ally buildings never appearing on the map, and a false \"missing weapons factory\" attack bonus",
    why: "Allying/unallying with another player only recorded the shared-vision change internally -- it never triggered the delivery of the resulting reveal/fog tiles to the client, which only happened to piggyback on some other, unrelated tile change happening anywhere in the world. On a quiet game, an ally's already-built structures could go unrendered on the map indefinitely despite the tile being genuinely visible. Separately, the map's fog-of-war logic also hid a tile's buildings the instant it fell outside your own live vision even though the territory tint itself stayed visible on such tiles, and the attack preview's \"missing Titanium/Umbrite Weapons Factory\" +100% attack bonus was computed only from tiles in the attacker's own subscribed vision, so breaking an alliance (which immediately drops the shared ally vision that used to cover the target's whole territory) could make the preview wrongly claim a target was missing a factory it actually had.",
    changes: [
      "Allying/unallying now reveals or fogs the other player's territory promptly instead of waiting on an unrelated tile change elsewhere in the world",
      "Buildings on a previously-seen but currently out-of-vision tile (e.g. an ally's territory) now stay visible on the map instead of disappearing",
      "The attack preview's weapons-factory attack bonus now reflects what the target actually owns, regardless of the attacker's current vision of them"
    ]
  },
  {
    createdAt: 1788275816752, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.01.2",
    title: "Dock/town/wonder sound cues no longer interrupt the war music",
    why: "Looking at a town, dock, or natural wonder tile plays a short one-shot theme that ducks the ambient music bed out and fades it back in afterward. That's the right behavior for the calm playlist, but it also fired during an incoming-attack or active-battle track, so clicking a dock mid-battle would silence the tension/combat music and then restart it from scratch a beat later -- cutting into the war music every time.",
    changes: [
      "Town/dock/wonder sound cues now just play on top of the war (incoming-attack or battle) music instead of pausing and restarting it"
    ]
  },
  {
    createdAt: 1788274601196, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.01.2",
    title: "Fixed collected Shards not showing up in your stock",
    why: "Collecting a Shard credited the strategic-resource ledger correctly, but the COLLECT_SHARD command handler was the only progression command that never invalidated the player's cached economy snapshot afterward -- so the shard stock shown to the client stayed frozen at its pre-collect value until some unrelated action happened to bust the cache later.",
    changes: [
      "Shard stock now updates immediately after collecting a Shard tile"
    ]
  },
  {
    createdAt: 1788237034064, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.01.1",
    title: "Removed fort garrison fill",
    why: "Forts used to hold a separate \"garrison\" pool that slowly refilled from wasted manpower overflow and drained a little on every repulsed assault, scaling the fort's combat defense bonus by how full that pool happened to be. That made a fort's real strength invisible and punished it for simply being attacked (even successfully defended attacks wore it down), on top of a defense system that's a flat multiplier everywhere else.",
    changes: [
      "A fort's defense bonus is now always fully applied while it's active -- no more partial bonus from an unfilled or worn-down garrison",
      "Removed the Garrison line from the fort tile menu; capturing a fort now simply shows the flat mustered-manpower requirement for its tier"
    ]
  },
  {
    createdAt: 1788208114112, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.31.4",
    title: "Fixed \"March To…\" muster orders never reaching your empire",
    why: "The gateway's SET_MUSTER message schema only allowed mode HOLD or ADVANCE -- MARCH was missing -- so every march order the client sent was rejected outright as a malformed message before it ever reached the simulation, and the muster flag silently stayed on its old mode.",
    changes: [
      "\"March To…\" now correctly arms and sends its target, and the muster flag switches to marching toward the chosen tile"
    ]
  },
  {
    createdAt: 1788208613354, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.31.5",
    title: "Reduced 3D map CPU/GPU load from the Aether Survey Line border overlay",
    why: "The border-pylon/line-segment placement pass recomputed a full visibility filter and every transition animation from scratch on every single rendered frame, even with the camera completely idle -- a captured performance trace showed this as the dominant, unthrottled main-thread and GPU cost, keeping the 3D renderer near-saturated continuously and driving unnecessary heat/fan load on laptops.",
    changes: [
      "The 3D map's border overlay now recomputes pylon/segment placement on the same throttle as terrain rebuilds instead of every frame -- already-placed pylons keep animating smoothly in between, so there's no visible difference, just lower CPU/GPU usage while the map is on screen"
    ]
  },
  {
    createdAt: 1788202192813, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.31.3",
    title: "Observatory's advertised +5 local vision now actually reveals tiles",
    why: "OBSERVATORY_VISION_BONUS was only ever read for display copy (the build menu, the structure info panel, the tile action tooltip) -- there was no equivalent of Relay Beacon/Siege Outpost's per-tile vision-coverage hookup for Observatory, so an active, fully-supplied Observatory granted no actual vision beyond your normal territory radius despite every UI surface promising +5.",
    changes: [
      "An active, non-dormant Observatory now reveals a flat 5-tile ring around itself, matching the +5 local vision already shown in its build menu and structure info panel",
      "The ring follows the same rules as Relay Beacon's: it withdraws while the Observatory is manually disabled, dormant for lack of a free CRYSTAL slot, or under construction, and is shared with allies the same way territory vision is"
    ]
  },
  {
    createdAt: 1788200369408, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.31.3",
    title: "Mercantile Charter's tile-overview line now names the domain",
    why: "The gold/growth bonus line for one of your first three towns showed up labeled \"First 3 towns\" -- accurate, but it didn't say which domain was actually responsible, so a player without Mercantile Charter memorized could easily miss the connection between the domain they picked and the bonus they were seeing.",
    changes: [
      "The tile overview's first-three-towns gold/growth bonus line is now labeled \"Mercantile Charter\" instead of the generic \"First 3 towns\""
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
    createdAt: 1788088003101, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.30.1",
    title: "Selecting a town, dock, or outpost-family structure now highlights its reach in green",
    why: "The aggregate border overlay shows your empire's whole reach, but not what any single building actually contributes to it -- with several towns, docks, and beacons dotted around, it was hard to tell at a glance how far one specific structure's reach disk extends.",
    changes: [
      "Selecting a town, dock, or an outpost-family structure (Relay Beacon, Siege Outpost, Siege Tower, Dread Tower) now green-tints every tile within that structure's own reach disk on the 2D map"
    ]
  },
  {
    createdAt: 1788088263076, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.29.5",
    title: "Relit the 3D map and fixed resource/town icons jittering while panning",
    why: "The sun light sat well off to one side of the map's fixed camera angle, so the faces of buildings and terrain the camera actually looks at stayed shadowed no matter where you looked. Separately, the small badge/marker icon layer over the 3D view (resource, dock, and town icons) redrew on a slower, throttled cadence left over from the old full 2D map renderer -- fine when panning snapped a whole tile at a time, but visible as lag/jitter now that panning moves the camera continuously every frame.",
    changes: [
      "The 3D map's key light now shines from roughly the same direction the fixed camera looks, instead of off to one side, so building and terrain faces read lit instead of shadowed",
      "Resource, dock, and town icons over the 3D map now redraw at close to full frame rate instead of a slower throttled cadence, so they no longer lag or jitter behind the terrain while panning"
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
    createdAt: 1788036933966, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.29.4",
    title: "Panning the 3D map now glides instead of snapping tile by tile",
    why: "The 3D camera used to jump a whole tile at a time on every pan, since the camera position itself was never tracked between tiles -- only the world's position relative to a fixed camera. Between that and the terrain-rebuild stutter fixed just before this, panning read as choppy even on a good connection.",
    changes: [
      "Dragging the 3D map now moves the camera continuously instead of snapping a full tile at a time"
    ]
  },
  {
    createdAt: 1788037445121, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.29.4",
    title: "Fixed a gap in the reach-border overlay around freshly-explored ground",
    why: "The border overlay only drew its dashed line and boundary pylons around reach tiles the client had already visually revealed through fog of war -- a Relay Beacon (or any outpost/dock/town) whose granted reach extended past your current vision left a gap in the drawn border exactly where you hadn't looked yet, even though the server already recognized that ground as yours.",
    changes: [
      "The reach-border trace and its land/water filtering now use the server's authoritative reach set directly instead of only the tiles your client has already seen, so the border line and pylons draw correctly right up to the edge of newly-explored territory"
    ]
  },
  {
    createdAt: 1788068704420, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.29.3",
    title: "Fixed Mercantile Charter's \"First 3 towns\" line still not showing up for existing towns",
    why: "The previous fix only stamped the \"First 3 towns\" bonus onto a town the first time it was fully rebuilt. The much more common per-tick refresh path that keeps gold/fed status current between those rebuilds recomputed your gold total correctly but never re-stamped the bonus line itself, so a town that already existed before you picked up Mercantile Charter kept showing no bonus indefinitely.",
    changes: [
      "The tile overview's \"First 3 towns\" line now stays in sync on every economy refresh, not just the rare full town rebuild"
    ]
  },
  {
    createdAt: 1788034981589, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.29.4",
    title: "iPhones now start the 3D map at slightly lower quality to avoid a first-visit crash",
    why: "iOS Safari is reported to enforce a much tighter memory ceiling on WebGL content than desktop or Android, and every previous fix only kicked in after a phone had already crashed once and reloaded -- meaning every iPhone player's very first visit ran at the configuration most likely to crash it, before the app had any evidence to react to.",
    changes: [
      "The 3D map on iPhone (and other iOS browsers) now starts without extra edge-smoothing on its very first attempt, instead of only backing off after a crash",
      "A phone that proves it can run the full-quality 3D map is unaffected -- this only changes the untested first attempt"
    ]
  },
  {
    createdAt: 1788071064537, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.30.1",
    title: "An Aether Condenser (or Titanium/Umbrite Works) in Sell Off mode now boosts its own town's gold, like Mintworks",
    why: "Sell Off mode gold used to always pay out as separate empire-wide income with no connection to any town, so building one in a town's support ring -- the same ring Mintworks, Garrison Hall, and Clearing House already boost that town from -- had no visible effect on that town's own gold production or its overview modifier list, which read as the building's income going nowhere.",
    changes: [
      "An active Sell Off (EXCHANGE mode) Aether Condenser, Titanium Works, or Umbrite Works (including Advanced tiers) built in a town's support ring now adds its gold straight into that town's own gold production instead of paying out as separate empire income",
      "The town's overview now shows a \"Sell Off gold\" modifier under a \"<count> <Building>\" heading for these buildings, matching how Mintworks and other support-ring buildings already show their contribution",
      "A converter built outside any town's support ring is unaffected -- its gold still pays out as separate empire income exactly as before"
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
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_7
];
