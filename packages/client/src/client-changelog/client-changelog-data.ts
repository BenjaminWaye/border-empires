// Changelog entry data only, split out from client-changelog.ts (rendering/
// visibility) to keep that file under the 500-line cap. Entries are unordered —
// client-changelog.ts sorts by createdAt. Move old entries to
// client-changelog-data-earlier.ts when this file approaches the cap.
import { CLIENT_CHANGELOG_ENTRIES_EARLIER } from "./client-changelog-data-earlier.js";
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
    createdAt: 1787430000000,
    introducedIn: "2026.08.22.2",
    title: "An empire with no war industry is now also weaker on defense, not just on offense",
    why: "Owning zero Titanium and zero Umbrite Weapons Factories empire-wide already doubled an attacker's effective attack against you -- but that bonus only ever helped the attacker. If you had no war industry and someone else attacked you, defending gave you no comparable penalty or advantage either way.",
    changes: [
      "Defending against an attacker who owns zero Titanium AND zero Umbrite Weapons Factories anywhere in their empire now doubles your effective defense, mirroring the existing attack-side vulnerability from the other direction. Missing one factory type or both gives the same flat bonus -- it doesn't stack higher for missing both."
    ]
  },
  {
    createdAt: 1787324700000,
    introducedIn: "2026.08.21.5",
    title: "Players now get a season-start email, and the previous champion gets a victory email",
    why: "When a season rolled over, nothing told players by email that the map had reset -- they'd only find out by opening the game. And the player who was just crowned champion had no record of their win beyond the in-game season-end screen.",
    changes: [
      "Every player with an email on file now gets a branded \"A New Season Has Begun\" email when a new season starts, crediting the previous season's champion if there was one and pointing them to the season recap screen to browse final stats for friends and foes.",
      "The player who won the previous season gets that same email with a victory recap folded in, calling out the objective they won through, instead of a separate message."
    ]
  },
  {
    createdAt: 1787360000000,
    introducedIn: "2026.08.21.7",
    title: "Fixed the settle animation not showing until you panned the camera",
    why: "Pressing Settle on a frontier tile marks it optimistically pending without changing its owner or ownership state (both already belonged to you), but the 3D map only rebuilt its terrain and overlays when ownership actually changed. That left the new settle overlay instance uncreated until something else -- like panning -- forced a rebuild for an unrelated reason.",
    changes: [
      "The settlement animation now plays immediately when you press Settle, instead of waiting for the next camera pan."
    ]
  },
  {
    createdAt: 1787340000000,
    introducedIn: "2026.08.21.6",
    title: "The rush-buy price preview now accounts for the Quickforge discount",
    why: "The tile menu's rush-buy price chip always showed the full server price estimate, even for a player who owns a Quickforge with today's discount still unused — the number shown was different from what got charged.",
    changes: [
      "The rush-buy price chip now shows the discounted price when you own a Quickforge and haven't used its once-per-day discount yet."
    ]
  },
  {
    createdAt: 1787330000000,
    introducedIn: "2026.08.21.5",
    title: "The Quickforge wonder now discounts a rush-buy instead of making it free",
    why: "The Quickforge's once-per-UTC-day rush-buy perk waived the gold cost entirely, which trivialized cheap rush-buys (like a Settle at 10 gold) and scaled unevenly across rush-buy prices.",
    changes: [
      "Once per UTC day, the Quickforge's controller now gets 40 gold off their next rush-buy (floored at 0) instead of that rush-buy being completely free."
    ]
  },
  {
    createdAt: 1787356800000,
    introducedIn: "2026.08.21.3",
    title: "Fixed a crash when switching apps and back while a location theme was playing",
    why: "Backgrounding the tab pauses playback; returning to it resumes both the music bed and any location theme. The location theme's resume call didn't catch play() rejections the way the music bed's did, so a fast switch-away-and-back (interrupting that play() with a pause()) threw an unhandled rejection that tripped the app's error boundary, showing \"Border Empires hit a problem loading\".",
    changes: [
      "Switching to another app and back no longer crashes the game to the error screen."
    ]
  },
  {
    createdAt: 1787322800000,
    introducedIn: "2026.08.21.1",
    title: "Composite settle+build orders (e.g. Build Relay Beacon) now survive logging out mid-order",
    why: "Clicking a composite action like \"Build Relay Beacon\" on an unowned tile sends the expand immediately, then relied purely on this client's own in-memory bookkeeping to notice the expand land and fire the follow-up settle, then notice the settlement land and fire the build. If you logged out (or your connection dropped) between the click and either of those follow-ups, nothing server-side was watching to continue the chain, so the order silently stalled.",
    changes: [
      "Settle+build orders (fresh expand-then-settle-then-build, and settle-then-build on an already-owned tile) now also register server-side, so they keep completing even if you disconnect right after clicking."
    ]
  },
  {
    createdAt: 1787322201581,
    introducedIn: "2026.08.21",
    title: "Tension music now plays while a muster flag is staged, not just when an attack is mid-flight",
    why: "Tension (\"war is coming\") music used to be driven by short-lived, per-attack timers (an attack in transit, a deferred send, an incoming-attack tracker) that clear the instant that specific attack resolves, so it kept dropping back to calm music between attacks even while a muster flag was still staged and ready to fire.",
    changes: [
      "Tension music now plays for as long as any muster flag is raised and set to Hold (staged, not yet advancing), which is a stable signal instead of one that clears after every individual attack."
    ]
  },
  {
    createdAt: 1787326342941, // 2026.08.21.4 — frozen from a live Date.now() call
    introducedIn: "2026.08.21.4",
    title: "AI opponents now build a wider range of structures, and beacon relays more often",
    why: "AI opponents could previously only ever build 5 kinds of structures (Farmstead, Umbrite Rig, Mine, Mintworks, Granary), scored by fixed numbers instead of what the AI's economy actually needed. Their Relay Beacon building was also just as likely at any time, whether or not there was still good territory left nearby to claim.",
    changes: [
      "AI opponents can now also build Waterworks, Ministry Hall (Governors Office), Ancillary Factory (Garrison Hall), Logistics Guild, Caravanary, and the Umbrite/Titanium/Crystal Synthesizers, chosen based on which resource or manpower shortfall is most acute rather than a fixed priority list.",
      "AI opponents now favor Relay Beacon construction in bursts — several in a row, then a pause where other buildings get priority — instead of a flat, constant likelihood throughout the game."
    ]
  },
  {
    createdAt: 1787294902457, // 2026.08.20.1
    introducedIn: "2026.08.20.1",
    title: "ADVANCE-mode muster attacks now show the skirmish animation too",
    why: "A manual attack is almost always against a tile you're currently looking at, so it's already loaded client-side. But a muster flag in ADVANCE mode fires autonomously against whatever the server's own search finds nearest — which can be a tile this client has never had vision of. The skirmish overlay required already knowing that tile's owner, so it silently skipped rendering for the whole ~30s countdown, only appearing once the resolution broadcast finally revealed the tile — reading as \"no animation until it resolves\", exactly for the fire-and-forget flags ADVANCE mode is meant for.",
    changes: [
      "An ADVANCE-fired attack now shows its own skirmish animation for the full countdown, the same as a manual attack, even when you haven't scouted the target tile yourself.",
      "The dot colors briefly use a placeholder until real tile data arrives (typically within the countdown), then switch to the correct owner colors."
    ]
  },
  {
    createdAt: 1787296000000, // 2026.08.21.2 — frozen; was Date.now() in the merged commit
    introducedIn: "2026.08.21.2",
    title: "Relay beacons are now destroyed when their tile is captured",
    why: "Every other structure kept its old survive-capture behavior, but a relay beacon transferring intact to the attacker let a single capture instantly hand over both the tile and a working reach anchor on it — same treatment siege outposts already get.",
    changes: [
      "Capturing a tile with a relay beacon on it now destroys the beacon instead of transferring ownership.",
      "The attacker still takes the tile itself; they'll need to rebuild a relay beacon there to project reach from it."
    ]
  },
  {
    createdAt: 1787295212839, // 2026.08.21.1 — frozen from a live Date.now() call left in by the merged commit
    introducedIn: "2026.08.21.1",
    title: "Fixed research (tech/domain) picks being lost on server restart or deploy",
    why: "On startup, the simulation server rebuilds state from the latest checkpoint snapshot and then replays any events recorded after that checkpoint. That replay step had no handler for tech or domain research events, so a research pick made after the last checkpoint but before a restart or deploy was silently dropped instead of being reapplied — the player would come back with an earlier set of researched techs/domains than they actually had.",
    changes: [
      "Tech and domain research chosen shortly before a server restart or deploy is now correctly preserved instead of sometimes reverting to an earlier state."
    ]
  },
  {
    createdAt: 1787345991317,
    introducedIn: "2026.08.21",
    title: "War music no longer flickers back to calm music during an ongoing war",
    why: "War music was driven only by whether a battle-clash animation was actively playing, which is pruned a few seconds after each individual skirmish resolves. During a sustained war, that gap between skirmishes flipped the music back to calm and then straight back to combat, over and over.",
    changes: [
      "War music now also stays engaged for as long as any muster flag is set to Advance, since that's a durable sign of an ongoing offensive rather than a single skirmish's animation window."
    ]
  },
  {
    createdAt: 1787322201580, // 2026.08.21 — frozen; was Date.now() in the merged commit
    introducedIn: "2026.08.21",
    title: "Border-expansion pylon animation is slower and more dramatic",
    why: "The survey pylon rise/sink and laser on/off animation that plays when your border expands or contracts was over in about 1.3 seconds per pylon, which made it easy to miss entirely.",
    changes: [
      "Retiring pylons now take about 3 seconds to fade their laser and sink into the ground, and arriving pylons take about 3.2 seconds to rise and power their laser on.",
      "New pylons/lasers along an expanding border now stagger in more visibly, one at a time, instead of all rising together."
    ]
  },
  {
    createdAt: 1787259991319,
    introducedIn: "2026.08.20",
    title: "Rush-buy button is no longer a bare unstyled control, and its gold icon no longer looks like silver",
    why: "The tile progress card's rush-buy button had no CSS at all, so it rendered as a plain browser-default button instead of matching the card's other pill-shaped controls. Its price label also used the 🪙 coin emoji, which renders as a plain silver/steel coin in most fonts and read as a different currency than gold.",
    changes: [
      "The rush-buy button now uses a gold-gradient pill style matching the rest of the tile progress card's buttons.",
      "The rush-buy price label now uses 💰 instead of 🪙 so it reads unambiguously as gold."
    ]
  },
  {
    createdAt: 1787259991318,
    introducedIn: "2026.08.20.3",
    title: "Fixed a frame-rate drop from the survey-sweep ping overlay",
    why: "The 3D map's per-frame render loop re-uploaded the survey-sweep ping overlay's four GPU instance buffers every single frame, even on the vast majority of frames where no ping was active — a real WebGL bufferSubData call for zero visual change, 60 times a second. A capture from a live session showed WebGL buffer uploads consuming over 80% of total frame CPU time, with the game sustaining only ~11-12fps.",
    changes: [
      "The survey-sweep ping overlay now skips its GPU buffer upload on any frame where no ping was active last frame either, instead of re-uploading empty data unconditionally every frame."
    ]
  },
  {
    createdAt: 1787259991317,
    introducedIn: "2026.08.20.2",
    title: "Removed the out-of-reach dim overlay on rival tiles",
    why: "Rival-owned tiles that were visible but outside your reach radius were darkened with a dimming/hatch treatment (the Aether Survey Line's out-of-reach indicator). We decided this visual signal wasn't pulling its weight and removed it, in both the 2D and 3D map renderers.",
    changes: [
      "Removed the out-of-reach dim overlay on rival tiles that used to darken visible-but-unreachable enemy/neutral territory. Reach itself, dormant-frontier tiles, and the reach boundary line are unaffected."
    ]
  },
  {
    createdAt: 1787259991316, // 2026.08.20
    introducedIn: "2026.08.20",
    title: "Auto-fill now respects your reach/border",
    why: "Sealing off a pocket of land used to auto-settle it regardless of whether your empire's reach actually extended there — you could end up with settled tiles outside your reach, or see a burst of unrelated-looking tiles suddenly fill in when your reach shifted somewhere else entirely. Auto-fill now only settles a pocket once its entire boundary — not just the land inside it — is within your reach, so it only ever triggers from something happening near that pocket's own edge.",
    changes: [
      "Auto-fill no longer settles tiles outside your reach/border.",
      "A pocket only auto-fills once every part of its sealing boundary (your own territory and/or coastline/mountains) is within your reach — a boundary tile that's still out of reach means the whole pocket waits, rather than filling in partially."
    ]
  },
  {
    createdAt: 1787176861000, // 2026.08.20
    introducedIn: "2026.08.20",
    title: "Fixed: EXPAND onto a connected dock or across an active Aether Bridge was silently impossible",
    why: "EXPAND has always required the target tile to be inside your persistent reach border, and that check applied unconditionally to dock and Aether Bridge crossings too — but a bridge or dock crossing lands you on a landmass with no anchor of your own there yet, by design (that's the entire point of both). The reach check therefore always failed for a genuinely connected dock's paired tile or a bridge's landing tile, making it impossible to ever claim either.",
    changes: [
      "EXPAND across a connected dock link, or across an active Aether Bridge, no longer requires the target tile to already be inside your reach border — matching the adjacency and Aether-wall-shield exemptions those crossings already had."
    ]
  },
  {
    createdAt: 1787170756951, // 2026.08.19.2
    introducedIn: "2026.08.19.2",
    title: "Town gold production: fixed the Mintworks flat bonus for real this time",
    why: "The previous fix for this (2026.08.19) only patched apps/simulation/src/live-town-summary.ts — but the tile-click popup is served by a separate gateway path (apps/realtime-gateway/src/tile-detail-snapshot.ts) whenever the cached snapshot's townJson doesn't carry a fresh goldPerMinute, and that path has its own independent copy of the same formula, explicitly commented 'keep in sync with buildTownSummary' — which still dropped each Mintworks' flat +1 gold/day-per-copy bonus. A live screenshot after the first fix still showed the old, wrong number, which is what surfaced this second copy.",
    changes: [
      "The gateway's tile-detail fallback gold calculation now includes each active Mintworks' flat gold bonus, matching the simulation's authoritative formula."
    ]
  },
  {
    createdAt: 1787132874001, // 2026.08.19
    introducedIn: "2026.08.19",
    title: "Town gold production now includes each Mintworks' flat bonus, and settled-town copy cleaned up",
    why: "A town's displayed gold production silently dropped each active Mintworks' flat +1 gold/day-per-copy bonus — the town-summary formula that feeds the client only applied Mintworks' % production multiplier, duplicating (and drifting from) the authoritative formula used elsewhere in the sim, which always included the flat bonus. Separately, a settled town's overview always opened with a generic \"Settled land is defended and fully part of your empire\" line even though the stat grid right below it already says everything that line does.",
    changes: [
      "Town gold production now correctly includes every active Mintworks' flat gold bonus, not just its production-percentage multiplier.",
      "A settled town's overview no longer shows the generic \"Settled land is defended...\" line — plain settled land with no town still does."
    ]
  },
  {
    createdAt: 1787084630235, // 2026.08.18
    introducedIn: "2026.08.18",
    title: "Removed a stale \"gold paused until manpower is full\" message that could no longer appear",
    why: "The town info panel had leftover copy and a data field for a gold-pause condition the server never actually sends, so it was permanently dead code. Removed it to keep the panel's messaging accurate to what the server can report.",
    changes: [
      "The tile info panel no longer has an unreachable \"Town is fed but gold is paused until your empire manpower is full\" line.",
      "No mechanical change — this condition was never triggered by the server."
    ]
  },
  {
    createdAt: 1787085726552, // 2026.08.18.2
    introducedIn: "2026.08.18.2",
    title: "Town overview now explains partial support and unbuilt Trade Nexuses",
    why: "Two real gold-production penalties were invisible on the tile panel: a town under-full on Support silently produces less gold (supportRatio is a direct multiplier in the sim), and a connected-town network with no Caravanary anywhere in it pays a flat +0% bonus — but the panel said nothing in either case, so there was no way to tell why gold looked low. The panel also never showed a town's FOOD slot count, only a prose warning once it was already unfed.",
    changes: [
      "Partial Support (e.g. 7/8) now shows its real gold-production cost as a Modifiers line instead of staying silent.",
      "A connected-town network with no built Trade Nexus (Caravanary) now shows a neutral +0% line explaining why the connection bonus isn't paying out, instead of nothing at all.",
      "A settled town's overview tab now shows its FOOD slot count (e.g. \"Food 4/4 slots\") next to Support."
    ]
  },
  {
    createdAt: 1787083759893, // 2026.08.18.1
    introducedIn: "2026.08.18.1",
    title: "Town overview now shows manpower",
    why: "The tile overview panel listed Population, Growth, Support, Production, and Upkeep for a settled town, but never said anything about the town's manpower contribution to your empire — a stat players had no way to see anywhere on the tile itself.",
    changes: [
      "A settled town's overview tab now shows its base manpower cap and regen contribution, right after Population and Growth."
    ]
  },
  {
    createdAt: 1787041917435, // 2026.08.17.3
    introducedIn: "2026.08.17.3",
    title: "Battle dots no longer pop when the clash hands off into rout",
    why: "The clash phase sways each dot back and forth (spread + a forward jostle so the two lines press together instead of overlapping), but the instant rout began that whole oscillation was dropped in favor of a clean push-through/scatter position — a small but real positional snap right at the clash/rout boundary, on top of the exact same seam that was already fixed between the pre-resolution skirmish and the clash phase.",
    changes: [
      "Dots now settle out of the clash's sway over the first ~140ms of rout instead of dropping it instantly, so the clash and rout phases read as one continuous motion rather than two animations stitched together."
    ]
  },
  {
    createdAt: 1786960037000, // 2026.08.17.1
    introducedIn: "2026.08.17.1",
    title: "World Engine strikes now shake the map and broadcast to everyone",
    why: "Firing the World Engine used to be a private moment — only the caster's own client got any indication a city had been leveled, via a local pulse effect that never reached anyone else, including the city's owner. A strike that levels a city and costs real population is exactly the kind of moment every empire should hear about, not just the two sides involved.",
    changes: [
      "Landing a World Engine strike on an enemy city now shakes the map once, live, for every connected player — not just the caster.",
      "A new destruction-themed popup announces who fired it, what city was hit, how many lives were lost, and who owned the town.",
      "That announcement stays visible in the Activity Feed's new \"World Events\" section for 12 hours, so logging in after the fact still tells you what happened."
    ]
  },
  {
    createdAt: 1787003302865, // 2026.08.17.2
    introducedIn: "2026.08.17.2",
    title: "Battle animation reworked: troops line up, march, clash with casualties, then rout",
    why: "The battle overlay's approach phase was a single 550ms beat — dots barely had time to read as \"forming up\" before they were already marching. And the clash itself, while it now threw glyph bursts into the air, never lost a single dot: the swarm stayed exactly DOTS_PER_SIDE strong right up until rout, so a fight that had clearly been decided (attackerWon is known from the very first frame) never showed any sign of a cost.",
    changes: [
      "Both sides now form up at their own tile-local edge for ~2.5s before marching — previously they started marching almost immediately.",
      "The march itself now takes ~0.9s (previously ~550ms combined with forming up), so the two sides visibly close the distance instead of snapping into position.",
      "Once the outcome is known, some dots now fall during the clash — a fixed 2 of 10 for the winning side, 4 of 10 for the losing side, so the losing side visibly thins before rout confirms it, and both sides always keep enough survivors for rout to have something to actually push through or scatter.",
      "The clash window is now ~1.3s (previously 800ms), giving the glyph bursts and new casualties room to read clearly instead of feeling rushed."
    ]
  },
  {
    createdAt: 1786910628146, // 2026.08.16.1
    introducedIn: "2026.08.16.1",
    title: "Swapped the waypoint and mustering flag overlays",
    why: "The elaborate steampunk tower — banner, medallion, cannons, dome, spire — used to mark a single movement waypoint, while mustering tiles got a small pennant. That was backwards: a big banner-bearing tower reads as a rallying point, not a mere movement destination, and mustering tiles can appear several at once across a border while a waypoint queue is just one player's own path.",
    changes: [
      "Mustering tiles now show the full tower/banner assembly, with the marching soldier dots still converging on it as manpower fills.",
      "Waypoint queue entries now show a small pennant instead — no soldier dots, since a waypoint isn't accumulating troops.",
      "The tower now renders efficiently across many simultaneous mustering tiles instead of being limited to a handful of instances."
    ]
  },
  {
    createdAt: 1786924800000, // 2026.08.16.2
    introducedIn: "2026.08.16.2",
    title: "Fogged sea tiles no longer render as a solid black hole",
    why: "Sea tiles were never part of the 3D heightfield mesh (the water plane sits over a deliberate hole in it), so the fog-of-war darken overlay — which works by tinting a land tile's already-drawn remembered terrain — had nothing underneath it for sea. The result was a fully opaque black quad over an empty hole, on top of the scene's own black fog background: indistinguishable from unexplored fog, right at any coastline your vision doesn't currently reach.",
    changes: [
      "Fogged SEA/COASTAL_SEA tiles now draw the same live water surface visible sea gets instead of a black darken overlay, so remembered coastline reads as water again."
    ]
  },
  {
    createdAt: 1786965132570, // 2026.08.16.3
    introducedIn: "2026.08.16.3",
    title: "Battle dots: attacker and defender no longer disappear into each other during the clash",
    why: "The clash-phase oscillation only ever varied a dot's position along the perpendicular spread across the tile, never along the attacker-defender line itself. That meant an attacker dot and a defender dot with the same per-dot spread value landed on the exact same point, every frame, for the whole clash — the two swarms were genuinely coincident, not just visually crowded. With depth testing disabled on both dot materials (needed so they always render on top of the terrain), whichever side's mesh happened to draw second fully hid the other, so the entire clash read as a single-color blob with no visible fight between two sides — confirmed with the new Storybook \"Full Attack Lifecycle\" story, where the attacker's dots were invisible for the whole clash and only reappeared once rout physically separated the two sides.",
    changes: [
      "Each side now holds a small, jostling offset along the attack line during the clash, so attacker and defender read as two distinct lines pressed together instead of one side fully hiding the other."
    ]
  },
  {
    createdAt: 1786905792661, // 2026.08.16
    introducedIn: "2026.08.16",
    title: "The Caravanary is now the Trade Nexus, with a new commercial-hub look",
    why: "The Caravanary still read as a humble road-station courtyard, while the trade network needed to sell concentrated wealth — a grand exchange hall where trade routes converge, with cargo and brass machinery at work. Renamed the building to Trade Nexus and gave it a look to match; the underlying road-network mechanics are unchanged.",
    changes: [
      "The Caravanary structure is renamed Trade Nexus everywhere in the UI (build menu, tile info, tech tree). Its behavior — enabling the connected-town road network and income bonus — is unchanged.",
      "New 3D overlay: a grand domed trading hall on an octagonal stone plinth, ringed by six converging trade roads, merchants' warehouses, stacked cargo, brass jib cranes, feed pipes, warm hanging lamps and a slowly winding brass clockwork seal atop the dome — replacing the old fortified-inn look.",
      "A matching flat-color 2D icon (trading hall, converging routes, cargo and brass machinery) accompanies the 3D asset."
    ]
  },
  {
    createdAt: 1787356800001, // 2026.08.21, after the entries below
    introducedIn: "2026.08.21",
    title: "Shard rain impact sites now show on the map, even before you've explored them",
    why: "A shard rain event's landing sites were previously only ever shown as a text notice (\"Nearest site is ~N tiles NE\") or as an in-tile icon once you'd actually explored that tile. There was no way to see where the other sites were at a glance, or to navigate straight to one.",
    changes: [
      "Every active shard rain site now shows as an arrow-shaped badge pointing off-screen toward it, the same locator system muster flags use — click it to jump the camera there.",
      "Once you scroll a site on-screen, a small shield badge hovers over that exact tile, bobbing gently in place — the same badge style as the unfed-town warning, with a shard icon instead. It's just a positional blip from the event broadcast, not confirmation the shard is still there, especially on a tile you haven't explored yet.",
      "Both the off-screen badge and the on-screen badge stay up for the full ~30-minute life of the shard rain event, not just the first moments after landing."
    ]
  },
  {
    createdAt: 1787122800000, // 2026.08.21
    introducedIn: "2026.08.21",
    title: "Expanding onto a connected dock now works, and Aether Bridge landings open up nearby territory",
    why: "Expanding onto a dock connected to one you already own always failed with an out-of-reach error, since a dock only contributed to your reach once you already owned it -- there was no way to ever take the first step onto the far side. Separately, an Aether Bridge only ever opened a single-tile crossing at its landing point, so it couldn't be used to establish a real foothold for further expansion.",
    changes: [
      "You can now EXPAND onto an unowned dock that's connected to a dock you already own.",
      "Casting Aether Bridge onto neutral ground now grants a small radius of reach around the landing tile, so you can expand into the surrounding land and build a Relay Beacon there -- the grant persists even after the bridge itself expires, though it can still be overtaken if a rival establishes their own reach (e.g. a Relay Beacon) over that ground.",
      "Casting a bridge onto ground already inside a rival's territory still opens the crossing for an attack, but no longer grants any reach there."
    ]
  },
  {
    createdAt: 1787295247575, // 2026.08.21.3
    introducedIn: "2026.08.21.3",
    title: "Map zoom is now smooth and responsive",
    why: "Zooming used to feel sluggish for two compounding reasons: each wheel notch only moved the zoom level by 1 out of a 10-192 range, so crossing the range took roughly 180 notches; and every single notch tore down and re-uploaded the entire visible terrain to the GPU, which alone cost ~74ms and pinned the frame rate around 10fps for the whole gesture.",
    changes: [
      "A wheel notch now moves zoom by a proportional step instead of a flat ±1, so the full zoom range crosses in about 15-20 notches instead of ~180.",
      "The 3D renderer now only rebuilds the visible terrain when the camera actually needs tiles outside what's already loaded, instead of on every zoom or pan change -- zooming in no longer triggers a rebuild at all, and frame rate stays smooth while zooming or making small-to-moderate pans."
    ]
  },
  {
    createdAt: 1787323800000,
    introducedIn: "2026.08.21.4",
    title: "Fixed border pylons and structures drifting away from the ground while panning",
    why: "The zoom-smoothness fix above let the terrain skip a rebuild for any pan that stayed inside a padded window, but every other 3D overlay (ownership border pylons/walls, flags, badges, selection markers) still repositions itself every single frame off the live camera with no such padding. Mid-pan, that left the terrain's baked geometry pinned to wherever it was last rebuilt while border pylons and structures kept gliding on with the live camera, so towers and border lines visibly separated from the tiles under them until the pan stopped.",
    changes: [
      "Panning the 3D map now always rebuilds the terrain to match the live camera, so border pylons, structures, and the ground they sit on stay locked together while scrolling. The zoom-only rebuild savings from the fix above are unaffected."
    ]
  },
  {
    createdAt: 1787346768128, // 2026.08.21.8 (frozen; was a live Date.now() call — see check-client-changelog-update.mjs)
    introducedIn: "2026.08.21.8",
    title: "Border-expansion pylons now rise and light up again mid-game, not just retire",
    why: "A caller-side flag meant to skip the arrival animation on the very first frame (so the whole starting boundary didn't rise out of the ground on page load) was being passed on every single frame instead of just the first one, so any pylon or laser line added by a later border expansion popped straight into its fully-lit state instead of playing the rise-then-power-on animation -- only retiring pylons ever animated.",
    changes: [
      "Newly-added border pylons and laser lines now rise out of the ground and power on with the same staggered wave animation you see in Storybook, instead of popping in instantly, for every border change after the map first loads."
    ]
  },
  {
    createdAt: 1787346768129, // 2026.08.21.9
    introducedIn: "2026.08.21.9",
    title: "Removed the unused \"frontier collapsing\" decay countdown",
    why: "Frontier tiles carried a natural-decay countdown UI (a header timer and tile-menu warning saying the tile would soon collapse) left over from an early design that the server never actually implemented — no frontier tile has ever expired this way, so the warning could never legitimately appear. Removed the dead client code so it can't be confused with the real encirclement cut-off warning, which still applies: a frontier tile cut off from your supply chain is still claimed by an enemy after 60 seconds if it stays disconnected.",
    changes: [
      "Removed the unused \"Frontier collapsing in Ns\" countdown and \"unsupported and will soon decay\" tile-menu line — this never actually triggered in play.",
      "The encirclement (\"Cut off from supply\") warning and its 60-second countdown are unchanged."
    ]
  },
  {
    createdAt: 1787334600000,
    introducedIn: "2026.08.21.6",
    title: "Your border is now the server's real border, and out-of-reach waypoints no longer get stuck forever",
    why: "The yellow reach border was drawn from a client-side approximation that re-derived your anchors from whatever tiles happened to be cached locally. It could not see contested-tile clipping against other players' anchors, so it sometimes showed a tile as inside your border that the server would refuse to let you claim. The waypoint planner used that same approximation to pick its next hop, so it kept sending an expand the server kept rejecting with OUT_OF_REACH. The retry counter was also reset on every reconnect, and the waypoint queue lives server-side, so the loop restarted from zero each time you reconnected -- a wedged waypoint blocked every waypoint behind it and refreshing could not clear it.",
    changes: [
      "The reach border you see is now pushed by the server and matches exactly what it will let you claim, so a tile shown inside your border can actually be expanded onto.",
      "A waypoint step the server rejects as out of reach now cancels that waypoint instead of retrying it forever, and the cancellation is mirrored server-side so it cannot come back after a reconnect.",
      "A halted waypoint no longer blocks the waypoints queued behind it, and the 'Waypoint halted' message appears once instead of repeating on every tick."
    ]
  },
  {
    createdAt: 1787349946710,
    introducedIn: "2026.08.21.10",
    title: "You can now attempt to expand toward out-of-reach frontier tiles",
    why: "Expanding was rejected outright as OUT_OF_REACH the moment a target tile fell outside your reach border, even though claiming a neutral tile has never itself granted reach (only a settled town/outpost/dock does) -- so the rejection didn't actually protect anything, it just hid a button. Settling and building outposts are still gated on reach, since those are what actually extend your border, and a Relay Beacon (or other siege outpost) still can't be built directly on an out-of-reach frontier tile -- that loophole would have let a single out-of-reach expand leapfrog your reach indefinitely.",
    changes: [
      "\"Expand To\" now always shows on a neutral tile, in or out of reach, instead of being hidden outside reach.",
      "On a frontier tile you already own but is outside reach, \"Settle Land\", \"Settle Connected\", and outpost-family build actions (Relay Beacon, siege outposts) now show disabled with an \"Outside your reach\" reason instead of disappearing.",
      "The tile menu and both map views now flag a selected out-of-reach tile so it's clear why those actions are disabled."
    ]
  },
  {
    createdAt: 1787374761566, // 2026.08.22.1 — frozen from a live Date.now() call
    introducedIn: "2026.08.22.1",
    title: "Renamed the distant-attack waypoint button from \"Add Waypoint\" to \"Expand To & Attack\"",
    why: "This button now only ever appears for an enemy-owned attack target -- the neutral-tile case was folded into \"Expand To\" in the previous release -- but it kept the old generic \"Add Waypoint\" label, which read as a leftover duplicate rather than the attack action it actually is.",
    changes: [
      "The multi-step waypoint action on a distant enemy tile is now labeled \"Expand To & Attack\" instead of \"Add Waypoint\"."
    ]
  },
  {
    createdAt: 1787381546606, // 2026.08.22.2 — frozen from a live Date.now() call
    introducedIn: "2026.08.22.2",
    title: "Seasons now have a player cap, and you can ask to be emailed when the next one opens",
    why: "A season previously had no limit on how many empires could join, which meant a season already crowded with players kept quietly admitting more instead of ever being \"full.\" There was also no way to find out when a fresh, uncrowded season was starting if you missed joining one.",
    changes: [
      "A season now stops admitting brand-new players once it reaches its player cap; anyone with an existing empire in that season can still log back in as normal.",
      "Trying to join a full season shows a \"This season is full\" screen with an \"Alert me when next season starts\" button.",
      "Clicking it confirms you'll get the same season-start email already sent to every signed-in player when the next season begins."
    ]
  },
  {
    createdAt: 1787692499340, // frozen from a live Date.now() call
    introducedIn: "2026.08.25.1",
    title: "Auto-settle now respects your reach border, and losing reach unsettles ground you can no longer defend",
    why: "Auto-settle (both the AI's own driver and the queue the client auto-fills SETTLE commands from) turned an owned frontier tile into a town regardless of whether it was still inside your reach border -- a check human-issued SETTLE commands already enforced. Separately, losing or disabling the last beacon/outpost/fort covering a tile left that ground permanently claimed even once nothing defended it, since the reach border only ever shrank when a rival actively contested it.",
    changes: [
      "Auto-settle (AI and the client's auto-fill queue) now skips a frontier tile that's outside your reach border, instead of settling it anyway.",
      "A settled tile that falls entirely outside anyone's reach (its last covering beacon/outpost/fort is lost or disabled, and no rival covers it either) now reverts to frontier, with a brief blue collapse pulse where it happened.",
      "A structure's own home tile is exempt from this -- disabling it never unsettles the tile the structure sits on, so re-enabling it still works."
    ]
  }
];
export const CLIENT_CHANGELOG_ENTRIES: ClientChangelogEntry[] = [
  ...RECENT_CLIENT_CHANGELOG_ENTRIES,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER
];
