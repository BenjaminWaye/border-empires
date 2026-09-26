import { worldgenVersion, type LandBiome } from "@border-empires/shared";

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
  SNOW: 7,
  GRASSLAND: 8
};
// v9 PLAINS renders bright green in the game (v8 PLAINS stays golden tan), so it gets its own code.
const PLAINS_BRIGHT_CODE = 9;

export const biomeCodeFor = (b: LandBiome | undefined): number => {
  if (b === undefined) return 0;
  if (b === "PLAINS" && worldgenVersion() >= 9) return PLAINS_BRIGHT_CODE;
  return BIOME_CODES[b];
};
