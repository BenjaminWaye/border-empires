import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_AFC_JOIN_DROP: ClientChangelogEntry[] = [
  {
    createdAt: 1790766710747,
    introducedIn: "2026.09.30.7",
    title: "Your AFC lands from orbit",
    why: "Joining a season dropped you onto a map where your Automated Fabrication Complex was already sitting there, with nothing to mark the moment your empire begins.",
    changes: [
      "When you join a season, your AFC now lands from orbit in a slow re-entry, braking burn and dust cloud, in both the 3D map and the 2D fallback",
      "It waits until you have closed the changelog, tutorial and any other dialogs and your eyes are on the map, and it plays once per AFC"
    ]
  },
  {
    createdAt: 1790775066000,
    introducedIn: "2026.09.30.8",
    title: "A clear view of your AFC landing",
    why: "Other first-minute pop-ups could still appear over the map while your AFC was landing.",
    changes: [
      "The New empire checklist now stays tucked away until your AFC has landed, then opens",
      "The slow-3D suggestion, the 2D-map notice and the empire-in-ruins popup also wait for a clear map"
    ]
  }
];
