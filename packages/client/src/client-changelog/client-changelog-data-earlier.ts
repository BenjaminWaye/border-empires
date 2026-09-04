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
    createdAt: 1788161879677, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.29",
    title: "Your event log and logistics throughput now reliably stay current after a reconnect",
    why: "The server keeps a fast-reconnect cache of your empire's state so logging back in doesn't always require a full rebuild. That cache was patched from two separate, hand-maintained copies of the same merge logic (one on the game server, one on the connection gateway), and they'd already drifted more than once -- most recently, your recent-events log and logistics throughput number were both being sent live but silently dropped by the cache merge, so a reconnect served from that cache could show a stale or missing recent-events feed and logistics number even though the server's real state was correct.",
    changes: [
      "Unified the two copies of this merge logic into one, and fixed the event log and logistics throughput gaps found in the process -- both now reliably carry through a reconnect."
    ]
  },
];
