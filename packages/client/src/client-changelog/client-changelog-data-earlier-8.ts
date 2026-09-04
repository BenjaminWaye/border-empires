// Older changelog entries split out of client-changelog-data.ts to keep that
// file under the 500-line cap. Entries are unordered — client-changelog.ts
// sorts the combined list by createdAt.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_8: ClientChangelogEntry[] = [
  {
    createdAt: 1788293619717, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.02.3",
    title: "Expand clicks no longer vanish if you close the browser before they're sent",
    why: "Clicking to claim an adjacent tile queued the claim only in an in-memory client array that was never sent to the server until it was actually dispatched one at a time. Click expand several times in a row, close the browser before they all went out, and everything still waiting in that local queue was silently discarded on reload -- with zero record of it ever having existed, since it never reached the server in the first place. Multi-hop waypoint plans and \"Build Relay Beacon\" already avoided this by submitting through a durable, server-side queue that keeps draining even while offline.",
    changes: [
      "A plain adjacent-tile expand click now submits through the same durable server-side queue as multi-hop waypoint plans, so queued claims survive closing and reopening the browser"
    ]
  },
  {
    createdAt: 1788108392688, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.30.4",
    title: "You can now build a Palisade on a tile that already has a Relay Beacon",
    why: "A Palisade and a Relay Beacon both occupy the same build slot on a tile, so trying to build a Palisade where a Relay Beacon already stood was rejected outright with \"tile already has structure\" -- even though a full Fort is explicitly allowed to take that slot from a Relay Beacon. Palisade is the entry tier of the same Fort ladder and had no equivalent carve-out.",
    changes: [
      "Building a Palisade on a tile with an existing Relay Beacon now succeeds and replaces the beacon, matching how building a Fort there already worked",
      "The Relay Beacon's vision bonus ends once it's replaced by the Palisade, the same as any other structure it's built over"
    ]
  },
];
