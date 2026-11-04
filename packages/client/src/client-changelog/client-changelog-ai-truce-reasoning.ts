import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const AI_TRUCE_REASONING_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1793778484805, // Date.now() captured once for this entry.
    introducedIn: "2026.11.04",
    title: "AI empires weigh peace right after you attack",
    why: "AI empires refused every truce for 30 minutes after you attacked them, even when they had no army to strike back with, so a truce offered before logging off just went nowhere.",
    changes: [
      "Right after you attack, an AI with no counter-attack ready, or with other land to grow into, now takes a truce so it can turn to other fronts",
      "Peace right after an attack costs 50% more, and a losing AI asks reparations instead of paying you",
      "An AI with an army ready on a border it can't grow past still refuses, and says how long until it will talk",
      "AI empires bank manpower in the last 90 minutes of a truce, so they're ready to defend when it ends"
    ]
  }
];
