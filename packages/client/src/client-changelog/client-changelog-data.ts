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
    createdAt: 1787462564744, // 2026.08.22.15 — frozen from a live Date.now() call
    introducedIn: "2026.08.22.15",
    title: "Fixed the same false \"Map sync stalled\" warning on the plain \"Join Season?\" prompt",
    why: "The previous fix only covered the pending-season countdown lobby. The plain \"Join Season?\" prompt -- shown once a season is already active but you haven't clicked join yet -- has the same reason for zero map tiles (you haven't spawned), and hit the same false alarm.",
    changes: [
      "The map-sync watchdog now also stays quiet behind the \"Join Season?\" prompt, not just the countdown lobby."
    ]
  },
  {
    createdAt: 1787462189036, // 2026.08.22.14 — frozen from a live Date.now() call
    introducedIn: "2026.08.22.14",
    title: "Fixed a false \"Map sync stalled\" warning while waiting in the season lobby",
    why: "A player waiting in the pending-season lobby hasn't spawned yet, so no map tiles have arrived for them by design -- but the map-loading watchdog didn't know that, and treated it the same as a real stuck sync, firing a \"Map sync stalled\" warning over the lobby after a few seconds.",
    changes: [
      "The map-sync watchdog now stays quiet while you're waiting in the season lobby, since there's nothing to sync yet."
    ]
  },
  {
    createdAt: 1787435600000, // 2026.08.22.13 — frozen from a live Date.now() call
    introducedIn: "2026.08.22.13",
    title: "Fixed: another player's town could show your \"ready to upgrade\" badge",
    why: "The map's green up-arrow badge and the food-shortage badge only checked that a town had an owner, not that the owner was you, so a rival town that happened to qualify lit up on your map the same way one of your own towns would.",
    changes: [
      "The population-tier upgrade badge and the unfed-town food badge now only appear on towns you own, on both the 3D map and the classic 2D map."
    ]
  },
  {
    createdAt: 1787411986658,
    introducedIn: "2026.08.22.8",
    title: "Beta season countdown screen",
    why: "The beta season now has a synchronized start time so everyone begins together instead of the first arrivals compounding a head start over testers in later timezones.",
    changes: [
      "Joining before the season's scheduled start now shows a countdown screen with the start time converted to your local timezone, instead of an error.",
      "The client automatically re-joins the season once the countdown reaches zero — no reload needed."
    ]
  },
  {
    createdAt: 1787432000000,
    introducedIn: "2026.08.22.12",
    title: "Your galaxy planets and outposts now earn Influence and Production, and can lose Stability",
    why: "The galaxy view previously showed your Planets/Outposts/Stipends as a static record with nothing ongoing attached to them -- the galactic meta-layer's actual economy (docs/galactic-campaign-design.md §4/§5/§7) wasn't running yet. This introduces the first slice of that economy: a weekly Cycle tick that trickles Influence/Production income from your held territory, charges Influence upkeep for spreading wide, and drains or recovers each territory's Stability accordingly.",
    changes: [
      "Your galaxy view now shows a running Influence/Production balance, updated once per weekly Cycle based on your held Planets' and Outposts' specializations.",
      "Holding more Planets costs more Influence upkeep -- Outposts still cost nothing to hold, staying the cheap entry rung for newer empires.",
      "Each held Planet and Outpost now has a Stability meter (0-100), shown as a bar under it in the galaxy view. Falling into an Influence deficit drains your weakest territory's Stability over time; a healthy Influence surplus recovers all of them."
    ]
  },
  {
    createdAt: 1787429155443,
    introducedIn: "2026.08.22.12",
    title: "Fixed a dark \"crack\" flickering at animated shorelines",
    why: "Every coastline's animated water can dip deep enough at a wave trough to reveal the coastal skirt wall underneath it, which was shaded so dark that it read as a jarring black gap right at the shoreline.",
    changes: [
      "Brightened the coastal skirt wall's shading so it no longer looks near-black when the water's wave animation passes through a deep trough."
    ]
  },
  {
    createdAt: 1787412371498, // 2026.08.22.11 — frozen from a live Date.now() call
    introducedIn: "2026.08.22.11",
    title: "Muster flags can now march on a chosen target instead of just the nearest enemy tile",
    why: "A muster flag's ADVANCE mode always auto-fired on whatever enemy tile happened to be nearest, with no way to point it at a specific target -- useful for holding a line, but not for actually pushing an offensive toward somewhere particular.",
    changes: [
      "New \"March To...\" muster action: pick a flag, choose \"March To...\", then click a destination tile.",
      "A marching flag fights its way toward that destination one attack at a time, always picking whichever reachable enemy tile is closest to the target -- it never crosses neutral ground, since a muster flag only ever attacks enemy territory.",
      "The flag automatically returns to HOLD once it captures the target tile, or you can cancel the march early from the tile menu."
    ]
  },
  {
    createdAt: 1787430800000,
    introducedIn: "2026.08.22.10",
    title: "Your galaxy planet now shows what it's specialized in",
    why: "The galaxy view showed which victory path crowned your planet, but not what that meant going forward -- part of the early galactic meta-layer groundwork (docs/galactic-campaign-design.md), where each victory path is meant to grant a distinct planet specialization.",
    changes: [
      "Your galaxy planet (named or not-yet-named) now shows a specialization badge -- Industrial, Trade, Extraction, Logistics, or Capital -- based on which victory condition crowned it."
    ]
  },
  {
    createdAt: 1787430700000,
    introducedIn: "2026.08.22.9",
    title: "Muster flags now clear reliably after losing a tile in combat",
    why: "Losing an attack could hand your attacking tile to the enemy, and if that tile then fell outside your visible area in the same instant, the server's notice that the tile (and its staged muster flag) changed hands never reached your client -- the flag stayed stuck on ground you no longer owned until you happened to re-scout it.",
    changes: [
      "The server now always tells you when a tile you just lost -- whether your attack's origin was overrun or a target you held was captured -- changes hands, even if you no longer have vision of it, so a cleared muster flag (and the rest of that tile's state) updates immediately instead of going stale."
    ]
  },
  {
    createdAt: 1787430600000,
    introducedIn: "2026.08.22.8",
    title: "Creating a mountain now clears any muster flag staged on the tile",
    why: "Turning a tile into a mountain destroyed the tile's ownership, but the muster flag staged on it stuck around, showing a stale muster icon on ground you no longer held.",
    changes: [
      "Creating a mountain on a tile with a staged muster flag now clears the flag along with the tile's ownership, matching how bombardment, capture, and tile shedding already handle it."
    ]
  },
  {
    createdAt: 1787430500000,
    introducedIn: "2026.08.22.7",
    title: "Stage Muster now sits above Disable on structure tiles",
    why: "On a tile with both a muster flag and a disable-able structure (e.g. Relay Beacon), Stage Muster/Set Hold/Set Advance showed up below the Disable button, making the muster controls easy to miss.",
    changes: [
      "The tile action menu now lists Stage Muster (and Set Hold/Set Advance/Clear Muster) above Disable/Enable for the tile's structure."
    ]
  },
  {
    createdAt: 1787430400000,
    introducedIn: "2026.08.22.6",
    title: "Joining a new season is now a deliberate choice",
    why: "Logging in used to silently spawn you into whatever season was active, even if you had never chosen to play it. Reconnecting was indistinguishable from joining.",
    changes: [
      "When you log in and haven't joined the current season yet, a \"Join Season\" prompt now appears instead of spawning you automatically.",
      "Confirming the prompt joins the season and spawns your starting territory; the prompt closes automatically once your empire appears."
    ]
  },
  {
    createdAt: 1787430300000,
    introducedIn: "2026.08.22.5",
    title: "Growing your territory over an enemy tile that was settled out of reach now takes it properly",
    why: "A tile could end up settled by an empire that never held any territory claim over it, which left no claim recorded for that tile at all. When your own territory later grew across it, the game treated the ground as empty and simply handed you the claim -- but because nothing was recorded as changing hands, the enemy's settled tile was never knocked back to a frontier tile. The result was an enemy town sitting inside your border that your territory could never dislodge, no matter how far your reach grew.",
    changes: [
      "When your territory grows over an enemy tile that was settled without a claim behind it, that tile now reverts to a frontier tile, the same as any other tile your border takes over.",
      "An enemy tile that is still genuinely defended by their own town, outpost or dock is unaffected -- it stays theirs, exactly as before."
    ]
  },
  {
    createdAt: 1787430200000,
    introducedIn: "2026.08.22.4",
    title: "Auto-settle no longer fires on tiles that have drifted out of reach",
    why: "Queuing a settle-then-build (or letting an AI empire's frontier auto-settle) could still fire once the tile had fallen out of reach in the meantime -- the server always rejected it as out-of-reach, but nothing checked first, so it just silently failed instead of being dropped up front.",
    changes: [
      "Both the player's queued auto-settle and an AI empire's automatic frontier settlement now check reach before sending a settle command, dropping the queued action instead of sending one that's guaranteed to be rejected.",
      "When a settled tile gets overtaken and reverts to a frontier tile because a rival's territory grew over it, it now plays a brief collapsing pylon effect on the map instead of changing silently."
    ]
  },
  {
    createdAt: 1787430100000,
    introducedIn: "2026.08.22.3",
    title: "Fixed the reach border dodging around fog of war and unexplored tiles",
    why: "Your reach border is a fixed, server-authoritative line -- it shouldn't move depending on what you can currently see. But the 2D map only drew the border on tiles it considered fully visible, so on any fogged or unexplored patch inside your own territory the line simply stopped, making it look like the border itself was carving around the fog instead of following your actual claim.",
    changes: [
      "The reach border now renders on top of fogged territory (dimmed, same as the rest of a fogged tile) instead of disappearing there.",
      "It still stays hidden over fully unexplored tiles, since there's nothing remembered there to draw it against."
    ]
  },
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
    createdAt: 1787415992729, // 2026.08.22.3 — frozen from a live Date.now() call
    introducedIn: "2026.08.22.3",
    title: "Non-winning seasons now leave a mark on your galaxy too: Outposts and Stipends",
    why: "The galaxy previously only recorded a season's outright winner as a permanent Planet, so every other empire's season vanished without a trace once it ended -- even a season played well but not won.",
    changes: [
      "A strong runner-up -- leading a different victory path than the one that won, with real hold-progress on it -- now claims a minor permanent Outpost, specialized by their own leading path and shown alongside your Planets in the galaxy view.",
      "Any other empire that meaningfully engaged with a victory path, without getting close to winning, now gets a one-time Stipend of Influence and Production instead, scaled to how far they got.",
      "Outposts appear in the public galaxy listing as territory, like Planets; Stipends are a one-time payout and only show up in your own galaxy view."
    ]
  },
  {
    createdAt: 1787419536000, // 2026.08.22.4 — frozen from a live Date.now() call
    introducedIn: "2026.08.22.4",
    title: "Winning a season now gives your next empire a starting head start",
    why: "Claiming a Planet previously ended with the galaxy view -- nothing about winning carried forward into how your next empire actually played. This is a first, deliberately small step toward the galaxy's full Wonder system (a permanent Production economy is still to come); for now the reward for winning is a one-time boost, not a lasting building.",
    changes: [
      "The most recent season's Planet winner now starts their next empire with a permanent manpower-regen head start and an expanded starting vision radius.",
      "It's a one-time grant, applied automatically the moment you spawn your next empire -- nothing to claim or activate."
    ]
  },
  {
    createdAt: 1787428700000,
    introducedIn: "2026.08.22.5",
    title: "Fixed a bogus 'Outside your borders' error after auto-settle finished a capture, and made unsettled tiles from a rival's border push show up live",
    why: "Auto-settle could still fire a doomed settle command right after a capture landed if the captured tile turned out to be outside your reach (e.g. a Relay Beacon chain dying mid-capture), surfacing a confusing 'Outside your borders' error even though nothing was actually wrong. Separately, when a rival's expanding border overtook one of your settled tiles and downgraded it to frontier, that change was only ever applied on the server -- it was never pushed to either player's client, so it silently went stale until you clicked the tile and forced a refresh.",
    changes: [
      "Auto-settle now checks reach before firing the settle right after a capture, same as it already does elsewhere, instead of sending a command the server was always going to reject.",
      "A settled tile downgraded to frontier by a rival's border push now updates live on both players' maps instead of only after clicking the tile."
    ]
  },
  {
    createdAt: 1787440000000, // 2026.08.22.6 — frozen from a live Date.now() call
    introducedIn: "2026.08.22.6",
    title: "The pending-season countdown is now a lobby: player count, roster, Discord, and an invite button",
    why: "Waiting for a pending season to start previously showed a bare countdown with nothing to confirm you actually had a spot, and no sense of who else was waiting with you.",
    changes: [
      "The pending-season screen now shows a live \"X / Y PLAYERS\" count and a scrollable roster of names currently waiting, alongside the countdown.",
      "A clear \"You're in\" confirmation replaces the ambiguous bare countdown -- your empire will be placed the moment the world begins.",
      "Added a Discord link and a \"Bring a friend\" button that copies a shareable link to the game.",
      "Added an optional flag: set a 2-letter country code in the pending-season screen and it shows next to your name in the roster for everyone else waiting."
    ]
  },
  {
    createdAt: 1787441000000, // 2026.08.22.7 — frozen; was Date.now() left in by the merged commit
    introducedIn: "2026.08.22.7",
    title: "The pending-season lobby is now its own full-screen war room, and its title no longer repeats the season id",
    why: "The lobby previously rendered as a translucent overlay with the game map, minimap, and HUD still visible underneath -- distracting for a screen players can sit on for a while, and it kept the client doing pointless map rendering for someone who isn't in the game yet. Separately, the lobby's heading duplicated the raw internal season id (e.g. \"Season season-8 starts soon\").",
    changes: [
      "While the pending-season lobby is open it now fully replaces the game view -- no canvas, minimap, or HUD bleeding through -- and returns to normal the instant your empire is placed.",
      "The game no longer renders the map/world underneath while the lobby is up, saving battery and CPU for players who are just waiting.",
      "Redesigned the lobby's look: a brass-and-gunmetal war-room panel with riveted corners, a glowing amber countdown dial, and a subtle cog motif, layered over the game's existing dark command-center theme.",
      "Fixed the lobby heading showing the raw season id twice (e.g. \"Season season-8 starts soon\") -- it now reads simply \"Season starts soon\"."
    ]
  }
];
export const CLIENT_CHANGELOG_ENTRIES: ClientChangelogEntry[] = [
  ...RECENT_CLIENT_CHANGELOG_ENTRIES,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER
];
