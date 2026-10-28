import type { DomainTileState } from "@border-empires/game-domain";

/**
 * Short-lived cache of each march's terrain distance field
 * (buildTerrainDistanceField). Terrain and crossings almost never change while
 * a flag marches, but the field used to be rebuilt every muster tick. That cost
 * grows with the square of the route length, so the 30-tile march cap would
 * otherwise mean a flood of several thousand tiles per flag per second.
 *
 * Keyed per world (the runtime's tiles map, held weakly) and then per flag,
 * target and crossing set. Bounded: entries expire after
 * MARCH_DISTANCE_FIELD_TTL_MS and each world keeps at most
 * MARCH_DISTANCE_FIELD_CACHE_MAX of them, oldest evicted first.
 */
export const MARCH_DISTANCE_FIELD_TTL_MS = 30_000;
export const MARCH_DISTANCE_FIELD_CACHE_MAX = 256;

type CachedField = { field: Map<string, number>; expiresAt: number };

const cachesByWorld = new WeakMap<ReadonlyMap<string, DomainTileState>, Map<string, CachedField>>();

export const cachedMarchDistanceField = (
  world: ReadonlyMap<string, DomainTileState>,
  key: string,
  nowMs: number,
  build: () => Map<string, number>
): Map<string, number> => {
  let cache = cachesByWorld.get(world);
  if (!cache) {
    cache = new Map();
    cachesByWorld.set(world, cache);
  }
  const hit = cache.get(key);
  if (hit && hit.expiresAt > nowMs) return hit.field;
  const field = build();
  cache.delete(key);
  cache.set(key, { field, expiresAt: nowMs + MARCH_DISTANCE_FIELD_TTL_MS });
  while (cache.size > MARCH_DISTANCE_FIELD_CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  return field;
};
