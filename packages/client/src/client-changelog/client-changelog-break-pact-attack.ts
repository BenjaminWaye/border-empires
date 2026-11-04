import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const BREAK_PACT_ATTACK_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1793351261415, // Date.now() captured once for this entry.
    introducedIn: "2026.10.30.1",
    title: "Attacking a truce partner or ally asks you to break the pact first",
    why: "Launch Attack on a truced empire looked like it would attack but couldn't, and allied tiles had no attack option at all, so it wasn't clear what breaking a pact would cost or how long an alliance takes to end.",
    changes: [
      "Launch Attack on an empire you have a truce with now offers to break the truce, and first lists what that means for you: no new truces for 24 hours, a mark on your profile for the season, and AI rulers thinking less of you.",
      "Launch Attack on an ally now offers to break the alliance. The alliance is broken 24 hours after you confirm, and you can attack them after that. No attack or muster flag is queued in the meantime.",
      "Breaking a truce now costs -10 opinion with every other AI ruler for 7 days (up to -30), instead of for the whole season. The AI you broke the truce with still holds a grudge for the whole season.",
      "Breaking an alliance with an AI ruler now costs -10 opinion with that ruler for 7 days.",
      "Break Truce in the Alliances tab and on the map now asks you to confirm first."
    ]
  }
];
