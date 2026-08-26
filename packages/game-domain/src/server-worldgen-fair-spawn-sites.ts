import { isSeaTerrain } from "@border-empires/shared";
import { key } from "./server-game-constants/server-game-constants.js";
import type { DomainTileState } from "./index/index.js";

/**
 * Pure, dependency-light spawn-site selection shared by apps/simulation's
 * real worldgen (spawn-placement.ts's fair-spawn roster, and
 * season-seed-world(-async).ts's "can this map secure enough of them"
 * acceptance check) and apps/worldgen-lab's preview tool — living in
 * game-domain (rather than the simulation app) so both can import the exact
 * same algorithm instead of the lab drifting into its own approximation.
 */

export type FairSpawnSite = { x: number; y: number };

const manhattanDistance = (ax: number, ay: number, bx: number, by: number): number => Math.abs(ax - bx) + Math.abs(ay - by);
const chebyshevDistance = (ax: number, ay: number, bx: number, by: number): number => Math.max(Math.abs(ax - bx), Math.abs(ay - by));

export const computeCoastalLandKeys = (tileList: readonly DomainTileState[]): Set<string> => {
  const landByKey = new Map<string, DomainTileState>();
  const seaKeys = new Set<string>();
  for (const tile of tileList) {
    const tileKeyValue = key(tile.x, tile.y);
    if (tile.terrain === "LAND") landByKey.set(tileKeyValue, tile);
    else if (isSeaTerrain(tile.terrain)) seaKeys.add(tileKeyValue);
  }
  if (seaKeys.size === 0 || landByKey.size === 0) return new Set();
  const coastal = new Set<string>();
  const queue: DomainTileState[] = [];
  for (const tile of landByKey.values()) {
    const hasSeaNeighbor =
      seaKeys.has(key(tile.x, tile.y - 1)) ||
      seaKeys.has(key(tile.x + 1, tile.y)) ||
      seaKeys.has(key(tile.x, tile.y + 1)) ||
      seaKeys.has(key(tile.x - 1, tile.y));
    if (!hasSeaNeighbor) continue;
    const tileKeyValue = key(tile.x, tile.y);
    if (coastal.has(tileKeyValue)) continue;
    coastal.add(tileKeyValue);
    queue.push(tile);
  }
  while (queue.length > 0) {
    const tile = queue.pop()!;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const neighborKey = key(tile.x + dx, tile.y + dy);
        if (coastal.has(neighborKey)) continue;
        const neighbor = landByKey.get(neighborKey);
        if (!neighbor) continue;
        coastal.add(neighborKey);
        queue.push(neighbor);
      }
    }
  }
  return coastal;
};

// Connected components of LAND tiles (8-directional, matching
// computeCoastalLandKeys' adjacency), used to stop the amenity checks below
// from treating a resource across water as "nearby" just because it's within
// Manhattan radius — a coastal site's closest FARM/FISH by straight-line
// distance can sit on a different landmass, on the far side of a bay or
// strait, unreachable without crossing water.
export const computeLandRegions = (tileList: readonly DomainTileState[]): Map<string, number> => {
  const landByKey = new Map<string, DomainTileState>();
  for (const tile of tileList) {
    if (tile.terrain === "LAND") landByKey.set(key(tile.x, tile.y), tile);
  }
  const regionByKey = new Map<string, number>();
  let nextRegionId = 0;
  for (const [startKey, startTile] of landByKey) {
    if (regionByKey.has(startKey)) continue;
    const regionId = nextRegionId;
    nextRegionId += 1;
    const queue: DomainTileState[] = [startTile];
    regionByKey.set(startKey, regionId);
    while (queue.length > 0) {
      const tile = queue.pop()!;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const neighborKey = key(tile.x + dx, tile.y + dy);
          if (regionByKey.has(neighborKey)) continue;
          const neighbor = landByKey.get(neighborKey);
          if (!neighbor) continue;
          regionByKey.set(neighborKey, regionId);
          queue.push(neighbor);
        }
      }
    }
  }
  return regionByKey;
};

const FAIR_SPAWN_SITE_TARGET_COUNT = 50;
const FAIR_SPAWN_SITE_AMENITY_RADIUS = 10;

// Adds up to (targetCount - chosen.length) more sites into `chosen`, drawn
// from `candidates`, via greedy farthest-point sampling: each added site
// maximizes its minimum Chebyshev distance to every site already chosen
// (across every tier processed so far, not just this bucket) — so topping up
// a thin tier still keeps the whole roster spread out instead of clustering
// the fill-in sites together. If `chosen` starts empty, it's seeded with the
// candidate closest to this bucket's centroid (not a map corner/edge tile) so
// the roster spreads outward evenly in every direction. Order-independent and
// deterministic given the same inputs (ties broken by lowest y, then x).
const farthestPointFill = (chosen: FairSpawnSite[], candidates: readonly DomainTileState[], targetCount: number): void => {
  if (candidates.length === 0 || chosen.length >= targetCount) return;
  const remaining = [...candidates].sort((left, right) => left.y - right.y || left.x - right.x);
  if (chosen.length === 0) {
    const centroidX = remaining.reduce((sum, tile) => sum + tile.x, 0) / remaining.length;
    const centroidY = remaining.reduce((sum, tile) => sum + tile.y, 0) / remaining.length;
    let seedIndex = 0;
    let seedDistance = chebyshevDistance(remaining[0]!.x, remaining[0]!.y, centroidX, centroidY);
    for (let index = 1; index < remaining.length; index += 1) {
      const distance = chebyshevDistance(remaining[index]!.x, remaining[index]!.y, centroidX, centroidY);
      if (distance < seedDistance) {
        seedDistance = distance;
        seedIndex = index;
      }
    }
    const seed = remaining[seedIndex]!;
    chosen.push({ x: seed.x, y: seed.y });
    remaining.splice(seedIndex, 1);
  }
  while (chosen.length < targetCount && remaining.length > 0) {
    let bestIndex = 0;
    let bestMinDistance = -1;
    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index]!;
      let minDistance = Infinity;
      for (const site of chosen) {
        const distance = chebyshevDistance(candidate.x, candidate.y, site.x, site.y);
        if (distance < minDistance) minDistance = distance;
      }
      if (minDistance > bestMinDistance) {
        bestMinDistance = minDistance;
        bestIndex = index;
      }
    }
    const picked = remaining[bestIndex]!;
    chosen.push({ x: picked.x, y: picked.y });
    remaining.splice(bestIndex, 1);
  }
};

/**
 * Precomputes a roster of spawn sites at worldgen time, instead of only
 * searching for one candidate per player as a per-player random search does.
 * Two properties that search doesn't guarantee on its own:
 *
 * - Equal opportunity, prioritized: candidates are bucketed into four
 *   mutually exclusive amenity tiers (town+food, town-only, food-only,
 *   neither), and the roster is filled tier by tier in that order — every
 *   town+food site the map can offer is used before a single town-only site
 *   is, and so on. So the roster is never "some fraction of tier 1, some
 *   fraction of tier 2 by luck of the search order" — it's as many tier-1
 *   (best) sites as the map has, topped up with the next-best tier only when
 *   tier 1 alone can't fill the roster.
 * - Even spread: within and across tiers, sites are chosen by greedy
 *   farthest-point sampling (each next site maximizes its minimum Chebyshev
 *   distance to sites already chosen), so the roster doesn't cluster in one
 *   region and starve another, even when multiple tiers are needed to fill it.
 *
 * Deterministic given the same tile list (no per-player seed) — this is
 * computed once per world, not once per player.
 */
export const computeFairSpawnSites = (
  tileList: readonly DomainTileState[],
  targetCount: number = FAIR_SPAWN_SITE_TARGET_COUNT
): FairSpawnSite[] => {
  if (tileList.length === 0) return [];

  const coastalLandKeys = computeCoastalLandKeys(tileList);
  const landRegionByTileKey = computeLandRegions(tileList);
  const sameLandRegion = (ax: number, ay: number, bx: number, by: number): boolean => {
    const originRegion = landRegionByTileKey.get(key(ax, ay));
    return originRegion === undefined || landRegionByTileKey.get(key(bx, by)) === originRegion;
  };

  const townCoords = tileList.filter((tile) => tile.town).map((tile) => ({ x: tile.x, y: tile.y }));
  const foodCoords = tileList.filter((tile) => tile.resource === "FARM" || tile.resource === "FISH").map((tile) => ({ x: tile.x, y: tile.y }));
  const isNearTown = (x: number, y: number): boolean =>
    townCoords.some((town) => manhattanDistance(x, y, town.x, town.y) <= FAIR_SPAWN_SITE_AMENITY_RADIUS && sameLandRegion(x, y, town.x, town.y));
  const isNearFood = (x: number, y: number): boolean =>
    foodCoords.some((food) => manhattanDistance(x, y, food.x, food.y) <= FAIR_SPAWN_SITE_AMENITY_RADIUS && sameLandRegion(x, y, food.x, food.y));

  const baseCandidates = tileList.filter((tile) => {
    const tileKeyValue = key(tile.x, tile.y);
    if (tile.terrain !== "LAND" || tile.ownerId || tile.town || tile.dockId) return false;
    return coastalLandKeys.size === 0 || coastalLandKeys.has(tileKeyValue);
  });
  if (baseCandidates.length === 0) return [];

  // Mutually exclusive, in priority order — every candidate falls into
  // exactly one bucket, so filling tier by tier below never reconsiders a
  // tile already claimed by a better tier.
  const exclusiveTiers: Array<(tile: DomainTileState) => boolean> = [
    (tile) => isNearTown(tile.x, tile.y) && isNearFood(tile.x, tile.y),
    (tile) => isNearTown(tile.x, tile.y) && !isNearFood(tile.x, tile.y),
    (tile) => !isNearTown(tile.x, tile.y) && isNearFood(tile.x, tile.y),
    (tile) => !isNearTown(tile.x, tile.y) && !isNearFood(tile.x, tile.y)
  ];

  const chosen: FairSpawnSite[] = [];
  for (const matchesTier of exclusiveTiers) {
    if (chosen.length >= targetCount) break;
    farthestPointFill(chosen, baseCandidates.filter(matchesTier), targetCount);
  }
  return chosen;
};
