import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_28: ClientChangelogEntry[] = [
  {
    createdAt: 1788765046899, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.07.03",
    title: "Aether Bridge now instantly claims its landing tile, if it's unowned",
    why: "Casting an Aether Bridge onto neutral land only opened a crossing lane onto the exact landing tile -- you still had to separately click and claim it, and the reach bonus it granted covered a wide area around the landing spot that you couldn't actually use without first securing that one tile anyway. That reach area was also permanent even after the bridge itself expired, unlike every other reach source in the game.",
    changes: [
      "Casting Aether Bridge onto genuinely unowned land now instantly claims the landing tile as your territory, the same free beachhead a captured dock gives -- landing on another player's territory is unaffected and still just opens an attack lane",
      "The bridge's reach bonus now covers only the landing tile itself, not a wider area, and withdraws once the bridge expires instead of staying granted forever -- an unclaimed landing tile past that point decays normally, like any other out-of-reach frontier claim"
    ]
  }
];
