import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const FRONTIER_MAP_NAMES_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.10",
  title: "Player names extend over the frontier",
  why: "See who holds frontier land at a glance.",
  changes: ["Zoom out to see one large player name across connected garrisoned and frontier land."]
};
