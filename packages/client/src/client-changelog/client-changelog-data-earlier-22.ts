// Older changelog entries split out of client-changelog-data.ts to keep that
// file under the 500-line cap. Entries are unordered — client-changelog.ts
// sorts the combined list by createdAt.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_22: ClientChangelogEntry[] = [
  {
    createdAt: 1788674151352, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.06.02",
    title: "Siege Outpost's build menu description now says what it actually does",
    why: "The build menu described a fresh Siege Outpost as adding \"an offensive staging point on this border or dock tile,\" which just restates where you're clicking and says nothing about what the structure grants -- attack reach on tiles within its radius.",
    changes: [
      "Building a Siege Outpost now describes it as granting attack reach to tiles within 5 tiles of it, instead of restating the tile it's built on"
    ]
  },
  {
    createdAt: 1788673582304, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.06.01",
    title: "Fixed muster flags that could get stuck and never accumulate manpower",
    why: "A muster flag is only ticked by scanning an internal per-player index of active flags, not by scanning tiles directly — if a flag ever fell out of that index, it stopped receiving manpower entirely and just sat frozen at whatever amount it had, no matter how much manpower was banked or how long you watched it.",
    changes: [
      "Setting a muster flag now re-registers it in the server's tracking index every time, so a flag that had silently dropped out of tracking starts accumulating manpower again instead of staying stuck"
    ]
  }
];
