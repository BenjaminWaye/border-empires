import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const DRONE_BORDER_COIN_RESTART_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.27",
  title: "Scout drone and Coin fixes",
  why: "A drone sent toward a rival border next to your land failed with \"Explore past your own land\" or came back with nothing, and a server update could stop your Coin while you were away.",
  changes: [
    "The plan's button says Blocked when a rival border next to your land is in the way, and no charge is spent",
    "Coin keeps coming in after a server update, for 24 hours after you last played"
  ]
};
