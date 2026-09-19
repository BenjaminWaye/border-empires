// Archived older changelog entries, split out of client-changelog-data.ts to
// keep it under the 500-line cap. See that file's header comment.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_81: ClientChangelogEntry[] = [
  {
    createdAt: 1789850692000,
    introducedIn: "2026.09.19.1",
    title: "Occupation surveys reveal broad resource prospects",
    why: "Capturing a surviving town now returns local environmental intelligence without exposing exact strategic-resource deposits.",
    changes: [
      "Broad blackwood, ferrous-dust, and refractive-ground clues are shown as quiet patterned terrain signals",
      "Occupation survey reports persist in the Activity Feed for offline players and offer View survey coordinates",
      "Capture panels, research cards, projected labels, and both the 2D and true-3D map paths now communicate the same local intelligence"
    ]
  },
  {
    createdAt: 1789249191262, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.14.03",
    title: "Fixed Siege Outpost, Siege Tower, and Dread Tower rejected on frontier tiles",
    why: "Siege outposts are meant to only require ownership, not settlement, so they can be built on frontier land -- but the tile-surface check that gates the build menu and the BUILD command never had a case for an owned, unsettled (FRONTIER) tile with no resource/town/dock on it, so a bare frontier tile always failed with \"siege outpost cannot be built on this tile\" even though the rest of the build path already allowed it.",
    changes: [
      "Siege Outpost, Siege Tower, and Dread Tower can now be built on any owned frontier tile, not just settled/resource/town/dock tiles"
    ]
  }
];
