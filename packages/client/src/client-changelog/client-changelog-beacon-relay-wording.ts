import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const BEACON_RELAY_WORDING_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.26",
  title: "Clearer tip for frontier outside your reach",
  why: "The tip told you to \"garrison an anchor\", a word the game uses nowhere else.",
  changes: [
    "It now names what extends your reach: garrison a Town or Dock, or build a Relay Beacon"
  ]
};
