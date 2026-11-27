import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const GUIDE_ISLAND_DOCK_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.27",
  title: "Guide points island starts at their dock",
  why: "Starting on an island, the guide sent your drone legs out to a town across the sea that you couldn't reach.",
  changes: [
    "On an island with no town to take, the guide marks your island's dock and asks you to Expand To it",
    "Then it asks you to Garrison the dock and Cross the sea"
  ]
};
