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
    createdAt: 1787687420759, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.25.4",
    title: "Reverted the crisp border-ribbon prototype on the 3D ownership overlay",
    why: "The prototype border ribbon along exposed territory edges (#1474) didn't read well in practice -- pulled back out to the flat fill-tint look while a better edge treatment is worked out.",
    changes: [
      "3D territory tiles no longer draw a bright border ribbon along exposed edges; back to the fill-only look."
    ]
  },
  {
    createdAt: 1787682600000, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.25.4",
    title: "Fixed the out-of-reach decay pulse jumping every time you panned the camera",
    why: "The amber/white frontier-decay countdown pulse was baked into the ownership overlay's mesh colors inside the same rebuild that also fires on every camera pan or zoom (not just on actual game-state changes), sampling the wall clock fresh each time -- so panning the map made the pulse visibly jump or restart instead of animating smoothly.",
    changes: [
      "The decay pulse now animates from a per-frame update independent of camera movement, the same pattern already used for the reach-border pylon animation -- it only reacts to the tile's actual decay state, never to panning or zooming."
    ]
  },
  {
    createdAt: 1787501551526, // frozen just after the "Maybe your empire is in ruins" entry
    introducedIn: "2026.08.21",
    title: "Village smoke and capital banners are now animated on the GPU instead of the CPU",
    why: "Village smoke puffs, captured-town smoke columns, and capital banner positions were recomputed and re-uploaded to the GPU (bufferSubData) every single frame for every visible instance — up to ~7,000 combined smoke puffs — regardless of whether the camera or game state changed at all. A CPU trace from a live session showed WebGL buffer uploads as the dominant per-frame cost, correlating with a sustained ~11-12fps. The rise/drift/scale/fade animation now runs entirely in a GPU vertex shader driven by a single time value; the CPU only writes each puff's base position once, when villages or captured towns actually change (not every frame). Capital banner positions — which never moved — were also being needlessly rewritten every frame; they're now set once too. Visually identical to before.",
    changes: [
      "No visible change — this is a performance fix for the 3D map's frame rate. Village smoke, captured-town smoke, and capital banners render identically, just far cheaper per frame."
    ]
  },
  {
    createdAt: 1787766405640, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.26.2",
    title: "Settle now works on a captured town or dock outside your reach",
    why: "A captured town or dock frontier tile (e.g. taken by Attack, which isn't reach-gated) could sit outside your reach border and keep getting rejected with \"tile is outside your reach\" every time Settle was attempted, even though settling it is exactly what would give it its own reach in the first place -- a Catch-22 that made some captured towns/docks permanently unsettleable.",
    changes: [
      "Settle no longer requires a captured town or dock tile to already be inside your reach -- only plain resource/support frontier tiles still need that."
    ]
  },
  {
    createdAt: 1787472289089, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.23",
    title: "Settled resource tiles now show their real slot production instead of stale prose",
    why: "A settled Farm/Fish/Titanium/Gems/Umbrite tile's overview said \"Resource node can produce food once developed and collected\" even after being settled -- a holdover from the old per-day yield model. FOOD/TITANIUM/CRYSTAL/UMBRITE production moved to the slot-supply system a while ago, so that line was permanently stale and never resolved into a real number.",
    changes: [
      "A settled resource tile's overview now shows a \"Production:\" line with the actual FOOD/TITANIUM/CRYSTAL/UMBRITE slot count it contributes (e.g. \"Production: 🍞 Food +1\"), matching the format already used for buildings, instead of the old \"can produce ... once developed and collected\" prose.",
      "A Farmstead/Mine/Umbrite Rig built on its tile now visibly bumps that slot count (e.g. a Farmstead on a Farm tile shows \"Food +2\")."
    ]
  },
  {
    createdAt: 1787463213160, // 2026.08.22.15 — frozen from a live Date.now() call
    introducedIn: "2026.08.22.15",
    title: "Fixed a spurious build error when settling into a Relay Beacon (or any settle+build)",
    why: "Queuing a settle-then-build (e.g. the frontier \"Build Relay Beacon\" action) made the client fire its own build command the moment the tile finished settling, racing the server's own durable build-on-settle. Whichever lost the race got rejected with a confusing \"tile already has structure\" error, even though the beacon still ended up built.",
    changes: [
      "The client no longer sends its own duplicate build command after an auto-settle -- the server's durable continuation now owns firing that build, so there's no race and no spurious error."
    ]
  },
  {
    createdAt: 1787462378800, // frozen from a live Date.now() call
    introducedIn: "2026.08.23",
    title: "Clearer Build Relay Beacon button text",
    why: "The frontier Build Relay Beacon button described its internal mechanics (\"expand + settle + build\") instead of what it does for the player.",
    changes: [
      "The Build Relay Beacon button on unclaimed tiles now reads \"Expand your borders\" instead of the old internal-mechanics description."
    ]
  },
  {
    createdAt: 1787431431635, // frozen from a live Date.now() call
    introducedIn: "2026.08.22.12",
    title: "Fixed rivers clipping through hills",
    why: "River ribbons rendered at the flat ground elevation, ignoring the raised dome mesh used for hill tiles, so a river crossing a hill looked like jagged glued-together rectangles instead of a smooth ribbon.",
    changes: ["Rivers now render above the hill dome wherever their path crosses a hills tile."]
  },
  {
    createdAt: 1787509343955, // frozen from `date +%s%3N`
    introducedIn: "2026.08.23.3",
    title: "Reach no longer spreads across open water",
    why: "A town, outpost, or dock's reach radius was purely geometric with no terrain awareness, so a coastal or island anchor's disk routinely covered land on the far side of a bay or strait even with no unbroken land route to it -- letting you EXPAND/SETTLE onto land you had no real connection to.",
    changes: [
      "A normal reach anchor's radius now only extends onto land reachable by an unbroken land path from the anchor, within the radius -- water is still included right at the coastline, it just can't act as a stepping-stone onto land further out.",
      "The Aether Bridge's water-crossing reach grant is unaffected -- bridging across water without a land connection is still exactly what it's for."
    ]
  },
  {
    createdAt: 1787509994281, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.23.3",
    title: "Fixed queued settlements/builds sometimes sitting stalled after logging back in",
    why: "A queued SETTLE or BUILD only starts once an earlier one in your queue finishes, and that hand-off only happens when the server notices a slot just freed up. If a slot freed up while you were disconnected, nobody was around to trigger that hand-off, so your next queued action could sit stalled -- looking untouched -- until some unrelated action elsewhere happened to free another slot.",
    changes: [
      "Logging back in now immediately checks your queue for anything that's actually free to start, instead of waiting on an unrelated event to notice."
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
    createdAt: 1787678904061, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.25.4",
    title: "Fixed \"Expand To\" being blocked on tiles outside your reach again",
    why: "Expand was opened up to out-of-reach frontier tiles (claimed land there just decays after 2 minutes unless your reach catches up), but a later change restored an OUT_OF_REACH server rejection for EXPAND without updating the client, so \"Expand To\" silently failed or wasn't offered on tiles adjacent to your border but outside your town/outpost's fixed reach radius.",
    changes: [
      "EXPAND is no longer reach-gated server-side. Claiming land outside your reach is allowed again, at the risk of it decaying back to neutral if your reach doesn't catch up to it in time."
    ]
  },
  {
    createdAt: 1787501551525, // frozen just after this file's prior latest entry, to avoid pushing the 6-day window past an older "earlier" entry
    introducedIn: "2026.08.23.5",
    title: "AI empires no longer play ahead during the season lobby countdown",
    why: "Locking new human players out of a season until the lobby countdown finished didn't also stop AI empires from acting -- they kept building, expanding, and fighting during the countdown, so by the time human players were let in the AI had a head start nobody could see coming.",
    changes: [
      "AI empires now stay locked out of taking any actions during the lobby countdown, just like new human players, until the season actually starts."
    ]
  },
  {
    createdAt: 1787501551526, // frozen just after the entry above
    introducedIn: "2026.08.21",
    title: "Village smoke and capital banners are now animated on the GPU instead of the CPU",
    why: "Village smoke puffs, captured-town smoke columns, and capital banner positions were recomputed and re-uploaded to the GPU (bufferSubData) every single frame for every visible instance — up to ~7,000 combined smoke puffs — regardless of whether the camera or game state changed at all. A CPU trace from a live session showed WebGL buffer uploads as the dominant per-frame cost, correlating with a sustained ~11-12fps. The rise/drift/scale/fade animation now runs entirely in a GPU vertex shader driven by a single time value; the CPU only writes each puff's base position once, when villages or captured towns actually change (not every frame). Capital banner positions — which never moved — were also being needlessly rewritten every frame; they're now set once too. Visually identical to before.",
    changes: [
      "No visible change — this is a performance fix for the 3D map's frame rate. Village smoke, captured-town smoke, and capital banners render identically, just far cheaper per frame."
    ]
  },
  {
    createdAt: 1787501551524, // frozen one ms after the incoming "Lowered the season player cap to 50" entry
    introducedIn: "2026.08.23.4",
    title: "\"Maybe your empire is in ruins\" no longer fires while you're still waiting in the pre-game lobby, and the lobby fits mobile screens properly",
    why: "Income is naturally zero before a world has started, but the respawn prompt only checked income, so everyone waiting for a season to begin got told their empire might be in ruins. Separately, on narrow phone screens the lobby's roster/ID text could get clipped at the edge of the screen and the \"Join the Discord\" button wrapped its label onto two lines.",
    changes: [
      "The respawn prompt now also checks that you're not still waiting to join a season before suggesting a respawn.",
      "The pre-game lobby now reclaims horizontal space on narrow phones and stacks its action buttons full-width, so \"Join the Discord\" and roster/ID rows no longer wrap or run off the edge of the screen."
    ]
  },
  {
    createdAt: 1787749806338, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.26.2",
    title: "AI empires can now unblock growth when out of FOOD slots",
    why: "When an AI ran completely out of FOOD slots with no Farmstead/Waterworks/Granary build available to grow more, it had no way out -- every FOOD-costing build (including a new Relay Beacon, which is the AI's only path to claim more farmland) stayed permanently illegal, so a starved AI empire would just get stuck forever instead of expanding its way out of the shortage.",
    changes: [
      "An AI empire that's fully out of FOOD slots, with no direct way to grow more, will now disable one of its own Relay Beacons that isn't covering any resources to free up the slot for further growth.",
      "This is always a reversible disable, never a demolition -- the building stays intact and can be re-enabled once FOOD has headroom again."
    ]
  }
];
