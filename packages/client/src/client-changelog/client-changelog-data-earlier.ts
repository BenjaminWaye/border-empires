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
  }
];
