// Archived older changelog entries, split out of client-changelog-data.ts to
// keep it under the 500-line cap. See that file's header comment.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_73: ClientChangelogEntry[] = [
  {
    createdAt: 1789149360438, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.11.06",
    title: "Map tile grid lines are now a transparent gray instead of dark navy",
    why: "The per-tile grid outline on both the 2D canvas map and the true-3D heightfield map used a near-black navy stroke color, which read as a heavy dark border against the map's terrain art instead of a subtle grid.",
    changes: [
      "The 2D map's per-tile grid outline is now a semi-transparent gray instead of dark navy",
      "The true-3D map's heightfield gridlines are now the same semi-transparent gray, matching the 2D renderer"
    ]
  },
  {
    createdAt: 1789144617322, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.11.05",
    title: "Great City / Metropolis 2nd support ring now highlights correctly on the 2D map",
    why: "The 2D-canvas (accessibility fallback) renderer's per-tile support-ring selection highlight still hardcoded the old radius-1 ring check, so a Great City or Metropolis's 2nd ring (distance-2, added this week) only outlined its inner 8 tiles instead of the full 24 -- even though the true-3D renderer's equivalent overlay and the buildings menu itself were already correct.",
    changes: [
      "Selecting a Great City or Metropolis on the 2D map now outlines its full 2nd-ring support tiles, matching the true-3D map"
    ]
  },
  {
    createdAt: 1789141413055, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.11.04",
    title: "Great City / Metropolis 2nd support ring now offers buildings when clicked",
    why: "A Great City or Metropolis's expanded, 16-tile 2nd support ring (distance-2, added this week) rendered correctly on both map renderers and was auto-claimed as territory, but two client lookups that decide which town a clicked tile can build support structures for (MINTWORKS, GRANARY, CLEARING_HOUSE, etc.) were missed when the rest of the codebase was updated for the wider ring -- they still hardcoded the old radius-1 check, so clicking a 2nd-ring tile opened the buildings menu with nothing in it.",
    changes: [
      "Clicking a Great City or Metropolis's 2nd-ring (distance-2) tile now correctly shows the same support-structure build options as a 1st-ring tile"
    ]
  }
];
