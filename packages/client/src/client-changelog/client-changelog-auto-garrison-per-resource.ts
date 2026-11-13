import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const AUTO_GARRISON_PER_RESOURCE_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.12",
  title: "Auto-garrison by resource",
  why: "You could only auto-garrison whole groups of resources.",
  changes: [
    "Auto-garrison now has a switch for each resource, so you can auto-garrison only titanium or only salvage sites",
    "The Garrison checkbox in the tile menu now covers just that tile's resource",
    "Your earlier choices carry over to every resource in their group"
  ]
};
