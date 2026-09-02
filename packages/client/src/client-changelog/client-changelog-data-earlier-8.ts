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
];
