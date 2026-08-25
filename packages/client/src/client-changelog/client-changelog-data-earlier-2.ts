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
    createdAt: 1787678887251, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.25.3",
    title: "Rivers now curve smoothly and taper toward the sea instead of looking like glued-together rectangles",
    why: "The 3D river ribbon connected each walked point with a straight segment and a constant width the whole way, so every wobble step in the path showed up as a hard kink and every river read as a uniform-width strip regardless of how far it had traveled -- the classic 'blue rectangles' look rather than a real river.",
    changes: [
      "River paths are now smoothed with a Catmull-Rom curve and resampled at higher density, removing the faceted straight-segment look.",
      "River width now tapers from narrow at the source to wide at the mouth, based on how far each point has flowed toward the sea."
    ]
  },
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
    createdAt: 1787678887251, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.25.3",
    title: "Rivers now curve smoothly and taper toward the sea instead of looking like glued-together rectangles",
    why: "The 3D river ribbon connected each walked point with a straight segment and a constant width the whole way, so every wobble step in the path showed up as a hard kink and every river read as a uniform-width strip regardless of how far it had traveled -- the classic 'blue rectangles' look rather than a real river.",
    changes: [
      "River paths are now smoothed with a Catmull-Rom curve and resampled at higher density, removing the faceted straight-segment look.",
      "River width now tapers from narrow at the source to wide at the mouth, based on how far each point has flowed toward the sea."
    ]
  },
  {
    createdAt: 1787643819307, // frozen just after this file's prior latest entry, to avoid a createdAt collision
    introducedIn: "2026.08.25.2",
    title: "Fixed spawns landing next to resources across water",
    why: "A new player's starting position only had to be within straight-line distance of a farm or fishing spot to count as \"nearby\" -- so a spawn could land on a coastline whose closest food was actually on the far side of a strait or a separate island, unreachable without crossing water.",
    changes: [
      "Spawn placement now requires that nearby food and towns be on the same landmass as the spawn point, not just within range as the crow flies."
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
    createdAt: 1787430200000,
    introducedIn: "2026.08.22.4",
    title: "Auto-settle no longer fires on tiles that have drifted out of reach",
    why: "Queuing a settle-then-build (or letting an AI empire's frontier auto-settle) could still fire once the tile had fallen out of reach in the meantime -- the server always rejected it as out-of-reach, but nothing checked first, so it just silently failed instead of being dropped up front.",
    changes: [
      "Both the player's queued auto-settle and an AI empire's automatic frontier settlement now check reach before sending a settle command, dropping the queued action instead of sending one that's guaranteed to be rejected.",
      "When a settled tile gets overtaken and reverts to a frontier tile because a rival's territory grew over it, it now plays a brief collapsing pylon effect on the map instead of changing silently."
    ]
  },
  {
    createdAt: 1787650830571, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.25.1",
    title: "Farmstead now grants +2 FOOD slots instead of +1",
    why: "Farmstead's same-tile FOOD slot boost was tied with Mine/Umbrite Rig's +1, even though it's a dedicated food building -- a bigger boost makes it more worth building and gives Waterworks (which multiplies Farmstead's bonus) more to amplify.",
    changes: [
      "An active Farmstead on a FARM tile now adds +2 FOOD slots to that tile instead of +1. Waterworks' separate +2-per-Farmstead-in-radius bonus is unchanged and stacks on top."
    ]
  }
];
