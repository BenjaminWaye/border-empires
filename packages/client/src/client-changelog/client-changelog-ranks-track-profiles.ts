import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const RANKS_TRACK_PROFILES_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1794086826455, // Date.now() captured once for this entry.
    introducedIn: "2026.11.07",
    title: "Open profiles from the Ranks race",
    why: "Tapping a player on a victory track did nothing, so you couldn't check their coin per day or other stats.",
    changes: [
      "Tap a crest on any victory track, or the leader's name beside it, to open that player's profile"
    ]
  }
];
