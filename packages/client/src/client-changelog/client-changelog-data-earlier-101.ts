import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_101: ClientChangelogEntry[] = [
  {
    createdAt: 1791750801000, // frozen Date.now() value for this release
    introducedIn: "2026.10.11.2",
    title: "Docks link to nearby docks, with a way to jump along their routes",
    why: "Dock routes often led to a far-away dock instead of a close one, and following a long dashed route meant a lot of scrolling while the line broke up along the way.",
    changes: [
      "From next season, each dock links to its nearest dock on another island, measured by actual sea distance",
      "A dock's tile menu now has a Connected docks row: use ◀ ▶ to jump the camera to each linked dock and Back to return",
      "The dashed dock route line no longer breaks or jumps when it wraps around the map edge or leaves the area around you"
    ]
  }
];
