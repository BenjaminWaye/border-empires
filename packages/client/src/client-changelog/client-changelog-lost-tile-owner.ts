import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const LOST_TILE_OWNER_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.23",
  title: "Land you lost shows who took it",
  why: "Land lost while you were away, out of sight of your territory, came back as unowned fog when you logged in.",
  changes: [
    "Land lost in the last day shows who took it under the fog, on both maps and on the tile"
  ]
};
