import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const ACTION_CONFIRMATIONS_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.28",
  title: "Accepted deals, builds and claims now say so",
  why: "New players couldn't tell whether a deal, a build or an Expand To had gone through.",
  changes: [
    "A short line at the top confirms an agreed trade, truce or alliance, a started build and claimed land, once the server confirms it",
    "Tapping Garrison on a tile your auto-garrison just took no longer fails",
    "The deal screen's hint names the treaty buttons it shows, such as Swear fealty",
    "Ranks keeps your own row, with your rank, when you drop out of the top 10"
  ]
};
