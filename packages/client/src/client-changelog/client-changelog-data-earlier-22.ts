// Older changelog entries split out of client-changelog-data.ts to keep that
// file under the 500-line cap. Entries are unordered — client-changelog.ts
// sorts the combined list by createdAt.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_22: ClientChangelogEntry[] = [
  {
    createdAt: 1788434136633, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.03.3",
    title: "Fixed muster flags surviving on tiles you just captured deep in enemy territory",
    why: "ATTACK only requires your origin tile to be owned, not the target to be inside your own live vision -- so a raid chained through your own previously-claimed (possibly out-of-reach) frontier ground could capture a tile you have no coverage of at all. The server always destroyed the defender's muster flag on capture, but the corrected tile update was only ever force-delivered to the defender who lost it, not to you as the attacker. If the newly-captured tile sat outside your own vision, your own game's normal visibility check silently dropped that update, leaving your client showing the enemy's stale muster flag on ground that was already yours.",
    changes: [
      "A captured tile's resolved state (ownership, and any muster flag being cleared) is now always force-delivered to the attacker as well as the previous owner, regardless of whether the tile is inside the attacker's own current vision"
    ]
  },
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
  },
  // Pruned: the fog-of-war solid-tint fix (2026.09.02.7) aged out of the
  // "keeps only the latest week of entries" window (client-changelog.test.ts)
  // as real time advanced.
  {
    createdAt: 1788329843239, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.02.8",
    title: "Fixed clicking a fogged tile sometimes doing nothing",
    why: "Whether a tile counts as fogged is decided by discoveredTiles, which is restored from localStorage across a page reload -- but the actual remembered tile data (owner, terrain, structures) in state.tiles is not restored, only refetched as tiles come back into live vision. A tile fogged before the current session started therefore had no local record at all, and the click handler only opened the tile info panel when that local record existed -- so clicking it silently did nothing, with no error and no feedback.",
    changes: [
      "Clicking a fogged tile with no remembered local data now opens the tile info panel with what's actually knowable (its terrain) instead of doing nothing"
    ]
  }
];
