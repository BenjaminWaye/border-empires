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
    createdAt: 1787688556298, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.25.5",
    title: "Hid the redundant \"0 gold\" in the Build Relay Beacon action cost",
    why: "The Build Relay Beacon action's cost string always prepended the gold cost, even when expand + settle + build all cost 0 gold, so the Actions tab showed a confusing \"0 gold, N m.p. ...\" line.",
    changes: [
      "The Build Relay Beacon action's cost text now omits the gold segment entirely when the gold cost is 0."
    ]
  },
  {
    createdAt: 1787688715010, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.25.6",
    title: "Fixed the water skirt wall leaving a gap at wave crests",
    why: "The water skirt wall added moments earlier (2026.08.25.5) closed the black gap under coastal sea tiles, but its top edge was drawn once and never touched again, while the water surface itself bobs up and down every frame with the wave animation. Whenever the wave lifted the surface above the skirt's static top, the same black gap reappeared.",
    changes: [
      "The water skirt's top edge now rides the same wave animation as the surface, so it stays flush with the water at every frame instead of only when the sea happens to be at rest."
    ]
  },
  {
    createdAt: 1787689171531, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.25.6",
    title: "Fixed auto-settle trying to build on resource tiles outside your reach",
    why: "The auto-settle queue included every owned frontier tile with a resource, town, or dock without checking reach, so a plain resource tile (which generates no reach of its own) claimed outside your reach border kept getting re-queued and rejected with an OUT_OF_REACH error.",
    changes: ["Auto-settle no longer queues frontier tiles that are currently outside your reach border."]
  },
  {
    createdAt: 1787691972634, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.25.6",
    title: "Town population bar now shows progress toward the next tier",
    why: "The town overview's population bar showed current population against the town's absolute population cap, which barely moved even as a town grew and gave no sense of how close it was to upgrading tiers.",
    changes: [
      "The population bar and its number now track progress toward the next population tier (e.g. Town → City) instead of the absolute population cap, and turns green once that tier's threshold is reached."
    ]
  },
  {
    createdAt: 1787817717886, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.27",
    title: "Fixed frontier tiles falsely glowing amber after panning the map",
    why: "The decay-countdown pulse writes its amber tint straight into the ownership overlay's GPU color buffer every frame, separately from the buffer's own rebuild-on-pan color update. Both writers shared one pending-upload list, and the pulse's per-frame bookkeeping was clearing that list before the rebuild's own full-buffer update reached the GPU whenever a pan/zoom rebuild and a pulse tick landed in the same frame. Any frontier tile that a rebuild reassigned to a vertex slot the pulse didn't touch that frame kept whatever color the GPU already had there from a previous tile -- including, e.g., another empire's amber decay pulse -- until the next rebuild happened to also touch that exact slot.",
    changes: [
      "Panning or zooming the map over frontier tiles no longer occasionally leaves random, non-decaying tiles stuck glowing amber like the frontier-decay pulse."
    ]
  },
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
  },
  {
    createdAt: 1787904636695, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.28.2",
    title: "Fixed waypoints and build/settle queue entries still vanishing on some reconnects",
    why: "The previous two fixes for this pushed a live update whenever a waypoint or build/settle queue entry changed, but the server's own fast-reconnect snapshot cache -- a separate copy of the merge logic used to serve a quick reconnect without rebuilding your whole world state -- had never been taught about these two fields at all, so it silently dropped them regardless of the live update. This mattered most exactly when the earlier fixes couldn't help: while you were offline (no live connection to push an update to), your waypoint or queue kept working correctly on the server, but a reconnect could still be served a snapshot from before it existed.",
    changes: [
      "The server's fast-reconnect snapshot now correctly includes your current waypoint and build/settle queues in every case, including right after a period offline."
    ]
  },
  {
    createdAt: 1787689447704, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.25.7",
    title: "Fixed flickering at the coastline where the water and land skirts overlapped",
    why: "The water skirt wall added in 2026.08.25.5/.6 drew a wall on all 4 sides of every exposed water tile, including north/east/west edges that sat right where the land's own coastal skirt wall already runs. Two near-coplanar unlit walls animating independently z-fought against each other every frame, flickering.",
    changes: [
      "The water skirt now only draws its south-facing edge (the side that actually faces the camera at the default view angle), leaving the land skirt to cover the other three sides instead of overlapping it."
    ]
  }
];
