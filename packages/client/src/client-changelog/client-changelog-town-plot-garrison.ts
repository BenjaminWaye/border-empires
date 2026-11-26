import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const TOWN_PLOT_GARRISON_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.26",
  title: "Fixed: growing a town left its new plots ungarrisoned",
  why: "Upgrading a Town to a City claimed the second ring of plots but only garrisoned them with town auto-garrison on, and a town had no way to garrison all its plots at once.",
  changes: [
    "Growing a town now garrisons the plots it gains",
    "A garrisoned town with ungarrisoned plots shows Garrison N plots on its screen and tile menu"
  ]
};
