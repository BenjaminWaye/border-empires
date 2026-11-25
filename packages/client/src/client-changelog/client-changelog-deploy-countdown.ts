import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const DEPLOY_COUNTDOWN_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.25",
  title: "Server updates show a countdown",
  why: "During a server update you only saw \"Reconnecting…\" with no idea how long it would take.",
  changes: [
    "Sign-in, Enter the map and the in-game reconnect banner show \"Server update · back in ~1:20\"",
    "The estimate comes from how long recent updates took and says \"Almost ready…\" when it runs out",
    "The game still reconnects by itself"
  ]
};
