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
    createdAt: 1787616000000, // 2026.08.25.1 — frozen; was Date.now() in the merged commit
    introducedIn: "2026.08.25.1",
    title: "Fixed sea tiles rendering as solid black from some camera angles",
    why: "The 3D water surface only got its color from directional lighting, with a near-black fallback (emissive 0x030e18) for anything that fell into shadow. Viewed from the south -- opposite the sun and fill light -- water faces caught neither light and the near-black fallback read as a black hole instead of dark sea.",
    changes: [
      "The water material's shadow-floor color is now a dim tint of the actual deep-water color instead of near-black, so unlit sea tiles read as dark water at any camera angle."
    ]
  },
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
  }
];
