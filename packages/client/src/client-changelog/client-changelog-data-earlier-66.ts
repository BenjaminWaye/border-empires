// Archived older changelog entries, split out of client-changelog-data.ts to
// keep it under the 500-line cap. See that file's header comment.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_66: ClientChangelogEntry[] = [
  {
    createdAt: 1789050708100, // frozen, 1ms after the monument-announcement entry -- keeps ordering stable
    introducedIn: "2026.09.10.8",
    title: "Great City's second support ring is back, and now actually shows up",
    why: "The second support ring (distance-2 tiles, 24 total instead of 8) for Great City/Metropolis towns was reverted the same day it shipped over a server-cost concern -- restored here with that cost fixed at the source instead. Separately, the ring overlay and support-tile menu logic never actually consulted a town's tier at all: they were hardcoded to the base 8-tile square from the start, so a Great City/Metropolis town's outer ring never rendered, highlighted, or offered tile actions client-side even while the feature was live.",
    changes: [
      "Great City and Metropolis towns draw support structures/tiles from a second ring again (24 tiles total instead of 8)",
      "The support-tile overlay (the glowing ring/hatch highlight) and the tile-action menu now actually show and offer the full ring on Great City/Metropolis towns, instead of only ever the base 8 tiles",
      "The \"Upgrade City to Great City\" tile action mentions the added ring again"
    ]
  }
];
