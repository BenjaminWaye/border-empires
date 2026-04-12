import type { AiSeasonVictoryPathId } from "./ai/goap.js";
import type { VisibilitySnapshot } from "./chunk/snapshots.js";
import type { Player, Tile, TileKey } from "@border-empires/shared";

export type AiFrontierCandidatePair = {
  from: Tile;
  to: Tile;
};

export type AiScoutAdjacencyMetrics = {
  ownedNeighbors: number;
  alliedSettledNeighbors: number;
  frontierNeighbors: number;
  coastlineDiscoveryValue: number;
  exposedSides: number;
};

export type AiSettlementCandidateEvaluation = {
  score: number;
  isEconomicallyInteresting: boolean;
  isStrategicallyInteresting: boolean;
  isDefensivelyCompact: boolean;
  supportsImmediatePlan: boolean;
  townSupportSignal: number;
  intrinsicDockValue: number;
  islandFootprintSignal: number;
};

export type AiFrontierPlanningSummary = {
  neutralExpandAvailable: boolean;
  openingScoutAvailable: boolean;
  scoutExpandAvailable: boolean;
  economicExpandAvailable: boolean;
  scaffoldExpandAvailable: boolean;
  islandExpandAvailable: boolean;
  frontierOpportunityEconomic: number;
  frontierOpportunityScout: number;
  frontierOpportunityScaffold: number;
  frontierOpportunityWaste: number;
  bestEconomicExpand?: { from: Tile; to: Tile };
  bestScoutExpand?: { from: Tile; to: Tile };
  bestScaffoldExpand?: { from: Tile; to: Tile };
  bestIslandExpand?: { from: Tile; to: Tile };
  bestAnyNeutralExpand?: { from: Tile; to: Tile };
};

export type AiTerritorySummary = {
  visibility: VisibilitySnapshot;
  settledTileCount: number;
  frontierTileCount: number;
  settledTiles: Tile[];
  frontierTiles: Tile[];
  expandCandidates: AiFrontierCandidatePair[];
  attackCandidates: AiFrontierCandidatePair[];
  borderSettledTileKeys: Set<TileKey>;
  structureCandidateTiles: Tile[];
  underThreat: boolean;
  worldFlags: Set<string>;
  controlledTowns: number;
  neutralTownExpandCount: number;
  neutralEconomicExpandCount: number;
  neutralLandExpandCount: number;
  hostileTownAttackCount: number;
  hostileEconomicAttackCount: number;
  barbarianAttackAvailable: boolean;
  enemyAttackAvailable: boolean;
  foodPressure: number;
  settlementEvaluationByKey: Map<string, AiSettlementCandidateEvaluation>;
  scoutRevealCountByTileKey: Map<TileKey, number>;
  scoutRevealValueByProfileKey: Map<string, number>;
  scoutAdjacencyByTileKey: Map<TileKey, AiScoutAdjacencyMetrics>;
  supportedTownKeysByTileKey: Map<TileKey, TileKey[]>;
  dockSignalByTileKey: Map<TileKey, number>;
  economicSignalByTileKey: Map<TileKey, number>;
  pressureSignalByTileKey: Map<TileKey, number>;
  islandFootprintSignalByTileKey: Map<TileKey, number>;
  frontierPlanningSummary?: AiFrontierPlanningSummary;
  islandProgress?: {
    settledCounts: Map<number, number>;
    ownedCounts: Map<number, number>;
    landCounts: Map<number, number>;
    totalIslands: number;
    undercoveredIslandCount: number;
    ownedUndercoveredIslandCount: number;
    weakestRatio: number;
  };
  islandFocusTargetId: number | undefined;
  scoutRevealMarks: Uint32Array;
  scoutRevealStamp: number;
};

export type AiTerritoryStructureCache = {
  version: number;
  settledTileCount: number;
  frontierTileCount: number;
  settledTiles: Tile[];
  frontierTiles: Tile[];
  expandCandidates: AiFrontierCandidatePair[];
  attackCandidates: AiFrontierCandidatePair[];
  borderSettledTileKeys: Set<TileKey>;
  structureCandidateTiles: Tile[];
  underThreat: boolean;
  worldFlags: Set<string>;
  controlledTowns: number;
  neutralTownExpandCount: number;
  neutralEconomicExpandCount: number;
  neutralLandExpandCount: number;
  hostileTownAttackCount: number;
  hostileEconomicAttackCount: number;
  barbarianAttackAvailable: boolean;
  enemyAttackAvailable: boolean;
  scoutRevealCountByTileKey: Map<TileKey, number>;
  scoutRevealValueByProfileKey: Map<string, number>;
  scoutAdjacencyByTileKey: Map<TileKey, AiScoutAdjacencyMetrics>;
};

export type AiPlanningStaticCache = {
  version: number;
  openingScoutAvailable: boolean;
  neutralExpandAvailable: boolean;
  economicExpandAvailable: boolean;
  scoutExpandAvailable: boolean;
  scaffoldExpandAvailable: boolean;
  barbarianAttackAvailable: boolean;
  enemyAttackAvailable: boolean;
  pressureAttackScore: number;
  pressureThreatensCore: boolean;
  settlementAvailable: boolean;
  townSupportSettlementAvailable: boolean;
  islandExpandAvailable: boolean;
  islandSettlementAvailable: boolean;
  weakestIslandRatio: number;
  undercoveredIslandCount: number;
  fortAvailable: boolean;
  fortProtectsCore: boolean;
  fortIsDockChokePoint: boolean;
  economicBuildAvailable: boolean;
  siegeOutpostAvailable: boolean;
  frontierOpportunityEconomic: number;
  frontierOpportunityScout: number;
  frontierOpportunityScaffold: number;
  frontierOpportunityWaste: number;
};

export type AiSettlementSelectorCache = {
  version: number;
  pendingSettlementCount: number;
  settlementByVictoryPath: Map<string, TileKey | null>;
  townSupportSettlementByVictoryPath: Map<string, TileKey | null>;
  islandSettlementByVictoryPath: Map<string, TileKey | null>;
  frontierSummaryByKey: Map<string, AiFrontierSettlementSummary>;
};

export type AiFrontierSettlementSummary = {
  bestSettlementKey: TileKey | null;
  settlementAvailable: boolean;
  bestTownSupportSettlementKey: TileKey | null;
  townSupportSettlementAvailable: boolean;
  bestIslandSettlementKey: TileKey | null;
  islandSettlementAvailable: boolean;
};

export type AiSettlementAvailabilityProfile = {
  settlementAvailable: boolean;
  townSupportSettlementAvailable: boolean;
  islandSettlementAvailable: boolean;
};

export type AiFrontierAvailabilityProfile = {
  neutralExpandAvailable: boolean;
  openingScoutAvailable: boolean;
  scoutExpandAvailable: boolean;
  economicExpandAvailable: boolean;
  scaffoldExpandAvailable: boolean;
  frontierOpportunityEconomic: number;
  frontierOpportunityScout: number;
  frontierOpportunityScaffold: number;
  frontierOpportunityWaste: number;
};

export type AiFrontierOpportunityCounts = {
  economic: number;
  scout: number;
  scaffold: number;
  waste: number;
};

export type AiNeutralFrontierClass = "economic" | "scaffold" | "scout" | "waste";

export type AiEconomyPriorityState = {
  controlledTowns: number;
  settledTiles: number;
  aiIncome: number;
  worldFlags: Set<string>;
  foodCoverageLow: boolean;
  economyWeak: boolean;
};

export type CollectAiTerritorySummary = (actor: Player) => AiTerritorySummary;
export type AiCandidatePair = { from: Tile; to: Tile };
export type AiScoredCandidatePair = { from: Tile; to: Tile; score: number };
export type AiOptionalVictoryPath = AiSeasonVictoryPathId | undefined;
