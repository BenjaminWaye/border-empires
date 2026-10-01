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
  },
  {
    createdAt: 1790768118179,
    introducedIn: "2026.09.30.5",
    title: "Choose what settles for you",
    why: "New empires used to spend their starting manpower settling nearby towns and farms automatically, before you had any say.",
    changes: [
      "You are now asked whenever towns, food or resources come within reach and aren't set to auto-settle: pick how many to settle and see the manpower cost first, or close it and carry on",
      "Auto-settle is now a per-category setting (towns & docks, food, other resources) in Settings > Gameplay, and stays on for existing players"
    ]
  }
];
