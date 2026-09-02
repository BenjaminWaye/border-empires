// Older changelog entries split out of client-changelog-data.ts to keep that
// file under the 500-line cap. Entries are unordered — client-changelog.ts
// sorts the combined list by createdAt.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_10: ClientChangelogEntry[] = [
  {
    createdAt: 1788162511005, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.30.9",
    title: "3D map lighting: buildings now show real light and shadow, not just a subtle tint",
    why: "An earlier pass repositioned the key light to align with the camera's fixed viewing angle, but only rotated its compass direction while leaving it nearly straight overhead -- an overhead light mostly lights roofs regardless of which way it's rotated, so vertical wall faces (the part that actually reads as 'which side is lit') barely changed. It looked the same as before.",
    changes: [
      "The 3D map's key light now comes in at a noticeably lower, more raking angle instead of nearly overhead, so building walls facing the camera read clearly lit and far-side walls read clearly shadowed"
    ]
  },
  {
    createdAt: 1788162021253, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.30.8",
    title: "Fixed the 3D water surface's waves visibly jumping while panning or clicking a tile",
    why: "The wave animation's spatial pattern was phased off each vertex's on-screen position rather than its fixed world position, so a tile's on-screen position shifting slightly as you panned (before the next terrain rebuild caught up) reset the whole crest/trough pattern into a different shape -- showing up as the water visibly re-rendering every time a rebuild fired, including ones triggered just by clicking a tile.",
    changes: [
      "Ocean and lake waves now keep animating smoothly across terrain rebuilds instead of visibly jumping into a different pattern while panning or selecting a tile"
    ]
  }
];
