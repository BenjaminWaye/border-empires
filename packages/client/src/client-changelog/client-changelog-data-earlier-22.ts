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
  },
  {
    createdAt: 1788325360893, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.02.7",
    title: "3D map: fog-of-war is a solid dark tint again, not a washed-out one",
    why: "The previous fix reverted fog-of-war's black darkening quad to the original translucent alpha blend, which read as too washed-out/see-through against the ground's real lit-and-shadowed color -- undoing the fog effect's whole point of hiding stale, out-of-vision terrain. Frontier tint is genuinely meant to be a subtle wash and stays that way; fog-of-war is meant to read as solidly dark, which is what the multiply blend (the same one settled/owned territory uses) actually gives it.",
    changes: [
      "Fog-of-war (previously-seen but currently out-of-vision territory) is back to a solid, near-opaque dark tint instead of a washed-out translucent one"
    ]
  },
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
