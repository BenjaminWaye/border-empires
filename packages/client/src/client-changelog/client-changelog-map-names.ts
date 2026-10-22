import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const MAP_NAMES_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1792656497957, // Date.now() captured once for this entry.
    introducedIn: "2026.10.22.1",
    title: "Empire and landmass names on the map",
    why: "From far out the map showed colours but not who held them, and the land itself had no names.",
    changes: [
      "Zoom all the way out to see each empire's name inked across its garrisoned land, once it holds a fully garrisoned 3x3 block; the name stretches along the territory as it grows",
      "On the 3D map the names are painted on the ground, under towns, forts and troops. They always fit inside garrisoned land you have explored, shrinking rather than spilling over the border",
      "Zoom in to see landmass names, written across the garrisoned land on each landmass. Every landmass of 9 or more land tiles has a name",
      "Garrison every land tile of a landmass and you are asked, once, to give it a name of your own",
      "Your name stays while you hold 60% of the landmass, shown tarnished while contested. Drop below that and it fades back to the old name after a day, unless you win the land back. Whoever garrisons the whole landmass next can rename it",
      "Works on both the 3D and 2D maps (on the 2D map names still draw above the tiles for now)"
    ]
  }
];
