import { WORLD_HEIGHT, WORLD_WIDTH, type TileKey } from "@border-empires/shared";
import { key, parseKey } from "@border-empires/game-domain";

// Barbarians start small and are separately capped in growth (see
// MAX_BARBARIAN_TILES in ai/system-job-barbarian-planner.ts). An uncapped
// barbarian on staging grew to 941 tiles, and the sim main thread re-exports
// the barbarian's full planner view (O(territory)) on every one of those
// tiles' ownership changes; with the barbarian constantly eaten by AI that
// re-export churned continuously and became the dominant sim-thread cost,
// starving gateway logins on the shared vCPU. Keep the start small.
// Start-site patrols (below) count against this budget first; the random
// scatter only tops up to it, so a full 50-site roster seeds no random tiles.
export const BARBARIAN_SEED_TARGET = 30;
export const BARBARIAN_SEED_MIN_DISTANCE_FROM_SPAWN = 12;
export const BARBARIAN_SEED_MIN_SEPARATION = 4;
const BARBARIAN_SEED_MAX_TRIES = BARBARIAN_SEED_TARGET * 200;
// One Planetary Defense patrol is posted this far (wrapped Chebyshev) from
// every predetermined starting site, on top of the random scatter above.
export const BARBARIAN_START_SITE_PATROL_DISTANCE = 20;
// When the ring at that distance has no usable tile (sea, towns, another
// site's keep-out), the nearest usable ring is used instead, in three tiers so
// every map style gets a patrol at (almost) every site:
//  1. 12-35 tiles out, at least 12 from every roster site (the normal case);
//  2. crowded island clusters: 10-35 out, at least 10 from every site;
//  3. remote islands with no land that near: 36-60 out, at least 12 from every site;
//  4. remote and crowded: 36-60 out, at least 10 from every site.
// Never closer than 10: live spawning rejects a roster site with settled land,
// barbarians included, within 10 tiles (FAIR_SPAWN_SITE_MIN_SETTLED_DISTANCE
// in runtime-respawn-helpers.ts), and a starter route reaches at most 8 steps.
export const BARBARIAN_START_SITE_PATROL_MIN_DISTANCE = 10;
export const BARBARIAN_START_SITE_PATROL_MAX_DISTANCE = 60;
const PATROL_TIERS: ReadonlyArray<{ minRadius: number; maxRadius: number; siteKeepOut: number }> = [
  { minRadius: BARBARIAN_SEED_MIN_DISTANCE_FROM_SPAWN, maxRadius: 35, siteKeepOut: BARBARIAN_SEED_MIN_DISTANCE_FROM_SPAWN },
  { minRadius: BARBARIAN_START_SITE_PATROL_MIN_DISTANCE, maxRadius: 35, siteKeepOut: BARBARIAN_START_SITE_PATROL_MIN_DISTANCE },
  { minRadius: 36, maxRadius: BARBARIAN_START_SITE_PATROL_MAX_DISTANCE, siteKeepOut: BARBARIAN_SEED_MIN_DISTANCE_FROM_SPAWN },
  { minRadius: 36, maxRadius: BARBARIAN_START_SITE_PATROL_MAX_DISTANCE, siteKeepOut: BARBARIAN_START_SITE_PATROL_MIN_DISTANCE }
];
// A tile on the site's own landmass (reachable on foot) wins over one on other
// land (reached by dock) unless it is this many more rings away from the
// target distance.
const OWN_LANDMASS_RING_SLACK = 5;

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
  /** The worldgen roster of predetermined starting sites; each gets one patrol BARBARIAN_START_SITE_PATROL_DISTANCE out. Required so a worldgen path can't silently drop the patrols. */
  startSites: ReadonlyArray<{ x: number; y: number }>;
  /** Connected-landmass id of a LAND tile (buildIslandMap); a patrol prefers the site's own landmass so the player can walk to it. */
  landmassAt: (x: number, y: number) => number | undefined;
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

/** Radii in [min, max], nearest the target distance first: 20, 21, 19, 22, 18, ... */
const radiiNearestTarget = (minRadius: number, maxRadius: number): number[] => {
  const radii: number[] = [];
  for (let step = 0; step <= BARBARIAN_START_SITE_PATROL_MAX_DISTANCE; step += 1) {
    const out = BARBARIAN_START_SITE_PATROL_DISTANCE + step;
    const inward = BARBARIAN_START_SITE_PATROL_DISTANCE - step;
    if (out >= minRadius && out <= maxRadius) radii.push(out);
    if (step > 0 && inward >= minRadius && inward <= maxRadius) radii.push(inward);
  }
  return radii;
};
const PATROL_TIER_RADII = PATROL_TIERS.map((tier) => ({ ...tier, radii: radiiNearestTarget(tier.minRadius, tier.maxRadius) }));

/**
 * Scatter the barbarian's starting tiles, mutating `ownership` in place and
 * returning the placed tile keys. Shared verbatim by the sync
 * (createSeasonSeedWorld) and async (createSeasonSeedWorldAsync) worldgen
 * paths — previously duplicated, which let a fix to one copy silently no-op
 * because prod uses the other.
 */
export const seedBarbarianTiles = (input: BarbarianSeedInput): Set<TileKey> => {
  const barbarianTileKeys = new Set<TileKey>();
  const isFarFromAnyPlayerSpawn = (x: number, y: number, keepOut = BARBARIAN_SEED_MIN_DISTANCE_FROM_SPAWN): boolean =>
    input.spawnPositions.every((spawn) => wrappedChebyshev(x, y, spawn.x, spawn.y) >= keepOut);
  const isFarFromOtherBarbs = (x: number, y: number): boolean => {
    for (const existingKey of barbarianTileKeys) {
      const [bx, by] = parseKey(existingKey);
      if (wrappedChebyshev(x, y, bx, by) < BARBARIAN_SEED_MIN_SEPARATION) return false;
    }
    return true;
  };
  const canSeedAt = (x: number, y: number, spawnKeepOut = BARBARIAN_SEED_MIN_DISTANCE_FROM_SPAWN): boolean => {
    const tk = key(x, y);
    return (
      input.terrainAt(x, y) === "LAND" &&
      !input.ownership.has(tk) &&
      !input.townsByTile.has(tk) &&
      !input.docksByTile.has(tk) &&
      isFarFromAnyPlayerSpawn(x, y, spawnKeepOut) &&
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
  const startSites = input.startSites;
  const isFarFromAnyStartSite = (x: number, y: number, keepOut = BARBARIAN_SEED_MIN_DISTANCE_FROM_SPAWN): boolean =>
    startSites.every((site) => wrappedChebyshev(x, y, site.x, site.y) >= keepOut);
  // The usable tile nearest BARBARIAN_START_SITE_PATROL_DISTANCE out, trying
  // the tiers in order. A tile on the site's own landmass wins over a nearer
  // one on other land while it is within OWN_LANDMASS_RING_SLACK more rings of
  // the target distance.
  const patrolTileFor = (site: { x: number; y: number }, siteIndex: number): { x: number; y: number } | undefined => {
    const siteLandmass = input.landmassAt(site.x, site.y);
    for (const tier of PATROL_TIER_RADII) {
      let offLandmass: { x: number; y: number; ringsFromTarget: number } | undefined;
      for (const radius of tier.radii) {
        const ringsFromTarget = Math.abs(radius - BARBARIAN_START_SITE_PATROL_DISTANCE);
        if (offLandmass && ringsFromTarget > offLandmass.ringsFromTarget + OWN_LANDMASS_RING_SLACK) break;
        const ring = ringTiles(site.x, site.y, radius);
        const offset = Math.floor(input.seeded01(site.x * 31 + siteIndex, site.y * 37 + radius, input.worldSeed + 50_003) * ring.length);
        for (let index = 0; index < ring.length; index += 1) {
          const tile = ring[(offset + index) % ring.length]!;
          if (!canSeedAt(tile.x, tile.y, tier.siteKeepOut) || !isFarFromAnyStartSite(tile.x, tile.y, tier.siteKeepOut)) continue;
          if (siteLandmass !== undefined && input.landmassAt(tile.x, tile.y) === siteLandmass) return tile;
          offLandmass ??= { ...tile, ringsFromTarget };
        }
      }
      if (offLandmass) return { x: offLandmass.x, y: offLandmass.y };
    }
    return undefined;
  };
  startSites.forEach((site, siteIndex) => {
    const tile = patrolTileFor(site, siteIndex);
    if (tile) seed(tile.x, tile.y);
  });
  for (let attempt = 0; attempt < BARBARIAN_SEED_MAX_TRIES && barbarianTileKeys.size < BARBARIAN_SEED_TARGET; attempt += 1) {
    const x = Math.floor(input.seeded01(attempt * 73 + 11, attempt * 131 + 17, input.worldSeed + 50_001) * WORLD_WIDTH);
    const y = Math.floor(input.seeded01(attempt * 89 + 19, attempt * 113 + 23, input.worldSeed + 50_002) * WORLD_HEIGHT);
    if (canSeedAt(x, y) && isFarFromAnyStartSite(x, y)) seed(x, y);
  }
  return barbarianTileKeys;
};
