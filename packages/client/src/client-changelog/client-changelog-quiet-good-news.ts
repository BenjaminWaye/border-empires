import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const QUIET_GOOD_NEWS_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.27",
  title: "Good news no longer pops up over the map",
  why: "The green card covered the map for things the game already shows where they happen.",
  changes: [
    "A won fight or claimed tile shows on the map, and in the battle screen for a fight",
    "A sent march shows in the tracker as a ⚑ March row",
    "Sent offers show under Sent in Diplomacy; an agreed truce or alliance shows there too",
    "Cancelled expansions leave the tracker",
    "A rival's running relic is named by its plate on the map",
    "Warnings and failures still pop up"
  ]
};
