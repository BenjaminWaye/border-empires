import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const SCOUT_REPORT_FOCUS_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.20",
  title: "Scout report jumps to the find",
  why: "Show on a scout report moved the camera to where the drone was sent, not to the town or other find it reported.",
  changes: [
    "Show on a scout report, and on its Activity entry, now jumps to the most notable find: a town first, then a dock, waystation, watchtower, resource, empire border or Planetary Defense"
  ]
};
