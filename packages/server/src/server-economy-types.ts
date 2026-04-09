import type {
  Dock,
  EconomicStructure,
  EconomicStructureType,
  Fort,
  Observatory,
  OwnershipState,
  Player,
  PopulationTier,
  ResourceType,
  SiegeOutpost,
  StructurePlacementMetadata,
  Tile,
  TileKey
} from "@border-empires/shared";
import type { PlayerEffects } from "./server-effects.js";
import type {
  ActiveSiphon,
  PlayerEconomyIndex,
  RuntimeTileCore,
  StrategicResource,
  TileYieldBuffer,
  TownDefinition
} from "./server-shared-types.js";

export type EconomyResourceKey = "GOLD" | StrategicResource;
export type EconomyBreakdownBucket = { label: string; amountPerMinute: number; count: number; resourceKey?: EconomyResourceKey; note?: string };
export type EconomyBreakdownResource = { sources: EconomyBreakdownBucket[]; sinks: EconomyBreakdownBucket[] };
export type EconomyBreakdown = Record<EconomyResourceKey, EconomyBreakdownResource>;

export interface UpkeepBreakdown {
  need: number;
  fromYield: number;
  fromStock: number;
  remaining: number;
  contributors: UpkeepContributor[];
}

export interface UpkeepContributor {
  label: string;
  amountPerMinute: number;
  count?: number;
  note?: string;
}

export interface UpkeepDiagnostics {
  food: UpkeepBreakdown;
  iron: UpkeepBreakdown;
  supply: UpkeepBreakdown;
  crystal: UpkeepBreakdown;
  oil: UpkeepBreakdown;
  gold: UpkeepBreakdown;
  foodCoverage: number;
}

export interface PlayerEconomySnapshot {
  incomePerMinute: number;
  strategicProductionPerMinute: Record<StrategicResource, number>;
  upkeepPerMinute: { food: number; iron: number; supply: number; crystal: number; oil: number; gold: number };
  upkeepLastTick: UpkeepDiagnostics;
  economyBreakdown: EconomyBreakdown;
}

type StructureTileInput = {
  ownershipState?: OwnershipState | undefined;
  resource?: ResourceType | undefined;
  dockId?: string | undefined;
  townPopulationTier?: PopulationTier | undefined;
  supportedTownCount?: number | undefined;
  supportedDockCount?: number | undefined;
};

type BuildableStructureType = "FORT" | "OBSERVATORY" | "SIEGE_OUTPOST" | EconomicStructureType;
type TownFeedingState = { foodCoverage: number; fedTownKeys: Set<TileKey> };

export interface ServerPlayerEconomyRuntimeDeps {
  parseKey: (tileKey: TileKey) => [number, number];
  playerTile: (x: number, y: number) => Tile;
  players: Map<string, Player>;
  townsByTile: Map<TileKey, TownDefinition>;
  docksByTile: Map<TileKey, Dock>;
  fortsByTile: Map<TileKey, Fort>;
  siegeOutpostsByTile: Map<TileKey, SiegeOutpost>;
  observatoriesByTile: Map<TileKey, Observatory>;
  economicStructuresByTile: Map<TileKey, EconomicStructure>;
  ownershipStateByTile: Map<TileKey, OwnershipState>;
  economicStructureTileKeysByPlayer: Map<string, Set<TileKey>>;
  ownership: Map<TileKey, string>;
  getOrInitResourceCounts: (playerId: string) => Record<ResourceType, number>;
  resourceRate: Partial<Record<ResourceType, number>>;
  currentIncomePerMinute: (player: Player) => number;
  strategicProductionPerMinute: (player: Player) => Record<StrategicResource, number>;
  getPlayerEffectsForPlayer: (playerId: string) => PlayerEffects;
  effectiveManpowerAt: (player: Player, nowMs?: number) => number;
  playerManpowerCap: (player: Player) => number;
  townGoldIncomeEnabledForPlayer: (player: Player) => boolean;
  townFoodUpkeepPerMinute: (town: TownDefinition) => number;
  governorUpkeepMultiplierAtTile: (playerId: string, tileKey: TileKey) => number;
  dockIncomeForOwner: (dock: Dock, ownerId: string) => number;
  townIncomeForOwner: (town: TownDefinition, ownerId: string) => number;
  townPopulationTierForTown: (town: TownDefinition) => PopulationTier;
  toStrategicResource: (resource: ResourceType | undefined) => StrategicResource | undefined;
  activeResourceIncomeMult: (playerId: string, resource: ResourceType) => number;
  strategicDailyFromResource: Partial<Record<ResourceType, number>>;
  siphonMultiplierAt: (tileKey: TileKey) => number;
  economicStructureOutputMultAt: (tileKey: TileKey, ownerId: string | undefined) => number;
  converterStructureOutputFor: (structureType: EconomicStructureType, ownerId: string | undefined) => Partial<Record<StrategicResource, number>> | undefined;
  emptyEconomyBreakdown: () => EconomyBreakdown;
  pushEconomyBreakdownBucket: (
    map: Map<string, EconomyBreakdownBucket>,
    label: string,
    amountPerMinute: number,
    options?: { count?: number; resourceKey?: EconomyResourceKey; note?: string }
  ) => void;
  setEconomyBreakdownBucket: (
    map: Map<string, EconomyBreakdownBucket>,
    label: string,
    amountPerMinute: number,
    options?: { count?: number; resourceKey?: EconomyResourceKey; note?: string }
  ) => void;
  sortedEconomyBreakdownBuckets: (map: Map<string, EconomyBreakdownBucket>) => EconomyBreakdownBucket[];
  goldResourceSourceLabel: (resource: ResourceType) => string;
  strategicResourceSourceLabel: (resource: ResourceType) => string;
  getOrInitRevealTargets: (playerId: string) => Set<string>;
  prettyEconomicStructureLabel: (structureType: EconomicStructureType) => string;
  lastUpkeepByPlayer: Map<string, UpkeepDiagnostics>;
  emptyUpkeepDiagnostics: () => UpkeepDiagnostics;
  PASSIVE_INCOME_MULT: number;
  OBSERVATORY_UPKEEP_PER_MIN: number;
  REVEAL_EMPIRE_UPKEEP_PER_MIN: number;
  AIRPORT_OIL_UPKEEP_PER_MIN: number;
  FARMSTEAD_GOLD_UPKEEP: number;
  CAMP_GOLD_UPKEEP: number;
  MINE_GOLD_UPKEEP: number;
  GRANARY_GOLD_UPKEEP: number;
  CARAVANARY_GOLD_UPKEEP: number;
  FUR_SYNTHESIZER_GOLD_UPKEEP: number;
  WOODEN_FORT_GOLD_UPKEEP: number;
  LIGHT_OUTPOST_GOLD_UPKEEP: number;
  IRONWORKS_GOLD_UPKEEP: number;
  CRYSTAL_SYNTHESIZER_GOLD_UPKEEP: number;
  FUEL_PLANT_GOLD_UPKEEP: number;
  FOUNDRY_GOLD_UPKEEP: number;
  GARRISON_HALL_GOLD_UPKEEP: number;
  CUSTOMS_HOUSE_GOLD_UPKEEP: number;
  GOVERNORS_OFFICE_GOLD_UPKEEP: number;
  RADAR_SYSTEM_GOLD_UPKEEP: number;
  MARKET_CRYSTAL_UPKEEP: number;
  BANK_CRYSTAL_UPKEEP: number;
}

export interface ServerPlayerEconomyRuntime {
  upkeepPerMinuteForPlayer: (player: Player) => { food: number; iron: number; supply: number; crystal: number; oil: number; gold: number };
  settledTileGoldUpkeepPerMinuteAt: (playerId: string, tileKey: TileKey) => number;
  roundedUpkeepPerMinute: (amountPerMinute: number) => number;
  tileUpkeepEntriesForTile: (tileKey: TileKey, ownerId: string | undefined) => NonNullable<Tile["upkeepEntries"]>;
  economicStructureGoldUpkeepPerInterval: (structureType: EconomicStructureType) => number;
  economicStructureCrystalUpkeepPerInterval: (structureType: EconomicStructureType, playerId: string) => number;
  pushUpkeepContributor: (map: Map<string, UpkeepContributor>, label: string, amountPerMinute: number, options?: { count?: number; note?: string }) => void;
  sortedUpkeepContributors: (map: Map<string, UpkeepContributor>) => UpkeepContributor[];
  upkeepContributorsForPlayer: (player: Player) => Record<"food" | "iron" | "supply" | "crystal" | "oil" | "gold", UpkeepContributor[]>;
  economyBreakdownForPlayer: (player: Player, upkeepContributors: Record<"food" | "iron" | "supply" | "crystal" | "oil" | "gold", UpkeepContributor[]>) => EconomyBreakdown;
  playerEconomySnapshot: (player: Player) => PlayerEconomySnapshot;
}

export interface ServerEconomicOperationsDeps {
  now: () => number;
  randomUUID: () => string;
  key: (x: number, y: number) => TileKey;
  parseKey: (tileKey: TileKey) => [number, number];
  playerTile: (x: number, y: number) => Tile;
  runtimeTileCore: (x: number, y: number) => RuntimeTileCore;
  players: Map<string, Player>;
  townsByTile: Map<TileKey, TownDefinition>;
  docksByTile: Map<TileKey, Dock>;
  fortsByTile: Map<TileKey, Fort>;
  siegeOutpostsByTile: Map<TileKey, SiegeOutpost>;
  observatoriesByTile: Map<TileKey, Observatory>;
  economicStructuresByTile: Map<TileKey, EconomicStructure>;
  economicStructureTileKeysByPlayer: Map<string, Set<TileKey>>;
  economicStructureBuildTimers: Map<TileKey, NodeJS.Timeout>;
  ownershipStateByTile: Map<TileKey, OwnershipState>;
  ownership: Map<TileKey, string>;
  getOrInitStrategicStocks: (playerId: string) => Partial<Record<StrategicResource, number>>;
  availableYieldStrategicForPlayer: (player: Player, resource: StrategicResource) => number;
  computeTownFeedingState: (playerId: string, availableFood: number) => TownFeedingState;
  townFeedingStateForPlayer: (playerId: string) => TownFeedingState;
  getPlayerEffectsForPlayer: (playerId: string) => PlayerEffects;
  isSupportOnlyStructureType: (structureType: EconomicStructureType) => boolean;
  isLightCombatStructureType: (structureType: EconomicStructureType) => boolean;
  isConverterStructureType: (structureType: EconomicStructureType) => boolean;
  supportedTownKeysForTile: (tileKey: TileKey, ownerId: string) => TileKey[];
  supportedDockKeysForTile: (tileKey: TileKey, ownerId: string) => TileKey[];
  structureForSupportedTown: (tileKey: TileKey, ownerId: string, structureType: EconomicStructureType) => EconomicStructure | undefined;
  pickRandomAvailableSupportTileForTown: (townTileKey: TileKey, ownerId: string, structureType: EconomicStructureType) => TileKey | undefined;
  townPopulationTier: (population: number) => PopulationTier;
  townPopulationTierForTown: (town: TownDefinition) => PopulationTier;
  canStartDevelopmentProcess: (playerId: string) => boolean;
  developmentSlotsBusyReason: (playerId: string) => string;
  structureBuildGoldCost: (structureType: EconomicStructureType, ownedCount: number) => number;
  structurePlacementMetadata: (type: BuildableStructureType) => StructurePlacementMetadata;
  structureShowsOnTile: (type: BuildableStructureType, input: StructureTileInput) => boolean;
  isBorderTile: (x: number, y: number, ownerId: string) => boolean;
  ownedStructureCountForPlayer: (playerId: string, structureType: EconomicStructureType) => number;
  consumeStrategicResource: (player: Player, resource: StrategicResource, amount: number) => boolean;
  recalcPlayerDerived: (player: Player) => void;
  markSummaryChunkDirtyAtTile: (x: number, y: number) => void;
  trackOwnedTileKey: (index: Map<string, Set<TileKey>>, ownerId: string, tileKey: TileKey) => void;
  untrackOwnedTileKey: (index: Map<string, Set<TileKey>>, ownerId: string, tileKey: TileKey) => void;
  recordTileStructureHistory: (tileKey: TileKey, structureType: EconomicStructureType) => void;
  cancelEconomicStructureBuild: (tileKey: TileKey) => void;
  discoverOilFieldNearAirport: (ownerId: string, tileKey: TileKey) => void;
  updateOwnership: (x: number, y: number, ownerId: string | undefined) => void;
  emptyUpkeepDiagnostics: () => UpkeepDiagnostics;
  consumeYieldStrategicForPlayer: (player: Player, resource: StrategicResource, needed: number, touchedTileKeys: Set<TileKey>) => number;
  consumeYieldGoldForPlayer: (player: Player, needed: number, touchedTileKeys: Set<TileKey>) => number;
  upkeepPerMinuteForPlayer: ServerPlayerEconomyRuntime["upkeepPerMinuteForPlayer"];
  upkeepContributorsForPlayer: ServerPlayerEconomyRuntime["upkeepContributorsForPlayer"];
  lastUpkeepByPlayer: Map<string, UpkeepDiagnostics>;
  foodUpkeepCoverageByPlayer: Map<string, number>;
  townFeedingStateByPlayer: Map<string, TownFeedingState>;
  revealedEmpireTargetsByPlayer: Map<string, Set<string>>;
  sendToPlayer: (playerId: string, payload: { type: "REVEAL_EMPIRE_UPDATE"; activeTargets: string[] }) => void;
  getOrInitEconomyIndex: (playerId: string) => PlayerEconomyIndex;
  applyClusterResources: (x: number, y: number, base: ResourceType | undefined) => ResourceType | undefined;
  resourceAt: (x: number, y: number) => ResourceType | undefined;
  resourceRate: Partial<Record<ResourceType, number>>;
  toStrategicResource: (resource: ResourceType | undefined) => StrategicResource | undefined;
  strategicDailyFromResource: Partial<Record<ResourceType, number>>;
  activeResourceIncomeMult: (playerId: string, resource: ResourceType) => number;
  hasPositiveStrategicBuffer: (buffer: Partial<Record<StrategicResource, number>>) => boolean;
  getOrInitTileYield: (tileKey: TileKey) => TileYieldBuffer;
  tileYieldCapsFor: (tileKey: TileKey, ownerId: string | undefined) => { gold: number; strategicEach: number };
  syncObservatoriesForPlayer: (playerId: string, active: boolean) => void;
  activeSiphonAt: (tileKey: TileKey) => ActiveSiphon | undefined;
  addToSiphonCache: (
    casterPlayerId: string,
    targetTileKey: TileKey,
    gold: number,
    strategic: Partial<Record<StrategicResource, number>>,
    expiresAt: number
  ) => void;
  siphonMultiplierAt: (tileKey: TileKey) => number;
  converterStructureOutputFor: (structureType: EconomicStructureType, ownerId: string | undefined) => Partial<Record<StrategicResource, number>> | undefined;
  activeAirportAt: (ownerId: string, tileKey: TileKey) => EconomicStructure | undefined;
  hostileRadarProtectingTile: (actor: Player, x: number, y: number) => TileKey | undefined;
  economicStructureGoldUpkeepPerInterval: (structureType: EconomicStructureType) => number;
  economicStructureUpkeepDue: (structure: EconomicStructure) => boolean;
  prettyEconomicStructureLabel: (structureType: EconomicStructureType) => string;
  economicStructureBuildDurationMs: (structureType: EconomicStructureType) => number;
  structureBuildDurationMsForRuntime: (structureType: BuildableStructureType) => number;
  baseSynthTypeForAdvanced: (structureType: EconomicStructureType) => EconomicStructureType | undefined;
  economicStructureCrystalUpkeepPerInterval: (structureType: EconomicStructureType, playerId: string) => number;
  playerEconomySnapshot: (player: Player) => PlayerEconomySnapshot;
  dockIncomeForOwner: (dock: Dock, ownerId: string) => number;
  townIncomeForOwner: (town: TownDefinition, ownerId: string) => number;
  FORT_BUILD_MS: number;
  OBSERVATORY_BUILD_MS: number;
  SIEGE_OUTPOST_BUILD_MS: number;
  ECONOMIC_STRUCTURE_UPKEEP_INTERVAL_MS: number;
  PASSIVE_INCOME_MULT: number;
  HARVEST_GOLD_RATE_MULT: number;
  HARVEST_RESOURCE_RATE_MULT: number;
  SIPHON_SHARE: number;
  FARMSTEAD_BUILD_FOOD_COST: number;
  CAMP_BUILD_SUPPLY_COST: number;
  MINE_BUILD_RESOURCE_COST: number;
  MARKET_BUILD_CRYSTAL_COST: number;
  GRANARY_BUILD_FOOD_COST: number;
  BANK_BUILD_CRYSTAL_COST: number;
  CARAVANARY_BUILD_CRYSTAL_COST: number;
  GARRISON_HALL_BUILD_CRYSTAL_COST: number;
  CUSTOMS_HOUSE_BUILD_CRYSTAL_COST: number;
  RADAR_SYSTEM_BUILD_CRYSTAL_COST: number;
  AIRPORT_BUILD_CRYSTAL_COST: number;
  MARKET_CRYSTAL_UPKEEP: number;
  BANK_CRYSTAL_UPKEEP: number;
}

export interface ServerEconomicOperations {
  currentFoodCoverageForPlayer: (playerId: string) => number;
  playerHasSettledFoodSources: (playerId: string) => boolean;
  economicStructureBuildDurationMs: (structureType: EconomicStructureType) => number;
  structureBuildDurationMsForRuntime: (structureType: BuildableStructureType) => number;
  baseSynthTypeForAdvanced: (structureType: EconomicStructureType) => EconomicStructureType | undefined;
  canPlaceEconomicStructure: (actor: Player, tile: Tile, structureType: EconomicStructureType) => { ok: boolean; reason?: string };
  tryBuildEconomicStructure: (actor: Player, x: number, y: number, structureType: EconomicStructureType) => { ok: boolean; reason?: string };
  syncEconomicStructuresForPlayer: (player: Player) => Set<TileKey>;
  applyUpkeepForPlayer: (player: Player) => { touchedTileKeys: Set<TileKey> };
  accumulatePassiveIncomeForPlayer: (player: Player) => void;
  addTileYield: (tileKey: TileKey, goldDelta: number, strategicDelta?: Partial<Record<StrategicResource, number>>) => void;
  playerEconomySnapshot: (player: Player) => PlayerEconomySnapshot;
  activeAirportAt: (ownerId: string, tileKey: TileKey) => EconomicStructure | undefined;
  hostileRadarProtectingTile: (actor: Player, x: number, y: number) => TileKey | undefined;
}
