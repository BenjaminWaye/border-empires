import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const START_SITE_PATROLS_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.20",
  title: "Planetary Defense near every landing site",
  why: "Planetary Defense was scattered at random, so many empires never met it early on.",
  changes: [
    "New worlds post one Planetary Defense patrol about 20 tiles out from every starting landing site, in addition to the patrols scattered across the map"
  ]
};
