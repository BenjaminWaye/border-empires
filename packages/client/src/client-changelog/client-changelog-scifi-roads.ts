import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const SCIFI_ROADS_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.13",
  title: "Maglev freight lines between towns",
  why: "The links between connected towns looked like dirt tracks.",
  changes: [
    "Connected towns are now joined by an elevated maglev freight line. On the 3D map, freight trains haul containers, tanks and energy cells between them.",
    "The 2D map shows the same line, without the trains."
  ]
};
