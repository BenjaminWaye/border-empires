import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const AUTO_GARRISON_SPLIT_RESOURCES_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1793481912933 /* Date.now() frozen for the changelog gate */,
    introducedIn: "2026.10.31",
    title: "Auto-garrison splits strategic and luxury resources",
    why: "One switch covered every non-food resource.",
    changes: [
      "Auto-garrison now has separate Strategic resources (titanium, umbrite, crystal) and Luxury resources (every other resource) switches",
      "Your earlier resources choice carries over to both"
    ]
  }
];
