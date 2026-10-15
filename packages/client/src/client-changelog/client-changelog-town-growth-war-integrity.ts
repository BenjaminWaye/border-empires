import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_TOWN_GROWTH_WAR_INTEGRITY: ClientChangelogEntry[] = [
  {
    createdAt: 1792044555982, // frozen Date.now() value for this release
    introducedIn: "2026.10.15.2",
    title: "Town growth shows the real rate and why it's paused",
    why: "A town's growth rate could change depending on how its details were last loaded, ignoring Empire Integrity, and a nearby-war pause could show as normal growth or as \"paused\" with no reason.",
    changes: [
      "Town growth now always shows the rate the server actually applies, including your Empire Integrity",
      "A town paused by a nearby war says so, with roughly how long until growth resumes",
      "The town's modifier list shows a \"Nearby war\" row for as long as the pause lasts",
      "Town smoke on the 3D map stops while growth is paused by a nearby war"
    ]
  }
];
