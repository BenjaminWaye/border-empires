// Archived older changelog entries, split out of client-changelog-data.ts to
// keep it under the 500-line cap. See that file's header comment.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_79: ClientChangelogEntry[] = [
  {
    createdAt: 1789656367090, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.17.6",
    title: "Tile menu now shows an ongoing battle's odds",
    why: "Pressing a tile you were attacking, or one of your own tiles under attack, showed nothing about the fight -- no attacker, no timer, no sense of who was favored.",
    changes: [
      "Attacking a tile now shows a \"Battle in progress\" card with a two-color odds bar (your color vs the defender's) built from the same pre-battle win chance shown on the Launch Attack button, plus a countdown to when it resolves",
      "One of your own tiles under attack now shows an \"Under attack\" card naming the attacker and counting down to resolution (the odds bar there is a neutral split -- the defender doesn't get to see the attacker's calculated odds)"
    ]
  }
];
