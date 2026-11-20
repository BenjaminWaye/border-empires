import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const START_SITE_PATROLS_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.20",
  title: "Planetary Defense near landing sites",
  why: "Planetary Defense was scattered at random, so many empires never met it early on, and the starting sites offered to players who joined later were recalculated from the live map rather than the ones the world was built around.",
  changes: [
    "New worlds post one Planetary Defense patrol about 20 tiles out from each starting landing site (a few sites on small islands have no land that far out)",
    "These patrols replace the Planetary Defense that used to be scattered at random across the map",
    "In new worlds, players who join mid-season or start again after losing their empire land on those same starting sites while any are free"
  ]
};
