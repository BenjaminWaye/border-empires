// Archived older changelog entries, split out of client-changelog-data.ts to
// keep it under the 500-line cap. See that file's header comment.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_69: ClientChangelogEntry[] = [
  {
    createdAt: 1789506746396, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.15.01",
    title: "Diagonal land tiles now read as a connected landmass instead of a pinched-off water gap",
    why: "A 3D map vertex shared by 4 tiles couldn't tell a diagonal LAND/SEA checkerboard (land at two opposite corners, sea at the other two) apart from a normal coastline -- both looked identical to the corner's land/sea tally, so two diagonally touching land tiles always showed a thin ring of beach/sea between them at that corner, no matter how the coastline wobble (shipped separately) was tuned. This purely visual fix recognizes that specific diagonal arrangement and biases the shared corner's blend and elevation toward land instead, so the pair reads as a narrow spit/isthmus connecting them rather than a pinch of water. Doesn't change which tiles are actually land vs. sea.",
    changes: [
      "Two diagonally touching land tiles on the 3D map now read as connected by a narrow land bridge at their shared corner, instead of always showing a thin ring of beach/sea between them",
      "2D canvas fallback renderer is unaffected -- it draws each tile as its own independent square with no shared-corner blending across tiles, so this pinch-point problem never existed there"
    ]
  }
];
