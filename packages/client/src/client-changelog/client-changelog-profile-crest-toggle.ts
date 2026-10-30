import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const PROFILE_CREST_TOGGLE_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1793224607954, // Date.now() captured once for this entry.
    introducedIn: "2026.10.28.3",
    title: "Profile icon closes your profile",
    why: "Pressing your profile icon again left your profile open.",
    changes: ["A second press on your profile icon closes your profile, like the other menu buttons, on desktop and mobile."]
  }
];
