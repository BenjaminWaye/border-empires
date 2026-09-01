// Older client-changelog entries, split out of client-changelog-data-earlier-2.ts
// to keep that file under the repo's 500-line cap (see the comment at
// client-changelog-data.ts's top). Same shape and rules apply here:
// unordered, append-only, frozen createdAt literals.
//
// Entries here are still bound by the "latest week only" rule enforced in
// client-changelog.test.ts — this file exists purely to keep the other
// changelog data files under their line cap when the trailing week has a lot
// of entries, not as a permanent archive. Prune entries here once they fall
// outside the trailing week, same as in the other three files.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_3: ClientChangelogEntry[] = [
  {
    createdAt: 1787823264967, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.27",
    title: "Enable <structure> is disabled on an unsettled tile",
    why: "A disabled economic structure (Relay Beacon, synthesizer, weapons factory, etc.) standing on a FRONTIER (not yet settled) tile could still be re-enabled, letting it resume occupying a resource slot and providing bonuses from a tile that isn't actually settled.",
    changes: [
      "The Enable action for any disabled economic structure is now disabled with \"Tile is not settled\" whenever the tile it stands on is FRONTIER rather than SETTLED."
    ]
  },
  {
    createdAt: 1787845125243, // frozen: one ms before the "Waypoints now keep making progress while you're offline" entry in client-changelog-data.ts (was a live Date.now() call, which drifts stale relative to the sliding 6-day window and eventually fails client-changelog.test.ts's week-window check)
    introducedIn: "2026.08.27",
    title: "Fixed previously explored land turning back into unexplored fog on reconnect",
    why: "On a fresh-state reconnect (e.g. after a page refresh), the client restores previously explored tiles from localStorage before the INIT message finishes hydrating the current view -- but that hydration step then clears the discovered-tiles set back down to just what's in its own snapshot, silently wiping out the restore. Any previously explored tile outside the current view radius came back looking unexplored instead of correctly fogged, until the player scrolled back over it.",
    changes: [
      "Previously explored tiles now stay correctly fogged (rather than reverting to unexplored) on reconnect, by restoring them from local storage after the view snapshot is applied instead of before."
    ]
  },
  {
    createdAt: 1787837642949, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.27.4",
    title: "Fixed an expand/attack in progress across a reconnect losing its result",
    why: "If you closed the game (or it dropped connection) while an Expand or Attack was still resolving, reopening it lost track of that action entirely: the server still finished it correctly, but the fresh page had no memory of having started it, so the confirmation and claim animation never showed and it looked like nothing had happened -- or like a queued waypoint chain behind it had simply vanished.",
    changes: [
      "Reconnecting while an Expand or Attack is still resolving now correctly shows its result (claim animation, success message) instead of silently dropping it."
    ]
  },
  {
    createdAt: 1787861036777, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.27",
    title: "Fixed offline waypoints stalling after their second leg",
    why: "The server's offline waypoint drain re-checked every 2 seconds regardless of whether the previous EXPAND/ATTACK leg had actually resolved (a claim takes 15+ seconds), so it would launch the next leg from a tile the player didn't own yet, get rejected, and permanently give up on that waypoint -- offline multi-hop expansion effectively stopped after one hop.",
    changes: [
      "The offline waypoint drain now waits for the in-flight leg to resolve before launching the next one, and won't dispatch a leg from an origin tile it doesn't yet own -- multi-hop waypoints now keep expanding for the whole time you're offline instead of stalling after the second step."
    ]
  },
  {
    createdAt: 1787863023331, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.27",
    title: "Bigger islands, and every mountain ring interior now holds something",
    why: "Islands-style worlds still read as mostly empty ocean even after the previous size increase, and mountain rings (the annulus-shaped mountain formations scattered across every map) sealed off a pocket of open land in their interior that no existing placement pass specifically targeted -- the town coverage sweeps and the mountain-proximity natural wonder predicates only checked whether a nearby 15x15/30x30 grid block or a random map-wide sample happened to land inside a ring, so most ring interiors stayed empty.",
    changes: [
      "Islands-style land coverage increased further (roughly 30% -> 40% land on average across sampled seeds), with bigger and more numerous islands, while staying visually distinct from continents (still 20-30+ separate island landmasses with real sea channels between them).",
      "Every land-accessible mountain ring interior is now guaranteed a settlement during world generation, instead of most rings sitting empty inside their mountain walls."
    ]
  },
  {
    createdAt: 1787898679176, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.28",
    title: "Fixed waypoints appearing to vanish on a quick reconnect",
    why: "Setting or cancelling a waypoint only marked the command resolved server-side -- it never pushed a live update of the queue, unlike almost every other player action. Since queuing a waypoint doesn't change any tile ownership, nothing else happened to refresh the gateway's per-connection snapshot cache either. A reconnect soon after (e.g. closing and quickly reopening the browser) could be served that stale, pre-waypoint snapshot, making a waypoint you'd just set look like it had never been placed -- or a cancelled one look like it was still there.",
    changes: [
      "Setting, cancelling, or clearing a waypoint now pushes a live update the same way other actions do, so a reconnect immediately after always sees the current queue instead of a stale one."
    ]
  },
  {
    createdAt: 1787900126768, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.28",
    title: "Fixed the build/settle queue (and its held manpower) appearing stale on a quick reconnect",
    why: "Same root cause as the waypoint-vanishing bug fixed just before this: queuing, cancelling, or reordering a build/settle queue entry only marked the command resolved server-side -- it never pushed a live update, so nothing refreshed the gateway's per-connection snapshot cache. This queue also reserves manpower the moment an entry is queued, so a reconnect soon after could show both a stale queue and stale manpower until some unrelated action happened to refresh it.",
    changes: [
      "Queuing, cancelling, or reordering a build/settle queue entry now pushes a live update the same way other actions do, so a reconnect immediately after always shows the current queue and manpower instead of a stale snapshot."
    ]
  },
  {
    createdAt: 1787905670825, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.28.3",
    title: "Waypoints and queued builds now actually survive a reconnect",
    why: "The login/reconnect message builds its player object as an explicit field-by-field list, and the waypoint queue and build/settle queue were never on that list -- so they were dropped at the very last step before being sent, on every single reconnect. The server had them the whole time and every layer underneath passed them along correctly; they just never made it into the message. This is why a waypoint could keep expanding correctly while you were away and still show up completely gone the moment you logged back in.",
    changes: [
      "Your waypoint queue and build/settle queue are now included in the login/reconnect message, so they reliably come back exactly as the server has them -- flags, planned routes, and mid-route progress included."
    ]
  },

];
