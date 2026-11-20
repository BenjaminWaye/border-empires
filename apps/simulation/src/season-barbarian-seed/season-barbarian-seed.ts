import { WORLD_HEIGHT, WORLD_WIDTH, type TileKey } from "@border-empires/shared";
import { key, parseKey } from "@border-empires/game-domain";

// Barbarians start small and are separately capped in growth (see
// MAX_BARBARIAN_TILES in ai/system-job-barbarian-planner.ts). An uncapped
// barbarian on staging grew to 941 tiles, and the sim main thread re-exports
// the barbarian's full planner view (O(territory)) on every one of those
// tiles' ownership changes; with the barbarian constantly eaten by AI that
// re-export churned continuously and became the dominant sim-thread cost,
// starving gateway logins on the shared vCPU. Keep the start small.
export const BARBARIAN_SEED_TARGET = 30;
export const BARBARIAN_SEED_MIN_DISTANCE_FROM_SPAWN = 12;
export const BARBARIAN_SEED_MIN_SEPARATION = 4;
const BARBARIAN_SEED_MAX_TRIES = BARBARIAN_SEED_TARGET * 200;
// One Planetary Defense patrol is posted this far (wrapped Chebyshev) from
// every predetermined starting site, on top of the random scatter above.
export const BARBARIAN_START_SITE_PATROL_DISTANCE = 20;
// When the whole ring at that distance is unusable (sea, towns, another
// site's keep-out), try the nearest rings out to this many tiles either side.
const BARBARIAN_START_SITE_PATROL_SLACK = 3;

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
  worldSeed: number;
  terrainAt: (x: number, y: number) => string;
  /** Deterministic [0,1) sampler; same signature as terrainRuntime.seeded01. */
  seeded01: (a: number, b: number, seed: number) => number;
  /** The worldgen roster of predetermined starting sites; each gets one patrol BARBARIAN_START_SITE_PATROL_DISTANCE out. */
  startSites?: ReadonlyArray<{ x: number; y: number }>;
};

const wrap = (value: number, size: number): number => ((value % size) + size) % size;

/** The tiles at exactly `radius` (Chebyshev) around (cx, cy), in a fixed clockwise order. */
const ringTiles = (cx: number, cy: number, radius: number): Array<{ x: number; y: number }> => {
  const out: Array<{ x: number; y: number }> = [];
  for (let d = -radius; d < radius; d += 1) out.push({ x: cx + d, y: cy - radius });
  for (let d = -radius; d < radius; d += 1) out.push({ x: cx + radius, y: cy + d });
  for (let d = radius; d > -radius; d -= 1) out.push({ x: cx + d, y: cy + radius });
  for (let d = radius; d > -radius; d -= 1) out.push({ x: cx - radius, y: cy + d });
  return out.map((tile) => ({ x: wrap(tile.x, WORLD_WIDTH), y: wrap(tile.y, WORLD_HEIGHT) }));
};

/** Rings to try, nearest the target distance first: 20, 21, 19, 22, 18, ... */
const patrolRadii = (): number[] => {
  const radii = [BARBARIAN_START_SITE_PATROL_DISTANCE];
  for (let step = 1; step <= BARBARIAN_START_SITE_PATROL_SLACK; step += 1) {
    radii.push(BARBARIAN_START_SITE_PATROL_DISTANCE + step, BARBARIAN_START_SITE_PATROL_DISTANCE - step);
  }
  return radii;
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
  const canSeedAt = (x: number, y: number): boolean => {
    const tk = key(x, y);
    return (
      input.terrainAt(x, y) === "LAND" &&
      !input.ownership.has(tk) &&
      !input.townsByTile.has(tk) &&
      !input.docksByTile.has(tk) &&
      isFarFromAnyPlayerSpawn(x, y) &&
      isFarFromOtherBarbs(x, y)
    );
  };
  const seed = (x: number, y: number): void => {
    const tk = key(x, y);
    input.ownership.set(tk, "barbarian-1");
    barbarianTileKeys.add(tk);
  };
  // Start-site patrols go first so the random scatter can't crowd them out.
  // Each must also keep BARBARIAN_SEED_MIN_DISTANCE_FROM_SPAWN from every
  // roster site, so it never sits on top of another (possibly still
  // unclaimed) start; live spawn placement avoids barbarians near a site.
  const startSites = input.startSites ?? [];
  const isFarFromAnyStartSite = (x: number, y: number): boolean =>
    startSites.every((site) => wrappedChebyshev(x, y, site.x, site.y) >= BARBARIAN_SEED_MIN_DISTANCE_FROM_SPAWN);
  startSites.forEach((site, siteIndex) => {
    for (const radius of patrolRadii()) {
      const ring = ringTiles(site.x, site.y, radius);
      const offset = Math.floor(input.seeded01(site.x * 31 + siteIndex, site.y * 37 + radius, input.worldSeed + 50_003) * ring.length);
      for (let index = 0; index < ring.length; index += 1) {
        const tile = ring[(offset + index) % ring.length]!;
        if (!canSeedAt(tile.x, tile.y) || !isFarFromAnyStartSite(tile.x, tile.y)) continue;
        seed(tile.x, tile.y);
        return;
      }
    }
  });
  const startSitePatrolCount = barbarianTileKeys.size;
  for (let attempt = 0; attempt < BARBARIAN_SEED_MAX_TRIES && barbarianTileKeys.size - startSitePatrolCount < BARBARIAN_SEED_TARGET; attempt += 1) {
    const x = Math.floor(input.seeded01(attempt * 73 + 11, attempt * 131 + 17, input.worldSeed + 50_001) * WORLD_WIDTH);
    const y = Math.floor(input.seeded01(attempt * 89 + 19, attempt * 113 + 23, input.worldSeed + 50_002) * WORLD_HEIGHT);
    if (canSeedAt(x, y)) seed(x, y);
  }
  return barbarianTileKeys;
};
