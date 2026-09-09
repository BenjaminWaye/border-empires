import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_28: ClientChangelogEntry[] = [
  {
    createdAt: 1788726355653, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.06.08",
    title: "Fixed: clicking a tile next to your connected dock no longer opens a menu instead of expanding",
    why: "Once you settle a dock, land next to its paired dock elsewhere on the map is supposed to instant-expand with one click, just like any tile bordering your territory -- but the click handler had dock-adjacency explicitly disabled, so those clicks always fell through to the tile menu instead.",
    changes: [
      "Clicking a neutral tile adjacent to your connected dock now claims it immediately, matching the one-click expand behavior of an ordinary bordering tile"
    ]
  },
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
