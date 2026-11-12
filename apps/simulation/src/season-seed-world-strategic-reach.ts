// Shared by season-seed-world.ts and season-seed-world-async.ts so both
// generation paths apply the refinery-reach worldgen guarantee identically
// (docs/territory-development-plan.md, Phase 2 rule 9). Runs once every
// worldgen town is placed (after normalizeTownPlacements and the
// mountain-ring interior towns), before watchtowers, waystations, wonders and
// spawn sites, which all avoid cluster tiles and so see the final deposits.
// Settlement towns created later for season-start or live-join players are
// not covered: they are placed after worldgen and carry no guarantee.
import { WORLD_HEIGHT, WORLD_WIDTH, isHillsTileAt, terrainAt, type TileKey } from "@border-empires/shared";
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
