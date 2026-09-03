import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import {
  CURRENT_WORLDGEN_VERSION,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  landBiomeAt,
  overrideTerrainAt,
  setWorldSeed,
  terrainAt,
  wrapX,
  wrapY,
  type Player,
  type TileKey,
  type WorldStyle
} from "@border-empires/shared";

import {
  LARGE_ISLAND_MULTI_DOCK_TILE_THRESHOLD,
  POPULATION_MAX,
  POPULATION_TOWN_MIN,
  WORLD_TOWN_POPULATION_MIN,
  WORLD_TOWN_POPULATION_START_SPREAD,
  key,
  parseKey,
  type ClusterDefinition,
  type NaturalWonderSiteState,
  type ShardSiteState,
  type TerrainShapeState,
  type TownDefinition,
  type WatchtowerSiteState,
  createServerWorldgenClusters,
  createServerWorldgenDocks,
  createServerWorldgenIslandConnectivity,
  createServerWorldgenTowns,
  createServerWorldgenWatchtowers,
  assignMissingTownNames
} from "@border-empires/game-domain";

import {
  buildIslandMap,
  chebyshevDistance,
  createSettlementTown,
  createTerrainRuntime,
  islandSizeSummary,
  tileKey,
  townStateFromDefinition,
  worldLooksBland,
  type GeneratedDockState,
  type GeneratedSeasonSeedWorld
} from "./season-seed-world.js";
import { seedBarbarianTiles } from "./season-barbarian-seed/season-barbarian-seed.js"; import { createSeasonNaturalWondersRuntime } from "./season-seed-natural-wonders.js";
import { buildSeasonSeedTile } from "./season-seed-world-tile-assembly.js";
import { createSeasonSeedPlayerSpawner } from "./season-seed-world-player-spawn.js";
import { countFairSpawnSitesForWorldgenCheck, FAIR_SPAWN_SITE_WORLDGEN_MINIMUM } from "./season-seed-world-fair-spawn-check.js";
import { fillMountainRingInteriors } from "./season-seed-world-ring-interiors.js";
import { finalizeSeasonWorldDocks } from "./dock-network/dock-sea-routes.js";

// This is createSeasonSeedWorld (season-seed-world.ts) with cooperative
// yields between generation stages, used by the live "Start New Season"
// path (season-worldgen.ts), which runs on an armed watchdog alongside
// other traffic and must not monopolize the event loop for the whole
// 6-30s+ run. createSeasonSeedWorld itself stays synchronous because it's
// also called from the SimulationRuntime constructor (via seed-state.ts's
// "season-20ai" dev/test profile), which can't await. Keep the generation
// sequence in sync between the two files when editing either.
export const createSeasonSeedWorldAsync = async (
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
    // Optional cooperative yield hook. Passing yieldToEventLoop lets the
    // ~200k-tile generation loop below give the event loop a turn between
    // stages instead of blocking it for the whole 6-30s+ run — safe here
    // specifically because every live call path that touches the shared
    // terrainAt/setWorldSeed module state (SubmitCommand handlers, the
    // background tickers) already no-ops once the season is "ended", which
    // is a precondition for this function running in the first place. Omit
    // it (as the boot-time worldgen-baseline cache-miss path does) to keep
    // an uninterrupted block, which is fine before the watchdog is armed.
    onYield?: () => Promise<void>;
  } = {}
): Promise<GeneratedSeasonSeedWorld> => {
  const onYield = options.onYield;
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
  const watchtowersByTile = new Map<TileKey, WatchtowerSiteState>();
  const naturalWondersByTile = new Map<TileKey, NaturalWonderSiteState>();
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
    clusterResourceType: terrainRuntime.clusterResourceType
  });
  const watchtowersRuntime = createServerWorldgenWatchtowers({
    seeded01: terrainRuntime.seeded01,
    watchtowersByTile,
    WORLD_WIDTH,
    WORLD_HEIGHT,
    terrainAt,
    key,
    docksByTile: docksByTile as Map<TileKey, never>,
    clusterByTile,
    townsByTile
  });
  const naturalWondersRuntime = createSeasonNaturalWondersRuntime(terrainRuntime, naturalWondersByTile, docksByTile, clusterByTile, clustersById, townsByTile);
  let worldSeed = seed;
  let islandSummary = { sizes: [] as number[], significantCount: 0, largestShare: 1 };
  for (let iteration = 0; iteration < 16; iteration += 1) {
    activeSeason.worldSeed = worldSeed;
    setWorldSeed(worldSeed, style, CURRENT_WORLDGEN_VERSION); // generation always uses the latest algorithm
    islandConnectivityRuntime.ensureLandMassesReachSea();
    clustersRuntime.generateClusters(worldSeed);
    await onYield?.();
    docksRuntime.generateDocks(worldSeed);
    await onYield?.();
    townsRuntime.generateTowns(worldSeed);
    townsRuntime.ensureBaselineEconomyCoverage(worldSeed);
    await onYield?.();
    townsRuntime.ensureInterestCoverage(worldSeed);
    townsRuntime.normalizeTownPlacements();
    fillMountainRingInteriors(worldSeed, style, {
      WORLD_WIDTH, WORLD_HEIGHT, terrainAt, key, townsByTile, clusterByTile,
      docksByTile: docksByTile as Map<TileKey, unknown>, townsRuntime, POPULATION_MAX
    });
    townsRuntime.assignMissingTownNamesForWorld();
    watchtowersRuntime.generateWatchtowers(worldSeed);
    await onYield?.();
    islandSummary = islandSizeSummary(terrainRuntime.terrainAtRuntime, significantIslandTileThreshold);
    await onYield?.();
    const islandDistributionAccepted =
      (minSignificantIslands === undefined || islandSummary.significantCount >= minSignificantIslands) &&
      (maxSignificantIslands === undefined || islandSummary.significantCount <= maxSignificantIslands) &&
      (maxLargestIslandShare === undefined || islandSummary.largestShare <= maxLargestIslandShare);
    const worldLooksBlandResult = islandDistributionAccepted && worldLooksBland(worldSeed, clusterByTile, townsByTile, docksByTile, terrainRuntime.seeded01);
    await onYield?.();
    // Reject (and regenerate, same as a bad island distribution or a bland
    // map) a candidate map that can't secure a full fair-spawn-site roster —
    // see countFairSpawnSitesForWorldgenCheck.
    const worldAccepted =
      islandDistributionAccepted &&
      !worldLooksBlandResult &&
      countFairSpawnSitesForWorldgenCheck({ WORLD_WIDTH, WORLD_HEIGHT, terrainAt, key, clusterByTile, clustersById, townsByTile }) >= FAIR_SPAWN_SITE_WORLDGEN_MINIMUM;
    if (worldAccepted) break;
    if (iteration < 15) {
      worldSeed = Math.floor(terrainRuntime.seeded01(worldSeed + iteration * 101, worldSeed + iteration * 137, worldSeed + 9001) * 1_000_000_000);
    }
    await onYield?.();
  }
  activeSeason.worldSeed = worldSeed;
  setWorldSeed(worldSeed, style, CURRENT_WORLDGEN_VERSION); // generation always uses the latest algorithm
  islandConnectivityRuntime.ensureLandMassesReachSea();
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
    townsByTile, docksByTile, ownership, clusterByTile, clustersById,
    shardSitesByTile, watchtowersByTile, naturalWondersByTile,
    createSettlementTown, townTypeAt: townsRuntime.townTypeAt, minTownSpacing: townsRuntime.minTownSpacing
  });

  for (let index = 0; index < humanPlayerCount; index += 1) {
    spawnPlayerAt(`player-${index + 1}`, false, index);
    await onYield?.();
  }
  for (let index = 0; index < aiPlayerCount; index += 1) {
    spawnPlayerAt(`ai-${index + 1}`, true, humanPlayerCount + index);
    await onYield?.();
  }

  assignMissingTownNames(townsByTile.values(), buildIslandMap(terrainRuntime.terrainAtRuntime).islandIdByTile, worldSeed);
  await onYield?.();

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
  await onYield?.();

  const tileAssemblyDeps = { clusterByTile, clustersById, docksByTile, townsByTile, ownership, shardSitesByTile, watchtowersByTile, naturalWondersByTile, terrainAt, townStateFromDefinition };
  const tiles = new Map<string, DomainTileState>();
  for (let y = 0; y < WORLD_HEIGHT; y += 1) {
    if (y > 0 && y % 50 === 0) await onYield?.();
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
