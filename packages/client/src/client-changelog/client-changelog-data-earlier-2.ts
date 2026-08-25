// Older client-changelog entries, split out of client-changelog-data-earlier.ts
// to keep that file under the repo's 500-line cap (see the comment at
// client-changelog-data.ts's top). Same shape and rules apply here:
// unordered, append-only, frozen createdAt literals.
//
// Entries here are still bound by the "latest week only" rule enforced in
// client-changelog.test.ts — this file exists purely to keep
// client-changelog-data-earlier.ts under its line cap when the trailing week
// has a lot of entries, not as a permanent archive. Prune entries here once
// they fall outside the trailing week, same as in the other two files.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_2: ClientChangelogEntry[] = [
  {
    createdAt: 1787376000000, // 2026.08.22.2 — frozen; was Date.now() in the merged commit
    introducedIn: "2026.08.22.2",
    title: "3D ownership territory now has a crisp border line, not just a color wash",
    why: "The 3D map's ownership fill was a flat, opaque color tint with no edge treatment, so territory read as a soft colored blob rather than a defined claim -- the 2D map already draws a solid outline along exactly this boundary, but the 3D map had no equivalent.",
    changes: [
      "Owned territory in the 3D map now gets a bright border ribbon along its exposed edges (the same boundary the 2D map already outlines), on top of the existing fill tint.",
      "This is a first pass on making 3D ownership read more clearly -- fill gradient/fade and a frontier-vs-settled line style are natural next steps."
    ]
  }
];
