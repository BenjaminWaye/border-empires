import type {
  Dock,
  EconomicStructure,
  EconomicStructureType,
  Observatory,
  OwnershipState,
  Player,
  ResourceType,
  Season,
  SiegeOutpost,
  StructurePlacementMetadata,
  Tile,
  TileKey
} from "@border-empires/shared";
import type { StatsModBreakdown } from "./server-effects.js";
import type { DomainDef } from "./domain-tree.js";
import type { TechDef } from "./tech-tree.js";
import type {
  ActiveSiphon,
  ClusterDefinition,
  SeasonalTechConfig,
  SiphonCache,
  StrategicResource,
  TownDefinition
} from "./server-shared-types.js";

export interface ServerSeasonTechDeps {
  TECHS: TechDef[];
  TECH_ROOTS: string[];
  techById: Map<string, TechDef>;
  domainById: Map<string, DomainDef>;
  players: Map<string, Player>;
  playerBaseMods: Map<string, Pick<Player["mods"], "attack" | "defense" | "income" | "vision">>;
  clusterControlledTilesByPlayer: Map<string, Map<string, number>>;
  recomputePlayerEffectsForPlayer: (player: Player) => void;
  markVisibilityDirty: (playerId: string) => void;
}

export interface ServerSeasonTechRuntime {
  chooseSeasonalTechConfig: (seed: number) => SeasonalTechConfig;
  seasonTechConfigIsCompatible: (config: SeasonalTechConfig) => boolean;
  recomputeClusterBonusForPlayer: (player: Player) => void;
  playerModBreakdown: (player: Player) => StatsModBreakdown;
  recomputeTechModsFromOwnedTechs: (player: Player) => void;
  setClusterControlDelta: (playerId: string, clusterId: string, delta: number) => void;
}

export interface ServerSettlementFlowDeps {
  key: (x: number, y: number) => TileKey;
  now: () => number;
  parseKey: (tileKey: TileKey) => [number, number];
  wrapX: (x: number, width: number) => number;
  wrapY: (y: number, height: number) => number;
  WORLD_WIDTH: number;
  WORLD_HEIGHT: number;
  POPULATION_MIN: number;
  POPULATION_MAX: number;
  POPULATION_START_SPREAD: number;
  resourceRate: Partial<Record<ResourceType, number>>;
  players: Map<string, Player>;
  townsByTile: Map<TileKey, TownDefinition>;
  docksByTile: Map<TileKey, Dock>;
  fortsByTile: Map<TileKey, { ownerId: string; status: string }>;
  observatoriesByTile: Map<TileKey, Observatory>;
  siegeOutpostsByTile: Map<TileKey, SiegeOutpost>;
  economicStructuresByTile: Map<TileKey, EconomicStructure>;
  ownership: Map<TileKey, string>;
  ownershipStateByTile: Map<TileKey, OwnershipState>;
  settledSinceByTile: Map<TileKey, number>;
  activeSeason: Pick<Season, "worldSeed">;
  seeded01: (x: number, y: number, seed: number) => number;
  terrainAtRuntime: (x: number, y: number) => Tile["terrain"];
  playerTile: (x: number, y: number) => Tile;
  applyClusterResources: (x: number, y: number, base: ResourceType | undefined) => ResourceType | undefined;
  resourceAt: (x: number, y: number) => ResourceType | undefined;
  townTypeAt: (x: number, y: number) => TownDefinition["type"];
  townPopulationTierForTown: (town: TownDefinition) => import("@border-empires/shared").PopulationTier;
  structurePlacementMetadata: (type: "FORT" | "OBSERVATORY" | "SIEGE_OUTPOST" | EconomicStructureType) => StructurePlacementMetadata;
  assignMissingTownNamesForWorld: () => void;
  markSummaryChunkDirtyAtTile: (x: number, y: number) => void;
  sendVisibleTileDeltaAt: (x: number, y: number) => void;
  connectedTownBonusForOwner: (connectedTownCount: number, ownerId: string | undefined) => number;
  dockIncomeForOwner: (dock: Dock, ownerId: string | undefined) => number;
  townPotentialIncomeForOwner: (town: TownDefinition, ownerId: string | undefined, options?: { ignoreSuppression?: boolean; ignoreManpowerGate?: boolean }) => number;
}

export interface ServerSettlementFlowRuntime {
  supportedTownKeysForTile: (tileKey: TileKey, ownerId: string | undefined) => TileKey[];
  structureForSupportedTown: (townKey: TileKey, ownerId: string | undefined, type: EconomicStructureType) => EconomicStructure | undefined;
  supportedDockKeysForTile: (tileKey: TileKey, ownerId: string | undefined) => TileKey[];
  structureForSupportedDock: (dockKey: TileKey, ownerId: string | undefined, type: EconomicStructureType) => EconomicStructure | undefined;
  isSupportOnlyStructureType: (structureType: EconomicStructureType) => boolean;
  isDockSupportOnlyStructureType: (structureType: EconomicStructureType) => boolean;
  isLightCombatStructureType: (structureType: EconomicStructureType) => boolean;
  isConverterStructureType: (structureType: EconomicStructureType) => boolean;
  availableSupportTileKeysForTown: (townKey: TileKey, ownerId: string | undefined, structureType: EconomicStructureType) => TileKey[];
  availableSupportTileKeysForDock: (dockKey: TileKey, ownerId: string | undefined, structureType: EconomicStructureType) => TileKey[];
  pickRandomAvailableSupportTileForTown: (townKey: TileKey, ownerId: string | undefined, structureType: EconomicStructureType) => TileKey | undefined;
  pickRandomAvailableSupportTileForDock: (dockKey: TileKey, ownerId: string | undefined, structureType: EconomicStructureType) => TileKey | undefined;
  ownedTownKeysForPlayer: (playerId: string) => TileKey[];
  isRelocatableSettlementTown: (town: TownDefinition | undefined) => town is TownDefinition;
  activeSettlementTileKeyForPlayer: (playerId: string) => TileKey | undefined;
  oldestSettledSettlementCandidateForPlayer: (playerId: string) => TileKey | undefined;
  createSettlementAtTile: (ownerId: string, tileKey: TileKey, previousTown?: Pick<TownDefinition, "townId" | "type" | "name">) => TownDefinition | undefined;
  ensureActiveSettlementForPlayer: (playerId: string) => boolean;
  ensureFallbackSettlementForPlayer: (playerId: string) => boolean;
  relocateCapturedSettlementForPlayer: (playerId: string, displacedTown: Pick<TownDefinition, "townId" | "type" | "name">) => boolean;
  firstThreeTownKeySetForPlayer: (playerId: string) => Set<TileKey>;
  directlyConnectedTownKeysForTown: (playerId: string, originTownKey: TileKey, settledLand?: Set<TileKey>) => TileKey[];
  recomputeTownNetworkForPlayer: (playerId: string) => void;
}

export interface ServerTerritoryStructureRuntimeDeps {
  now: () => number;
  parseKey: (tileKey: TileKey) => [number, number];
  key: (x: number, y: number) => TileKey;
  terrainAtRuntime: (x: number, y: number) => Tile["terrain"];
  ownership: Map<TileKey, string>;
  ownershipStateByTile: Map<TileKey, OwnershipState>;
  observatoriesByTile: Map<TileKey, Observatory>;
  observatoryTileKeysByPlayer: Map<string, Set<TileKey>>;
  economicStructuresByTile: Map<TileKey, EconomicStructure>;
  economicStructureTileKeysByPlayer: Map<string, Set<TileKey>>;
  siphonByTile: Map<TileKey, ActiveSiphon>;
  siphonCacheByPlayer: Map<string, SiphonCache[]>;
  chebyshevDistance: (ax: number, ay: number, bx: number, by: number) => number;
  getPlayerEffectsForPlayer: (playerId: string) => import("./server-effects.js").PlayerEffects;
  markVisibilityDirty: (playerId: string) => void;
  OBSERVATORY_PROTECTION_RADIUS: number;
  OBSERVATORY_CAST_RADIUS: number;
  RADAR_SYSTEM_RADIUS: number;
  GOVERNORS_OFFICE_RADIUS: number;
  GOVERNORS_OFFICE_UPKEEP_MULT: number;
  FOUNDRY_RADIUS: number;
  FOUNDRY_OUTPUT_MULT: number;
  SIPHON_SHARE: number;
  STRUCTURE_OUTPUT_MULT: number;
  FUR_SYNTHESIZER_SUPPLY_PER_DAY: number;
  ADVANCED_FUR_SYNTHESIZER_SUPPLY_PER_DAY: number;
  IRONWORKS_IRON_PER_DAY: number;
  ADVANCED_IRONWORKS_IRON_PER_DAY: number;
  CRYSTAL_SYNTHESIZER_CRYSTAL_PER_DAY: number;
  ADVANCED_CRYSTAL_SYNTHESIZER_CRYSTAL_PER_DAY: number;
  FUEL_PLANT_OIL_PER_DAY: number;
  randomUUID: () => string;
}

export interface ServerTerritoryStructureRuntime {
  isOwnedSettledLandTile: (playerId: string, tileKey: TileKey) => boolean;
  observatoryStatusForTile: (playerId: string, tileKey: TileKey) => "under_construction" | "active" | "inactive" | "removing";
  activeObservatoryTileKeysForPlayer: (playerId: string) => TileKey[];
  syncObservatoriesForPlayer: (playerId: string, active: boolean) => void;
  hostileObservatoryProtectingTile: (actor: Player, x: number, y: number) => TileKey | undefined;
  ownedActiveObservatoryWithinRange: (playerId: string, x: number, y: number, range?: number) => boolean;
  activeAirportAt: (ownerId: string, tileKey: TileKey) => EconomicStructure | undefined;
  activeOwnedEconomicStructureWithinRange: (ownerId: string, type: EconomicStructureType, x: number, y: number, range: number) => TileKey | undefined;
  hostileRadarProtectingTile: (actor: Player, x: number, y: number) => TileKey | undefined;
  governorUpkeepMultiplierAtTile: (ownerId: string | undefined, tileKey: TileKey) => number;
  foundryMineOutputMultiplierAt: (ownerId: string | undefined, tileKey: TileKey) => number;
  converterStructureOutputFor: (structureType: EconomicStructureType, ownerId?: string) => Partial<Record<StrategicResource, number>> | undefined;
  activeSiphonAt: (tileKey: TileKey) => ActiveSiphon | undefined;
  siphonMultiplierAt: (tileKey: TileKey) => number;
  addToSiphonCache: (casterPlayerId: string, targetTileKey: TileKey, gold: number, strategic: Partial<Record<StrategicResource, number>>, expiresAt: number) => void;
  economicStructureForTile: (tileKey: TileKey) => EconomicStructure | undefined;
  economicStructureUpkeepDue: (structure: EconomicStructure) => boolean;
  economicStructureResourceType: (resource: ResourceType | undefined) => EconomicStructureType | undefined;
  economicStructureOutputMultAt: (tileKey: TileKey, ownerId: string | undefined) => number;
}
