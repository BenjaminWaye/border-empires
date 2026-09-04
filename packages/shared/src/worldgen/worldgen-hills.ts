// Split out of worldgen.ts (already at the repo's 500-line file cap) so this
// didn't push that file over the limit. Self-contained cache: instead of
// hooking into worldgen.ts's own resetWorldCaches (which would create a
// circular import back into this file), this module just notices when
// worldSeed() has changed since it last populated the cache and clears
// itself lazily on the next lookup.
import { wrapX, wrapY } from "../math/math.js";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../config.js";
import {
  TERRAIN_LAND,
  TERRAIN_MOUNTAIN,
  WORLD_TILE_COUNT,
  regionTypeAt,
  seeded01,
  terrainCodeAt,
  valueNoise,
  worldIndex,
  worldSeed
} from "./worldgen.js";
import { worldgenVersion } from "./worldgen-version.js";
import { hillFieldAt, hillThresholdFor } from "./worldgen-biome-thresholds.js";

let hillsCache = new Uint8Array(WORLD_TILE_COUNT);
let hillsCacheReady = new Uint8Array(WORLD_TILE_COUNT);
let hillsCacheSeed: number | undefined;
let hillsCacheVersion: number | undefined;

// How far out (Chebyshev distance, in tiles) a mountain's foothill effect
// reaches, and the chance a LAND tile at each distance becomes hills purely
// from that adjacency — tapering off with distance the way real foothills
// thin out the further you get from the range. Modeled on the classic
// Civilization-style map generation approach: mountain ranges there sit on
// the high end of a shared elevation field, with hills occupying the band
// just below the mountain threshold, so terrain naturally steps down
// mountain → hills → flat instead of mountain → flat. This codebase's
// mountains are geometric/boolean (ridges, clusters — see isMountainRange
// etc. in worldgen.ts) rather than a continuous elevation field, so the same
// effect is approximated here as an explicit proximity check instead.
const FOOTHILLS_RADIUS = 2;
const FOOTHILLS_CHANCE_BY_DISTANCE: Record<number, number> = { 1: 0.75, 2: 0.4 };

// Chebyshev distance from (x, y) to the nearest MOUNTAIN tile within
// FOOTHILLS_RADIUS, or undefined if none is that close. terrainCodeAt is
// cache-backed (see terrainAt in worldgen.ts), so this scan is cheap even
// called across most of the map's LAND tiles.
const nearestMountainDistance = (x: number, y: number): number | undefined => {
  let best: number | undefined;
  for (let dy = -FOOTHILLS_RADIUS; dy <= FOOTHILLS_RADIUS; dy++) {
    for (let dx = -FOOTHILLS_RADIUS; dx <= FOOTHILLS_RADIUS; dx++) {
      if (dx === 0 && dy === 0) continue;
      const dist = Math.max(Math.abs(dx), Math.abs(dy));
      if (best !== undefined && dist >= best) continue;
      if (terrainCodeAt(x + dx, y + dy) === TERRAIN_MOUNTAIN) best = dist;
    }
  }
  return best;
};

// A discrete "highlands" formation: a solid diamond-shaped (Manhattan
// distance) clump of hills, scattered across the map independent of the
// BROKEN_HIGHLANDS region noise below. This is the hills equivalent of
// isMountainCluster in worldgen.ts (same per-cell random-center pattern),
// but filled rather than a ring, and diamond- rather than circle-shaped, so
// it reads as a distinct, recognizable highland plateau — a landmark you can
// spot on the map — rather than only ever diffuse regional hill noise.
const HIGHLANDS_CLUSTER_CELL = 70;
const HIGHLANDS_CLUSTER_CHANCE = 0.3; // fraction of cells that roll a highlands formation
const isHighlandsClusterAt = (x: number, y: number, seed: number): boolean => {
  const cell = HIGHLANDS_CLUSTER_CELL;
  const gx = Math.floor(x / cell);
  const gy = Math.floor(y / cell);
  if (seeded01(gx, gy, seed + 851) > HIGHLANDS_CLUSTER_CHANCE) return false;
  const cx = gx * cell + Math.floor(seeded01(gx, gy, seed + 852) * cell);
  const cy = gy * cell + Math.floor(seeded01(gx, gy, seed + 853) * cell);
  const r = 5 + Math.floor(seeded01(gx, gy, seed + 854) * 6); // 5..10
  return Math.abs(x - cx) + Math.abs(y - cy) <= r;
};

// Broad rolling hill regions on land — a permanent-forever derived property
// of the coordinate (like forest-ness, see hills-terrain.ts). Three
// independent signals feed the result, mirroring how Civilization-style map
// generation builds hills:
//   1. a diffuse "highlands region" macro-noise signal (rolling hill
//      country, concentrated in BROKEN_HIGHLANDS with rare scattering
//      elsewhere);
//   2. a "foothills" signal (see nearestMountainDistance above) so mountain
//      ranges always taper through hills rather than dropping straight to
//      flat land; and
//   3. discrete diamond-shaped "highlands" clusters (see
//      isHighlandsClusterAt above) as recognizable standalone formations.
// All three, plus the clearing pass below, are pure functions of the tile's
// own coordinate/terrain with no dependency on WorldStyle, so the same rules
// apply unchanged on continents and islands maps.
export const isHillsRegionAt = (x: number, y: number): boolean => {
  const seed = worldSeed();
  const version = worldgenVersion();
  if (hillsCacheSeed !== seed || hillsCacheVersion !== version) {
    hillsCache = new Uint8Array(WORLD_TILE_COUNT);
    hillsCacheReady = new Uint8Array(WORLD_TILE_COUNT);
    hillsCacheSeed = seed;
    hillsCacheVersion = version;
  }
  const wx = wrapX(x, WORLD_WIDTH);
  const wy = wrapY(y, WORLD_HEIGHT);
  const idx = worldIndex(wx, wy);
  if (hillsCacheReady[idx] === 1) return hillsCache[idx] === 1;
  let isHills = false;
  if (terrainCodeAt(wx, wy) === TERRAIN_LAND) {
    const isBrokenHighlands = regionTypeAt(wx, wy) === "BROKEN_HIGHLANDS";
    const hillField = hillFieldAt(wx, wy, seed, version);
    const hillThreshold = hillThresholdFor(isBrokenHighlands, version);
    isHills = hillField > hillThreshold;

    if (!isHills) {
      const dist = nearestMountainDistance(wx, wy);
      if (dist !== undefined) {
        const chance = FOOTHILLS_CHANCE_BY_DISTANCE[dist] ?? 0;
        const roll = seeded01(wx * 3 + 7, wy * 5 - 11, seed + 841);
        isHills = roll < chance;
      }
    }

    if (!isHills) {
      isHills = isHighlandsClusterAt(wx, wy, seed);
    }

    // Broken Highlands' low threshold (and now foothills/highlands clusters)
    // would otherwise read as a solid, unbroken slab of hills for dozens of
    // tiles at a stretch. A short-wavelength noise layer punches clearings
    // into any hilly stretch so it isn't monolithic — same idea as hillField
    // but much shorter wavelength, and only ever removing hills, never adding
    // them. v2 adds a second, independently-seeded clearing layer at a
    // slightly coarser scale (and lowers both cutoffs) so an occasional
    // clearing is itself a few tiles wide, not just a pinprick, and so the
    // two layers together avoid a single repeating clearing pattern; v1 kept
    // its original single fine-only pass so already-running seasons aren't
    // retroactively perturbed by this tuning change (see worldgen-version.ts).
    if (isHills) {
      const clearingFine = valueNoise(wx - 173, wy + 269, 10, seed + 831);
      if (version < 2) {
        if (clearingFine > 0.9) isHills = false;
      } else {
        const clearingCoarse = valueNoise(wx + 89, wy - 151, 22, seed + 861);
        if (clearingFine > 0.82 || clearingCoarse > 0.86) isHills = false;
      }
    }
  }
  hillsCache[idx] = isHills ? 1 : 0;
  hillsCacheReady[idx] = 1;
  return isHills;
};
