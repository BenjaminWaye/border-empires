import type {
  AetherWallDirection,
  BarbarianAgent,
  ClusterType,
  Dock,
  EconomicStructure,
  EconomicStructureType,
  Fort,
  MissionKind,
  MissionState,
  MissionStats,
  OwnershipState,
  Player,
  PopulationTier,
  ResourceType,
  Season,
  SeasonVictoryObjectiveView,
  SeasonVictoryPathId,
  SeasonWinnerView,
  SiegeOutpost,
  StrategicReplayEvent,
  RevealEmpireStatsView,
  Tile,
  TileKey
} from "@border-empires/shared";
import type { AuthIdentity } from "./server-auth.js";

export interface AllianceRequest {
  id: string;
  fromPlayerId: string;
  toPlayerId: string;
  createdAt: number;
  expiresAt: number;
  fromName?: string;
  toName?: string;
}

export type ManpowerBreakdownLine = {
  label: string;
  amount: number;
  note?: string;
};

export interface TruceRequest {
  id: string;
  fromPlayerId: string;
  toPlayerId: string;
  createdAt: number;
  expiresAt: number;
  durationHours: 12 | 24;
  fromName?: string;
  toName?: string;
}

export interface ActiveTruce {
  playerAId: string;
  playerBId: string;
  startedAt: number;
  endsAt: number;
  createdByPlayerId: string;
}

export type VictoryPressureTracker = {
  leaderPlayerId?: string;
  holdStartedAt?: number;
  holdAnnouncedAt?: number;
  lastRemainingMilestoneHours?: number;
};

export type LeaderboardOverallEntry = {
  id: string;
  name: string;
  tiles: number;
  incomePerMinute: number;
  techs: number;
  score: number;
  rank: number;
};

export type LeaderboardMetricEntry = {
  id: string;
  name: string;
  value: number;
  rank: number;
};

export type LeaderboardSnapshotView = {
  overall: LeaderboardOverallEntry[];
  selfOverall: LeaderboardOverallEntry | undefined;
  selfByTiles: LeaderboardMetricEntry | undefined;
  selfByIncome: LeaderboardMetricEntry | undefined;
  selfByTechs: LeaderboardMetricEntry | undefined;
  byTiles: LeaderboardMetricEntry[];
  byIncome: LeaderboardMetricEntry[];
  byTechs: LeaderboardMetricEntry[];
};

export type PlayerCompetitionMetrics = {
  playerId: string;
  name: string;
  tiles: number;
  settledTiles: number;
  incomePerMinute: number;
  techs: number;
  controlledTowns: number;
};

export type VictoryPressureDefinition = {
  id: SeasonVictoryPathId;
  name: string;
  description: string;
  holdDurationSeconds: number;
};

export interface MissionDef {
  id: string;
  kind: MissionKind;
  name: string;
  description: string;
  unlockPoints: number;
  prerequisiteId?: string;
  target: number;
  rewardPoints: number;
  rewardLabel?: string;
}

export interface SeasonArchiveEntry {
  seasonId: string;
  endedAt: number;
  mostTerritory: Array<{ playerId: string; name: string; value: number }>;
  mostPoints: Array<{ playerId: string; name: string; value: number }>;
  longestSurvivalMs: Array<{ playerId: string; name: string; value: number }>;
  winner?: SeasonWinnerView;
  replayEvents?: StrategicReplayEvent[];
}

export interface SnapshotState {
  world: { width: number; height: number };
  townPlacementsNormalized?: boolean;
  players: Array<
    Omit<Player, "techIds" | "domainIds" | "territoryTiles" | "allies"> & {
      techIds: string[];
      domainIds?: string[];
      territoryTiles: TileKey[];
      allies: string[];
      missions?: MissionState[];
      missionStats?: MissionStats;
    }
  >;
  ownership: [TileKey, string][];
  ownershipState?: [TileKey, OwnershipState][];
  settledSince?: [TileKey, number][];
  barbarianAgents?: BarbarianAgent[];
  authIdentities?: AuthIdentity[];
  resources: [string, Record<ResourceType, number>][];
  strategicResources?: [string, Record<StrategicResource, number>][];
  strategicResourceBuffer?: [string, Record<StrategicResource, number>][];
  tileYield?: [TileKey, TileYieldBuffer][];
  tileHistory?: [TileKey, TileHistoryState][];
  terrainShapes?: [TileKey, TerrainShapeState][];
  seasonVictory?: [SeasonVictoryPathId, VictoryPressureTracker][];
  frontierSettlements?: [string, number[]][];
  dynamicMissions?: [string, DynamicMissionDef[]][];
  temporaryAttackBuffUntil?: [string, number][];
  temporaryIncomeBuff?: [string, { until: number; resources: [ResourceType, ResourceType] }][];
  forcedReveal?: [string, TileKey[]][];
  revealedEmpireTargets?: [string, string[]][];
  allianceRequests?: AllianceRequest[];
  forts?: Fort[];
  observatories?: Observatory[];
  siegeOutposts?: SiegeOutpost[];
  economicStructures?: EconomicStructure[];
  sabotage?: ActiveSabotage[];
  abilityCooldowns?: [string, [AbilityDefinition["id"], number][]][];
  aetherWalls?: ActiveAetherWall[];
  docks?: Dock[];
  towns?: TownDefinition[];
  shardSites?: ShardSiteState[];
  firstSpecialSiteCaptureClaimed?: TileKey[];
  clusters?: ClusterDefinition[];
  clusterTiles?: [TileKey, string][];
  pendingSettlements?: Array<{ tileKey: TileKey; ownerId: string; startedAt: number; resolvesAt: number; goldCost: number }>;
  townCaptureShock?: [TileKey, number][];
  townGrowthShock?: [TileKey, number][];
  season?: Season;
  seasonWinner?: SeasonWinnerView;
  seasonArchives?: SeasonArchiveEntry[];
  seasonTechConfig?: Omit<SeasonalTechConfig, "activeNodeIds"> & { activeNodeIds: string[] };
}

export interface SnapshotMetaSection {
  world: { width: number; height: number };
  townPlacementsNormalized?: boolean;
  season?: Season;
  seasonWinner?: SeasonWinnerView;
  seasonArchives?: SeasonArchiveEntry[];
  seasonTechConfig?: Omit<SeasonalTechConfig, "activeNodeIds"> & { activeNodeIds: string[] };
}

export interface SnapshotPlayersSection {
  players: SnapshotState["players"];
  authIdentities?: AuthIdentity[];
}

export interface SnapshotTerritorySection {
  ownership: [TileKey, string][];
  ownershipState?: [TileKey, OwnershipState][];
  settledSince?: [TileKey, number][];
  barbarianAgents?: BarbarianAgent[];
  tileHistory?: [TileKey, TileHistoryState][];
  terrainShapes?: [TileKey, TerrainShapeState][];
  docks?: Dock[];
  towns?: TownDefinition[];
  shardSites?: ShardSiteState[];
  firstSpecialSiteCaptureClaimed?: TileKey[];
  clusters?: ClusterDefinition[];
  clusterTiles?: [TileKey, string][];
  townCaptureShock?: [TileKey, number][];
  townGrowthShock?: [TileKey, number][];
}

export interface SnapshotEconomySection {
  resources: [string, Record<ResourceType, number>][];
  strategicResources?: [string, Record<StrategicResource, number>][];
  strategicResourceBuffer?: [string, Record<StrategicResource, number>][];
  tileYield?: [TileKey, TileYieldBuffer][];
  frontierSettlements?: [string, number[]][];
  dynamicMissions?: [string, DynamicMissionDef[]][];
  temporaryAttackBuffUntil?: [string, number][];
  temporaryIncomeBuff?: [string, { until: number; resources: [ResourceType, ResourceType] }][];
  pendingSettlements?: Array<{ tileKey: TileKey; ownerId: string; startedAt: number; resolvesAt: number; goldCost: number }>;
}

export interface SnapshotSystemsSection {
  seasonVictory?: [SeasonVictoryPathId, VictoryPressureTracker][];
  forcedReveal?: [string, TileKey[]][];
  revealedEmpireTargets?: [string, string[]][];
  allianceRequests?: AllianceRequest[];
  forts?: Fort[];
  observatories?: Observatory[];
  siegeOutposts?: SiegeOutpost[];
  economicStructures?: EconomicStructure[];
  sabotage?: ActiveSabotage[];
  abilityCooldowns?: [string, [AbilityDefinition["id"], number][]][];
  aetherWalls?: ActiveAetherWall[];
}

export interface SnapshotSectionIndex {
  formatVersion: 2;
  sections: Record<"meta" | "players" | "territory" | "economy" | "systems", string>;
}

export interface ClusterDefinition {
  clusterId: string;
  clusterType: ClusterType;
  resourceType?: ResourceType;
  centerX: number;
  centerY: number;
  radius: number;
  controlThreshold: number;
}

export interface SeasonalTechConfig {
  configId: string;
  rootNodeIds: string[];
  activeNodeIds: Set<string>;
  balanceConstants: Record<string, number>;
}

export interface TownDefinition {
  townId: string;
  tileKey: TileKey;
  name?: string;
  type: "MARKET" | "FARMING";
  population: number;
  maxPopulation: number;
  connectedTownCount: number;
  connectedTownBonus: number;
  lastGrowthTickAt: number;
  isSettlement?: boolean;
}

export interface ShardSiteState {
  tileKey: TileKey;
  kind: "CACHE" | "FALL";
  amount: number;
  expiresAt?: number;
}

export interface TileHistoryState {
  lastOwnerId?: string | null;
  previousOwners: string[];
  captureCount: number;
  lastCapturedAt?: number | null;
  lastStructureType?: "FORT" | "SIEGE_OUTPOST" | "OBSERVATORY" | EconomicStructureType | null;
  structureHistory: Array<"FORT" | "SIEGE_OUTPOST" | "OBSERVATORY" | EconomicStructureType>;
  wasMountainCreatedByPlayer?: boolean;
  wasMountainRemovedByPlayer?: boolean;
}

export interface TerrainShapeState {
  terrain: "LAND" | "MOUNTAIN";
  createdByPlayer: boolean;
}

export type StrategicResource = "FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD" | "OIL";
export const STRATEGIC_RESOURCE_KEYS: readonly StrategicResource[] = ["FOOD", "IRON", "CRYSTAL", "SUPPLY", "SHARD", "OIL"];

export interface Observatory {
  observatoryId: string;
  ownerId: string;
  tileKey: TileKey;
  status: "under_construction" | "active" | "inactive" | "removing";
  completesAt?: number;
  cooldownUntil?: number;
  previousStatus?: "active" | "inactive";
}

export interface ActiveSabotage {
  targetTileKey: TileKey;
  casterPlayerId: string;
  endsAt: number;
  outputMultiplier?: number;
}

export interface ActiveSiphon {
  targetTileKey: TileKey;
  casterPlayerId: string;
  endsAt: number;
}

export interface SiphonCache {
  siphonId: string;
  targetTileKey: TileKey;
  expiresAt: number;
  strategic: Partial<Record<StrategicResource, number>>;
  gold: number;
}

export interface ActiveAetherBridge {
  bridgeId: string;
  ownerId: string;
  fromTileKey: TileKey;
  toTileKey: TileKey;
  startedAt: number;
  endsAt: number;
}

export interface ActiveAetherWall {
  wallId: string;
  ownerId: string;
  originTileKey: TileKey;
  direction: AetherWallDirection;
  length: 1 | 2 | 3;
  startedAt: number;
  endsAt: number;
}

export interface TileYieldBuffer {
  gold: number;
  strategic: Record<StrategicResource, number>;
}

export interface RuntimeTileCore {
  x: number;
  y: number;
  tileKey: TileKey;
  terrain: Tile["terrain"];
  ownerId: string | undefined;
  ownershipState: OwnershipState | undefined;
  resource: ResourceType | undefined;
}

export interface PlayerEconomyIndex {
  settledResourceTileKeys: Set<TileKey>;
  settledDockTileKeys: Set<TileKey>;
  settledTownTileKeys: Set<TileKey>;
}

export interface AbilityDefinition {
  id: "reveal_empire" | "reveal_empire_stats" | "aether_bridge" | "aether_wall" | "siphon" | "create_mountain" | "remove_mountain";
  name: string;
  requiredTechIds: string[];
  crystalCost: number;
  cooldownMs: number;
  upkeepCrystalPerMinute?: number;
  durationMs?: number;
}

export interface RevealEmpireStatsResult {
  stats: RevealEmpireStatsView;
}

export interface DynamicMissionDef {
  id: string;
  type: "VENDETTA" | "DOCK_HUNT" | "RESOURCE_CHAIN" | "TOWN_SUPREMACY" | "SETTLER_SURGE";
  expiresAt: number;
  targetPlayerId?: string;
  targetDockCount?: number;
  focusResources?: [ResourceType, ResourceType];
  targetSettlements?: number;
  targetTowns?: number;
  completed: boolean;
  rewarded: boolean;
}
