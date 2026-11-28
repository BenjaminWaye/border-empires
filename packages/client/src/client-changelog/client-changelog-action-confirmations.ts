import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const ACTION_CONFIRMATIONS_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.28",
  title: "Accepted deals, builds and claims now show on the map",
  why: "New players couldn't tell whether a deal, a build or an Expand To had gone through.",
  changes: [
    "Claimed land, a started build and an agreed trade, truce or alliance now flash a short marker on the map once the server confirms it, such as +1 tile",
    "When that spot is off screen, an arrow at the edge points to it; tap the arrow to go there",
    "Tapping Garrison on a tile your auto-garrison just took no longer fails",
    "The deal screen's hint names the treaty buttons it shows, such as Swear fealty",
    "Ranks keeps your own row, with your rank, when you drop out of the top 10"
  ]
};
