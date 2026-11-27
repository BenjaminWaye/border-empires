import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const GUIDE_ISLAND_DOCK_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.27",
  title: "Guide points island starts at their dock",
  why: "Starting on an island, the guide sent your drone legs out to a town across the sea that you couldn't reach.",
  changes: [
    "The guide no longer sends your drone more than one leg to find a town",
    "When the nearest town is further, or you're on an island, it marks a dock on your land: Expand To it, Garrison it, then Cross the sea",
    "With no dock in sight yet, it marks the nearest dock within a drone flight and asks you to Explore there"
  ]
};
