import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const REACH_RESTART_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1793134440000, // Date.now() captured once for this entry.
    introducedIn: "2026.10.28.1",
    title: "Reach stays put across server restarts",
    why: "A restart could hand ground both you and a neighbour reach over to the neighbour, even though you claimed it first.",
    changes: ["Where your reach overlaps a rival's, whoever claimed the ground first keeps it after a server restart or deploy, as long as their reach still covers it."]
  }
];
