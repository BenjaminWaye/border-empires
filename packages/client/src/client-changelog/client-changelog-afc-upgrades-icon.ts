import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const AFC_UPGRADES_ICON_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1792431312753, // Date.now() captured once for this release.
    introducedIn: "2026.10.19.3",
    title: "AFC Upgrades has its own icon",
    why: "The AFC Upgrades button used the same plain house icon as the headquarters, so it didn't look like the fabrication complex it opens.",
    changes: [
      "The AFC Upgrades button now shows the fabrication complex itself: its brass cone cap, glowing aether chamber, spider arms and docking bays, drawn in the same style as the other top-bar icons",
      "This applies to the top bar and the mobile navigation"
    ]
  }
];
