import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_89: ClientChangelogEntry[] = [
  {
    createdAt: 1789549757910, // frozen, 1ms after the newest existing entry ("warty terrain fix") -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.16.4",
    title: "Added a Cancel All Waypoints action to the tile menu",
    why: "A queued waypoint targeting a tile outside your current view -- for example one set by an accidental click just before you signed in -- had no way to be cancelled, since the only cancel option required selecting that exact tile.",
    changes: [
      "Opening the action menu on any of your tiles now offers \"Cancel All Waypoints\" whenever you have any queued, letting you clear the whole list without needing to find the specific tile a waypoint targets"
    ]
  },
  {
    createdAt: 1789549757909, // frozen, 1ms after the newest existing entry ("steampunk visual pass") -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.16.3",
    title: "Toned down the 3D grass/sand/tundra surface bump so it no longer looks warty",
    why: "A recent pass pushing the 3D terrain's painterly art style further sharpened the ground's normal-map strength, its per-material normal scale, and the spread of its roughness values all at once. Stacked together, those three changes made the low-frequency height noise that shapes the surface read as a dense field of small pits and bumps -- especially visible on grass and sand -- instead of a subtle painterly texture.",
    changes: [
      "Lowered the terrain normal-map bake strength and the heightfield material's normal scale back toward their pre-pass values",
      "Narrowed the roughness contrast between surface pits and ridges back toward its pre-pass range",
      "2D canvas fallback renderer is unaffected -- it has no equivalent per-pixel bump/roughness noise system"
    ]
  },
  {
    createdAt: 1789549757907, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.16.1",
    title: "Hills read as gentle, connected highland rather than a stamped pointy peak",
    why: "Hill tiles used to render as one or three sharply pointed mounds, and two adjacent hill tiles never actually joined up -- the connecting bridge between them tapered to nothing just short of the shared edge, so a hill patch or ridge always looked like separate stamped bumps with thin gaps between them. Separately, the ownership tint draped over a hill used a coarser mesh than the hill's own surface, letting a sliver of the water/fog colour underneath show through as a light-blue glitch.",
    changes: [
      "Hills are now a broad, irregular, almost-flat raised mound with 3 small, barely-noticeable points, sloping gently down to ground level at the tile edge",
      "Two hill tiles that are cardinal neighbours now visibly merge into one connected landmass instead of leaving a gap at their shared border",
      "Fixed a light-blue glitch in the settled-tile ownership tint where it drapes over a hill"
    ]
  },
];
