import type { ClusterDefinition, NaturalWonderSiteState, ShardSiteState, TownDefinition, WatchtowerSiteState } from "@border-empires/game-domain";
import type { Tile, TileKey } from "@border-empires/shared";

/**
 * Initial-roster player spawn placement, shared by the sync
 * (season-seed-world.ts) and cooperative-yield async (season-seed-world-async.ts)
 * world builders — both ran an identical inline copy of this (previously
 * ~85 lines each), so it's extracted once here rather than duplicated.
 * Keep both call sites in sync when editing this file.
 */
export type SeasonSeedPlayerSpawnDeps = {
  WORLD_WIDTH: number;
  WORLD_HEIGHT: number;
  worldSeed: number;
  terrainAt: (x: number, y: number) => Tile["terrain"];
  wrapX: (value: number, size: number) => number;
  wrapY: (value: number, size: number) => number;
  key: (x: number, y: number) => TileKey;
  chebyshevDistance: (ax: number, ay: number, bx: number, by: number) => number;
  seeded01: (a: number, b: number, c: number) => number;
  townsByTile: Map<TileKey, TownDefinition>;
  docksByTile: ReadonlyMap<TileKey, unknown>;
  ownership: Map<TileKey, string>;
  clusterByTile: ReadonlyMap<TileKey, string>;
  clustersById: ReadonlyMap<string, ClusterDefinition>;
  shardSitesByTile: Map<TileKey, ShardSiteState>;
  watchtowersByTile: Map<TileKey, WatchtowerSiteState>;
  naturalWondersByTile: Map<TileKey, NaturalWonderSiteState>;
  createSettlementTown: (tk: TileKey, townType: "MARKET" | "FARMING") => TownDefinition;
  townTypeAt: (x: number, y: number) => "MARKET" | "FARMING";
  minTownSpacing: () => number;
};

export type SeasonSeedSpawnPosition = { playerId: string; x: number; y: number; isAi: boolean };

export const createSeasonSeedPlayerSpawner = (
  deps: SeasonSeedPlayerSpawnDeps
): { spawnPositions: SeasonSeedSpawnPosition[]; spawnPlayerAt: (playerId: string, isAi: boolean, playerIndex: number) => void } => {
  const { WORLD_WIDTH, WORLD_HEIGHT, worldSeed, terrainAt, wrapX, wrapY, key, chebyshevDistance, seeded01, townsByTile, docksByTile, ownership, clusterByTile, clustersById, shardSitesByTile, watchtowersByTile, naturalWondersByTile, createSettlementTown, townTypeAt, minTownSpacing } = deps;

  const spawnPositions: SeasonSeedSpawnPosition[] = [];
  // A player's own settlement is planted directly on their spawn tile below,
  // so an existing town counted as "nearby" here must sit at least the same
  // minimum spacing away that towns keep from each other everywhere else —
  // otherwise the amenity check was satisfied by a town landing right next
  // to (or overlapping the neighborhood of) the spawn's own new settlement,
  // reading as two towns crammed together at every spawn. One town within
  // reach is still enough; it just can't be immediately adjacent.
  const hasNearbyTown = (x: number, y: number, radius: number): boolean => {
    const minDistance = minTownSpacing();
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const distance = Math.abs(dx) + Math.abs(dy);
        if (distance > radius || distance < minDistance) continue;
        if (townsByTile.has(key(wrapX(x + dx, WORLD_WIDTH), wrapY(y + dy, WORLD_HEIGHT)))) return true;
      }
    }
    return false;
  };
  const hasNearbyFood = (x: number, y: number, radius: number): boolean => {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.abs(dx) + Math.abs(dy) > radius) continue;
        const clusterId = clusterByTile.get(key(wrapX(x + dx, WORLD_WIDTH), wrapY(y + dy, WORLD_HEIGHT)));
        const cluster = clusterId ? clustersById.get(clusterId) : undefined;
        if (!cluster) continue;
        if (cluster.resourceType === "FARM" || cluster.resourceType === "FISH") return true;
      }
    }
    return false;
  };
  const hasNearbySpawn = (x: number, y: number, radius: number): boolean =>
    spawnPositions.some((spawn) => chebyshevDistance(x, y, spawn.x, spawn.y) < radius);
  const canSpawnAt = (x: number, y: number, requirements: { needsTown: boolean; needsFood: boolean; minSpawnDistance: number }): boolean => {
    const tk = key(x, y);
    if (terrainAt(x, y) !== "LAND") return false;
    if (townsByTile.has(tk) || docksByTile.has(tk) || ownership.has(tk)) return false;
    if (requirements.minSpawnDistance > 0 && hasNearbySpawn(x, y, requirements.minSpawnDistance)) return false;
    if (requirements.needsTown && !hasNearbyTown(x, y, 10)) return false;
    if (requirements.needsFood && !hasNearbyFood(x, y, 10)) return false;
    return true;
  };
  const spawnSearchOrder = [
    { tries: 8_000, requirements: { needsTown: true, needsFood: true, minSpawnDistance: 50 } },
    { tries: 5_000, requirements: { needsTown: true, needsFood: false, minSpawnDistance: 50 } },
    { tries: 5_000, requirements: { needsTown: false, needsFood: true, minSpawnDistance: 50 } },
    { tries: 5_000, requirements: { needsTown: false, needsFood: false, minSpawnDistance: 50 } },
    { tries: WORLD_WIDTH * WORLD_HEIGHT, requirements: { needsTown: false, needsFood: false, minSpawnDistance: 35 } }
  ] as const;
  const spawnPlayerAt = (playerId: string, isAi: boolean, playerIndex: number): void => {
    let spawn: { x: number; y: number } | undefined;
    for (const [passIndex, pass] of spawnSearchOrder.entries()) {
      if (pass.tries === WORLD_WIDTH * WORLD_HEIGHT) {
        for (let y = 0; y < WORLD_HEIGHT && !spawn; y += 1) {
          for (let x = 0; x < WORLD_WIDTH; x += 1) {
            if (!canSpawnAt(x, y, pass.requirements)) continue;
            spawn = { x, y };
            break;
          }
        }
      } else {
        for (let attempt = 0; attempt < pass.tries; attempt += 1) {
          const x = Math.floor(seeded01((playerIndex + 1) * 101 + attempt * 17, (passIndex + 1) * 43 + playerIndex * 11, worldSeed + 700 + passIndex) * WORLD_WIDTH);
          const y = Math.floor(seeded01((playerIndex + 1) * 131 + attempt * 19, (passIndex + 1) * 59 + playerIndex * 13, worldSeed + 900 + passIndex) * WORLD_HEIGHT);
          if (!canSpawnAt(x, y, pass.requirements)) continue;
          spawn = { x, y };
          break;
        }
      }
      if (spawn) break;
    }
    if (!spawn) {
      throw new Error(`failed to place season seed spawn for ${playerId}`);
    }
    const tk = key(spawn.x, spawn.y);
    ownership.set(tk, playerId);
    shardSitesByTile.delete(tk);
    watchtowersByTile.delete(tk);
    naturalWondersByTile.delete(tk);
    townsByTile.set(tk, createSettlementTown(tk, townTypeAt(spawn.x, spawn.y)));
    spawnPositions.push({ playerId, x: spawn.x, y: spawn.y, isAi });
  };

  return { spawnPositions, spawnPlayerAt };
};
