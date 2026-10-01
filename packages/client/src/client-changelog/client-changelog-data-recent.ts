import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_RECENT: ClientChangelogEntry[] = [
  {
    createdAt: 1790764192672, // frozen Date.now() value for this release
    introducedIn: "2026.09.30.5",
    title: "Guest \"Save your empire\" badge no longer jumps when pressed",
    why: "Pressing the gold guest badge at the bottom of the map shifted it to the left while the button was held down.",
    changes: [
      "The badge now stays centred while you press it"
    ]
  }
];
