import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const SCIFI_ROADS_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.12",
  title: "Transit lanes between towns",
  why: "The roads linking towns looked like dirt tracks.",
  changes: [
    "Town links are now plated transit lanes with lit rails and glowing centre guides, on both the 3D and 2D maps."
  ]
};
