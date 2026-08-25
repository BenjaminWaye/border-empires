import type { LandBiome } from "../types.js";
import { wrapX, wrapY } from "../math/math.js";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../config.js";
import { biomeCache, biomeCacheReady, encodeBiome, worldIndex } from "./worldgen.js";

// Forces a land tile's biome, bypassing the noise field. Used to carve oasis
// greenery (GRASS) into desert (SAND) regions around a hand-placed water
// feature (see server-worldgen-oasis.ts). Mirrors overrideTerrainAt in
// worldgen.ts: writes straight into the read cache that landBiomeAt (and
// grassShadeAt, which reads landBiomeAt) already checks first, so no call
// site needs to change. Split into its own file since worldgen.ts is already
// over the 500-line file cap.
export const overrideLandBiomeAt = (x: number, y: number, biome: LandBiome): void => {
  const wx = wrapX(x, WORLD_WIDTH);
  const wy = wrapY(y, WORLD_HEIGHT);
  const idx = worldIndex(wx, wy);
  biomeCache[idx] = encodeBiome(biome);
  biomeCacheReady[idx] = 1;
};
