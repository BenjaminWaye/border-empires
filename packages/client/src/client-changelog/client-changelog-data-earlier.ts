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
