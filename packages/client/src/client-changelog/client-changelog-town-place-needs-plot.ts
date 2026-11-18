import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const TOWN_PLACE_NEEDS_PLOT_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.14",
  title: "Town buildings say when a plot needs a garrison first",
  why: "On a town with no garrisoned tile beside it, Build Manufactory looked ready but Place did nothing, and Build plots read Full. The guide's Manufactory step got stuck there.",
  changes: [
    "A town's Manufactory and other town buildings now read \"Garrison a tile next to this town first\" until a plot beside it is garrisoned, or \"No open build plot next to this town\" when every plot is built on.",
    "Build plots shows 0 open, not Full, while plots still need a garrison."
  ]
};
