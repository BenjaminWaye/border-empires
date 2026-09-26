import type { LandBiome } from "@border-empires/shared";

// Biome byte codes shared with renderer.ts. Input is visualLandBiomeAt (what the
// game client renders, incl. v8+ PLAINS/JUNGLE/MARSH/SNOW promotions), not landBiomeAt.
const BIOME_CODES: Record<LandBiome, number> = {
  GRASS: 0,
  SAND: 1,
  COASTAL_SAND: 2,
  TUNDRA: 3,
  PLAINS: 4,
  JUNGLE: 5,
  MARSH: 6,
  SNOW: 7
};

export const biomeCodeFor = (b: LandBiome | undefined): number => (b === undefined ? 0 : BIOME_CODES[b]);
