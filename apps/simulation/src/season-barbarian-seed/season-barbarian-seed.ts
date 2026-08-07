import { WORLD_HEIGHT, WORLD_WIDTH, type TileKey } from "@border-empires/shared";
import { key, parseKey } from "@border-empires/game-domain";

// Barbarians start small and are separately capped in growth (see
// MAX_BARBARIAN_TILES in ai/system-job-barbarian-planner.ts). An uncapped
// barbarian on staging grew to 941 tiles, and the sim main thread re-exports
// the barbarian's full planner view (O(territory)) on every one of those
// tiles' ownership changes; with the barbarian constantly eaten by AI that
// re-export churned continuously and became the dominant sim-thread cost,
// starving gateway logins on the shared vCPU. Keep the start small.
export const BARBARIAN_SEED_TARGET = 20;
export const BARBARIAN_SEED_MIN_DISTANCE_FROM_SPAWN = 12;
export const BARBARIAN_SEED_MIN_SEPARATION = 4;
const BARBARIAN_SEED_MAX_TRIES = BARBARIAN_SEED_TARGET * 200;

// Toroidal (wrapping) Chebyshev distance — inlined to keep this shared module
// dependency-free of season-seed-world.ts (which imports back from here).
const wrappedChebyshev = (ax: number, ay: number, bx: number, by: number): number => {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  return Math.max(Math.min(dx, WORLD_WIDTH - dx), Math.min(dy, WORLD_HEIGHT - dy));
};

export type BarbarianSeedInput = {
  spawnPositions: ReadonlyArray<{ x: number; y: number }>;
  ownership: Map<TileKey, string>;
  townsByTile: ReadonlyMap<TileKey, unknown>;
  docksByTile: ReadonlyMap<TileKey, unknown>;
  shardSitesByTile: ReadonlyMap<TileKey, unknown>;
  worldSeed: number;
  terrainAt: (x: number, y: number) => string;
  /** Deterministic [0,1) sampler; same signature as terrainRuntime.seeded01. */
  seeded01: (a: number, b: number, seed: number) => number;
};

/**
 * Scatter the barbarian's starting tiles, mutating `ownership` in place and
 * returning the placed tile keys. Shared verbatim by the sync
 * (createSeasonSeedWorld) and async (createSeasonSeedWorldAsync) worldgen
 * paths — previously duplicated, which let a fix to one copy silently no-op
 * because prod uses the other.
 */
export const seedBarbarianTiles = (input: BarbarianSeedInput): Set<TileKey> => {
  const barbarianTileKeys = new Set<TileKey>();
  const isFarFromAnyPlayerSpawn = (x: number, y: number): boolean =>
    input.spawnPositions.every(
      (spawn) => wrappedChebyshev(x, y, spawn.x, spawn.y) >= BARBARIAN_SEED_MIN_DISTANCE_FROM_SPAWN
    );
  const isFarFromOtherBarbs = (x: number, y: number): boolean => {
    for (const existingKey of barbarianTileKeys) {
      const [bx, by] = parseKey(existingKey);
      if (wrappedChebyshev(x, y, bx, by) < BARBARIAN_SEED_MIN_SEPARATION) return false;
    }
    return true;
  };
  for (let attempt = 0; attempt < BARBARIAN_SEED_MAX_TRIES && barbarianTileKeys.size < BARBARIAN_SEED_TARGET; attempt += 1) {
    const x = Math.floor(input.seeded01(attempt * 73 + 11, attempt * 131 + 17, input.worldSeed + 50_001) * WORLD_WIDTH);
    const y = Math.floor(input.seeded01(attempt * 89 + 19, attempt * 113 + 23, input.worldSeed + 50_002) * WORLD_HEIGHT);
    const tk = key(x, y);
    if (input.terrainAt(x, y) !== "LAND") continue;
    if (input.ownership.has(tk)) continue;
    if (input.townsByTile.has(tk)) continue;
    if (input.docksByTile.has(tk)) continue;
    if (input.shardSitesByTile.has(tk)) continue;
    if (!isFarFromAnyPlayerSpawn(x, y)) continue;
    if (!isFarFromOtherBarbs(x, y)) continue;
    input.ownership.set(tk, "barbarian-1");
    barbarianTileKeys.add(tk);
  }
  return barbarianTileKeys;
};
