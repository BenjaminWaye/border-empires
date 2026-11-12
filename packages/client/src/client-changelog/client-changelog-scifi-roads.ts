import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const SCIFI_ROADS_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.12",
  title: "Monorails between towns",
  why: "The links between connected towns looked like dirt tracks.",
  changes: [
    "Connected towns are now joined by an elevated monorail, with trains running between them on the 3D map.",
    "The 2D map shows the same rail line, without the trains."
  ]
};
