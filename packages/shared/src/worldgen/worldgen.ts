import type { LandBiome, RegionType, ResourceType, Terrain } from "../types.js";
import { wrapX, wrapY } from "../math/math.js";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../config.js";
import { isMountainCluster } from "./worldgen-mountain-rings.js";
import { setWorldgenVersionState, worldgenVersion } from "./worldgen-version.js";
import { continentField, continentIdAt, getInlandThresholds, getLandWaterThresholds, resetContinentScoreCaches } from "./worldgen-continent-score.js";
import { nonCoastalLandBiomeAt } from "./worldgen-biome-thresholds.js";
import { seeded01, valueNoise } from "./worldgen-noise.js";
import { grassShadeFor } from "./worldgen-meadow.js";
import { isLakeAt } from "./worldgen-lakes.js";
import { regionLatitudeBiasAt } from "./worldgen-latitude.js"; import { oasisFeatureAt } from "./worldgen-oasis.js";
import { computeCoastalCleanupMasks } from "./worldgen-island-pruning.js";
import { isMicroMountainRange, isMountainRange, isOceanChannel } from "./worldgen-mountain-ranges.js";

let CURRENT_WORLD_SEED = 42;
export type WorldStyle = "continents" | "islands";
let CURRENT_WORLD_STYLE: WorldStyle = "continents";
export const WORLD_TILE_COUNT = WORLD_WIDTH * WORLD_HEIGHT;
const UNSET_U8 = 255;
const TERRAIN_SEA = 0;
export const TERRAIN_LAND = 1;
export const TERRAIN_MOUNTAIN = 2;
const TERRAIN_COASTAL_SEA = 3;
// Scaled to keep the same fraction of WORLD_HEIGHT as the original 15/450
// and 55/450 did before the widescreen (640x320) aspect-ratio change --
// otherwise a shorter world height would make the polar/tundra bands eat a
// disproportionately larger share of the map top-to-bottom.
export const POLAR_BAND = 11; // rows from each edge that form polar mountain zones
export const TUNDRA_BAND_WIDTH = 39; // rows beyond the polar mountain band where cold can still win out over sand/grass
const BIOME_GRASS = 0;
const BIOME_SAND = 1;
const BIOME_COASTAL_SAND = 2;
const BIOME_TUNDRA = 3;
const BIOME_NONE = UNSET_U8;
const GRASS_DARK = 0;
const GRASS_LIGHT = 1;
const GRASS_NONE = UNSET_U8;
const REGION_FERTILE_PLAINS = 0;
const REGION_DEEP_FOREST = 1;
const REGION_BROKEN_HIGHLANDS = 2;
const REGION_ANCIENT_HEARTLAND = 3;
const REGION_CRYSTAL_WASTES = 4;
const REGION_NONE = UNSET_U8;

const terrainCache = new Uint8Array(WORLD_TILE_COUNT);
const biomeCache = new Uint8Array(WORLD_TILE_COUNT);
const grassShadeCache = new Uint8Array(WORLD_TILE_COUNT);
const regionTypeCache = new Uint8Array(WORLD_TILE_COUNT);
const biomeCacheReady = new Uint8Array(WORLD_TILE_COUNT);
const grassShadeCacheReady = new Uint8Array(WORLD_TILE_COUNT);
const regionTypeCacheReady = new Uint8Array(WORLD_TILE_COUNT);
// Caches rawBaseTerrainCodeAt itself (not just its sub-components): that
// function is otherwise recomputed from scratch both by the tiny-island
// flood fill below and by every neighbor lookup terrainAt's coastal-dilation
// check does, which made a full-map pass many times slower once pruning
// started forcing a full-map pass on first use.
const rawTerrainCache = new Uint8Array(WORLD_TILE_COUNT);
const rawTerrainCacheReady = new Uint8Array(WORLD_TILE_COUNT);
// isLakeTileAt: 0 = not computed, 1 = not a lake, 2 = lake.
const lakeTileCache = new Uint8Array(WORLD_TILE_COUNT);

const resetWorldCaches = (): void => {
  terrainCache.fill(UNSET_U8);
  biomeCache.fill(BIOME_NONE);
  grassShadeCache.fill(GRASS_NONE);
  regionTypeCache.fill(REGION_NONE);
  biomeCacheReady.fill(0);
  grassShadeCacheReady.fill(0);
  regionTypeCacheReady.fill(0);
  rawTerrainCacheReady.fill(0);
  lakeTileCache.fill(0);
  resetContinentScoreCaches();
};

export const setWorldSeed = (seed: number, style: WorldStyle = "continents", version = 1): void => {
  CURRENT_WORLD_SEED = Math.floor(seed);
  CURRENT_WORLD_STYLE = style; setWorldgenVersionState(version);
  resetWorldCaches();
};
export const getWorldSeed = (): number => CURRENT_WORLD_SEED;
export const worldSeed = (): number => CURRENT_WORLD_SEED;
export const worldStyle = (): WorldStyle => CURRENT_WORLD_STYLE;
export const TAU = Math.PI * 2;
export const worldIndex = (x: number, y: number): number => y * WORLD_WIDTH + x;

const encodeTerrain = (terrain: Terrain): number => {
  if (terrain === "LAND") return TERRAIN_LAND;
  if (terrain === "MOUNTAIN") return TERRAIN_MOUNTAIN;
  if (terrain === "COASTAL_SEA") return TERRAIN_COASTAL_SEA;
  return TERRAIN_SEA;
};
const decodeTerrain = (terrain: number): Terrain => {
  if (terrain === TERRAIN_LAND) return "LAND";
  if (terrain === TERRAIN_MOUNTAIN) return "MOUNTAIN";
  if (terrain === TERRAIN_COASTAL_SEA) return "COASTAL_SEA";
  return "SEA";
};
const isWaterTerrainCode = (terrain: number): boolean => terrain === TERRAIN_SEA || terrain === TERRAIN_COASTAL_SEA;

const computeRawBaseTerrainCodeAt = (wx: number, wy: number): number => {
  // Polar zones: fixed mountain bands at the top and bottom of the map.
  if (wy < POLAR_BAND || wy >= WORLD_HEIGHT - POLAR_BAND) return TERRAIN_MOUNTAIN;
  const cField = continentField(wx, wy);
  // Thresholds are calibrated per (seed, style) against the actual score
  // distribution so the realized land/water ratio matches a target fraction
  // (continents ~29%, Earth-like; islands lower, so it reads as mostly ocean)
  // instead of a fixed constant that happened to work for one seed/style.
  const { seaThreshold, coastalThreshold } = getLandWaterThresholds();
  if (cField < seaThreshold) return TERRAIN_SEA;
  // isOceanChannel is legacy from the old 5-fixed-continent ellipse layout:
  // it carves wide sine-wavy channels at fixed map-relative positions to
  // guarantee straits between those 5 hand-placed blobs. Tectonic plates
  // (continents style) already produce many separate landmasses with real
  // water between them wherever the plates actually ended up, so applying
  // fixed-position channels on top just sliced arbitrary "river-like" cuts
  // straight through otherwise-natural continent shapes. Islands style still
  // uses the old ellipse seeding, so it keeps this.
  const oceanChannelActive = worldStyle() === "islands" && isOceanChannel(wx, wy);
  if (cField < coastalThreshold || oceanChannelActive || isRiver(wx, wy) || isMicroRiver(wx, wy) || isLake(wx, wy) || oasisFeatureAt(wx, wy, worldSeed(), worldgenVersion()) === "WATER") return TERRAIN_SEA;
  if (isMountainRange(wx, wy) || isMicroMountainRange(wx, wy) || isMountainCluster(wx, wy)) return TERRAIN_MOUNTAIN;
  return TERRAIN_LAND;
};
const rawBaseTerrainCodeAt = (x: number, y: number): number => {
  const wx = wrapX(x, WORLD_WIDTH);
  const wy = wrapY(y, WORLD_HEIGHT);
  const idx = worldIndex(wx, wy);
  if (rawTerrainCacheReady[idx] === 1) return rawTerrainCache[idx]!;
  const code = computeRawBaseTerrainCodeAt(wx, wy);
  rawTerrainCache[idx] = code;
  rawTerrainCacheReady[idx] = 1;
  return code;
};

// Noise/tectonic scoring can flip a single tile (or a tiny 2-3 tile cluster)
// above the land threshold with no surrounding land at all -- a stray speck
// floating alone in open ocean, not a real island. This runs a one-time
// (per seed/style) whole-map flood fill to find and prune any land-like
// component under a minimum tile count, forcing it back to sea. Computed
// lazily on first use rather than eagerly in setWorldSeed so a caller that
// never queries terrain doesn't pay for a full-map pass it never needed.
let cachedPruneMaskSeed = Number.NaN;
let cachedPruneMaskStyle: WorldStyle | undefined;
let cachedCoastalCleanupMasks: { tinyIslandMask: Uint8Array; coastalInfillMask: Uint8Array } | undefined;
const isLandLikeCode = (code: number): boolean => code === TERRAIN_LAND || code === TERRAIN_MOUNTAIN;
// Lazy, cached once per (seed, style): see computeCoastalCleanupMasks in
// worldgen-island-pruning.ts for what this full-map pass does (CA smoothing
// + tiny-island flood-fill pruning).
const coastalCleanupMasksFor = (): { tinyIslandMask: Uint8Array; coastalInfillMask: Uint8Array } => {
  const seed = worldSeed();
  const style = worldStyle();
  if (seed !== cachedPruneMaskSeed || style !== cachedPruneMaskStyle || !cachedCoastalCleanupMasks) {
    cachedPruneMaskSeed = seed;
    cachedPruneMaskStyle = style;
    cachedCoastalCleanupMasks = computeCoastalCleanupMasks(
      WORLD_WIDTH,
      WORLD_HEIGHT,
      (x, y) => isLandLikeCode(rawBaseTerrainCodeAt(x, y))
    );
  }
  return cachedCoastalCleanupMasks;
};

const baseTerrainCodeAt = (x: number, y: number): number => {
  const wx = wrapX(x, WORLD_WIDTH);
  const wy = wrapY(y, WORLD_HEIGHT);
  const raw = rawBaseTerrainCodeAt(wx, wy);
  const idx = worldIndex(wx, wy);
  const { tinyIslandMask, coastalInfillMask } = coastalCleanupMasksFor();
  if (isLandLikeCode(raw) && tinyIslandMask[idx] === 1) return TERRAIN_SEA;
  if (raw === TERRAIN_SEA && coastalInfillMask[idx] === 1) return TERRAIN_LAND;
  return raw;
};

export const terrainCodeAt = (x: number, y: number): number => {
  const idx = worldIndex(wrapX(x, WORLD_WIDTH), wrapY(y, WORLD_HEIGHT));
  const cached = terrainCache[idx] ?? UNSET_U8;
  if (cached !== UNSET_U8) return cached;
  return encodeTerrain(terrainAt(x, y));
};
const encodeBiome = (biome: LandBiome | undefined): number => {
  if (biome === "GRASS") return BIOME_GRASS;
  if (biome === "SAND") return BIOME_SAND;
  if (biome === "COASTAL_SAND") return BIOME_COASTAL_SAND;
  if (biome === "TUNDRA") return BIOME_TUNDRA;
  return BIOME_NONE;
};
const decodeBiome = (biome: number): LandBiome | undefined => {
  if (biome === BIOME_GRASS) return "GRASS";
  if (biome === BIOME_SAND) return "SAND";
  if (biome === BIOME_COASTAL_SAND) return "COASTAL_SAND";
  if (biome === BIOME_TUNDRA) return "TUNDRA";
  return undefined;
};
const encodeGrassShade = (shade: "LIGHT" | "DARK" | undefined): number => {
  if (shade === "DARK") return GRASS_DARK;
  if (shade === "LIGHT") return GRASS_LIGHT;
  return GRASS_NONE;
};
const decodeGrassShade = (shade: number): "LIGHT" | "DARK" | undefined => {
  if (shade === GRASS_DARK) return "DARK";
  if (shade === GRASS_LIGHT) return "LIGHT";
  return undefined;
};
const encodeRegionType = (region: RegionType | undefined): number => {
  if (region === "FERTILE_PLAINS") return REGION_FERTILE_PLAINS;
  if (region === "DEEP_FOREST") return REGION_DEEP_FOREST;
  if (region === "BROKEN_HIGHLANDS") return REGION_BROKEN_HIGHLANDS;
  if (region === "ANCIENT_HEARTLAND") return REGION_ANCIENT_HEARTLAND;
  if (region === "CRYSTAL_WASTES") return REGION_CRYSTAL_WASTES;
  return REGION_NONE;
};
const decodeRegionType = (region: number): RegionType | undefined => {
  if (region === REGION_FERTILE_PLAINS) return "FERTILE_PLAINS";
  if (region === REGION_DEEP_FOREST) return "DEEP_FOREST";
  if (region === REGION_BROKEN_HIGHLANDS) return "BROKEN_HIGHLANDS";
  if (region === REGION_ANCIENT_HEARTLAND) return "ANCIENT_HEARTLAND";
  if (region === REGION_CRYSTAL_WASTES) return "CRYSTAL_WASTES";
  return undefined;
};

export { seeded01, valueNoise } from "./worldgen-noise.js";
export { continentIdAt } from "./worldgen-continent-score.js";

// Rivers are disabled: generation doesn't fully work yet.
const isRiver = (_x: number, _y: number): boolean => false;

const isMicroRiver = (_x: number, _y: number): boolean => false;

const isLake = (x: number, y: number): boolean => {
  const inland = getInlandThresholds();
  if (continentField(x, y) < inland.continentIdentity) return false;
  return isLakeAt(x, y, worldSeed(), worldgenVersion(), continentField, inland.lakeCandidateInland);
};

/** True for a water tile carved by the inland-lake generator (not ocean, bays or oasis pools). */
export const isLakeTileAt = (x: number, y: number): boolean => {
  const wx = wrapX(x, WORLD_WIDTH);
  const wy = wrapY(y, WORLD_HEIGHT);
  const idx = worldIndex(wx, wy);
  const cached = lakeTileCache[idx]!;
  if (cached !== 0) return cached === 2;
  const lake = isWaterTerrainCode(terrainCodeAt(wx, wy)) && isLake(wx, wy);
  lakeTileCache[idx] = lake ? 2 : 1;
  return lake;
};

export const terrainAt = (x: number, y: number): Terrain => {
  const wx = wrapX(x, WORLD_WIDTH);
  const wy = wrapY(y, WORLD_HEIGHT);
  const idx = worldIndex(wx, wy);
  const cached = terrainCache[idx] ?? UNSET_U8;
  if (cached !== UNSET_U8) return decodeTerrain(cached);

  const base = baseTerrainCodeAt(wx, wy);
  let terrainCode = base;
  // Tiles that would have been coastal sea (sea touching land) now
  // generate as LAND so the entire shoreline is capturable; only fully
  // open sea — surrounded on all 8 sides by other sea tiles — stays SEA.
  // Using the 8-neighbour test means narrow 2-wide channels also flip
  // entirely to land, matching the rule "if there is a bit of land in
  // the tile it counts as land". The COASTAL_SEA terrain code is left
  // in the type union for snapshot back-compat with worlds generated
  // under the older rule.
  if (base === TERRAIN_SEA) {
    const neighbors = [
      baseTerrainCodeAt(wx, wy - 1),
      baseTerrainCodeAt(wx + 1, wy - 1),
      baseTerrainCodeAt(wx + 1, wy),
      baseTerrainCodeAt(wx + 1, wy + 1),
      baseTerrainCodeAt(wx, wy + 1),
      baseTerrainCodeAt(wx - 1, wy + 1),
      baseTerrainCodeAt(wx - 1, wy),
      baseTerrainCodeAt(wx - 1, wy - 1)
    ];
    if (neighbors.includes(TERRAIN_LAND)) terrainCode = TERRAIN_LAND;
  }

  terrainCache[idx] = terrainCode;
  return decodeTerrain(terrainCode);
};

// Forces a tile's terrain, bypassing procedural generation. Used to carve a
// sea channel through a mountain ring that would otherwise fully enclose a
// land mass, since such a mass could never receive a dock.
export const overrideTerrainAt = (x: number, y: number, terrain: Terrain): void => {
  const wx = wrapX(x, WORLD_WIDTH);
  const wy = wrapY(y, WORLD_HEIGHT);
  terrainCache[worldIndex(wx, wy)] = encodeTerrain(terrain);
};

export const isCoastalLandAt = (x: number, y: number): boolean => {
  const wx = wrapX(x, WORLD_WIDTH);
  const wy = wrapY(y, WORLD_HEIGHT);
  if (terrainCodeAt(wx, wy) !== TERRAIN_LAND) return false;
  return (
    isWaterTerrainCode(terrainCodeAt(wx, wy - 1)) ||
    isWaterTerrainCode(terrainCodeAt(wx + 1, wy)) ||
    isWaterTerrainCode(terrainCodeAt(wx, wy + 1)) ||
    isWaterTerrainCode(terrainCodeAt(wx - 1, wy))
  );
};

// The economic terrain beneath a shoreline. landBiomeAt intentionally paints
// every shore as COASTAL_SAND for resources and rendering; towns need this
// separate value so coast can stack with tundra, desert, or plains identity.
export const underlyingLandBiomeAt = (x: number, y: number): LandBiome | undefined => {
  const wx = wrapX(x, WORLD_WIDTH);
  const wy = wrapY(y, WORLD_HEIGHT);
  if (terrainCodeAt(wx, wy) !== TERRAIN_LAND) return undefined;
  const region = regionTypeAt(wx, wy);
  let biome = region === "DEEP_FOREST"
    ? "GRASS" as LandBiome
    : nonCoastalLandBiomeAt(wx, wy, region, worldgenVersion(), worldSeed(), WORLD_HEIGHT);
  if (biome !== "GRASS" && oasisFeatureAt(wx, wy, worldSeed(), worldgenVersion()) === "RING") biome = "GRASS";
  return biome;
};

export const landBiomeAt = (x: number, y: number): LandBiome | undefined => {
  const wx = wrapX(x, WORLD_WIDTH);
  const wy = wrapY(y, WORLD_HEIGHT);
  const idx = worldIndex(wx, wy);
  if (biomeCacheReady[idx] === 1) return decodeBiome(biomeCache[idx]!);
  if (terrainCodeAt(wx, wy) !== TERRAIN_LAND) {
    biomeCache[idx] = BIOME_NONE;
    biomeCacheReady[idx] = 1;
    return undefined;
  }
  let biome: LandBiome = isCoastalLandAt(wx, wy) ? "COASTAL_SAND" : underlyingLandBiomeAt(wx, wy)!;
  // Applied after the whole branch above (not just the SAND path) since an
  // oasis ring tile touching the new oasis water reads as coastal land and
  // gets COASTAL_SAND from the very first branch instead -- the override
  // needs to win regardless of which path produced the pre-oasis biome.
  if (biome !== "GRASS" && oasisFeatureAt(wx, wy, worldSeed(), worldgenVersion()) === "RING") biome = "GRASS";
  biomeCache[idx] = encodeBiome(biome);
  biomeCacheReady[idx] = 1;
  return biome;
};

export const regionTypeAt = (x: number, y: number): RegionType | undefined => {
  const wx = wrapX(x, WORLD_WIDTH);
  const wy = wrapY(y, WORLD_HEIGHT);
  const idx = worldIndex(wx, wy);
  if (regionTypeCacheReady[idx] === 1) return decodeRegionType(regionTypeCache[idx]!);
  if (terrainCodeAt(wx, wy) !== TERRAIN_LAND) {
    regionTypeCache[idx] = REGION_NONE;
    regionTypeCacheReady[idx] = 1;
    return undefined;
  }
  const version = worldgenVersion();
  const v1 = version < 2; const a = valueNoise(wx, wy, v1 ? 180 : 60, worldSeed() + 1403); // v1's 180/120/260 let one region span 1000+ tiles
  const b = valueNoise(wx + 137, wy + 59, v1 ? 120 : 38, worldSeed() + 1417); const c = valueNoise(wx - 83, wy + 191, v1 ? 260 : 95, worldSeed() + 1429);
  const bias = version >= 7 ? regionLatitudeBiasAt(wy) : 0;
  const v = Math.min(1, Math.max(0, a * 0.52 + b * 0.28 + c * 0.2 + bias));
  const region =
    v < 0.22
      ? "FERTILE_PLAINS"
      : v < 0.36
        ? "DEEP_FOREST"
        : v < 0.58
          ? "BROKEN_HIGHLANDS"
          : v < 0.8
            ? "ANCIENT_HEARTLAND"
            : "CRYSTAL_WASTES";
  regionTypeCache[idx] = encodeRegionType(region);
  regionTypeCacheReady[idx] = 1;
  return region;
};

// Despite the name (kept to avoid renaming across every existing GRASS-only
// consumer, all of which explicitly AND this with `landBiomeAt(...) ===
// "GRASS"` and so are unaffected), this also computes a light/dark split for
// TUNDRA — its "dark" variant is the tundra-forest concept: no FARM/GEMS,
// but a real TITANIUM+UMBRITE affinity (see server-worldgen-terrain.ts). The
// underlying noise formula below was already biome-agnostic; only this gate
// restricted it to GRASS.
export const grassShadeAt = (x: number, y: number): "LIGHT" | "DARK" | undefined => {
  const wx = wrapX(x, WORLD_WIDTH);
  const wy = wrapY(y, WORLD_HEIGHT);
  const idx = worldIndex(wx, wy);
  if (grassShadeCacheReady[idx] === 1) return decodeGrassShade(grassShadeCache[idx]!);
  const biome = landBiomeAt(wx, wy);
  if (biome !== "GRASS" && biome !== "TUNDRA") {
    grassShadeCache[idx] = GRASS_NONE;
    grassShadeCacheReady[idx] = 1;
    return undefined;
  }
  const region = regionTypeAt(wx, wy);
  const version = worldgenVersion();
  const shade = grassShadeFor(wx, wy, worldSeed(), version, region, biome);
  grassShadeCache[idx] = encodeGrassShade(shade);
  grassShadeCacheReady[idx] = 1;
  return shade;
};

export const resourceAt = (x: number, y: number): ResourceType | undefined => {
  // Resource placement is cluster-driven on the server.
  return undefined;
};
