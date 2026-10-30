import type { DomainTileState } from "@border-empires/game-domain";
import { MUSTER_MARCH_MAX_ROUTE_STEPS } from "@border-empires/shared";
import { chebyshevDistanceToroidal } from "../territory-automation/territory-automation.js";
import { simulationTileKey } from "../seed-state/seed-state.js";
import { buildTerrainDistanceField } from "./muster-march-pathfinding.js";
import { bandAroundPath, MARCH_PATH_BAND_RADIUS, MARCH_WALK_BAND_RADIUS, traceMarchPath } from "./muster-march-path-band.js";

/**
 * A march's route, planned from the terrain alone: real tile-step distances to
 * the target (buildTerrainDistanceField), the one straightest path it follows
 * (traceMarchPath), and the bands around that path its walk and candidates are
 * held to. Split out of runtime-muster-march.ts, which uses it every tick.
 */
export type MarchRoutePlan = {
  distanceToTarget: (x: number, y: number) => number;
  /** False when the flood never reached the flag (no land route within the cap). */
  flagReachedByFlood: boolean;
  /** Tiles within MARCH_PATH_BAND_RADIUS of the path: candidates here rank first. */
  pathBand: ReadonlySet<string>;
  /** Tiles within MARCH_WALK_BAND_RADIUS of the path: the owned-land walk may follow these past its local radius. */
  walkBand: ReadonlySet<string>;
};

type PlannedRoute = { field: Map<string, number>; path: Set<string>; pathBand: Set<string>; walkBand: Set<string> };

/**
 * Plans are cached briefly: the flood grows with the square of the route
 * length and used to run every tick. Keyed per world (the runtime's tiles map,
 * held weakly), then per flag, target, player and crossing set. A hit is used
 * only while every tile on its path is still passable, so a mountain raised on
 * the path re-plans at once; a cleared pass is picked up when the entry
 * expires. Bounded: entries expire after MARCH_ROUTE_CACHE_TTL_MS, expired
 * entries are swept on every insert, and a world keeps at most
 * MARCH_ROUTE_CACHE_MAX, oldest evicted first.
 */
export const MARCH_ROUTE_CACHE_TTL_MS = 10_000;
export const MARCH_ROUTE_CACHE_MAX = 128;

type CachedRoute = { route: PlannedRoute; expiresAt: number };
const cachesByWorld = new WeakMap<ReadonlyMap<string, DomainTileState>, Map<string, CachedRoute>>();

/** Plans held for a world (for tests and gauges). */
export const marchRouteCacheSize = (world: ReadonlyMap<string, DomainTileState>): number => cachesByWorld.get(world)?.size ?? 0;

const cacheFor = (world: ReadonlyMap<string, DomainTileState>): Map<string, CachedRoute> => {
  let cache = cachesByWorld.get(world);
  if (!cache) {
    cache = new Map();
    cachesByWorld.set(world, cache);
  }
  return cache;
};

const storeRoute = (cache: Map<string, CachedRoute>, key: string, route: PlannedRoute, nowMs: number): void => {
  cache.delete(key);
  for (const [entryKey, entry] of cache) if (entry.expiresAt <= nowMs) cache.delete(entryKey);
  cache.set(key, { route, expiresAt: nowMs + MARCH_ROUTE_CACHE_TTL_MS });
  while (cache.size > MARCH_ROUTE_CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
};

export type MarchRoutePlanInput = {
  tiles: ReadonlyMap<string, DomainTileState>;
  playerId: string;
  flag: { x: number; y: number };
  target: { x: number; y: number };
  nowMs: number;
  /** Dock links and the player's aether bridges: one-step edges the flood and path may take. */
  crossingKeysFor: (key: string) => readonly string[] | undefined;
  /** Changes whenever the crossing set does, so a new or expired bridge re-plans. */
  crossingSignature: string;
};

export const planMarchRoute = (input: MarchRoutePlanInput): MarchRoutePlan => {
  const { tiles, flag, target } = input;
  const getTile = (x: number, y: number): DomainTileState | undefined => tiles.get(simulationTileKey(x, y));
  // Unknown tiles (unexplored, or absent in unit tests) count as passable.
  const passable = (x: number, y: number): boolean => {
    const tile = getTile(x, y);
    return !tile || tile.terrain === "LAND";
  };
  const originKey = simulationTileKey(flag.x, flag.y);
  const key = `${originKey}>${target.x},${target.y}|${input.playerId}|${input.crossingSignature}`;
  const cache = cacheFor(tiles);
  const hit = cache.get(key);
  const pathStillPassable = (route: PlannedRoute): boolean => {
    for (const pathKey of route.path) {
      if (pathKey === originKey) continue;
      const tile = tiles.get(pathKey);
      if (tile && tile.terrain !== "LAND") return false;
    }
    return true;
  };
  let route = hit && hit.expiresAt > input.nowMs && pathStillPassable(hit.route) ? hit.route : undefined;
  // The flood stops once it reaches the flag (see buildTerrainDistanceField),
  // which loses nothing: a candidate no closer to the target than the flag is
  // rejected anyway. So when the flag was reached, a tile missing from the
  // field is at least as far as the flag -- treat it as exactly that, never as
  // "unknown". Only when the flood never reached the flag (cut off by water
  // with no crossing, past the search cap, or tiles simply undefined on the
  // map -- as most coordinates are in unit tests) do tiles fall back to the
  // straight-line estimate rather than being treated as infinitely far.
  const distanceFrom = (field: Map<string, number>) => {
    const flagReachedByFlood = field.has(originKey);
    return (x: number, y: number): number =>
      field.get(simulationTileKey(x, y)) ?? (flagReachedByFlood ? Number.POSITIVE_INFINITY : chebyshevDistanceToroidal(x, y, target.x, target.y));
  };
  if (!route) {
    const field = buildTerrainDistanceField(
      target.x,
      target.y,
      getTile,
      // Sized to the real route, not the straight line: a target a few tiles
      // across a strait can be MUSTER_MARCH_MAX_ROUTE_STEPS away through the
      // nearest dock, and a flood that stops short of the flag strands the
      // march on the beach. A d-step route floods about (2d+1)^2 tiles; a
      // flag with no route at all floods the full cap (about 15.6k tiles),
      // which the cache keeps to once per expiry.
      MUSTER_MARCH_MAX_ROUTE_STEPS + 2,
      originKey,
      input.crossingKeysFor
    );
    const path = traceMarchPath(flag, target, distanceFrom(field), input.crossingKeysFor, MUSTER_MARCH_MAX_ROUTE_STEPS + 2, passable);
    route = { field, path, pathBand: bandAroundPath(path, MARCH_PATH_BAND_RADIUS), walkBand: bandAroundPath(path, MARCH_WALK_BAND_RADIUS) };
    storeRoute(cache, key, route, input.nowMs);
  }
  return { distanceToTarget: distanceFrom(route.field), flagReachedByFlood: route.field.has(originKey), pathBand: route.pathBand, walkBand: route.walkBand };
};
