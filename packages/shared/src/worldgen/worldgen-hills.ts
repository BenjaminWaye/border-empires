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
  WORLD_TILE_COUNT,
  regionTypeAt,
  terrainCodeAt,
  valueNoise,
  worldIndex,
  worldSeed
} from "./worldgen.js";

let hillsCache = new Uint8Array(WORLD_TILE_COUNT);
let hillsCacheReady = new Uint8Array(WORLD_TILE_COUNT);
let hillsCacheSeed: number | undefined;

// Broad rolling hill regions on land — a permanent-forever derived property
// of the coordinate (like forest-ness, see hills-terrain.ts). Concentrated
// in BROKEN_HIGHLANDS the same way grassShadeAt concentrates forest in
// DEEP_FOREST (lower threshold = more of the region qualifies), with a much
// rarer scattering elsewhere so standalone hills still turn up off-region.
export const isHillsRegionAt = (x: number, y: number): boolean => {
  const seed = worldSeed();
  if (hillsCacheSeed !== seed) {
    hillsCache = new Uint8Array(WORLD_TILE_COUNT);
    hillsCacheReady = new Uint8Array(WORLD_TILE_COUNT);
    hillsCacheSeed = seed;
  }
  const wx = wrapX(x, WORLD_WIDTH);
  const wy = wrapY(y, WORLD_HEIGHT);
  const idx = worldIndex(wx, wy);
  if (hillsCacheReady[idx] === 1) return hillsCache[idx] === 1;
  let isHills = false;
  if (terrainCodeAt(wx, wy) === TERRAIN_LAND) {
    const macro = valueNoise(wx + 211, wy - 97, 96, seed + 811);
    const micro = valueNoise(wx - 53, wy + 137, 34, seed + 821);
    const hillField = macro * 0.65 + micro * 0.35;
    const hillThreshold = regionTypeAt(wx, wy) === "BROKEN_HIGHLANDS" ? 0.42 : 0.86;
    isHills = hillField > hillThreshold;
  }
  hillsCache[idx] = isHills ? 1 : 0;
  hillsCacheReady[idx] = 1;
  return isHills;
};
