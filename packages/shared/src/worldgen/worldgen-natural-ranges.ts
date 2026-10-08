// v10+ continents-style mountain ranges (see worldgen-version.ts). A Voronoi
// plate boundary is a straight line, so the old "stress above a fixed
// threshold" rule produced ruler-straight ranges, and wherever the per-plate
// distance distortion flattened the boundary the same rule filled a wide
// wedge of solid mountain. Both read as fake in game, and a mountain band
// thicker than ~2 tiles looks wrong regardless of how it is shaped.
//
// So the range is split in two:
//   - the CORE is the medial axis (skeleton) of the high-stress zone, which is
//     at most ~2 tiles wide however wide the zone is, and
//   - the FOOTHILLS are everything else in the zone plus a margin around it,
//     which worldgen-hills.ts turns into hills -- mountain -> hills -> flat.
// The stress is sampled through a mid-scale jitter so the line wanders instead
// of tracking the boundary exactly, and the thresholds vary with low-frequency
// noise so a range swells, thins and fades out along its length.
import { WORLD_HEIGHT, WORLD_WIDTH } from "../config.js";
import { wrapX, wrapY } from "../math/math.js";
import { boundaryConvergentStressCachedAt, continentField, getInlandThresholds } from "./worldgen-continent-score.js";
import { valueNoise } from "./worldgen-noise.js";
import { worldIndex, worldSeed } from "./worldgen.js";
import { worldgenVersion } from "./worldgen-version.js";

const JITTER_CELL = 30;
const JITTER_AMPLITUDE = 10;
const THRESHOLD_CELL = 40;
const CORE_THRESHOLD_MIN = 0.2;
const CORE_THRESHOLD_SPAN = 0.4;
// Foothills reach out to where stress has decayed to this fraction of the
// core threshold, so the hill margin is a few tiles wide on a steep boundary.
const FOOTHILL_THRESHOLD_RATIO = 0.3;
// A zone wider than 2 * MAX_CLEARANCE + 1 tiles is "very wide": its interior
// is all hills and only the ring just inside its edge keeps mountains.
const MAX_CLEARANCE = 7;

const NOT_IN_ZONE = -1;
const UNSET = -2;
const clearanceCache = new Int8Array(WORLD_WIDTH * WORLD_HEIGHT);
let cacheSeed: number | undefined;
let cacheVersion: number | undefined;

const syncCache = (): void => {
  const seed = worldSeed();
  const version = worldgenVersion();
  if (cacheSeed === seed && cacheVersion === version) return;
  clearanceCache.fill(UNSET);
  cacheSeed = seed;
  cacheVersion = version;
};

const stressAt = (x: number, y: number): number => {
  const seed = worldSeed();
  const jx = (valueNoise(x, y, JITTER_CELL, seed + 3101) - 0.5) * 2 * JITTER_AMPLITUDE;
  const jy = (valueNoise(x, y, JITTER_CELL, seed + 3102) - 0.5) * 2 * JITTER_AMPLITUDE;
  const sx = wrapX(Math.round(x + jx), WORLD_WIDTH);
  const sy = Math.min(WORLD_HEIGHT - 1, Math.max(0, Math.round(y + jy)));
  return boundaryConvergentStressCachedAt(sx, sy);
};

const coreThresholdAt = (x: number, y: number): number =>
  CORE_THRESHOLD_MIN + valueNoise(x, y, THRESHOLD_CELL, worldSeed() + 3103) * CORE_THRESHOLD_SPAN;

const isInland = (x: number, y: number): boolean => continentField(x, y) > getInlandThresholds().mountainRangeInland;

const inCoreZone = (x: number, y: number): boolean => {
  const wx = wrapX(x, WORLD_WIDTH);
  const wy = wrapY(y, WORLD_HEIGHT);
  return isInland(wx, wy) && stressAt(wx, wy) >= coreThresholdAt(wx, wy);
};

// Chebyshev distance to the nearest tile outside the core zone, capped at
// MAX_CLEARANCE (NOT_IN_ZONE for tiles outside the zone). 0 means the tile is
// on the zone's edge.
const clearanceAt = (x: number, y: number): number => {
  syncCache();
  const wx = wrapX(x, WORLD_WIDTH);
  const wy = wrapY(y, WORLD_HEIGHT);
  const idx = worldIndex(wx, wy);
  const cached = clearanceCache[idx]!;
  if (cached !== UNSET) return cached;
  let clearance = NOT_IN_ZONE;
  if (inCoreZone(wx, wy)) {
    clearance = MAX_CLEARANCE;
    for (let r = 1; r <= MAX_CLEARANCE && clearance === MAX_CLEARANCE; r += 1) {
      for (let d = -r; d <= r && clearance === MAX_CLEARANCE; d += 1) {
        if (!inCoreZone(wx + d, wy - r) || !inCoreZone(wx + d, wy + r) || !inCoreZone(wx - r, wy + d) || !inCoreZone(wx + r, wy + d)) {
          clearance = r - 1;
        }
      }
    }
  }
  clearanceCache[idx] = clearance;
  return clearance;
};

// Core tiles are the zone's skeleton: a tile whose clearance is not beaten by
// any neighbour's. Thin zones are kept whole (every tile has clearance 0).
export const isNaturalRangeCore = (x: number, y: number): boolean => {
  const own = clearanceAt(x, y);
  if (own === NOT_IN_ZONE || own >= MAX_CLEARANCE) return false;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if ((dx !== 0 || dy !== 0) && clearanceAt(x + dx, y + dy) > own) return false;
    }
  }
  return true;
};

// The hill margin: the core zone itself plus a band where stress has decayed
// only part way. The caller (worldgen-hills.ts) restricts this to land tiles
// that are not mountain.
export const isNaturalRangeFoothill = (x: number, y: number): boolean => {
  const wx = wrapX(x, WORLD_WIDTH);
  const wy = wrapY(y, WORLD_HEIGHT);
  if (!isInland(wx, wy)) return false;
  return stressAt(wx, wy) >= coreThresholdAt(wx, wy) * FOOTHILL_THRESHOLD_RATIO;
};
