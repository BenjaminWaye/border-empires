import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_54: ClientChangelogEntry[] = [
  {
    createdAt: 1789249191258, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.13.01",
    title: "Fixed a thick green line painted across mountains",
    why: "A claimed tile's territory-color overlay traces the terrain's real height at each corner so it hugs the ground exactly. Where a claimed tile sat next to a mountain, though, it inherited the mountain's much taller shared corner height, bridging flat ground up to mountain height and rendering as a steep, near-vertical green wall/thick line across the mountain's base instead of a flat tint on the ground.",
    changes: [
      "The true-3D map's territory-color overlay no longer bridges up to a neighboring mountain's height — it now stays flat right up to the mountain's edge, removing the thick green line/wall that used to appear along mountain bases next to claimed territory"
    ]
  }
];
