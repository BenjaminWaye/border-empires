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
  // settledCoords/townCoords/foodCoords: precomputed equivalents of this
  // function's own settledCoords/townCoords/foodCoords derivation below.
  // Hot-path callers maintain these incrementally (settled/town) or cache
  // them once (food, resource-derived and as terrain-invariant as
  // coastalLandKeys) instead of filtering every tile on the map on every
  // placement call — see SpawnPlacementIndex. Falls back to deriving them
  // from `tiles` (unchanged behavior) when omitted.
  settledCoords?: Iterable<{ x: number; y: number }>;
  townCoords?: Iterable<{ x: number; y: number }>;
  foodCoords?: Iterable<{ x: number; y: number }>;
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

export const chooseLegacySpawnPlacement = (input: LegacySpawnPlacementInput): { x: number; y: number } | undefined => {
  const tileList = [...input.tiles];
  if (tileList.length === 0) return undefined;

  const blocked = input.blockedTileKeys ?? new Set<string>();
  const coastalLandKeys = input.coastalLandKeys ?? computeCoastalLandKeys(tileList);
  const settledCoords = input.settledCoords
    ? [...input.settledCoords]
    : tileList.filter((tile) => tile.ownerId && tile.ownershipState && tile.ownershipState !== "BARBARIAN").map((tile) => ({ x: tile.x, y: tile.y }));
  const townCoords = input.townCoords ? [...input.townCoords] : tileList.filter((tile) => tile.town).map((tile) => ({ x: tile.x, y: tile.y }));
  const foodCoords = input.foodCoords
    ? [...input.foodCoords]
    : tileList.filter((tile) => tile.resource === "FARM" || tile.resource === "FISH").map((tile) => ({ x: tile.x, y: tile.y }));
  const spawnCandidates = tileList.filter((tile) => {
    const tileKey = simulationTileKey(tile.x, tile.y);
    if (tile.terrain !== "LAND" || tile.ownerId || tile.town || tile.dockId || blocked.has(tileKey)) return false;
    if (coastalLandKeys.size > 0 && !coastalLandKeys.has(tileKey)) return false;
    return true;
  });
  if (spawnCandidates.length === 0) return undefined;

  const hasNearbyTown = (x: number, y: number, radius: number): boolean =>
    townCoords.some((town) => manhattanDistance(x, y, town.x, town.y) <= radius);
  const hasNearbyFood = (x: number, y: number, radius: number): boolean =>
    foodCoords.some((food) => manhattanDistance(x, y, food.x, food.y) <= radius);
  const hasNearbySpawn = (x: number, y: number, radius: number): boolean =>
    settledCoords.some((spawn) => chebyshevDistance(x, y, spawn.x, spawn.y) < radius);

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
