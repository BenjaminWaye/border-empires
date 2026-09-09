// Split out of client-map-render.ts (already at the repo's 500-line file
// cap) so this didn't push that file over the limit.
import { grassToneAt, visualLandBiomeAt } from "@border-empires/shared";
import type { Tile } from "../client-types.js";

export type TerrainTextureId =
  | "SEA_DEEP"
  | "SEA_COAST"
  | "SAND"
  | "GRASS_LIGHT"
  | "GRASS_LIGHTER"
  | "GRASS_DARK"
  | "MOUNTAIN"
  | "TUNDRA"
  | "PLAINS"
  | "JUNGLE"
  | "MARSH"
  | "SNOW";

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
  // visualLandBiomeAt re-derives the mechanical biome from (x, y) itself (the
  // same deterministic value visibleLandBiome would carry), so it's always
  // used directly rather than trusting visibleLandBiome -- that field is
  // typed to the mechanical 4-value union and can never carry the v8
  // cosmetic-only promotions (PLAINS/JUNGLE/MARSH/SNOW).
  const biome = visualLandBiomeAt(x, y);
  if (biome === "SAND" || biome === "COASTAL_SAND") return "SAND";
  if (biome === "TUNDRA") return "TUNDRA";
  if (biome === "PLAINS") return "PLAINS";
  if (biome === "JUNGLE") return "JUNGLE";
  if (biome === "MARSH") return "MARSH";
  if (biome === "SNOW") return "SNOW";
  const tone = grassToneAt(x, y);
  return tone === "DARK" ? "GRASS_DARK" : tone === "LIGHTER" ? "GRASS_LIGHTER" : "GRASS_LIGHT";
};
