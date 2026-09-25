import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_SELF_PROFILE_CHIP: ClientChangelogEntry[] = [
  {
    createdAt: 1789933799384, // frozen, 1ms after the newest existing entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.25.1",
    title: "Press your name in the top bar to open your profile",
    why: "Other players' names already opened their profile, but your own name in the top toolbar was plain text.",
    changes: ["The Player chip in the top toolbar is now a button that opens your profile screen"]
  }
];
