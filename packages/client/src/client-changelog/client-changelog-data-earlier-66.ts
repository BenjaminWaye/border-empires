// Archived older changelog entries, split out of client-changelog-data.ts to
// keep it under the 500-line cap. See that file's header comment.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_66: ClientChangelogEntry[] = [
  {
    createdAt: 1789019365999, // frozen, 1ms after the muster-3D-overlay fix entry -- keeps ordering stable
    introducedIn: "2026.09.10.5",
    title: "MARCH muster flags now take genuinely shorter routes to their target",
    why: "MARCH picked its next tile using a distance estimate that (1) didn't account for the world wrapping at its edges, so a target actually close by wrap could look ~440 tiles away and get rejected outright, and (2) charged ground already owned (free to move through) the same as a future capture, biasing it toward a tile merely close to the flag over one that continued straight down an already-secured corridor. On top of that, the remaining-distance estimate was always a straight line, so it couldn't tell a clear path from one blocked by water.",
    changes: [
      "MARCH now measures distance to a march target the same way the map actually wraps, so a target near the opposite edge routes across the seam instead of stalling out with \"no target in range\"",
      "MARCH no longer penalizes a candidate for being reached via a longer stretch of already-owned territory -- that ground is free to cross, so it no longer loses out to a closer-to-the-flag candidate that's actually a worse route",
      "MARCH now floods out from the target tile to find real routes around water and other impassable terrain, instead of guessing a straight line that might run straight through an obstacle"
    ]
  },
  {
    createdAt: 1789019365998, // frozen, 1ms after the Great City revert entry -- keeps ordering stable
    introducedIn: "2026.09.10.4",
    title: "Fixed a muster flag's auto-fired attack showing no march animation and flipping the tile before the siege actually resolved",
    why: "An ADVANCE/MARCH flag's attack is fired by the server, not by this client, so it never went through the code that arms the marching-company supply line in 3D (the 2D map already drew it correctly). Separately, the fight's early predicted result -- the same kind of prediction a manually-launched attack always holds back until the real resolution -- was being applied the instant the siege lock started instead, so the contested tile appeared to change hands right away, before the ~30s combat-lock countdown (and its overlay) ever had a chance to show.",
    changes: [
      "A muster flag's auto-fired ADVANCE/MARCH attack now shows the marching supply-line animation on the 3D map while its company is still traveling to the front, matching the 2D map",
      "A muster flag's auto-fired attack no longer flips the contested tile's ownership at the moment the siege starts -- the tile now stays with its current owner and shows the combat-lock overlay for the whole countdown, only changing hands once the real resolution arrives"
    ]
  },
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
