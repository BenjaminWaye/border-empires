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
  }
];
