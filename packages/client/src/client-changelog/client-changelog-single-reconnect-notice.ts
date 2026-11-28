import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const SINGLE_RECONNECT_NOTICE_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.28",
  title: "One reconnect notice at a time",
  why: "Tapping an order while the game was reconnecting stacked a \"Server updating\" card under the \"Disconnected from server\" banner.",
  changes: [
    "Orders tapped while the reconnect banner is showing no longer add a \"Server updating\" card on top of it",
    "A \"Server updating\" card shown just before the banner appears, or before a quick reconnect, now closes by itself"
  ]
};
