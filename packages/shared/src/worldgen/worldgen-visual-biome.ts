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
//
// v9 reworks the GRASS promotions (the v8 branch below is kept verbatim so
// v8 seasons render unchanged): plain GRASS no longer comes out at all --
// tropical mid-map grass becomes GRASSLAND (drawn with the old GRASS art),
// everything else becomes a bright-green PLAINS -- and MARSH only forms
// around inland lakes and inland wetland patches, never next to the ocean
// (v8 keyed it off any nearby sea, so it was mostly coastal).
import {
  POLAR_BAND,
  TUNDRA_BAND_WIDTH,
  grassShadeAt,
  isLakeTileAt,
  landBiomeAt,
  terrainCodeAt,
  underlyingLandBiomeAt,
  worldSeed
} from "./worldgen.js";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../config.js";
import { worldgenVersion } from "./worldgen-version.js";
import { grassToneAt } from "./worldgen-grass-tone.js";
import { isTropicalLatitudeAt, latitudeOf } from "./worldgen-latitude.js";
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

// ---- v9 ----
const TERRAIN_COASTAL_SEA = 3;
const isWaterCode = (code: number): boolean => code === TERRAIN_SEA || code === TERRAIN_COASTAL_SEA;
type NearbyWater = "NONE" | "LAKE" | "OCEAN";
// Any non-lake water in range wins ("OCEAN"), so a tile that sees both a lake
// and the sea never becomes marsh.
const nearbyWaterAt = (wx: number, wy: number): NearbyWater => {
  let sawLake = false;
  for (let dy = -NEAR_WATER_RADIUS; dy <= NEAR_WATER_RADIUS; dy++) {
    for (let dx = -NEAR_WATER_RADIUS; dx <= NEAR_WATER_RADIUS; dx++) {
      if ((dx === 0 && dy === 0) || !isWaterCode(terrainCodeAt(wx + dx, wy + dy))) continue;
      if (!isLakeTileAt(wx + dx, wy + dy)) return "OCEAN";
      sawLake = true;
    }
  }
  return sawLake ? "LAKE" : "NONE";
};
const LAKE_MARSH_CHANCE = 0.65;
// Inland wetlands: sparse low-lying patches away from any water, so marsh
// isn't only ever a ring around a lake.
const WETLAND_NOISE_CELL = 14;
const WETLAND_CUTOFF = 0.93;
const WETLAND_FILL_CHANCE = 0.7;
const isInlandWetlandAt = (wx: number, wy: number): boolean =>
  valueNoise(wx + 409, wy + 233, WETLAND_NOISE_CELL, worldSeed() + 1013) > WETLAND_CUTOFF &&
  seeded01(wx, wy, worldSeed() + 1019) < WETLAND_FILL_CHANCE;
// GRASSLAND belt: the same tropical cutoff JUNGLE uses, with a noise-wobbled
// edge so the belt boundary doesn't read as a ruler line across the map.
const GRASSLAND_LATITUDE_CUTOFF = 0.2;
const GRASSLAND_EDGE_WOBBLE = 0.07;
// "Plains also occur in the tropics, less often": clustered patches of
// PLAINS inside the GRASSLAND belt rather than salt-and-pepper tiles.
const TROPICAL_PLAINS_CUTOFF = 0.72;
const grassClassAt = (wx: number, wy: number): "GRASSLAND" | "PLAINS" => {
  const wobble = (valueNoise(wx + 97, wy + 61, 22, worldSeed() + 1031) - 0.5) * 2 * GRASSLAND_EDGE_WOBBLE;
  if (latitudeOf(wy) + wobble >= GRASSLAND_LATITUDE_CUTOFF) return "PLAINS";
  return valueNoise(wx + 151, wy + 43, 9, worldSeed() + 1039) > TROPICAL_PLAINS_CUTOFF ? "PLAINS" : "GRASSLAND";
};

const visualGrassBiomeV9 = (wx: number, wy: number, biome: "GRASS" | "COASTAL_SAND"): LandBiome => {
  // Lake shores are COASTAL_SAND mechanically; only ones over grass ground
  // (not desert/tundra shores) are eligible to turn marshy.
  if (biome === "COASTAL_SAND" && underlyingLandBiomeAt(wx, wy) !== "GRASS") return biome;
  const shade = grassShadeAt(wx, wy);
  if (biome === "GRASS" && isTropicalLatitudeAt(wy) && shade === "DARK") return "JUNGLE";
  const water = nearbyWaterAt(wx, wy);
  if (shade !== "DARK") {
    if (water === "LAKE" && seeded01(wx, wy, worldSeed() + 971) < LAKE_MARSH_CHANCE) return "MARSH";
    if (biome === "GRASS" && water === "NONE" && isInlandWetlandAt(wx, wy)) return "MARSH";
  }
  return biome === "COASTAL_SAND" ? biome : grassClassAt(wx, wy);
};

export const visualLandBiomeAt = (x: number, y: number): LandBiome | undefined => {
  const wx = wrapX(x, WORLD_WIDTH);
  const wy = wrapY(y, WORLD_HEIGHT);
  const biome = landBiomeAt(wx, wy);
  const version = worldgenVersion();
  if (biome === undefined || version < 8) return biome;

  if (biome === "TUNDRA") {
    return tundraFieldAt(wx, wy) > SNOW_TUNDRA_FIELD_CUTOFF ? "SNOW" : "TUNDRA";
  }

  if (version >= 9) {
    return biome === "GRASS" || biome === "COASTAL_SAND" ? visualGrassBiomeV9(wx, wy, biome) : biome;
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
