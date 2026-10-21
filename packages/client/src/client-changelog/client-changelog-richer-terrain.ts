import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const RICHER_TERRAIN_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1792526017884, // Date.now() captured for this entry.
    introducedIn: "2026.10.20.2",
    title: "Richer 3D terrain",
    why: "Fields showed a tile-sized checkerboard and read as flat, uniform colour.",
    changes: [
      "Ground textures flow continuously across tiles instead of repeating per tile",
      "Meadows vary between sun-dried and lush patches, with soft rolling light and fine close-up detail",
      "Beaches fade softly into grass, with a thin damp edge at the waterline",
      "Coastlines curve naturally instead of stepping along the tile grid, with surf following the shore",
      "Neighbouring hill tiles merge into one rolling landform instead of a grid of separate mounds"
    ]
  }
];
