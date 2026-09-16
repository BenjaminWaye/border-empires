// Archived older changelog entries, split out of client-changelog-data.ts to
// keep it under the 500-line cap. See that file's header comment.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_70: ClientChangelogEntry[] = [
  {
    createdAt: 1789114974044, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.11.01",
    title: "Halved EXPAND (frontier claim) time",
    why: "Claiming a neutral tile felt slow relative to how often players expand, especially early game.",
    changes: [
      "EXPAND now takes 7.5s on plain land instead of 15s",
      "Forest and hills tiles keep their same 1.5x multiplier, so they now take 11.25s instead of 22.5s"
    ]
  },
  {
    createdAt: 1789114530477, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.11.01",
    title: "Launch Attack now prefers reusing a nearby muster flag over staging a new one",
    why: "Launching an attack with no fully-funded flag right next to the target used to auto-create a brand new muster flag even when an existing owned flag was just a few tiles away but under-staffed -- and if the player was already at their muster-flag cap, that create was silently rejected server-side and only discovered 5 seconds later, cancelling the attack.",
    changes: [
      "An attack with no fully-funded flag nearby now first looks for any owned, unreserved flag already within remote-funding range (or touching the target), even if it isn't fully staffed yet, and reroutes the attack onto it instead of staging a new flag",
      "If the player is already at their muster-flag cap and no existing flag is usable, the attack is now cancelled immediately with a clear \"Muster flags full\" message, instead of silently requesting a doomed new flag and waiting 5 seconds to find out it was rejected",
      "The muster-flag cap shown in that message (and in the equivalent MUSTER_LIMIT fallback message) now reflects the player's real cap, including tech/domain/wonder bonuses, instead of a hardcoded \"max 3\""
    ]
  },
  {
    createdAt: 1789073088458, // frozen, 1s after the selection-ring-outline entry -- keeps ordering stable without widening the "latest week" bundle window past older earlier-N entries
    introducedIn: "2026.09.11.1",
    title: "Fixed queued waypoints past #20 showing no map marker",
    why: "The waypoint queue's map overlay (a flag for each queued march/expand step, numbered by position) is sized to the same 20-entry cap the durable server-side queue enforces -- but two of the ways a waypoint gets queued (a plain adjacent-tile \"Expand Here\" click, and starting a Relay Beacon from an unowned frontier tile) pushed straight onto the local queue without checking that cap first, unlike every other way to queue a waypoint. A player who queued past 20 that way got a real, server-synced entry -- visible in the tile's own progress tab -- with no marker on the map at all, because the overlay simply has no flag slot beyond position 20.",
    changes: [
      "Both queuing paths now show the same \"Waypoint queue is full (20/20)\" warning every other queuing action already gives once the queue is at its cap, instead of silently accepting an entry the map can't display"
    ]
  }
];
