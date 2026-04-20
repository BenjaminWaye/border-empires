import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import {
  FRONTIER_CLAIM_MS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  grassShadeAt,
  landBiomeAt,
  regionTypeAt,
  setWorldSeed,
  terrainAt,
  wrapX,
  wrapY,
  type Player,
  type ResourceType,
  type Tile,
  type TileKey
} from "@border-empires/shared";

import {
  INITIAL_SHARD_SCATTER_COUNT,
  LARGE_ISLAND_MULTI_DOCK_TILE_THRESHOLD,
  PLAYER_MOUNTAIN_DENSITY_LIMIT,
  PLAYER_MOUNTAIN_DENSITY_RADIUS,
  POPULATION_MAX,
  POPULATION_TOWN_MIN,
  WORLD_TOWN_POPULATION_MIN,
  WORLD_TOWN_POPULATION_START_SPREAD,
  key,
  parseKey
} from "../../../packages/server/src/server-game-constants.js";
import type {
  ClusterDefinition,
  ShardSiteState,
  TerrainShapeState,
  TownDefinition
} from "../../../packages/server/src/server-shared-types.js";
import { createServerWorldgenClusters } from "../../../packages/server/src/server-worldgen-clusters.js";
import { createServerWorldgenDocks } from "../../../packages/server/src/server-worldgen-docks.js";
import { createServerWorldgenShards } from "../../../packages/server/src/server-worldgen-shards.js";
import { createServerWorldgenTerrain } from "../../../packages/server/src/server-worldgen-terrain.js";
import { createServerWorldgenTowns } from "../../../packages/server/src/server-worldgen-towns.js";
import { assignMissingTownNames } from "../../../packages/server/src/town-names.js";

export type GeneratedSeedPlayerSummary = {
  playerId: string;
  isAi: boolean;
  settledTiles: number;
  towns: number;
};

export type GeneratedSeasonSeedWorld = {
  players: Map<string, DomainPlayer>;
  tiles: Map<string, DomainTileState>;
  humanPlayers: number;
  aiPlayers: number;
  totalTiles: number;
  totalSettledTiles: number;
  totalTownTiles: number;
  perPlayer: GeneratedSeedPlayerSummary[];
};

const tileKey = (x: number, y: number): TileKey => `${x},${y}`;
const noOp = (): void => {};
const emptyResourceCounts = (): Record<ResourceType, number> => ({
  FARM: 0,
  FISH: 0,
  FUR: 0,
  WOOD: 0,
  IRON: 0,
  GEMS: 0,
  OIL: 0
});

const createSettlementTown = (tileKeyValue: TileKey, townType: "MARKET" | "FARMING"): TownDefinition => ({
  townId: `town-${tileKeyValue}`,
  tileKey: tileKeyValue,
  type: townType,
  population: 800,
  maxPopulation: POPULATION_MAX,
  connectedTownCount: 0,
  connectedTownBonus: 0,
  lastGrowthTickAt: 0,
  isSettlement: true
});

const townPopulationTier = (town: TownDefinition): "SETTLEMENT" | "TOWN" | "CITY" | "GREAT_CITY" | "METROPOLIS" => {
  if (town.isSettlement && town.population < 1_000) return "SETTLEMENT";
  if (town.population >= 5_000_000) return "METROPOLIS";
  if (town.population >= 1_000_000) return "GREAT_CITY";
  if (town.population >= 100_000) return "CITY";
  if (town.population >= POPULATION_TOWN_MIN) return "TOWN";
  return "SETTLEMENT";
};

const townStateFromDefinition = (town: TownDefinition): NonNullable<DomainTileState["town"]> => ({
  ...(town.name ? { name: town.name } : {}),
  type: town.type,
  populationTier: townPopulationTier(town),
  population: town.population,
  maxPopulation: town.maxPopulation,
  connectedTownCount: town.connectedTownCount,
  connectedTownBonus: town.connectedTownBonus
});

const tileTownViewFromDefinition = (town: TownDefinition): NonNullable<Tile["town"]> => ({
  ...(town.name ? { name: town.name } : {}),
  type: town.type,
  baseGoldPerMinute: 0,
  supportCurrent: 0,
  supportMax: 0,
  goldPerMinute: 0,
  cap: 0,
  isFed: false,
  population: town.population,
  maxPopulation: town.maxPopulation,
  populationTier: townPopulationTier(town),
  connectedTownCount: town.connectedTownCount,
  connectedTownBonus: town.connectedTownBonus,
  hasMarket: false,
  marketActive: false,
  hasGranary: false,
  granaryActive: false,
  hasBank: false,
  bankActive: false
});

const chebyshevDistance = (ax: number, ay: number, bx: number, by: number): number => {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  return Math.max(Math.min(dx, WORLD_WIDTH - dx), Math.min(dy, WORLD_HEIGHT - dy));
};

const createTerrainRuntime = (state: {
  activeSeason: { worldSeed: number };
  clusterByTile: Map<TileKey, string>;
  clustersById: Map<string, ClusterDefinition>;
  docksByTile: Map<TileKey, { dockId: string }>;
  fortsByTile: Map<TileKey, unknown>;
  observatoriesByTile: Map<TileKey, unknown>;
  ownership: Map<TileKey, string>;
  players: Map<string, Player>;
  siegeOutpostsByTile: Map<TileKey, unknown>;
  terrainShapesByTile: Map<TileKey, TerrainShapeState>;
  townsByTile: Map<TileKey, TownDefinition>;
  economicStructuresByTile: Map<TileKey, unknown>;
}) => {
  const playerTile = (x: number, y: number): Tile => {
    const tk = key(wrapX(x, WORLD_WIDTH), wrapY(y, WORLD_HEIGHT));
    const clusterId = state.clusterByTile.get(tk);
    const cluster = clusterId ? state.clustersById.get(clusterId) : undefined;
    const town = state.townsByTile.get(tk);
    const ownerId = state.ownership.get(tk);
    return {
      x: wrapX(x, WORLD_WIDTH),
      y: wrapY(y, WORLD_HEIGHT),
      terrain: terrainAt(x, y),
      ...(cluster?.resourceType ? { resource: cluster.resourceType } : {}),
      ...(town ? { town: tileTownViewFromDefinition(town) } : {}),
      ...(state.docksByTile.get(tk) ? { dockId: state.docksByTile.get(tk)!.dockId } : {}),
      ...(ownerId ? { ownerId, ownershipState: "SETTLED" as const } : {}),
      lastChangedAt: 0
    };
  };

  return createServerWorldgenTerrain({
    wrapX,
    wrapY,
    WORLD_WIDTH,
    WORLD_HEIGHT,
    terrainShapesByTile: state.terrainShapesByTile,
    key,
    terrainAt,
    PLAYER_MOUNTAIN_DENSITY_RADIUS,
    PLAYER_MOUNTAIN_DENSITY_LIMIT,
    players: state.players,
    parseKey,
    chebyshevDistance,
    regionTypeAt,
    clusterByTile: state.clusterByTile,
    townsByTile: state.townsByTile,
    docksByTile: state.docksByTile as Map<TileKey, never>,
    fortsByTile: state.fortsByTile as Map<TileKey, never>,
    siegeOutpostsByTile: state.siegeOutpostsByTile as Map<TileKey, never>,
    observatoriesByTile: state.observatoriesByTile as Map<TileKey, never>,
    economicStructuresByTile: state.economicStructuresByTile as Map<TileKey, never>,
    playerTile,
    AIRPORT_BOMBARD_MIN_FIELD_TILES: 2,
    AIRPORT_BOMBARD_MAX_FIELD_TILES: 4,
    activeSeason: state.activeSeason,
    clustersById: state.clustersById,
    ownership: state.ownership,
    getOrInitResourceCounts: emptyResourceCounts,
    rebuildEconomyIndexForPlayer: noOp,
    sendPlayerUpdate: noOp,
    sendVisibleTileDeltaAt: noOp,
    landBiomeAt,
    grassShadeAt,
    FRONTIER_CLAIM_MS
  });
};

const buildIslandMap = (terrainAtRuntime: (x: number, y: number) => Tile["terrain"]): { islandIdByTile: Map<TileKey, number> } => {
  const islandIdByTile = new Map<TileKey, number>();
  let nextIslandId = 0;
  for (let y = 0; y < WORLD_HEIGHT; y += 1) {
    for (let x = 0; x < WORLD_WIDTH; x += 1) {
      if (terrainAtRuntime(x, y) !== "LAND") continue;
      const startKey = key(x, y);
      if (islandIdByTile.has(startKey)) continue;
      const islandId = nextIslandId;
      nextIslandId += 1;
      const queue: Array<{ x: number; y: number }> = [{ x, y }];
      islandIdByTile.set(startKey, islandId);
      for (let index = 0; index < queue.length; index += 1) {
        const current = queue[index]!;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if (dx === 0 && dy === 0) continue;
            const nx = wrapX(current.x + dx, WORLD_WIDTH);
            const ny = wrapY(current.y + dy, WORLD_HEIGHT);
            if (terrainAtRuntime(nx, ny) !== "LAND") continue;
            const neighborKey = key(nx, ny);
            if (islandIdByTile.has(neighborKey)) continue;
            islandIdByTile.set(neighborKey, islandId);
            queue.push({ x: nx, y: ny });
          }
        }
      }
    }
  }
  return { islandIdByTile };
};

const worldLooksBland = (seed: number, clusterByTile: Map<TileKey, string>, townsByTile: Map<TileKey, TownDefinition>, docksByTile: Map<TileKey, { dockId: string }>, seeded01: (x: number, y: number, seed: number) => number): boolean => {
  const step = 15;
  let checkedBlocks = 0;
  let blandBlocks = 0;
  for (let y = 0; y < WORLD_HEIGHT; y += step) {
    for (let x = 0; x < WORLD_WIDTH; x += step) {
      let land = 0;
      let nearBarrier = 0;
      let nearHook = 0;
      for (let dy = 0; dy < step; dy += 1) {
        for (let dx = 0; dx < step; dx += 1) {
          const wx = wrapX(x + dx, WORLD_WIDTH);
          const wy = wrapY(y + dy, WORLD_HEIGHT);
          if (terrainAt(wx, wy) !== "LAND") continue;
          land += 1;
          const neighbors: Array<[number, number]> = [
            [wx, wrapY(wy - 1, WORLD_HEIGHT)],
            [wrapX(wx + 1, WORLD_WIDTH), wy],
            [wx, wrapY(wy + 1, WORLD_HEIGHT)],
            [wrapX(wx - 1, WORLD_WIDTH), wy]
          ];
          if (neighbors.some(([nx, ny]) => terrainAt(nx, ny) !== "LAND")) nearBarrier += 1;
          const tk = key(wx, wy);
          if (clusterByTile.has(tk) || townsByTile.has(tk) || docksByTile.has(tk)) nearHook += 1;
        }
      }
      checkedBlocks += 1;
      if (land < step * step * 0.45) continue;
      if (nearBarrier / Math.max(1, land) < 0.08 && nearHook / Math.max(1, land) < 0.02) blandBlocks += 1;
    }
  }
  return blandBlocks > checkedBlocks * 0.22 || seeded01(seed, seed + 1, seed + 2) < 0;
};

export const createSeason20AiSeedWorld = (
  seed: number,
  createPlayer: (id: string, isAi: boolean) => DomainPlayer
): GeneratedSeasonSeedWorld => {
  const activeSeason = { worldSeed: seed };
  const clusterByTile = new Map<TileKey, string>();
  const clustersById = new Map<string, ClusterDefinition>();
  const townsByTile = new Map<TileKey, TownDefinition>();
  const docksByTile = new Map<TileKey, { dockId: string; tileKey: TileKey }>();
  const dockById = new Map<string, { dockId: string; tileKey: TileKey }>();
  const shardSitesByTile = new Map<TileKey, ShardSiteState>();
  const terrainShapesByTile = new Map<TileKey, TerrainShapeState>();
  const ownership = new Map<TileKey, string>();
  const playersForTerrain = new Map<string, Player>();
  const terrainRuntime = createTerrainRuntime({
    activeSeason,
    clusterByTile,
    clustersById,
    docksByTile,
    fortsByTile: new Map(),
    observatoriesByTile: new Map(),
    ownership,
    players: playersForTerrain,
    siegeOutpostsByTile: new Map(),
    terrainShapesByTile,
    townsByTile,
    economicStructuresByTile: new Map()
  });
  const clustersRuntime = createServerWorldgenClusters({
    clusterByTile,
    clustersById,
    clusterTypeDefs: terrainRuntime.clusterTypeDefs,
    seeded01: terrainRuntime.seeded01,
    WORLD_WIDTH,
    WORLD_HEIGHT,
    clusterRuleMatch: (x, y, resource) => terrainRuntime.resourcePlacementAllowed(x, y, resource, false),
    clusterRuleMatchRelaxed: (x, y, resource) => terrainRuntime.resourcePlacementAllowed(x, y, resource, true),
    clusterTileCountForResource: terrainRuntime.clusterTileCountForResource,
    collectClusterTiles: terrainRuntime.collectClusterTiles,
    collectClusterTilesRelaxed: terrainRuntime.collectClusterTilesRelaxed,
    clusterRadiusForResource: terrainRuntime.clusterRadiusForResource,
    key,
    clusterResourceType: terrainRuntime.clusterResourceType
  });
  const docksRuntime = createServerWorldgenDocks({
    seeded01: terrainRuntime.seeded01,
    WORLD_WIDTH,
    WORLD_HEIGHT,
    key,
    wrapX,
    wrapY,
    worldIndex: (x, y) => y * WORLD_WIDTH + x,
    terrainAt,
    adjacentOceanSea: terrainRuntime.adjacentOceanSea,
    largestSeaComponentMask: terrainRuntime.largestSeaComponentMask,
    clusterByTile,
    LARGE_ISLAND_MULTI_DOCK_TILE_THRESHOLD,
    docksByTile: docksByTile as Map<TileKey, never>,
    dockById: dockById as Map<string, never>,
    getDockLinkedTileKeysByDockTileKey: () => new Map()
  });
  const townsRuntime = createServerWorldgenTowns({
    seeded01: terrainRuntime.seeded01,
    regionTypeAtLocal: terrainRuntime.regionTypeAtLocal,
    landBiomeAt,
    activeSeason,
    townsByTile,
    firstSpecialSiteCaptureClaimed: new Set(),
    WORLD_WIDTH,
    WORLD_HEIGHT,
    terrainAt,
    key,
    docksByTile: docksByTile as Map<TileKey, never>,
    clusterByTile,
    POPULATION_MAX,
    POPULATION_TOWN_MIN,
    now: () => 0,
    wrapX,
    wrapY,
    parseKey,
    assignMissingTownNames,
    getIslandMap: () => buildIslandMap(terrainRuntime.terrainAtRuntime),
    WORLD_TOWN_POPULATION_MIN,
    WORLD_TOWN_POPULATION_START_SPREAD,
    nearestLandTiles: terrainRuntime.nearestLandTiles,
    resourcePlacementAllowed: terrainRuntime.resourcePlacementAllowed,
    clustersById,
    clusterResourceType: terrainRuntime.clusterResourceType
  });
  const shardsRuntime = createServerWorldgenShards({
    terrainAt,
    key,
    docksByTile: docksByTile as Map<TileKey, never>,
    clusterByTile,
    townsByTile,
    shardSitesByTile,
    now: () => 0,
    INITIAL_SHARD_SCATTER_COUNT,
    seeded01: terrainRuntime.seeded01,
    WORLD_WIDTH,
    WORLD_HEIGHT,
    currentShardRainNotice: () => undefined,
    SHARD_RAIN_TTL_MS: 0,
    nextShardRainStartAt: () => 0,
    getLastShardRainWarningSlotKey: () => undefined,
    setLastShardRainWarningSlotKey: noOp,
    broadcast: noOp,
    hasOnlinePlayers: () => false,
    SHARD_RAIN_SITE_MIN: 0,
    SHARD_RAIN_SITE_MAX: 0,
    broadcastLocalVisionDelta: noOp,
    SHARD_RAIN_SCHEDULE_HOURS: [],
    getLastShardRainSlotKey: () => undefined,
    setLastShardRainSlotKey: noOp,
    parseKey,
    markSummaryChunkDirtyAtTile: noOp,
    visible: () => false,
    getOrInitStrategicStocks: () => ({ SHARD: 0 })
  });

  let worldSeed = seed;
  for (let iteration = 0; iteration < 8; iteration += 1) {
    activeSeason.worldSeed = worldSeed;
    setWorldSeed(worldSeed);
    clustersRuntime.generateClusters(worldSeed);
    docksRuntime.generateDocks(worldSeed);
    townsRuntime.generateTowns(worldSeed);
    shardsRuntime.seedInitialShardScatter(worldSeed);
    townsRuntime.ensureBaselineEconomyCoverage(worldSeed);
    townsRuntime.ensureInterestCoverage(worldSeed);
    townsRuntime.normalizeTownPlacements();
    townsRuntime.assignMissingTownNamesForWorld();
    if (!worldLooksBland(worldSeed, clusterByTile, townsByTile, docksByTile, terrainRuntime.seeded01)) break;
    worldSeed = Math.floor(terrainRuntime.seeded01(worldSeed + iteration * 101, worldSeed + iteration * 137, worldSeed + 9001) * 1_000_000_000);
  }
  activeSeason.worldSeed = worldSeed;
  setWorldSeed(worldSeed);

  const players = new Map<string, DomainPlayer>([
    ["player-1", createPlayer("player-1", false)],
    ["barbarian-1", createPlayer("barbarian-1", false)]
  ]);
  for (let index = 0; index < 20; index += 1) {
    const playerId = `ai-${index + 1}`;
    players.set(playerId, createPlayer(playerId, true));
  }

  const spawnPositions: Array<{ playerId: string; x: number; y: number; isAi: boolean }> = [];
  const hasNearbyTown = (x: number, y: number, radius: number): boolean => {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.abs(dx) + Math.abs(dy) > radius) continue;
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
  const canSpawnAt = (
    x: number,
    y: number,
    requirements: { needsTown: boolean; needsFood: boolean; minSpawnDistance: number }
  ): boolean => {
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
          const x = Math.floor(
            terrainRuntime.seeded01((playerIndex + 1) * 101 + attempt * 17, (passIndex + 1) * 43 + playerIndex * 11, worldSeed + 700 + passIndex) *
              WORLD_WIDTH
          );
          const y = Math.floor(
            terrainRuntime.seeded01((playerIndex + 1) * 131 + attempt * 19, (passIndex + 1) * 59 + playerIndex * 13, worldSeed + 900 + passIndex) *
              WORLD_HEIGHT
          );
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
    townsByTile.set(tk, createSettlementTown(tk, townsRuntime.townTypeAt(spawn.x, spawn.y)));
    spawnPositions.push({ playerId, x: spawn.x, y: spawn.y, isAi });
  };

  spawnPlayerAt("player-1", false, 0);
  for (let index = 0; index < 20; index += 1) {
    spawnPlayerAt(`ai-${index + 1}`, true, index + 1);
  }
  assignMissingTownNames(townsByTile.values(), buildIslandMap(terrainRuntime.terrainAtRuntime).islandIdByTile, worldSeed);

  const tiles = new Map<string, DomainTileState>();
  for (let y = 0; y < WORLD_HEIGHT; y += 1) {
    for (let x = 0; x < WORLD_WIDTH; x += 1) {
      const tk = tileKey(x, y);
      const clusterId = clusterByTile.get(tk);
      const cluster = clusterId ? clustersById.get(clusterId) : undefined;
      const dock = docksByTile.get(tk);
      const town = townsByTile.get(tk);
      const ownerId = ownership.get(tk);
      const shardSite = shardSitesByTile.get(tk);
      tiles.set(tk, {
        x,
        y,
        terrain: terrainAt(x, y),
        ...(cluster?.resourceType ? { resource: cluster.resourceType } : {}),
        ...(dock ? { dockId: dock.dockId } : {}),
        ...(shardSite ? { shardSite: { kind: shardSite.kind, amount: shardSite.amount, ...(shardSite.expiresAt ? { expiresAt: shardSite.expiresAt } : {}) } } : {}),
        ...(ownerId ? { ownerId, ownershipState: "SETTLED" as const } : {}),
        ...(town ? { town: townStateFromDefinition(town) } : {})
      });
    }
  }

  const perPlayer = [
    { playerId: "player-1", isAi: false, settledTiles: 1, towns: 1 },
    ...Array.from({ length: 20 }, (_, index) => ({ playerId: `ai-${index + 1}`, isAi: true, settledTiles: 1, towns: 1 }))
  ];

  return {
    players,
    tiles,
    humanPlayers: 1,
    aiPlayers: 20,
    totalTiles: tiles.size,
    totalSettledTiles: spawnPositions.length,
    totalTownTiles: spawnPositions.length,
    perPlayer
  };
};
