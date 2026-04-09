import type {
  Dock,
  EconomicStructure,
  EconomicStructureType,
  OwnershipState,
  Player,
  PopulationTier,
  ResourceType,
  Tile,
  TileKey
} from "@border-empires/shared";
import type { PlayerEffects } from "./server-effects.js";
import type { ManpowerBreakdownLine, StrategicResource, TownDefinition } from "./server-shared-types.js";

type TownFeedingState = { foodCoverage: number; fedTownKeys: Set<TileKey> };

export interface ServerTownSupportDeps {
  now: () => number;
  parseKey: (tileKey: TileKey) => [number, number];
  key: (x: number, y: number) => TileKey;
  wrapX: (x: number, width: number) => number;
  wrapY: (y: number, height: number) => number;
  chebyshevDistance: (ax: number, ay: number, bx: number, by: number) => number;
  WORLD_WIDTH: number;
  WORLD_HEIGHT: number;
  POPULATION_TOWN_MIN: number;
  MANPOWER_EPSILON: number;
  TOWN_MANPOWER_BY_TIER: Record<PopulationTier, { cap: number; regenPerMinute: number }>;
  townsByTile: Map<TileKey, TownDefinition>;
  ownership: Map<TileKey, string>;
  ownershipStateByTile: Map<TileKey, OwnershipState>;
  townGrowthShockUntilByTile: Map<TileKey, number>;
  townCaptureShockUntilByTile: Map<TileKey, number>;
  terrainAt: (x: number, y: number) => Tile["terrain"];
  ownedTownKeysForPlayer: (playerId: string) => TileKey[];
  isTownFedForOwner: (ownerId: string | undefined, townKey: TileKey) => boolean;
}

export interface ServerTownSupportRuntime {
  applyTownWarShock: (tileKey: TileKey) => void;
  applyTownCaptureShock: (tileKey: TileKey) => void;
  applyTownCapturePopulationLoss: (town: TownDefinition) => void;
  townSupport: (townKey: TileKey, ownerId: string) => { supportCurrent: number; supportMax: number };
  townPopulationTier: (population: number) => PopulationTier;
  townPopulationTierForTown: (town: TownDefinition) => PopulationTier;
  townPopulationMultiplier: (population: number) => number;
  townManpowerSnapshotForOwner: (town: TownDefinition, ownerId: string | undefined) => { cap: number; regenPerMinute: number };
  playerManpowerCap: (player: Player) => number;
  manpowerRegenWeightForSettlementIndex: (index: number) => number;
  prettyTownName: (town: TownDefinition, tileKey?: TileKey) => string;
  playerManpowerRegenPerMinute: (player: Player) => number;
  playerManpowerBreakdown: (player: Player) => { cap: ManpowerBreakdownLine[]; regen: ManpowerBreakdownLine[] };
  effectiveManpowerAt: (player: Player, nowMs?: number) => number;
  townGoldIncomeEnabledForPlayer: (player: Player, nowMs?: number) => boolean;
  applyManpowerRegen: (player: Player) => void;
}

export interface ServerTownEconomyRuntimeDeps {
  now: () => number;
  key: (x: number, y: number) => TileKey;
  parseKey: (tileKey: TileKey) => [number, number];
  resourceAt: (x: number, y: number) => ResourceType | undefined;
  players: Map<string, Player>;
  townsByTile: Map<TileKey, TownDefinition>;
  docksByTile: Map<TileKey, Dock>;
  dockById: Map<string, Dock>;
  economicStructuresByTile: Map<TileKey, EconomicStructure>;
  ownership: Map<TileKey, string>;
  ownershipStateByTile: Map<TileKey, OwnershipState>;
  townCaptureShockUntilByTile: Map<TileKey, number>;
  townGrowthShockUntilByTile: Map<TileKey, number>;
  foodUpkeepCoverageByPlayer: Map<string, number>;
  townFeedingStateByPlayer: Map<string, TownFeedingState>;
  growthPausedUntilByPlayer: Map<string, number>;
  getPlayerEffectsForPlayer: (playerId: string) => PlayerEffects;
  emptyPlayerEffects: () => PlayerEffects;
  getOrInitStrategicStocks: (playerId: string) => Partial<Record<StrategicResource, number>>;
  availableYieldStrategicForPlayer: (player: Player, resource: StrategicResource) => number;
  governorUpkeepMultiplierAtTile: (playerId: string, tileKey: TileKey) => number;
  townPopulationTierForTown: (town: TownDefinition) => PopulationTier;
  townPopulationMultiplier: (population: number) => number;
  townSupport: (townKey: TileKey, ownerId: string) => { supportCurrent: number; supportMax: number };
  townGoldIncomeEnabledForPlayer: (player: Player, nowMs?: number) => boolean;
  ownedTownKeysForPlayer: (playerId: string) => TileKey[];
  firstThreeTownKeySetForPlayer: (playerId: string) => Set<TileKey>;
  structureForSupportedTown: (tileKey: TileKey, ownerId: string | undefined, structureType: EconomicStructureType) => EconomicStructure | undefined;
  structureForSupportedDock: (tileKey: TileKey, ownerId: string | undefined, structureType: EconomicStructureType) => EconomicStructure | undefined;
  POPULATION_MAX: number;
  POPULATION_GROWTH_BASE_RATE: number;
  POPULATION_GROWTH_TICK_MS: number;
  GROWTH_PAUSE_MS: number;
  GROWTH_PAUSE_MAX_MS: number;
  TOWN_BASE_GOLD_PER_MIN: number;
  SETTLEMENT_BASE_GOLD_PER_MIN: number;
  DOCK_INCOME_PER_MIN: number;
  TILE_YIELD_CAP_GOLD: number;
  TILE_YIELD_CAP_RESOURCE: number;
  PASSIVE_INCOME_MULT: number;
  HARVEST_GOLD_RATE_MULT: number;
  resourceRate: Partial<Record<ResourceType, number>>;
  toStrategicResource: (resource: ResourceType | undefined) => StrategicResource | undefined;
  strategicDailyFromResource: Partial<Record<ResourceType, number>>;
  converterStructureOutputFor: (structureType: EconomicStructureType, ownerId: string | undefined) => Partial<Record<StrategicResource, number>> | undefined;
  siphonMultiplierAt: (tileKey: TileKey) => number;
}

export interface ServerTownEconomyRuntime {
  computeTownFeedingState: (playerId: string, availableFood: number) => TownFeedingState;
  townFeedingStateForPlayer: (playerId: string) => TownFeedingState;
  isTownFedForOwner: (townKey: TileKey, ownerId: string | undefined) => boolean;
  townIncomeSuppressed: (townKey: TileKey) => boolean;
  townGrowthSuppressed: (townKey: TileKey) => boolean;
  dockSummaryForOwner: (dock: Dock, ownerId: string | undefined) => Tile["dock"] | undefined;
  dockIncomeForOwner: (dock: Dock, ownerId: string | undefined) => number;
  dockCapForOwner: (dock: Dock, ownerId: string | undefined) => number;
  townPotentialIncomeForOwner: (town: TownDefinition, ownerId: string | undefined, options?: { ignoreSuppression?: boolean; ignoreManpowerGate?: boolean }) => number;
  townIncomeForOwner: (town: TownDefinition, ownerId: string | undefined) => number;
  townCapForOwner: (town: TownDefinition, ownerId: string | undefined) => number;
  townFoodUpkeepPerMinute: (town: TownDefinition) => number;
  pausePopulationGrowthFromWar: (playerId: string) => void;
  townGrowthModifiersForOwner: (town: TownDefinition, ownerId: string | undefined) => Array<{ label: "Recently captured" | "Nearby war" | "Long time peace"; deltaPerMinute: number }>;
  updateTownPopulationForPlayer: (player: Player) => Set<TileKey>;
  townPopulationGrowthPerMinuteForOwner: (town: TownDefinition, ownerId: string | undefined) => number;
  tileYieldCapsFor: (tileKey: TileKey, ownerId: string | undefined) => { gold: number; strategicEach: number };
}
