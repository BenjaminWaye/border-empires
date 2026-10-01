import type { ClientChangelogEntry } from "./client-changelog-data.js";

// Extracted from client-changelog-data.ts (a pure move) so that file has room
// for new entries under the repo's 500-line cap.
export const CLIENT_CHANGELOG_ENTRIES_LATE_SEP30: ClientChangelogEntry[] = [
  {
    createdAt: 1790757301381, // frozen Date.now() value for this release
    introducedIn: "2026.09.30.2",
    title: "More reliable guest sign-in",
    why: "A busy game database could freeze the realtime gateway while a new guest was signing in, leaving Play Now stuck before the map opened.",
    changes: [
      "Guest sign-in now retries temporary database contention without freezing the realtime connection",
      "Staging release checks now include a real Play Now sign-in and wait longer for delayed server failures"
    ]
  },
  {
    createdAt: 1790756975653,
    introducedIn: "2026.09.30.3",
    title: "Map overlays no longer float above hills",
    why: "Flat tile overlays on hills were parked at the hill's tallest possible height, well above the visible ground, so they hovered in the air in the 3D map.",
    changes: [
      "True-3D attack markers, weak-defence warnings, shield-area washes, win-chance labels, crystal targeting and dormant frontier tiles now sit on top of hill tiles instead of floating above them"
    ]
  },
  {
    createdAt: 1790764591773, // frozen Date.now() value for this release
    introducedIn: "2026.09.30.4",
    title: "Slow server replies no longer strand an expansion",
    why: "When the server took more than 2 seconds to confirm an expansion, a late confirmation was thrown away and the tile stayed stuck on \"Expansion sync delayed\".",
    changes: [
      "A late expansion confirmation that arrives within 12 seconds is now picked up instead of ignored, so the claim completes normally"
    ]
  }
];
