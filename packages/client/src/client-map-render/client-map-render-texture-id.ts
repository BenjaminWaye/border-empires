// Split out of client-map-render.ts (already at the repo's 500-line file
// cap) so this didn't push that file over the limit.
import { grassToneAt, landBiomeAt } from "@border-empires/shared";
import type { Tile } from "../client-types.js";

export type TerrainTextureId =
  | "SEA_DEEP"
  | "SEA_COAST"
  | "SAND"
  | "GRASS_LIGHT"
  | "GRASS_LIGHTER"
  | "GRASS_DARK"
  | "MOUNTAIN"
  | "TUNDRA";

export const terrainTextureIdAt = (
  x: number,
  y: number,
  terrain: Tile["terrain"],
  wrapX: (value: number) => number,
  wrapY: (value: number) => number,
  visibleLandBiome?: Tile["landBiome"],
  visibleRegionType?: Tile["regionType"]
): TerrainTextureId => {
  if (terrain === "COASTAL_SEA") return "SEA_COAST";
  if (terrain === "SEA") return "SEA_DEEP";
  if (terrain === "MOUNTAIN") return "MOUNTAIN";
  const biome = visibleLandBiome ?? landBiomeAt(x, y);
  if (biome === "SAND" || biome === "COASTAL_SAND") return "SAND";
  if (biome === "TUNDRA") return "TUNDRA";
  const tone = grassToneAt(x, y);
  return tone === "DARK" ? "GRASS_DARK" : tone === "LIGHTER" ? "GRASS_LIGHTER" : "GRASS_LIGHT";
};
