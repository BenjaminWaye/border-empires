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
  }
];
