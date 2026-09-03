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
  },
  {
    createdAt: 1788127316489, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.30.6",
    title: "Selected-structure reach highlight now also shows on the 3D map",
    why: "The green reach-disk highlight for a selected town/dock/outpost-family structure only drew on the 2D canvas overlay, so most players (on the 3D renderer) never saw it -- only players on the 2D fallback (used on lower-end/broken hardware) did.",
    changes: [
      "Selecting a town, dock, or outpost-family structure (Relay Beacon, Siege Outpost, Siege Tower, Dread Tower) now shows its green reach-disk ring on the 3D map too, matching the 2D overlay"
    ]
  },
  {
    createdAt: 1788126287875, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.30.5",
    title: "Tile debug download now includes dock connection-line diagnostics",
    why: "Reports of a dock's yellow dashed connection line never appearing were hard to triage remotely -- there was no way to see, from a single tile, whether the dock actually has a paired-dock entry, whether the visibility gate was allowing it, or whether the sea-route pathfinder found a route.",
    changes: [
      "The tile debug download (dev/support tool, not a player-facing feature) now includes a dockDebug section on dock tiles with their pairing, visibility-gate result, and route status"
    ]
  },
  {
    createdAt: 1788124049918, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.30.2",
    title: "Fixed forest trees visibly reshuffling into a different arrangement while panning the 3D map",
    why: "Which tree species and spacing layout a forest tile got was picked by hashing its on-screen position rather than its fixed world position -- so a tile's on-screen position drifting slightly as you panned (before the next terrain rebuild caught up) could flip it to a different species/layout, showing up as trees visibly popping into a different arrangement mid-pan.",
    changes: [
      "Forest tiles now keep the same tree species and layout regardless of camera position, instead of occasionally reshuffling while panning"
    ]
  }
];
