// v8 adds three real, visually distinct biomes on top of the existing 4
// (GRASS/SAND/COASTAL_SAND/TUNDRA) computed by landBiomeAt: JUNGLE (tropical
// forest), PLAINS (a lighter, drier grassland), MARSH (wet ground near
// coasts/lakes), and SNOW (the coldest tundra, right at the polar edge).
//
// landBiomeAt itself is left completely unchanged -- every existing
// gameplay consumer (FARM/TITANIUM/GEMS/UMBRITE placement, town type,
// forest/hills detection) keeps calling it directly and keeps working
// exactly as before. visualLandBiomeAt is an additive layer purely for
// rendering: it starts from landBiomeAt's result and promotes GRASS/TUNDRA
// tiles to one of the new values based on the same signals (latitude,
// forest shade, proximity to water) already computed elsewhere. A
// consumer that wants the new visual variety uses this function; nothing
// else needs to change.
import { POLAR_BAND, TUNDRA_BAND_WIDTH, grassShadeAt, landBiomeAt, terrainCodeAt, worldSeed } from "./worldgen.js";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../config.js";
import { worldgenVersion } from "./worldgen-version.js";
import { grassToneAt } from "./worldgen-grass-tone.js";
import { isTropicalLatitudeAt } from "./worldgen-latitude.js";
import { valueNoise, seeded01 } from "./worldgen-noise.js";
import { wrapX, wrapY } from "../math/math.js";
import type { LandBiome } from "../types.js";

// Same formula as landBiomeAt's cold-band check (duplicated rather than
// exported piecemeal, since it's a small, self-contained calculation) --
// SNOW is just the harshest end of that same field, past TUNDRA's own 0.5
// cutoff.
const SNOW_TUNDRA_FIELD_CUTOFF = 0.78;
const tundraFieldAt = (wx: number, wy: number): number => {
  const distToPole = Math.min(wy, WORLD_HEIGHT - wy);
  const coldness = Math.max(0, 1 - (distToPole - POLAR_BAND) / TUNDRA_BAND_WIDTH);
  const coldNoise = valueNoise(wx + 211, wy - 157, 46, worldSeed() + 811);
  return coldness * coldness * 0.75 + coldNoise * 0.25;
};

const TERRAIN_SEA = 0;
const NEAR_WATER_RADIUS = 2;
const isNearWaterAt = (wx: number, wy: number): boolean => {
  for (let dy = -NEAR_WATER_RADIUS; dy <= NEAR_WATER_RADIUS; dy++) {
    for (let dx = -NEAR_WATER_RADIUS; dx <= NEAR_WATER_RADIUS; dx++) {
      if (dx === 0 && dy === 0) continue;
      if (terrainCodeAt(wx + dx, wy + dy) === TERRAIN_SEA) return true;
    }
  }
  return false;
};
const MARSH_CHANCE = 0.4; // fraction of eligible near-water tiles that become marsh

export const visualLandBiomeAt = (x: number, y: number): LandBiome | undefined => {
  const wx = wrapX(x, WORLD_WIDTH);
  const wy = wrapY(y, WORLD_HEIGHT);
  const biome = landBiomeAt(wx, wy);
  if (biome === undefined || worldgenVersion() < 8) return biome;

  if (biome === "TUNDRA") {
    return tundraFieldAt(wx, wy) > SNOW_TUNDRA_FIELD_CUTOFF ? "SNOW" : "TUNDRA";
  }

  if (biome === "GRASS") {
    const shade = grassShadeAt(wx, wy);
    if (isTropicalLatitudeAt(wy) && shade === "DARK") return "JUNGLE";
    if (shade !== "DARK" && isNearWaterAt(wx, wy) && seeded01(wx, wy, worldSeed() + 971) < MARSH_CHANCE) return "MARSH";
    if (grassToneAt(wx, wy) === "LIGHTER") return "PLAINS";
    return "GRASS";
  }

  return biome;
};
