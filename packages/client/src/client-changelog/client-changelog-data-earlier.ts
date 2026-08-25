// Older client-changelog entries, split out of client-changelog-data.ts to keep
// that file under the repo's 500-line cap (see the comment at its top). Same
// shape and rules apply here: unordered, append-only, frozen createdAt literals.
// client-changelog-data.ts merges this array into CLIENT_CHANGELOG_ENTRIES.
//
// Entries here are still bound by the "latest week only" rule enforced in
// client-changelog.test.ts — this file exists purely to keep
// client-changelog-data.ts under its line cap when the current week has a lot
// of entries, not as a permanent archive. Prune entries here once they fall
// outside the trailing week, same as in client-changelog-data.ts.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER: ClientChangelogEntry[] = [
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
    createdAt: 1787519500000, // frozen from a live Date.now() call
    introducedIn: "2026.08.23.8",
    title: "Added a \"Suggest Improvement\" button next to Report Bug",
    why: "Players had a way to report bugs from Settings, but no equivalent in-app way to send us an improvement idea -- feedback ended up scattered across Discord instead.",
    changes: [
      "Settings > Diagnostics now has a green-bordered \"Suggest Improvement\" button below \"Report Bug\", opening the same style of form (with client/server context attached automatically) but posting to a separate suggestions inbox."
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
    createdAt: 1787572138646, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.24.3",
    title: "Settle Land's tooltip no longer name-drops \"production\"",
    why: "The Settle Land tooltip said it \"activates production,\" which is internal jargon that didn't mean anything concrete to players -- what gets produced, and how much, differs per tile (food, titanium, crystal, town growth) and was never spelled out here anyway.",
    changes: [
      "Settle Land's tooltip now just says \"Makes this tile defendable,\" dropping the vague \"activates production\" clause."
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
    createdAt: 1787510053323, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.23.3",
    title: "You can now expand beyond your reach -- but the land decays if you can't hold it",
    why: "Expanding outside your reach was simply blocked, which made reach feel like an arbitrary wall rather than a real decision. Now you can push into open land whenever you like, and the risk -- not a hard rule -- is what stops you from blobbing across the map.",
    changes: [
      "You can now claim and capture tiles outside your reach. Land taken out there is unstable: it decays away after 2 minutes unless your reach catches up to it.",
      "Extending your reach over a decaying tile -- with a nearby Town, Dock, or Outpost -- makes it stable again and stops the countdown.",
      "Decaying tiles pulse amber on the map and show a countdown in the tile menu, so you can see exactly how long you have.",
      "Contested borders are exempt: if your reach overlaps a rival's where you're expanding, the land does not decay. Fighting over a shared border works as it always has.",
      "The first time it happens, a tip explains what's going on."
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
    createdAt: 1787295212839, // 2026.08.21.1 — frozen from a live Date.now() call left in by the merged commit
    introducedIn: "2026.08.21.1",
    title: "Fixed research (tech/domain) picks being lost on server restart or deploy",
    why: "On startup, the simulation server rebuilds state from the latest checkpoint snapshot and then replays any events recorded after that checkpoint. That replay step had no handler for tech or domain research events, so a research pick made after the last checkpoint but before a restart or deploy was silently dropped instead of being reapplied — the player would come back with an earlier set of researched techs/domains than they actually had.",
    changes: [
      "Tech and domain research chosen shortly before a server restart or deploy is now correctly preserved instead of sometimes reverting to an earlier state."
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
    createdAt: 1787476075398, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.23",
    title: "Redesigned the bug report form",
    why: "The Report a Bug dialog was unstyled -- a bare textarea and buttons popping in and out instantly with no visual feedback -- which felt broken for a tool meant to inspire confidence while reporting something broken.",
    changes: [
      "The bug report dialog now fades and scales in/out instead of snapping open and closed, and closes on Escape or by clicking its new close button.",
      "Redesigned the dialog with a proper card layout, icon, and a styled textarea that matches the game's other overlays instead of looking like an unstyled default form.",
      "Submitting now shows a spinner while gathering logs and sending, and a clear checkmark or error icon once it finishes."
    ]
  },
  {
    createdAt: 1787463828305, // frozen from `date +%s%3N`
    introducedIn: "2026.08.23",
    title: "Fixed the season lobby not covering the full screen, removed the flag picker, fixed the invite button, and unified the join-season screens",
    why: "Beta feedback: the lobby was rendering as a small card in the corner over plain black space instead of filling the screen; the optional country-flag picker wasn't wanted in the lobby UI; the \"Bring a friend\" button did nothing when the clipboard API wasn't available and gave no feedback either way; and the plain \"Join Season?\" prompt (for a season that's already running) looked like a completely different, plainer screen than the war-room lobby.",
    changes: [
      "The season lobby now actually fills the screen edge-to-edge instead of floating as a small card over empty black space.",
      "Removed the \"Show your flag in the lobby?\" picker and the flag emoji next to roster names.",
      "The \"Bring a friend\" invite button now always gives visible feedback: it swaps to \"Copied!\" inline (with a manual-copy fallback if the clipboard API isn't available) instead of silently doing nothing.",
      "The plain \"Join Season?\" prompt (shown when a season is already running and you haven't joined yet) now shares the same full-screen war-room look as the pending-season lobby, and shows the live player count and roster alongside its Join button."
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
    createdAt: 1787323800000,
    introducedIn: "2026.08.21.4",
    title: "Fixed border pylons and structures drifting away from the ground while panning",
    why: "The zoom-smoothness fix above let the terrain skip a rebuild for any pan that stayed inside a padded window, but every other 3D overlay (ownership border pylons/walls, flags, badges, selection markers) still repositions itself every single frame off the live camera with no such padding. Mid-pan, that left the terrain's baked geometry pinned to wherever it was last rebuilt while border pylons and structures kept gliding on with the live camera, so towers and border lines visibly separated from the tiles under them until the pan stopped.",
    changes: [
      "Panning the 3D map now always rebuilds the terrain to match the live camera, so border pylons, structures, and the ground they sit on stay locked together while scrolling. The zoom-only rebuild savings from the fix above are unaffected."
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
    createdAt: 1787345991317,
    introducedIn: "2026.08.21",
    title: "War music no longer flickers back to calm music during an ongoing war",
    why: "War music was driven only by whether a battle-clash animation was actively playing, which is pruned a few seconds after each individual skirmish resolves. During a sustained war, that gap between skirmishes flipped the music back to calm and then straight back to combat, over and over.",
    changes: [
      "War music now also stays engaged for as long as any muster flag is set to Advance, since that's a durable sign of an ongoing offensive rather than a single skirmish's animation window."
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
    createdAt: 1787430200000,
    introducedIn: "2026.08.22.4",
    title: "Auto-settle no longer fires on tiles that have drifted out of reach",
    why: "Queuing a settle-then-build (or letting an AI empire's frontier auto-settle) could still fire once the tile had fallen out of reach in the meantime -- the server always rejected it as out-of-reach, but nothing checked first, so it just silently failed instead of being dropped up front.",
    changes: [
      "Both the player's queued auto-settle and an AI empire's automatic frontier settlement now check reach before sending a settle command, dropping the queued action instead of sending one that's guaranteed to be rejected.",
      "When a settled tile gets overtaken and reverts to a frontier tile because a rival's territory grew over it, it now plays a brief collapsing pylon effect on the map instead of changing silently."
    ]
  }
];
