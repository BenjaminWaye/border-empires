// Older changelog entries split out of client-changelog-data.ts to keep that
// file under the 500-line cap. Entries are unordered — client-changelog.ts
// sorts the combined list by createdAt.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_12: ClientChangelogEntry[] = [
  {
    createdAt: 1788334721333, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.02.10",
    title: "3D map: fixed rival border lines crossing your own near an inactive neighbor",
    why: "The server pushes each rival's true, contest-resolved territory to you on connect so their border can be drawn correctly instead of guessed; that push is bounded by a total tile-scan budget so a large season can't turn login into an unbounded scan. The budget was charged against every rival's territory before checking whether you could even see it, so enough rivals outside your vision could exhaust the budget before the scan reached a genuinely adjacent, visible neighbor. If that neighbor was also inactive/offline, nothing ever re-triggered a retry, so their border stayed on the client's rough guess indefinitely -- visibly overlapping your own.",
    changes: [
      "A visible neighbor's territory is no longer skipped on connect just because other, invisible rivals happened to be scanned first"
    ]
  },
  {
    createdAt: 1788359660679, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.02.11",
    title: "3D map: settled territory tint is back to its original look",
    why: "A recent shadow-visibility change also switched settled/owned territory's tint to a multiply blend, so a tile's cast shadow shows through it -- after living with it, that read as the wrong color for settled land. Reverted to the original translucent alpha blend, matching frontier tint and fog-of-war, which were already reverted for the same reason.",
    changes: [
      "Settled/owned territory's tint is back to its original color and blend, matching frontier tint and fog-of-war"
    ]
  },
  {
    createdAt: 1788361363158, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.02.12",
    title: "Rejected adjacent-tile expand clicks now tell you why, instead of doing nothing",
    why: "Clicking to claim an adjacent tile that turned out unreachable (e.g. no path from your territory) used to fail completely silently -- no message, no console output, nothing on screen distinguished it from a successful click, making a genuine rejection look like the game just wasn't responding.",
    changes: [
      "A rejected adjacent-tile expand click now shows a \"Frontier claim blocked\" message explaining why (no path, already owned, allied/truced target, or no territory to expand from)"
    ]
  },
  {
    createdAt: 1788361914825, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.02.13",
    title: "Fixed the Overview tab not responding on a fogged tile with no cached data",
    why: "Clicking a fogged tile with no locally-remembered data opens its menu using a terrain-only placeholder built on the spot, but that placeholder was never saved into the client's own tile store -- only handed to the menu for that first render. Switching to the Overview tab re-fetches the tile by its map key to rebuild the view, and for this exact case that lookup came back empty, so the tab switch silently updated internal state without ever re-rendering, leaving the previous tab's contents on screen looking unresponsive.",
    changes: [
      "The Overview tab (and any other tab) now switches correctly on a fogged tile you have no prior data for"
    ]
  },
  {
    createdAt: 1788365301449, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.02.14",
    title: "Fixed chain-clicking adjacent tiles to expand stalling after a couple of tiles",
    why: "A plain adjacent-tile expand click enqueues into a durable server-side queue now instead of the old in-memory one, but it's only promoted into the live action queue lazily, the next time the queue drains itself with nothing else in flight. The check that lets one queued-but-not-yet-dispatched claim count as a valid launch point for the next click was never updated for that -- it only ever looked at the old in-memory queue -- so a tile still waiting behind an in-flight claim was invisible to it, and the very next click adjacent to it opened the tile menu instead of chaining onward.",
    changes: [
      "Chain-clicking adjacent neutral tiles to expand your border now keeps working past the first couple of tiles instead of stalling and opening the tile menu"
    ]
  },
];
