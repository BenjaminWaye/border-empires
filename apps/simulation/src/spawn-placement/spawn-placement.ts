import { isSeaTerrain } from "@border-empires/shared";
import type { DomainTileState } from "@border-empires/game-domain";

import { simulationTileKey } from "../seed-state/seed-state.js";

type SpawnRequirements = {
  needsTown: boolean;
  needsFood: boolean;
  minSpawnDistance: number;
};

type SpawnSearchPass = {
  tries: number;
  requirements: SpawnRequirements;
};

export type LegacySpawnPlacementInput = {
  playerId: string;
  tiles: Iterable<DomainTileState>;
  blockedTileKeys?: ReadonlySet<string>;
  rallyAnchor?: { x: number; y: number };
  // Coastal-land membership depends only on tile.terrain, which never
  // changes after worldgen — callers that hit this on a hot path (every new
  // player connecting, via ensurePlayerHasSpawnTerritory) can precompute it
  // once and pass it here instead of paying the O(tiles) scan-and-flood-fill
  // in computeCoastalLandKeys on every call. Falls back to computing it
  // in-line (unchanged behavior) when omitted.
  coastalLandKeys?: ReadonlySet<string>;
  // Spatial "is there a settled/town/food tile within radius of (x,y)"
  // queries, replacing this function's own linear-scan derivation below. The
  // search loop calls these up to ~24,000 times per spawn attempt, and
  // settledCoords in particular tracks every OWNED TILE across every player
  // (not one point per player) — on a mature world that's thousands of
  // coordinates, and a linear scan against it dominates connect/INIT latency
  // under load. Hot-path callers pass a grid-backed index (see
  // SpawnPlacementIndex) instead; falls back to deriving from `tiles` with a
  // plain per-call linear scan (unchanged behavior) when omitted.
  hasNearbySettled?: (x: number, y: number, radius: number) => boolean;
  hasNearbyTown?: (x: number, y: number, radius: number) => boolean;
  hasNearbyFood?: (x: number, y: number, radius: number) => boolean;
};

const RALLY_SPAWN_RADIUS = 24;

const LEGACY_SPAWN_SEARCH_ORDER: readonly SpawnSearchPass[] = [
  { tries: 8_000, requirements: { needsTown: true, needsFood: true, minSpawnDistance: 50 } },
  { tries: 5_000, requirements: { needsTown: true, needsFood: false, minSpawnDistance: 50 } },
  { tries: 5_000, requirements: { needsTown: false, needsFood: true, minSpawnDistance: 50 } },
  { tries: 5_000, requirements: { needsTown: false, needsFood: false, minSpawnDistance: 50 } },
  { tries: 3_000, requirements: { needsTown: false, needsFood: false, minSpawnDistance: 20 } },
  { tries: 3_000, requirements: { needsTown: false, needsFood: false, minSpawnDistance: 10 } },
  { tries: 3_000, requirements: { needsTown: false, needsFood: false, minSpawnDistance: 0 } }
];

const manhattanDistance = (ax: number, ay: number, bx: number, by: number): number => Math.abs(ax - bx) + Math.abs(ay - by);
const chebyshevDistance = (ax: number, ay: number, bx: number, by: number): number => Math.max(Math.abs(ax - bx), Math.abs(ay - by));

const hashString = (value: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const nextSeed = (seed: number): number => (Math.imul(seed, 1664525) + 1013904223) >>> 0;

export const computeCoastalLandKeys = (tileList: readonly DomainTileState[]): Set<string> => {
  const landByKey = new Map<string, DomainTileState>();
  const seaKeys = new Set<string>();
  for (const tile of tileList) {
    const tileKey = simulationTileKey(tile.x, tile.y);
    if (tile.terrain === "LAND") landByKey.set(tileKey, tile);
    else if (isSeaTerrain(tile.terrain)) seaKeys.add(tileKey);
  }
  if (seaKeys.size === 0 || landByKey.size === 0) return new Set();
  const coastal = new Set<string>();
  const queue: DomainTileState[] = [];
  for (const tile of landByKey.values()) {
    const hasSeaNeighbor =
      seaKeys.has(simulationTileKey(tile.x, tile.y - 1)) ||
      seaKeys.has(simulationTileKey(tile.x + 1, tile.y)) ||
      seaKeys.has(simulationTileKey(tile.x, tile.y + 1)) ||
      seaKeys.has(simulationTileKey(tile.x - 1, tile.y));
    if (!hasSeaNeighbor) continue;
    const tileKey = simulationTileKey(tile.x, tile.y);
    if (coastal.has(tileKey)) continue;
    coastal.add(tileKey);
    queue.push(tile);
  }
  while (queue.length > 0) {
    const tile = queue.pop()!;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const neighborKey = simulationTileKey(tile.x + dx, tile.y + dy);
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
// computeCoastalLandKeys' adjacency), used to stop hasNearbyFood/hasNearbyTown
// from treating a resource across water as "nearby" just because it's within
// Manhattan radius — a coastal spawn's closest FARM/FISH by straight-line
// distance can sit on a different landmass, on the far side of a bay or
// strait, unreachable without crossing water.
export const computeLandRegions = (tileList: readonly DomainTileState[]): Map<string, number> => {
  const landByKey = new Map<string, DomainTileState>();
  for (const tile of tileList) {
    if (tile.terrain === "LAND") landByKey.set(simulationTileKey(tile.x, tile.y), tile);
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
          const neighborKey = simulationTileKey(tile.x + dx, tile.y + dy);
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

export type FairSpawnSite = { x: number; y: number };

const FAIR_SPAWN_SITE_TARGET_COUNT = 50;
const FAIR_SPAWN_SITE_AMENITY_RADIUS = 10;

/**
 * Precomputes a roster of spawn sites at worldgen time, instead of only
 * searching for one candidate per player as chooseLegacySpawnPlacement does.
 * Two properties the per-player random search doesn't guarantee on its own:
 *
 * - Equal opportunity: every site comes from the same amenity tier (the same
 *   "has a town nearby" / "has food nearby" tier chooseLegacySpawnPlacement's
 *   own search order relaxes through), so no site starts materially richer or
 *   poorer than another purely by luck of the search order.
 * - Even spread: sites are chosen by greedy farthest-point sampling (each
 *   next site maximizes its minimum Chebyshev distance to sites already
 *   chosen), so the roster doesn't cluster in one region and starve another.
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
    const originRegion = landRegionByTileKey.get(simulationTileKey(ax, ay));
    return originRegion === undefined || landRegionByTileKey.get(simulationTileKey(bx, by)) === originRegion;
  };

  const townCoords = tileList.filter((tile) => tile.town).map((tile) => ({ x: tile.x, y: tile.y }));
  const foodCoords = tileList.filter((tile) => tile.resource === "FARM" || tile.resource === "FISH").map((tile) => ({ x: tile.x, y: tile.y }));
  const isNearTown = (x: number, y: number): boolean =>
    townCoords.some((town) => manhattanDistance(x, y, town.x, town.y) <= FAIR_SPAWN_SITE_AMENITY_RADIUS && sameLandRegion(x, y, town.x, town.y));
  const isNearFood = (x: number, y: number): boolean =>
    foodCoords.some((food) => manhattanDistance(x, y, food.x, food.y) <= FAIR_SPAWN_SITE_AMENITY_RADIUS && sameLandRegion(x, y, food.x, food.y));

  const baseCandidates = tileList.filter((tile) => {
    const tileKey = simulationTileKey(tile.x, tile.y);
    if (tile.terrain !== "LAND" || tile.ownerId || tile.town || tile.dockId) return false;
    return coastalLandKeys.size === 0 || coastalLandKeys.has(tileKey);
  });

  // Same relaxation order as LEGACY_SPAWN_SEARCH_ORDER's requirement tiers,
  // but applied to the whole candidate pool at once (rather than per-attempt)
  // so every site drawn from a given tier shares that tier's amenities —
  // that's what makes the roster "equal opportunity".
  const tiers: Array<(tile: DomainTileState) => boolean> = [
    (tile) => isNearTown(tile.x, tile.y) && isNearFood(tile.x, tile.y),
    (tile) => isNearTown(tile.x, tile.y),
    (tile) => isNearFood(tile.x, tile.y),
    () => true
  ];
  let pool: DomainTileState[] = [];
  for (const matchesTier of tiers) {
    pool = baseCandidates.filter(matchesTier);
    if (pool.length >= targetCount) break;
  }
  if (pool.length === 0) return [];

  // Greedy farthest-point sampling: start from the candidate closest to the
  // pool's centroid (not a map corner/edge tile) so the roster spreads
  // outward evenly in every direction instead of biasing away from one
  // corner, then repeatedly add whichever remaining candidate maximizes its
  // minimum distance to sites already chosen. Order-independent and
  // deterministic given the same pool (ties broken by lowest y, then x).
  const centroidX = pool.reduce((sum, tile) => sum + tile.x, 0) / pool.length;
  const centroidY = pool.reduce((sum, tile) => sum + tile.y, 0) / pool.length;
  const sorted = [...pool].sort((left, right) => left.y - right.y || left.x - right.x);
  let seed = sorted[0]!;
  let seedDistance = chebyshevDistance(seed.x, seed.y, centroidX, centroidY);
  for (const tile of sorted) {
    const distance = chebyshevDistance(tile.x, tile.y, centroidX, centroidY);
    if (distance < seedDistance) {
      seedDistance = distance;
      seed = tile;
    }
  }
  const chosen: FairSpawnSite[] = [{ x: seed.x, y: seed.y }];
  const remaining = sorted.filter((tile) => tile !== seed);
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
  return chosen;
};

export const chooseLegacySpawnPlacement = (input: LegacySpawnPlacementInput): { x: number; y: number } | undefined => {
  const tileList = [...input.tiles];
  if (tileList.length === 0) return undefined;

  const blocked = input.blockedTileKeys ?? new Set<string>();
  const coastalLandKeys = input.coastalLandKeys ?? computeCoastalLandKeys(tileList);
  const spawnCandidates = tileList.filter((tile) => {
    const tileKey = simulationTileKey(tile.x, tile.y);
    if (tile.terrain !== "LAND" || tile.ownerId || tile.town || tile.dockId || blocked.has(tileKey)) return false;
    if (coastalLandKeys.size > 0 && !coastalLandKeys.has(tileKey)) return false;
    return true;
  });
  if (spawnCandidates.length === 0) return undefined;

  let landRegionByTileKeyCache: Map<string, number> | undefined;
  const landRegionByTileKey = (): Map<string, number> => {
    if (!landRegionByTileKeyCache) landRegionByTileKeyCache = computeLandRegions(tileList);
    return landRegionByTileKeyCache;
  };
  // A candidate is only "near" a food/town tile if it's within radius AND on
  // the same land region — otherwise a resource across water satisfies the
  // Manhattan-distance check and a spawn gets accepted next to food the
  // player can't actually reach without crossing water.
  const sameLandRegion = (ax: number, ay: number, bx: number, by: number): boolean => {
    const regions = landRegionByTileKey();
    const originRegion = regions.get(simulationTileKey(ax, ay));
    return originRegion === undefined || regions.get(simulationTileKey(bx, by)) === originRegion;
  };
  const hasNearbyTown =
    input.hasNearbyTown ??
    ((): ((x: number, y: number, radius: number) => boolean) => {
      const townCoords = tileList.filter((tile) => tile.town).map((tile) => ({ x: tile.x, y: tile.y }));
      return (x, y, radius) => townCoords.some((town) => manhattanDistance(x, y, town.x, town.y) <= radius && sameLandRegion(x, y, town.x, town.y));
    })();
  const hasNearbyFood =
    input.hasNearbyFood ??
    ((): ((x: number, y: number, radius: number) => boolean) => {
      const foodCoords = tileList.filter((tile) => tile.resource === "FARM" || tile.resource === "FISH").map((tile) => ({ x: tile.x, y: tile.y }));
      return (x, y, radius) => foodCoords.some((food) => manhattanDistance(x, y, food.x, food.y) <= radius && sameLandRegion(x, y, food.x, food.y));
    })();
  const hasNearbySpawn =
    input.hasNearbySettled ??
    ((): ((x: number, y: number, radius: number) => boolean) => {
      const settledCoords = tileList
        .filter((tile) => tile.ownerId && tile.ownershipState && tile.ownershipState !== "BARBARIAN")
        .map((tile) => ({ x: tile.x, y: tile.y }));
      return (x, y, radius) => settledCoords.some((spawn) => chebyshevDistance(x, y, spawn.x, spawn.y) < radius);
    })();

  const canSpawnAt = (x: number, y: number, requirements: SpawnRequirements): boolean => {
    if (requirements.minSpawnDistance > 0 && hasNearbySpawn(x, y, requirements.minSpawnDistance)) return false;
    if (requirements.needsTown && !hasNearbyTown(x, y, 10)) return false;
    if (requirements.needsFood && !hasNearbyFood(x, y, 10)) return false;
    return true;
  };

  if (input.rallyAnchor) {
    const nearbyCandidates = spawnCandidates
      .filter((tile) => chebyshevDistance(tile.x, tile.y, input.rallyAnchor!.x, input.rallyAnchor!.y) <= RALLY_SPAWN_RADIUS)
      .sort((left, right) => {
        const leftDistance = chebyshevDistance(left.x, left.y, input.rallyAnchor!.x, input.rallyAnchor!.y);
        const rightDistance = chebyshevDistance(right.x, right.y, input.rallyAnchor!.x, input.rallyAnchor!.y);
        return (leftDistance - rightDistance) || (left.y - right.y) || (left.x - right.x);
      });
    const rallySpawn = nearbyCandidates[hashString(input.playerId) % Math.max(1, Math.min(nearbyCandidates.length, 8))];
    if (rallySpawn) return { x: rallySpawn.x, y: rallySpawn.y };
  }

  let seed = hashString(input.playerId);
  for (const pass of LEGACY_SPAWN_SEARCH_ORDER) {
    for (let attempt = 0; attempt < pass.tries; attempt += 1) {
      seed = nextSeed(seed + attempt);
      const candidate = spawnCandidates[seed % spawnCandidates.length];
      if (!candidate) continue;
      if (canSpawnAt(candidate.x, candidate.y, pass.requirements)) return { x: candidate.x, y: candidate.y };
    }
  }

  return undefined;
};
