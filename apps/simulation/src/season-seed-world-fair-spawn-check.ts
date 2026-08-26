import type { ClusterDefinition } from "@border-empires/game-domain";
import type { DomainTileState } from "@border-empires/game-domain";
import type { Tile, TileKey } from "@border-empires/shared";
import { computeFairSpawnSites } from "./spawn-placement/spawn-placement.js";

// Kept in sync with FAIR_SPAWN_SITE_TARGET_COUNT in spawn-placement.ts
// (not exported from there, since that default is an implementation detail
// of computeFairSpawnSites — this is worldgen's own acceptance threshold).
export const FAIR_SPAWN_SITE_WORLDGEN_MINIMUM = 50;

export type FairSpawnWorldgenCheckDeps = {
  WORLD_WIDTH: number;
  WORLD_HEIGHT: number;
  terrainAt: (x: number, y: number) => Tile["terrain"];
  key: (x: number, y: number) => TileKey;
  clusterByTile: ReadonlyMap<TileKey, string>;
  clustersById: ReadonlyMap<string, ClusterDefinition>;
  townsByTile: ReadonlyMap<TileKey, unknown>;
};

/**
 * Cheap lightweight tile snapshot (terrain / town-presence / food-presence
 * only — no ownership, docks, or wonders, none of which exist yet at this
 * point in worldgen) fed into computeFairSpawnSites purely to COUNT how many
 * equal-opportunity spawn sites this candidate map can offer. Lets the
 * existing seed-refinement retry loop in season-seed-world(.ts|-async.ts)
 * reject a map that can't secure FAIR_SPAWN_SITE_WORLDGEN_MINIMUM of them —
 * the same way it already rejects a bad island distribution or a bland map —
 * and regenerate with a new seed instead of shipping a world where some
 * future joiners are stuck on the random-search fallback from the start.
 */
export const countFairSpawnSitesForWorldgenCheck = (deps: FairSpawnWorldgenCheckDeps): number => {
  const tiles: DomainTileState[] = [];
  for (let y = 0; y < deps.WORLD_HEIGHT; y += 1) {
    for (let x = 0; x < deps.WORLD_WIDTH; x += 1) {
      const terrain = deps.terrainAt(x, y);
      if (terrain !== "LAND") {
        tiles.push({ x, y, terrain });
        continue;
      }
      const tileKeyValue = deps.key(x, y);
      const clusterId = deps.clusterByTile.get(tileKeyValue);
      const resourceType = clusterId ? deps.clustersById.get(clusterId)?.resourceType : undefined;
      tiles.push({
        x,
        y,
        terrain,
        ...(deps.townsByTile.has(tileKeyValue) ? { town: { type: "MARKET" as const, populationTier: "SETTLEMENT" as const } } : {}),
        ...(resourceType === "FARM" || resourceType === "FISH" ? { resource: resourceType } : {})
      });
    }
  }
  return computeFairSpawnSites(tiles, FAIR_SPAWN_SITE_WORLDGEN_MINIMUM).length;
};
