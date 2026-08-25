// Older client-changelog entries, split out of client-changelog-data-earlier.ts
// to keep that file under the repo's 500-line cap (see the comment at
// client-changelog-data.ts's top). Same shape and rules apply here:
// unordered, append-only, frozen createdAt literals.
//
// Entries here are still bound by the "latest week only" rule enforced in
// client-changelog.test.ts — this file exists purely to keep
// client-changelog-data-earlier.ts under its line cap when the trailing week
// has a lot of entries, not as a permanent archive. Prune entries here once
// they fall outside the trailing week, same as in the other two files.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_2: ClientChangelogEntry[] = [
  {
    createdAt: 1787380000000,
    introducedIn: "2026.08.22.3",
    title: "Battle preview dots now throw glyphs and take casualties during the siege countdown",
    why: "During a siege countdown, the pre-resolution skirmish animation just had dots vibrating at the tile center with no visual payoff -- no symbols thrown into the air, no losses. When the outcome finally arrived, the sudden appearance of glyph bursts, casualties, and the rout phase was a jarring switch. The skirmish now plays the same clash-phase effects as the resolved battle so the transition is seamless.",
    changes: [
      "Glyph bursts (the rune/shard particles) now spawn continuously throughout the skirmish clash, not just when combat resolves.",
      "Both sides now shed 2 of 10 dots during the skirmish's first clash cycle (WINNER_DEATHS per side), mirroring the resolved battle's casualty system so the swarm is already thinning when the outcome lands.",
      "When the resolved outcome arrives, the loser side simply sheds 2 more dots mid-clash and the rout begins naturally -- no sudden switch from a static vibration to a full animation."
    ]
  },
  {
    createdAt: 1787376000000, // 2026.08.22.2 — frozen; was Date.now() in the merged commit
    introducedIn: "2026.08.22.2",
    title: "3D ownership territory now has a crisp border line, not just a color wash",
    why: "The 3D map's ownership fill was a flat, opaque color tint with no edge treatment, so territory read as a soft colored blob rather than a defined claim -- the 2D map already draws a solid outline along exactly this boundary, but the 3D map had no equivalent.",
    changes: [
      "Owned territory in the 3D map now gets a bright border ribbon along its exposed edges (the same boundary the 2D map already outlines), on top of the existing fill tint.",
      "This is a first pass on making 3D ownership read more clearly -- fill gradient/fade and a frontier-vs-settled line style are natural next steps."
    ]
  },
  {
    createdAt: 1787430200000,
    introducedIn: "2026.08.22.4",
    title: "Auto-settle no longer fires on tiles that have drifted out of reach",
    why: "Queuing a settle-then-build (or letting an AI empire's frontier auto-settle) could still fire once the tile had fallen out of reach in the meantime -- the server always rejected it as out-of-reach, but nothing checked first, so it just silently failed instead of being dropped up front.",
    changes: [
      "Both the player's queued auto-settle and an AI empire's automatic frontier settlement now check reach before sending a settle command, dropping the queued action instead of sending one that's guaranteed to be rejected.",
      "When a settled tile gets overtaken and reverts to a frontier tile because a rival's territory grew over it, it now plays a brief collapsing pylon effect on the map instead of changing silently."
    ]
  }
];
