// Changelog entry data only, split out from client-changelog.ts (rendering/
// visibility) to keep that file under the 500-line cap. Entries are unordered —
// client-changelog.ts sorts by createdAt. Move old entries to
// client-changelog-data-earlier.ts when this file approaches the cap.
import { CLIENT_CHANGELOG_ENTRIES_EARLIER } from "./client-changelog-data-earlier.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_2 } from "./client-changelog-data-earlier-2.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_3 } from "./client-changelog-data-earlier-3.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_4 } from "./client-changelog-data-earlier-4.js";
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
    createdAt: 1788165165486, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.31.1",
    title: "Fixed dock sea-route lines not showing at all",
    why: "The prior fix that moved dock sea-route computation server-side never actually reached players -- the wire types between the simulation and the gateway (and the runtime's own exported dock state) were never updated to carry the new route field, so it was silently dropped before the gateway could attach it to a dock pair, and every dock fell back to the client's still-unreliable route computation.",
    changes: [
      "Dock-to-dock sea route lines now render again, using the server-computed authoritative route"
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
    createdAt: 1788127049993, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.30.6",
    title: "The Buildings tab now shows Palisade and Fort options on a Relay Beacon tile",
    why: "The server was already updated to let a Palisade or Fort build go ahead on a tile with an existing Relay Beacon, but the Buildings tab's own menu logic still hid both options outright whenever any economicStructure was present -- so a Relay Beacon tile's Buildings tab showed only Observatory, with no way to even attempt the build the server now allows.",
    changes: [
      "The Buildings tab now shows \"Build Palisade\" and \"Build Fort\" on a tile with an existing Relay Beacon, matching what the server already permits"
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
    createdAt: 1788033792915, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.29.3",
    title: "Reduced camera pan stutter in the 3D map",
    why: "Every pan drag used to force a full terrain rebuild on every single tile crossed, because the terrain and every overlay were re-baked to sit exactly on the live camera position. Rebuilding is expensive (re-uploading a padded window of tiles to the GPU), so a brisk drag could ask for far more rebuilds per second than the render loop could actually keep up with, showing up as stutter/frame drops layered on top of the pan itself.",
    changes: [
      "Panning the 3D map now rebuilds terrain only when the camera actually needs tiles outside its already-built window, instead of on every tile crossed -- cutting rebuild frequency roughly 4-5x during a typical drag at the default zoom level"
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
    createdAt: 1788029295167, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.29.3",
    title: "Attacking a fort now costs a random amount tied to its size, not to whether you won",
    why: "Manpower lost attacking always cost a small flat fraction on a win and a much larger fraction on a loss -- the same direction the power gap already pushes win chance, so a strong empire attacking a weaker one paid less per win on top of already winning more often, while a weaker empire that dared to fight back paid more on top of already being unlikely to win. That compounded the rich-get-richer effect instead of counterbalancing it.",
    changes: [
      "Manpower lost attacking a SETTLED tile is now a random amount within a range set by the target's fortification, regardless of whether the attack wins or loses: no fort 40-60, Palisade 100-150, Fort 200-300, Titanium Bastion 350-480, Thunder Bastion 800-960",
      "The manpower you must have mustered to launch the attack now matches that range's top end, and is set purely by the target's fort tier -- no longer scaled by how full the fort's garrison happens to be (garrison fill still affects the fort's defense strength itself, just not the muster gate)"
    ]
  },
  {
    createdAt: 1787999763164, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.29.2",
    title: "Titanium Bastion and Thunder Bastion cost more manpower to build",
    why: "All three top fort tiers (Fort, Titanium Bastion, Thunder Bastion) cost a flat 300 manpower to build despite defending at very different strengths (2.5x/4x/8x), so the strongest fort in the game was no harder to raise than the weakest of the three.",
    changes: [
      "Titanium Bastion now costs 480 manpower to build (was 300)",
      "Thunder Bastion now costs 960 manpower to build (was 300)",
      "Fort and Palisade (Wooden Fort) manpower costs are unchanged at 300 and 150"
    ]
  },
  {
    createdAt: 1787999049644, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.29.1",
    title: "Settled tiles are defensible again",
    why: "PR #1656 removed the settled-tile and dock defense bonuses because neither is a defensive structure, but that left settled land with no baseline defense at all -- only forts, town bonus, tech/domain mods, and war-industry status contributed, so an undeveloped settled tile defended no better than open frontier.",
    changes: [
      "Settled tiles now grant a +30% defense multiplier again (previously +35%, and separate from the still-removed dock bonus), stacking with Town, forts, and other defense mults as before"
    ]
  },
  {
    createdAt: 1788029286599, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.29.3",
    title: "\"Cancel Waypoint\" now cancels only the selected waypoint, not the whole queue",
    why: "The Cancel Waypoint button in a tile's action menu always wiped the player's entire waypoint queue, even though it was opened on one specific waypoint's target tile -- so cancelling a single leg of a multi-waypoint route silently dropped every other queued waypoint too.",
    changes: [
      "Cancel Waypoint now cancels only the waypoint targeting the tile you opened the menu on, leaving the rest of your queued waypoints intact"
    ]
  },
  {
    createdAt: 1787999012029, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.29.1",
    title: "Join-season screen no longer shows a misleading \"0 players waiting\" for an already-active season",
    why: "The waiting count/roster only means something for a pending season's countdown lobby (\"N players have reserved a spot for the world that hasn't started\"). The plain join-now screen (season already active, player just hasn't clicked in yet) reused the same panel, so it showed \"0 PLAYERS WAITING / You're the first one here\" even when the world was already full of active empires.",
    changes: [
      "The already-active join-season screen now shows the Discord link and invite button without the waiting count/roster block"
    ]
  },
  {
    createdAt: 1787999215790, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.29.1",
    title: "Shard rain locators now clear once a shard is actually collected",
    why: "The in-world bobbing badge over a shard rain site and the off-screen HUD locator arrow pointing at one both tracked only the rain event's broadcast and its ~30-minute expiry, not the site's actual tile state -- so both kept showing a site for the rest of the event even after the shard there had already been picked up (by any player), which was misleading for everyone still navigating toward it.",
    changes: [
      "Both the in-world shard rain badge and the off-screen HUD locator arrow now drop a site as soon as that tile confirms (unfogged) the shard is gone, instead of persisting for the rest of the event"
    ]
  },
  {
    createdAt: 1787998957470, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.29.1",
    title: "Fixed the sign-in/name-and-color screen rendering behind a shard rain alert",
    why: "The sign-in overlay (including the new-player name/color picker) was styled at z-index 30, lower than the shard rain alert banner's z-index 33, the tech/structure detail overlays, and the season-end overlay. If a shard rain alert (or any of those overlays) became visible while a new player was still picking their name and color, it rendered on top of the picker, blocking it.",
    changes: [
      "Raised the sign-in/onboarding overlay to z-index 50 so it always sits above in-game alert and detail overlays while visible"
    ]
  },
  {
    createdAt: 1787948853587, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.28.6",
    title: "Fixed out-of-reach frontier tiles that never started decaying after their covering Relay Beacon/outpost was lost",
    why: "The out-of-reach decay timer was only ever stamped once, at the moment a tile was claimed -- a FRONTIER tile claimed while still inside your reach got no timer at all. If the anchor covering it later deactivated (a Relay Beacon disabled or destroyed, a Siege Outpost lost, a town or dock lost), nothing re-evaluated that tile's coverage: it just sat as \"Outside reach\" forever with frontierDecayKind stuck undefined, since the queue that drives expiry is only ever populated at claim time and there is deliberately no world-wide sweep (the mechanic that swept in PR #627 blocked the event loop for 9 seconds and was removed for it).",
    changes: [
      "Deactivating a reach anchor now re-checks its own disk (same scoped radius²-cost pass as the existing reach-caught-up case, not a sweep) and starts the decay timer on any FRONTIER tile left in genuine no-man's-land as a result"
    ]
  },
  {
    createdAt: 1787941776652, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.28.5",
    title: "Agrarian Works now shows its fish-tile bonus as its own highlight chip",
    why: "Researching Agrarian Works unlocks the Farmstead structure and also grants +1 FOOD slot on every owned fish tile, but the tech-tree card and detail view only ever showed a \"Farmstead\" chip -- the fish-tile bonus was undiscoverable unless you read the full description text.",
    changes: [
      "Agrarian Works now shows a \"Fish Tiles +1 Food Slot\" chip alongside its Farmstead chip, matching how other techs (e.g. Muster Flag +1) surface numeric bonuses as their own highlight"
    ]
  },
  {
    createdAt: 1787940942955, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.28.6",
    title: "Removed the settled-tile and dock defense bonuses; named the missing factory in \"no war industry\" combat lines",
    why: "Owning a settled tile or a dock granted a flat defense multiplier on top of forts/tech/war-industry, which didn't make sense thematically -- being settled or having a dock isn't a defensive structure. Separately, the attack/defense breakdown's \"has no war industry\" line never said which of the two Weapons Factories (Titanium or Umbrite) you or your target were actually missing, forcing you to go check.",
    changes: [
      "Removed the +35% \"Settled tile\" and +10% \"Dock\" defense bonuses from the combat breakdown; forts, towns, tech/domain mods, and war-industry status are unaffected",
      "The war-industry line in the attack/defense breakdown now names the specific missing factory, e.g. \"Target missing Umbrite Weapons Factory\" instead of a generic \"Target has no war industry\""
    ]
  },
  {
    createdAt: 1787912311406, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.28.2",
    title: "Fixed several player-state fields silently reverting on reconnect",
    why: "The sim and gateway kept two separately-maintained copies of the reconnect-cache merge logic, and both had drifted: economyBreakdown, upkeepPerMinute, upkeepLastTick, and season-winner updates were dropped by one copy but not the other, and chosenTrickleResource the other way around. Separately, the INIT payload the gateway sends on reconnect never carried your event log, logistics throughput, imperial ward charges, or wonder rush-buy cooldown at all -- the last two have no client-side fallback, so a reconnect (a page refresh, a dropped connection) actively reset them to blank every time, even though the server's live state was correct the whole time.",
    changes: [
      "Reconnecting no longer resets your imperial ward charges or wonder rush-buy cooldown, and your event log, logistics throughput, economy breakdown, upkeep figures, chosen trickle resource, and season-winner status now consistently survive a reconnect regardless of which server-side cache happens to serve it."
    ]
  },
  {
    createdAt: 1787739347827, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.26.5",
    title: "Captured towns/docks now keep reach on their own tile",
    why: "Reach borders are sticky by design -- capturing a town or dock deep inside a rival's territory never pushes their border back. But that same stickiness was leaving the captured building with zero reach at all, not even on the single tile it stood on, if the rival's still-active anchors happened to still cover that exact spot.",
    changes: [
      "A captured town, dock, or outpost-family structure (relay beacon, siege outpost/tower, dread tower) now always keeps reach on its own tile, even when it's fully surrounded by a rival's larger, still-defended territory -- it just can't project that reach onto any neighbouring tile the rival is still actively defending"
    ]
  },
  {
    createdAt: 1787912102098, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.28.2",
    title: "Building Relay Beacon (or any structure) on a frontier tile no longer races its own settlement",
    why: "Clicking Build on a not-yet-settled frontier tile sends CLAIM_CONTINUATION_SET, whose server-side immediate-drive branch enqueues and dispatches its own SETTLE for that tile, while the client also sends a SETTLE directly for the same click. Both wanted the same already-in-flight outcome, but the server treated the second one as a conflicting duplicate and rejected it with SETTLE_INVALID 'tile is already settling' -- which the client then had to detect and paper over with a one-shot retry, visible as log noise and occasional settle-state flicker.",
    changes: [
      "A duplicate SETTLE for a tile the same player is already settling now resolves as a no-op on the server instead of rejecting, so the Relay Beacon claim-continuation race no longer hits the client's error-recovery/retry path at all (that path still exists for other cases, like a genuinely conflicting settle from another player)."
    ]
  },
  {
    createdAt: 1787908074987, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.28.2",
    title: "Queuing an Expand outside your reach now explains it'll decay",
    why: "EXPAND isn't reach-gated server-side -- a claim landing outside your reach still succeeds, but it's stamped to decay away two minutes later unless you extend your reach to it with a nearby Town, Outpost, or Dock. Queuing a waypoint to such a target gave no warning at all until the claim actually decayed (or reverted on the next reach recompute), which read as the game silently undoing something for no reason.",
    changes: [
      "Queuing a waypoint whose destination is outside your current reach now shows the \"Beyond Your Reach\" tooltip immediately, explaining that the claim will decay unless you extend your reach to it."
    ]
  },
  {
    createdAt: 1787908049178, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.28.3",
    title: "Build Relay Beacon now shows in both the Actions and Buildings tabs on a frontier tile",
    why: "Build Relay Beacon on an owned FRONTIER tile is a settle-then-build chain, but its action id (\"build_relay_beacon\") is shared with the plain building on a settled tile, so it got sorted only into the Buildings tab like any other structure -- unlike a neutral tile, where the equivalent action shows directly in the Actions tab next to Expand To.",
    changes: [
      "Build Relay Beacon now shows in both the Actions tab (next to Settle Land) and the Buildings tab on an owned FRONTIER tile, matching the parity it already has on a neutral tile, instead of being tucked away under Buildings only."
    ]
  },
  {
    createdAt: 1787901144099, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.28.1",
    title: "Checklist no longer keeps a town/food target highlighted for the whole Expand duration",
    why: "The checklist only recomputed on tile-delta batches from the server, so once you clicked Expand To on a highlighted town or food tile, the highlight (and the goal's checked state) kept showing the old, un-expanded status for the whole multi-second window the real Expand takes to resolve server-side -- even though the client already knows locally, the moment the server accepts the command, that the tile is now yours.",
    changes: [
      "The checklist now recomputes as soon as an Expand command is accepted (the same moment the map's own optimistic ownership preview kicks in), instead of waiting for a later, unrelated tile-delta batch to happen to trigger a refresh."
    ]
  },
  {
    createdAt: 1787892933916, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.28",
    title: "Checklist no longer highlights your own starting settlement as if it were a town target",
    why: "The onboarding checklist's Relay Beacon anchor highlight (and, later, the food-goal anchor highlight) included every tile the player owns with a town record -- including their free starting SETTLEMENT-tier tile, which every new empire spawns with. That tile isn't a TOWN and never was a valid Find/Expand target, so lighting it up read as the checklist bugging out and pointing at the player's own spawn point instead of a real objective. Once a real TOWN was also owned, the SETTLEMENT kept getting highlighted alongside it indefinitely.",
    changes: [
      "The checklist's highlight ring now only ever appears on TOWN-tier-and-up tiles -- never on the player's own SETTLEMENT-tier starting tile, whether as a Relay Beacon anchor or a food-goal anchor."
    ]
  },
  {
    createdAt: 1787937658626, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.28.3",
    title: "Fixed the out-of-reach decay timer never showing on the tile menu",
    why: "The gateway-sync layer that applies incoming tile deltas only recognized \"ENCIRCLEMENT\" as a valid frontierDecayKind and silently dropped any other value -- including \"OUT_OF_REACH\", the sim's other real decay kind -- back to undefined. An out-of-reach frontier tile's decay deadline (frontierDecayAt) synced to the client fine, but its kind didn't, so the tile menu's header status could never match the OUT_OF_REACH branch and always fell back to a static \"Outside reach\" with no live countdown, even while the tile was actively decaying.",
    changes: [
      "The tile menu now shows the \"Beyond your reach — decays in Xs\" countdown for a decaying out-of-reach frontier tile instead of a static \"Outside reach\" with no timer."
    ]
  },
  {
    createdAt: 1787930868931, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.28.3",
    title: "Cleaned up the sign-in magic link email",
    why: "The emailed sign-in link embedded whatever query string happened to be on the page when you requested it (e.g. leftover tile-focus params), making the link long and inconsistent between sends -- which reads worse to a reader and to spam filters.",
    changes: [
      "The magic link sent to your email now always points to the app's clean base URL instead of carrying along stray query params from the current page"
    ]
  },
  {
    createdAt: 1787935226945, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.28.4",
    title: "Fixed tech/domain bonuses (e.g. Mercantile Charter) not applying until something else refreshed your towns",
    why: "Picking a tech or domain -- including tier 1's Mercantile Charter, which boosts gold production and population growth in your first three towns -- didn't invalidate the cached per-player town economy data. The new bonus silently sat unused until an unrelated tile change happened to refresh that cache, so newly chosen bonuses looked like they weren't applying to gold production or the town overview's modifier list.",
    changes: [
      "Choosing a tech or domain now immediately refreshes your towns' gold production and the town overview's modifier list to reflect the new bonus"
    ]
  },
  {
    createdAt: 1787937615718, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.28.5",
    title: "Alliance and truce request emails now match the rest of the game's branded emails",
    why: "Alliance and truce request emails were still built from a plain, unstyled paragraph template (a leftover from before the branded season-start/attack-alert template existed), so they looked out of place next to every other gameplay email you get.",
    changes: [
      "Alliance and truce request emails now use the same branded layout (header, body, call-to-action button) as season-start and attack-alert emails, and truce offers now call out the offered duration as a highlighted stat like other emails do"
    ]
  },
  {
    createdAt: 1787940609007, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.28.5",
    title: "Added a way back into 3D after it locked you out of it",
    why: "Two failed 3D attempts in a row (including a page refresh mid-load, which looks identical to a crash from the client's perspective) permanently pinned you to the 2D map, and the banner's own \"Add ?renderer=3d to try again\" instruction didn't actually work -- that param only controls whether 3D is attempted, not the on-disk crash streak that was blocking it, so retyping the URL just showed the same banner again.",
    changes: [
      "The \"3D map unavailable\" banner now has a \"Try 3D again\" button that clears the crash streak and reloads back into 3D",
      "Removed the banner's old ?renderer=3d instruction, since it never actually reset anything"
    ]
  },
  {
    createdAt: 1787999110086, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.29.1",
    title: "Fixed Aether Condenser gold income showing up as \"CRYSTAL_SYNTHESIZER\" in the economy panel",
    why: "An Aether Condenser flipped into Sell Off mode reports its gold income to the economy panel labeled with its raw internal type (CRYSTAL_SYNTHESIZER) instead of its display name, because that income bucket bypassed the same display-name lookup every other structure-driven line in the panel goes through -- making it easy to conclude the income wasn't showing up at all.",
    changes: [
      "The Gold income breakdown now shows \"Aether Condenser\" (and any other structure-labeled income/upkeep line) with its proper display name instead of its internal type"
    ]
  },
  {
    createdAt: 1788015703861, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.29.2",
    title: "Mercantile Charter's bonus now shows up on your first three towns",
    why: "Mercantile Charter's +50% gold / +25% population growth was already being applied to your first three towns' production and growth, but the bonus was never put on the tile overview's modifier list -- so it worked invisibly, with nothing on screen telling you it was there.",
    changes: [
      "The tile overview now shows a \"First 3 towns\" line for gold production and population growth on any of your first three towns while you hold Mercantile Charter"
    ]
  },
  {
    createdAt: 1787999267694, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.29.1",
    title: "Fort and Relay Beacon can now share a tile, and Relay Beacon no longer boosts attacks",
    why: "Fort and Relay Beacon used to fight over the same tile slot, forcing a choice between defense and the beacon's vision/offense utility, while also linking Relay Beacon to the Siege Outpost through an in-place upgrade. Splitting them apart lets defensive and vision play develop independently.",
    changes: [
      "A Fort and a Relay Beacon can now both be built on the same tile, in either order",
      "Relay Beacon no longer grants an attack multiplier (it keeps its local vision bonus)",
      "Building a Siege Outpost on a tile with a Relay Beacon is no longer an in-place upgrade of the beacon -- the two are now unrelated"
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
    createdAt: 1788028966835, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.29.3",
    title: "Phones that couldn't run the 3D map now get a lighter 3D map instead of being dropped to 2D",
    why: "When the 3D map crashed a phone's browser, every retry used the exact same settings as the attempt that just died -- the only thing that ever got made cheaper was for one narrow kind of crash. So a device would fail twice identically and then be parked on the 2D map permanently, having never been offered a 3D map small enough to actually run. A session that played fine for a while and was then killed by the OS taught it nothing at all.",
    changes: [
      "After a 3D crash the map now retries at reduced quality (no antialiasing, lower resolution), then at minimum quality, before falling back to 2D",
      "At minimum quality the map only allocates as many tiles as your screen can actually show, instead of a fixed floor well above it",
      "A session that ran fine and was then killed by the OS mid-play now also steps the map down a level on the next load"
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
    createdAt: 1788115016608, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.30.4",
    title: "Observatories now rise as aether towers on the 3D map",
    why: "The richest aether nodes on the map had no landmark -- a knowing eye could see the survey lines flickering, but the land itself still read as featureless grassland. Observatories rendered as a generic structure mesh, so the network (and the strategy around holding the strong aether fields) was invisible at a glance.",
    changes: [
      "Placing an Observatory on the 3D map now raises a tall brass-and-iron aether tower with a glowing cyan core, floating brass rings and upward-streaming motes, instead of the old generic structure mesh",
      "Observatories placed near each other light up thin cyan aether conduits with brass rails, collar joints, light nodes and travelling energy pulses, so a connected network reads as a visible web",
      "Where several observatories stand close together a rotating geometric synchronization cluster forms between them, marking the strongest aether convergence on the map"
    ]
  },
  {
    createdAt: 1788129225675, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.31.1",
    title: "Fixed a dock's yellow dashed sea-route line not drawing (\"route not found\") for most players",
    why: "The client routed dock pairs by re-running its own procedural terrain walk from scratch, but that procedural terrainAt() is a best-effort approximation that drifts from the frozen terrain the server committed at worldgen time (worldgen_baselines). On many worlds the client's approximation found no contiguous sea path where the server's real terrain clearly had one, so the dashed connection line silently never rendered and the dock debug reported routeFound:false -- even though a valid sea route existed.",
    changes: [
      "Dock sea routes are now computed once, server-side, from the authoritative worldgen terrain and shipped to the client with the initial world payload, so the dashed connection line and its route-found status match the real, frozen terrain",
      "Already-running seasons self-heal their dock routes on the sim's next restart -- no season reset needed",
      "Older servers that don't ship a route still fall back to the client's own sea-route pathfinder, so nothing regresses for them"
    ]
  },
  {
    createdAt: 1788128033639, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.31",
    title: "Renamed the Observatory and Ambaric Tower",
    why: "Two structure names were due for a refresh to better fit the empire's aether/power theming.",
    changes: [
      "The Observatory is now called the Aether Tower everywhere in the UI (build menu, tile overview, tech unlocks, upkeep) -- no change to what it does",
      "The Ambaric Tower is now called the Ambaric Transformer Station everywhere in the UI -- no change to what it does"
    ]
  },
  {
    createdAt: 1788162346509, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.31",
    title: "Fixed a fake \"plundered FOOD\" notice on town captures",
    why: "Capturing a settled FARM/FISH tile always showed a \"Plundered 1 FOOD\" line in the combat alert, but plunder has only ever transferred gold -- no food was ever actually taken from the defender or given to the attacker.",
    changes: [
      "Combat/raid alerts no longer show a fake FOOD plunder amount when capturing a resource tile -- plunder remains gold-only, matching what actually happens to both players' stockpiles"
    ]
  },
  {
    createdAt: 1788162890008, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.31.1",
    title: "Fixed a town's full tile detail sometimes showing stale data right after opening it",
    why: "Opening a tile's full detail (or the debug download tool) reused the same \"only send what changed\" logic as the regular live tile updates -- so if nothing else about the tile had changed since the last regular update, fields like a town's bonus modifiers were silently left out of the response, and the client kept showing whatever it already had cached, which could be out of date.",
    changes: [
      "Opening a tile's full detail now always fetches the complete, current data instead of a partial update that can omit fields nothing else recently touched"
    ]
  }
];
export const CLIENT_CHANGELOG_ENTRIES: ClientChangelogEntry[] = [
  ...RECENT_CLIENT_CHANGELOG_ENTRIES,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_2,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_3,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_4
];
