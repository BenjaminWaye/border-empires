import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_99: ClientChangelogEntry[] = [
  {
    createdAt: 1791462529729,
    introducedIn: "2026.10.08.4",
    title: "Map effects stay put when you pan",
    why: "Panning the 3D map could leave effects such as the aegis lock field, bombardments, unsettle and the floating population-loss text offset from the tile they belong to.",
    changes: ["Effects on the 3D map now stay on their tile while you pan, including the 15-minute aegis lock field and after panning all the way around the world"]
  },
  {
    createdAt: 1791469121213,
    introducedIn: "2026.10.08.5",
    title: "New empires no longer land inside a neighbour's reach",
    why: "A new empire could land right next to another player whose reach already covered its starting land. The AFC then claimed almost nothing and could barely see past its own tile.",
    changes: [
      "New and respawning empires now land where their starting reach is clear of every other empire's reach, whenever the map has room",
      "Your AFC always sees 4 tiles around itself",
      "Even on a crowded map, a newly landed AFC always keeps the 3x3 ground it stands on"
    ]
  },
  {
    createdAt: 1791488967000,
    introducedIn: "2026.10.08.7",
    title: "Waystations no longer promise population without a town",
    why: "A waystation could announce +5,000 population even when you owned no town to receive it, so nothing was actually granted.",
    changes: ["If a waystation rolls its population boost and you have no town, it now pays out coin instead, and the popup says so"]
  },
  {
    createdAt: 1791489815345,
    introducedIn: "2026.10.08.7",
    title: "Relay Beacon build time and rush price fixed",
    why: "The build menu said a Relay Beacon takes 1 minute when it really takes an hour, and its rush-buy button showed 0 coin.",
    changes: [
      "The build menu shows the real Relay Beacon build time: instant for your first five, 60m after that",
      "Rush-buy prices for buildings now match how much of the build is actually left, so a half-built structure costs about half"
    ]
  },
  {
    createdAt: 1791489790895, // Date.now() frozen for this entry
    introducedIn: "2026.10.08.1",
    title: "Resource Monopoly counts only settled, revealed resources",
    why: "Resource Monopoly progress was counting frontier tiles and resources you hadn't revealed yet, so it could show you holding Umbrite you didn't actually control.",
    changes: [
      "Only settled resource tiles now count toward Resource Monopoly",
      "A resource only counts once you've researched the tech that reveals it"
    ]
  }
];
