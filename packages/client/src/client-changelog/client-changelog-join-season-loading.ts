import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_JOIN_SEASON_LOADING: ClientChangelogEntry[] = [
  {
    createdAt: 1790764591746, // frozen Date.now() value for this release
    introducedIn: "2026.09.30.5",
    title: "Joining a season no longer gets stuck on \"Joining...\"",
    why: "After Play Now, a slow server could leave the join screen showing a greyed-out \"Joining...\" button for 15+ seconds with no sign of progress, so it looked broken.",
    changes: [
      "The server now stops waiting on a slow spawn-location lookup after a few seconds and lets you into the game anyway",
      "A join that never answers now fails with a clear message instead of hanging, and you can try again",
      "The Joining button now animates and shows how long you have been waiting, with a note when it is taking longer than usual"
    ]
  }
];
