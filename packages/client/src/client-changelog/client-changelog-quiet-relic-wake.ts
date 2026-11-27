import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const QUIET_RELIC_WAKE_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.27",
  title: "Good news no longer pops up over the map",
  why: "The green card covered the map for things the game already shows where they happen.",
  changes: [
    "A won fight shows on the map and the battle screen",
    "A sent march shows in the tracker as a ⚑ March row",
    "Sent offers show under Sent in Diplomacy; an agreed truce or alliance shows there too",
    "Cancelled expansions leave the tracker; a rival's running relic is in the Activity feed",
    "Warnings and failures still pop up"
  ]
};
