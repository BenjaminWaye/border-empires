import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const SINGLE_RECONNECT_NOTICE_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.28",
  title: "One reconnect notice at a time",
  why: "Tapping an order while the game was reconnecting stacked a \"Server updating\" card under the \"Disconnected from server\" banner.",
  changes: ["While the reconnect banner is showing, it is the only notice; the extra \"Server updating\" card no longer appears on top of it"]
};
