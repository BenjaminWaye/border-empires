import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const STRATEGIC_DEPOSIT_REACH_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.12",
  title: "Titanium, Umbrite and Gems deposits sit near towns",
  why: "Refineries in towns are coming, and they will only work deposits close to a town, so every new map now places these deposits within reach.",
  changes: [
    "On newly generated maps, every Titanium, Umbrite and Gems deposit has a tile within 10 land tiles of a town.",
    "These deposits no longer sit on a town, a dock or a town's support ring, so they never take a ring tile.",
    "Maps already in play keep their deposits where they are."
  ]
};
