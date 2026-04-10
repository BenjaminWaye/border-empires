import type {
  BarbarianAgent,
  ClusterType,
  Dock,
  EconomicStructure,
  Fort,
  LandBiome,
  Observatory,
  OwnershipState,
  Player,
  RegionType,
  ResourceType,
  Season,
  SiegeOutpost,
  Tile,
  TileKey
} from "@border-empires/shared";
import type { SystemSimulationCommand } from "./sim/service.js";
import type {
  ClusterDefinition,
  ShardSiteState,
  StrategicResource,
  TerrainShapeState,
  TownDefinition
} from "./server-shared-types.js";

export type ClusterTypeDefinition = {
  type: ClusterType;
  resourceType: ResourceType;
  threshold: number;
};

export interface ServerWorldgenClustersDeps {
  clusterByTile: Map<TileKey, string>;
  clustersById: Map<string, ClusterDefinition>;
  clusterTypeDefs: ClusterTypeDefinition[];
  seeded01: (x: number, y: number, seed: number) => number;
  WORLD_WIDTH: number;
  WORLD_HEIGHT: number;
  clusterRuleMatch: (x: number, y: number, resource: ResourceType) => boolean;
  clusterRuleMatchRelaxed: (x: number, y: number, resource: ResourceType) => boolean;
  clusterTileCountForResource: (resource: ResourceType, x: number, y: number) => number;
  collectClusterTiles: (cx: number, cy: number, resource: ResourceType, count: number) => TileKey[];
  collectClusterTilesRelaxed: (cx: number, cy: number, resource: ResourceType, count: number) => TileKey[];
  clusterRadiusForResource: (resource: ResourceType, x: number, y: number) => number;
  key: (x: number, y: number) => TileKey;
  clusterResourceType: (cluster: ClusterDefinition) => ResourceType;
}

export interface ServerWorldgenClustersRuntime {
  generateClusters: (seed: number) => void;
  applyClusterResources: (x: number, y: number, base: ResourceType | undefined) => ResourceType | undefined;
}

type DockCandidate = { x: number; y: number; componentId: number; seaX: number; seaY: number };

export interface ServerWorldgenDocksDeps {
  seeded01: (x: number, y: number, seed: number) => number;
  WORLD_WIDTH: number;
  WORLD_HEIGHT: number;
  key: (x: number, y: number) => TileKey;
  wrapX: (x: number, width: number) => number;
  wrapY: (y: number, height: number) => number;
  worldIndex: (x: number, y: number) => number;
  terrainAt: (x: number, y: number) => Tile["terrain"];
  adjacentOceanSea: (x: number, y: number, oceanMask: Uint8Array) => { x: number; y: number } | undefined;
  largestSeaComponentMask: () => Uint8Array;
  clusterByTile: Map<TileKey, string>;
  LARGE_ISLAND_MULTI_DOCK_TILE_THRESHOLD: number;
  docksByTile: Map<TileKey, Dock>;
  dockById: Map<string, Dock>;
  getDockLinkedTileKeysByDockTileKey: () => Map<TileKey, TileKey[]>;
}

export interface ServerWorldgenDocksRuntime {
  generateDocks: (seed: number) => void;
}

export interface ServerWorldgenTownsDeps {
  seeded01: (x: number, y: number, seed: number) => number;
  regionTypeAtLocal: (x: number, y: number) => RegionType | undefined;
  landBiomeAt: (x: number, y: number) => LandBiome | undefined;
  activeSeason: Pick<Season, "worldSeed">;
  townsByTile: Map<TileKey, TownDefinition>;
  firstSpecialSiteCaptureClaimed: Set<TileKey>;
  WORLD_WIDTH: number;
  WORLD_HEIGHT: number;
  terrainAt: (x: number, y: number) => Tile["terrain"];
  key: (x: number, y: number) => TileKey;
  docksByTile: Map<TileKey, Dock>;
  clusterByTile: Map<TileKey, string>;
  POPULATION_MAX: number;
  POPULATION_TOWN_MIN: number;
  now: () => number;
  wrapX: (x: number, width: number) => number;
  wrapY: (y: number, height: number) => number;
  parseKey: (tileKey: TileKey) => [number, number];
  ownership: Map<TileKey, string>;
  players: Map<string, Player>;
  assignMissingTownNames: (towns: Iterable<TownDefinition>, islandIdByTile: Map<TileKey, number>, seed: number) => void;
  getIslandMap: () => { islandIdByTile: Map<TileKey, number> };
  WORLD_TOWN_POPULATION_MIN: number;
  WORLD_TOWN_POPULATION_START_SPREAD: number;
  nearestLandTiles: (originX: number, originY: number, candidates: Array<{ x: number; y: number }>, limit: number, predicate?: (tile: { x: number; y: number }) => boolean) => TileKey[];
  resourcePlacementAllowed: (x: number, y: number, resource: ResourceType, relaxed?: boolean) => boolean;
  clustersById: Map<string, ClusterDefinition>;
  clusterResourceType: (cluster: ClusterDefinition) => ResourceType;
}

export interface ServerWorldgenTownsRuntime {
  townTypeAt: (x: number, y: number) => TownDefinition["type"];
  generateTowns: (seed: number) => void;
  canPlaceTownAt: (x: number, y: number, ignoreTileKey?: TileKey) => boolean;
  findNearestTownPlacement: (originX: number, originY: number, ignoreTileKey?: TileKey) => TileKey | undefined;
  townPlacementsNeedNormalization: () => boolean;
  normalizeTownPlacements: () => void;
  normalizeLegacySettlementTowns: () => void;
  assignMissingTownNamesForWorld: () => void;
  ensureBaselineEconomyCoverage: (seed: number) => void;
  ensureInterestCoverage: (seed: number) => void;
  initialTownPopulationAt: (x: number, y: number, seed: number) => number;
}

export interface ServerWorldgenShardsDeps {
  terrainAt: (x: number, y: number) => Tile["terrain"];
  key: (x: number, y: number) => TileKey;
  docksByTile: Map<TileKey, Dock>;
  clusterByTile: Map<TileKey, string>;
  townsByTile: Map<TileKey, TownDefinition>;
  shardSitesByTile: Map<TileKey, ShardSiteState>;
  now: () => number;
  INITIAL_SHARD_SCATTER_COUNT: number;
  seeded01: (x: number, y: number, seed: number) => number;
  WORLD_WIDTH: number;
  WORLD_HEIGHT: number;
  currentShardRainNotice: (nowMs: number, expiresAt: number | undefined, siteCount: number, ttlMs: number) => unknown;
  SHARD_RAIN_TTL_MS: number;
  nextShardRainStartAt: (nowMs: number) => number;
  getLastShardRainWarningSlotKey: () => string | undefined;
  setLastShardRainWarningSlotKey: (value: string) => void;
  broadcast: (payload: unknown) => void;
  hasOnlinePlayers: () => boolean;
  SHARD_RAIN_SITE_MIN: number;
  SHARD_RAIN_SITE_MAX: number;
  broadcastLocalVisionDelta: (centers: Array<{ x: number; y: number }>) => void;
  SHARD_RAIN_SCHEDULE_HOURS: readonly number[];
  getLastShardRainSlotKey: () => string | undefined;
  setLastShardRainSlotKey: (value: string) => void;
  parseKey: (tileKey: TileKey) => [number, number];
  markSummaryChunkDirtyAtTile: (x: number, y: number) => void;
  visible: (player: Player, x: number, y: number) => boolean;
  getOrInitStrategicStocks: (playerId: string) => Partial<Record<StrategicResource, number>>;
}

export interface ServerWorldgenShardsRuntime {
  shardSiteViewAt: (tileKey: TileKey) => Tile["shardSite"] | undefined;
  seedInitialShardScatter: (seed: number) => void;
  activeShardRainSummary: () => { siteCount: number; expiresAt: number | undefined };
  shardRainNoticePayload: () => unknown;
  maybeBroadcastShardRainWarning: () => void;
  spawnShardRain: () => void;
  maybeSpawnScheduledShardRain: () => void;
  expireShardSites: () => void;
  collectShardSite: (player: Player, x: number, y: number) => { ok: boolean; amount?: number; reason?: string };
}

export interface ServerWorldgenTerrainDeps {
  wrapX: (x: number, width: number) => number;
  wrapY: (y: number, height: number) => number;
  WORLD_WIDTH: number;
  WORLD_HEIGHT: number;
  terrainShapesByTile: Map<TileKey, TerrainShapeState>;
  key: (x: number, y: number) => TileKey;
  terrainAt: (x: number, y: number) => Tile["terrain"];
  PLAYER_MOUNTAIN_DENSITY_RADIUS: number;
  PLAYER_MOUNTAIN_DENSITY_LIMIT: number;
  players: Map<string, Player>;
  parseKey: (tileKey: TileKey) => [number, number];
  chebyshevDistance: (ax: number, ay: number, bx: number, by: number) => number;
  regionTypeAt: (x: number, y: number) => RegionType | undefined;
  clusterByTile: Map<TileKey, string>;
  townsByTile: Map<TileKey, TownDefinition>;
  docksByTile: Map<TileKey, Dock>;
  fortsByTile: Map<TileKey, Fort>;
  siegeOutpostsByTile: Map<TileKey, SiegeOutpost>;
  observatoriesByTile: Map<TileKey, Observatory>;
  economicStructuresByTile: Map<TileKey, EconomicStructure>;
  playerTile: (x: number, y: number) => Tile;
  AIRPORT_BOMBARD_MIN_FIELD_TILES: number;
  AIRPORT_BOMBARD_MAX_FIELD_TILES: number;
  activeSeason: Pick<Season, "worldSeed">;
  clustersById: Map<string, ClusterDefinition>;
  ownership: Map<TileKey, string>;
  getOrInitResourceCounts: (playerId: string) => Record<ResourceType, number>;
  rebuildEconomyIndexForPlayer: (playerId: string) => void;
  sendPlayerUpdate: (player: Player, incomeDelta: number) => void;
  sendVisibleTileDeltaAt: (x: number, y: number) => void;
  landBiomeAt: (x: number, y: number) => LandBiome | undefined;
  grassShadeAt: (x: number, y: number) => "LIGHT" | "DARK" | undefined;
  FRONTIER_CLAIM_MS: number;
}

export interface ServerWorldgenTerrainRuntime {
  seeded01: (x: number, y: number, seed: number) => number;
  terrainAtRuntime: (x: number, y: number) => Tile["terrain"];
  terrainShapeWithinPlayerDensity: (x: number, y: number) => boolean;
  hasOwnedLandWithinRange: (playerId: string, x: number, y: number, range: number) => boolean;
  regionTypeAtLocal: (x: number, y: number) => RegionType | undefined;
  isAdjacentTile: (ax: number, ay: number, bx: number, by: number) => boolean;
  isCoastalLand: (x: number, y: number) => boolean;
  largestSeaComponentMask: () => Uint8Array;
  adjacentOceanSea: (x: number, y: number, oceanMask: Uint8Array) => { x: number; y: number } | undefined;
  clusterTypeDefs: ClusterTypeDefinition[];
  clusterResourceType: (cluster: ClusterDefinition) => ResourceType;
  discoverOilFieldNearAirport: (ownerId: string, airportTileKey: TileKey) => TileKey[];
  isNearMountain: (x: number, y: number, r?: number) => boolean;
  resourcePlacementAllowed: (x: number, y: number, resource: ResourceType, relaxed?: boolean) => boolean;
  isForestFrontierTile: (x: number, y: number) => boolean;
  FOREST_SETTLEMENT_MULT: number;
  frontierClaimDurationMsAt: (x: number, y: number) => number;
  nearestLandTiles: (originX: number, originY: number, candidates: Array<{ x: number; y: number }>, limit: number, predicate?: (tile: { x: number; y: number }) => boolean) => TileKey[];
  collectClusterTiles: (cx: number, cy: number, resource: ResourceType, count: number) => TileKey[];
  collectClusterTilesRelaxed: (cx: number, cy: number, resource: ResourceType, count: number) => TileKey[];
  clusterTileCountForResource: (resource: ResourceType, x: number, y: number) => number;
  clusterRadiusForResource: (resource: ResourceType, x: number, y: number) => number;
}

type BreachShock = { ownerId: string; expiresAt: number };

export interface ServerWorldMobilityDeps {
  now: () => number;
  key: (x: number, y: number) => TileKey;
  parseKey: (tileKey: TileKey) => [number, number];
  wrapX: (x: number, width: number) => number;
  wrapY: (y: number, height: number) => number;
  WORLD_WIDTH: number;
  WORLD_HEIGHT: number;
  BARBARIAN_OWNER_ID: string;
  BARBARIAN_ACTION_INTERVAL_MS: number;
  BARBARIAN_MAINTENANCE_MAX_SPAWNS_PER_PASS: number;
  INITIAL_BARBARIAN_COUNT: number;
  MIN_ACTIVE_BARBARIAN_AGENTS: number;
  BREACH_SHOCK_MS: number;
  players: Map<string, Player>;
  townsByTile: Map<TileKey, TownDefinition>;
  docksByTile: Map<TileKey, Dock>;
  dockById: Map<string, Dock>;
  clusterByTile: Map<TileKey, string>;
  breachShockByTile: Map<TileKey, BreachShock>;
  barbarianAgents: Map<string, BarbarianAgent>;
  barbarianAgentByTileKey: Map<TileKey, string>;
  terrainAt: (x: number, y: number) => Tile["terrain"];
  setWorldSeed: (seed: number) => void;
  generateClusters: (seed: number) => void;
  generateDocks: (seed: number) => void;
  generateTowns: (seed: number) => void;
  seedInitialShardScatter: (seed: number) => void;
  ensureBaselineEconomyCoverage: (seed: number) => void;
  ensureInterestCoverage: (seed: number) => void;
  normalizeTownPlacements: () => void;
  assignMissingTownNamesForWorld: () => void;
  seeded01: (x: number, y: number, seed: number) => number;
  playerTile: (x: number, y: number) => Tile;
  visible: (player: Player, x: number, y: number) => boolean;
  updateOwnership: (x: number, y: number, ownerId?: string, state?: OwnershipState) => void;
  hasOnlinePlayers: () => boolean;
  hasQueuedSystemSimulationCommand: (predicate: (job: { command: { type: string } }) => boolean) => boolean;
  enqueueSystemSimulationCommand: (command: SystemSimulationCommand) => void;
  fortDefenseMultAt: (playerId: string, tileKey: TileKey) => number;
  playerDefensiveness: (player: Player) => number;
  settledDefenseMultiplierForTarget: (defenderId: string, tile: Tile) => number;
  ownershipDefenseMultiplierForTarget: (defenderId: string | undefined, tile: Tile) => number;
  isAdjacentTile: (ax: number, ay: number, bx: number, by: number) => boolean;
  markSummaryChunkDirtyAtTile: (x: number, y: number) => void;
  logBarbarianEvent: (message: string) => void;
  DOCK_DEFENSE_MULT: number;
}

export interface ServerWorldMobilityRuntime {
  regenerateStrategicWorld: (initialSeed: number) => number;
  dockLinkedDestinations: (fromDock: Dock) => Dock[];
  dockLinkedTileKeysByDockTileKey: Map<TileKey, TileKey[]>;
  dockLinkedTileKeys: (fromDock: Dock) => TileKey[];
  validDockCrossingTarget: (fromDock: Dock, toX: number, toY: number, allowAdjacentToDock?: boolean) => boolean;
  findOwnedDockOriginForCrossing: (actor: Player, toX: number, toY: number, allowAdjacentToDock?: boolean) => Tile | undefined;
  adjacentNeighbors: (x: number, y: number) => Tile[];
  removeBarbarianAgent: (agentId: string) => void;
  removeBarbarianAtTile: (tileKey: TileKey) => void;
  upsertBarbarianAgent: (agent: BarbarianAgent) => void;
  spawnBarbarianAgentAt: (x: number, y: number, progress?: number) => BarbarianAgent;
  spawnInitialBarbarians: () => void;
  maintainBarbarianPopulation: () => void;
  enqueueBarbarianMaintenance: () => void;
  chooseBarbarianTarget: (agent: BarbarianAgent) => Tile | undefined;
  exportDockPairs: () => Array<{ ax: number; ay: number; bx: number; by: number }>;
  applyBreachShockAround: (x: number, y: number, defenderId: string) => void;
}
