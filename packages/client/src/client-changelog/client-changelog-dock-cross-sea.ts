import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const DOCK_CROSS_SEA_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.23",
  title: "Your dock has a Cross the sea button",
  why: "Players on an island held a dock without knowing it was the way off.",
  changes: [
    "Tapping your own dock shows Cross the sea, which takes you to the dock across its sea lane and opens it, ready to Expand To or Attack"
  ]
};
