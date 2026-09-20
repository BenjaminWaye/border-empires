import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import {
  CURRENT_WORLDGEN_VERSION,
  FRONTIER_CLAIM_MS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  generateRiverPaths,
  grassShadeAt,
  landBiomeAt,
  overrideTerrainAt,
  regionTypeAt,
  setWorldSeed,
  terrainAt,
  wrapX,
  wrapY,
  type Player,
  type ResourceType,
  type Tile,
  type TileKey,
  type WorldStyle
} from "@border-empires/shared";

import {
  LARGE_ISLAND_MULTI_DOCK_TILE_THRESHOLD,
  PLAYER_MOUNTAIN_DENSITY_LIMIT,
  PLAYER_MOUNTAIN_DENSITY_RADIUS,
  POPULATION_MAX,
  POPULATION_TOWN_MIN,
  WORLD_TOWN_POPULATION_MIN,
  WORLD_TOWN_POPULATION_START_SPREAD,
  key,
  parseKey,
  type ClusterDefinition,
  type ShardSiteState,
  type TerrainShapeState,
  type TownDefinition,
  type WatchtowerSiteState,
  type WaystationSiteState,
  createServerWorldgenClusters,
  createServerWorldgenDocks,
  createServerWorldgenIslandConnectivity,
  createServerWorldgenTerrain,
  createServerWorldgenTowns,
  createServerWorldgenWatchtowers,
  createServerWorldgenWaystations,
  assignMissingTownNames
} from "@border-empires/game-domain";
import { townTerrainProfileForBiome } from "@border-empires/shared";
import { createSettlementTown, townPopulationTier, townStateFromDefinition } from "./season-seed-world-town.js";
export { createSettlementTown, townStateFromDefinition } from "./season-seed-world-town.js";
import type { DockRouteDefinition } from "./dock-network/dock-network.js";
import { finalizeSeasonWorldDocks } from "./dock-network/dock-sea-routes.js";
import { seedBarbarianTiles } from "./season-barbarian-seed/season-barbarian-seed.js"; import { createSeasonNaturalWondersRuntime } from "./season-seed-natural-wonders.js";
import { buildSeasonSeedTile } from "./season-seed-world-tile-assembly.js";
import { createSeasonSeedPlayerSpawner } from "./season-seed-world-player-spawn.js";
import { countFairSpawnSitesForWorldgenCheck, FAIR_SPAWN_SITE_WORLDGEN_MINIMUM } from "./season-seed-world-fair-spawn-check.js"; import { fillMountainRingInteriors } from "./season-seed-world-ring-interiors.js";
import { worldLooksBland } from "./season-seed-world-bland-check.js";
export { worldLooksBland } from "./season-seed-world-bland-check.js";

export type GeneratedSeedPlayerSummary = {
  playerId: string;
  isAi: boolean;
  settledTiles: number;
  towns: number;
};

export type GeneratedSeasonSeedWorld = {
  players: Map<string, DomainPlayer>;
  tiles: Map<string, DomainTileState>;
  docks: DockRouteDefinition[];
  worldSeed: number;
  significantIslandCount: number;
  humanPlayers: number;
  aiPlayers: number;
  totalTiles: number;
  totalSettledTiles: number;
  totalTownTiles: number;
  perPlayer: GeneratedSeedPlayerSummary[];
};

export const tileKey = (x: number, y: number): TileKey => `${x},${y}`;
export const noOp = (): void => {};
export type GeneratedDockState = DockRouteDefinition & { tileKey: TileKey };
const emptyResourceCounts = (): Record<ResourceType, number> => ({
  FARM: 0,
  FISH: 0,
  UMBRITE: 0,
  TITANIUM: 0,
  GEMS: 0
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
  hasMintworks: false,
  mintworksActive: false,
  mintworksCount: 0,
  hasGranary: false,
  granaryActive: false
});

export const chebyshevDistance = (ax: number, ay: number, bx: number, by: number): number => {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  return Math.max(Math.min(dx, WORLD_WIDTH - dx), Math.min(dy, WORLD_HEIGHT - dy));
};

export const createTerrainRuntime = (state: {
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

export { buildIslandMap, islandSizeSummary };
import { buildIslandMap, islandSizeSummary } from "./season-seed-world-islands.js";

export const createSeasonSeedWorld = (
  seed: number,
  createPlayer: (id: string, isAi: boolean) => DomainPlayer,
  options: {
    humanPlayerCount?: number;
    aiPlayerCount?: number;
    style?: WorldStyle;
    minSignificantIslands?: number;
    maxSignificantIslands?: number;
    significantIslandTileThreshold?: number;
    maxLargestIslandShare?: number;
  } = {}
): GeneratedSeasonSeedWorld => {
  const style = options.style ?? "continents";
  const humanPlayerCount = Math.max(0, options.humanPlayerCount ?? 1);
  const aiPlayerCount = Math.max(0, options.aiPlayerCount ?? 20);
  const significantIslandTileThreshold = Math.max(1, options.significantIslandTileThreshold ?? 20);
  const minSignificantIslands = options.minSignificantIslands === undefined ? undefined : Math.max(0, options.minSignificantIslands);
  const maxSignificantIslands =
    options.maxSignificantIslands === undefined
      ? undefined
      : Math.max(minSignificantIslands ?? 0, options.maxSignificantIslands);
  const maxLargestIslandShare =
    options.maxLargestIslandShare === undefined
      ? undefined
      : Math.min(1, Math.max(0.01, options.maxLargestIslandShare));
  const activeSeason = { worldSeed: seed };
  const clusterByTile = new Map<TileKey, string>();
  const clustersById = new Map<string, ClusterDefinition>();
  const townsByTile = new Map<TileKey, TownDefinition>();
  const docksByTile = new Map<TileKey, GeneratedDockState>();
  const dockById = new Map<string, GeneratedDockState>();
  const shardSitesByTile = new Map<TileKey, ShardSiteState>();
  const watchtowersByTile = new Map<TileKey, WatchtowerSiteState>(); const waystationsByTile = new Map<TileKey, WaystationSiteState>();
  const naturalWondersByTile = new Map<TileKey, import("@border-empires/game-domain").NaturalWonderSiteState>();
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
  const islandConnectivityRuntime = createServerWorldgenIslandConnectivity({
    WORLD_WIDTH,
    WORLD_HEIGHT,
    wrapX,
    wrapY,
    terrainAt,
    overrideTerrainAt
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
    clusterResourceType: terrainRuntime.clusterResourceType,
    generateRiverPaths
  });
  const watchtowersRuntime = createServerWorldgenWatchtowers({
    seeded01: terrainRuntime.seeded01, watchtowersByTile, WORLD_WIDTH, WORLD_HEIGHT, terrainAt, key,
    docksByTile: docksByTile as Map<TileKey, never>, clusterByTile, townsByTile
  });
  const waystationsRuntime = createServerWorldgenWaystations({
    seeded01: terrainRuntime.seeded01, waystationsByTile, WORLD_WIDTH, WORLD_HEIGHT, terrainAt, key,
    docksByTile: docksByTile as Map<TileKey, never>, clusterByTile, townsByTile, watchtowersByTile });
  const naturalWondersRuntime = createSeasonNaturalWondersRuntime(terrainRuntime, naturalWondersByTile, docksByTile, clusterByTile, clustersById, townsByTile);
  let worldSeed = seed; let islandSummary = { sizes: [] as number[], significantCount: 0, largestShare: 1 };
  for (let iteration = 0; iteration < 16; iteration += 1) {
    activeSeason.worldSeed = worldSeed;
    setWorldSeed(worldSeed, style, CURRENT_WORLDGEN_VERSION); // generation always uses the latest algorithm
    islandConnectivityRuntime.ensureLandMassesReachSea();
    clustersRuntime.generateClusters(worldSeed);
    docksRuntime.generateDocks(worldSeed);
    townsRuntime.generateTowns(worldSeed);
    townsRuntime.ensureBaselineEconomyCoverage(worldSeed);
    townsRuntime.ensureInterestCoverage(worldSeed);
    townsRuntime.normalizeTownPlacements();
    fillMountainRingInteriors(worldSeed, style, { WORLD_WIDTH, WORLD_HEIGHT, terrainAt, key, townsByTile, clusterByTile, docksByTile: docksByTile as Map<TileKey, unknown>, townsRuntime, POPULATION_MAX });
    townsRuntime.assignMissingTownNamesForWorld();
    watchtowersRuntime.generateWatchtowers(worldSeed); waystationsRuntime.generateWaystations(worldSeed);
    islandSummary = islandSizeSummary(terrainRuntime.terrainAtRuntime, significantIslandTileThreshold);
    const islandDistributionAccepted =
      (minSignificantIslands === undefined || islandSummary.significantCount >= minSignificantIslands) &&
      (maxSignificantIslands === undefined || islandSummary.significantCount <= maxSignificantIslands) &&
      (maxLargestIslandShare === undefined || islandSummary.largestShare <= maxLargestIslandShare);
    // Reject (and regenerate, same as a bad island distribution or a bland
    // map) a candidate map that can't secure a full fair-spawn-site roster —
    // see countFairSpawnSitesForWorldgenCheck. Only run this heavier check
    // once the cheaper criteria already pass.
    const worldAccepted =
      islandDistributionAccepted &&
      !worldLooksBland(worldSeed, clusterByTile, townsByTile, docksByTile, terrainRuntime.seeded01) &&
      countFairSpawnSitesForWorldgenCheck({ WORLD_WIDTH, WORLD_HEIGHT, terrainAt, key, clusterByTile, clustersById, townsByTile }) >= FAIR_SPAWN_SITE_WORLDGEN_MINIMUM;
    if (worldAccepted) break;
    if (iteration < 15) {
      worldSeed = Math.floor(terrainRuntime.seeded01(worldSeed + iteration * 101, worldSeed + iteration * 137, worldSeed + 9001) * 1_000_000_000);
    }
  }
  activeSeason.worldSeed = worldSeed;
  // Do NOT re-run setWorldSeed/ensureLandMassesReachSea here. The accepted
  // generation pass already carved channels and placed docks/towns against
  // that terrain; resetting the cache now can leave land undocked.
  naturalWondersRuntime.generateNaturalWonders(worldSeed);

  const players = new Map<string, DomainPlayer>([
    ["barbarian-1", createPlayer("barbarian-1", false)]
  ]);
  for (let index = 0; index < humanPlayerCount; index += 1) {
    const playerId = `player-${index + 1}`;
    players.set(playerId, createPlayer(playerId, false));
  }
  for (let index = 0; index < aiPlayerCount; index += 1) {
    const playerId = `ai-${index + 1}`;
    players.set(playerId, createPlayer(playerId, true));
  }

  const { spawnPositions, spawnPlayerAt } = createSeasonSeedPlayerSpawner({
    WORLD_WIDTH, WORLD_HEIGHT, worldSeed, terrainAt, wrapX, wrapY, key,
    chebyshevDistance, seeded01: terrainRuntime.seeded01,
    townsByTile, docksByTile, ownership, clusterByTile, clustersById, shardSitesByTile, watchtowersByTile, waystationsByTile, naturalWondersByTile,
    createSettlementTown, townTypeAt: townsRuntime.townTypeAt, minTownSpacing: townsRuntime.minTownSpacing
  });

  for (let index = 0; index < humanPlayerCount; index += 1) {
    spawnPlayerAt(`player-${index + 1}`, false, index);
  }
  for (let index = 0; index < aiPlayerCount; index += 1) {
    spawnPlayerAt(`ai-${index + 1}`, true, humanPlayerCount + index);
  }

  assignMissingTownNames(townsByTile.values(), buildIslandMap(terrainRuntime.terrainAtRuntime).islandIdByTile, worldSeed);

  const barbarianTileKeys = seedBarbarianTiles({
    spawnPositions,
    ownership,
    townsByTile,
    docksByTile,
    shardSitesByTile,
    worldSeed,
    terrainAt,
    seeded01: terrainRuntime.seeded01
  });

  const tileAssemblyDeps = { clusterByTile, clustersById, docksByTile, townsByTile, ownership, shardSitesByTile, watchtowersByTile, waystationsByTile, naturalWondersByTile, worldWidth: WORLD_WIDTH, worldHeight: WORLD_HEIGHT, terrainAt, landBiomeAt, townStateFromDefinition };
  const tiles = new Map<string, DomainTileState>();
  for (let y = 0; y < WORLD_HEIGHT; y += 1) {
    for (let x = 0; x < WORLD_WIDTH; x += 1) {
      const tk = tileKey(x, y);
      tiles.set(tk, buildSeasonSeedTile(x, y, tk, tileAssemblyDeps));
    }
  }

  const perPlayer = [
    ...Array.from({ length: humanPlayerCount }, (_, index) => ({
      playerId: `player-${index + 1}`,
      isAi: false,
      settledTiles: 1,
      towns: 1
    })),
    ...Array.from({ length: aiPlayerCount }, (_, index) => ({
      playerId: `ai-${index + 1}`,
      isAi: true,
      settledTiles: 1,
      towns: 1
    }))
  ];

  return {
    players,
    tiles,
    docks: finalizeSeasonWorldDocks(dockById, {
      terrainAt: terrainRuntime.terrainAtRuntime,
      worldIndex: (x, y) => y * WORLD_WIDTH + x,
      wrapX: (x) => wrapX(x, WORLD_WIDTH),
      wrapY: (y) => wrapY(y, WORLD_HEIGHT),
      worldWidth: WORLD_WIDTH,
      worldHeight: WORLD_HEIGHT
    }),
    worldSeed,
    significantIslandCount: islandSummary.significantCount,
    humanPlayers: humanPlayerCount,
    aiPlayers: aiPlayerCount,
    totalTiles: tiles.size,
    totalSettledTiles: spawnPositions.length,
    totalTownTiles: spawnPositions.length,
    perPlayer
  };
};
