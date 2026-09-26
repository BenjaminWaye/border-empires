import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_MUSTER_STAND: ClientChangelogEntry[] = [
  {
    createdAt: 1789933799383, // frozen, 1ms after the newest existing entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.25.1",
    title: "Muster soldiers now stand at ease on a frontier tile while it's being claimed",
    why: "When a muster flag's company attacked or expanded onto a frontier tile, the soldiers vanished the moment their march ended, leaving the claim timer running on an empty tile.",
    changes: [
      "True-3D renderer: after marching out, the company steps onto the target tile and stands at ease (idle pose) until the tile's claim timer finishes",
      "2D canvas renderer (accessibility fallback): unchanged -- it has never drawn marching soldiers, so there is nothing to keep on the tile"
    ]
  }
];
