import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const TOWN_GROWTH_GARRISON_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.26",
  title: "Fixed: growing a town left its new plots ungarrisoned",
  why: "Upgrading a Town to a City claimed the second ring of plots but only garrisoned them with town auto-garrison on.",
  changes: [
    "Growing a town now garrisons the plots it gains once the upgrade lands",
    "A garrisoned town's tile menu offers Garrison N plots too"
  ]
};
