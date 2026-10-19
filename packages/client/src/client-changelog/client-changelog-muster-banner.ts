import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const MUSTER_BANNER_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1792439993266, // Date.now() captured once for this release.
    introducedIn: "2026.10.19.4",
    title: "Muster flags are now war banners",
    why: "The muster flag was a floating brass tower with a flat sign, and it didn't look like the towns and other pieces on the 3D map.",
    changes: [
      "In the 3D map, a muster flag is now a tall war banner hanging from a brass crossbar, standing on a heavy two-step octagonal base like the towns, with a thick band of the owner's colour round it",
      "The banner is in the owner's colour with stitched pale side stripes, a gold fringe and an embroidered cog, with tassels on the crossbar, and it billows in the wind",
      "The base has bevelled edges, brass corner caps and four gems in the owner's colour, carved from weathered stone, with a glossy finish on the coloured parts like a painted miniature",
      "In Advance mode the banner is brighter and waves faster",
      "Soldiers still march in from the edges of the tile and now stop at the base"
    ]
  }
];
