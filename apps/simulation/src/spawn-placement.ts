import type { DomainTileState } from "@border-empires/game-domain";

import { simulationTileKey } from "./seed-state.js";

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
};

const LEGACY_SPAWN_SEARCH_ORDER: readonly SpawnSearchPass[] = [
  { tries: 8_000, requirements: { needsTown: true, needsFood: true, minSpawnDistance: 50 } },
  { tries: 5_000, requirements: { needsTown: true, needsFood: false, minSpawnDistance: 50 } },
  { tries: 5_000, requirements: { needsTown: false, needsFood: true, minSpawnDistance: 50 } },
  { tries: 5_000, requirements: { needsTown: false, needsFood: false, minSpawnDistance: 50 } },
  { tries: -1, requirements: { needsTown: false, needsFood: false, minSpawnDistance: 35 } }
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

export const chooseLegacySpawnPlacement = (input: LegacySpawnPlacementInput): { x: number; y: number } | undefined => {
  const tileList = [...input.tiles];
  if (tileList.length === 0) return undefined;

  const blocked = input.blockedTileKeys ?? new Set<string>();
  const settledCoords = tileList
    .filter((tile) => tile.ownerId && tile.ownershipState === "SETTLED")
    .map((tile) => ({ x: tile.x, y: tile.y }));
  const townCoords = tileList.filter((tile) => tile.town).map((tile) => ({ x: tile.x, y: tile.y }));
  const foodCoords = tileList
    .filter((tile) => tile.resource === "FARM" || tile.resource === "FISH")
    .map((tile) => ({ x: tile.x, y: tile.y }));
  const spawnCandidates = tileList
    .filter((tile) => {
      const tileKey = simulationTileKey(tile.x, tile.y);
      return tile.terrain === "LAND" && !tile.ownerId && !tile.town && !tile.dockId && !blocked.has(tileKey);
    })
    .sort((left, right) => (left.y - right.y) || (left.x - right.x));
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

  let seed = hashString(input.playerId);
  for (const pass of LEGACY_SPAWN_SEARCH_ORDER) {
    if (pass.tries < 0) {
      const fallback = spawnCandidates.find((tile) => canSpawnAt(tile.x, tile.y, pass.requirements));
      if (fallback) return { x: fallback.x, y: fallback.y };
      continue;
    }
    for (let attempt = 0; attempt < pass.tries; attempt += 1) {
      seed = nextSeed(seed + attempt);
      const candidate = spawnCandidates[seed % spawnCandidates.length];
      if (!candidate) continue;
      if (canSpawnAt(candidate.x, candidate.y, pass.requirements)) return { x: candidate.x, y: candidate.y };
    }
  }

  return spawnCandidates[0] ? { x: spawnCandidates[0].x, y: spawnCandidates[0].y } : undefined;
};
