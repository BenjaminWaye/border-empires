// Shared by season-seed-world.ts and season-seed-world-async.ts so both
// generation paths apply the refinery-reach worldgen guarantee identically
// (docs/territory-development-plan.md, Phase 2 rule 9). Runs once every
// worldgen town is placed (after normalizeTownPlacements and the
// mountain-ring interior towns), before watchtowers, waystations, wonders and
// spawn sites, which all avoid cluster tiles and so see the final deposits.
// Settlement towns created later for season-start or live-join players are
// not covered: they are placed after worldgen and carry no guarantee.
import { WORLD_HEIGHT, WORLD_WIDTH, isHillsTileAt, terrainAt, type TileKey, type WorldStyle } from "@border-empires/shared";
import { fillMountainRingInteriors, type RingInteriorFillDeps } from "./season-seed-world-ring-interiors.js";
import {
  ensureStrategicClustersInReach,
  key,
  parseKey,
  type ClusterDefinition,
  type StrategicReachHabitat,
  type StrategicReachResult
} from "@border-empires/game-domain";

export interface SeasonStrategicReachDeps {
  clusterByTile: Map<TileKey, string>;
  clustersById: Map<string, ClusterDefinition>;
  townsByTile: ReadonlyMap<TileKey, unknown>;
  docksByTile: ReadonlyMap<TileKey, unknown>;
  habitat: StrategicReachHabitat;
}

export const applyStrategicReachGuarantee = (worldSeed: number, deps: SeasonStrategicReachDeps): StrategicReachResult => {
  const result = ensureStrategicClustersInReach(worldSeed, {
    WORLD_WIDTH,
    WORLD_HEIGHT,
    terrainAt,
    key,
    parseKey,
    isHillsTileAt,
    ...deps
  });
  if (result.failed > 0) {
    console.warn(JSON.stringify({ event: "worldgen_strategic_reach_unplaced", worldSeed, failed: result.failed }));
  }
  return result;
};

/** Upper bound on ring-fill / reach rounds; a round only repeats when the previous fill added a town. */
const MAX_SETTLE_ROUNDS = 4;

/**
 * Mountain-ring interiors must each hold a town, cluster or dock, and the
 * reach guarantee may move a cluster out of an interior that it was the only
 * content of. Alternate the two passes until the ring fill adds no town: the
 * fill only ever adds towns (which can only add reach), and the next reach
 * pass moves any cluster a new town's support rings now overlap.
 */
export const settleRingInteriorsAndStrategicReach = (
  worldSeed: number,
  style: WorldStyle,
  fillDeps: RingInteriorFillDeps,
  reachDeps: SeasonStrategicReachDeps
): void => {
  fillMountainRingInteriors(worldSeed, style, fillDeps);
  for (let round = 0; round < MAX_SETTLE_ROUNDS; round += 1) {
    applyStrategicReachGuarantee(worldSeed, reachDeps);
    if (fillMountainRingInteriors(worldSeed, style, fillDeps) === 0) return;
  }
  console.warn(JSON.stringify({ event: "worldgen_ring_reach_unsettled", worldSeed }));
};
