import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import {
  aetherWallEdgeKey,
  ATTACK_MANPOWER_COST,
  ATTACK_MANPOWER_MIN,
  BARBARIAN_ACTION_INTERVAL_MS,
  BARBARIAN_ATTACK_POWER,
  BARBARIAN_CLEAR_GOLD_REWARD,
  BARBARIAN_DEFENSE_POWER,
  BARBARIAN_MULTIPLY_THRESHOLD,
  buildAetherWallSegments,
  BREAKTHROUGH_ATTACK_MANPOWER_COST,
  BREAKTHROUGH_ATTACK_MANPOWER_MIN,
  CHUNK_SIZE,
  CLUSTER_COUNT_MAX,
  CLUSTER_COUNT_MIN,
  ClientMessageSchema,
  COMBAT_LOCK_MS,
  DEEP_STRIKE_MANPOWER_COST,
  DEEP_STRIKE_MANPOWER_MIN,
  DEVELOPMENT_PROCESS_LIMIT,
  ECONOMIC_STRUCTURE_BUILD_MS,
  FRONTIER_CLAIM_MS,
  DOCK_CROSSING_COOLDOWN_MS,
  DOCK_DEFENSE_MULT,
  DOCK_PAIRS_MAX,
  DOCK_PAIRS_MIN,
  FORT_BUILD_COST,
  FORT_BUILD_MS,
  LIGHT_OUTPOST_BUILD_MS,
  OBSERVATORY_BUILD_MS,
  OBSERVATORY_UPKEEP_PER_MIN,
  SIEGE_OUTPOST_BUILD_COST,
  SIEGE_OUTPOST_BUILD_MS,
  WOODEN_FORT_BUILD_MS,
  PVP_REPEAT_FLOOR,
  PVP_REPEAT_WINDOW_MS,
  SEASON_LENGTH_DAYS,
  type ActiveAetherWallView,
  type AetherWallDirection,
  type RevealEmpireStatsView,
  SETTLED_DEFENSE_NEAR_FORT_RADIUS,
  SETTLE_COST,
  SETTLE_MS,
  STAMINA_MAX,
  VISION_RADIUS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  INITIAL_BARBARIAN_COUNT,
  MANPOWER_BASE_CAP,
  MANPOWER_BASE_REGEN_PER_MINUTE,
  NAVAL_INFILTRATION_MANPOWER_MIN,
  NAVAL_INFILTRATION_MANPOWER_COST,
  combatWinChance,
  defensivenessMultiplier,
  levelFromPoints,
  landBiomeAt,
  grassShadeAt,
  pvpPointsReward,
  randomFactor,
  ratingFromPointsLevel,
  regionTypeAt,
  resourceAt,
  setWorldSeed,
  structureBaseGoldCost,
  structureBuildGoldCost,
  structurePlacementMetadata,
  structureShowsOnTile,
  continentIdAt,
  exposureWeightFromSides,
  terrainAt,
  wrapX,
  wrapY,
  wrappedChebyshevDistance,
  type Player,
  type PendingResearch,
  type MissionKind,
  type MissionState,
  type MissionStats,
  type ClusterType,
  type Terrain,
  type OwnershipState,
  type PopulationTier,
  type ResourceType,
  type Season,
  type SeasonVictoryObjectiveView,
  type SeasonWinnerView,
  type SeasonVictoryPathId,
  type StrategicReplayEvent,
  type Tile,
  type TileKey,
  type Fort,
  type SiegeOutpost,
  type Dock,
  type BarbarianAgent,
  type EconomicStructure,
  type EconomicStructureType,
  type ClientMessage,
} from "@border-empires/shared";
import crypto from "node:crypto";
import os from "node:os";
import { currentShardRainNotice, nextShardRainStartAt } from "./server-shard-rain.js";
import {
  findAllianceRequestBetweenPlayers,
  findAllianceRequestForRecipient,
  findAllianceRequestForSender
} from "./server-alliance-request-runtime.js";
import { createServerRuntimeAdminDashboard } from "./server-runtime-admin-dashboard.js";
import { renderRuntimeDashboardHtml } from "./server-runtime-dashboard-html.js";
import { createServerDebugBundleStore } from "./server-debug-bundle.js";
import { registerServerHttpRoutes } from "./server-http-routes.js";
import { createServerPlayerProgression } from "./server-player-progression.js";
import { createServerStatusMetrics } from "./server-status-metrics.js";
import { createServerVictoryPressure } from "./server-victory-pressure.js";
import { createServerTechDomainRuntime } from "./server-tech-domain-runtime.js";
import { createServerEconomyStateRuntime } from "./server-economy-state-runtime.js";
import { createServerPlayerEffectsRuntime } from "./server-player-effects-runtime.js";
import { createServerPlayerRuntimeSupport } from "./server-player-runtime-support.js";
import { createServerOwnershipRuntime } from "./server-ownership-runtime.js";
import { createServerSnapshotIoRuntime } from "./server-snapshot-io.js";
import { createServerSnapshotHydrateRuntime } from "./server-snapshot-hydrate.js";
import { createServerPlayerIdentityRuntime } from "./server-player-identity-runtime.js";
import { createServerAiFrontierSignalsRuntime } from "./server-ai-frontier-signals.js";
import { createServerAiFrontierTerritoryRuntime } from "./server-ai-frontier-territory.js";
import { createServerAiFrontierScoutRuntime } from "./server-ai-frontier-scout.js";
import { createServerAiFrontierSettlementRuntime } from "./server-ai-frontier-settlement.js";
import { createServerAiFrontierPressureRuntime } from "./server-ai-frontier-pressure.js";
import { createServerAiFrontierSelectionRuntime } from "./server-ai-frontier-selection-runtime.js";
import { createServerAiFrontierPlanningRuntime } from "./server-ai-frontier-planning-runtime.js";
import { createServerAiVictoryPathRuntime } from "./server-ai-victory-path-runtime.js";
import type { AiFrontPosture, AiStrategicFocus, AiStrategicState, AiTurnAnalysis } from "./server-ai-planning-types.js";
import type {
  AiFrontierAvailabilityProfile,
  AiFrontierCandidatePair,
  AiFrontierOpportunityCounts,
  AiFrontierPlanningSummary,
  AiFrontierSettlementSummary,
  AiNeutralFrontierClass,
  AiPlanningStaticCache,
  AiScoutAdjacencyMetrics,
  AiSettlementAvailabilityProfile,
  AiSettlementCandidateEvaluation,
  AiSettlementSelectorCache,
  AiTerritoryStructureCache,
  AiTerritorySummary
} from "./server-ai-frontier-types.js";
import { createServerVisibilityStateRuntime } from "./server-visibility-state-runtime.js";
import { createServerChunkSyncRuntime } from "./server-chunk-sync-runtime.js";
import { createServerCombatSupportRuntime } from "./server-combat-support-runtime.js";
import { createServerRealtimeSyncRuntime } from "./server-realtime-sync-runtime.js";
import {
  createServerFrontierActionRuntime
} from "./server-frontier-action-runtime.js";
import {
  createServerPlayerUpdateRuntime,
  type PlayerUpdateOptions
} from "./server-player-update-runtime.js";
import { syncForcedRevealTileUpdatesForPlayer } from "./server-reveal-sync.js";
import { createServerTileViewRuntime } from "./server-tile-view-runtime.js";
import type { PendingCapture, PrecomputedFrontierCombat } from "./server-frontier-action-types.js";
import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import { Worker } from "node:worker_threads";
import { z } from "zod";
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { loadTechTree, type StatsModKey } from "./tech-tree.js";
import { loadDomainTree } from "./domain-tree.js";
import { buildAdminPlayerListPayload } from "./player-admin-payload.js";
import type { AiSeasonVictoryPathId } from "./ai/goap.js";
import {
  clearAllAiLatchedIntents,
  createAiIntentLatchState,
  latchAiIntent,
  probeAiLatchedIntent,
  releaseAiLatchedIntent,
  reserveAiTarget,
  type AiLatchedIntent,
  type AiLatchedIntentKind
} from "./ai/intent-latch.js";
import {
  cachedAiExecuteCandidate,
  clearAllAiExecuteCandidates,
  createAiExecuteCandidateCacheState,
  type AiExecuteCandidate
} from "./ai/execute-candidate-cache.js";
import {
  hasAiGrowthFoundation,
  isAiAttackReady,
  isAiScoutExpansionWorthwhile,
  shouldAiStayInIslandFootprint
} from "./ai/tempo-policy.js";
import { planAiDecision, type AiPlanningDecision, type AiPlanningSnapshot } from "./ai/planner-shared.js";
import { resolveCombatRoll, type CombatResolutionRequest, type CombatResolutionResult } from "./sim/combat-shared.js";
import {
  createAiRuntime
} from "./sim/ai-runtime.js";
import {
  createAiIndexStore
} from "./sim/ai-index-store.js";
import {
  createSimulationChunkState
} from "./sim/chunk-state.js";
import {
  createChunkReadManager
} from "./sim/chunk-read-manager.js";
import {
  createSimulationService,
  type QueuedSimulationMessage,
  type SimulationCommand,
  type SystemSimulationCommand
} from "./sim/service.js";
import { buildChunkFromInput, serializeChunkBatchBodies, serializeChunkBody, type ChunkBuildInput, type ChunkPayloadChunk } from "./chunk/serializer-shared.js";
import {
  createChunkSnapshotController,
  type ChunkFollowUpStage,
  type ChunkSummaryMode,
  type VisibilitySnapshot
} from "./chunk/snapshots.js";
import { assignMissingTownNames } from "./town-names.js";
import { createRuntimeIncidentLog } from "./runtime-incident-log.js";
import { createSnapshotSaveRunner } from "./snapshot-save-runner.js";
import { resolvePlayerTechPayloadSnapshot } from "./server-tech-payload-guard.js";
import {
  AI_AUTH_PRIORITY_BATCH_SIZE,
  AI_COMPETITION_CONTEXT_TTL_MS,
  AI_DEFENSE_PRIORITY_MS,
  AI_DISPATCH_INTERVAL_MS,
  AI_EVENT_LOOP_P95_HARD_LIMIT_MS,
  AI_EVENT_LOOP_P95_SOFT_LIMIT_MS,
  AI_EVENT_LOOP_UTILIZATION_HARD_LIMIT_PCT,
  AI_EVENT_LOOP_UTILIZATION_SOFT_LIMIT_PCT,
  AI_FRONTIER_SELECTOR_BUDGET_MS,
  AI_HUMAN_DEFENSE_BATCH_SIZE,
  AI_HUMAN_PRIORITY_BATCH_SIZE,
  AI_PLANNER_TIMEOUT_MS,
  AI_PLANNER_WORKER_ENABLED,
  AI_PLAYERS,
  AI_SIM_QUEUE_SOFT_LIMIT,
  AI_TICK_BATCH_SIZE,
  AI_TICK_BUDGET_MS,
  AI_TICK_MS,
  AI_WORKER_QUEUE_SOFT_LIMIT,
  AI_YIELD_COLLECTION_INTERVAL_MS,
  CHUNK_READ_WORKER_ENABLED,
  CHUNK_SERIALIZER_TIMEOUT_MS,
  CHUNK_SERIALIZER_WORKER_ENABLED,
  CHUNK_STREAM_BATCH_SIZE,
  DEBUG_SPAWN_NEAR_AI,
  TILE_SYNC_DEBUG,
  TILE_SYNC_DEBUG_EMAILS,
  DISABLE_FOG,
  FOG_ADMIN_EMAIL,
  MAX_SUBSCRIBE_RADIUS,
  NOOP_WS,
  PORT,
  RUNTIME_INCIDENT_WEBHOOK_URL,
  SIM_COMBAT_TIMEOUT_MS,
  SIM_COMBAT_WORKER_ENABLED,
  SIM_DRAIN_AI_QUOTA,
  SIM_DRAIN_BUDGET_MS,
  SIM_DRAIN_HUMAN_QUOTA,
  SIM_DRAIN_MAX_COMMANDS,
  SIM_DRAIN_SYSTEM_QUOTA,
  SNAPSHOT_DIR,
  SNAPSHOT_FILE,
  SNAPSHOT_INDEX_FILE,
  SNAPSHOT_SECTION_FILES,
  STARTING_MANPOWER,
  logRuntimeError,
  logStartupPhase,
  perfRing,
  percentile,
  roundTo,
  runtimeState,
  runtimeCpuCount,
  runtimeMemoryStats,
  sampleRuntimeVitals,
  snapshotSectionFile,
  startupState,
  type Ws
} from "./server-runtime-config.js";
import {
  AUTH_PRIORITY_WINDOW_MS,
  AuthIdentity,
  authPressureState,
  authSyncTimingByPlayer,
  cacheVerifiedFirebaseIdentity,
  cachedFirebaseIdentityForDecodedToken,
  cachedFirebaseIdentityForToken,
  classifyAuthError,
  decodeFirebaseTokenFallback,
  sendLoginPhase,
  verifiedFirebaseTokenCacheSize,
  verifyFirebaseToken
} from "./server-auth.js";
import {
  enqueueLowPrioritySocketMessage,
  pauseLowPrioritySocketMessages,
  sendHighPrioritySocketMessage
} from "./server-socket-priority.js";
import {
  broadcastBulk as broadcastBulkAcrossSockets,
  bulkSocketForPlayer as resolveBulkSocketForPlayer,
  controlSocketForPlayer as resolveControlSocketForPlayer,
  sendBulkToPlayer as sendBulkPayloadToPlayer
} from "./server-player-sockets.js";
import {
  type AbilityDefinition,
  type ActiveAetherBridge,
  type ActiveAetherWall,
  type ActiveSabotage,
  type ActiveSiphon,
  type ActiveTruce,
  type AllianceRequest,
  type ClusterDefinition,
  type DynamicMissionDef,
  type LeaderboardMetricEntry,
  type LeaderboardOverallEntry,
  type LeaderboardSnapshotView,
  type ManpowerBreakdownLine,
  type MissionDef,
  type Observatory,
  type PlayerCompetitionMetrics,
  type PlayerEconomyIndex,
  type RuntimeTileCore,
  type SeasonArchiveEntry,
  type SeasonalTechConfig,
  type ShardSiteState,
  type SiphonCache,
  type SnapshotState,
  STRATEGIC_RESOURCE_KEYS,
  type StrategicResource,
  type TerrainShapeState,
  type TileHistoryState,
  type TileYieldBuffer,
  type TownDefinition,
  type TruceRequest,
  type VictoryPressureDefinition,
  type VictoryPressureTracker
} from "./server-shared-types.js";
import { buildRevealEmpireStatsView } from "./empire-intel.js";
import {
  type AiActionFailureEntry,
  type AiTurnDebugEntry,
  type DomainRequirementChecklist,
  emptyPlayerEffects,
  type PlayerEffects,
  type StatsModBreakdown,
  type TelemetryCounters,
  type TechRequirementChecklist
} from "./server-effects.js";
import {
  ABILITY_DEFS,
  AETHER_BRIDGE_CRYSTAL_COST,
  AETHER_BRIDGE_DURATION_MS,
  AETHER_BRIDGE_MAX_SEA_TILES,
  AETHER_WALL_CRYSTAL_COST,
  AETHER_WALL_DURATION_MS,
  ADVANCED_CRYSTAL_SYNTHESIZER_CRYSTAL_PER_DAY,
  ADVANCED_FUR_SYNTHESIZER_SUPPLY_PER_DAY,
  ADVANCED_IRONWORKS_IRON_PER_DAY,
  AIRPORT_BOMBARD_ATTACK_MULT,
  AIRPORT_BOMBARD_MAX_FIELD_TILES,
  AIRPORT_BOMBARD_MIN_FIELD_TILES,
  AIRPORT_BOMBARD_OIL_COST,
  AIRPORT_BOMBARD_RANGE,
  AIRPORT_BUILD_CRYSTAL_COST,
  AIRPORT_BUILD_GOLD_COST,
  AIRPORT_OIL_UPKEEP_PER_MIN,
  BARBARIAN_MAINTENANCE_INTERVAL_MS,
  BARBARIAN_MAINTENANCE_MAX_SPAWNS_PER_PASS,
  BARBARIAN_OWNER_ID,
  BARBARIAN_TICK_MS,
  BANK_BUILD_GOLD_COST,
  BANK_FOOD_UPKEEP,
  BREAKTHROUGH_DEF_MULT_FACTOR,
  BREAKTHROUGH_GOLD_COST,
  BREAKTHROUGH_IRON_COST,
  BREAKTHROUGH_REQUIRED_TECH_ID,
  BREACH_SHOCK_DEF_MULT,
  BREACH_SHOCK_MS,
  CAMP_BUILD_GOLD_COST,
  CAMP_BUILD_SUPPLY_COST,
  CAMP_GOLD_UPKEEP,
  canAffordGoldCost,
  CARAVANARY_BUILD_GOLD_COST,
  CARAVANARY_FOOD_UPKEEP,
  COLLECT_VISIBLE_COOLDOWN_MS,
  colorFromId,
  CRYSTAL_SYNTHESIZER_BUILD_GOLD_COST,
  CRYSTAL_SYNTHESIZER_CRYSTAL_PER_DAY,
  CRYSTAL_SYNTHESIZER_GOLD_UPKEEP,
  CRYSTAL_SYNTHESIZER_OVERLOAD_CRYSTAL,
  CUSTOMS_HOUSE_BUILD_CRYSTAL_COST,
  CUSTOMS_HOUSE_BUILD_GOLD_COST,
  CUSTOMS_HOUSE_GOLD_UPKEEP,
  DEEP_STRIKE_ATTACK_MULT,
  DEEP_STRIKE_COOLDOWN_MS,
  DEEP_STRIKE_CRYSTAL_COST,
  DEEP_STRIKE_MAX_DISTANCE,
  DOCK_INCOME_PER_MIN,
  DYNAMIC_MISSION_MS,
  ECONOMIC_STRUCTURE_UPKEEP_INTERVAL_MS,
  FARMSTEAD_BUILD_FOOD_COST,
  FARMSTEAD_BUILD_GOLD_COST,
  FARMSTEAD_GOLD_UPKEEP,
  FIRST_SPECIAL_SITE_CAPTURE_GOLD,
  FORT_BUILD_IRON_COST,
  FOUNDRY_BUILD_GOLD_COST,
  FOUNDRY_GOLD_UPKEEP,
  FOUNDRY_OUTPUT_MULT,
  FOUNDRY_RADIUS,
  FRONTIER_ACTION_GOLD_COST,
  FUEL_PLANT_BUILD_GOLD_COST,
  FUEL_PLANT_GOLD_UPKEEP,
  FUEL_PLANT_OIL_PER_DAY,
  FUR_SYNTHESIZER_BUILD_GOLD_COST,
  FUR_SYNTHESIZER_GOLD_UPKEEP,
  FUR_SYNTHESIZER_OVERLOAD_SUPPLY,
  FUR_SYNTHESIZER_SUPPLY_PER_DAY,
  GARRISON_HALL_BUILD_CRYSTAL_COST,
  GARRISON_HALL_BUILD_GOLD_COST,
  GARRISON_HALL_GOLD_UPKEEP,
  GOLD_COST_EPSILON,
  GOVERNORS_OFFICE_BUILD_GOLD_COST,
  GOVERNORS_OFFICE_GOLD_UPKEEP,
  GOVERNORS_OFFICE_RADIUS,
  GOVERNORS_OFFICE_UPKEEP_MULT,
  GRANARY_BUILD_FOOD_COST,
  GRANARY_BUILD_GOLD_COST,
  GRANARY_GOLD_UPKEEP,
  GROWTH_PAUSE_MAX_MS,
  GROWTH_PAUSE_MS,
  HARVEST_GOLD_RATE_MULT,
  HARVEST_RESOURCE_RATE_MULT,
  IDLE_SNAPSHOT_INTERVAL_MS,
  INITIAL_SHARD_SCATTER_COUNT,
  IRONWORKS_BUILD_GOLD_COST,
  IRONWORKS_GOLD_UPKEEP,
  IRONWORKS_IRON_PER_DAY,
  IRONWORKS_OVERLOAD_IRON,
  key,
  LARGE_ISLAND_MULTI_DOCK_TILE_THRESHOLD,
  LIGHT_OUTPOST_GOLD_UPKEEP,
  MANPOWER_EPSILON,
  MARKET_BUILD_GOLD_COST,
  MARKET_FOOD_UPKEEP,
  MINE_BUILD_GOLD_COST,
  MINE_BUILD_RESOURCE_COST,
  MINE_GOLD_UPKEEP,
  MIN_ACTIVE_BARBARIAN_AGENTS,
  MISSION_DEFS,
  NAVAL_INFILTRATION_ATTACK_MULT,
  NAVAL_INFILTRATION_COOLDOWN_MS,
  NAVAL_INFILTRATION_CRYSTAL_COST,
  NAVAL_INFILTRATION_MAX_RANGE,
  NEW_SETTLEMENT_DEFENSE_MS,
  now,
  OBSERVATORY_BUILD_COST,
  OBSERVATORY_BUILD_CRYSTAL_COST,
  OBSERVATORY_CAST_RADIUS,
  OBSERVATORY_PROTECTION_RADIUS,
  OBSERVATORY_VISION_BONUS,
  OFFLINE_YIELD_ACCUM_MAX_MS,
  parseKey,
  PASSIVE_INCOME_MULT,
  playerPairKey,
  PLAYER_MOUNTAIN_DENSITY_LIMIT,
  PLAYER_MOUNTAIN_DENSITY_RADIUS,
  POPULATION_GROWTH_BASE_RATE,
  POPULATION_GROWTH_TICK_MS,
  POPULATION_MAX,
  POPULATION_MIN,
  POPULATION_START_SPREAD,
  POPULATION_TOWN_MIN,
  PVP_REWARD_MULT,
  RADAR_SYSTEM_BUILD_CRYSTAL_COST,
  RADAR_SYSTEM_BUILD_GOLD_COST,
  RADAR_SYSTEM_GOLD_UPKEEP,
  RADAR_SYSTEM_RADIUS,
  RESOURCE_CHAIN_BUFF_MS,
  RESOURCE_CHAIN_MULT,
  REVEAL_EMPIRE_ACTIVATION_COST,
  REVEAL_EMPIRE_STATS_CRYSTAL_COST,
  REVEAL_EMPIRE_UPKEEP_PER_MIN,
  SABOTAGE_COOLDOWN_MS,
  SABOTAGE_CRYSTAL_COST,
  SABOTAGE_DURATION_MS,
  SABOTAGE_OUTPUT_MULT,
  SEASON_VICTORY_CONTINENT_FOOTPRINT_SHARE,
  SEASON_VICTORY_ECONOMY_LEAD_MULT,
  SEASON_VICTORY_ECONOMY_MIN_INCOME,
  SEASON_VICTORY_HOLD_MS,
  SEASON_VICTORY_SETTLED_TERRITORY_SHARE,
  SEASON_VICTORY_TOWN_CONTROL_SHARE,
  SETTLEMENT_BASE_GOLD_PER_MIN,
  SHARD_RAIN_SCHEDULE_HOURS,
  SHARD_RAIN_SITE_MAX,
  SHARD_RAIN_SITE_MIN,
  SHARD_RAIN_TTL_MS,
  SIEGE_OUTPOST_BUILD_SUPPLY_COST,
  SIPHON_COOLDOWN_MS,
  SIPHON_CRYSTAL_COST,
  SIPHON_DURATION_MS,
  SIPHON_PURGE_CRYSTAL_COST,
  SIPHON_SHARE,
  STARTING_GOLD,
  STRUCTURE_OUTPUT_MULT,
  SYNTH_OVERLOAD_DISABLE_MS,
  SYNTH_OVERLOAD_GOLD_COST,
  TERRAIN_SHAPING_COOLDOWN_MS,
  TERRAIN_SHAPING_CRYSTAL_COST,
  TERRAIN_SHAPING_GOLD_COST,
  TERRAIN_SHAPING_RANGE,
  TILE_YIELD_CAP_GOLD,
  TILE_YIELD_CAP_RESOURCE,
  TOWN_BASE_GOLD_PER_MIN,
  TOWN_MANPOWER_BY_TIER,
  TRUCE_BREAK_ATTACK_MULT,
  TRUCE_BREAK_ATTACK_PENALTY_MS,
  TRUCE_BREAK_LOCKOUT_MS,
  TRUCE_REQUEST_TTL_MS,
  VENDETTA_ATTACK_BUFF_MS,
  VENDETTA_ATTACK_BUFF_MULT,
  VICTORY_PRESSURE_DEFS,
  VICTORY_PRESSURE_FRONTIER_REACH_WINDOW_MS,
  WORLD_TOWN_POPULATION_MIN,
  WORLD_TOWN_POPULATION_START_SPREAD,
  WOODEN_FORT_GOLD_UPKEEP
} from "./server-game-constants.js";
import { createServerWorldgenClusters } from "./server-worldgen-clusters.js";
import { createServerWorldgenDocks } from "./server-worldgen-docks.js";
import { createServerWorldgenShards } from "./server-worldgen-shards.js";
import { createServerWorldgenTerrain } from "./server-worldgen-terrain.js";
import { createServerWorldgenTowns } from "./server-worldgen-towns.js";
import { supportedFrontierUsesSettledDefense } from "./frontier-defense.js";
import { resolveFailedBarbarianDefenseOutcome } from "./barbarian-defense.js";
import { fortDefenseMultiplier, fortifiedTargetAttackMultiplier, outpostAttackMultiplier } from "./fort-combat-balance.js";
import { createServerSeasonTech } from "./server-season-tech.js";
import { createServerTerritoryStructureRuntime } from "./server-territory-structure-runtime.js";
import { createServerPlayerEconomyRuntime } from "./server-player-economy-runtime.js";
import { createServerEconomicOperations } from "./server-economic-operations.js";
import { createServerSettlementFlow } from "./server-settlement-flow.js";
import { createServerTownEconomyRuntime } from "./server-town-economy-runtime.js";
import { TOWN_CAPTURE_SHOCK_MS, createServerTownSupport } from "./server-town-support.js";
import { createServerWorldMobility } from "./server-world-mobility.js";
import type {
  ServerWorldMobilityRuntime,
  ServerWorldgenClustersRuntime,
  ServerWorldgenDocksRuntime,
  ServerWorldgenShardsRuntime,
  ServerWorldgenTerrainRuntime,
  ServerWorldgenTownsRuntime
} from "./server-world-runtime-types.js";

const socketUsesLoopback = (socket: Ws): boolean => {
  const remoteAddress = (socket as Ws & { _socket?: import("node:net").Socket })._socket?.remoteAddress ?? "";
  return (
    remoteAddress === "127.0.0.1" ||
    remoteAddress === "::1" ||
    remoteAddress === "::ffff:127.0.0.1"
  );
};

const ACTION_CONTROL_PRIORITY_WINDOW_MS = 2_500;
const GLOBAL_STATUS_CACHE_TTL_MS = 1_000;
const GLOBAL_STATUS_BROADCAST_MS = 2_000;
const STRATEGIC_REPLAY_LIMIT = 16_000;

type AiTickContext = {
  cycleId: number;
  competitionMetrics: PlayerCompetitionMetrics[];
  incomeByPlayerId: Map<string, number>;
  townsTarget: number;
  settledTilesTarget: number;
  analysisByPlayerId: Map<string, AiTurnAnalysis>;
};

type AiCompetitionContext = {
  computedAt: number;
  competitionMetrics: PlayerCompetitionMetrics[];
  incomeByPlayerId: Map<string, number>;
  townsTarget: number;
  settledTilesTarget: number;
  analysisByPlayerId: Map<string, AiTurnAnalysis>;
};

const { techs: TECHS, techById, childrenByTech, roots: TECH_ROOTS } = loadTechTree(process.cwd());
const { domains: DOMAINS, domainById } = loadDomainTree(process.cwd());

const resourceRate: Record<ResourceType, number> = {
  FARM: 0,
  FISH: 0,
  FUR: 0,
  WOOD: 0,
  IRON: 0,
  GEMS: 0,
  OIL: 0
};

const strategicResourceRates: Record<StrategicResource, number> = {
  FOOD: 0,
  IRON: 0,
  CRYSTAL: 0,
  SUPPLY: 0,
  SHARD: 1,
  OIL: 0
};

const strategicDailyFromResource: Partial<Record<ResourceType, number>> = {
  FARM: 72,
  FISH: 48,
  IRON: 60,
  FUR: 60,
  WOOD: 60,
  GEMS: 36,
  OIL: 48
};

type EconomyResourceKey = "GOLD" | StrategicResource;
type EconomyBreakdownBucket = { label: string; amountPerMinute: number; count: number; resourceKey?: EconomyResourceKey; note?: string };
type EconomyBreakdownResource = { sources: EconomyBreakdownBucket[]; sinks: EconomyBreakdownBucket[] };
type EconomyBreakdown = Record<EconomyResourceKey, EconomyBreakdownResource>;

const emptyEconomyBreakdown = (): EconomyBreakdown => ({
  GOLD: { sources: [], sinks: [] },
  FOOD: { sources: [], sinks: [] },
  IRON: { sources: [], sinks: [] },
  CRYSTAL: { sources: [], sinks: [] },
  SUPPLY: { sources: [], sinks: [] },
  SHARD: { sources: [], sinks: [] },
  OIL: { sources: [], sinks: [] }
});

const pushEconomyBreakdownBucket = (
  map: Map<string, EconomyBreakdownBucket>,
  label: string,
  amountPerMinute: number,
  options: { count?: number; resourceKey?: EconomyResourceKey; note?: string } = {}
): void => {
  if (amountPerMinute <= 0.0001) return;
  const existing = map.get(label);
  if (existing) {
    existing.amountPerMinute += amountPerMinute;
    existing.count += options.count ?? 1;
    if (options.resourceKey) existing.resourceKey = options.resourceKey;
    if (options.note) existing.note = options.note;
    return;
  }
  const bucket: EconomyBreakdownBucket = { label, amountPerMinute, count: options.count ?? 1 };
  if (options.resourceKey !== undefined) bucket.resourceKey = options.resourceKey;
  if (options.note !== undefined) bucket.note = options.note;
  map.set(label, bucket);
};

const setEconomyBreakdownBucket = (
  map: Map<string, EconomyBreakdownBucket>,
  label: string,
  amountPerMinute: number,
  options: { count?: number; resourceKey?: EconomyResourceKey; note?: string } = {}
): void => {
  const bucket: EconomyBreakdownBucket = { label, amountPerMinute, count: options.count ?? 1 };
  if (options.resourceKey !== undefined) bucket.resourceKey = options.resourceKey;
  if (options.note !== undefined) bucket.note = options.note;
  map.set(label, bucket);
};

const sortedEconomyBreakdownBuckets = (map: Map<string, EconomyBreakdownBucket>): EconomyBreakdownBucket[] =>
  [...map.values()].sort((a, b) => b.amountPerMinute - a.amountPerMinute || a.label.localeCompare(b.label));

const toStrategicResource = (resource: ResourceType | undefined): StrategicResource | undefined => {
  if (!resource) return undefined;
  if (resource === "FARM" || resource === "FISH") return "FOOD";
  if (resource === "IRON") return "IRON";
  if (resource === "GEMS") return "CRYSTAL";
  if (resource === "WOOD" || resource === "FUR") return "SUPPLY";
  if (resource === "OIL") return "OIL";
  return undefined;
};

const goldResourceSourceLabel = (resource: ResourceType): string => {
  if (resource === "FARM") return "Grain sites";
  if (resource === "FISH") return "Fish sites";
  if (resource === "FUR") return "Fur sites";
  if (resource === "WOOD") return "Wood sites";
  if (resource === "IRON") return "Iron sites";
  if (resource === "GEMS") return "Gems sites";
  return "Oil sites";
};

const strategicResourceSourceLabel = (resource: ResourceType): string => {
  if (resource === "FARM") return "Grain";
  if (resource === "FISH") return "Fish";
  if (resource === "FUR") return "Fur";
  if (resource === "WOOD") return "Wood";
  if (resource === "IRON") return "Iron";
  if (resource === "GEMS") return "Gems";
  return "Oil";
};

const baseTileValue = (resource: ResourceType | undefined): number => {
  if (!resource) return 10;
  if (resource === "FARM") return 20;
  if (resource === "FISH") return 22;
  if (resource === "FUR") return 24;
  if (resource === "WOOD") return 30;
  if (resource === "IRON") return 40;
  if (resource === "OIL") return 50;
  return 60;
};

const currentIncomePerMinute = (player: Player): number => {
  const counts = getOrInitResourceCounts(player.id);
  let incomePerMinute = 0;
  for (const [r, c] of Object.entries(counts) as [ResourceType, number][]) {
    incomePerMinute += c * (resourceRate[r] ?? 0);
  }
  let ownedDockCount = 0;
  for (const d of docksByTile.values()) {
    const [dx, dy] = parseKey(d.tileKey);
    const t = playerTile(dx, dy);
    if (t.ownerId === player.id && t.ownershipState === "SETTLED") ownedDockCount += dockIncomeForOwner(d, player.id);
  }
  incomePerMinute += ownedDockCount;
  for (const town of townsByTile.values()) {
    incomePerMinute += townIncomeForOwner(town, player.id) * siphonMultiplierAt(town.tileKey);
  }
  let activeBankCount = 0;
  for (const tk of economicStructureTileKeysByPlayer.get(player.id) ?? []) {
    const structure = economicStructuresByTile.get(tk);
    if (structure?.type === "BANK" && structure.status === "active") activeBankCount += 1;
  }
  incomePerMinute += activeBankCount;
  return incomePerMinute * player.mods.income * PASSIVE_INCOME_MULT;
};

const strategicProductionPerMinute = (player: Player): Record<StrategicResource, number> => {
  const out: Record<StrategicResource, number> = { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0, OIL: 0 };
  for (const tk of player.territoryTiles) {
    if (ownershipStateByTile.get(tk) !== "SETTLED") continue;
    const [x, y] = parseKey(tk);
    const t = playerTile(x, y);
    if (t.ownerId !== player.id || t.terrain !== "LAND") continue;
    const sr = toStrategicResource(t.resource);
    if (sr) {
      const mult = t.resource ? activeResourceIncomeMult(player.id, t.resource) : 1;
      const daily = t.resource ? (strategicDailyFromResource[t.resource] ?? 0) : 0;
      out[sr] += (daily / 1440) * mult * siphonMultiplierAt(tk) * economicStructureOutputMultAt(tk, player.id);
    }
  }
  for (const tk of economicStructureTileKeysByPlayer.get(player.id) ?? []) {
    const structure = economicStructuresByTile.get(tk);
    if (!structure || structure.status !== "active") continue;
    const output = converterStructureOutputFor(structure.type) ?? {};
    for (const [resource, daily] of Object.entries(output) as Array<[StrategicResource, number]>) {
      out[resource] += daily / 1440;
    }
  }
  return out;
};

const continentalFootprintProgressForPlayer = (
  playerId: string,
  allIslands: Map<number, number>
): { qualifiedCount: number; totalIslands: number; weakestQualifiedRatio: number; weakestQualifiedOwned: number; weakestQualifiedTotal: number } => {
  const settled = islandSettledCounts(playerId);
  let totalIslands = 0;
  let qualifiedCount = 0;
  let weakestQualifiedRatio = Number.POSITIVE_INFINITY;
  let weakestQualifiedOwned = 0;
  let weakestQualifiedTotal = 0;
  for (const [islandId, totalLand] of allIslands) {
    if (totalLand <= 0) continue;
    totalIslands += 1;
    const owned = settled.get(islandId) ?? 0;
    const ratio = owned / totalLand;
    if (ratio >= SEASON_VICTORY_CONTINENT_FOOTPRINT_SHARE) {
      qualifiedCount += 1;
      if (
        ratio < weakestQualifiedRatio ||
        (ratio === weakestQualifiedRatio && (owned < weakestQualifiedOwned || weakestQualifiedTotal === 0))
      ) {
        weakestQualifiedRatio = ratio;
        weakestQualifiedOwned = owned;
        weakestQualifiedTotal = totalLand;
      }
    }
  }
  return {
    qualifiedCount,
    totalIslands,
    weakestQualifiedRatio: Number.isFinite(weakestQualifiedRatio) ? weakestQualifiedRatio : 0,
    weakestQualifiedOwned,
    weakestQualifiedTotal
  };
};

const players = new Map<string, Player>();
const authIdentityByUid = new Map<string, AuthIdentity>();
const socketsByPlayer = new Map<string, Ws>();
const bulkSocketsByPlayer = new Map<string, Ws>();
const aiTurnDebugByPlayer = new Map<string, AiTurnDebugEntry>();
const aiLastActionFailureByPlayer = new Map<string, AiActionFailureEntry>();
const aiVictoryPathByPlayer = new Map<string, AiSeasonVictoryPathId>();
const aiVictoryPathUpdatedAtByPlayer = new Map<string, number>();
const ownership = new Map<TileKey, string>();
const ownershipStateByTile = new Map<TileKey, OwnershipState>();
const barbarianAgents = new Map<string, BarbarianAgent>();
const barbarianAgentByTileKey = new Map<TileKey, string>();
type NeutralExpandTiming = {
  acceptedAt: number;
  resolvesAt: number;
  resultSentAt: number;
};
interface PendingSettlement {
  tileKey: TileKey;
  ownerId: string;
  startedAt: number;
  resolvesAt: number;
  goldCost: number;
  cancelled: boolean;
  timeout?: NodeJS.Timeout;
}
const buildNeutralExpandTiming = (capture: PendingCapture, sentAt: number): NeutralExpandTiming | undefined => {
  if (capture.actionType !== "EXPAND" || typeof capture.startedAt !== "number") return undefined;
  return {
    acceptedAt: capture.startedAt,
    resolvesAt: capture.resolvesAt,
    resultSentAt: sentAt
  };
};
interface UpkeepBreakdown {
  need: number;
  fromYield: number;
  fromStock: number;
  remaining: number;
  contributors: UpkeepContributor[];
}
interface UpkeepContributor {
  label: string;
  amountPerMinute: number;
  count?: number;
  note?: string;
}
interface UpkeepDiagnostics {
  food: UpkeepBreakdown;
  iron: UpkeepBreakdown;
  supply: UpkeepBreakdown;
  crystal: UpkeepBreakdown;
  oil: UpkeepBreakdown;
  gold: UpkeepBreakdown;
  foodCoverage: number;
}
type EmpireVisualStyle = {
  primaryOverlay: string;
  secondaryTint: "IRON" | "SUPPLY" | "FOOD" | "CRYSTAL" | "BALANCED";
  borderStyle: "SHARP" | "HEAVY" | "GLOW" | "DASHED" | "SOFT";
  structureAccent: "IRON" | "SUPPLY" | "FOOD" | "CRYSTAL" | "NEUTRAL";
};
const combatLocks = new Map<TileKey, PendingCapture>();
const pendingSettlementsByTile = new Map<TileKey, PendingSettlement>();
const repeatFights = new Map<string, number[]>();
const resourceCountsByPlayer = new Map<string, Record<ResourceType, number>>();
const strategicResourceStockByPlayer = new Map<string, Record<StrategicResource, number>>();
const strategicResourceBufferByPlayer = new Map<string, Record<StrategicResource, number>>();
const economyIndexByPlayer = new Map<string, PlayerEconomyIndex>();
const foodUpkeepCoverageByPlayer = new Map<string, number>();
const townFeedingStateByPlayer = new Map<string, { foodCoverage: number; fedTownKeys: Set<TileKey> }>();
const tileYieldByTile = new Map<TileKey, TileYieldBuffer>();
const tileHistoryByTile = new Map<TileKey, TileHistoryState>();
const settledSinceByTile = new Map<TileKey, number>();
const terrainShapesByTile = new Map<TileKey, TerrainShapeState>();
const lastUpkeepByPlayer = new Map<string, UpkeepDiagnostics>();
const dynamicMissionsByPlayer = new Map<string, DynamicMissionDef[]>();
const temporaryAttackBuffUntilByPlayer = new Map<string, number>();
const temporaryIncomeBuffUntilByPlayer = new Map<string, { until: number; resources: [ResourceType, ResourceType] }>();
const growthPausedUntilByPlayer = new Map<string, number>();
const townCaptureShockUntilByTile = new Map<TileKey, number>();
const townGrowthShockUntilByTile = new Map<TileKey, number>();
const vendettaCaptureCountsByPlayer = new Map<string, Map<string, number>>();
const forcedRevealTilesByPlayer = new Map<string, Set<TileKey>>();
const cachedVisibilitySnapshotByPlayer = new Map<string, VisibilitySnapshot>();
const cachedChunkSnapshotByPlayer = new Map<
  string,
  {
    visibility: VisibilitySnapshot;
    visibilityVersion: number;
    payloadByChunkKey: Map<string, string>;
    summaryVersionByPayloadKey: Map<string, number>;
    visibilityMaskByChunkKey: Map<string, Uint8Array>;
    visibilityVersionByChunkKey: Map<string, number>;
  }
>();
const fogChunkTilesByChunkKey = new Map<string, readonly Tile[]>();
const chunkSnapshotGenerationByPlayer = new Map<string, number>();
const chunkSnapshotInFlightByPlayer = new Map<string, number>();
const pendingChunkRefreshByPlayer = new Set<string>();
const allianceRequests = new Map<string, AllianceRequest>();
const truceRequests = new Map<string, TruceRequest>();
const trucesByPair = new Map<string, ActiveTruce>();
const truceBreakPenaltyByPair = new Map<string, { penalizedPlayerId: string; targetPlayerId: string; endsAt: number }>();
const chunkSubscriptionByPlayer = new Map<string, { cx: number; cy: number; radius: number }>();
const chunkSnapshotSentAtByPlayer = new Map<string, { cx: number; cy: number; radius: number; sentAt: number }>();
const recentAiTickPerf = perfRing<{ at: number; elapsedMs: number; aiPlayers: number; rssMb: number; heapUsedMb: number }>(30);
const recentAiBudgetBreachPerf = perfRing<{
  at: number;
  playerId: string;
  elapsedMs: number;
  overBudgetMs: number;
  phase: string;
  phaseElapsedMs: number;
  reason?: string;
  actionKey?: string;
}>(30);
const recentChunkSnapshotPerf = perfRing<{
  at: number;
  playerId: string;
  elapsedMs: number;
  chunks: number;
  tiles: number;
  radius: number;
  rssMb: number;
  heapUsedMb: number;
  visibilityMaskMs: number;
  summaryReadMs: number;
  serializeMs: number;
  sendMs: number;
  cachedPayloadChunks: number;
  rebuiltChunks: number;
  batches: number;
}>(50);
const recentRuntimeVitals = perfRing<ReturnType<typeof sampleRuntimeVitals>>(180);
const RUNTIME_MEMORY_WATERMARK_THRESHOLDS_MB = [380, 420, 460] as const;
const runtimeMemoryWatermarksLogged = new Set<number>();
const aiYieldCollectDueAtByPlayer = new Map<string, number>();
const collectVisibleCooldownByPlayer = new Map<string, number>();
const actionTimestampsByPlayer = new Map<string, number[]>();
const fogDisabledByPlayer = new Map<string, boolean>();
const fortsByTile = new Map<TileKey, Fort>();
const fortBuildTimers = new Map<TileKey, NodeJS.Timeout>();
const observatoriesByTile = new Map<TileKey, Observatory>();
const observatoryBuildTimers = new Map<TileKey, NodeJS.Timeout>();
const observatoryTileKeysByPlayer = new Map<string, Set<TileKey>>();
const siegeOutpostsByTile = new Map<TileKey, SiegeOutpost>();
const siegeOutpostBuildTimers = new Map<TileKey, NodeJS.Timeout>();
const economicStructuresByTile = new Map<TileKey, EconomicStructure>();
const economicStructureBuildTimers = new Map<TileKey, NodeJS.Timeout>();
const economicStructureTileKeysByPlayer = new Map<string, Set<TileKey>>();
const docksByTile = new Map<TileKey, Dock>();
const dockById = new Map<string, Dock>();
const clusterByTile = new Map<TileKey, string>();
const clustersById = new Map<string, ClusterDefinition>();
const clusterControlledTilesByPlayer = new Map<string, Map<string, number>>();
const townsByTile = new Map<TileKey, TownDefinition>();
const shardSitesByTile = new Map<TileKey, ShardSiteState>();
const firstSpecialSiteCaptureClaimed = new Set<TileKey>();
let lastShardRainSlotKey = "";
let lastShardRainWarningSlotKey = "";
const revealedEmpireTargetsByPlayer = new Map<string, Set<string>>();
const revealWatchersByTarget = new Map<string, Set<string>>();
const siphonByTile = new Map<TileKey, ActiveSiphon>();
const siphonCacheByPlayer = new Map<string, SiphonCache[]>();
const activeAetherBridgesById = new Map<string, ActiveAetherBridge>();
const activeAetherWallsById = new Map<string, ActiveAetherWall>();
const activeAetherWallIdsByEdgeKey = new Map<string, Set<string>>();
const abilityCooldownsByPlayer = new Map<string, Map<AbilityDefinition["id"], number>>();
const victoryPressureById = new Map<SeasonVictoryPathId, VictoryPressureTracker>();
const frontierSettlementsByPlayer = new Map<string, number[]>();
const aiIntentLatchState = createAiIntentLatchState();
const aiExecuteCandidateCacheState = createAiExecuteCandidateCacheState();
const breachShockByTile = new Map<TileKey, { ownerId: string; expiresAt: number }>();
const settlementDefenseByTile = new Map<TileKey, { ownerId: string; expiresAt: number; mult: number }>();
const playerBaseMods = new Map<string, { attack: number; defense: number; income: number; vision: number }>();
const playerEffectsByPlayer = new Map<string, PlayerEffects>();
const seasonArchives: SeasonArchiveEntry[] = [];
const strategicReplayEvents: StrategicReplayEvent[] = [];
let seasonWinner: SeasonWinnerView | undefined;
const telemetryCounters: TelemetryCounters = {
  frontierClaims: 0,
  settlements: 0,
  breakthroughAttacks: 0,
  techUnlocks: 0
};
let activeSeason: Season = {
  seasonId: `s-${Date.now()}`,
  startAt: now(),
  endAt: now() + SEASON_LENGTH_DAYS * 24 * 60 * 60 * 1000,
  worldSeed: Math.floor(Math.random() * 1_000_000_000),
  techTreeConfigId: "seasonal-default",
  status: "active"
};
let activeSeasonTechConfig: SeasonalTechConfig = {
  configId: "seasonal-default",
  rootNodeIds: [],
  activeNodeIds: new Set<string>(),
  balanceConstants: {}
};
const pairKeyFor = (a: string, b: string): string => (a < b ? `${a}:${b}` : `${b}:${a}`);
const ACTION_WINDOW_MS = 5_000;
const ACTION_LIMIT = 12;
const AI_INTENT_LATCH_PROVISIONAL_MS = 2_500;
const pruneActionTimes = (playerId: string, nowMs: number): number[] => {
  const timestamps = actionTimestampsByPlayer.get(playerId);
  if (!timestamps || timestamps.length === 0) return [];
  let writeIndex = 0;
  for (let readIndex = 0; readIndex < timestamps.length; readIndex += 1) {
    const timestamp = timestamps[readIndex]!;
    if (nowMs - timestamp > ACTION_WINDOW_MS) continue;
    timestamps[writeIndex] = timestamp;
    writeIndex += 1;
  }
  if (writeIndex !== timestamps.length) timestamps.length = writeIndex;
  if (writeIndex === 0) {
    actionTimestampsByPlayer.delete(playerId);
    return [];
  }
  return timestamps;
};
const pruneRepeatFightEntries = (pairKey: string, nowMs: number): number[] => {
  const entries = repeatFights.get(pairKey);
  if (!entries || entries.length === 0) return [];
  let writeIndex = 0;
  for (let readIndex = 0; readIndex < entries.length; readIndex += 1) {
    const timestamp = entries[readIndex]!;
    if (nowMs - timestamp > PVP_REPEAT_WINDOW_MS) continue;
    entries[writeIndex] = timestamp;
    writeIndex += 1;
  }
  if (writeIndex !== entries.length) entries.length = writeIndex;
  if (writeIndex === 0) {
    repeatFights.delete(pairKey);
    return [];
  }
  return entries;
};
const SEASONS_ENABLED = true;
const FINAL_PUSH_MS = 72 * 60 * 60_000;
const HOLD_START_BROADCAST_DELAY_MS = 10 * 60_000;
const HOLD_REMAINING_BROADCAST_HOURS = [12, 6, 1] as const;

const {
  seeded01,
  terrainAtRuntime,
  terrainShapeWithinPlayerDensity,
  hasOwnedLandWithinRange,
  regionTypeAtLocal,
  isAdjacentTile,
  isCoastalLand,
  largestSeaComponentMask,
  adjacentOceanSea,
  clusterTypeDefs,
  clusterResourceType,
  discoverOilFieldNearAirport,
  isNearMountain,
  resourcePlacementAllowed,
  isForestFrontierTile,
  FOREST_SETTLEMENT_MULT,
  frontierClaimDurationMsAt,
  nearestLandTiles,
  collectClusterTiles,
  collectClusterTilesRelaxed,
  clusterTileCountForResource,
  clusterRadiusForResource
}: ServerWorldgenTerrainRuntime = createServerWorldgenTerrain({
  wrapX,
  wrapY,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  terrainShapesByTile,
  key,
  terrainAt,
  PLAYER_MOUNTAIN_DENSITY_RADIUS,
  PLAYER_MOUNTAIN_DENSITY_LIMIT,
  players,
  parseKey,
  chebyshevDistance: (ax: number, ay: number, bx: number, by: number) => chebyshevDistance(ax, ay, bx, by),
  regionTypeAt,
  clusterByTile,
  townsByTile,
  docksByTile,
  fortsByTile,
  siegeOutpostsByTile,
  observatoriesByTile,
  economicStructuresByTile,
  playerTile: (x: number, y: number) => playerTile(x, y),
  AIRPORT_BOMBARD_MIN_FIELD_TILES,
  AIRPORT_BOMBARD_MAX_FIELD_TILES,
  activeSeason,
  clustersById,
  ownership,
  getOrInitResourceCounts: (playerId: string) => getOrInitResourceCounts(playerId),
  rebuildEconomyIndexForPlayer: (playerId: string) => rebuildEconomyIndexForPlayer(playerId),
  sendPlayerUpdate: (player: Player, incomeDelta: number) => sendPlayerUpdate(player, incomeDelta),
  sendVisibleTileDeltaAt: (x: number, y: number) => sendVisibleTileDeltaAt(x, y),
  landBiomeAt,
  grassShadeAt,
  FRONTIER_CLAIM_MS
});

const {
  chooseSeasonalTechConfig,
  seasonTechConfigIsCompatible,
  recomputeClusterBonusForPlayer,
  playerModBreakdown,
  recomputeTechModsFromOwnedTechs,
  setClusterControlDelta
} = createServerSeasonTech({
  TECHS,
  TECH_ROOTS,
  techById,
  domainById,
  players,
  playerBaseMods,
  clusterControlledTilesByPlayer,
  recomputePlayerEffectsForPlayer: (player: Player) => recomputePlayerEffectsForPlayer(player),
  markVisibilityDirty: (playerId: string) => markVisibilityDirty(playerId)
});

const { generateClusters, applyClusterResources }: ServerWorldgenClustersRuntime = createServerWorldgenClusters({
  clusterByTile,
  clustersById,
  clusterTypeDefs,
  seeded01,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  clusterRuleMatch: (x: number, y: number, resource: ResourceType) => resourcePlacementAllowed(x, y, resource, false),
  clusterRuleMatchRelaxed: (x: number, y: number, resource: ResourceType) => resourcePlacementAllowed(x, y, resource, true),
  clusterTileCountForResource,
  collectClusterTiles,
  collectClusterTilesRelaxed,
  clusterRadiusForResource,
  key,
  clusterResourceType
});

const { generateDocks }: ServerWorldgenDocksRuntime = createServerWorldgenDocks({
  seeded01,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  key,
  wrapX,
  wrapY,
  worldIndex: (x: number, y: number) => y * WORLD_WIDTH + x,
  terrainAt,
  adjacentOceanSea,
  largestSeaComponentMask,
  clusterByTile,
  LARGE_ISLAND_MULTI_DOCK_TILE_THRESHOLD,
  docksByTile,
  dockById,
  getDockLinkedTileKeysByDockTileKey: () => dockLinkedTileKeysByDockTileKey
});

const {
  townTypeAt,
  generateTowns,
  canPlaceTownAt,
  findNearestTownPlacement,
  townPlacementsNeedNormalization,
  normalizeTownPlacements,
  assignMissingTownNamesForWorld,
  ensureBaselineEconomyCoverage,
  ensureInterestCoverage,
  initialTownPopulationAt
}: ServerWorldgenTownsRuntime = createServerWorldgenTowns({
  seeded01,
  regionTypeAtLocal,
  landBiomeAt,
  activeSeason,
  townsByTile,
  firstSpecialSiteCaptureClaimed,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  terrainAt,
  key,
  docksByTile,
  clusterByTile,
  POPULATION_MAX,
  POPULATION_TOWN_MIN,
  now,
  wrapX,
  wrapY,
  parseKey,
  assignMissingTownNames,
  getIslandMap: () => islandMap(),
  WORLD_TOWN_POPULATION_MIN,
  WORLD_TOWN_POPULATION_START_SPREAD,
  nearestLandTiles,
  resourcePlacementAllowed,
  clustersById,
  clusterResourceType
});

const {
  shardSiteViewAt,
  seedInitialShardScatter,
  activeShardRainSummary,
  shardRainNoticePayload,
  maybeBroadcastShardRainWarning,
  spawnShardRain,
  maybeSpawnScheduledShardRain,
  expireShardSites,
  collectShardSite
}: ServerWorldgenShardsRuntime = createServerWorldgenShards({
  terrainAt,
  key,
  docksByTile,
  clusterByTile,
  townsByTile,
  shardSitesByTile,
  now,
  INITIAL_SHARD_SCATTER_COUNT,
  seeded01,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  currentShardRainNotice,
  SHARD_RAIN_TTL_MS,
  nextShardRainStartAt,
  getLastShardRainWarningSlotKey: () => lastShardRainWarningSlotKey,
  setLastShardRainWarningSlotKey: (value: string) => {
    lastShardRainWarningSlotKey = value;
  },
  broadcast: (payload: unknown) => broadcast(payload),
  hasOnlinePlayers: () => hasOnlinePlayers(),
  SHARD_RAIN_SITE_MIN,
  SHARD_RAIN_SITE_MAX,
  broadcastLocalVisionDelta: (centers: Array<{ x: number; y: number }>) => broadcastLocalVisionDelta(centers),
  SHARD_RAIN_SCHEDULE_HOURS,
  getLastShardRainSlotKey: () => lastShardRainSlotKey,
  setLastShardRainSlotKey: (value: string) => {
    lastShardRainSlotKey = value;
  },
  parseKey,
  markSummaryChunkDirtyAtTile: (x: number, y: number) => markSummaryChunkDirtyAtTile(x, y),
  visible: (player: Player, x: number, y: number) => visible(player, x, y),
  getOrInitStrategicStocks: (playerId: string) => getOrInitStrategicStocks(playerId)
});

const {
  applyTownWarShock,
  applyTownCaptureShock,
  applyTownCapturePopulationLoss,
  townSupport,
  townPopulationTier,
  townPopulationTierForTown,
  townPopulationMultiplier,
  townManpowerSnapshotForOwner,
  playerManpowerCap,
  manpowerRegenWeightForSettlementIndex,
  prettyTownName,
  playerManpowerRegenPerMinute,
  playerManpowerBreakdown,
  effectiveManpowerAt,
  townGoldIncomeEnabledForPlayer,
  applyManpowerRegen
} = createServerTownSupport({
  now,
  parseKey,
  key,
  wrapX,
  wrapY,
  chebyshevDistance: (ax: number, ay: number, bx: number, by: number) => chebyshevDistance(ax, ay, bx, by),
  WORLD_WIDTH,
  WORLD_HEIGHT,
  POPULATION_TOWN_MIN,
  MANPOWER_EPSILON,
  TOWN_MANPOWER_BY_TIER,
  townsByTile,
  ownership,
  ownershipStateByTile,
  townGrowthShockUntilByTile,
  townCaptureShockUntilByTile,
  terrainAt,
  ownedTownKeysForPlayer: (playerId: string) => ownedTownKeysForPlayer(playerId),
  isTownFedForOwner: (ownerId: string | undefined, townKey: TileKey) => isTownFedForOwner(townKey, ownerId)
});

const {
  supportedTownKeysForTile,
  structureForSupportedTown,
  supportedDockKeysForTile,
  structureForSupportedDock,
  isSupportOnlyStructureType,
  isDockSupportOnlyStructureType,
  isLightCombatStructureType,
  isConverterStructureType,
  pickRandomAvailableSupportTileForTown,
  pickRandomAvailableSupportTileForDock,
  ownedTownKeysForPlayer,
  isRelocatableSettlementTown,
  activeSettlementTileKeyForPlayer,
  oldestSettledSettlementCandidateForPlayer,
  createSettlementAtTile,
  ensureActiveSettlementForPlayer,
  ensureFallbackSettlementForPlayer,
  relocateCapturedSettlementForPlayer,
  firstThreeTownKeySetForPlayer,
  directlyConnectedTownKeysForTown,
  recomputeTownNetworkForPlayer
} = createServerSettlementFlow({
  key,
  now,
  parseKey,
  wrapX,
  wrapY,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  POPULATION_MIN,
  POPULATION_MAX,
  POPULATION_START_SPREAD,
  resourceRate,
  players,
  townsByTile,
  docksByTile,
  fortsByTile,
  observatoriesByTile,
  siegeOutpostsByTile,
  economicStructuresByTile,
  ownership,
  ownershipStateByTile,
  settledSinceByTile,
  activeSeason,
  seeded01,
  terrainAtRuntime,
  playerTile: (x: number, y: number) => playerTile(x, y),
  applyClusterResources,
  resourceAt,
  townTypeAt,
  townPopulationTierForTown,
  structurePlacementMetadata,
  assignMissingTownNamesForWorld: () => assignMissingTownNamesForWorld(),
  markSummaryChunkDirtyAtTile: (x: number, y: number) => markSummaryChunkDirtyAtTile(x, y),
  sendVisibleTileDeltaAt: (x: number, y: number) => sendVisibleTileDeltaAt(x, y),
  connectedTownBonusForOwner: (connectedTownCount: number, ownerId: string | undefined) => connectedTownBonusForOwner(connectedTownCount, ownerId),
  dockIncomeForOwner: (dock: Dock, ownerId: string | undefined) => dockIncomeForOwner(dock, ownerId),
  townPotentialIncomeForOwner: (town: TownDefinition, ownerId: string | undefined, options?: { ignoreSuppression?: boolean; ignoreManpowerGate?: boolean }) =>
    townPotentialIncomeForOwner(town, ownerId, options)
});

const supportedFrontierUsesSettledDefenseAt = (defenderId: string | undefined, target: Tile): boolean => {
  const defender = defenderId ? players.get(defenderId) : undefined;
  return supportedFrontierUsesSettledDefense(defender?.domainIds, defenderId, target, {
    worldWidth: WORLD_WIDTH,
    worldHeight: WORLD_HEIGHT,
    key,
    wrapX,
    wrapY,
    ownerAt: (tileKey) => ownership.get(tileKey),
    ownershipStateAt: (tileKey) => ownershipStateByTile.get(tileKey)
  });
};

const {
  isOwnedSettledLandTile,
  observatoryStatusForTile,
  activeObservatoryTileKeysForPlayer,
  syncObservatoriesForPlayer,
  hostileObservatoryProtectingTile,
  ownedActiveObservatoryWithinRange,
  activeAirportAt,
  activeOwnedEconomicStructureWithinRange,
  hostileRadarProtectingTile,
  governorUpkeepMultiplierAtTile,
  foundryMineOutputMultiplierAt,
  converterStructureOutputFor,
  activeSiphonAt,
  siphonMultiplierAt,
  addToSiphonCache,
  economicStructureForTile,
  economicStructureUpkeepDue,
  economicStructureResourceType,
  economicStructureOutputMultAt
} = createServerTerritoryStructureRuntime({
  now,
  parseKey,
  key,
  terrainAtRuntime,
  ownership,
  ownershipStateByTile,
  observatoriesByTile,
  observatoryTileKeysByPlayer,
  economicStructuresByTile,
  economicStructureTileKeysByPlayer,
  siphonByTile,
  siphonCacheByPlayer,
  chebyshevDistance: (ax: number, ay: number, bx: number, by: number) => chebyshevDistance(ax, ay, bx, by),
  getPlayerEffectsForPlayer: (playerId: string) => getPlayerEffectsForPlayer(playerId),
  markVisibilityDirty: (playerId: string) => markVisibilityDirty(playerId),
  OBSERVATORY_PROTECTION_RADIUS,
  OBSERVATORY_CAST_RADIUS,
  RADAR_SYSTEM_RADIUS,
  GOVERNORS_OFFICE_RADIUS,
  GOVERNORS_OFFICE_UPKEEP_MULT,
  FOUNDRY_RADIUS,
  FOUNDRY_OUTPUT_MULT,
  SIPHON_SHARE,
  STRUCTURE_OUTPUT_MULT,
  FUR_SYNTHESIZER_SUPPLY_PER_DAY,
  ADVANCED_FUR_SYNTHESIZER_SUPPLY_PER_DAY,
  IRONWORKS_IRON_PER_DAY,
  ADVANCED_IRONWORKS_IRON_PER_DAY,
  CRYSTAL_SYNTHESIZER_CRYSTAL_PER_DAY,
  ADVANCED_CRYSTAL_SYNTHESIZER_CRYSTAL_PER_DAY,
  FUEL_PLANT_OIL_PER_DAY,
  randomUUID: () => crypto.randomUUID()
});

const {
  computeTownFeedingState,
  townFeedingStateForPlayer,
  isTownFedForOwner,
  townIncomeSuppressed,
  townGrowthSuppressed,
  dockSummaryForOwner,
  dockIncomeForOwner,
  dockCapForOwner,
  townPotentialIncomeForOwner,
  townIncomeForOwner,
  townCapForOwner,
  townFoodUpkeepPerMinute,
  pausePopulationGrowthFromWar,
  townGrowthModifiersForOwner,
  updateTownPopulationForPlayer,
  townPopulationGrowthPerMinuteForOwner,
  tileYieldCapsFor
} = createServerTownEconomyRuntime({
  now,
  key,
  parseKey,
  resourceAt,
  players,
  townsByTile,
  docksByTile,
  dockById,
  economicStructuresByTile,
  ownership,
  ownershipStateByTile,
  townCaptureShockUntilByTile,
  townGrowthShockUntilByTile,
  foodUpkeepCoverageByPlayer,
  townFeedingStateByPlayer,
  growthPausedUntilByPlayer,
  getPlayerEffectsForPlayer: (playerId: string) => getPlayerEffectsForPlayer(playerId),
  emptyPlayerEffects,
  getOrInitStrategicStocks: (playerId: string) => getOrInitStrategicStocks(playerId),
  availableYieldStrategicForPlayer: (player: Player, resourceType: StrategicResource) => availableYieldStrategicForPlayer(player, resourceType),
  governorUpkeepMultiplierAtTile: (playerId: string, tileKey: TileKey) => governorUpkeepMultiplierAtTile(playerId, tileKey),
  townPopulationTierForTown,
  townPopulationMultiplier,
  townSupport,
  townGoldIncomeEnabledForPlayer,
  ownedTownKeysForPlayer,
  firstThreeTownKeySetForPlayer,
  structureForSupportedTown,
  structureForSupportedDock,
  POPULATION_MAX,
  POPULATION_GROWTH_BASE_RATE,
  POPULATION_GROWTH_TICK_MS,
  GROWTH_PAUSE_MS,
  GROWTH_PAUSE_MAX_MS,
  TOWN_BASE_GOLD_PER_MIN,
  SETTLEMENT_BASE_GOLD_PER_MIN,
  DOCK_INCOME_PER_MIN,
  TILE_YIELD_CAP_GOLD,
  TILE_YIELD_CAP_RESOURCE,
  PASSIVE_INCOME_MULT,
  HARVEST_GOLD_RATE_MULT,
  resourceRate,
  toStrategicResource,
  strategicDailyFromResource,
  converterStructureOutputFor: (structureType: EconomicStructureType, ownerId: string | undefined) => converterStructureOutputFor(structureType, ownerId),
  siphonMultiplierAt: (tileKey: TileKey) => siphonMultiplierAt(tileKey)
});

const {
  upkeepPerMinuteForPlayer,
  settledTileGoldUpkeepPerMinuteAt,
  roundedUpkeepPerMinute,
  tileUpkeepEntriesForTile,
  economicStructureGoldUpkeepPerInterval,
  economicStructureFoodUpkeepPerInterval,
  economicStructureCrystalUpkeepPerInterval,
  pushUpkeepContributor,
  sortedUpkeepContributors,
  upkeepContributorsForPlayer,
  economyBreakdownForPlayer,
  playerEconomySnapshot
} = createServerPlayerEconomyRuntime({
  parseKey,
  playerTile: (x: number, y: number) => playerTile(x, y),
  players,
  townsByTile,
  docksByTile,
  fortsByTile,
  siegeOutpostsByTile,
  observatoriesByTile,
  economicStructuresByTile,
  ownershipStateByTile,
  economicStructureTileKeysByPlayer,
  ownership,
  getOrInitResourceCounts: (playerId: string) => getOrInitResourceCounts(playerId),
  resourceRate,
  currentIncomePerMinute: (player: Player) => currentIncomePerMinute(player),
  strategicProductionPerMinute: (player: Player) => strategicProductionPerMinute(player),
  getPlayerEffectsForPlayer: (playerId: string) => getPlayerEffectsForPlayer(playerId),
  effectiveManpowerAt: (player: Player, nowMs?: number) => effectiveManpowerAt(player, nowMs),
  playerManpowerCap: (player: Player) => playerManpowerCap(player),
  townGoldIncomeEnabledForPlayer,
  townFoodUpkeepPerMinute,
  governorUpkeepMultiplierAtTile,
  dockIncomeForOwner,
  townIncomeForOwner,
  townPopulationTierForTown,
  toStrategicResource,
  activeResourceIncomeMult: (playerId: string, resource: ResourceType) => activeResourceIncomeMult(playerId, resource),
  strategicDailyFromResource,
  siphonMultiplierAt,
  economicStructureOutputMultAt,
  converterStructureOutputFor,
  emptyEconomyBreakdown: () => emptyEconomyBreakdown(),
  pushEconomyBreakdownBucket,
  setEconomyBreakdownBucket,
  sortedEconomyBreakdownBuckets,
  goldResourceSourceLabel,
  strategicResourceSourceLabel,
  getOrInitRevealTargets: (playerId: string) => getOrInitRevealTargets(playerId),
  prettyEconomicStructureLabel: (structureType: EconomicStructureType) => prettyEconomicStructureLabel(structureType),
  lastUpkeepByPlayer,
  emptyUpkeepDiagnostics: () => emptyUpkeepDiagnostics(),
  PASSIVE_INCOME_MULT,
  OBSERVATORY_UPKEEP_PER_MIN,
  REVEAL_EMPIRE_UPKEEP_PER_MIN,
  AIRPORT_OIL_UPKEEP_PER_MIN,
  FARMSTEAD_GOLD_UPKEEP,
  CAMP_GOLD_UPKEEP,
  MINE_GOLD_UPKEEP,
  GRANARY_GOLD_UPKEEP,
  MARKET_FOOD_UPKEEP,
  BANK_FOOD_UPKEEP,
  CARAVANARY_FOOD_UPKEEP,
  FUR_SYNTHESIZER_GOLD_UPKEEP,
  WOODEN_FORT_GOLD_UPKEEP,
  LIGHT_OUTPOST_GOLD_UPKEEP,
  IRONWORKS_GOLD_UPKEEP,
  CRYSTAL_SYNTHESIZER_GOLD_UPKEEP,
  FUEL_PLANT_GOLD_UPKEEP,
  FOUNDRY_GOLD_UPKEEP,
  GARRISON_HALL_GOLD_UPKEEP,
  CUSTOMS_HOUSE_GOLD_UPKEEP,
  GOVERNORS_OFFICE_GOLD_UPKEEP,
  RADAR_SYSTEM_GOLD_UPKEEP
});

const {
  currentFoodCoverageForPlayer,
  playerHasSettledFoodSources,
  economicStructureBuildDurationMs,
  structureBuildDurationMsForRuntime,
  baseSynthTypeForAdvanced,
  canPlaceEconomicStructure,
  tryBuildEconomicStructure,
  syncEconomicStructuresForPlayer,
  applyUpkeepForPlayer,
  accumulatePassiveIncomeForPlayer,
  addTileYield
} = createServerEconomicOperations({
  now,
  key,
  parseKey,
  playerTile: (x: number, y: number) => playerTile(x, y),
  runtimeTileCore: (x: number, y: number) => runtimeTileCore(x, y),
  players,
  townsByTile,
  docksByTile,
  fortsByTile,
  siegeOutpostsByTile,
  observatoriesByTile,
  economicStructuresByTile,
  economicStructureTileKeysByPlayer,
  economicStructureBuildTimers,
  ownershipStateByTile,
  ownership,
  getOrInitStrategicStocks: (playerId: string) => getOrInitStrategicStocks(playerId),
  availableYieldStrategicForPlayer: (player: Player, resource: StrategicResource) => availableYieldStrategicForPlayer(player, resource),
  computeTownFeedingState,
  townFeedingStateForPlayer,
  getPlayerEffectsForPlayer: (playerId: string) => getPlayerEffectsForPlayer(playerId),
  isSupportOnlyStructureType,
  isLightCombatStructureType,
  isConverterStructureType,
  supportedTownKeysForTile,
  supportedDockKeysForTile,
  structureForSupportedTown,
  pickRandomAvailableSupportTileForTown,
  townPopulationTier,
  townPopulationTierForTown,
  canStartDevelopmentProcess: (playerId: string) => canStartDevelopmentProcess(playerId),
  developmentSlotsBusyReason: (playerId: string) => developmentSlotsBusyReason(playerId),
  structureBuildGoldCost,
  structurePlacementMetadata,
  structureShowsOnTile,
  isBorderTile: (x: number, y: number, ownerId: string) => isBorderTile(x, y, ownerId),
  ownedStructureCountForPlayer: (playerId: string, structureType: EconomicStructureType) => ownedStructureCountForPlayer(playerId, structureType),
  consumeStrategicResource: (actor: Player, resource: StrategicResource, amount: number) => consumeStrategicResource(actor, resource, amount),
  recalcPlayerDerived: (player: Player) => recalcPlayerDerived(player),
  markSummaryChunkDirtyAtTile: (x: number, y: number) => markSummaryChunkDirtyAtTile(x, y),
  trackOwnedTileKey: (index: Map<string, Set<TileKey>>, playerId: string, tileKey: TileKey) => trackOwnedTileKey(index, playerId, tileKey),
  untrackOwnedTileKey: (index: Map<string, Set<TileKey>>, playerId: string, tileKey: TileKey) => untrackOwnedTileKey(index, playerId, tileKey),
  recordTileStructureHistory: (tileKey: TileKey, structureType: EconomicStructureType) => recordTileStructureHistory(tileKey, structureType),
  cancelEconomicStructureBuild: (tileKey: TileKey) => cancelEconomicStructureBuild(tileKey),
  discoverOilFieldNearAirport: (playerId: string, tileKey: TileKey) => discoverOilFieldNearAirport(playerId, tileKey),
  updateOwnership: (x: number, y: number, ownerId?: string, state?: OwnershipState) => updateOwnership(x, y, ownerId, state),
  emptyUpkeepDiagnostics: () => emptyUpkeepDiagnostics(),
  consumeYieldStrategicForPlayer: (player: Player, resource: StrategicResource, amount: number, touchedTileKeys: Set<TileKey>) => consumeYieldStrategicForPlayer(player, resource, amount, touchedTileKeys),
  consumeYieldGoldForPlayer: (player: Player, amount: number, touchedTileKeys: Set<TileKey>) => consumeYieldGoldForPlayer(player, amount, touchedTileKeys),
  upkeepPerMinuteForPlayer,
  upkeepContributorsForPlayer,
  lastUpkeepByPlayer,
  foodUpkeepCoverageByPlayer,
  townFeedingStateByPlayer,
  revealedEmpireTargetsByPlayer,
  sendToPlayer: (playerId: string, payload: { type: "REVEAL_EMPIRE_UPDATE"; activeTargets: string[] }) => sendToPlayer(playerId, payload),
  getOrInitEconomyIndex: (playerId: string) => getOrInitEconomyIndex(playerId),
  applyClusterResources,
  resourceAt,
  resourceRate,
  toStrategicResource,
  strategicDailyFromResource,
  activeResourceIncomeMult: (playerId: string, resource: ResourceType) => activeResourceIncomeMult(playerId, resource),
  hasPositiveStrategicBuffer: (strategic: Partial<Record<StrategicResource, number>>) => hasPositiveStrategicBuffer(strategic),
  getOrInitTileYield: (tileKey: TileKey) => getOrInitTileYield(tileKey),
  tileYieldCapsFor,
  syncObservatoriesForPlayer,
  activeSiphonAt,
  addToSiphonCache,
  siphonMultiplierAt,
  converterStructureOutputFor,
  activeAirportAt,
  hostileRadarProtectingTile,
  economicStructureGoldUpkeepPerInterval,
  economicStructureUpkeepDue,
  prettyEconomicStructureLabel: (structureType: EconomicStructureType) => prettyEconomicStructureLabel(structureType),
  economicStructureBuildDurationMs: (structureType: EconomicStructureType) => structureType === "WOODEN_FORT" ? WOODEN_FORT_BUILD_MS : structureType === "LIGHT_OUTPOST" ? LIGHT_OUTPOST_BUILD_MS : ECONOMIC_STRUCTURE_BUILD_MS,
  structureBuildDurationMsForRuntime: (structureType: "FORT" | "OBSERVATORY" | "SIEGE_OUTPOST" | EconomicStructureType) =>
    structureType === "FORT" ? FORT_BUILD_MS : structureType === "OBSERVATORY" ? OBSERVATORY_BUILD_MS : structureType === "SIEGE_OUTPOST" ? SIEGE_OUTPOST_BUILD_MS : (structureType === "WOODEN_FORT" ? WOODEN_FORT_BUILD_MS : structureType === "LIGHT_OUTPOST" ? LIGHT_OUTPOST_BUILD_MS : ECONOMIC_STRUCTURE_BUILD_MS),
  baseSynthTypeForAdvanced: (structureType: EconomicStructureType) =>
    structureType === "ADVANCED_FUR_SYNTHESIZER" ? "FUR_SYNTHESIZER" : structureType === "ADVANCED_IRONWORKS" ? "IRONWORKS" : structureType === "ADVANCED_CRYSTAL_SYNTHESIZER" ? "CRYSTAL_SYNTHESIZER" : undefined,
  economicStructureFoodUpkeepPerInterval,
  economicStructureCrystalUpkeepPerInterval,
  playerEconomySnapshot,
  dockIncomeForOwner,
  townIncomeForOwner,
  FORT_BUILD_MS,
  OBSERVATORY_BUILD_MS,
  SIEGE_OUTPOST_BUILD_MS,
  ECONOMIC_STRUCTURE_UPKEEP_INTERVAL_MS,
  PASSIVE_INCOME_MULT,
  HARVEST_GOLD_RATE_MULT,
  HARVEST_RESOURCE_RATE_MULT,
  SIPHON_SHARE,
  FARMSTEAD_BUILD_FOOD_COST,
  CAMP_BUILD_SUPPLY_COST,
  MINE_BUILD_RESOURCE_COST,
  GRANARY_BUILD_FOOD_COST,
  GARRISON_HALL_BUILD_CRYSTAL_COST,
  CUSTOMS_HOUSE_BUILD_CRYSTAL_COST,
  RADAR_SYSTEM_BUILD_CRYSTAL_COST,
  AIRPORT_BUILD_CRYSTAL_COST,
  randomUUID: () => crypto.randomUUID()
});

const {
  regenerateStrategicWorld,
  dockLinkedDestinations,
  dockLinkedTileKeysByDockTileKey,
  dockLinkedTileKeys,
  validDockCrossingTarget,
  findOwnedDockOriginForCrossing,
  adjacentNeighbors,
  removeBarbarianAgent,
  removeBarbarianAtTile,
  upsertBarbarianAgent,
  spawnBarbarianAgentAt,
  spawnInitialBarbarians,
  maintainBarbarianPopulation,
  enqueueBarbarianMaintenance,
  chooseBarbarianTarget,
  exportDockPairs,
  applyBreachShockAround
}: ServerWorldMobilityRuntime = createServerWorldMobility({
  now,
  key,
  parseKey,
  wrapX,
  wrapY,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  BARBARIAN_OWNER_ID,
  BARBARIAN_ACTION_INTERVAL_MS,
  BARBARIAN_MAINTENANCE_MAX_SPAWNS_PER_PASS,
  INITIAL_BARBARIAN_COUNT,
  MIN_ACTIVE_BARBARIAN_AGENTS,
  BREACH_SHOCK_MS,
  DOCK_DEFENSE_MULT,
  players,
  townsByTile,
  docksByTile,
  dockById,
  clusterByTile,
  breachShockByTile,
  barbarianAgents,
  barbarianAgentByTileKey,
  terrainAt,
  setWorldSeed,
  generateClusters,
  generateDocks,
  generateTowns,
  seedInitialShardScatter,
  ensureBaselineEconomyCoverage,
  ensureInterestCoverage,
  normalizeTownPlacements,
  assignMissingTownNamesForWorld,
  seeded01,
  playerTile: (x: number, y: number) => playerTile(x, y),
  visible: (player: Player, x: number, y: number) => visible(player, x, y),
  updateOwnership: (x: number, y: number, ownerId?: string, state?: OwnershipState) => updateOwnership(x, y, ownerId, state),
  hasOnlinePlayers: () => hasOnlinePlayers(),
  hasQueuedSystemSimulationCommand: (predicate: (job: { command: { type: string } }) => boolean) => hasQueuedSystemSimulationCommand(predicate),
  enqueueSystemSimulationCommand: (command: SystemSimulationCommand) => enqueueSystemSimulationCommand(command),
  fortDefenseMultAt: (playerId: string, tileKey: TileKey) => fortDefenseMultAt(playerId, tileKey),
  playerDefensiveness: (player: Player) => playerDefensiveness(player),
  settledDefenseMultiplierForTarget: (defenderId: string, tile: Tile) => settledDefenseMultiplierForTarget(defenderId, tile),
  ownershipDefenseMultiplierForTarget: (defenderId: string | undefined, tile: Tile) => ownershipDefenseMultiplierForTarget(defenderId, tile),
  isAdjacentTile,
  markSummaryChunkDirtyAtTile: (x: number, y: number) => markSummaryChunkDirtyAtTile(x, y),
  logBarbarianEvent: (message: string) => logBarbarianEvent(message)
});

const prettyEconomicStructureLabel = (type: EconomicStructureType): string => {
  if (type === "FARMSTEAD") return "Farmstead";
  if (type === "CAMP") return "Camp";
  if (type === "MINE") return "Mine";
  if (type === "MARKET") return "Market";
  if (type === "GRANARY") return "Granary";
  if (type === "BANK") return "Bank";
  if (type === "AIRPORT") return "Airport";
  if (type === "WOODEN_FORT") return "Wooden Fort";
  if (type === "LIGHT_OUTPOST") return "Light Outpost";
  if (type === "FUR_SYNTHESIZER") return "Fur Synthesizer";
  if (type === "ADVANCED_FUR_SYNTHESIZER") return "Advanced Fur Synthesizer";
  if (type === "IRONWORKS") return "Ironworks";
  if (type === "ADVANCED_IRONWORKS") return "Advanced Ironworks";
  if (type === "CRYSTAL_SYNTHESIZER") return "Crystal Synthesizer";
  if (type === "ADVANCED_CRYSTAL_SYNTHESIZER") return "Advanced Crystal Synthesizer";
  if (type === "FUEL_PLANT") return "Fuel Plant";
  if (type === "CARAVANARY") return "Caravanary";
  if (type === "FOUNDRY") return "Foundry";
  if (type === "CUSTOMS_HOUSE") return "Customs House";
  if (type === "GARRISON_HALL") return "Garrison Hall";
  if (type === "GOVERNORS_OFFICE") return "Governor's Office";
  return "Radar System";
};

const manpowerCostForAction = (actionType: PendingCapture["actionType"] | ClientMessage["type"]): number => {
  if (actionType === "ATTACK") return ATTACK_MANPOWER_COST;
  if (actionType === "BREAKTHROUGH_ATTACK") return BREAKTHROUGH_ATTACK_MANPOWER_COST;
  if (actionType === "DEEP_STRIKE_ATTACK") return DEEP_STRIKE_MANPOWER_COST;
  if (actionType === "NAVAL_INFILTRATION_ATTACK") return NAVAL_INFILTRATION_MANPOWER_COST;
  return 0;
};

const manpowerMinForAction = (actionType: PendingCapture["actionType"] | ClientMessage["type"]): number => {
  if (actionType === "ATTACK") return ATTACK_MANPOWER_MIN;
  if (actionType === "BREAKTHROUGH_ATTACK") return BREAKTHROUGH_ATTACK_MANPOWER_MIN;
  if (actionType === "DEEP_STRIKE_ATTACK") return DEEP_STRIKE_MANPOWER_MIN;
  if (actionType === "NAVAL_INFILTRATION_ATTACK") return NAVAL_INFILTRATION_MANPOWER_MIN;
  return 0;
};

const hasEnoughManpower = (player: Player, amount: number): boolean => player.manpower + MANPOWER_EPSILON >= amount;

const connectedTownStepCount = (connectedTownCount: number): number => Math.max(0, Math.min(3, connectedTownCount));

const connectedTownBonusForOwner = (connectedTownCount: number, ownerId: string | undefined): number => {
  const stepCount = connectedTownStepCount(connectedTownCount);
  if (stepCount <= 0) return 0;
  const effects = ownerId ? getPlayerEffectsForPlayer(ownerId) : emptyPlayerEffects();
  let total = 0;
  for (const baseStep of [0.5, 0.4, 0.3].slice(0, stepCount)) total += baseStep + effects.connectedTownStepBonusAdd;
  return total;
};

const claimFirstSpecialSiteCaptureBonus = (player: Player, x: number, y: number): number => {
  const tk = key(x, y);
  if (firstSpecialSiteCaptureClaimed.has(tk) || !townsByTile.has(tk)) return 0;
  firstSpecialSiteCaptureClaimed.add(tk);
  player.points += FIRST_SPECIAL_SITE_CAPTURE_GOLD;
  recalcPlayerDerived(player);
  return FIRST_SPECIAL_SITE_CAPTURE_GOLD;
};

const getBarbarianProgressGain = (tile: Tile): number =>
  tile.ownerId && tile.ownerId !== BARBARIAN_OWNER_ID && (tile.ownershipState === "FRONTIER" || tile.ownershipState === "SETTLED") && (tile.resource || tile.town || tile.fort || tile.siegeOutpost || tile.dockId) ? 2 : 1;

const clearWorldProgressForSeason = (): void => {
  clearAllAiLatchedIntents(aiIntentLatchState);
  clearAllAiExecuteCandidates(aiExecuteCandidateCacheState);
  const pending = new Set<PendingCapture>(combatLocks.values());
  for (const pcap of pending) {
    pcap.cancelled = true;
    if (pcap.timeout) clearTimeout(pcap.timeout);
  }
  for (const settle of pendingSettlementsByTile.values()) {
    settle.cancelled = true;
    if (settle.timeout) clearTimeout(settle.timeout);
  }
  pendingSettlementsByTile.clear();
  townCaptureShockUntilByTile.clear();
  townGrowthShockUntilByTile.clear();
  tileYieldByTile.clear();
  tileHistoryByTile.clear();
  settledSinceByTile.clear();
  terrainShapesByTile.clear();
  victoryPressureById.clear();
  frontierSettlementsByPlayer.clear();
  seasonWinner = undefined;
  ownership.clear();
  ownershipStateByTile.clear();
  barbarianAgents.clear();
  barbarianAgentByTileKey.clear();
  combatLocks.clear();
  allianceRequests.clear();
  truceRequests.clear();
  trucesByPair.clear();
  truceBreakPenaltyByPair.clear();
  repeatFights.clear();
  collectVisibleCooldownByPlayer.clear();
  cachedVisibilitySnapshotByPlayer.clear();
  aiIndexStore.clearAll();
  aiTurnDebugByPlayer.clear();
  aiLastActionFailureByPlayer.clear();
  aiVictoryPathByPlayer.clear();
  aiVictoryPathUpdatedAtByPlayer.clear();
  clearAiCompetitionContext();
  cachedChunkSnapshotByPlayer.clear();
  simulationChunkState.clear();
  chunkSnapshotGenerationByPlayer.clear();
  revealWatchersByTarget.clear();
  economyIndexByPlayer.clear();
  observatoryTileKeysByPlayer.clear();
  economicStructureTileKeysByPlayer.clear();
  for (const t of fortBuildTimers.values()) clearTimeout(t);
  fortBuildTimers.clear();
  fortsByTile.clear();
  for (const t of observatoryBuildTimers.values()) clearTimeout(t);
  observatoryBuildTimers.clear();
  observatoriesByTile.clear();
  for (const t of siegeOutpostBuildTimers.values()) clearTimeout(t);
  siegeOutpostBuildTimers.clear();
  siegeOutpostsByTile.clear();
  for (const t of economicStructureBuildTimers.values()) clearTimeout(t);
  economicStructureBuildTimers.clear();
  economicStructuresByTile.clear();
  siphonByTile.clear();
  siphonCacheByPlayer.clear();
  activeAetherBridgesById.clear();
  activeAetherWallsById.clear();
  activeAetherWallIdsByEdgeKey.clear();
  strategicReplayEvents.length = 0;
  shardSitesByTile.clear();
  abilityCooldownsByPlayer.clear();
  revealedEmpireTargetsByPlayer.clear();
  breachShockByTile.clear();
  settlementDefenseByTile.clear();
  clearVictoryPressurePauseState();
  for (const d of dockById.values()) d.cooldownUntil = 0;
  vendettaCaptureCountsByPlayer.clear();
  for (const p of players.values()) {
    p.points = STARTING_GOLD;
    p.level = 0;
    delete p.techRootId;
    p.techIds.clear();
    p.domainIds.clear();
    p.allies.clear();
    p.territoryTiles.clear();
    p.T = 0;
    p.E = 0;
    p.Ts = 0;
    p.Es = 0;
    delete p.spawnOrigin;
    p.spawnShieldUntil = now() + 120_000;
    p.stamina = STAMINA_MAX;
    p.staminaUpdatedAt = now();
    p.manpower = Math.max(playerManpowerCap(p), STARTING_MANPOWER);
    p.manpowerUpdatedAt = now();
    p.manpowerCapSnapshot = Math.max(playerManpowerCap(p), STARTING_MANPOWER);
    p.isEliminated = false;
    p.respawnPending = false;
    p.missions = [];
    p.missionStats = defaultMissionStats();
    p.powerups = {};
    p.mods = { attack: 1, defense: 1, income: 1, vision: 1 };
    resourceCountsByPlayer.set(p.id, { FARM: 0, FISH: 0, FUR: 0, WOOD: 0, IRON: 0, GEMS: 0, OIL: 0 });
    strategicResourceStockByPlayer.set(p.id, emptyStrategicStocks());
    strategicResourceBufferByPlayer.set(p.id, emptyStrategicStocks());
    economyIndexByPlayer.set(p.id, emptyPlayerEconomyIndex());
    dynamicMissionsByPlayer.set(p.id, []);
    temporaryAttackBuffUntilByPlayer.delete(p.id);
    temporaryIncomeBuffUntilByPlayer.delete(p.id);
    forcedRevealTilesByPlayer.set(p.id, new Set<TileKey>());
    setRevealTargetsForPlayer(p.id, []);
    playerBaseMods.set(p.id, { attack: 1, defense: 1, income: 1, vision: 1 });
    playerEffectsByPlayer.set(p.id, emptyPlayerEffects());
    clusterControlledTilesByPlayer.set(p.id, new Map());
  }
};

const archiveCurrentSeason = (): void => {
  const endedAt = now();
  activeSeason.status = "archived";
  const rows = [...players.values()];
  const topBy = (score: (p: Player) => number): Array<{ playerId: string; name: string; value: number }> =>
    [...rows]
      .sort((a, b) => score(b) - score(a))
      .slice(0, 10)
      .map((p) => ({ playerId: p.id, name: p.name, value: score(p) }));
  const archiveEntry: SeasonArchiveEntry = {
    seasonId: activeSeason.seasonId,
    endedAt,
    mostTerritory: topBy((p) => p.T),
    mostPoints: topBy((p) => p.points),
    longestSurvivalMs: topBy((p) => Math.max(0, endedAt - p.lastActiveAt)),
    replayEvents: strategicReplayEvents.slice()
  };
  if (seasonWinner) archiveEntry.winner = seasonWinner;
  seasonArchives.push(archiveEntry);
  strategicReplayEvents.length = 0;
};

const startNewSeason = (): void => {
  archiveCurrentSeason();
  activeSeason = {
    seasonId: `s-${Date.now()}`,
    startAt: now(),
    endAt: now() + SEASON_LENGTH_DAYS * 24 * 60 * 60 * 1000,
    worldSeed: Math.floor(Math.random() * 1_000_000_000),
    techTreeConfigId: "",
    status: "active"
  };
  activeSeason.worldSeed = regenerateStrategicWorld(activeSeason.worldSeed);
  setWorldSeed(activeSeason.worldSeed);
  activeSeasonTechConfig = chooseSeasonalTechConfig(activeSeason.worldSeed);
  activeSeason.techTreeConfigId = activeSeasonTechConfig.configId;
  clearWorldProgressForSeason();
  seedInitialShardScatter(activeSeason.worldSeed);
  for (const p of players.values()) spawnPlayer(p);
  spawnInitialBarbarians();
  for (const p of players.values()) {
    recomputeClusterBonusForPlayer(p);
    const ws = socketsByPlayer.get(p.id);
    if (!ws || ws.readyState !== ws.OPEN) continue;
    ws.send(
      JSON.stringify({
        type: "SEASON_ROLLOVER",
        season: activeSeason,
        seasonTechTreeId: activeSeason.techTreeConfigId
      })
    );
  }
};

const regenerateWorldInPlace = (): void => {
  activeSeason.worldSeed = Math.floor(Math.random() * 1_000_000_000);
  activeSeason.worldSeed = regenerateStrategicWorld(activeSeason.worldSeed);
  setWorldSeed(activeSeason.worldSeed);
  activeSeasonTechConfig = chooseSeasonalTechConfig(activeSeason.worldSeed);
  activeSeason.techTreeConfigId = activeSeasonTechConfig.configId;
  clearWorldProgressForSeason();
  seedInitialShardScatter(activeSeason.worldSeed);
  for (const p of players.values()) spawnPlayer(p);
  spawnInitialBarbarians();
  for (const p of players.values()) {
    recomputeClusterBonusForPlayer(p);
    const ws = socketsByPlayer.get(p.id);
    if (!ws || ws.readyState !== ws.OPEN) continue;
    ws.send(
      JSON.stringify({
        type: "WORLD_REGENERATED",
        season: activeSeason
      })
    );
  }
};

const {
  runtimeTileCore,
  aiTileLiteAt,
  buildTownSummaryForTile,
  thinTownSummaryForTile,
  townSummaryForTile,
  applyTileYieldSummary,
  playerTile,
  cardinalNeighborCores,
  adjacentNeighborCores
} = createServerTileViewRuntime({
  WORLD_WIDTH,
  WORLD_HEIGHT,
  PASSIVE_INCOME_MULT,
  HARVEST_GOLD_RATE_MULT,
  SIPHON_SHARE,
  SETTLEMENT_BASE_GOLD_PER_MIN,
  TOWN_BASE_GOLD_PER_MIN,
  BARBARIAN_OWNER_ID,
  key,
  now,
  wrapX,
  wrapY,
  terrainAtRuntime,
  resourceAt,
  applyClusterResources,
  ownership,
  ownershipStateByTile,
  docksByTile,
  townsByTile,
  fortsByTile,
  observatoriesByTile,
  siegeOutpostsByTile,
  economicStructuresByTile,
  clusterByTile,
  clustersById,
  breachShockByTile,
  siphonByTile,
  tileHistoryByTile,
  tileYieldByTile,
  players,
  resourceRate,
  strategicDailyFromResource,
  parseKey,
  activeSettlementTileKeyForPlayer: (playerId: string) => activeSettlementTileKeyForPlayer(playerId),
  townSupport: (townKey: TileKey, ownerId: string) => townSupport(townKey, ownerId),
  townPopulationTierForTown,
  isTownFedForOwner: (townKey: TileKey, ownerId: string | undefined) => isTownFedForOwner(townKey, ownerId),
  townGoldIncomeEnabledForPlayer,
  effectiveManpowerAt: (player: Player) => effectiveManpowerAt(player),
  playerManpowerCap: (player: Player) => playerManpowerCap(player),
  structureForSupportedTown: (townKey: TileKey, ownerId: string | undefined, type: string) =>
    structureForSupportedTown(townKey, ownerId, type as EconomicStructureType),
  directlyConnectedTownKeysForTown: (ownerId: string, townKey: TileKey) =>
    directlyConnectedTownKeysForTown(ownerId, townKey),
  prettyTownName,
  townIncomeForOwner: (town: TownDefinition, ownerId: string | undefined) => townIncomeForOwner(town, ownerId),
  townCapForOwner: (town: TownDefinition, ownerId: string | undefined) => townCapForOwner(town, ownerId),
  townPopulationGrowthPerMinuteForOwner: (town: TownDefinition, ownerId: string | undefined) =>
    townPopulationGrowthPerMinuteForOwner(town, ownerId),
  townFoodUpkeepPerMinute,
  townGrowthModifiersForOwner: (town: TownDefinition, ownerId: string | undefined) =>
    townGrowthModifiersForOwner(town, ownerId),
  dockSummaryForOwner: (dock: Dock, ownerId: string | undefined) => dockSummaryForOwner(dock, ownerId),
  dockIncomeForOwner: (dock: Dock, ownerId: string) => dockIncomeForOwner(dock, ownerId),
  shardSiteViewAt: (tileKey: TileKey) => shardSiteViewAt(tileKey),
  regionTypeAtLocal,
  observatoryStatusForTile: (ownerId: string, tileKey: TileKey) => observatoryStatusForTile(ownerId, tileKey),
  siphonMultiplierAt: (tileKey: TileKey) => siphonMultiplierAt(tileKey),
  toStrategicResource,
  activeResourceIncomeMult: (playerId: string, resource: ResourceType) =>
    activeResourceIncomeMult(playerId, resource),
  economicStructureOutputMultAt: (tileKey: TileKey, ownerId: string) =>
    economicStructureOutputMultAt(tileKey, ownerId),
  converterStructureOutputFor: (structureType: string, ownerId: string) =>
    converterStructureOutputFor(structureType as EconomicStructureType, ownerId),
  tileYieldCapsFor: (tileKey: TileKey, ownerId: string | undefined) => tileYieldCapsFor(tileKey, ownerId),
  roundedPositiveStrategic: (strategic: Record<StrategicResource, number>) => roundedPositiveStrategic(strategic),
  hasPositiveStrategicBuffer: (strategic: Partial<Record<StrategicResource, number>>) =>
    hasPositiveStrategicBuffer(strategic),
  continentIdAt,
  tileUpkeepEntriesForTile: (tileKey: TileKey, ownerId: string | undefined) => tileUpkeepEntriesForTile(tileKey, ownerId)
});

const simulationChunkState = createSimulationChunkState({
  worldWidth: WORLD_WIDTH,
  worldHeight: WORLD_HEIGHT,
  chunkSize: CHUNK_SIZE,
  now,
  wrapX,
  wrapY,
  chunkKeyAtTile: (x, y) => chunkKeyAtTile(x, y),
  key,
  barbarianOwnerId: BARBARIAN_OWNER_ID,
  terrainAtRuntime,
  ownership,
  ownershipStateByTile,
  resourceAt,
  applyClusterResources,
  clusterByTile,
  clustersById,
  docksByTile,
  shardSiteViewAt,
  townsByTile,
  fortsByTile,
  observatoriesByTile,
  siegeOutpostsByTile,
  siphonByTile,
  breachShockByTile,
  regionTypeAtLocal,
  thinTownSummaryForTile,
  townSummaryForTile,
  observatoryStatusForTile: (ownerId, tileKey) => observatoryStatusForTile(ownerId, tileKey),
  applyTileYieldSummary,
  activeSettlementTileKeyForPlayer,
  economicStructuresByTile,
  siphonShare: SIPHON_SHARE
});
const summaryChunkVersionByChunkKey = simulationChunkState.summaryChunkVersionByChunkKey;
const cachedSummaryChunkByChunkKey = simulationChunkState.cachedSummaryChunkByChunkKey;
const summaryChunkTiles = simulationChunkState.summaryChunkTiles;
const summaryTileAt = simulationChunkState.summaryTileAt;

const {
  isValidCapitalTile,
  chooseCapitalTileKey,
  markVisibilityDirty,
  markVisibilityDirtyForPlayers,
  setRevealTargetsForPlayer,
  visibilitySnapshotForPlayer,
  visibleInSnapshot,
  visible
} = createServerVisibilityStateRuntime({
  WORLD_WIDTH,
  WORLD_HEIGHT,
  DISABLE_FOG,
  players,
  ownership,
  ownershipStateByTile,
  townsByTile,
  cachedVisibilitySnapshotByPlayer,
  chunkSnapshotGenerationByPlayer,
  revealedEmpireTargetsByPlayer,
  revealWatchersByTarget,
  forcedRevealTilesByPlayer,
  fogDisabledByPlayer,
  parseKey,
  wrapX,
  wrapY,
  activeSettlementTileKeyForPlayer: (playerId: string) => activeSettlementTileKeyForPlayer(playerId),
  effectiveVisionRadiusForPlayer: (player: Player) => effectiveVisionRadiusForPlayer(player)
});

const {
  getOrInitResourceCounts,
  emptyStrategicStocks,
  emptyTileYield,
  emptyPlayerEconomyIndex,
  getOrInitEconomyIndex,
  getOrInitOwnedTileKeySet,
  trackOwnedTileKey,
  untrackOwnedTileKey,
  ownedStructureCountForPlayer,
  rebuildEconomyIndexForPlayer,
  hasPositiveStrategicBuffer,
  pruneEmptyTileYield,
  roundedPositiveStrategic,
  getOrInitStrategicStocks,
  getOrInitStrategicBuffer,
  getOrInitTileYield,
  availableYieldStrategicForPlayer
} = createServerEconomyStateRuntime({
  resourceCountsByPlayer,
  strategicResourceStockByPlayer,
  strategicResourceBufferByPlayer,
  tileYieldByTile,
  economyIndexByPlayer,
  observatoryTileKeysByPlayer,
  economicStructureTileKeysByPlayer,
  players,
  ownershipStateByTile,
  fortsByTile,
  siegeOutpostsByTile,
  economicStructuresByTile,
  docksByTile,
  townsByTile,
  parseKey,
  terrainAtRuntime,
  applyClusterResources,
  resourceAt,
  strategicResourceKeys: STRATEGIC_RESOURCE_KEYS
});

const emptyUpkeepBreakdown = (): UpkeepBreakdown => ({ need: 0, fromYield: 0, fromStock: 0, remaining: 0, contributors: [] });
const emptyUpkeepDiagnostics = (): UpkeepDiagnostics => ({
  food: emptyUpkeepBreakdown(),
  iron: emptyUpkeepBreakdown(),
  supply: emptyUpkeepBreakdown(),
  crystal: emptyUpkeepBreakdown(),
  oil: emptyUpkeepBreakdown(),
  gold: emptyUpkeepBreakdown(),
  foodCoverage: 1
});

const consumeYieldStrategicForPlayer = (
  player: Player,
  resource: StrategicResource,
  needed: number,
  touchedTileKeys: Set<TileKey>
): number => {
  if (needed <= 0) return 0;
  let remaining = needed;
  let paid = 0;
  for (const tk of player.territoryTiles) {
    if (ownershipStateByTile.get(tk) !== "SETTLED") continue;
    if (remaining <= 0) break;
    const y = tileYieldByTile.get(tk);
    if (!y) continue;
    const available = Math.max(0, y.strategic[resource] ?? 0);
    if (available <= 0) continue;
    const take = Math.min(available, remaining);
    y.strategic[resource] = Math.max(0, available - take);
    remaining -= take;
    paid += take;
    touchedTileKeys.add(tk);
    pruneEmptyTileYield(tk, y);
  }
  return paid;
};

const consumeYieldGoldForPlayer = (player: Player, needed: number, touchedTileKeys: Set<TileKey>): number => {
  if (needed <= 0) return 0;
  let remaining = needed;
  let paid = 0;
  for (const tk of player.territoryTiles) {
    if (ownershipStateByTile.get(tk) !== "SETTLED") continue;
    if (remaining <= 0) break;
    const y = tileYieldByTile.get(tk);
    if (!y) continue;
    const available = Math.max(0, y.gold);
    if (available <= 0) continue;
    const take = Math.min(available, remaining);
    y.gold = Math.max(0, available - take);
    remaining -= take;
    paid += take;
    touchedTileKeys.add(tk);
    pruneEmptyTileYield(tk, y);
  }
  return paid;
};

const {
  getPlayerEffectsForPlayer,
  recomputePlayerEffectsForPlayer,
  revealCapacityForPlayer,
  effectiveVisionRadiusForPlayer,
  getOrInitRevealTargets,
  getAbilityCooldowns,
  abilityReadyAt,
  abilityOnCooldown,
  startAbilityCooldown,
  playerHasTechIds,
  getOrInitDynamicMissions,
  getOrInitForcedReveal,
  activeAttackBuffMult,
  revealLinkedDocksForPlayer,
  activeResourceIncomeMult
} = createServerPlayerEffectsRuntime({
  techById,
  domainById,
  playerEffectsByPlayer,
  revealedEmpireTargetsByPlayer,
  revealWatchersByTarget,
  abilityCooldownsByPlayer,
  dynamicMissionsByPlayer,
  forcedRevealTilesByPlayer,
  temporaryAttackBuffUntilByPlayer,
  temporaryIncomeBuffUntilByPlayer,
  docksByTile,
  emptyPlayerEffects,
  now,
  VISION_RADIUS,
  RESOURCE_CHAIN_MULT,
  VENDETTA_ATTACK_BUFF_MULT,
  ABILITY_DEFS,
  markVisibilityDirty: (playerId: string) => markVisibilityDirty(playerId),
  dockLinkedDestinations,
  parseKey,
  key,
  wrapX,
  wrapY,
  WORLD_WIDTH,
  WORLD_HEIGHT
});

const {
  chebyshevDistance,
  lineTilesBetween,
  validDeepStrikeTarget,
  validNavalInfiltrationTarget,
  fortOperationalForOwner,
  woodenFortOperationalForOwner,
  siegeOutpostOperationalForOwner,
  lightOutpostOperationalForOwner,
  targetHasActiveFortification,
  originHasActiveOutpost,
  fortDefenseMultAt,
  settledDefenseNearFortApplies,
  settlementDefenseMultAt,
  ownershipDefenseMultiplierForTarget,
  frontierDefenseAddForTarget,
  outpostAttackMultAt,
  attackMultiplierForTarget,
  settledDefenseMultiplierForTarget,
  originTileHeldByActiveFort,
  applyFailedAttackTerritoryOutcome,
  incrementVendettaCount,
  isAlly,
  applyStaminaRegen,
  settleAttackManpower,
  settledTileCountForPlayer,
  seizeStoredYieldOnCapture,
  pillageSettledTile
} = createServerCombatSupportRuntime({
  WORLD_WIDTH,
  WORLD_HEIGHT,
  DEEP_STRIKE_MAX_DISTANCE,
  NAVAL_INFILTRATION_MAX_RANGE,
  SETTLED_DEFENSE_NEAR_FORT_RADIUS,
  STAMINA_MAX,
  BARBARIAN_OWNER_ID,
  fortsByTile,
  siegeOutpostsByTile,
  economicStructuresByTile,
  ownership,
  ownershipStateByTile,
  settlementDefenseByTile,
  vendettaCaptureCountsByPlayer,
  players,
  tileYieldByTile,
  parseKey,
  key,
  wrapX,
  wrapY,
  terrainAtRuntime,
  now,
  wrappedChebyshevDistance,
  getPlayerEffectsForPlayer: (playerId: string) => getPlayerEffectsForPlayer(playerId),
  supportedFrontierUsesSettledDefenseAt: (defenderId: string | undefined, target: Tile) =>
    supportedFrontierUsesSettledDefenseAt(defenderId, target),
  fortDefenseMultiplier,
  outpostAttackMultiplier,
  fortifiedTargetAttackMultiplier,
  truceBreakAttackMultiplier: (attackerId: string, defenderId: string) =>
    truceBreakAttackMultiplier(attackerId, defenderId),
  resolveFailedBarbarianDefenseOutcome,
  updateOwnership: (x: number, y: number, ownerId?: string, ownershipState?: OwnershipState) =>
    updateOwnership(x, y, ownerId, ownershipState),
  getOrInitStrategicStocks: (playerId: string) => getOrInitStrategicStocks(playerId),
  strategicResourceKeys: STRATEGIC_RESOURCE_KEYS,
  pruneEmptyTileYield: (tileKey: TileKey, yieldBuffer) => pruneEmptyTileYield(tileKey, yieldBuffer)
});

const recalcPlayerDerived = (p: Player): void => {
  p.level = levelFromPoints(p.points);
};

const playerDefensiveness = (p: Player): number => {
  return defensivenessMultiplier(Math.max(1, p.Ts), Math.max(1, p.Es));
};

const recordServerDebugEvent = (
  level: "info" | "warn" | "error",
  event: string,
  payload: Record<string, unknown>
): void => {
  serverDebugBundle.record(level, event, payload);
};

const HOT_PATH_TIMING_INFO_MS = 8;

let snapshotSaveRequestedAt = 0;
let snapshotSaveRunning = false;
let snapshotSavePending = false;
let snapshotSaveDeferredTimer: ReturnType<typeof setTimeout> | undefined;

const hotPathContentionContext = (): Record<string, unknown> => ({
  humanFrontierActionPriorityActive: humanFrontierActionPriorityActive(),
  humanChunkSnapshotPriorityActive: humanChunkSnapshotPriorityActive(),
  snapshotSaveRunning,
  snapshotSavePending,
  snapshotSaveRequestedAt: snapshotSaveRequestedAt || undefined,
  aiQueueDepth: aiWorkerState.queue.length,
  simulationQueueDepth: simulationCommandQueueDepth(),
  onlineHumanPlayerCount: onlineHumanPlayerCount()
});

const recordHotPathTimingEvent = (
  event: string,
  payload: Record<string, unknown>,
  elapsedMs: number,
  warnMs = 40
): void => {
  if (elapsedMs < warnMs && elapsedMs < HOT_PATH_TIMING_INFO_MS && !humanFrontierActionPriorityActive()) return;
  recordServerDebugEvent(elapsedMs >= warnMs ? "warn" : "info", event, {
    elapsedMs,
    ...hotPathContentionContext(),
    ...payload
  });
};
const logBarbarianEvent = (message: string): void => {
  app.log.info(`[barbarian] ${message}`);
};
const techPayloadSnapshotForPlayer = (player: Player, scope: "init" | "player_update" | "tech_update") =>
  resolvePlayerTechPayloadSnapshot({
    player,
    activeSeasonTechConfig,
    worldSeed: activeSeason.worldSeed,
    chooseSeasonalTechConfig,
    seasonTechConfigIsCompatible,
    setActiveSeasonTechConfig: (config) => {
      activeSeasonTechConfig = config;
      activeSeason.techTreeConfigId = config.configId;
    },
    reachableTechs,
    activeTechCatalog,
    onRepair: (event) => {
      console.warn("[tech] repaired payload before send", { scope, ...event });
    }
  });

const HOT_PLAYER_UPDATE_WARN_MS = 40;

const { sendPlayerUpdate } = createServerPlayerUpdateRuntime({
  HOT_PLAYER_UPDATE_WARN_MS,
  now,
  applyManpowerRegen: (player) => applyManpowerRegen(player),
  bulkSocketForPlayer: (playerId) => bulkSocketForPlayer(playerId),
  getOrInitStrategicStocks: (playerId) => getOrInitStrategicStocks(playerId),
  techPayloadSnapshotForPlayer: (player, scope) => techPayloadSnapshotForPlayer(player, scope),
  refreshGlobalStatusCache: (force) => refreshGlobalStatusCache(force),
  pendingSettlementsByTile,
  parseKey,
  developmentProcessCapacityForPlayer: (playerId) => developmentProcessCapacityForPlayer(playerId),
  activeDevelopmentProcessCountForPlayer: (playerId) => activeDevelopmentProcessCountForPlayer(playerId),
  logTileSync: (event, payload) => logTileSync(event, payload),
  developmentProcessDebugBreakdownForPlayer: (playerId) => developmentProcessDebugBreakdownForPlayer(playerId),
  playerManpowerCap: (player) => playerManpowerCap(player),
  playerManpowerRegenPerMinute: (player) => playerManpowerRegenPerMinute(player),
  playerDefensiveness: (player) => playerDefensiveness(player),
  empireStyleFromPlayer: (player) => empireStyleFromPlayer(player),
  playerModBreakdown: (player) => playerModBreakdown(player),
  playerManpowerBreakdown: (player) => playerManpowerBreakdown(player),
  playerEconomySnapshot: (player) => playerEconomySnapshot(player),
  availableTechPicks: (player) => availableTechPicks(player),
  reachableDomains: (player) => reachableDomains(player),
  activeDomainCatalog: (player) => activeDomainCatalog(player),
  revealCapacityForPlayer: (player) => revealCapacityForPlayer(player),
  getOrInitRevealTargets: (playerId) => getOrInitRevealTargets(playerId),
  getAbilityCooldowns: (playerId) => getAbilityCooldowns(playerId),
  activeAetherBridgesById,
  activeAetherWallViews: () => activeAetherWallViews(),
  allianceRequests,
  truceRequests,
  activeTruceViewsForPlayer: (playerId) => activeTruceViewsForPlayer(playerId),
  missionPayload: (player) => missionPayload(player),
  leaderboardSnapshotForPlayer: (playerId) => leaderboardSnapshotForPlayer(playerId),
  seasonVictoryObjectivesForPlayer: (playerId) => seasonVictoryObjectivesForPlayer(playerId),
  seasonWinner,
  recordServerDebugEvent,
  appLogWarn: (payload, message) => app.log.warn(payload, message)
});

const collectYieldFromTile = (
  player: Player,
  tk: TileKey
): { gold: number; strategic: Record<StrategicResource, number> } => {
  const out = { gold: 0, strategic: emptyStrategicStocks() };
  const y = tileYieldByTile.get(tk);
  if (!y) return out;
  const [x, yPos] = parseKey(tk);
  const t = playerTile(x, yPos);
  if (t.ownerId !== player.id || t.terrain !== "LAND") return out;
  if (t.ownershipState !== "SETTLED") return out;
  const gold = Math.floor(y.gold * 100) / 100;
  if (gold > 0) {
    player.points += gold;
    out.gold = gold;
    y.gold = 0;
  }
  const stock = getOrInitStrategicStocks(player.id);
  for (const r of STRATEGIC_RESOURCE_KEYS) {
    const amt = Math.floor((y.strategic[r] ?? 0) * 100) / 100;
    if (amt <= 0) continue;
    stock[r] += amt;
    out.strategic[r] = amt;
    y.strategic[r] = 0;
  }
  pruneEmptyTileYield(tk, y);
  return out;
};

const collectVisibleYield = (
  player: Player
): { tiles: number; gold: number; strategic: Record<StrategicResource, number>; touchedTileKeys: TileKey[] } => {
  const out = { tiles: 0, gold: 0, strategic: emptyStrategicStocks(), touchedTileKeys: [] as TileKey[] };
  for (const tk of player.territoryTiles) {
    if (ownershipStateByTile.get(tk) !== "SETTLED") continue;
    const [x, y] = parseKey(tk);
    if (!visible(player, x, y)) continue;
    const got = collectYieldFromTile(player, tk);
    const touched = got.gold > 0 || hasPositiveStrategicBuffer(got.strategic);
    if (!touched) continue;
    out.tiles += 1;
    out.gold += got.gold;
    out.touchedTileKeys.push(tk);
    for (const r of STRATEGIC_RESOURCE_KEYS) out.strategic[r] += got.strategic[r] ?? 0;
  }
  if (out.gold > 0) recalcPlayerDerived(player);
  return out;
};

const {
  hasPendingSettlementForPlayer,
  pendingSettlementCountForPlayer,
  tileHasPendingSettlement,
  tryQueueBasicFrontierAction
} = createServerFrontierActionRuntime({
  FRONTIER_ACTION_GOLD_COST,
  BREACH_SHOCK_DEF_MULT,
  PVP_REWARD_MULT,
  BARBARIAN_OWNER_ID,
  players,
  docksByTile,
  breachShockByTile,
  pendingSettlementsByTile,
  combatLocks,
  barbarianAgents,
  barbarianAgentByTileKey,
  repeatFights,
  socketsByPlayer,
  telemetryCounters,
  now,
  key,
  parseKey,
  playerTile,
  recalcPlayerDerived: (player) => recalcPlayerDerived(player),
  updateOwnership: (x, y, ownerId, ownershipState) => updateOwnership(x, y, ownerId, ownershipState),
  applyStaminaRegen: (player) => applyStaminaRegen(player),
  applyManpowerRegen: (player) => applyManpowerRegen(player),
  hasEnoughManpower: (player, amount) => hasEnoughManpower(player, amount),
  manpowerMinForAction: (actionType) => manpowerMinForAction(actionType),
  manpowerCostForAction: (actionType) => manpowerCostForAction(actionType),
  isAdjacentTile,
  validDockCrossingTarget: (dock, x, y, allowAdjacentToDock) => validDockCrossingTarget(dock, x, y, allowAdjacentToDock),
  findOwnedDockOriginForCrossing,
  crossingBlockedByAetherWall: (fromX, fromY, toX, toY) => crossingBlockedByAetherWall(fromX, fromY, toX, toY),
  markAiDefensePriority: (playerId) => markAiDefensePriority(playerId),
  frontierClaimDurationMsAt,
  outpostAttackMultAt: (attackerId, tileKey) => outpostAttackMultAt(attackerId, tileKey),
  activeAttackBuffMult: (playerId) => activeAttackBuffMult(playerId),
  attackMultiplierForTarget: (attackerId, target, originTileKey) => attackMultiplierForTarget(attackerId, target, originTileKey),
  playerDefensiveness: (player) => playerDefensiveness(player),
  fortDefenseMultAt: (defenderId, tileKey) => fortDefenseMultAt(defenderId, tileKey),
  settledDefenseMultiplierForTarget: (defenderId, target) => settledDefenseMultiplierForTarget(defenderId, target),
  settlementDefenseMultAt: (defenderId, tileKey) => settlementDefenseMultAt(defenderId, tileKey),
  ownershipDefenseMultiplierForTarget: (defenderId, target) => ownershipDefenseMultiplierForTarget(defenderId, target),
  frontierDefenseAddForTarget: (defenderId, target) => frontierDefenseAddForTarget(defenderId, target),
  originTileHeldByActiveFort: (actorId, tileKey) => originTileHeldByActiveFort(actorId, tileKey),
  resolveFailedBarbarianDefenseOutcome,
  applyFailedAttackTerritoryOutcome,
  settleAttackManpower: (player, committedManpower, attackerWon, atkEff, defEff) =>
    settleAttackManpower(player, committedManpower, attackerWon, atkEff, defEff),
  applyTownWarShock: (tileKey) => applyTownWarShock(tileKey),
  settledTileCountForPlayer: (player) => settledTileCountForPlayer(player),
  seizeStoredYieldOnCapture: (attacker, tileKey) => seizeStoredYieldOnCapture(attacker, tileKey),
  pillageSettledTile: (attacker, defender, defenderTileCountBeforeCapture) =>
    pillageSettledTile(attacker, defender, defenderTileCountBeforeCapture),
  incrementVendettaCount: (attackerId, targetId) => incrementVendettaCount(attackerId, targetId),
  maybeIssueVendettaMission: (player, otherPlayerId) => maybeIssueVendettaMission(player, otherPlayerId),
  maybeIssueResourceMission: (player, resource) => maybeIssueResourceMission(player, resource),
  updateMissionState: (player) => updateMissionState(player),
  resolveEliminationIfNeeded: (player, isOnline) => resolveEliminationIfNeeded(player, isOnline),
  sendPlayerUpdate: (player, incomeDelta) => sendPlayerUpdate(player, incomeDelta),
  sendLocalVisionDeltaForPlayer: (playerId, changedCenters) => sendLocalVisionDeltaForPlayer(playerId, changedCenters),
  sendToPlayer: (playerId, payload) => sendToPlayer(playerId, payload),
  sendPostCombatFollowUps: (actorId, changedCenters, defenderId) =>
    sendPostCombatFollowUps(actorId, changedCenters, defenderId),
  claimFirstSpecialSiteCaptureBonus: (player, x, y) => claimFirstSpecialSiteCaptureBonus(player, x, y),
  pairKeyFor: (a, b) => pairKeyFor(a, b),
  pruneRepeatFightEntries: (pairKey, nowMs) => pruneRepeatFightEntries(pairKey, nowMs),
  getBarbarianProgressGain: (from) => getBarbarianProgressGain(from),
  upsertBarbarianAgent: (agent) => upsertBarbarianAgent(agent),
  logBarbarianEvent,
  baseTileValue: (resource) => baseTileValue(resource)
});


const chooseAiTech = (actor: Player): string | undefined => {
  if (availableTechPicks(actor) <= 0) return undefined;
  const flags = playerWorldFlags(actor);
  const counts = getOrInitResourceCounts(actor.id);
  const affordable = reachableTechs(actor)
    .map((id) => techById.get(id))
    .filter((tech): tech is NonNullable<typeof tech> => Boolean(tech))
    .filter((tech) => techChecklistFor(actor, tech).ok)
    .map((tech) => {
      let score = 0;
      if (tech.id === "toolmaking") score += 80;
      if (tech.id === "agriculture" && (flags.has("active_town") || (counts.FARM ?? 0) > 0 || (counts.FISH ?? 0) > 0)) score += 55;
      if (tech.id === "trade" && flags.has("active_town")) score += 50;
      if (tech.id === "trade" && flags.has("active_dock")) score += 40;
      if (tech.id === "tribal-warfare" && (counts.IRON ?? 0) > 0) score += 40;
      if (tech.id === "tribal-warfare" && (flags.has("active_town") || flags.has("active_dock"))) score += 28;
      if (tech.id === "cartography" && (counts.GEMS ?? 0) > 0) score += 30;
      if (tech.id === "mining" && (flags.has("active_iron_site") || flags.has("active_crystal_site"))) score += 55;
      if (tech.id === "masonry" && flags.has("active_town")) score += 45;
      if (tech.id === "masonry" && flags.has("active_dock")) score += 25;
      if (tech.id === "leatherworking" && ((counts.WOOD ?? 0) > 0 || (counts.FUR ?? 0) > 0)) score += 35;
      if (tech.id === "harborcraft" && flags.has("active_dock")) score += 65;
      if (tech.id === "maritime-trade" && flags.has("active_dock")) score += 55;
      if (tech.id === "port-infrastructure" && flags.has("active_dock")) score += 45;
      if (tech.id === "coinage" && flags.has("active_town")) score += 55;
      if (tech.id === "banking" && flags.has("active_town")) score += 45;
      if (tech.id === "civil-service" && flags.has("active_town")) score += 35;
      if (tech.id === "aeronautics" && (counts.OIL ?? 0) > 0) score += 50;
      score += Math.max(0, 24 - techDepth(tech.id) * 6);
      return { id: tech.id, score };
    })
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return affordable[0]?.id;
};

const chooseAiDomain = (actor: Player): string | undefined => {
  const flags = playerWorldFlags(actor);
  const counts = getOrInitResourceCounts(actor.id);
  const affordable = reachableDomains(actor)
    .map((id) => domainById.get(id))
    .filter((domain): domain is NonNullable<typeof domain> => Boolean(domain))
    .filter((domain) => domainChecklistFor(actor, domain.id).ok)
    .map((domain) => {
      let score = 0;
      if (domain.id === "frontier-doctrine" && !flags.has("active_town")) score += 45;
      if (domain.id === "frontier-doctrine" && actor.T < 20) score += 20;
      if (domain.id === "mercantile-charter" && flags.has("active_town")) score += 65;
      if (domain.id === "mercantile-charter" && flags.has("active_dock")) score += 35;
      if (domain.id === "farmers-compact" && ((counts.FARM ?? 0) > 0 || (counts.FISH ?? 0) > 0)) score += 50;
      if (domain.id === "iron-bastions" && flags.has("active_town")) score += 20;
      if (domain.id === "supply-raiding" && (counts.WOOD ?? 0) + (counts.FUR ?? 0) > 0) score += 18;
      return { id: domain.id, score };
    })
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return affordable[0]?.id;
};

const maybePickAiTech = (actor: Player): void => {
  const choice = chooseAiTech(actor);
  if (!choice) return;
  const outcome = startTechResearch(actor, choice);
  if (!outcome.ok) return;
  sendTechUpdate(actor, "started");
  sendPlayerUpdate(actor, 0);
};

const maybePickAiDomain = (actor: Player): void => {
  const choice = chooseAiDomain(actor);
  if (!choice) return;
  const outcome = applyDomain(actor, choice);
  if (!outcome.ok) return;
  recomputeClusterBonusForPlayer(actor);
  sendPlayerUpdate(actor, 0);
};

const executeUnifiedGameplayMessage = async (
  actor: Player,
  msg: ClientMessage,
  socket: Ws,
  queuedExecution = false
): Promise<boolean> => {
  actor.lastActiveAt = now();

  if (msg.type === "PING") {
    socket.send(JSON.stringify({ type: "PONG", t: msg.t }));
    return true;
  }

  if (msg.type === "SETTLE") {
    const out = startSettlement(actor, msg.x, msg.y);
    if (!out.ok) {
      recordAiActionFailure(actor, "settle_owned_frontier_tile", "SETTLE_INVALID", out.reason ?? "unknown settle failure", { x: msg.x, y: msg.y });
      socket.send(JSON.stringify({ type: "ERROR", code: "SETTLE_INVALID", message: out.reason, x: msg.x, y: msg.y }));
      return true;
    }
    aiLastActionFailureByPlayer.delete(actor.id);
    if (queuedExecution && actor.isAi) {
      latchQueuedAiIntent(actor, "settle_owned_frontier_tile", "settlement", out.resolvesAt ?? now() + SETTLE_MS, key(msg.x, msg.y));
    }
    sendPlayerUpdate(actor, 0);
    return true;
  }

  if (msg.type === "BUILD_FORT") {
    const out = tryBuildFort(actor, msg.x, msg.y);
    if (!out.ok) {
      recordAiActionFailure(actor, "build_fort_on_exposed_tile", "FORT_BUILD_INVALID", out.reason ?? "unknown fort build failure", { x: msg.x, y: msg.y });
      socket.send(JSON.stringify({ type: "ERROR", code: "FORT_BUILD_INVALID", message: out.reason }));
      return true;
    }
    aiLastActionFailureByPlayer.delete(actor.id);
    if (queuedExecution && actor.isAi) {
      latchQueuedAiIntent(actor, "build_fort_on_exposed_tile", "structure", now() + structureBuildDurationMsForRuntime("FORT"), key(msg.x, msg.y));
    }
    updateOwnership(msg.x, msg.y, actor.id);
    sendPlayerUpdate(actor, 0);
    return true;
  }

  if (msg.type === "BUILD_OBSERVATORY") {
    const out = tryBuildObservatory(actor, msg.x, msg.y);
    if (!out.ok) {
      socket.send(JSON.stringify({ type: "ERROR", code: "OBSERVATORY_BUILD_INVALID", message: out.reason }));
      return true;
    }
    if (queuedExecution && actor.isAi) {
      latchQueuedAiIntent(actor, "build_observatory", "structure", now() + structureBuildDurationMsForRuntime("OBSERVATORY"), key(msg.x, msg.y));
    }
    updateOwnership(msg.x, msg.y, actor.id);
    sendPlayerUpdate(actor, 0);
    return true;
  }

  if (msg.type === "BUILD_ECONOMIC_STRUCTURE") {
    const out = tryBuildEconomicStructure(actor, msg.x, msg.y, msg.structureType);
    if (!out.ok) {
      recordAiActionFailure(actor, "build_economic_structure", "ECONOMIC_STRUCTURE_BUILD_INVALID", out.reason ?? "unknown economic build failure", {
        x: msg.x,
        y: msg.y
      });
      socket.send(JSON.stringify({ type: "ERROR", code: "ECONOMIC_STRUCTURE_BUILD_INVALID", message: out.reason }));
      return true;
    }
    aiLastActionFailureByPlayer.delete(actor.id);
    if (queuedExecution && actor.isAi) {
      latchQueuedAiIntent(
        actor,
        "build_economic_structure",
        "structure",
        now() + structureBuildDurationMsForRuntime(msg.structureType),
        key(msg.x, msg.y)
      );
    }
    updateOwnership(msg.x, msg.y, actor.id);
    sendPlayerUpdate(actor, 0);
    return true;
  }

  if (msg.type === "OVERLOAD_SYNTHESIZER") {
    const out = tryOverloadSynthesizer(actor, msg.x, msg.y);
    if (!out.ok) {
      socket.send(JSON.stringify({ type: "ERROR", code: "SYNTH_OVERLOAD_INVALID", message: out.reason }));
      return true;
    }
    sendPlayerUpdate(actor, 0);
    return true;
  }

  if (msg.type === "SET_CONVERTER_STRUCTURE_ENABLED") {
    const out = trySetConverterStructureEnabled(actor, msg.x, msg.y, msg.enabled);
    if (!out.ok) {
      socket.send(JSON.stringify({ type: "ERROR", code: "CONVERTER_TOGGLE_INVALID", message: out.reason }));
      return true;
    }
    updateOwnership(msg.x, msg.y, actor.id);
    sendPlayerUpdate(actor, 0);
    return true;
  }

  if (msg.type === "CANCEL_STRUCTURE_BUILD") {
    const tk = key(wrapX(msg.x, WORLD_WIDTH), wrapY(msg.y, WORLD_HEIGHT));
    const out = cancelInProgressBuildForPlayer(actor, tk);
    if (!out.ok) {
      socket.send(JSON.stringify({ type: "ERROR", code: out.code, message: out.message }));
      return true;
    }
    updateOwnership(msg.x, msg.y, actor.id);
    return true;
  }

  if (msg.type === "BUILD_SIEGE_OUTPOST") {
    const out = tryBuildSiegeOutpost(actor, msg.x, msg.y);
    if (!out.ok) {
      socket.send(JSON.stringify({ type: "ERROR", code: "SIEGE_OUTPOST_BUILD_INVALID", message: out.reason }));
      return true;
    }
    updateOwnership(msg.x, msg.y, actor.id);
    sendPlayerUpdate(actor, 0);
    return true;
  }

  if (msg.type === "COLLECT_VISIBLE") {
    const cdUntil = collectVisibleCooldownByPlayer.get(actor.id) ?? 0;
    if (cdUntil > now()) {
      socket.send(JSON.stringify({ type: "ERROR", code: "COLLECT_COOLDOWN", message: "collect visible is on cooldown" }));
      return true;
    }
    const got = collectVisibleYield(actor);
    collectVisibleCooldownByPlayer.set(actor.id, now() + COLLECT_VISIBLE_COOLDOWN_MS);
    if (got.touchedTileKeys.length > 0) {
      const updates = got.touchedTileKeys.map((tk) => {
        const [x, y] = parseKey(tk);
        return playerTile(x, y);
      });
      sendBulkToPlayer(actor.id, { type: "TILE_DELTA", updates });
    }
    sendToPlayer(actor.id, { type: "COLLECT_RESULT", mode: "visible", tiles: got.tiles, gold: got.gold, strategic: got.strategic });
    sendPlayerUpdate(actor, got.gold);
    return true;
  }

  if (msg.type === "CHOOSE_TECH") {
    const outcome = startTechResearch(actor, msg.techId);
    if (!outcome.ok) {
      socket.send(JSON.stringify({ type: "ERROR", code: "TECH_INVALID", message: outcome.reason }));
      return true;
    }
    sendTechUpdate(actor, "started");
    broadcastBulk({ type: "PLAYER_STYLE", playerId: actor.id, ...playerStylePayload(actor) });
    sendPlayerUpdate(actor, 0);
    return true;
  }

  if (msg.type === "CHOOSE_DOMAIN") {
    const outcome = applyDomain(actor, msg.domainId);
    if (!outcome.ok) {
      socket.send(JSON.stringify({ type: "ERROR", code: "DOMAIN_INVALID", message: outcome.reason }));
      return true;
    }
    recomputeClusterBonusForPlayer(actor);
    socket.send(
      JSON.stringify({
        type: "DOMAIN_UPDATE",
        domainIds: [...actor.domainIds],
        mods: actor.mods,
        incomePerMinute: currentIncomePerMinute(actor),
        domainChoices: reachableDomains(actor),
        domainCatalog: activeDomainCatalog(actor),
        missions: missionPayload(actor),
        revealCapacity: revealCapacityForPlayer(actor),
        activeRevealTargets: [...getOrInitRevealTargets(actor.id)]
      })
    );
    broadcastBulk({ type: "PLAYER_STYLE", playerId: actor.id, ...playerStylePayload(actor) });
    sendPlayerUpdate(actor, 0);
    return true;
  }

  if (
    msg.type === "ATTACK" ||
    msg.type === "EXPAND"
  ) {
    const result = tryQueueBasicFrontierAction(actor, msg.type, msg.fromX, msg.fromY, msg.toX, msg.toY);
    if (!result.ok) {
      if (actor.isAi) {
        recordAiActionFailure(
          actor,
          msg.type === "EXPAND" ? "claim_neutral_border_tile" : "attack_enemy_border_tile",
          result.code,
          result.message,
          { x: msg.toX, y: msg.toY }
        );
      }
      sendHighPrioritySocketMessage(
        socket,
        JSON.stringify({
          type: "ERROR",
          code: result.code,
          message: result.message,
          ...(result.cooldownRemainingMs !== undefined ? { cooldownRemainingMs: result.cooldownRemainingMs } : {})
        })
      );
    } else {
      aiLastActionFailureByPlayer.delete(actor.id);
      if (queuedExecution && actor.isAi) {
        latchQueuedAiIntent(
          actor,
          msg.type === "EXPAND" ? "claim_neutral_border_tile" : "attack_enemy_border_tile",
          "frontier",
          result.resolvesAt,
          key(result.target.x, result.target.y),
          key(result.origin.x, result.origin.y)
        );
      }
      sendHighPrioritySocketMessage(
        socket,
        JSON.stringify({
          type: "ACTION_ACCEPTED",
          actionType: msg.type,
          origin: result.origin,
          target: result.target,
          resolvesAt: result.resolvesAt
        })
      );
      sendHighPrioritySocketMessage(
        socket,
        JSON.stringify({
          type: "COMBAT_START",
          origin: result.origin,
          target: result.target,
          resolvesAt: result.resolvesAt,
          ...(result.predictedResult ? { predictedResult: result.predictedResult } : {})
        })
      );
      if (result.attackAlert) {
        sendToPlayer(result.attackAlert.defenderId, {
          type: "ATTACK_ALERT",
          attackerId: result.attackAlert.attackerId,
          attackerName: result.attackAlert.attackerName,
          x: result.attackAlert.x,
          y: result.attackAlert.y,
          fromX: result.attackAlert.fromX,
          fromY: result.attackAlert.fromY,
          resolvesAt: result.attackAlert.resolvesAt
        });
      }
    }
    return true;
  }

  return false;
};

const buildAiTurnAnalysis = (
  actor: Player,
  competitionMetrics: PlayerCompetitionMetrics[],
  incomeByPlayerId: Map<string, number>
): AiTurnAnalysis => {
  const territorySummary = collectAiTerritorySummary(actor);
  const territoryStructure = cachedAiTerritoryStructureForPlayer(actor);
  const aiIncome = incomeByPlayerId.get(actor.id) ?? competitionMetrics.find((metric) => metric.playerId === actor.id)?.incomePerMinute ?? currentIncomePerMinute(actor);
  const runnerUpIncome = competitionMetrics.reduce((best, metric) => {
    if (metric.playerId === actor.id) return best;
    return Math.max(best, metric.incomePerMinute);
  }, 0);
  const controlledTowns = territoryStructure.controlledTowns;
  const settledTiles = territorySummary.settledTileCount;
  const frontierTiles = territorySummary.frontierTileCount;
  const worldFlags = territoryStructure.worldFlags;
  const underThreat = territorySummary.underThreat && settledTiles > 2;
  const foodCoverage = currentFoodCoverageForPlayer(actor.id);
  const foodCoverageLow = controlledTowns > 0 && foodCoverage < 1;
  const economyWeak =
    aiIncome < (controlledTowns === 0 ? 12 : 18) ||
    (settledTiles >= 10 && aiIncome < 15) ||
    (!worldFlags.has("active_town") && !worldFlags.has("active_dock") && settledTiles >= 6) ||
    foodCoverageLow;
  const frontierDebt = frontierTiles >= Math.max(2, settledTiles);
  const threatCritical = underThreat && (controlledTowns > 0 || aiIncome >= 5 || frontierDebt);
  return {
    territorySummary,
    aiIncome,
    runnerUpIncome,
    controlledTowns,
    settledTiles,
    frontierTiles,
    worldFlags,
    underThreat,
    foodCoverage,
    foodCoverageLow,
    economyWeak,
    frontierDebt,
    threatCritical
  };
};

const cachedAiTurnAnalysisForPlayer = (
  actor: Player,
  competitionContext: AiCompetitionContext
): AiTurnAnalysis => {
  const cached = competitionContext.analysisByPlayerId.get(actor.id);
  if (cached) return cached;
  const analysis = buildAiTurnAnalysis(actor, competitionContext.competitionMetrics, competitionContext.incomeByPlayerId);
  competitionContext.analysisByPlayerId.set(actor.id, analysis);
  return analysis;
};

const aiIndexStore = createAiIndexStore<
  AiTerritoryStructureCache,
  AiPlanningStaticCache,
  AiSettlementSelectorCache,
  AiStrategicState
>();
const cachedAiTerritoryStructureByPlayer = aiIndexStore.territoryStructureByPlayer;
const cachedAiPlanningStaticByPlayer = aiIndexStore.planningStaticByPlayer;
const cachedAiSettlementSelectorByPlayer = aiIndexStore.settlementSelectorByPlayer;
const aiStrategicStateByPlayer = aiIndexStore.strategicStateByPlayer;
const aiTerritoryVersionForPlayer = aiIndexStore.territoryVersionForPlayer;
const markAiTerritoryDirtyForPlayers = aiIndexStore.markTerritoryDirtyForPlayers;
const {
  aiEconomyPriorityState,
  aiFoodPressureSignal,
  cachedAiIslandProgress,
  aiIslandFootprintSignal,
  bestAiIslandFocusTargetId,
  aiDockStrategicSignal,
  aiFrontierActionCandidates,
  aiEconomicFrontierSignal,
  aiEnemyPressureSignal,
  isOwnedTownSupportRingTile,
  cachedSupportedTownKeysForTile,
  pressureAttackThreatensCore,
  fortTileProtectsCore,
  fortTileIsDockChokePoint
} = createServerAiFrontierSignalsRuntime({
  BARBARIAN_OWNER_ID,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  ownership,
  ownershipStateByTile,
  townsByTile,
  docksByTile,
  currentIncomePerMinute,
  currentFoodCoverageForPlayer,
  ownedTownKeysForPlayer,
  playerWorldFlags: (actor) => playerWorldFlags(actor),
  countControlledTowns: (playerId) => countControlledTowns(playerId),
  islandMap: () => islandMap(),
  dockLinkedTileKeys: (dock) => dockLinkedTileKeys(dock),
  visibilitySnapshotForPlayer,
  visibleInSnapshot,
  supportedTownKeysForTile: (tileKey, actorId) => supportedTownKeysForTile(tileKey, actorId),
  aiTileLiteAt,
  terrainAt,
  landBiomeAt: (x, y) => landBiomeAt(x, y),
  grassShadeAt: (x, y) => grassShadeAt(x, y),
  isNearMountain,
  adjacentNeighborCores: (x, y) => adjacentNeighborCores(x, y),
  wrapX,
  wrapY,
  key,
  parseKey,
  baseTileValue
});
const {
  preferAiFrontierCandidate,
  buildAiTerritoryStructureCache,
  cachedAiTerritoryStructureForPlayer,
  collectAiTerritorySummary
} = createServerAiFrontierTerritoryRuntime({
  BARBARIAN_OWNER_ID,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  townsByTile,
  docksByTile,
  ownershipStateByTile,
  cachedAiTerritoryStructureByPlayer,
  visibilitySnapshotForPlayer,
  aiFoodPressureSignal,
  aiFrontierActionCandidates,
  aiTileLiteAt,
  aiTerritoryVersionForPlayer,
  playerWorldFlags: (actor) => playerWorldFlags(actor),
  countControlledTowns: (playerId) => countControlledTowns(playerId),
  adjacentNeighborCores: (x, y) => adjacentNeighborCores(x, y),
  parseKey,
  key
});
const {
  countAiScoutRevealTiles,
  cachedScoutAdjacencyMetrics,
  scoreAiScoutRevealValue,
  bestAiOpeningScoutExpand,
  scoreAiScoutExpandCandidate,
  bestAiScoutExpand
} = createServerAiFrontierScoutRuntime({
  AI_FRONTIER_SELECTOR_BUDGET_MS,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  now,
  key,
  tileIndex: (x, y) => tileIndex(x, y),
  visibleInSnapshot,
  adjacentNeighborCores: (x, y) => adjacentNeighborCores(x, y),
  terrainAt,
  townsByTile,
  docksByTile,
  clusterByTile,
  clustersById,
  clusterResourceType: (cluster) => clusterResourceType(cluster),
  landBiomeAt: (x, y) => landBiomeAt(x, y),
  grassShadeAt: (x, y) => grassShadeAt(x, y),
  isNearMountain,
  aiEconomyPriorityState,
  collectAiTerritorySummary,
  appLogWarn: (payload, message) => runtimeState.appRef?.log.warn(payload, message),
  baseTileValue
});
const {
  evaluateAiSettlementCandidate,
  isAiVisibleEconomicFrontierTile,
  classifyAiNeutralFrontierOpportunity,
  bestAiScaffoldExpand,
  bestAiEconomicExpand,
  bestAiIslandExpand
} = createServerAiFrontierSettlementRuntime({
  WORLD_WIDTH,
  WORLD_HEIGHT,
  ownership,
  ownershipStateByTile,
  townsByTile,
  docksByTile,
  countAiScoutRevealTiles,
  scoreAiScoutExpandCandidate,
  aiEconomicFrontierSignal,
  aiFoodPressureSignal,
  aiDockStrategicSignal,
  aiIslandFootprintSignal,
  bestAiIslandFocusTargetId,
  aiEconomyPriorityState,
  cachedSupportedTownKeysForTile,
  collectAiTerritorySummary,
  townSupport,
  adjacentNeighborCores: (x, y) => adjacentNeighborCores(x, y),
  terrainAt,
  wrapX,
  wrapY,
  islandMap: () => islandMap(),
  key,
  baseTileValue
});
const { estimateAiPressureAttackProfile, bestAiEnemyPressureAttack } = createServerAiFrontierPressureRuntime({
  BARBARIAN_OWNER_ID,
  townsByTile,
  docksByTile,
  economicStructuresByTile,
  players,
  collectPlayerCompetitionMetrics: () => collectPlayerCompetitionMetrics(),
  uniqueLeader: (values) => uniqueLeader(values),
  leadingPair: (values) => leadingPair(values),
  activeAttackBuffMult,
  outpostAttackMultAt,
  attackMultiplierForTarget,
  playerDefensiveness,
  fortDefenseMultAt,
  settledDefenseMultiplierForTarget,
  ownershipDefenseMultiplierForTarget,
  adjacentNeighborCores: (x, y) => adjacentNeighborCores(x, y),
  visibleInSnapshot,
  pressureAttackThreatensCore,
  baseTileValue,
  aiEnemyPressureSignal,
  key
});
function canBuildSiegeOutpostAt(actor: Player, x: number, y: number): { ok: boolean; reason?: string } {
  const effects = getPlayerEffectsForPlayer(actor.id);
  if (!effects.unlockSiegeOutposts) return { ok: false, reason: "unlock siege outposts via Leatherworking first" };
  const t = playerTile(x, y);
  if (t.terrain !== "LAND") return { ok: false, reason: "siege outpost requires land tile" };
  if (t.ownerId !== actor.id) return { ok: false, reason: "siege outpost tile must be owned" };
  const tk = key(t.x, t.y);
  const existingEconomic = economicStructuresByTile.get(tk);
  const upgradingLightOutpost =
    existingEconomic?.ownerId === actor.id &&
    existingEconomic.type === "LIGHT_OUTPOST" &&
    (existingEconomic.status === "active" || existingEconomic.status === "inactive");
  if (isRelocatableSettlementTown(townsByTile.get(tk))) return { ok: false, reason: "settlements cannot host structures until they grow into towns" };
  if (siegeOutpostsByTile.has(tk)) return { ok: false, reason: "tile already has siege outpost" };
  if (fortsByTile.has(tk)) return { ok: false, reason: "tile already has fort" };
  if (observatoriesByTile.has(tk) || (economicStructuresByTile.has(tk) && !upgradingLightOutpost)) return { ok: false, reason: "tile already has structure" };
  if (
    !structureShowsOnTile("SIEGE_OUTPOST", {
      ownershipState: t.ownershipState,
      resource: t.resource,
      dockId: t.dockId,
      townPopulationTier: townsByTile.get(tk) ? townPopulationTierForTown(townsByTile.get(tk)!) : undefined,
      supportedTownCount: supportedTownKeysForTile(tk, actor.id).length,
      supportedDockCount: supportedDockKeysForTile(tk, actor.id).length
    })
  ) {
    return { ok: false, reason: "siege outpost cannot be built on this tile" };
  }
  if (existingEconomic?.type === "LIGHT_OUTPOST" && !upgradingLightOutpost) return { ok: false, reason: "light outpost is still being modified" };
  if (!canStartDevelopmentProcess(actor.id)) return { ok: false, reason: developmentSlotsBusyReason(actor.id) };
  const goldCost = structureBuildGoldCost("SIEGE_OUTPOST", ownedStructureCountForPlayer(actor.id, "SIEGE_OUTPOST"));
  if (actor.points < goldCost) return { ok: false, reason: "insufficient gold for siege outpost" };
  if ((getOrInitStrategicStocks(actor.id).SUPPLY ?? 0) < SIEGE_OUTPOST_BUILD_SUPPLY_COST) {
    return { ok: false, reason: "insufficient SUPPLY for siege outpost" };
  }
  return { ok: true };
}
const {
  aiSettlementSelectorCacheForPlayer,
  cachedAiTileFromKey,
  aiFrontierCandidateFromExecuteCandidate,
  aiTileCandidateFromExecuteCandidate,
  frontierSettlementSummaryForPlayer,
  bestAiSettlementTile,
  bestAiIslandSettlementTile,
  bestAiTownSupportSettlementTile,
  bestAiFortTile,
  bestAiEconomicStructure,
  bestAiSiegeOutpostTile,
  bestAiAnyNeutralExpand
} = createServerAiFrontierSelectionRuntime({
  aiTerritoryVersionForPlayer,
  pendingSettlementCountForPlayer,
  cachedAiSettlementSelectorByPlayer,
  now,
  key,
  parseKey,
  aiTileLiteAt,
  collectAiTerritorySummary,
  islandMap: () => islandMap(),
  aiEconomyPriorityState,
  bestAiIslandFocusTargetId,
  tileHasPendingSettlement,
  evaluateAiSettlementCandidate,
  townsByTile,
  docksByTile,
  fortsByTile,
  economicStructuresByTile,
  adjacentNeighborCores: (x: number, y: number) => adjacentNeighborCores(x, y),
  isBorderTile: (x: number, y: number, ownerId: string) => isBorderTile(x, y, ownerId),
  baseTileValue,
  getOrInitStrategicStocks: (playerId: string) => getOrInitStrategicStocks(playerId),
  getPlayerEffectsForPlayer: (playerId: string) => getPlayerEffectsForPlayer(playerId),
  canPlaceEconomicStructure,
  canBuildSiegeOutpostAt,
  collectPlayerCompetitionMetrics: () => collectPlayerCompetitionMetrics(),
  uniqueLeader: (values) => uniqueLeader(values),
  leadingPair: (values) => leadingPair(values),
  classifyAiNeutralFrontierOpportunity,
  aiEconomicFrontierSignal,
  scoreAiScoutExpandCandidate,
  aiIslandFootprintSignal,
  aiVictoryPathForPlayer: (playerId: string) => aiVictoryPathByPlayer.get(playerId),
  runtimeWarn: (payload, message) => runtimeState.appRef?.log.warn(payload, message)
});
const {
  bestAiFrontierAction,
  frontierPlanningSummaryForPlayer,
  cachedAiPlanningStaticForPlayer
} = createServerAiFrontierPlanningRuntime({
  now,
  aiTerritoryVersionForPlayer,
  cachedAiPlanningStaticByPlayer,
  key,
  visibleInSnapshot,
  collectAiTerritorySummary,
  evaluateAiSettlementCandidate,
  townsByTile,
  docksByTile,
  fortsByTile,
  adjacentNeighborCores: (x: number, y: number) => adjacentNeighborCores(x, y),
  baseTileValue,
  countAiScoutRevealTiles,
  scoreAiScoutRevealValue,
  cachedScoutAdjacencyMetrics,
  isAiVisibleEconomicFrontierTile,
  aiEconomicFrontierSignal,
  cachedSupportedTownKeysForTile,
  islandMap: () => islandMap(),
  aiIslandFootprintSignal,
  bestAiIslandFocusTargetId,
  aiEconomyPriorityState,
  cachedAiIslandProgress,
  getPlayerEffectsForPlayer: (playerId: string) => getPlayerEffectsForPlayer(playerId),
  getOrInitStrategicStocks: (playerId: string) => getOrInitStrategicStocks(playerId),
  canBuildSiegeOutpostAt,
  isOwnedTownSupportRingTile,
  estimateAiPressureAttackProfile,
  tileHasPendingSettlement,
  runtimeWarn: (payload, message) => runtimeState.appRef?.log.warn(payload, message)
});
const {
  aiVictoryPathPopulationCounts,
  isAiVictoryPathContender,
  ensureAiVictoryPath
} = createServerAiVictoryPathRuntime({
  aiVictoryPathByPlayer,
  aiVictoryPathUpdatedAtByPlayer,
  now,
  canAffordGoldCost,
  frontierActionGoldCost: FRONTIER_ACTION_GOLD_COST,
  settleCost: SETTLE_COST
});

const AI_STRATEGIC_STATE_TTL_MS = 30_000;

const dominantAiEnemyFrontPlayerId = (actor: Player, territorySummary: Pick<AiTerritorySummary, "attackCandidates">): string | undefined => {
  const scores = new Map<string, number>();
  for (const { to } of territorySummary.attackCandidates) {
    if (!to.ownerId || to.ownerId === actor.id || to.ownerId === BARBARIAN_OWNER_ID || actor.allies.has(to.ownerId)) continue;
    scores.set(to.ownerId, (scores.get(to.ownerId) ?? 0) + (to.ownershipState === "FRONTIER" ? 3 : 1));
  }
  let bestPlayerId: string | undefined;
  let bestScore = 0;
  for (const [playerId, score] of scores) {
    if (score > bestScore) {
      bestPlayerId = playerId;
      bestScore = score;
    }
  }
  return bestPlayerId;
};

const chooseAiStrategicState = (
  actor: Player,
  primaryVictoryPath: AiSeasonVictoryPathId | undefined,
  analysis: AiTurnAnalysis,
  planningStatic: AiPlanningStaticCache
): AiStrategicState => {
  const cached = aiStrategicStateByPlayer.get(actor.id);
  if (cached && now() - cached.updatedAt <= AI_STRATEGIC_STATE_TTL_MS) return cached;

  const targetPlayerId = dominantAiEnemyFrontPlayerId(actor, analysis.territorySummary);
  const canPivotToGrowth =
    planningStatic.islandExpandAvailable ||
    planningStatic.islandSettlementAvailable ||
    planningStatic.economicExpandAvailable ||
    planningStatic.settlementAvailable ||
    planningStatic.economicBuildAvailable;
  const growthFoundationEstablished = hasAiGrowthFoundation({
    controlledTowns: analysis.controlledTowns,
    hasActiveTown: analysis.worldFlags.has("active_town"),
    hasActiveDock: analysis.worldFlags.has("active_dock"),
    aiIncome: analysis.aiIncome
  });
  const shardOpportunity = !analysis.underThreat && !analysis.foodCoverageLow && !analysis.economyWeak && Boolean(bestAiCollectShardTile(actor));
  const opportunisticBreakPressure =
    planningStatic.pressureAttackScore >= (primaryVictoryPath === "TOWN_CONTROL" ? 120 : 180) &&
    canPivotToGrowth &&
    !analysis.foodCoverageLow &&
    analysis.aiIncome >= 10;

  let frontPosture: AiFrontPosture = "BREAK";
  if (!planningStatic.pressureThreatensCore && planningStatic.pressureAttackScore > 0 && canPivotToGrowth) {
    frontPosture =
      analysis.underThreat && (analysis.foodCoverageLow || analysis.economyWeak) && primaryVictoryPath !== "TOWN_CONTROL" && !opportunisticBreakPressure
        ? "TRUCE"
        : "CONTAIN";
  }
  if (
    planningStatic.pressureThreatensCore ||
    (primaryVictoryPath === "TOWN_CONTROL" && planningStatic.pressureAttackScore >= 160) ||
    opportunisticBreakPressure
  ) {
    frontPosture = "BREAK";
  }

  let focus: AiStrategicFocus = "BALANCED";
  if (shardOpportunity && primaryVictoryPath === "ECONOMIC_HEGEMONY") {
    focus = "SHARD_RUSH";
  } else if (
    shouldAiStayInIslandFootprint({
      ...(primaryVictoryPath ? { primaryVictoryPath } : {}),
      growthFoundationEstablished,
      undercoveredIslandCount: planningStatic.undercoveredIslandCount,
      islandExpandAvailable: planningStatic.islandExpandAvailable,
      islandSettlementAvailable: planningStatic.islandSettlementAvailable,
      foodCoverageLow: analysis.foodCoverageLow,
      foodCoverage: analysis.foodCoverage,
      pressureThreatensCore: planningStatic.pressureThreatensCore,
      frontierOpportunityEconomic: planningStatic.frontierOpportunityEconomic,
      frontierOpportunityScaffold: planningStatic.frontierOpportunityScaffold,
      frontierOpportunityWaste: planningStatic.frontierOpportunityWaste,
      economyWeak: analysis.economyWeak,
      controlledTowns: analysis.controlledTowns,
      settledTiles: analysis.settledTiles,
      aiIncome: analysis.aiIncome
    })
  ) {
    focus = "ISLAND_FOOTPRINT";
  } else if (
    frontPosture === "BREAK" &&
    planningStatic.pressureAttackScore >= (primaryVictoryPath === "TOWN_CONTROL" ? 100 : 180) &&
    (primaryVictoryPath === "TOWN_CONTROL" || primaryVictoryPath === "ECONOMIC_HEGEMONY") &&
    !analysis.foodCoverageLow
  ) {
    focus = "MILITARY_PRESSURE";
  } else if (analysis.foodCoverageLow || analysis.economyWeak) {
    focus = "ECONOMIC_RECOVERY";
  } else if (frontPosture === "CONTAIN" || frontPosture === "TRUCE") {
    focus = "BORDER_CONTAINMENT";
  } else if (primaryVictoryPath === "TOWN_CONTROL" && planningStatic.pressureAttackScore > 0) {
    focus = "MILITARY_PRESSURE";
  }

  const nextState: AiStrategicState = {
    focus,
    frontPosture,
    weakestIslandRatio: planningStatic.weakestIslandRatio,
    undercoveredIslandCount: planningStatic.undercoveredIslandCount,
    updatedAt: now(),
    ...(targetPlayerId ? { targetPlayerId } : {})
  };
  aiStrategicStateByPlayer.set(actor.id, nextState);
  return nextState;
};

const buildAiPlanningSnapshot = (
  actor: Player,
  primaryVictoryPath: AiSeasonVictoryPathId | undefined,
  analysis: AiTurnAnalysis,
  townsTarget: number,
  settledTilesTarget: number
): AiPlanningSnapshot => {
  const territorySummary = analysis.territorySummary;
  const planningStatic = cachedAiPlanningStaticForPlayer(actor, territorySummary);
  const playerEffects = getPlayerEffectsForPlayer(actor.id);
  const strategicStocks = getOrInitStrategicStocks(actor.id);
  const strategicState = chooseAiStrategicState(actor, primaryVictoryPath, analysis, planningStatic);
  const developmentAvailable = canStartDevelopmentProcess(actor.id);
  const growthFoundationEstablished = hasAiGrowthFoundation({
    controlledTowns: analysis.controlledTowns,
    hasActiveTown: analysis.worldFlags.has("active_town"),
    hasActiveDock: analysis.worldFlags.has("active_dock"),
    aiIncome: analysis.aiIncome
  });
  const scoutExpandWorthwhile = isAiScoutExpansionWorthwhile({
    settledTiles: analysis.settledTiles,
    underThreat: analysis.underThreat,
    economyWeak: analysis.economyWeak,
    settlementAvailable: planningStatic.settlementAvailable,
    frontierOpportunityEconomic: planningStatic.frontierOpportunityEconomic,
    frontierOpportunityScout: planningStatic.frontierOpportunityScout,
    frontierOpportunityWaste: planningStatic.frontierOpportunityWaste,
    hasGrowthFoundation: growthFoundationEstablished
  });
  const attackReady = isAiAttackReady({
    manpower: actor.manpower,
    attackManpowerMin: manpowerMinForAction("ATTACK"),
    underThreat: analysis.underThreat,
    threatCritical: analysis.threatCritical,
    economyWeak: analysis.economyWeak,
    controlledTowns: analysis.controlledTowns
  });

  return {
    primaryVictoryPath,
    strategicFocus: strategicState.focus,
    frontPosture: strategicState.frontPosture,
    aiIncome: analysis.aiIncome,
    runnerUpIncome: analysis.runnerUpIncome,
    controlledTowns: analysis.controlledTowns,
    townsTarget,
    settledTiles: analysis.settledTiles,
    settledTilesTarget,
    frontierTiles: analysis.frontierTiles,
    underThreat: analysis.underThreat,
    threatCritical: analysis.threatCritical,
    economyWeak: analysis.economyWeak,
    frontierDebt: analysis.frontierDebt,
    foodCoverage: analysis.foodCoverage,
    foodCoverageLow: analysis.foodCoverageLow,
    hasActiveTown: analysis.worldFlags.has("active_town"),
    hasActiveDock: analysis.worldFlags.has("active_dock"),
    points: actor.points,
    stamina: actor.stamina,
    openingScoutAvailable: planningStatic.openingScoutAvailable,
    economicExpandAvailable: planningStatic.economicExpandAvailable,
    neutralExpandAvailable: planningStatic.neutralExpandAvailable,
    scoutExpandAvailable: planningStatic.scoutExpandAvailable,
    scaffoldExpandAvailable: planningStatic.scaffoldExpandAvailable,
    barbarianAttackAvailable: planningStatic.barbarianAttackAvailable,
    enemyAttackAvailable: planningStatic.enemyAttackAvailable,
    pressureAttackAvailable: planningStatic.pressureAttackScore > 0,
    attackReady,
    pressureAttackScore: planningStatic.pressureAttackScore,
    pressureThreatensCore: planningStatic.pressureThreatensCore,
    settlementAvailable: planningStatic.settlementAvailable,
    townSupportSettlementAvailable: planningStatic.townSupportSettlementAvailable,
    islandExpandAvailable: planningStatic.islandExpandAvailable,
    islandSettlementAvailable: planningStatic.islandSettlementAvailable,
    undercoveredIslandCount: planningStatic.undercoveredIslandCount,
    weakestIslandRatio: planningStatic.weakestIslandRatio,
    fortAvailable: planningStatic.fortAvailable,
    fortProtectsCore: planningStatic.fortProtectsCore,
    fortIsDockChokePoint: planningStatic.fortIsDockChokePoint,
    economicBuildAvailable: planningStatic.economicBuildAvailable,
    siegeOutpostAvailable: planningStatic.siegeOutpostAvailable,
    frontierOpportunityEconomic: planningStatic.frontierOpportunityEconomic,
    frontierOpportunityScout: planningStatic.frontierOpportunityScout,
    frontierOpportunityScaffold: planningStatic.frontierOpportunityScaffold,
    frontierOpportunityWaste: planningStatic.frontierOpportunityWaste,
    scoutExpandWorthwhile,
    canAffordFrontierAction: canAffordGoldCost(actor.points, FRONTIER_ACTION_GOLD_COST),
    canAffordSettlement: developmentAvailable && canAffordGoldCost(actor.points, SETTLE_COST),
    canBuildFort:
      planningStatic.fortAvailable &&
      playerEffects.unlockForts &&
      actor.points >= structureBuildGoldCost("FORT", ownedStructureCountForPlayer(actor.id, "FORT")) &&
      (strategicStocks.IRON ?? 0) >= FORT_BUILD_IRON_COST,
    canBuildEconomy: developmentAvailable && planningStatic.economicBuildAvailable,
    canBuildSiegeOutpost:
      developmentAvailable &&
      planningStatic.siegeOutpostAvailable &&
      getPlayerEffectsForPlayer(actor.id).unlockSiegeOutposts &&
      actor.points >= structureBuildGoldCost("SIEGE_OUTPOST", ownedStructureCountForPlayer(actor.id, "SIEGE_OUTPOST")) &&
      (strategicStocks.SUPPLY ?? 0) >= SIEGE_OUTPOST_BUILD_SUPPLY_COST,
    goldHealthy: canAffordGoldCost(actor.points, SETTLE_COST + FRONTIER_ACTION_GOLD_COST),
    victoryPathContender: primaryVictoryPath ? isAiVictoryPathContender(primaryVictoryPath, analysis, townsTarget, settledTilesTarget) : false
  };
};

const executeSystemSimulationCommand = async (command: SystemSimulationCommand): Promise<void> => {
  if (humanFrontierActionPriorityActive()) {
    if (command.type === "BARBARIAN_MAINTENANCE") return;
    setTimeout(() => {
      enqueueSystemSimulationCommand(command);
    }, AI_WORKER_DRAIN_RETRY_MS);
    return;
  }
  if (command.type === "BARBARIAN_MAINTENANCE") {
    maintainBarbarianPopulation();
    return;
  }
  if (command.type === "BARBARIAN_COMBAT_RESOLVE") {
    await resolveQueuedBarbarianCombat(command);
    return;
  }
  const live = barbarianAgents.get(command.agentId);
  if (!live) return;
  runBarbarianAction(live);
};

const simulationService = createSimulationService<Player, Ws>({
  now,
  drainBudgetMs: SIM_DRAIN_BUDGET_MS,
  drainMaxCommands: SIM_DRAIN_MAX_COMMANDS,
  drainHumanQuota: SIM_DRAIN_HUMAN_QUOTA,
  drainSystemQuota: SIM_DRAIN_SYSTEM_QUOTA,
  drainAiQuota: SIM_DRAIN_AI_QUOTA,
  queueTask: (fn) => {
    setTimeout(fn, 0);
  },
  executeGatewayMessage: executeUnifiedGameplayMessage,
  executeSystemCommand: executeSystemSimulationCommand,
  onError: logRuntimeError,
  noopSocket: NOOP_WS
});

const simulationCommandWorkerState = simulationService.state;
const simulationCommandQueueDepth = simulationService.queueDepth;
const hasQueuedSystemSimulationCommand = simulationService.hasQueuedSystemCommand;
const isQueuedSimulationMessage = simulationService.isQueuedSimulationMessage;

const executeSimulationCommand = (actor: Player, command: SimulationCommand): void => {
  simulationService.enqueueAiCommand(actor, command);
};

const enqueueSystemSimulationCommand = (command: SystemSimulationCommand): void => {
  simulationService.enqueueSystemCommand(command);
};

const aiLatchedIntentTargetStillValid = (actor: Player, intent: AiLatchedIntent): boolean => {
  if (!intent.targetTileKey) return true;
  const [targetX, targetY] = parseKey(intent.targetTileKey);
  const target = aiTileLiteAt(targetX, targetY);
  if (target.terrain !== "LAND") return false;
  if (intent.actionKey === "claim_neutral_border_tile" || intent.actionKey === "claim_food_border_tile" || intent.actionKey === "claim_scout_border_tile" || intent.actionKey === "claim_scaffold_border_tile" || intent.actionKey === "opening_scout_expand") {
    return !target.ownerId;
  }
  if (intent.actionKey === "attack_barbarian_border_tile") {
    return target.ownerId === BARBARIAN_OWNER_ID;
  }
  if (intent.actionKey === "attack_enemy_border_tile") {
    return Boolean(target.ownerId && target.ownerId !== actor.id && target.ownerId !== BARBARIAN_OWNER_ID && !actor.allies.has(target.ownerId));
  }
  if (intent.actionKey === "settle_owned_frontier_tile") {
    return target.ownerId === actor.id && target.ownershipState === "FRONTIER";
  }
  if (intent.actionKey === "build_fort_on_exposed_tile") {
    return target.ownerId === actor.id && !fortsByTile.has(intent.targetTileKey);
  }
  if (intent.actionKey === "build_economic_structure") {
    return target.ownerId === actor.id && !economicStructuresByTile.has(intent.targetTileKey);
  }
  return true;
};

const latchQueuedAiIntent = (
  actor: Player,
  actionKey: string,
  kind: AiLatchedIntentKind,
  wakeAt: number,
  targetTileKey?: TileKey,
  originTileKey?: TileKey
): void => {
  const startedAt = now();
  latchAiIntent(aiIntentLatchState, {
    playerId: actor.id,
    actionKey,
    kind,
    startedAt,
    wakeAt,
    territoryVersion: aiTerritoryVersionForPlayer(actor.id),
    ...(targetTileKey ? { targetTileKey } : {}),
    ...(originTileKey ? { originTileKey } : {})
  });
  if (targetTileKey) {
    reserveAiTarget(
      aiIntentLatchState,
      {
        playerId: actor.id,
        actionKey,
        tileKey: targetTileKey,
        createdAt: startedAt,
        wakeAt
      },
      startedAt
    );
  }
};

const queueAiActionWithIntentLatch = (
  actor: Player,
  command: SimulationCommand,
  {
    actionKey,
    kind,
    expectedDurationMs,
    targetTileKey,
    originTileKey
  }: {
    actionKey: string;
    kind: AiLatchedIntentKind;
    expectedDurationMs: number;
    targetTileKey?: TileKey;
    originTileKey?: TileKey;
  }
): boolean => {
  const nowMs = now();
  const provisionalWakeAt = nowMs + Math.max(250, Math.min(AI_INTENT_LATCH_PROVISIONAL_MS, expectedDurationMs));
  if (
    targetTileKey &&
    !reserveAiTarget(
      aiIntentLatchState,
      {
        playerId: actor.id,
        actionKey,
        tileKey: targetTileKey,
        createdAt: nowMs,
        wakeAt: provisionalWakeAt
      },
      nowMs
    )
  ) {
    return false;
  }
  latchQueuedAiIntent(actor, actionKey, kind, provisionalWakeAt, targetTileKey, originTileKey);
  executeSimulationCommand(actor, command);
  return true;
};

const executeAiGoapAction = (
  actor: Player,
  actionKey: string,
  victoryPath?: AiSeasonVictoryPathId,
  territorySummary?: AiTerritorySummary,
  candidates?: {
    islandExpand?: ReturnType<typeof bestAiIslandExpand>;
    neutralExpand?: ReturnType<typeof bestAiEconomicExpand>;
    anyNeutralExpand?: ReturnType<typeof bestAiAnyNeutralExpand>;
    scoutExpand?: ReturnType<typeof bestAiScoutExpand>;
    scaffoldExpand?: ReturnType<typeof bestAiScaffoldExpand>;
    barbarianAttack?: ReturnType<typeof bestAiFrontierAction>;
    enemyAttack?: ReturnType<typeof bestAiFrontierAction>;
    townSupportSettlementTile?: ReturnType<typeof bestAiTownSupportSettlementTile>;
    islandSettlementTile?: ReturnType<typeof bestAiIslandSettlementTile>;
    settlementTile?: ReturnType<typeof bestAiSettlementTile>;
    fortAnchor?: ReturnType<typeof bestAiFortTile>;
    economicBuild?: ReturnType<typeof bestAiEconomicStructure>;
    pressureAttack?: ReturnType<typeof bestAiEnemyPressureAttack>;
  }
): boolean => {
  const territoryVersion = aiTerritoryVersionForPlayer(actor.id);
  let frontierPlanningSummary: AiFrontierPlanningSummary | undefined;
  const cachedFrontierPlanningSummary = (): AiFrontierPlanningSummary => {
    if (frontierPlanningSummary) return frontierPlanningSummary;
    frontierPlanningSummary = frontierPlanningSummaryForPlayer(actor, territorySummary ?? collectAiTerritorySummary(actor));
    return frontierPlanningSummary;
  };
  const cachedExecuteCandidate = (build: () => AiExecuteCandidate | null): AiExecuteCandidate | null =>
    cachedAiExecuteCandidate(aiExecuteCandidateCacheState, {
      playerId: actor.id,
      version: territoryVersion,
      actionKey,
      ...(victoryPath ? { victoryPath } : {}),
      build
    });
  const cachedNeutralExpandCandidate = (): { from: Tile; to: Tile } | undefined =>
    aiFrontierCandidateFromExecuteCandidate(
      cachedExecuteCandidate(() => {
        const resolved =
          (victoryPath === "SETTLED_TERRITORY"
            ? candidates?.islandExpand ?? cachedFrontierPlanningSummary().bestIslandExpand
            : undefined) ??
          candidates?.neutralExpand ??
          cachedFrontierPlanningSummary().bestEconomicExpand ??
          candidates?.anyNeutralExpand ??
          cachedFrontierPlanningSummary().bestAnyNeutralExpand;
        return resolved
          ? {
              kind: "frontier",
              originTileKey: key(resolved.from.x, resolved.from.y),
              targetTileKey: key(resolved.to.x, resolved.to.y)
            }
          : null;
      })
    ) ??
    ((victoryPath === "SETTLED_TERRITORY"
      ? candidates?.islandExpand ?? cachedFrontierPlanningSummary().bestIslandExpand
      : undefined) ??
      candidates?.neutralExpand ??
      cachedFrontierPlanningSummary().bestEconomicExpand ??
      candidates?.anyNeutralExpand ??
      cachedFrontierPlanningSummary().bestAnyNeutralExpand);

  if (actionKey === "wait_and_recover") return true;
  if (actionKey === "claim_neutral_border_tile") {
    const candidate = cachedNeutralExpandCandidate();
    if (!candidate) return false;
    return queueAiActionWithIntentLatch(actor, { type: "EXPAND", fromX: candidate.from.x, fromY: candidate.from.y, toX: candidate.to.x, toY: candidate.to.y }, {
      actionKey,
      kind: "frontier",
      expectedDurationMs: frontierClaimDurationMsAt(candidate.to.x, candidate.to.y),
      targetTileKey: key(candidate.to.x, candidate.to.y),
      originTileKey: key(candidate.from.x, candidate.from.y)
    });
  }
  if (actionKey === "claim_food_border_tile") {
    const candidate = cachedNeutralExpandCandidate();
    if (!candidate) return false;
    return queueAiActionWithIntentLatch(actor, { type: "EXPAND", fromX: candidate.from.x, fromY: candidate.from.y, toX: candidate.to.x, toY: candidate.to.y }, {
      actionKey,
      kind: "frontier",
      expectedDurationMs: frontierClaimDurationMsAt(candidate.to.x, candidate.to.y),
      targetTileKey: key(candidate.to.x, candidate.to.y),
      originTileKey: key(candidate.from.x, candidate.from.y)
    });
  }
  if (actionKey === "claim_scout_border_tile") {
    const candidate =
      aiFrontierCandidateFromExecuteCandidate(
        cachedExecuteCandidate(() => {
          const resolved = candidates?.scoutExpand ?? bestAiScoutExpand(actor, territorySummary);
          return resolved
            ? {
                kind: "frontier",
                originTileKey: key(resolved.from.x, resolved.from.y),
                targetTileKey: key(resolved.to.x, resolved.to.y)
              }
            : null;
        })
      ) ??
      candidates?.scoutExpand;
    if (!candidate) return false;
    return queueAiActionWithIntentLatch(actor, { type: "EXPAND", fromX: candidate.from.x, fromY: candidate.from.y, toX: candidate.to.x, toY: candidate.to.y }, {
      actionKey,
      kind: "frontier",
      expectedDurationMs: frontierClaimDurationMsAt(candidate.to.x, candidate.to.y),
      targetTileKey: key(candidate.to.x, candidate.to.y),
      originTileKey: key(candidate.from.x, candidate.from.y)
    });
  }
  if (actionKey === "claim_scaffold_border_tile") {
    const candidate =
      aiFrontierCandidateFromExecuteCandidate(
        cachedExecuteCandidate(() => {
          const resolved =
            candidates?.scaffoldExpand ??
            bestAiScaffoldExpand(actor, victoryPath, territorySummary) ??
            candidates?.anyNeutralExpand ??
            cachedFrontierPlanningSummary().bestAnyNeutralExpand;
          return resolved
            ? {
                kind: "frontier",
                originTileKey: key(resolved.from.x, resolved.from.y),
                targetTileKey: key(resolved.to.x, resolved.to.y)
              }
            : null;
        })
      ) ??
      candidates?.scaffoldExpand ??
      candidates?.anyNeutralExpand ??
      cachedFrontierPlanningSummary().bestAnyNeutralExpand;
    if (!candidate) return false;
    return queueAiActionWithIntentLatch(actor, { type: "EXPAND", fromX: candidate.from.x, fromY: candidate.from.y, toX: candidate.to.x, toY: candidate.to.y }, {
      actionKey,
      kind: "frontier",
      expectedDurationMs: frontierClaimDurationMsAt(candidate.to.x, candidate.to.y),
      targetTileKey: key(candidate.to.x, candidate.to.y),
      originTileKey: key(candidate.from.x, candidate.from.y)
    });
  }
  if (actionKey === "attack_barbarian_border_tile") {
    if (!candidates?.barbarianAttack && humanFrontierActionPriorityActive()) return false;
    const candidate =
      aiFrontierCandidateFromExecuteCandidate(
        cachedExecuteCandidate(() => {
          const resolved =
            candidates?.barbarianAttack ?? bestAiFrontierAction(actor, "ATTACK", (tile) => tile.ownerId === BARBARIAN_OWNER_ID, victoryPath, territorySummary);
          return resolved
            ? {
                kind: "frontier",
                originTileKey: key(resolved.from.x, resolved.from.y),
                targetTileKey: key(resolved.to.x, resolved.to.y)
              }
            : null;
        })
      ) ??
      candidates?.barbarianAttack;
    if (!candidate) return false;
    return queueAiActionWithIntentLatch(actor, { type: "ATTACK", fromX: candidate.from.x, fromY: candidate.from.y, toX: candidate.to.x, toY: candidate.to.y }, {
      actionKey,
      kind: "frontier",
      expectedDurationMs: COMBAT_LOCK_MS,
      targetTileKey: key(candidate.to.x, candidate.to.y),
      originTileKey: key(candidate.from.x, candidate.from.y)
    });
  }
  if (actionKey === "attack_enemy_border_tile") {
    if (!candidates?.pressureAttack && !candidates?.enemyAttack && humanFrontierActionPriorityActive()) return false;
    const candidate =
      aiFrontierCandidateFromExecuteCandidate(
        cachedExecuteCandidate(() => {
          const resolved =
            candidates?.pressureAttack ??
            candidates?.enemyAttack ??
            bestAiEnemyPressureAttack(actor, victoryPath, territorySummary ?? collectAiTerritorySummary(actor)) ??
            bestAiFrontierAction(
              actor,
              "ATTACK",
              (tile) => Boolean(tile.ownerId && tile.ownerId !== actor.id && tile.ownerId !== BARBARIAN_OWNER_ID && !actor.allies.has(tile.ownerId)),
              victoryPath,
              territorySummary
            );
          return resolved
            ? {
                kind: "frontier",
                originTileKey: key(resolved.from.x, resolved.from.y),
                targetTileKey: key(resolved.to.x, resolved.to.y)
              }
            : null;
        })
      ) ??
      candidates?.pressureAttack ??
      candidates?.enemyAttack;
    if (!candidate) return false;
    return queueAiActionWithIntentLatch(actor, { type: "ATTACK", fromX: candidate.from.x, fromY: candidate.from.y, toX: candidate.to.x, toY: candidate.to.y }, {
      actionKey,
      kind: "frontier",
      expectedDurationMs: COMBAT_LOCK_MS,
      targetTileKey: key(candidate.to.x, candidate.to.y),
      originTileKey: key(candidate.from.x, candidate.from.y)
    });
  }
  if (actionKey === "settle_owned_frontier_tile") {
    const tile =
      aiTileCandidateFromExecuteCandidate(
        cachedExecuteCandidate(() => {
          const resolved =
            candidates?.townSupportSettlementTile ??
            bestAiTownSupportSettlementTile(actor, victoryPath, territorySummary) ??
            (victoryPath === "SETTLED_TERRITORY" ? candidates?.islandSettlementTile ?? bestAiIslandSettlementTile(actor, territorySummary) : undefined) ??
            candidates?.settlementTile ??
            bestAiSettlementTile(actor, victoryPath, territorySummary);
          return resolved ? { kind: "tile", tileKey: key(resolved.x, resolved.y) } : null;
        })
      ) ??
      candidates?.townSupportSettlementTile ??
      (victoryPath === "SETTLED_TERRITORY" ? candidates?.islandSettlementTile : undefined) ??
      candidates?.settlementTile;
    if (!tile) return false;
    return queueAiActionWithIntentLatch(actor, { type: "SETTLE", x: tile.x, y: tile.y }, {
      actionKey,
      kind: "settlement",
      expectedDurationMs: SETTLE_MS,
      targetTileKey: key(tile.x, tile.y)
    });
  }
  if (actionKey === "build_fort_on_exposed_tile") {
    const tile =
      aiTileCandidateFromExecuteCandidate(
        cachedExecuteCandidate(() => {
          const resolved = candidates?.fortAnchor ?? bestAiFortTile(actor, territorySummary);
          return resolved ? { kind: "tile", tileKey: key(resolved.x, resolved.y) } : null;
        })
      ) ??
      candidates?.fortAnchor;
    if (!tile) return false;
    if (!getPlayerEffectsForPlayer(actor.id).unlockForts) return false;
    if ((getOrInitStrategicStocks(actor.id).IRON ?? 0) < FORT_BUILD_IRON_COST) return false;
    if (actor.points < structureBuildGoldCost("FORT", ownedStructureCountForPlayer(actor.id, "FORT"))) return false;
    return queueAiActionWithIntentLatch(actor, { type: "BUILD_FORT", x: tile.x, y: tile.y }, {
      actionKey,
      kind: "structure",
      expectedDurationMs: structureBuildDurationMsForRuntime("FORT"),
      targetTileKey: key(tile.x, tile.y)
    });
  }
  if (actionKey === "build_siege_outpost") {
    const tile =
      aiTileCandidateFromExecuteCandidate(
        cachedExecuteCandidate(() => {
          const resolved = bestAiSiegeOutpostTile(actor, victoryPath, territorySummary);
          return resolved ? { kind: "tile", tileKey: key(resolved.x, resolved.y) } : null;
        })
      ) ?? bestAiSiegeOutpostTile(actor, victoryPath, territorySummary);
    if (!tile) return false;
    if (!canBuildSiegeOutpostAt(actor, tile.x, tile.y).ok) return false;
    return queueAiActionWithIntentLatch(actor, { type: "BUILD_SIEGE_OUTPOST", x: tile.x, y: tile.y }, {
      actionKey,
      kind: "structure",
      expectedDurationMs: structureBuildDurationMsForRuntime("SIEGE_OUTPOST"),
      targetTileKey: key(tile.x, tile.y)
    });
  }
  if (actionKey === "build_economic_structure") {
    const cachedCandidate = cachedExecuteCandidate(() => {
      const resolved = candidates?.economicBuild ?? bestAiEconomicStructure(actor, territorySummary);
      return resolved
        ? {
            kind: "economic_structure",
            tileKey: key(resolved.tile.x, resolved.tile.y),
            structureType: resolved.structureType
          }
        : null;
    });
    const candidate =
      cachedCandidate?.kind === "economic_structure"
        ? (() => {
            const tile = cachedAiTileFromKey(cachedCandidate.tileKey);
            return tile ? { tile, structureType: cachedCandidate.structureType } : undefined;
          })()
        : candidates?.economicBuild;
    if (!candidate) return false;
    return queueAiActionWithIntentLatch(actor, { type: "BUILD_ECONOMIC_STRUCTURE", x: candidate.tile.x, y: candidate.tile.y, structureType: candidate.structureType }, {
      actionKey,
      kind: "structure",
      expectedDurationMs: structureBuildDurationMsForRuntime(candidate.structureType),
      targetTileKey: key(candidate.tile.x, candidate.tile.y)
    });
  }
  return false;
};

const setAiTurnDebug = (
  actor: Player,
  reason: string,
  extras?: Partial<Omit<AiTurnDebugEntry, "at" | "playerId" | "name" | "reason" | "points">>
): void => {
  const normalizedExtras = { ...(extras ?? {}) };
  if (normalizedExtras.primaryVictoryPath === undefined) delete normalizedExtras.primaryVictoryPath;
  if (normalizedExtras.goapGoalId === undefined) delete normalizedExtras.goapGoalId;
  if (normalizedExtras.goapActionKey === undefined) delete normalizedExtras.goapActionKey;
  if (normalizedExtras.executed === undefined) delete normalizedExtras.executed;
  if (normalizedExtras.incomePerMinute === undefined) delete normalizedExtras.incomePerMinute;
  if (normalizedExtras.controlledTowns === undefined) delete normalizedExtras.controlledTowns;
  if (normalizedExtras.settledTiles === undefined) delete normalizedExtras.settledTiles;
  if (normalizedExtras.details === undefined) delete normalizedExtras.details;
  aiTurnDebugByPlayer.set(actor.id, {
    at: now(),
    playerId: actor.id,
    name: actor.name,
    reason,
    points: actor.points,
    ...normalizedExtras
  });
};

const recordAiActionFailure = (
  actor: Player,
  actionKey: string,
  code: string,
  reason: string,
  coords?: { x: number; y: number }
): void => {
  releaseAiLatchedIntent(aiIntentLatchState, actor.id);
  aiLastActionFailureByPlayer.set(actor.id, {
    at: now(),
    actionKey,
    code,
    reason,
    ...(coords ? coords : {})
  });
  if (!actor.isAi) return;
  setAiTurnDebug(actor, `simulation_${actionKey}_failed`, {
    goapActionKey: actionKey,
    executed: false,
    details: {
      failureCode: code,
      failureReason: reason,
      ...(coords ? { failureX: coords.x, failureY: coords.y } : {})
    }
  });
};

const runAiTurn = async (actor: Player, tickContext?: AiTickContext): Promise<void> => {
  const turnStartedAt = now();
  const phaseTimings: Record<string, number> = {};
  const markAiTurnPhase = (phase: string, startedAt: number): void => {
    phaseTimings[phase] = now() - startedAt;
  };
  const yieldToHumanFrontierPriority = (phase: string): boolean => {
    if (!humanFrontierActionPriorityActive()) return false;
    const totalElapsedMs = now() - turnStartedAt;
    recordAiBudgetBreach(actor, totalElapsedMs, phaseTimings, { reason: `yielded_to_human_frontier_priority_${phase}` });
    setAiTurnDebug(actor, "yielded_to_human_frontier_priority", {
      details: {
        phase,
        pendingCaptures: pendingCapturesByAttacker(actor.id).length,
        pendingSettlement: hasPendingSettlementForPlayer(actor.id)
      }
    });
    return true;
  };
  if (!actor.isAi) return;
  actor.lastActiveAt = now();
  if (actor.T <= 0 || actor.territoryTiles.size === 0 || actor.respawnPending) {
    releaseAiLatchedIntent(aiIntentLatchState, actor.id);
    actor.respawnPending = false;
    spawnPlayer(actor);
    setAiTurnDebug(actor, "respawned");
    return;
  }
  const pendingCaptures = pendingCapturesByAttacker(actor.id).length;
  const pendingSettlement = hasPendingSettlementForPlayer(actor.id);
  const latchedIntent = probeAiLatchedIntent(aiIntentLatchState, {
    playerId: actor.id,
    nowMs: now(),
    territoryVersion: aiTerritoryVersionForPlayer(actor.id),
    targetStillValid: (intent) => aiLatchedIntentTargetStillValid(actor, intent)
  });
  if (pendingCaptures > 0) {
    setAiTurnDebug(actor, "waiting_on_pending_capture_resolution", {
      details: {
        pendingCaptures,
        pendingSettlement
      }
    });
    return;
  }
  if (pendingSettlement) {
    setAiTurnDebug(actor, "waiting_on_pending_settlement_resolution", {
      details: {
        pendingCaptures,
        pendingSettlement
      }
    });
    return;
  }
  if (latchedIntent.status === "waiting") {
    setAiTurnDebug(actor, "waiting_on_latched_intent", {
      goapActionKey: latchedIntent.intent.actionKey,
      details: {
        latchedActionKey: latchedIntent.intent.actionKey,
        latchedKind: latchedIntent.intent.kind,
        latchedWakeAt: latchedIntent.intent.wakeAt,
        latchedTargetTileKey: latchedIntent.intent.targetTileKey,
        latchedOriginTileKey: latchedIntent.intent.originTileKey
      }
    });
    return;
  }

  const nowMs = now();
  const nextYieldCollectAt = aiYieldCollectDueAtByPlayer.get(actor.id) ?? 0;
  if (tileYieldByTile.size > 0 && nowMs >= nextYieldCollectAt) {
    aiYieldCollectDueAtByPlayer.set(actor.id, nowMs + AI_YIELD_COLLECTION_INTERVAL_MS);
    const collected = collectVisibleYield(actor);
    if (collected.gold > 0 || hasPositiveStrategicBuffer(collected.strategic)) {
      sendPlayerUpdate(actor, collected.gold);
    }
  }

  const territoryMetrics = tickContext?.competitionMetrics ?? collectPlayerCompetitionMetrics();
  const analysisStartedAt = now();
  const analysis = tickContext
    ? (tickContext.analysisByPlayerId.get(actor.id) ??
      buildAiTurnAnalysis(actor, territoryMetrics, tickContext.incomeByPlayerId))
    : buildAiTurnAnalysis(actor, territoryMetrics, new Map<string, number>());
  markAiTurnPhase("analysis", analysisStartedAt);
  if (yieldToHumanFrontierPriority("analysis")) return;
  const aiIncome = analysis.aiIncome;
  const runnerUpIncome = analysis.runnerUpIncome;
  maybePickAiTech(actor);
  maybePickAiDomain(actor);
  const territorySummary = analysis.territorySummary;
  const townsTarget = tickContext?.townsTarget ?? Math.max(1, Math.ceil(Math.max(1, townsByTile.size) * SEASON_VICTORY_TOWN_CONTROL_SHARE));
  const controlledTowns = analysis.controlledTowns;
  const settledTiles = analysis.settledTiles;
  const frontierTiles = analysis.frontierTiles;
  const settledTilesTarget = tickContext?.settledTilesTarget ?? Math.max(1, Math.ceil(claimableLandTileCount() * SEASON_VICTORY_SETTLED_TERRITORY_SHARE));
  const worldFlags = analysis.worldFlags;
  const underThreat = analysis.underThreat;
  const foodCoverage = analysis.foodCoverage;
  const foodCoverageLow = analysis.foodCoverageLow;
  const economyWeak = analysis.economyWeak;
  const frontierDebt = analysis.frontierDebt;
  const threatCritical = analysis.threatCritical;
  const victoryPathStartedAt = now();
  const primaryVictoryPath = ensureAiVictoryPath(actor, analysis, townsTarget, settledTilesTarget);
  markAiTurnPhase("victoryPath", victoryPathStartedAt);
  const planningSnapshotStartedAt = now();
  const planningSnapshot = buildAiPlanningSnapshot(actor, primaryVictoryPath, analysis, townsTarget, settledTilesTarget);
  markAiTurnPhase("planningSnapshot", planningSnapshotStartedAt);
  if (yieldToHumanFrontierPriority("planningSnapshot")) return;
  const strategicState = aiStrategicStateByPlayer.get(actor.id);
  const shardOrTruceStartedAt = now();
  const shardOrTruceResult = strategicState ? await maybeHandleAiShardOrTruce(actor, strategicState, planningSnapshot) : undefined;
  markAiTurnPhase("shardOrTruce", shardOrTruceStartedAt);
  if (strategicState && shardOrTruceResult) {
    const totalElapsedMs = now() - turnStartedAt;
    recordAiBudgetBreach(actor, totalElapsedMs, phaseTimings, { reason: shardOrTruceResult });
    if (totalElapsedMs >= 500) {
      runtimeState.appRef?.log.warn({ playerId: actor.id, totalElapsedMs, phases: phaseTimings, reason: shardOrTruceResult, msg: "slow ai turn phases" });
    }
    setAiTurnDebug(actor, shardOrTruceResult === "shard" ? "collected_shard_priority" : "handled_truce_priority", {
      incomePerMinute: aiIncome,
      controlledTowns,
      settledTiles,
      ...(primaryVictoryPath ? { primaryVictoryPath } : {}),
      details: {
        strategicFocus: planningSnapshot.strategicFocus,
        frontPosture: planningSnapshot.frontPosture,
        undercoveredIslandCount: planningSnapshot.undercoveredIslandCount,
        weakestIslandRatio: planningSnapshot.weakestIslandRatio,
        targetPlayerId: strategicState.targetPlayerId
      }
    });
    return;
  }
  const plannerStartedAt = now();
  const decision = await planAiDecisionViaWorker(planningSnapshot);
  markAiTurnPhase("planner", plannerStartedAt);
  if (yieldToHumanFrontierPriority("planner")) return;
  const debugDetails = {
    strategicFocus: planningSnapshot.strategicFocus,
    frontPosture: planningSnapshot.frontPosture,
    undercoveredIslandCount: planningSnapshot.undercoveredIslandCount,
    weakestIslandRatio: planningSnapshot.weakestIslandRatio,
    pressureThreatensCore: planningSnapshot.pressureThreatensCore,
    hasNeutralLandOpportunity: planningSnapshot.neutralExpandAvailable,
    hasScoutOpportunity: planningSnapshot.scoutExpandAvailable,
    scoutExpandWorthwhile: planningSnapshot.scoutExpandWorthwhile,
    hasScaffoldOpportunity: planningSnapshot.scaffoldExpandAvailable,
    hasBarbarianTarget: planningSnapshot.barbarianAttackAvailable,
    hasWeakEnemyBorder: planningSnapshot.pressureAttackAvailable || planningSnapshot.enemyAttackAvailable,
    attackReady: planningSnapshot.attackReady,
    enemyPressureScore: planningSnapshot.pressureAttackScore,
    needsSettlement: planningSnapshot.settlementAvailable,
    frontierDebtHigh: planningSnapshot.frontierDebt,
    foodCoverageLow: planningSnapshot.foodCoverageLow,
    underThreat: planningSnapshot.underThreat,
    threatCritical: planningSnapshot.threatCritical,
    economyWeak: planningSnapshot.economyWeak,
    needsFortifiedAnchor:
      planningSnapshot.fortAvailable &&
      planningSnapshot.fortProtectsCore &&
      (planningSnapshot.controlledTowns > 0 || planningSnapshot.hasActiveDock || planningSnapshot.aiIncome >= 16),
    canAffordFrontierAction: planningSnapshot.canAffordFrontierAction,
    canAffordSettlement: planningSnapshot.canAffordSettlement,
    canBuildFort: planningSnapshot.canBuildFort,
    canBuildEconomy: planningSnapshot.canBuildEconomy,
    goldHealthy: planningSnapshot.goldHealthy,
    economicOpportunityCount: planningSnapshot.frontierOpportunityEconomic,
    scoutOpportunityCount: planningSnapshot.frontierOpportunityScout,
    scaffoldOpportunityCount: planningSnapshot.frontierOpportunityScaffold,
    wasteOpportunityCount: planningSnapshot.frontierOpportunityWaste,
    islandExpandAvailable: planningSnapshot.islandExpandAvailable,
    islandSettlementAvailable: planningSnapshot.islandSettlementAvailable,
    foodCoverage: planningSnapshot.foodCoverage,
    frontierTiles,
    openingScout: planningSnapshot.openingScoutAvailable,
    workerPlanned: aiPlannerWorkerState.lastUsedWorker,
    workerFallbackReason: aiPlannerWorkerState.lastFallbackReason,
    lastActionFailureAction: aiLastActionFailureByPlayer.get(actor.id)?.actionKey,
    lastActionFailureCode: aiLastActionFailureByPlayer.get(actor.id)?.code,
    lastActionFailureReason: aiLastActionFailureByPlayer.get(actor.id)?.reason,
    lastActionFailureAt: aiLastActionFailureByPlayer.get(actor.id)?.at,
    lastActionFailureX: aiLastActionFailureByPlayer.get(actor.id)?.x,
    lastActionFailureY: aiLastActionFailureByPlayer.get(actor.id)?.y,
    truceTargetPlayerId: strategicState?.targetPlayerId
  };
  const resolvedReason = (executed: boolean): string =>
    executed && decision.reason.startsWith("failed_")
      ? decision.reason.replace("failed_", "executed_")
      : !executed && decision.reason.startsWith("executed_")
        ? decision.reason.replace("executed_", "failed_")
        : decision.reason;

  if (!decision.actionKey) {
    const totalElapsedMs = now() - turnStartedAt;
    recordAiBudgetBreach(actor, totalElapsedMs, phaseTimings, { reason: decision.reason });
    if (totalElapsedMs >= 500) {
      runtimeState.appRef?.log.warn({ playerId: actor.id, totalElapsedMs, phases: phaseTimings, reason: decision.reason, msg: "slow ai turn phases" });
    }
    setAiTurnDebug(actor, decision.reason, {
      incomePerMinute: aiIncome,
      controlledTowns,
      settledTiles,
      ...(primaryVictoryPath ? { primaryVictoryPath } : {}),
      details: debugDetails
    });
    return;
  }

  if (decision.actionKey === "opening_scout_expand") {
    const executeStartedAt = now();
    if (yieldToHumanFrontierPriority("pre_execute")) return;
    const opening = bestAiOpeningScoutExpand(actor, territorySummary);
    const executed = Boolean(
      opening &&
        tryQueueBasicFrontierAction(actor, "EXPAND", opening.from.x, opening.from.y, opening.to.x, opening.to.y)
    );
    if (executed && opening) {
      latchQueuedAiIntent(
        actor,
        decision.actionKey,
        "frontier",
        now() + frontierClaimDurationMsAt(opening.to.x, opening.to.y),
        key(opening.to.x, opening.to.y),
        key(opening.from.x, opening.from.y)
      );
    }
    markAiTurnPhase("execute", executeStartedAt);
    const totalElapsedMs = now() - turnStartedAt;
    recordAiBudgetBreach(actor, totalElapsedMs, phaseTimings, { reason: decision.reason, actionKey: decision.actionKey });
    if (totalElapsedMs >= 500) {
      runtimeState.appRef?.log.warn(
        { playerId: actor.id, totalElapsedMs, phases: phaseTimings, actionKey: decision.actionKey, executed, msg: "slow ai turn phases" }
      );
    }
    setAiTurnDebug(actor, resolvedReason(executed), {
      incomePerMinute: aiIncome,
      controlledTowns,
      settledTiles,
      ...(primaryVictoryPath ? { primaryVictoryPath } : {}),
      ...(decision.goapActionKey ? { goapActionKey: decision.goapActionKey } : {}),
      executed,
      details: debugDetails
    });
    return;
  }

  const planningStatic = cachedAiPlanningStaticForPlayer(actor, territorySummary);
  const executeStartedAt = now();
  if (yieldToHumanFrontierPriority("pre_execute")) return;
  const executed = executeAiGoapAction(actor, decision.actionKey, primaryVictoryPath, territorySummary);
  markAiTurnPhase("execute", executeStartedAt);
  const totalElapsedMs = now() - turnStartedAt;
  recordAiBudgetBreach(actor, totalElapsedMs, phaseTimings, { reason: decision.reason, actionKey: decision.actionKey });
  if (totalElapsedMs >= 500) {
    runtimeState.appRef?.log.warn(
      { playerId: actor.id, totalElapsedMs, phases: phaseTimings, actionKey: decision.actionKey, executed, msg: "slow ai turn phases" }
    );
  }
  setAiTurnDebug(actor, resolvedReason(executed), {
    incomePerMinute: aiIncome,
    controlledTowns,
    settledTiles,
    ...(primaryVictoryPath ? { primaryVictoryPath } : {}),
    ...(decision.goapGoalId ? { goapGoalId: decision.goapGoalId } : {}),
    ...(decision.goapActionKey ? { goapActionKey: decision.goapActionKey } : {}),
    executed,
    details: debugDetails
  });
};

const queueMicrotaskFn =
  typeof setImmediate === "function"
    ? (fn: () => void): void => {
        setImmediate(fn);
      }
    : (fn: () => void): void => {
        queueMicrotask(fn);
      };

type AiWorkerJob = {
  actor: Player;
  tickContext: AiTickContext;
  onComplete: (elapsedMs: number) => void;
};

const HUMAN_FRONTIER_PRIORITY_GRACE_MS = 12_000;
const AI_WORKER_DRAIN_RETRY_MS = 250;

const aiWorkerState: {
  queue: AiWorkerJob[];
  draining: boolean;
} = {
  queue: [],
  draining: false
};

let aiWorkerDrainRetryTimeout: ReturnType<typeof setTimeout> | undefined;
let humanFrontierPriorityUntil = 0;

type AiPlannerWorkerResponse =
  | { id: number; decision: AiPlanningDecision }
  | { id: number; error: string };

const aiPlannerWorkerState: {
  worker: Worker | undefined;
  enabled: boolean;
  available: boolean;
  crashed: boolean;
  pending: number;
  lastRoundTripMs: number;
  lastUsedWorker: boolean;
  lastFallbackReason: string | undefined;
  nextRequestId: number;
  inflight: Map<number, { startedAt: number; resolve: (decision: AiPlanningDecision) => void; reject: (err: Error) => void; timeout: NodeJS.Timeout }>;
} = {
  worker: undefined,
  enabled: AI_PLANNER_WORKER_ENABLED,
  available: false,
  crashed: false,
  pending: 0,
  lastRoundTripMs: 0,
  lastUsedWorker: false,
  lastFallbackReason: undefined,
  nextRequestId: 0,
  inflight: new Map()
};

const resolveAiPlannerFallback = (_snapshot: AiPlanningSnapshot, reason: string): AiPlanningDecision => {
  aiPlannerWorkerState.lastUsedWorker = false;
  aiPlannerWorkerState.lastFallbackReason = reason;
  return {
    reason: `skipped_${reason}`
  };
};

const clearAiPlannerInflight = (error: Error): void => {
  for (const [requestId, entry] of aiPlannerWorkerState.inflight.entries()) {
    clearTimeout(entry.timeout);
    entry.reject(error);
    aiPlannerWorkerState.inflight.delete(requestId);
  }
  aiPlannerWorkerState.pending = 0;
};

const ensureAiPlannerWorker = (): Worker | undefined => {
  if (!aiPlannerWorkerState.enabled) return undefined;
  if (aiPlannerWorkerState.worker) return aiPlannerWorkerState.worker;
  try {
    const worker = new Worker(new URL("./ai/planner-worker.js", import.meta.url));
    worker.on("message", (message: AiPlannerWorkerResponse) => {
      const entry = aiPlannerWorkerState.inflight.get(message.id);
      if (!entry) return;
      clearTimeout(entry.timeout);
      aiPlannerWorkerState.inflight.delete(message.id);
      aiPlannerWorkerState.pending = aiPlannerWorkerState.inflight.size;
      aiPlannerWorkerState.lastRoundTripMs = now() - entry.startedAt;
      if ("error" in message) {
        entry.reject(new Error(message.error));
        return;
      }
      aiPlannerWorkerState.lastUsedWorker = true;
      aiPlannerWorkerState.lastFallbackReason = undefined;
      entry.resolve(message.decision);
    });
    worker.on("error", (err) => {
      aiPlannerWorkerState.available = false;
      aiPlannerWorkerState.crashed = true;
      aiPlannerWorkerState.enabled = false;
      aiPlannerWorkerState.worker = undefined;
      clearAiPlannerInflight(err instanceof Error ? err : new Error(String(err)));
      logRuntimeError("ai planner worker failed", err);
    });
    worker.on("exit", (code) => {
      aiPlannerWorkerState.available = false;
      aiPlannerWorkerState.worker = undefined;
      if (code !== 0) {
        aiPlannerWorkerState.crashed = true;
        clearAiPlannerInflight(new Error(`ai planner worker exited with code ${code}`));
      }
    });
    aiPlannerWorkerState.worker = worker;
    aiPlannerWorkerState.available = true;
    aiPlannerWorkerState.crashed = false;
    return worker;
  } catch (err) {
    aiPlannerWorkerState.available = false;
    aiPlannerWorkerState.crashed = true;
    aiPlannerWorkerState.enabled = false;
    logRuntimeError("failed to start ai planner worker", err);
    return undefined;
  }
};

const planAiDecisionViaWorker = async (snapshot: AiPlanningSnapshot): Promise<AiPlanningDecision> => {
  if (aiPlannerWorkerState.pending > 0) {
    return resolveAiPlannerFallback(snapshot, "worker_backpressure");
  }
  const worker = ensureAiPlannerWorker();
  if (!worker) return resolveAiPlannerFallback(snapshot, "worker_unavailable");
  const requestId = ++aiPlannerWorkerState.nextRequestId;
  const startedAt = now();
  const promise = new Promise<AiPlanningDecision>((resolve, reject) => {
    const timeout = setTimeout(() => {
      aiPlannerWorkerState.inflight.delete(requestId);
      aiPlannerWorkerState.pending = aiPlannerWorkerState.inflight.size;
      reject(new Error("ai planner worker timed out"));
    }, AI_PLANNER_TIMEOUT_MS);
    aiPlannerWorkerState.inflight.set(requestId, { startedAt, resolve, reject, timeout });
    aiPlannerWorkerState.pending = aiPlannerWorkerState.inflight.size;
  });
  worker.postMessage({ id: requestId, snapshot });
  try {
    return await promise;
  } catch (err) {
    return resolveAiPlannerFallback(snapshot, err instanceof Error ? err.message : "worker_error");
  }
};

type CombatWorkerResponse =
  | { id: number; result: CombatResolutionResult }
  | { id: number; error: string };

const combatWorkerState: {
  worker: Worker | undefined;
  enabled: boolean;
  available: boolean;
  crashed: boolean;
  pending: number;
  lastRoundTripMs: number;
  lastUsedWorker: boolean;
  lastFallbackReason: string | undefined;
  nextRequestId: number;
  inflight: Map<number, { startedAt: number; resolve: (result: CombatResolutionResult) => void; reject: (err: Error) => void; timeout: NodeJS.Timeout }>;
} = {
  worker: undefined,
  enabled: SIM_COMBAT_WORKER_ENABLED,
  available: false,
  crashed: false,
  pending: 0,
  lastRoundTripMs: 0,
  lastUsedWorker: false,
  lastFallbackReason: undefined,
  nextRequestId: 0,
  inflight: new Map()
};

const resolveCombatFallback = (request: CombatResolutionRequest, reason: string): CombatResolutionResult => {
  combatWorkerState.lastUsedWorker = false;
  combatWorkerState.lastFallbackReason = reason;
  return resolveCombatRoll(request);
};

const clearCombatInflight = (error: Error): void => {
  for (const [requestId, entry] of combatWorkerState.inflight.entries()) {
    clearTimeout(entry.timeout);
    entry.reject(error);
    combatWorkerState.inflight.delete(requestId);
  }
  combatWorkerState.pending = 0;
};

const ensureCombatWorker = (): Worker | undefined => {
  if (!combatWorkerState.enabled) return undefined;
  if (combatWorkerState.worker) return combatWorkerState.worker;
  try {
    const worker = new Worker(new URL("./sim/combat-worker.js", import.meta.url));
    worker.on("message", (message: CombatWorkerResponse) => {
      const entry = combatWorkerState.inflight.get(message.id);
      if (!entry) return;
      clearTimeout(entry.timeout);
      combatWorkerState.inflight.delete(message.id);
      combatWorkerState.pending = combatWorkerState.inflight.size;
      combatWorkerState.lastRoundTripMs = now() - entry.startedAt;
      if ("error" in message) {
        entry.reject(new Error(message.error));
        return;
      }
      combatWorkerState.lastUsedWorker = true;
      combatWorkerState.lastFallbackReason = undefined;
      entry.resolve(message.result);
    });
    worker.on("error", (err) => {
      combatWorkerState.available = false;
      combatWorkerState.crashed = true;
      combatWorkerState.worker = undefined;
      clearCombatInflight(err instanceof Error ? err : new Error(String(err)));
      logRuntimeError("combat worker failed", err);
    });
    worker.on("exit", (code) => {
      combatWorkerState.available = false;
      combatWorkerState.worker = undefined;
      if (code !== 0) {
        combatWorkerState.crashed = true;
        clearCombatInflight(new Error(`combat worker exited with code ${code}`));
      }
    });
    combatWorkerState.worker = worker;
    combatWorkerState.available = true;
    combatWorkerState.crashed = false;
    return worker;
  } catch (err) {
    combatWorkerState.available = false;
    combatWorkerState.crashed = true;
    logRuntimeError("failed to start combat worker", err);
    return undefined;
  }
};

const resolveCombatViaWorker = async (request: CombatResolutionRequest): Promise<CombatResolutionResult> => {
  const worker = ensureCombatWorker();
  if (!worker) return resolveCombatFallback(request, "worker_unavailable");
  const requestId = ++combatWorkerState.nextRequestId;
  const startedAt = now();
  const promise = new Promise<CombatResolutionResult>((resolve, reject) => {
    const timeout = setTimeout(() => {
      combatWorkerState.inflight.delete(requestId);
      combatWorkerState.pending = combatWorkerState.inflight.size;
      reject(new Error("combat worker timed out"));
    }, SIM_COMBAT_TIMEOUT_MS);
    combatWorkerState.inflight.set(requestId, { startedAt, resolve, reject, timeout });
    combatWorkerState.pending = combatWorkerState.inflight.size;
  });
  worker.postMessage({ id: requestId, request });
  try {
    return await promise;
  } catch (err) {
    return resolveCombatFallback(request, err instanceof Error ? err.message : "worker_error");
  }
};

type ChunkSerializerResponse =
  | { id: number; payload: string }
  | { id: number; payloads: string[] }
  | { id: number; error: string };

const chunkSerializerWorkerState: {
  worker: Worker | undefined;
  enabled: boolean;
  available: boolean;
  crashed: boolean;
  pending: number;
  lastRoundTripMs: number;
  lastUsedWorker: boolean;
  lastFallbackReason: string | undefined;
  nextRequestId: number;
  inflight: Map<number, { startedAt: number; resolve: (payload: unknown) => void; reject: (err: Error) => void; timeout: NodeJS.Timeout }>;
} = {
  worker: undefined,
  enabled: CHUNK_SERIALIZER_WORKER_ENABLED,
  available: false,
  crashed: false,
  pending: 0,
  lastRoundTripMs: 0,
  lastUsedWorker: false,
  lastFallbackReason: undefined,
  nextRequestId: 0,
  inflight: new Map()
};

const serializeChunkFallback = (chunk: ChunkPayloadChunk, reason: string): string => {
  chunkSerializerWorkerState.lastUsedWorker = false;
  chunkSerializerWorkerState.lastFallbackReason = reason;
  return serializeChunkBody(chunk);
};

const serializeChunkBatchFallback = (chunks: ChunkBuildInput[], reason: string): string[] => {
  chunkSerializerWorkerState.lastUsedWorker = false;
  chunkSerializerWorkerState.lastFallbackReason = reason;
  return chunks.map((chunk) => serializeChunkBody(buildChunkFromInput(chunk)));
};

const clearChunkSerializerInflight = (error: Error): void => {
  for (const [requestId, entry] of chunkSerializerWorkerState.inflight.entries()) {
    clearTimeout(entry.timeout);
    entry.reject(error);
    chunkSerializerWorkerState.inflight.delete(requestId);
  }
  chunkSerializerWorkerState.pending = 0;
};

const ensureChunkSerializerWorker = (): Worker | undefined => {
  if (!chunkSerializerWorkerState.enabled) return undefined;
  if (chunkSerializerWorkerState.worker) return chunkSerializerWorkerState.worker;
  try {
    const worker = new Worker(new URL("./chunk/serializer-worker.js", import.meta.url));
    worker.on("message", (message: ChunkSerializerResponse) => {
      const entry = chunkSerializerWorkerState.inflight.get(message.id);
      if (!entry) return;
      clearTimeout(entry.timeout);
      chunkSerializerWorkerState.inflight.delete(message.id);
      chunkSerializerWorkerState.pending = chunkSerializerWorkerState.inflight.size;
      chunkSerializerWorkerState.lastRoundTripMs = now() - entry.startedAt;
      if ("error" in message) {
        entry.reject(new Error(message.error));
        return;
      }
      chunkSerializerWorkerState.lastUsedWorker = true;
      chunkSerializerWorkerState.lastFallbackReason = undefined;
      entry.resolve("payloads" in message ? message.payloads : message.payload);
    });
    worker.on("error", (err) => {
      chunkSerializerWorkerState.available = false;
      chunkSerializerWorkerState.crashed = true;
      chunkSerializerWorkerState.enabled = false;
      chunkSerializerWorkerState.worker = undefined;
      clearChunkSerializerInflight(err instanceof Error ? err : new Error(String(err)));
      logRuntimeError("chunk serializer worker failed", err);
    });
    worker.on("exit", (code) => {
      chunkSerializerWorkerState.available = false;
      chunkSerializerWorkerState.worker = undefined;
      if (code !== 0) {
        chunkSerializerWorkerState.crashed = true;
        clearChunkSerializerInflight(new Error(`chunk serializer worker exited with code ${code}`));
      }
    });
    chunkSerializerWorkerState.worker = worker;
    chunkSerializerWorkerState.available = true;
    chunkSerializerWorkerState.crashed = false;
    return worker;
  } catch (err) {
    chunkSerializerWorkerState.available = false;
    chunkSerializerWorkerState.crashed = true;
    chunkSerializerWorkerState.enabled = false;
    logRuntimeError("failed to start chunk serializer worker", err);
    return undefined;
  }
};

const serializeChunkViaWorker = async (chunk: ChunkPayloadChunk): Promise<string> => {
  const worker = ensureChunkSerializerWorker();
  if (!worker) return serializeChunkFallback(chunk, "worker_unavailable");
  const requestId = ++chunkSerializerWorkerState.nextRequestId;
  const startedAt = now();
  const promise = new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      chunkSerializerWorkerState.inflight.delete(requestId);
      chunkSerializerWorkerState.pending = chunkSerializerWorkerState.inflight.size;
      reject(new Error("chunk serializer worker timed out"));
    }, CHUNK_SERIALIZER_TIMEOUT_MS);
    chunkSerializerWorkerState.inflight.set(requestId, {
      startedAt,
      resolve: (payload) => resolve(payload as string),
      reject,
      timeout
    });
    chunkSerializerWorkerState.pending = chunkSerializerWorkerState.inflight.size;
  });
  worker.postMessage({ id: requestId, chunk });
  try {
    return await promise;
  } catch (err) {
    return serializeChunkFallback(chunk, err instanceof Error ? err.message : "worker_error");
  }
};

const serializeChunkBatchViaWorker = async (chunks: ChunkBuildInput[]): Promise<string[]> => {
  if (chunks.length === 0) return [];
  const worker = ensureChunkSerializerWorker();
  if (!worker) return serializeChunkBatchFallback(chunks, "worker_unavailable");
  const requestId = ++chunkSerializerWorkerState.nextRequestId;
  const startedAt = now();
  const promise = new Promise<string[]>((resolve, reject) => {
    const timeout = setTimeout(() => {
      chunkSerializerWorkerState.inflight.delete(requestId);
      chunkSerializerWorkerState.pending = chunkSerializerWorkerState.inflight.size;
      reject(new Error("chunk serializer worker timed out"));
    }, CHUNK_SERIALIZER_TIMEOUT_MS);
    chunkSerializerWorkerState.inflight.set(requestId, {
      startedAt,
      resolve: (payload) => resolve(payload as string[]),
      reject,
      timeout
    });
    chunkSerializerWorkerState.pending = chunkSerializerWorkerState.inflight.size;
  });
  worker.postMessage({ id: requestId, chunks });
  try {
    return await promise;
  } catch (err) {
    return serializeChunkBatchFallback(chunks, err instanceof Error ? err.message : "worker_error");
  }
};

const scheduleAiWorkerDrainRetry = (): void => {
  if (aiWorkerDrainRetryTimeout !== undefined) return;
  aiWorkerDrainRetryTimeout = setTimeout(() => {
    aiWorkerDrainRetryTimeout = undefined;
    if (aiWorkerState.draining || aiWorkerState.queue.length <= 0 || humanFrontierActionPriorityActive()) {
      if (aiWorkerState.queue.length > 0 && humanFrontierActionPriorityActive()) scheduleAiWorkerDrainRetry();
      return;
    }
    aiWorkerState.draining = true;
    void drainAiWorkerQueue();
  }, AI_WORKER_DRAIN_RETRY_MS);
};

const drainAiWorkerQueue = async (): Promise<void> => {
  if (humanFrontierActionPriorityActive()) {
    aiWorkerState.draining = false;
    scheduleAiWorkerDrainRetry();
    return;
  }
  const job = aiWorkerState.queue.shift();
  if (!job) {
    aiWorkerState.draining = false;
    return;
  }
  const turnStartedAt = now();
  try {
    await runAiTurn(job.actor, job.tickContext);
  } catch (err) {
    logRuntimeError("ai tick failed", err);
  } finally {
    job.onComplete(now() - turnStartedAt);
  }
  if (aiWorkerState.queue.length <= 0) {
    aiWorkerState.draining = false;
    return;
  }
  queueMicrotaskFn(() => {
    void drainAiWorkerQueue();
  });
};

const enqueueAiWorkerJob = (job: AiWorkerJob): void => {
  aiWorkerState.queue.push(job);
  if (humanFrontierActionPriorityActive()) {
    scheduleAiWorkerDrainRetry();
    return;
  }
  if (aiWorkerState.draining) return;
  aiWorkerState.draining = true;
  queueMicrotaskFn(() => {
    void drainAiWorkerQueue();
  });
};

const latestRuntimeVitalsSample = (): ReturnType<typeof sampleRuntimeVitals> | undefined => recentRuntimeVitals.values().at(-1);

const runtimeLoadShedLevel = (): "normal" | "soft" | "hard" => {
  const vitals = latestRuntimeVitalsSample();
  if (!vitals) return "normal";
  if (
    vitals.eventLoopDelayP95Ms >= AI_EVENT_LOOP_P95_HARD_LIMIT_MS ||
    vitals.eventLoopUtilizationPercent >= AI_EVENT_LOOP_UTILIZATION_HARD_LIMIT_PCT
  ) {
    return "hard";
  }
  if (
    vitals.eventLoopDelayP95Ms >= AI_EVENT_LOOP_P95_SOFT_LIMIT_MS ||
    vitals.eventLoopUtilizationPercent >= AI_EVENT_LOOP_UTILIZATION_SOFT_LIMIT_PCT
  ) {
    return "soft";
  }
  return "normal";
};

const onlineHumanPlayerCount = (): number => {
  let count = 0;
  for (const playerId of socketsByPlayer.keys()) {
    const player = players.get(playerId);
    if (!player?.isAi) count += 1;
  }
  return count;
};

const noteHumanFrontierActionPriority = (durationMs = HUMAN_FRONTIER_PRIORITY_GRACE_MS): void => {
  humanFrontierPriorityUntil = Math.max(humanFrontierPriorityUntil, now() + durationMs);
};

const humanFrontierActionMessage = (
  msg: ClientMessage
): msg is Extract<ClientMessage, { type: "ATTACK" | "EXPAND" | "BREAKTHROUGH_ATTACK" }> =>
  msg.type === "ATTACK" || msg.type === "EXPAND" || msg.type === "BREAKTHROUGH_ATTACK";

const hasOnlineHumanPendingCapture = (): boolean => {
  const pending = new Set<PendingCapture>();
  for (const capture of combatLocks.values()) pending.add(capture);
  for (const capture of pending) {
    const player = players.get(capture.attackerId);
    if (!player || player.isAi) continue;
    if (socketsByPlayer.has(player.id)) return true;
  }
  return false;
};

const humanFrontierActionPriorityActive = (): boolean => {
  if (onlineHumanPlayerCount() <= 0) return false;
  if (humanFrontierPriorityUntil > now()) return true;
  if (!hasOnlineHumanPendingCapture()) return false;
  noteHumanFrontierActionPriority(500);
  return true;
};

const humanChunkSnapshotPriorityActive = (): boolean => {
  for (const playerId of chunkSnapshotInFlightByPlayer.keys()) {
    const player = players.get(playerId);
    if (!player || player.isAi) continue;
    if (socketsByPlayer.has(playerId)) return true;
  }
  return false;
};
const resolveEliminationIfNeeded = (p: Player, isOnline: boolean): void => {
  if (p.T > 0) return;
  p.isEliminated = true;
  p.points *= 0.7;
  recalcPlayerDerived(p);
  if (isOnline) spawnPlayer(p);
  else p.respawnPending = true;
};

const pendingCapturesByAttacker = (attackerId: string): PendingCapture[] => {
  const uniq = new Set<PendingCapture>();
  for (const lock of combatLocks.values()) {
    if (lock.attackerId === attackerId) uniq.add(lock);
  }
  return [...uniq];
};

const cancelPendingCapture = (capture: PendingCapture): void => {
  capture.cancelled = true;
  if (capture.timeout) clearTimeout(capture.timeout);
  combatLocks.delete(capture.origin);
  combatLocks.delete(capture.target);
};

const logExpandTrace = (
  phase: "received" | "queued" | "combat_start_sent" | "result_applied" | "combat_result_sent" | "vision_delta_sent",
  capture: PendingCapture,
  extra?: Record<string, unknown>
): void => {
  if (capture.actionType !== "EXPAND" || !capture.traceId || typeof capture.startedAt !== "number") return;
  const payload = {
    traceId: capture.traceId,
    playerId: capture.attackerId,
    attackerId: capture.attackerId,
    actionType: capture.actionType,
    origin: capture.origin,
    target: capture.target,
    phase,
    elapsedMs: now() - capture.startedAt,
    resolvesAt: capture.resolvesAt,
    ...extra
  };
  recordServerDebugEvent("info", "expand_trace", payload);
  app.log.info(
    payload,
    "expand trace"
  );
};

const logAttackTrace = (
  phase: "received" | "queued" | "accepted_ack_sent" | "combat_start_sent" | "result_applied" | "combat_result_sent" | "vision_delta_sent",
  capture: PendingCapture,
  extra?: Record<string, unknown>
): void => {
  if (capture.actionType !== "ATTACK" && capture.actionType !== "BREAKTHROUGH_ATTACK") return;
  if (!capture.traceId || typeof capture.startedAt !== "number") return;
  const payload = {
    traceId: capture.traceId,
    playerId: capture.attackerId,
    attackerId: capture.attackerId,
    actionType: capture.actionType,
    origin: capture.origin,
    target: capture.target,
    phase,
    elapsedMs: now() - capture.startedAt,
    resolvesAt: capture.resolvesAt,
    ...extra
  };
  recordServerDebugEvent("info", "attack_trace", payload);
  app.log.info(
    payload,
    "attack trace"
  );
};

const HOT_POST_COMBAT_FOLLOW_UP_WARN_MS = 40;
const POST_COMBAT_FOLLOW_UP_BATCH_MS = 75;

type PendingPostCombatFollowUp = {
  centersByKey: Map<TileKey, { x: number; y: number }>;
  flushTimeout: ReturnType<typeof setTimeout> | undefined;
};

const pendingPostCombatFollowUpsByPlayer = new Map<string, PendingPostCombatFollowUp>();

const flushPostCombatFollowUpsForPlayer = (playerId: string): void => {
  const pending = pendingPostCombatFollowUpsByPlayer.get(playerId);
  if (!pending) return;
  pending.flushTimeout = undefined;
  const changedCenters = [...pending.centersByKey.values()];
  pending.centersByKey.clear();
  if (changedCenters.length === 0) {
    pendingPostCombatFollowUpsByPlayer.delete(playerId);
    return;
  }

  const startedAt = now();
  const player = players.get(playerId);
  const playerUpdateStartedAt = now();
  if (player) sendPlayerUpdate(player, 0, { detail: "combat" });
  const playerUpdateMs = now() - playerUpdateStartedAt;
  const visionStartedAt = now();
  sendLocalVisionDeltaForPlayer(playerId, changedCenters);
  const visionMs = now() - visionStartedAt;
  const elapsedMs = now() - startedAt;
  recordHotPathTimingEvent(
    "post_combat_follow_up_timing",
    {
      playerId,
      changedCenters: changedCenters.length,
      playerUpdateMs,
      visionMs
    },
    elapsedMs,
    HOT_POST_COMBAT_FOLLOW_UP_WARN_MS
  );

  if (pending.centersByKey.size === 0) pendingPostCombatFollowUpsByPlayer.delete(playerId);
  else pending.flushTimeout = setTimeout(() => flushPostCombatFollowUpsForPlayer(playerId), POST_COMBAT_FOLLOW_UP_BATCH_MS);

  if (elapsedMs >= HOT_POST_COMBAT_FOLLOW_UP_WARN_MS) {
    recordServerDebugEvent("warn", "slow_post_combat_follow_up", {
      playerId,
      changedCenters: changedCenters.length,
      elapsedMs,
      playerUpdateMs,
      visionMs
    });
    app.log.warn(
      {
        playerId,
        changedCenters: changedCenters.length,
        elapsedMs,
        playerUpdateMs,
        visionMs
      },
      "slow post-combat follow-up"
    );
  }
};

const queuePostCombatFollowUpsForPlayer = (playerId: string, changedCenters: Array<{ x: number; y: number }>): void => {
  if (changedCenters.length === 0) return;
  let pending = pendingPostCombatFollowUpsByPlayer.get(playerId);
  if (!pending) {
    pending = { centersByKey: new Map<TileKey, { x: number; y: number }>(), flushTimeout: undefined };
    pendingPostCombatFollowUpsByPlayer.set(playerId, pending);
  }
  for (const center of changedCenters) pending.centersByKey.set(key(center.x, center.y), center);
  if (pending.flushTimeout !== undefined) return;
  pending.flushTimeout = setTimeout(() => flushPostCombatFollowUpsForPlayer(playerId), POST_COMBAT_FOLLOW_UP_BATCH_MS);
};

const sendPostCombatFollowUps = (
  attackerId: string,
  changedCenters: Array<{ x: number; y: number }>,
  defenderId?: string
): void => {
  queuePostCombatFollowUpsForPlayer(attackerId, changedCenters);
  if (defenderId) queuePostCombatFollowUpsForPlayer(defenderId, changedCenters);
};

const cancelAllBarbarianPendingCaptures = (): void => {
  const uniq = new Set<PendingCapture>();
  for (const lock of combatLocks.values()) {
    if (!lock.attackerId.startsWith(`${BARBARIAN_OWNER_ID}:`)) continue;
    uniq.add(lock);
  }
  for (const capture of uniq) cancelPendingCapture(capture);
};

const resolveQueuedBarbarianCombat = async (
  command: Extract<SystemSimulationCommand, { type: "BARBARIAN_COMBAT_RESOLVE" }>
): Promise<void> => {
  const live = barbarianAgents.get(command.agentId);
  if (!live) return;
  const liveTile = runtimeTileCore(live.x, live.y);
  if (liveTile.ownerId !== BARBARIAN_OWNER_ID || key(liveTile.x, liveTile.y) !== command.originKey) return;
  const targetKey = key(command.targetX, command.targetY);
  const currentTarget = playerTile(command.targetX, command.targetY);
  if (!currentTarget.ownerId || currentTarget.ownerId === BARBARIAN_OWNER_ID) {
    live.lastActionAt = now();
    live.nextActionAt = now() + BARBARIAN_ACTION_INTERVAL_MS;
    upsertBarbarianAgent(live);
    return;
  }
  const defender = players.get(currentTarget.ownerId);
  if (!defender) {
    live.lastActionAt = now();
    live.nextActionAt = now() + BARBARIAN_ACTION_INTERVAL_MS;
    upsertBarbarianAgent(live);
    return;
  }
  const shock = breachShockByTile.get(targetKey);
  const shockMult = shock && shock.ownerId === defender.id && shock.expiresAt > now() ? BREACH_SHOCK_DEF_MULT : 1;
  const fortMult = fortDefenseMultAt(defender.id, targetKey);
  const dockMult = docksByTile.has(targetKey) ? DOCK_DEFENSE_MULT : 1;
  const combat = await resolveCombatViaWorker({
    attackBase: 10 * BARBARIAN_ATTACK_POWER,
    defenseBase:
      10 *
      BARBARIAN_DEFENSE_POWER *
      defender.mods.defense *
      playerDefensiveness(defender) *
      shockMult *
      fortMult *
      dockMult *
      settledDefenseMultiplierForTarget(defender.id, currentTarget) *
      settlementDefenseMultAt(defender.id, targetKey) *
      ownershipDefenseMultiplierForTarget(defender.id, currentTarget)
  });
  const win = combat.win;
  const progressBefore = live.progress;
  if (!win) {
    live.lastActionAt = now();
    live.nextActionAt = now() + BARBARIAN_ACTION_INTERVAL_MS;
    upsertBarbarianAgent(live);
    logBarbarianEvent(`attack-loss ${live.id} @ ${live.x},${live.y} vs ${command.targetX},${command.targetY}`);
    return;
  }
  const gain = getBarbarianProgressGain(currentTarget);
  live.progress += gain;
  logBarbarianEvent(`progress ${live.id} ${progressBefore} -> ${live.progress} at ${command.targetX},${command.targetY}`);
  const shouldMultiply = live.progress >= BARBARIAN_MULTIPLY_THRESHOLD;
  const oldX = live.x;
  const oldY = live.y;
  updateOwnership(command.targetX, command.targetY, BARBARIAN_OWNER_ID, "BARBARIAN");
  live.x = command.targetX;
  live.y = command.targetY;
  if (shouldMultiply) {
    updateOwnership(oldX, oldY, BARBARIAN_OWNER_ID, "BARBARIAN");
    spawnBarbarianAgentAt(oldX, oldY, 0);
    live.progress = 0;
    logBarbarianEvent(`multiply ${live.id} @ ${oldX},${oldY} after capture ${command.targetX},${command.targetY}`);
  } else {
    updateOwnership(oldX, oldY, undefined);
  }
  live.lastActionAt = now();
  live.nextActionAt = now() + BARBARIAN_ACTION_INTERVAL_MS;
  upsertBarbarianAgent(live);
  recalcPlayerDerived(defender);
  updateMissionState(defender);
  resolveEliminationIfNeeded(defender, socketsByPlayer.has(defender.id));
  logBarbarianEvent(`attack-win ${live.id} now @ ${live.x},${live.y} after ${command.targetX},${command.targetY}`);
};

const enqueueBarbarianCombatResolve = (agentId: string, originKey: TileKey, targetX: number, targetY: number): void => {
  if (
    hasQueuedSystemSimulationCommand(
      (job) =>
        job.command.type === "BARBARIAN_COMBAT_RESOLVE" &&
        job.command.agentId === agentId &&
        job.command.originKey === originKey &&
        job.command.targetX === targetX &&
        job.command.targetY === targetY
    )
  ) {
    return;
  }
  enqueueSystemSimulationCommand({ type: "BARBARIAN_COMBAT_RESOLVE", agentId, originKey, targetX, targetY });
};

const runBarbarianAction = (agent: BarbarianAgent): void => {
  const currentTile = playerTile(agent.x, agent.y);
  const currentKey = key(currentTile.x, currentTile.y);
  if (currentTile.ownerId !== BARBARIAN_OWNER_ID) {
    removeBarbarianAgent(agent.id);
    return;
  }
  if (combatLocks.has(currentKey)) {
    agent.lastActionAt = now();
    agent.nextActionAt = now() + BARBARIAN_ACTION_INTERVAL_MS;
    return;
  }
  const target = chooseBarbarianTarget(agent);
  if (!target) {
    agent.lastActionAt = now();
    agent.nextActionAt = now() + BARBARIAN_ACTION_INTERVAL_MS;
    return;
  }
  const targetKey = key(target.x, target.y);
  if (combatLocks.has(targetKey)) {
    agent.lastActionAt = now();
    agent.nextActionAt = now() + BARBARIAN_ACTION_INTERVAL_MS;
    return;
  }
  const defenderId = target.ownerId;
  if (!defenderId) {
    const oldX = agent.x;
    const oldY = agent.y;
    updateOwnership(target.x, target.y, BARBARIAN_OWNER_ID, "BARBARIAN");
    updateOwnership(oldX, oldY, undefined);
    agent.x = target.x;
    agent.y = target.y;
    agent.lastActionAt = now();
    agent.nextActionAt = now() + BARBARIAN_ACTION_INTERVAL_MS;
    upsertBarbarianAgent(agent);
    logBarbarianEvent(`expand ${agent.id} ${oldX},${oldY} -> ${target.x},${target.y}`);
    return;
  }
  if (defenderId === BARBARIAN_OWNER_ID) {
    agent.lastActionAt = now();
    agent.nextActionAt = now() + BARBARIAN_ACTION_INTERVAL_MS;
    return;
  }
  const pending: PendingCapture = {
    resolvesAt: now() + COMBAT_LOCK_MS,
    origin: currentKey,
    target: targetKey,
    attackerId: `${BARBARIAN_OWNER_ID}:${agent.id}`,
    staminaCost: 0,
    manpowerCost: 0,
    cancelled: false
  };
  combatLocks.set(currentKey, pending);
  combatLocks.set(targetKey, pending);
  logBarbarianEvent(`attack-start ${agent.id} ${currentTile.x},${currentTile.y} -> ${target.x},${target.y}`);
  if (defenderId && defenderId !== BARBARIAN_OWNER_ID) {
    sendToPlayer(defenderId, {
      type: "ATTACK_ALERT",
      attackerId: BARBARIAN_OWNER_ID,
      attackerName: "Barbarians",
      x: target.x,
      y: target.y,
      resolvesAt: pending.resolvesAt
    });
  }
  pending.timeout = setTimeout(() => {
    if (pending.cancelled) return;
    if (!hasOnlinePlayers()) {
      cancelPendingCapture(pending);
      return;
    }
    combatLocks.delete(currentKey);
    combatLocks.delete(targetKey);
    enqueueBarbarianCombatResolve(agent.id, currentKey, target.x, target.y);
  }, COMBAT_LOCK_MS);
};

const enqueueBarbarianAction = (agentId: string): void => {
  if (
    hasQueuedSystemSimulationCommand(
      (job) => job.command.type === "BARBARIAN_ACTION" && job.command.agentId === agentId
    )
  ) {
    return;
  }
  enqueueSystemSimulationCommand({ type: "BARBARIAN_ACTION", agentId });
};

const runBarbarianTick = (): void => {
  if (!hasOnlinePlayers()) return;
  if (humanFrontierActionPriorityActive()) return;
  const current = [...barbarianAgents.values()];
  for (const agent of current) {
    const live = barbarianAgents.get(agent.id);
    if (!live) continue;
    if (now() < live.nextActionAt) continue;
    if (!isVisibleToAnyOnlinePlayer(live.x, live.y)) {
      continue;
    }
    enqueueBarbarianAction(live.id);
  }
};

const broadcast = (payload: unknown): void => {
  const serialized = JSON.stringify(payload);
  for (const ws of socketsByPlayer.values()) {
    if (ws.readyState === ws.OPEN) ws.send(serialized);
  }
};

const broadcastBulk = (payload: unknown): void => {
  broadcastBulkAcrossSockets(socketsByPlayer, bulkSocketsByPlayer, JSON.stringify(payload));
};

const pruneExpiredTruces = (): void => {
  const nowMs = now();
  for (const [pairKey, truce] of trucesByPair) {
    if (truce.endsAt > nowMs) continue;
    trucesByPair.delete(pairKey);
  }
  for (const [requestId, request] of truceRequests) {
    if (request.expiresAt > nowMs) continue;
    truceRequests.delete(requestId);
  }
  for (const [pairKey, penalty] of truceBreakPenaltyByPair) {
    if (penalty.endsAt > nowMs) continue;
    truceBreakPenaltyByPair.delete(pairKey);
  }
};

const activeTruceBetween = (a: string, b: string): ActiveTruce | undefined => {
  pruneExpiredTruces();
  return trucesByPair.get(playerPairKey(a, b));
};

const playerHasActiveTruce = (playerId: string): boolean => {
  pruneExpiredTruces();
  for (const truce of trucesByPair.values()) {
    if (truce.playerAId === playerId || truce.playerBId === playerId) return true;
  }
  return false;
};

const bestAiCollectShardTile = (actor: Player): Tile | undefined => {
  const visibility = visibilitySnapshotForPlayer(actor);
  let best: { tile: Tile; score: number } | undefined;
  for (const tileKey of actor.territoryTiles) {
    const site = shardSitesByTile.get(tileKey);
    if (!site || (site.expiresAt !== undefined && site.expiresAt <= now())) continue;
    const [x, y] = parseKey(tileKey);
    if (!visibleInSnapshot(visibility, x, y)) continue;
    const tile = aiTileLiteAt(x, y);
    let score = site.amount * 100;
    if (townsByTile.has(tileKey) || docksByTile.has(tileKey) || tile.resource) score += 20;
    if (!best || score > best.score) best = { tile, score };
  }
  return best?.tile;
};

const maybeHandleAiShardOrTruce = async (
  actor: Player,
  strategicState: AiStrategicState,
  planningSnapshot: AiPlanningSnapshot
): Promise<"shard" | "truce" | undefined> => {
  const shardTile =
    runtimeLoadShedLevel() === "normal" && !humanChunkSnapshotPriorityActive() ? bestAiCollectShardTile(actor) : undefined;
  if (shardTile && strategicState.focus === "SHARD_RUSH" && !planningSnapshot.pressureThreatensCore) {
    await simulationService.executeDirectMessage(actor, { type: "COLLECT_SHARD", x: shardTile.x, y: shardTile.y });
    return "shard";
  }

  const targetPlayerId = strategicState.targetPlayerId;
  const target = targetPlayerId ? players.get(targetPlayerId) : undefined;
  if (!target) return undefined;
  if (strategicState.frontPosture !== "TRUCE") return undefined;
  if (planningSnapshot.pressureThreatensCore) return undefined;
  if (activeTruceBetween(actor.id, target.id) || playerHasActiveTruce(actor.id) || playerHasActiveTruce(target.id)) return undefined;

  for (const request of truceRequests.values()) {
    if (request.toPlayerId !== actor.id || request.fromPlayerId !== target.id || request.expiresAt < now()) continue;
    await simulationService.executeDirectMessage(actor, { type: "TRUCE_ACCEPT", requestId: request.id });
    return "truce";
  }

  if (!planningSnapshot.canAffordFrontierAction && !planningSnapshot.canAffordSettlement) {
    await simulationService.executeDirectMessage(actor, {
      type: "TRUCE_REQUEST",
      targetPlayerName: target.name,
      durationHours: isFinalPushActive() ? 12 : 24
    });
    return "truce";
  }

  return undefined;
};

const truceBlocksHostility = (a: string, b: string): boolean => Boolean(activeTruceBetween(a, b));

const truceBreakAttackMultiplier = (attackerId: string, defenderId: string): number => {
  const penalty = truceBreakPenaltyByPair.get(playerPairKey(attackerId, defenderId));
  if (!penalty || penalty.endsAt <= now()) return 1;
  return penalty.penalizedPlayerId === attackerId && penalty.targetPlayerId === defenderId ? TRUCE_BREAK_ATTACK_MULT : 1;
};

const recomputeExposure = (p: Player): void => {
  let T = 0;
  let E = 0;
  let Ts = 0;
  let Es = 0;
  for (const tileKey of p.territoryTiles) {
    const [x, y] = parseKey(tileKey);
    const self = runtimeTileCore(x, y);
    if (self.ownerId !== p.id || self.terrain !== "LAND") continue;
    T += 1;
    const n = cardinalNeighborCores(x, y);
    let exposedSides = 0;
    for (const tile of n) {
      if (tile.terrain !== "LAND") continue;
      if (tile.ownerId === p.id) continue;
      if (tile.ownerId && p.allies.has(tile.ownerId)) continue;
      exposedSides += 1;
    }
    E += exposureWeightFromSides(exposedSides);

    if (self.ownershipState !== "SETTLED") continue;
    Ts += 1;
    let settledExposedSides = 0;
    for (const tile of n) {
      if (tile.terrain !== "LAND") continue;
      const isSameOrAllied = tile.ownerId === p.id || Boolean(tile.ownerId && p.allies.has(tile.ownerId));
      if (isSameOrAllied) continue;
      settledExposedSides += 1;
    }
    Es += settledExposedSides;
  }
  p.T = T;
  p.E = E;
  p.Ts = Ts;
  p.Es = Es;
};

const broadcastAllianceUpdate = (a: Player, b: Player): void => {
  const wa = socketsByPlayer.get(a.id);
  const wb = socketsByPlayer.get(b.id);
  const outgoingFor = (playerId: string): AllianceRequest[] => [...allianceRequests.values()].filter((r) => r.fromPlayerId === playerId);
  const incomingFor = (playerId: string): AllianceRequest[] => [...allianceRequests.values()].filter((r) => r.toPlayerId === playerId);
  markVisibilityDirtyForPlayers([a.id, b.id, ...a.allies, ...b.allies]);
  wa?.send(JSON.stringify({ type: "ALLIANCE_UPDATE", allies: [...a.allies], incomingAllianceRequests: incomingFor(a.id), outgoingAllianceRequests: outgoingFor(a.id) }));
  wb?.send(JSON.stringify({ type: "ALLIANCE_UPDATE", allies: [...b.allies], incomingAllianceRequests: incomingFor(b.id), outgoingAllianceRequests: outgoingFor(b.id) }));
};

const activeTruceViewsForPlayer = (playerId: string): Array<{ otherPlayerId: string; otherPlayerName: string; startedAt: number; endsAt: number; createdByPlayerId: string }> => {
  pruneExpiredTruces();
  const out: Array<{ otherPlayerId: string; otherPlayerName: string; startedAt: number; endsAt: number; createdByPlayerId: string }> = [];
  for (const truce of trucesByPair.values()) {
    if (truce.playerAId !== playerId && truce.playerBId !== playerId) continue;
    const otherPlayerId = truce.playerAId === playerId ? truce.playerBId : truce.playerAId;
    out.push({
      otherPlayerId,
      otherPlayerName: players.get(otherPlayerId)?.name ?? otherPlayerId.slice(0, 8),
      startedAt: truce.startedAt,
      endsAt: truce.endsAt,
      createdByPlayerId: truce.createdByPlayerId
    });
  }
  return out.sort((a, b) => a.endsAt - b.endsAt);
};

const broadcastTruceUpdate = (a: Player, b: Player, announcement?: string): void => {
  const wa = socketsByPlayer.get(a.id);
  const wb = socketsByPlayer.get(b.id);
  const outgoingFor = (playerId: string): TruceRequest[] => [...truceRequests.values()].filter((request) => request.fromPlayerId === playerId);
  const incomingFor = (playerId: string): TruceRequest[] => [...truceRequests.values()].filter((request) => request.toPlayerId === playerId);
  wa?.send(
    JSON.stringify({
      type: "TRUCE_UPDATE",
      activeTruces: activeTruceViewsForPlayer(a.id),
      incomingTruceRequests: incomingFor(a.id),
      outgoingTruceRequests: outgoingFor(a.id),
      announcement
    })
  );
  wb?.send(
    JSON.stringify({
      type: "TRUCE_UPDATE",
      activeTruces: activeTruceViewsForPlayer(b.id),
      incomingTruceRequests: incomingFor(b.id),
      outgoingTruceRequests: outgoingFor(b.id),
      announcement
    })
  );
};

const playerStylePayload = (player: Player): { id: string; name: string; tileColor?: string; visualStyle: EmpireVisualStyle; shieldUntil: number } => {
  const out: { id: string; name: string; tileColor?: string; visualStyle: EmpireVisualStyle; shieldUntil: number } = {
    id: player.id,
    name: player.name,
    visualStyle: empireStyleFromPlayer(player),
    shieldUntil: player.spawnShieldUntil
  };
  if (player.tileColor) out.tileColor = player.tileColor;
  return out;
};

const exportPlayerStyles = (): Array<{ id: string; name: string; tileColor?: string; visualStyle: EmpireVisualStyle; shieldUntil: number }> => {
  return [...players.values()].map((p) => playerStylePayload(p));
};

const chunkKeyAtTile = (x: number, y: number): string => `${Math.floor(wrapX(x, WORLD_WIDTH) / CHUNK_SIZE)},${Math.floor(wrapY(y, WORLD_HEIGHT) / CHUNK_SIZE)}`;
const CHUNK_SNAPSHOT_WARN_MS = 60;
const CHUNK_SNAPSHOT_BATCH_SIZE = 4;
const CHUNK_SNAPSHOT_BUDGET_MS = 24;
const CHUNK_SNAPSHOT_YIELD_MS = 4;
const CHUNK_SNAPSHOT_OVERLOAD_YIELD_MS = 16;
const INITIAL_CHUNK_BOOTSTRAP_RADIUS = 0;
const tileIndex = (x: number, y: number): number => y * WORLD_WIDTH + x;
const {
  chunkReadManager,
  chunkReadWorkerState,
  chunkCoordsForSubscription,
  buildBootstrapChunkStages,
  sendChunkSnapshot,
  tileInSubscription,
  refreshSubscribedViewForPlayer: refreshSubscribedViewForPlayerFromChunkRuntime
} = createServerChunkSyncRuntime({
  CHUNK_READ_WORKER_ENABLED,
  CHUNK_SIZE,
  CHUNK_STREAM_BATCH_SIZE,
  CHUNK_SNAPSHOT_BATCH_SIZE,
  CHUNK_SNAPSHOT_BUDGET_MS,
  CHUNK_SNAPSHOT_WARN_MS,
  CHUNK_SNAPSHOT_YIELD_MS,
  CHUNK_SNAPSHOT_OVERLOAD_YIELD_MS,
  INITIAL_CHUNK_BOOTSTRAP_RADIUS,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  now,
  wrapX,
  wrapY,
  key,
  terrainAtRuntime,
  players,
  socketsByPlayer,
  docksByTile,
  clusterByTile,
  clustersById,
  authSyncTimingByPlayer,
  cachedChunkSnapshotByPlayer,
  fogChunkTilesByChunkKey,
  chunkSnapshotGenerationByPlayer,
  chunkSnapshotInFlightByPlayer,
  pendingChunkRefreshByPlayer,
  chunkSnapshotSentAtByPlayer,
  chunkSubscriptionByPlayer,
  summaryChunkTiles,
  summaryTileAt,
  summaryChunkVersionByChunkKey,
  visibilitySnapshotForPlayer,
  visibleInSnapshot,
  runtimeMemoryStats,
  logRuntimeError,
  pushChunkSnapshotPerf: (sample) => {
    recentChunkSnapshotPerf.push(sample);
    runtimeIncidentLog.record("chunk_snapshot", sample);
    if (sample.rssMb >= RUNTIME_MEMORY_WATERMARK_THRESHOLDS_MB[0]) {
      app.log.warn(sample, "chunk snapshot memory watermark");
    }
    maybeLogRuntimeMemoryWatermark("chunk_snapshot", runtimeMemoryStats(), {
      playerId: sample.playerId,
      elapsedMs: sample.elapsedMs,
      chunks: sample.chunks,
      tiles: sample.tiles,
      radius: sample.radius,
      cachedPayloadChunks: sample.cachedPayloadChunks,
      rebuiltChunks: sample.rebuiltChunks,
      batches: sample.batches
    });
  },
  onFirstChunkSent: ({ playerId, chunkCount, tileCount, radius }) => {
    sendLoginPhase(
      socketsByPlayer.get(playerId),
      "MAP_FIRST_CHUNK",
      "Connecting your empire...",
      `First map chunk arrived. Loaded ${chunkCount} chunk${chunkCount === 1 ? "" : "s"} (${tileCount.toLocaleString()} tiles).`
    );
    const authSync = authSyncTimingByPlayer.get(playerId);
    if (!authSync || authSync.firstChunkSentAt === undefined) return;
    app.log.info(
      {
        playerId,
        sinceAuthVerifiedMs: authSync.authVerifiedAt ? authSync.firstChunkSentAt - authSync.authVerifiedAt : undefined,
        sinceInitSentMs: authSync.initSentAt ? authSync.firstChunkSentAt - authSync.initSentAt : undefined,
        sinceFirstSubscribeMs: authSync.firstSubscribeAt ? authSync.firstChunkSentAt - authSync.firstSubscribeAt : undefined,
        chunkCount,
        tileCount,
        radius
      },
      "auth sync first chunk sent"
    );
    runtimeIncidentLog.record("auth_sync_first_chunk", {
      playerId,
      sinceAuthVerifiedMs: authSync.authVerifiedAt ? authSync.firstChunkSentAt - authSync.authVerifiedAt : undefined,
      sinceInitSentMs: authSync.initSentAt ? authSync.firstChunkSentAt - authSync.initSentAt : undefined,
      sinceFirstSubscribeMs: authSync.firstSubscribeAt ? authSync.firstChunkSentAt - authSync.firstSubscribeAt : undefined,
      chunkCount,
      tileCount,
      radius
    });
  },
  onSlowChunkSnapshot: ({ playerId, elapsedMs, chunks, tiles, radius, phases, memory }) => {
    app.log.warn({ playerId, elapsedMs, chunks, tiles, radius, ...phases, ...memory }, "slow chunk snapshot");
    runtimeIncidentLog.record("slow_chunk_snapshot", {
      playerId,
      elapsedMs,
      chunks,
      tiles,
      radius,
      ...phases,
      ...memory
    });
  },
  serializeChunkBatchViaWorker,
  serializeChunkBatchDirect: (inputs) => inputs.map((chunk) => serializeChunkBody(buildChunkFromInput(chunk))),
  serializeChunkBatchBodies,
  sendChunkBatchPayload: (socket, payload) => enqueueLowPrioritySocketMessage(socket as Ws, payload),
  runtimeLoadShedLevel,
  bulkSocketForPlayer: (playerId: string) => bulkSocketForPlayer(playerId),
  humanFrontierActionPriorityActive
});

const markSummaryChunkDirtyAtTile = (x: number, y: number): void => {
  simulationChunkState.markSummaryChunkDirtyAtTile(x, y);
  const wx = wrapX(x, WORLD_WIDTH);
  const wy = wrapY(y, WORLD_HEIGHT);
  void chunkReadManager.patchTile(wx, wy).catch((err) => {
    logRuntimeError("chunk read worker update failed", err);
  });
};

const {
  logTileSync,
  actionValidationPayload,
  sendVisibleTileDeltaAt,
  sendVisibleTileDeltaSquare,
  refreshVisibleOwnedTownsForPlayer,
  refreshVisibleNearbyTownDeltas,
  reconcileCapitalForPlayer,
  controlSocketForPlayer,
  bulkSocketForPlayer,
  sendControlToPlayer,
  sendToPlayer,
  sendControlToSocket,
  sendBulkToPlayer,
  onlineSocketCount,
  hasOnlinePlayers,
  pauseVictoryPressureTimers,
  resumeVictoryPressureTimers,
  clearVictoryPressurePauseState,
  isVisibleToAnyOnlinePlayer,
  refreshSubscribedViewForPlayer,
  fogTileForPlayer,
  visibleTileForPlayer,
  sendLocalVisionDeltaForPlayer,
  broadcastLocalVisionDelta
} = createServerRealtimeSyncRuntime({
  WORLD_WIDTH,
  WORLD_HEIGHT,
  OBSERVATORY_VISION_BONUS,
  TILE_SYNC_DEBUG,
  TILE_SYNC_DEBUG_EMAILS,
  players,
  authIdentityByUid,
  socketsByPlayer,
  bulkSocketsByPlayer,
  chunkSubscriptionByPlayer,
  chunkSnapshotInFlightByPlayer,
  pendingChunkRefreshByPlayer,
  townsByTile,
  docksByTile,
  clusterByTile,
  clustersById,
  victoryPressureById,
  now,
  key,
  parseKey,
  wrapX,
  wrapY,
  terrainAtRuntime,
  activeSettlementTileKeyForPlayer: (playerId: string) => activeSettlementTileKeyForPlayer(playerId),
  ownedTownKeysForPlayer: (playerId: string) => ownedTownKeysForPlayer(playerId),
  playerTile,
  tileInSubscription,
  sendChunkSnapshot: (socket, player, sub) => sendChunkSnapshot(socket, player, sub),
  visibilitySnapshotForPlayer,
  visibleInSnapshot,
  visible,
  effectiveVisionRadiusForPlayer: (player: Player) => effectiveVisionRadiusForPlayer(player),
  isValidCapitalTile,
  chooseCapitalTileKey,
  resolveControlSocketForPlayer: (controlSockets, playerId) =>
    resolveControlSocketForPlayer(controlSockets, playerId) as Ws | undefined,
  resolveBulkSocketForPlayer: (controlSockets, bulkSockets, playerId) =>
    resolveBulkSocketForPlayer(controlSockets, bulkSockets, playerId) as Ws | undefined,
  sendBulkPayloadToPlayer,
  sendHighPrioritySocketMessage,
  recordServerDebugEvent,
  appLogInfo: (payload, message) => app.log.info(payload, message)
});

const {
  hasActiveResearch,
  availableTechPicks,
  defaultMissionStats,
  ensureMissionDefaults,
  missionProgressValue,
  dynamicMissionProgress,
  applyDynamicMissionReward,
  maybeIssueVendettaMission,
  maybeIssueDockMission,
  maybeIssueResourceMission,
  dynamicMissionPayload,
  applyStaticMissionReward,
  syncMissionProgress,
  unlockMissions,
  continentsHeldCount,
  updateMissionState,
  missionPayload,
  normalizePlayerProgressionState
} = createServerPlayerProgression({
  now,
  docksByTile,
  parseKey,
  playerTile,
  vendettaCaptureCountsByPlayer,
  getOrInitResourceCounts,
  temporaryAttackBuffUntilByPlayer,
  VENDETTA_ATTACK_BUFF_MS,
  getOrInitForcedReveal,
  dockById,
  visible,
  key,
  wrapX,
  wrapY,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  temporaryIncomeBuffUntilByPlayer,
  RESOURCE_CHAIN_BUFF_MS,
  getOrInitStrategicStocks,
  dynamicMissionsByPlayer,
  techById,
  domainById,
  playerManpowerCap,
  applyManpowerRegen,
  continentIdAt
});

const {
  normalizedPlayerHandle,
  uniquePlayerName,
  claimPlayerName,
  playerHasFogAdminAccess,
  ensureAiPlayers
} = createServerPlayerIdentityRuntime({
  players,
  authIdentityByUid,
  AI_PLAYERS,
  FOG_ADMIN_EMAIL,
  STARTING_GOLD,
  STARTING_MANPOWER,
  STAMINA_MAX,
  colorFromId,
  defaultMissionStats,
  now,
  randomUUID: () => crypto.randomUUID(),
  initializeAiPlayerRuntimeState: (player: Player) => {
    playerBaseMods.set(player.id, { attack: 1, defense: 1, income: 1, vision: 1 });
    strategicResourceStockByPlayer.set(player.id, emptyStrategicStocks());
    strategicResourceBufferByPlayer.set(player.id, emptyStrategicStocks());
    economyIndexByPlayer.set(player.id, emptyPlayerEconomyIndex());
    dynamicMissionsByPlayer.set(player.id, []);
    forcedRevealTilesByPlayer.set(player.id, new Set<TileKey>());
    setRevealTargetsForPlayer(player.id, []);
    playerEffectsByPlayer.set(player.id, emptyPlayerEffects());
    clusterControlledTilesByPlayer.set(player.id, new Map());
  },
  cleanupRemovedAiPlayer: (playerId: string) => {
    playerBaseMods.delete(playerId);
    strategicResourceStockByPlayer.delete(playerId);
    strategicResourceBufferByPlayer.delete(playerId);
    economyIndexByPlayer.delete(playerId);
    dynamicMissionsByPlayer.delete(playerId);
    forcedRevealTilesByPlayer.delete(playerId);
    revealedEmpireTargetsByPlayer.delete(playerId);
    playerEffectsByPlayer.delete(playerId);
    clusterControlledTilesByPlayer.delete(playerId);
    resourceCountsByPlayer.delete(playerId);
    frontierSettlementsByPlayer.delete(playerId);
    temporaryAttackBuffUntilByPlayer.delete(playerId);
    temporaryIncomeBuffUntilByPlayer.delete(playerId);
    abilityCooldownsByPlayer.delete(playerId);
    growthPausedUntilByPlayer.delete(playerId);
    townFeedingStateByPlayer.delete(playerId);
    observatoryTileKeysByPlayer.delete(playerId);
    economicStructureTileKeysByPlayer.delete(playerId);
    socketsByPlayer.delete(playerId);
    bulkSocketsByPlayer.delete(playerId);
    chunkSubscriptionByPlayer.delete(playerId);
    chunkSnapshotSentAtByPlayer.delete(playerId);
    chunkSnapshotGenerationByPlayer.delete(playerId);
    pendingChunkRefreshByPlayer.delete(playerId);
    cachedVisibilitySnapshotByPlayer.delete(playerId);
    cachedChunkSnapshotByPlayer.delete(playerId);
  }
});

const {
  computeLeaderboardSnapshot,
  uniqueLeader,
  leadingPair,
  countControlledTowns,
  worldResourceTileCounts,
  controlledResourceTileCounts,
  islandMap,
  islandLandCounts,
  islandSettledCounts,
  claimableLandTileCount,
  collectPlayerCompetitionMetrics,
  trimFrontierSettlementsWindow,
  recordFrontierSettlementForPressure
} = createServerStatusMetrics({
  cachedAiTerritoryStructureForPlayer,
  currentIncomePerMinute,
  frontierSettlementsByPlayer,
  VICTORY_PRESSURE_FRONTIER_REACH_WINDOW_MS,
  now,
  townsByTile,
  ownership,
  ownershipStateByTile,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  terrainAtRuntime,
  applyClusterResources,
  resourceAt,
  players,
  parseKey,
  activeSeason,
  key,
  wrapX,
  wrapY
});

const {
  state: aiSchedulerState,
  runAiTick,
  markAiDefensePriority,
  getCompetitionContext: getAiCompetitionContext,
  clearCompetitionContext: clearAiCompetitionContext
} = createAiRuntime<
  Player,
  PlayerCompetitionMetrics,
  AiTurnAnalysis,
  AiTickContext
>({
  config: {
    tickMs: AI_TICK_MS,
    dispatchIntervalMs: AI_DISPATCH_INTERVAL_MS,
    tickBatchSize: AI_TICK_BATCH_SIZE,
    humanPriorityBatchSize: AI_HUMAN_PRIORITY_BATCH_SIZE,
    humanDefenseBatchSize: AI_HUMAN_DEFENSE_BATCH_SIZE,
    authPriorityBatchSize: AI_AUTH_PRIORITY_BATCH_SIZE,
    defensePriorityMs: AI_DEFENSE_PRIORITY_MS,
    workerQueueSoftLimit: AI_WORKER_QUEUE_SOFT_LIMIT,
    simulationQueueSoftLimit: AI_SIM_QUEUE_SOFT_LIMIT,
    eventLoopP95SoftLimitMs: AI_EVENT_LOOP_P95_SOFT_LIMIT_MS,
    eventLoopUtilizationSoftLimitPct: AI_EVENT_LOOP_UTILIZATION_SOFT_LIMIT_PCT,
    eventLoopP95HardLimitMs: AI_EVENT_LOOP_P95_HARD_LIMIT_MS,
    eventLoopUtilizationHardLimitPct: AI_EVENT_LOOP_UTILIZATION_HARD_LIMIT_PCT
  },
  now,
  contextTtlMs: AI_COMPETITION_CONTEXT_TTL_MS,
  getAllPlayers: () => [...players.values()],
  onlineHumanPlayerCount,
  latestRuntimeVitalsSample,
  pendingAuthVerifications: () => authPressureState.pendingAuthVerifications,
  authPriorityUntil: () => authPressureState.authPriorityUntil,
  aiQueueDepth: () => aiWorkerState.queue.length,
  simulationQueueDepth: simulationCommandQueueDepth,
  humanChunkSnapshotPriorityActive,
  humanFrontierActionPriorityActive,
  collectCompetitionMetrics: collectPlayerCompetitionMetrics,
  incomeForMetric: (metric) => metric.incomePerMinute,
  playerIdForMetric: (metric) => metric.playerId,
  computeTargets: () => ({
    townsTarget: Math.max(1, Math.ceil(Math.max(1, townsByTile.size) * SEASON_VICTORY_TOWN_CONTROL_SHARE)),
    settledTilesTarget: Math.max(1, Math.ceil(claimableLandTileCount() * SEASON_VICTORY_SETTLED_TERRITORY_SHARE))
  }),
  createTickContext: (cycleId, context) => ({
    cycleId,
    competitionMetrics: context.competitionMetrics,
    incomeByPlayerId: context.incomeByPlayerId,
    townsTarget: context.townsTarget,
    settledTilesTarget: context.settledTilesTarget,
    analysisByPlayerId: context.analysisByPlayerId
  }),
  enqueueAiWorkerJob,
  runtimeMemoryStats,
  pushAiTickPerf: (sample) => {
    recentAiTickPerf.push(sample);
  },
  onSlowAiTick: ({ elapsedMs, wallElapsedMs, aiPlayers, totalAiPlayers, queueDepth, cycleId, memory }) => {
    app.log.warn(
      {
        elapsedMs,
        wallElapsedMs,
        aiPlayers,
        totalAiPlayers,
        queueDepth,
        cycleId,
        ...memory
      },
      "slow ai tick"
    );
  }
});

const {
  currentSeasonWinner,
  isFinalPushActive,
  pushStrategicReplayEvent,
  refreshGlobalStatusCache,
  currentLeaderboardSnapshot,
  currentVictoryPressureObjectives,
  leaderboardSnapshotForPlayer,
  seasonVictoryObjectivesForPlayer,
  broadcastGlobalStatusUpdate,
  broadcastVictoryPressureUpdate,
  evaluateVictoryPressure
} = createServerVictoryPressure({
  now,
  townsByTile,
  SEASON_VICTORY_TOWN_CONTROL_SHARE,
  SEASON_VICTORY_SETTLED_TERRITORY_SHARE,
  VICTORY_PRESSURE_DEFS,
  players,
  HOLD_START_BROADCAST_DELAY_MS,
  HOLD_REMAINING_BROADCAST_HOURS,
  FINAL_PUSH_MS,
  crypto,
  strategicReplayEvents,
  STRATEGIC_REPLAY_LIMIT,
  broadcast,
  sendToPlayer,
  GLOBAL_STATUS_CACHE_TTL_MS,
  getSeasonWinner: () => seasonWinner,
  setSeasonWinner: (winner: SeasonWinnerView | undefined) => {
    seasonWinner = winner;
  },
  getActiveSeason: () => activeSeason,
  victoryPressureById,
  uniqueLeader,
  leadingPair,
  computeLeaderboardSnapshot,
  collectPlayerCompetitionMetrics,
  worldResourceTileCounts,
  controlledResourceTileCounts,
  islandLandCounts,
  claimableLandTileCount,
  continentalFootprintProgressForPlayer,
  SEASON_VICTORY_ECONOMY_MIN_INCOME,
  SEASON_VICTORY_ECONOMY_LEAD_MULT
});

const {
  reachableTechs,
  techDepth,
  playerWorldFlags,
  techRequirements,
  techChecklistFor,
  activeTechCatalog,
  empireStyleFromPlayer,
  domainCostResources,
  chosenDomainTierMax,
  domainChecklistFor,
  reachableDomains,
  activeDomainCatalog,
  applyDomain
} = createServerTechDomainRuntime({
  TECHS,
  activeSeasonTechConfig,
  getActiveSeasonTechConfig: () => activeSeasonTechConfig,
  techById,
  domainById,
  ownershipStateByTile,
  parseKey,
  runtimeTileCore,
  docksByTile,
  townsByTile,
  getOrInitStrategicStocks,
  recomputeTechModsFromOwnedTechs,
  telemetryCounters,
  DOMAINS,
  colorFromId
});

const grantTech = (player: Player, tech: (typeof TECHS)[number]): void => {
  player.techIds.add(tech.id);
  recomputeTechModsFromOwnedTechs(player);
  if (tech.grantsPowerup) {
    player.powerups[tech.grantsPowerup.id] = (player.powerups[tech.grantsPowerup.id] ?? 0) + tech.grantsPowerup.charges;
  }
  telemetryCounters.techUnlocks += 1;
};

const startTechResearch = (player: Player, techId: string): { ok: boolean; reason?: string; tech?: (typeof TECHS)[number] } => {
  const tech = techById.get(techId);
  if (!tech) return { ok: false, reason: "tech not found" };
  if (!activeSeasonTechConfig.activeNodeIds.has(techId)) return { ok: false, reason: "tech is not active this season" };
  if (player.techIds.has(techId)) return { ok: false, reason: "tech already selected" };
  if (hasActiveResearch(player)) return { ok: false, reason: "research already in progress" };
  const prereqs = tech.prereqIds && tech.prereqIds.length > 0 ? tech.prereqIds : tech.requires ? [tech.requires] : [];
  for (const req of prereqs) {
    if (!player.techIds.has(req)) {
      return { ok: false, reason: `required parent tech missing: ${req}` };
    }
  }
  const checklist = techChecklistFor(player, tech);
  if (!checklist.ok) {
    const miss = checklist.checks.find((c) => !c.met);
    return { ok: false, reason: `requirements not met: ${miss?.label ?? "unknown"}` };
  }
  player.points = Math.max(0, player.points - checklist.gold);
  const stock = getOrInitStrategicStocks(player.id);
  for (const [r, amount] of Object.entries(checklist.resources) as Array<[StrategicResource, number]>) {
    stock[r] = Math.max(0, stock[r] - amount);
  }
  delete player.currentResearch;
  grantTech(player, tech);
  return { ok: true, tech };
};

const sendTechUpdate = (player: Player, status: "started" | "completed"): void => {
  const techPayload = techPayloadSnapshotForPlayer(player, "tech_update");
  sendToPlayer(player.id, {
    type: "TECH_UPDATE",
    status,
    techRootId: player.techRootId,
    currentResearch: player.currentResearch,
    techIds: [...player.techIds],
    developmentProcessLimit: developmentProcessCapacityForPlayer(player.id),
    activeDevelopmentProcessCount: activeDevelopmentProcessCountForPlayer(player.id),
    mods: player.mods,
    modBreakdown: playerModBreakdown(player),
    incomePerMinute: currentIncomePerMinute(player),
    powerups: player.powerups,
    nextChoices: techPayload.techChoices,
    availableTechPicks: availableTechPicks(player),
    missions: missionPayload(player),
    techCatalog: techPayload.techCatalog,
    domainChoices: reachableDomains(player),
    domainCatalog: activeDomainCatalog(player),
    domainIds: [...player.domainIds],
    revealCapacity: revealCapacityForPlayer(player),
    activeRevealTargets: [...getOrInitRevealTargets(player.id)]
  });
};

const completeDueResearchForPlayer = (_player: Player): void => {};

const activeDevelopmentProcessCountForPlayer = (playerId: string): number => {
  let n = 0;
  for (const pending of pendingSettlementsByTile.values()) {
    if (pending.ownerId === playerId) n += 1;
  }
  for (const fort of fortsByTile.values()) {
    if (fort.ownerId === playerId && (fort.status === "under_construction" || fort.status === "removing")) n += 1;
  }
  for (const observatory of observatoriesByTile.values()) {
    if (observatory.ownerId === playerId && (observatory.status === "under_construction" || observatory.status === "removing")) n += 1;
  }
  for (const siege of siegeOutpostsByTile.values()) {
    if (siege.ownerId === playerId && (siege.status === "under_construction" || siege.status === "removing")) n += 1;
  }
  for (const structure of economicStructuresByTile.values()) {
    if (structure.ownerId === playerId && (structure.status === "under_construction" || structure.status === "removing")) n += 1;
  }
  return n;
};

const developmentProcessDebugBreakdownForPlayer = (playerId: string): Record<string, unknown> => {
  const pendingSettlementKeys: string[] = [];
  const fortKeys: string[] = [];
  const observatoryKeys: string[] = [];
  const siegeOutpostKeys: string[] = [];
  const economicStructureKeys: string[] = [];
  for (const pending of pendingSettlementsByTile.values()) {
    if (pending.ownerId === playerId) pendingSettlementKeys.push(pending.tileKey);
  }
  for (const fort of fortsByTile.values()) {
    if (fort.ownerId === playerId && (fort.status === "under_construction" || fort.status === "removing")) fortKeys.push(fort.tileKey);
  }
  for (const observatory of observatoriesByTile.values()) {
    if (observatory.ownerId === playerId && (observatory.status === "under_construction" || observatory.status === "removing")) {
      observatoryKeys.push(observatory.tileKey);
    }
  }
  for (const siege of siegeOutpostsByTile.values()) {
    if (siege.ownerId === playerId && (siege.status === "under_construction" || siege.status === "removing")) {
      siegeOutpostKeys.push(siege.tileKey);
    }
  }
  for (const structure of economicStructuresByTile.values()) {
    if (structure.ownerId === playerId && (structure.status === "under_construction" || structure.status === "removing")) {
      economicStructureKeys.push(structure.tileKey);
    }
  }
  return {
    developmentProcessLimit: developmentProcessCapacityForPlayer(playerId),
    activeDevelopmentProcessCount:
      pendingSettlementKeys.length + fortKeys.length + observatoryKeys.length + siegeOutpostKeys.length + economicStructureKeys.length,
    pendingSettlementCount: pendingSettlementKeys.length,
    pendingSettlementKeys,
    fortCount: fortKeys.length,
    fortKeys,
    observatoryCount: observatoryKeys.length,
    observatoryKeys,
    siegeOutpostCount: siegeOutpostKeys.length,
    siegeOutpostKeys,
    economicStructureCount: economicStructureKeys.length,
    economicStructureKeys
  };
};

const developmentProcessCapacityForPlayer = (playerId: string): number =>
  Math.max(1, DEVELOPMENT_PROCESS_LIMIT + getPlayerEffectsForPlayer(playerId).developmentProcessCapacityAdd);

const canStartDevelopmentProcess = (playerId: string): boolean =>
  activeDevelopmentProcessCountForPlayer(playerId) < developmentProcessCapacityForPlayer(playerId);

const developmentSlotsBusyReason = (playerId: string): string =>
  `all ${developmentProcessCapacityForPlayer(playerId)} development slots are busy`;

const isBorderTile = (x: number, y: number, ownerId: string): boolean => {
  const n = cardinalNeighborCores(x, y);
  return n.some((t) => t.terrain === "LAND" && t.ownerId !== ownerId && !(t.ownerId && isAlly(ownerId, t.ownerId)));
};

const cancelFortBuild = (tileKey: TileKey): void => {
  const timer = fortBuildTimers.get(tileKey);
  if (timer) clearTimeout(timer);
  fortBuildTimers.delete(tileKey);
  const fort = fortsByTile.get(tileKey);
  if (fort?.status === "under_construction") {
    fortsByTile.delete(tileKey);
    const [x, y] = parseKey(tileKey);
    markSummaryChunkDirtyAtTile(x, y);
    return;
  }
  if (fort?.status === "removing") {
    fort.status = fort.previousStatus ?? "active";
    delete fort.previousStatus;
    delete fort.completesAt;
    const [x, y] = parseKey(tileKey);
    markSummaryChunkDirtyAtTile(x, y);
  }
};

const cancelSiegeOutpostBuild = (tileKey: TileKey): void => {
  const timer = siegeOutpostBuildTimers.get(tileKey);
  if (timer) clearTimeout(timer);
  siegeOutpostBuildTimers.delete(tileKey);
  const siege = siegeOutpostsByTile.get(tileKey);
  if (siege?.status === "under_construction") {
    siegeOutpostsByTile.delete(tileKey);
    const [x, y] = parseKey(tileKey);
    markSummaryChunkDirtyAtTile(x, y);
    return;
  }
  if (siege?.status === "removing") {
    siege.status = siege.previousStatus ?? "active";
    delete siege.previousStatus;
    delete siege.completesAt;
    const [x, y] = parseKey(tileKey);
    markSummaryChunkDirtyAtTile(x, y);
  }
};

const cancelObservatoryBuild = (tileKey: TileKey): void => {
  const timer = observatoryBuildTimers.get(tileKey);
  if (timer) clearTimeout(timer);
  observatoryBuildTimers.delete(tileKey);
  const observatory = observatoriesByTile.get(tileKey);
  if (observatory?.status === "under_construction") {
    untrackOwnedTileKey(observatoryTileKeysByPlayer, observatory.ownerId, tileKey);
    observatoriesByTile.delete(tileKey);
    const [x, y] = parseKey(tileKey);
    markSummaryChunkDirtyAtTile(x, y);
    markVisibilityDirty(observatory.ownerId);
    return;
  }
  if (observatory?.status === "removing") {
    observatory.status = observatory.previousStatus ?? "active";
    delete observatory.previousStatus;
    delete observatory.completesAt;
    const [x, y] = parseKey(tileKey);
    markSummaryChunkDirtyAtTile(x, y);
    markVisibilityDirty(observatory.ownerId);
  }
};

const cancelEconomicStructureBuild = (tileKey: TileKey): void => {
  const timer = economicStructureBuildTimers.get(tileKey);
  if (timer) clearTimeout(timer);
  economicStructureBuildTimers.delete(tileKey);
  const structure = economicStructuresByTile.get(tileKey);
  if (structure?.status === "under_construction") {
    untrackOwnedTileKey(economicStructureTileKeysByPlayer, structure.ownerId, tileKey);
    economicStructuresByTile.delete(tileKey);
    const [x, y] = parseKey(tileKey);
    markSummaryChunkDirtyAtTile(x, y);
    return;
  }
  if (structure?.status === "removing") {
    structure.status = structure.previousStatus ?? "inactive";
    delete structure.previousStatus;
    delete structure.completesAt;
    const [x, y] = parseKey(tileKey);
    markSummaryChunkDirtyAtTile(x, y);
  }
};

const cancelInProgressBuildForPlayer = (
  actor: Player,
  tileKey: TileKey
): { ok: true } | { ok: false; code: string; message: string } => {
  const fort = fortsByTile.get(tileKey);
  if (fort?.ownerId === actor.id && (fort.status === "under_construction" || fort.status === "removing")) {
    cancelFortBuild(tileKey);
    return { ok: true };
  }
  const observatory = observatoriesByTile.get(tileKey);
  if (observatory?.ownerId === actor.id && (observatory?.status === "under_construction" || observatory?.status === "removing")) {
    cancelObservatoryBuild(tileKey);
    return { ok: true };
  }
  const siege = siegeOutpostsByTile.get(tileKey);
  if (siege?.ownerId === actor.id && (siege.status === "under_construction" || siege.status === "removing")) {
    cancelSiegeOutpostBuild(tileKey);
    return { ok: true };
  }
  const structure = economicStructuresByTile.get(tileKey);
  if (structure?.ownerId === actor.id && (structure.status === "under_construction" || structure.status === "removing")) {
    cancelEconomicStructureBuild(tileKey);
    return { ok: true };
  }
  return { ok: false, code: "STRUCTURE_CANCEL_INVALID", message: "no removable structure action on tile" };
};

const completeEconomicStructureRemoval = (tileKey: TileKey): void => {
  const structure = economicStructuresByTile.get(tileKey);
  if (!structure || structure.status !== "removing") return;
  economicStructureBuildTimers.delete(tileKey);
  untrackOwnedTileKey(economicStructureTileKeysByPlayer, structure.ownerId, tileKey);
  economicStructuresByTile.delete(tileKey);
  const [x, y] = parseKey(tileKey);
  markSummaryChunkDirtyAtTile(x, y);
  updateOwnership(x, y, structure.ownerId);
};

const completeFortRemoval = (tileKey: TileKey): void => {
  const fort = fortsByTile.get(tileKey);
  if (!fort || fort.status !== "removing") return;
  fortBuildTimers.delete(tileKey);
  fortsByTile.delete(tileKey);
  const [x, y] = parseKey(tileKey);
  markSummaryChunkDirtyAtTile(x, y);
  updateOwnership(x, y, fort.ownerId);
};

const completeObservatoryRemoval = (tileKey: TileKey): void => {
  const observatory = observatoriesByTile.get(tileKey);
  if (!observatory || observatory.status !== "removing") return;
  observatoryBuildTimers.delete(tileKey);
  untrackOwnedTileKey(observatoryTileKeysByPlayer, observatory.ownerId, tileKey);
  observatoriesByTile.delete(tileKey);
  const [x, y] = parseKey(tileKey);
  markSummaryChunkDirtyAtTile(x, y);
  markVisibilityDirty(observatory.ownerId);
  updateOwnership(x, y, observatory.ownerId);
};

const completeSiegeOutpostRemoval = (tileKey: TileKey): void => {
  const siege = siegeOutpostsByTile.get(tileKey);
  if (!siege || siege.status !== "removing") return;
  siegeOutpostBuildTimers.delete(tileKey);
  siegeOutpostsByTile.delete(tileKey);
  const [x, y] = parseKey(tileKey);
  markSummaryChunkDirtyAtTile(x, y);
  updateOwnership(x, y, siege.ownerId);
};

const tryRemoveStructure = (actor: Player, x: number, y: number): { ok: boolean; reason?: string } => {
  const t = playerTile(x, y);
  const tk = key(t.x, t.y);
  if (t.terrain !== "LAND" || t.ownerId !== actor.id || t.ownershipState !== "SETTLED") return { ok: false, reason: "structure requires settled owned tile" };
  const fort = fortsByTile.get(tk);
  if (fort?.ownerId === actor.id) {
    if (fort.status === "under_construction") return { ok: false, reason: "cancel construction instead" };
    if (fort.status === "removing") return { ok: false, reason: "structure is already being removed" };
  }
  const observatory = observatoriesByTile.get(tk);
  if (observatory && observatory.ownerId === actor.id) {
    if (observatory.status === "under_construction") return { ok: false, reason: "cancel construction instead" };
    if (observatory.status === "removing") return { ok: false, reason: "structure is already being removed" };
  }
  const siege = siegeOutpostsByTile.get(tk);
  if (siege?.ownerId === actor.id) {
    if (siege.status === "under_construction") return { ok: false, reason: "cancel construction instead" };
    if (siege.status === "removing") return { ok: false, reason: "structure is already being removed" };
  }
  const structure = economicStructuresByTile.get(tk);
  if (structure?.ownerId === actor.id) {
    if (structure.status === "under_construction") return { ok: false, reason: "cancel construction instead" };
    if (structure.status === "removing") return { ok: false, reason: "structure is already being removed" };
  }
  if ((!fort || fort.ownerId !== actor.id) && (!observatory || observatory.ownerId !== actor.id) && (!siege || siege.ownerId !== actor.id) && (!structure || structure.ownerId !== actor.id)) {
    return { ok: false, reason: "no owned structure on tile" };
  }
  if (!canStartDevelopmentProcess(actor.id)) return { ok: false, reason: developmentSlotsBusyReason(actor.id) };
  if (fort?.ownerId === actor.id) {
    const removeDurationMs = structureBuildDurationMsForRuntime("FORT");
    fort.previousStatus = "active";
    fort.status = "removing";
    fort.completesAt = now() + removeDurationMs;
    markSummaryChunkDirtyAtTile(x, y);
    const timer = setTimeout(() => completeFortRemoval(tk), removeDurationMs);
    fortBuildTimers.set(tk, timer);
    return { ok: true };
  }
  if (observatory && observatory.ownerId === actor.id) {
    const removeDurationMs = structureBuildDurationMsForRuntime("OBSERVATORY");
    observatory.previousStatus = observatory.status === "inactive" ? "inactive" : "active";
    observatory.status = "removing";
    observatory.completesAt = now() + removeDurationMs;
    markSummaryChunkDirtyAtTile(x, y);
    markVisibilityDirty(actor.id);
    const timer = setTimeout(() => completeObservatoryRemoval(tk), removeDurationMs);
    observatoryBuildTimers.set(tk, timer);
    return { ok: true };
  }
  if (siege?.ownerId === actor.id) {
    const removeDurationMs = structureBuildDurationMsForRuntime("SIEGE_OUTPOST");
    siege.previousStatus = "active";
    siege.status = "removing";
    siege.completesAt = now() + removeDurationMs;
    markSummaryChunkDirtyAtTile(x, y);
    const timer = setTimeout(() => completeSiegeOutpostRemoval(tk), removeDurationMs);
    siegeOutpostBuildTimers.set(tk, timer);
    return { ok: true };
  }
  if (!structure || structure.ownerId !== actor.id) return { ok: false, reason: "no owned structure on tile" };
  const removeDurationMs = structureBuildDurationMsForRuntime(structure.type);
  structure.previousStatus = structure.status === "inactive" ? "inactive" : "active";
  structure.status = "removing";
  structure.completesAt = now() + removeDurationMs;
  markSummaryChunkDirtyAtTile(x, y);
  const timer = setTimeout(() => completeEconomicStructureRemoval(tk), removeDurationMs);
  economicStructureBuildTimers.set(tk, timer);
  return { ok: true };
};

const tryOverloadSynthesizer = (actor: Player, x: number, y: number): { ok: boolean; reason?: string } => {
  const effects = getPlayerEffectsForPlayer(actor.id);
  if (!effects.unlockSynthOverload) return { ok: false, reason: "unlock synthesizer overload via Overload Protocols first" };
  const tk = key(wrapX(x, WORLD_WIDTH), wrapY(y, WORLD_HEIGHT));
  const structure = economicStructuresByTile.get(tk);
  if (!structure || structure.ownerId !== actor.id) return { ok: false, reason: "no owned synthesizer on tile" };
  if (
    structure.type !== "FUR_SYNTHESIZER" &&
    structure.type !== "ADVANCED_FUR_SYNTHESIZER" &&
    structure.type !== "IRONWORKS" &&
    structure.type !== "ADVANCED_IRONWORKS" &&
    structure.type !== "CRYSTAL_SYNTHESIZER" &&
    structure.type !== "ADVANCED_CRYSTAL_SYNTHESIZER"
  ) {
    return { ok: false, reason: "only synthesizer structures can overload" };
  }
  if (structure.status === "under_construction" || structure.status === "removing") return { ok: false, reason: "synthesizer is not ready" };
  if (structure.disabledUntil && structure.disabledUntil > now()) return { ok: false, reason: "synthesizer is recovering from overload" };
  if (actor.points < SYNTH_OVERLOAD_GOLD_COST) return { ok: false, reason: "insufficient gold for synthesizer overload" };
  actor.points -= SYNTH_OVERLOAD_GOLD_COST;
  const stock = getOrInitStrategicStocks(actor.id);
  if (structure.type === "FUR_SYNTHESIZER" || structure.type === "ADVANCED_FUR_SYNTHESIZER") {
    stock.SUPPLY = (stock.SUPPLY ?? 0) + FUR_SYNTHESIZER_OVERLOAD_SUPPLY;
  } else if (structure.type === "IRONWORKS" || structure.type === "ADVANCED_IRONWORKS") {
    stock.IRON = (stock.IRON ?? 0) + IRONWORKS_OVERLOAD_IRON;
  } else {
    stock.CRYSTAL = (stock.CRYSTAL ?? 0) + CRYSTAL_SYNTHESIZER_OVERLOAD_CRYSTAL;
  }
  structure.status = "inactive";
  delete structure.inactiveReason;
  structure.disabledUntil = now() + SYNTH_OVERLOAD_DISABLE_MS;
  structure.nextUpkeepAt = structure.disabledUntil;
  recalcPlayerDerived(actor);
  const [wx, wy] = parseKey(tk);
  markSummaryChunkDirtyAtTile(wx, wy);
  return { ok: true };
};

const trySetConverterStructureEnabled = (actor: Player, x: number, y: number, enabled: boolean): { ok: boolean; reason?: string } => {
  const tk = key(wrapX(x, WORLD_WIDTH), wrapY(y, WORLD_HEIGHT));
  const structure = economicStructuresByTile.get(tk);
  if (!structure || structure.ownerId !== actor.id) return { ok: false, reason: "no owned converter on tile" };
  if (!isConverterStructureType(structure.type)) return { ok: false, reason: "only converter structures can be toggled" };
  if (structure.status === "under_construction" || structure.status === "removing") return { ok: false, reason: "converter is not ready" };
  if (structure.disabledUntil && structure.disabledUntil > now()) return { ok: false, reason: "converter is recovering from overload" };
  const [wx, wy] = parseKey(tk);
  const tile = playerTile(wx, wy);
  if (enabled) {
    if (tile.ownerId !== actor.id || tile.ownershipState !== "SETTLED") return { ok: false, reason: "converter requires settled owned tile" };
    const upkeep = economicStructureGoldUpkeepPerInterval(structure.type);
    if (actor.points < upkeep) return { ok: false, reason: "insufficient gold for converter upkeep" };
    actor.points -= upkeep;
    structure.status = "active";
    delete structure.inactiveReason;
  } else {
    structure.status = "inactive";
    structure.inactiveReason = "manual";
  }
  structure.nextUpkeepAt = now() + ECONOMIC_STRUCTURE_UPKEEP_INTERVAL_MS;
  recalcPlayerDerived(actor);
  markSummaryChunkDirtyAtTile(wx, wy);
  return { ok: true };
};

const consumeStrategicResource = (player: Player, resource: StrategicResource, amount: number): boolean => {
  const stock = getOrInitStrategicStocks(player.id);
  if ((stock[resource] ?? 0) < amount) return false;
  stock[resource] -= amount;
  return true;
};

const clearPendingSettlement = (settlement: PendingSettlement): void => {
  settlement.cancelled = true;
  if (settlement.timeout) clearTimeout(settlement.timeout);
  pendingSettlementsByTile.delete(settlement.tileKey);
};

const refundPendingSettlement = (settlement: PendingSettlement): void => {
  const player = players.get(settlement.ownerId);
  if (!player) return;
  player.points += settlement.goldCost;
  recalcPlayerDerived(player);
};

const resolvePendingSettlement = (settlement: PendingSettlement): void => {
  if (settlement.cancelled) return;
  const startedAt = now();
  pendingSettlementsByTile.delete(settlement.tileKey);
  const [x, y] = parseKey(settlement.tileKey);
  const liveActor = players.get(settlement.ownerId);
  if (!liveActor) return;
  const live = runtimeTileCore(x, y);
  logTileSync("settlement_resolving", {
    playerId: settlement.ownerId,
    tileKey: settlement.tileKey,
    liveOwnerId: live.ownerId,
    liveOwnershipState: live.ownershipState,
    resolvesAt: settlement.resolvesAt,
    ...developmentProcessDebugBreakdownForPlayer(settlement.ownerId)
  });
  if (live.ownerId !== liveActor.id) {
    const capturedByEnemy = Boolean(live.ownerId && live.ownerId !== liveActor.id);
    if (!capturedByEnemy) {
      refundPendingSettlement(settlement);
      sendToPlayer(liveActor.id, { type: "ERROR", code: "SETTLE_INVALID", message: "settlement cancelled and gold returned", x, y });
    } else {
      sendToPlayer(liveActor.id, { type: "ERROR", code: "SETTLE_INVALID", message: "tile captured during settlement; gold forfeited", x, y });
    }
    sendPlayerUpdate(liveActor, 0);
    recordHotPathTimingEvent(
      "settlement_resolve_timing",
      {
        playerId: liveActor.id,
        tileKey: settlement.tileKey,
        x,
        y,
        outcome: capturedByEnemy ? "captured_by_enemy" : "cancelled_refund",
        liveOwnerId: live.ownerId,
        liveOwnershipState: live.ownershipState
      },
      now() - startedAt,
      30
    );
    return;
  }
  if (live.ownershipState !== "FRONTIER") {
    refundPendingSettlement(settlement);
    sendToPlayer(liveActor.id, { type: "ERROR", code: "SETTLE_INVALID", message: "settlement cancelled and gold returned", x, y });
    sendPlayerUpdate(liveActor, 0);
    recordHotPathTimingEvent(
      "settlement_resolve_timing",
      {
        playerId: liveActor.id,
        tileKey: settlement.tileKey,
        x,
        y,
        outcome: "cancelled_not_frontier",
        liveOwnerId: live.ownerId,
        liveOwnershipState: live.ownershipState
      },
      now() - startedAt,
      30
    );
    return;
  }
  const ownershipStartedAt = now();
  updateOwnership(x, y, liveActor.id, "SETTLED");
  const updateOwnershipMs = now() - ownershipStartedAt;
  logTileSync("settlement_applied", {
    playerId: liveActor.id,
    tileKey: settlement.tileKey,
    ownerId: liveActor.id,
    ownershipState: "SETTLED",
    ...developmentProcessDebugBreakdownForPlayer(liveActor.id)
  });
  const revealStartedAt = now();
  const linkedDockRevealTileKeys = revealLinkedDocksForPlayer(liveActor.id, settlement.tileKey);
  syncForcedRevealTileUpdatesForPlayer(liveActor.id, linkedDockRevealTileKeys, {
    parseKey,
    playerTile,
    sendBulkToPlayer
  });
  const revealMs = now() - revealStartedAt;
  recordFrontierSettlementForPressure(liveActor.id);
  const effects = getPlayerEffectsForPlayer(liveActor.id);
  if (effects.newSettlementDefenseMult > 1) {
    settlementDefenseByTile.set(settlement.tileKey, {
      ownerId: liveActor.id,
      expiresAt: now() + NEW_SETTLEMENT_DEFENSE_MS,
      mult: effects.newSettlementDefenseMult
    });
  }
  const resultStartedAt = now();
  sendToPlayer(liveActor.id, {
    type: "COMBAT_RESULT",
    attackType: "SETTLE",
    attackerWon: true,
    winnerId: liveActor.id,
    target: { x, y },
    changes: [{ x, y, ownerId: liveActor.id, ownershipState: "SETTLED" }],
    pointsDelta: 0,
    levelDelta: 0
  });
  const sendResultMs = now() - resultStartedAt;
  const playerUpdateStartedAt = now();
  sendPlayerUpdate(liveActor, 0);
  const playerUpdateMs = now() - playerUpdateStartedAt;
  telemetryCounters.settlements += 1;
  recordHotPathTimingEvent(
    "settlement_resolve_timing",
    {
      playerId: liveActor.id,
      tileKey: settlement.tileKey,
      x,
      y,
      outcome: "settled",
      updateOwnershipMs,
      revealMs,
      sendResultMs,
      playerUpdateMs,
      linkedDockRevealTileCount: linkedDockRevealTileKeys.length
    },
    now() - startedAt,
    30
  );
};

const schedulePendingSettlementResolution = (settlement: PendingSettlement): void => {
  const remaining = Math.max(0, settlement.resolvesAt - now());
  settlement.timeout = setTimeout(() => resolvePendingSettlement(settlement), remaining);
};

const startSettlement = (
  actor: Player,
  x: number,
  y: number,
  opts?: { goldCost?: number; settleMs?: number }
): { ok: boolean; reason?: string; resolvesAt?: number } => {
  const goldCost = opts?.goldCost ?? SETTLE_COST;
  const effects = getPlayerEffectsForPlayer(actor.id);
  const baseSettleMs = (opts?.settleMs ?? SETTLE_MS) * (isForestFrontierTile(x, y) ? FOREST_SETTLEMENT_MULT : 1);
  const settleMs = Math.max(250, Math.round(baseSettleMs / effects.settlementSpeedMult));
  const t = playerTile(x, y);
  logTileSync("settlement_requested", {
    playerId: actor.id,
    tileKey: key(wrapX(x, WORLD_WIDTH), wrapY(y, WORLD_HEIGHT)),
    ownerId: t.ownerId,
    ownershipState: t.ownershipState,
    ...developmentProcessDebugBreakdownForPlayer(actor.id)
  });
  if (t.terrain !== "LAND") return { ok: false, reason: "settlement requires land tile" };
  if (t.ownerId !== actor.id) return { ok: false, reason: "tile must be owned" };
  if (t.ownershipState !== "FRONTIER") return { ok: false, reason: "tile is already settled" };
  if (!canAffordGoldCost(actor.points, goldCost)) return { ok: false, reason: "insufficient gold to settle" };
  const tk = key(t.x, t.y);
  if (pendingSettlementsByTile.has(tk)) return { ok: false, reason: "tile already settling" };
  if (combatLocks.has(tk)) return { ok: false, reason: "tile is locked in combat" };
  if (!canStartDevelopmentProcess(actor.id)) {
    logTileSync("settlement_slot_busy", {
      playerId: actor.id,
      tileKey: tk,
      ...developmentProcessDebugBreakdownForPlayer(actor.id)
    });
    return { ok: false, reason: developmentSlotsBusyReason(actor.id) };
  }

  const startedAt = now();
  const resolvesAt = startedAt + settleMs;
  actor.points -= goldCost;
  recalcPlayerDerived(actor);
  const pending: PendingSettlement = {
    tileKey: tk,
    ownerId: actor.id,
    startedAt,
    resolvesAt,
    goldCost,
    cancelled: false
  };
  pendingSettlementsByTile.set(tk, pending);
  logTileSync("settlement_started", {
    playerId: actor.id,
    tileKey: tk,
    startedAt,
    resolvesAt,
    ...developmentProcessDebugBreakdownForPlayer(actor.id)
  });
  schedulePendingSettlementResolution(pending);
  sendPlayerUpdate(actor, 0);
  return { ok: true, resolvesAt };
};

const hasRevealCapability = (player: Player): boolean => {
  return playerHasTechIds(player, ABILITY_DEFS.reveal_empire.requiredTechIds) || getOrInitRevealTargets(player.id).size > 0;
};

const tryActivateRevealEmpire = (actor: Player, targetPlayerId: string): { ok: boolean; reason?: string } => {
  if (!hasRevealCapability(actor)) return { ok: false, reason: "unlock reveal capability via tech/domain first" };
  if (targetPlayerId === actor.id) return { ok: false, reason: "cannot reveal yourself" };
  const target = players.get(targetPlayerId);
  if (!target) return { ok: false, reason: "target empire not found" };
  if (actor.allies.has(targetPlayerId) || truceBlocksHostility(actor.id, targetPlayerId)) return { ok: false, reason: "cannot reveal allied or truced empire" };
  const reveals = getOrInitRevealTargets(actor.id);
  if (reveals.has(targetPlayerId)) {
    setRevealTargetsForPlayer(actor.id, []);
    return { ok: true };
  }
  if (abilityOnCooldown(actor.id, "reveal_empire")) return { ok: false, reason: "reveal empire is cooling down" };
  if (reveals.size >= 1) return { ok: false, reason: "only one revealed empire allowed" };
  const stock = getOrInitStrategicStocks(actor.id);
  if ((stock.CRYSTAL ?? 0) < REVEAL_EMPIRE_ACTIVATION_COST) return { ok: false, reason: "insufficient crystal to activate reveal" };
  stock.CRYSTAL = Math.max(0, (stock.CRYSTAL ?? 0) - REVEAL_EMPIRE_ACTIVATION_COST);
  setRevealTargetsForPlayer(actor.id, [targetPlayerId]);
  return { ok: true };
};

const coastalSettledOriginsForPlayer = (playerId: string): TileKey[] => {
  const out: TileKey[] = [];
  for (const tk of players.get(playerId)?.territoryTiles ?? []) {
    const [x, y] = parseKey(tk);
    const tile = playerTile(x, y);
    if (tile.ownerId !== playerId || tile.ownershipState !== "SETTLED" || tile.terrain !== "LAND") continue;
    if (!isCoastalLand(x, y)) continue;
    out.push(tk);
  }
  return out;
};

const seaTileCountBetween = (ax: number, ay: number, bx: number, by: number): number | undefined => {
  const steps = lineTilesBetween(ax, ay, bx, by);
  if (steps.length === 0) return undefined;
  let seaTiles = 0;
  for (const step of steps) {
    const terrain = terrainAtRuntime(step.x, step.y);
    if (terrain !== "SEA") return undefined;
    seaTiles += 1;
  }
  return seaTiles;
};

const closestAetherBridgeOrigin = (actor: Player, targetX: number, targetY: number): { originTileKey: TileKey; seaTiles: number } | undefined => {
  let best: { originTileKey: TileKey; seaTiles: number; distance: number } | undefined;
  for (const originTileKey of coastalSettledOriginsForPlayer(actor.id)) {
    const [ox, oy] = parseKey(originTileKey);
    const seaTiles = seaTileCountBetween(ox, oy, targetX, targetY);
    if (seaTiles === undefined || seaTiles > AETHER_BRIDGE_MAX_SEA_TILES) continue;
    const distance = chebyshevDistance(ox, oy, targetX, targetY);
    if (!best || seaTiles < best.seaTiles || (seaTiles === best.seaTiles && distance < best.distance)) {
      best = { originTileKey, seaTiles, distance };
    }
  }
  return best ? { originTileKey: best.originTileKey, seaTiles: best.seaTiles } : undefined;
};

const tryCastAetherBridge = (actor: Player, x: number, y: number): { ok: boolean; reason?: string; bridge?: ActiveAetherBridge } => {
  if (!playerHasTechIds(actor, ABILITY_DEFS.aether_bridge.requiredTechIds)) return { ok: false, reason: "requires Aether Bridge" };
  if (abilityOnCooldown(actor.id, "aether_bridge")) return { ok: false, reason: "aether bridge is cooling down" };
  const target = playerTile(x, y);
  if (target.terrain !== "LAND" || !isCoastalLand(target.x, target.y)) return { ok: false, reason: "target must be coastal land" };
  if (target.ownerId && target.ownerId !== actor.id && !actor.allies.has(target.ownerId) && hostileObservatoryProtectingTile(actor, target.x, target.y)) {
    return { ok: false, reason: "landing blocked by enemy observatory" };
  }
  const origin = closestAetherBridgeOrigin(actor, target.x, target.y);
  if (!origin) return { ok: false, reason: "no settled coastal tile can reach this target" };
  if (!consumeStrategicResource(actor, "CRYSTAL", AETHER_BRIDGE_CRYSTAL_COST)) return { ok: false, reason: "insufficient CRYSTAL for aether bridge" };
  startAbilityCooldown(actor.id, "aether_bridge");
  const bridge: ActiveAetherBridge = {
    bridgeId: crypto.randomUUID(),
    ownerId: actor.id,
    fromTileKey: origin.originTileKey,
    toTileKey: key(target.x, target.y),
    startedAt: now(),
    endsAt: now() + AETHER_BRIDGE_DURATION_MS
  };
  activeAetherBridgesById.set(bridge.bridgeId, bridge);
  const [fromX, fromY] = parseKey(bridge.fromTileKey);
  const [toX, toY] = parseKey(bridge.toTileKey);
  pushStrategicReplayEvent({
    at: bridge.startedAt,
    type: "AETHER_BRIDGE",
    label: `${actor.name} opened an Aether Bridge`,
    playerId: actor.id,
    playerName: actor.name,
    from: { x: fromX, y: fromY },
    to: { x: toX, y: toY },
    isBookmark: true
  });
  return { ok: true, bridge };
};

const activeAetherBridgeForTarget = (ownerId: string, targetTileKey: TileKey): ActiveAetherBridge | undefined => {
  for (const bridge of activeAetherBridgesById.values()) {
    if (bridge.ownerId !== ownerId || bridge.endsAt <= now()) continue;
    if (bridge.toTileKey !== targetTileKey) continue;
    return bridge;
  }
  return undefined;
};

const buildEmpireStatsRevealForTarget = (target: Player): RevealEmpireStatsView => {
  const economy = playerEconomySnapshot(target);
  const strategicResources = getOrInitStrategicStocks(target.id);
  let settledTiles = 0;
  let frontierTiles = 0;
  let controlledTowns = 0;
  for (const tk of target.territoryTiles) {
    const tile = runtimeTileCore(...parseKey(tk));
    if (tile.ownerId !== target.id) continue;
    if (tile.ownershipState === "SETTLED") settledTiles += 1;
    else if (tile.ownershipState === "FRONTIER") frontierTiles += 1;
  }
  for (const town of townsByTile.values()) {
    const tile = runtimeTileCore(...parseKey(town.tileKey));
    if (tile.ownerId === target.id) controlledTowns += 1;
  }
  return buildRevealEmpireStatsView({
    playerId: target.id,
    playerName: target.name,
    revealedAt: now(),
    tiles: target.territoryTiles.size,
    settledTiles,
    frontierTiles,
    controlledTowns,
    incomePerMinute: economy.incomePerMinute,
    techCount: target.techIds.size,
    gold: target.points,
    manpower: target.manpower,
    manpowerCap: playerManpowerCap(target),
    strategicResources: {
      FOOD: strategicResources.FOOD ?? 0,
      IRON: strategicResources.IRON ?? 0,
      CRYSTAL: strategicResources.CRYSTAL ?? 0,
      SUPPLY: strategicResources.SUPPLY ?? 0,
      SHARD: strategicResources.SHARD ?? 0,
      OIL: strategicResources.OIL ?? 0
    }
  });
};

const tryRevealEmpireStats = (actor: Player, targetPlayerId: string): { ok: boolean; reason?: string; stats?: RevealEmpireStatsView } => {
  if (!playerHasTechIds(actor, ABILITY_DEFS.reveal_empire_stats.requiredTechIds)) return { ok: false, reason: "requires Surveying" };
  if (targetPlayerId === actor.id) return { ok: false, reason: "cannot reveal yourself" };
  const target = players.get(targetPlayerId);
  if (!target) return { ok: false, reason: "target empire not found" };
  if (actor.allies.has(targetPlayerId) || truceBlocksHostility(actor.id, targetPlayerId)) return { ok: false, reason: "cannot reveal allied or truced empire" };
  if (abilityOnCooldown(actor.id, "reveal_empire_stats")) return { ok: false, reason: "reveal empire stats is cooling down" };
  if (!consumeStrategicResource(actor, "CRYSTAL", REVEAL_EMPIRE_STATS_CRYSTAL_COST)) {
    return { ok: false, reason: "insufficient CRYSTAL for empire stats reveal" };
  }
  startAbilityCooldown(actor.id, "reveal_empire_stats");
  return { ok: true, stats: buildEmpireStatsRevealForTarget(target) };
};

const aetherWallView = (wall: ActiveAetherWall): ActiveAetherWallView => {
  const [originX, originY] = parseKey(wall.originTileKey);
  return {
    wallId: wall.wallId,
    ownerId: wall.ownerId,
    origin: { x: originX, y: originY },
    direction: wall.direction,
    length: wall.length,
    startedAt: wall.startedAt,
    endsAt: wall.endsAt
  };
};

const activeAetherWallViews = (): ActiveAetherWallView[] => [...activeAetherWallsById.values()].map(aetherWallView);

const registerAetherWallEdges = (wall: ActiveAetherWall): void => {
  const [originX, originY] = parseKey(wall.originTileKey);
  for (const segment of buildAetherWallSegments(originX, originY, wall.direction, wall.length, (x: number) => wrapX(x, WORLD_WIDTH), (y: number) => wrapY(y, WORLD_HEIGHT))) {
    const edgeKey = aetherWallEdgeKey(segment.fromX, segment.fromY, segment.toX, segment.toY);
    let wallIds = activeAetherWallIdsByEdgeKey.get(edgeKey);
    if (!wallIds) {
      wallIds = new Set<string>();
      activeAetherWallIdsByEdgeKey.set(edgeKey, wallIds);
    }
    wallIds.add(wall.wallId);
  }
};

const unregisterAetherWallEdges = (wall: ActiveAetherWall): void => {
  const [originX, originY] = parseKey(wall.originTileKey);
  for (const segment of buildAetherWallSegments(originX, originY, wall.direction, wall.length, (x: number) => wrapX(x, WORLD_WIDTH), (y: number) => wrapY(y, WORLD_HEIGHT))) {
    const edgeKey = aetherWallEdgeKey(segment.fromX, segment.fromY, segment.toX, segment.toY);
    const wallIds = activeAetherWallIdsByEdgeKey.get(edgeKey);
    if (!wallIds) continue;
    wallIds.delete(wall.wallId);
    if (wallIds.size === 0) activeAetherWallIdsByEdgeKey.delete(edgeKey);
  }
};

const crossingBlockedByAetherWall = (fromX: number, fromY: number, toX: number, toY: number): boolean =>
  activeAetherWallIdsByEdgeKey.has(aetherWallEdgeKey(fromX, fromY, toX, toY));

const broadcastAetherWallUpdate = (): void => {
  broadcastBulk({ type: "AETHER_WALL_UPDATE", walls: activeAetherWallViews() });
};

const tryCastAetherWall = (
  actor: Player,
  x: number,
  y: number,
  direction: AetherWallDirection,
  length: 1 | 2 | 3,
  options?: { ignoreRequirements?: boolean }
): { ok: boolean; reason?: string; wall?: ActiveAetherWall } => {
  const ignoreRequirements = options?.ignoreRequirements === true;
  if (!ignoreRequirements && !playerHasTechIds(actor, ABILITY_DEFS.aether_wall.requiredTechIds)) return { ok: false, reason: "requires Aether Moorings" };
  if (!ignoreRequirements && abilityOnCooldown(actor.id, "aether_wall")) return { ok: false, reason: "aether wall is cooling down" };
  const segments = buildAetherWallSegments(x, y, direction, length, (wx: number) => wrapX(wx, WORLD_WIDTH), (wy: number) => wrapY(wy, WORLD_HEIGHT));
  if (segments.length === 0) return { ok: false, reason: "invalid wall path" };
  for (const segment of segments) {
    const base = playerTile(segment.baseX, segment.baseY);
    if (base.terrain !== "LAND" || base.ownerId !== actor.id || (!ignoreRequirements && base.ownershipState !== "SETTLED")) {
      return { ok: false, reason: ignoreRequirements ? "wall must anchor on your land" : "wall must anchor on your settled land" };
    }
    const outward = playerTile(segment.toX, segment.toY);
    if (outward.terrain !== "LAND") return { ok: false, reason: "wall must face passable land" };
    if (outward.ownerId === actor.id) return { ok: false, reason: "wall must face outside your territory" };
    if (crossingBlockedByAetherWall(segment.fromX, segment.fromY, segment.toX, segment.toY)) {
      return { ok: false, reason: "that border already has an aether wall" };
    }
  }
  if (!ignoreRequirements && !consumeStrategicResource(actor, "CRYSTAL", AETHER_WALL_CRYSTAL_COST)) return { ok: false, reason: "insufficient CRYSTAL for aether wall" };
  if (!ignoreRequirements) startAbilityCooldown(actor.id, "aether_wall");
  const startedAt = now();
  const wall: ActiveAetherWall = {
    wallId: crypto.randomUUID(),
    ownerId: actor.id,
    originTileKey: key(x, y),
    direction,
    length,
    startedAt,
    endsAt: startedAt + AETHER_WALL_DURATION_MS
  };
  activeAetherWallsById.set(wall.wallId, wall);
  registerAetherWallEdges(wall);
  for (const segment of segments) {
    markSummaryChunkDirtyAtTile(segment.baseX, segment.baseY);
    markSummaryChunkDirtyAtTile(segment.toX, segment.toY);
  }
  return { ok: true, wall };
};

const trySiphonTile = (actor: Player, x: number, y: number): { ok: boolean; reason?: string } => {
  if (!playerHasTechIds(actor, ABILITY_DEFS.siphon.requiredTechIds)) return { ok: false, reason: "requires Logistics" };
  if (abilityOnCooldown(actor.id, "siphon")) return { ok: false, reason: "siphon is cooling down" };
  const t = playerTile(x, y);
  if (t.terrain !== "LAND") return { ok: false, reason: "siphon requires land tile" };
  if (!t.ownerId || t.ownerId === actor.id || actor.allies.has(t.ownerId) || truceBlocksHostility(actor.id, t.ownerId))
    return { ok: false, reason: "target enemy-controlled town or resource tile" };
  if (!t.town && !t.resource) return { ok: false, reason: "target must be a town or resource tile" };
  if (!ownedActiveObservatoryWithinRange(actor.id, t.x, t.y)) return { ok: false, reason: "target must be within 30 tiles of your observatory" };
  if (hostileObservatoryProtectingTile(actor, x, y)) return { ok: false, reason: "target is inside enemy observatory protection field" };
  const tk = key(t.x, t.y);
  if (activeSiphonAt(tk)) return { ok: false, reason: "tile already siphoned" };
  if (!consumeStrategicResource(actor, "CRYSTAL", SIPHON_CRYSTAL_COST)) return { ok: false, reason: "insufficient CRYSTAL for siphon" };
  siphonByTile.set(tk, { targetTileKey: tk, casterPlayerId: actor.id, endsAt: now() + SIPHON_DURATION_MS });
  markSummaryChunkDirtyAtTile(t.x, t.y);
  startAbilityCooldown(actor.id, "siphon");
  return { ok: true };
};

const tryPurgeSiphon = (actor: Player, x: number, y: number): { ok: boolean; reason?: string } => {
  const tile = playerTile(x, y);
  if (tile.ownerId !== actor.id) return { ok: false, reason: "tile must be owned by you" };
  const tk = key(tile.x, tile.y);
  if (!activeSiphonAt(tk)) return { ok: false, reason: "tile is not siphoned" };
  if (!consumeStrategicResource(actor, "CRYSTAL", SIPHON_PURGE_CRYSTAL_COST)) return { ok: false, reason: "insufficient CRYSTAL to purge siphon" };
  siphonByTile.delete(tk);
  markSummaryChunkDirtyAtTile(tile.x, tile.y);
  return { ok: true };
};

const completeObservatoryConstruction = (tileKey: TileKey): void => {
  const current = observatoriesByTile.get(tileKey);
  if (!current) return;
  const [x, y] = parseKey(tileKey);
  const tileNow = runtimeTileCore(x, y);
  if (tileNow.ownerId !== current.ownerId || tileNow.ownershipState !== "SETTLED") {
    cancelObservatoryBuild(tileKey);
    return;
  }
  current.status = "active";
  delete current.completesAt;
  observatoryBuildTimers.delete(tileKey);
  markVisibilityDirty(current.ownerId);
  updateOwnership(x, y, current.ownerId);
};

const scheduleObservatoryConstruction = (tileKey: TileKey, buildMs: number): void => {
  const timer = setTimeout(() => completeObservatoryConstruction(tileKey), buildMs);
  observatoryBuildTimers.set(tileKey, timer);
};

const tryBuildObservatory = (actor: Player, x: number, y: number): { ok: boolean; reason?: string } => {
  if (!actor.techIds.has("cartography")) return { ok: false, reason: "unlock observatories via Cartography first" };
  const t = playerTile(x, y);
  if (t.terrain !== "LAND") return { ok: false, reason: "observatory requires land tile" };
  if (t.ownerId !== actor.id || t.ownershipState !== "SETTLED") return { ok: false, reason: "observatory requires settled owned tile" };
  const tk = key(t.x, t.y);
  if (
    !structureShowsOnTile("OBSERVATORY", {
      ownershipState: t.ownershipState,
      resource: t.resource,
      dockId: t.dockId,
      townPopulationTier: townsByTile.get(tk) ? townPopulationTierForTown(townsByTile.get(tk)!) : undefined,
      supportedTownCount: supportedTownKeysForTile(tk, actor.id).length,
      supportedDockCount: supportedDockKeysForTile(tk, actor.id).length
    })
  ) {
    return { ok: false, reason: "observatory cannot be built on this tile" };
  }
  if (observatoriesByTile.has(tk)) return { ok: false, reason: "tile already has observatory" };
  if (fortsByTile.has(tk)) return { ok: false, reason: "tile already has fort" };
  if (siegeOutpostsByTile.has(tk)) return { ok: false, reason: "tile already has siege outpost" };
  if (economicStructuresByTile.has(tk)) return { ok: false, reason: "tile already has structure" };
  if (!canStartDevelopmentProcess(actor.id)) return { ok: false, reason: developmentSlotsBusyReason(actor.id) };
  const goldCost = structureBuildGoldCost("OBSERVATORY", ownedStructureCountForPlayer(actor.id, "OBSERVATORY"));
  if (actor.points < goldCost) return { ok: false, reason: "insufficient gold for observatory" };
  if (!consumeStrategicResource(actor, "CRYSTAL", OBSERVATORY_BUILD_CRYSTAL_COST)) return { ok: false, reason: "insufficient CRYSTAL for observatory" };
  actor.points -= goldCost;
  recalcPlayerDerived(actor);
  const completesAt = now() + OBSERVATORY_BUILD_MS;
  observatoriesByTile.set(tk, {
    observatoryId: crypto.randomUUID(),
    ownerId: actor.id,
    tileKey: tk,
    status: "under_construction",
    completesAt
  });
  markSummaryChunkDirtyAtTile(t.x, t.y);
  trackOwnedTileKey(observatoryTileKeysByPlayer, actor.id, tk);
  markVisibilityDirty(actor.id);
  recordTileStructureHistory(tk, "OBSERVATORY");
  pushStrategicReplayEvent({
    at: now(),
    type: "STRUCTURE",
    label: `${actor.name} started an Observatory at (${t.x}, ${t.y})`,
    playerId: actor.id,
    playerName: actor.name,
    x: t.x,
    y: t.y,
    structureType: "OBSERVATORY",
    isBookmark: true
  });
  scheduleObservatoryConstruction(tk, OBSERVATORY_BUILD_MS);
  return { ok: true };
};

const terrainShapeWouldSealAdjacentOwnedLand = (x: number, y: number): boolean => {
  const neighbors: Array<[number, number]> = [
    [x, y - 1],
    [x + 1, y],
    [x, y + 1],
    [x - 1, y]
  ];
  for (const [nxRaw, nyRaw] of neighbors) {
    const nx = wrapX(nxRaw, WORLD_WIDTH);
    const ny = wrapY(nyRaw, WORLD_HEIGHT);
    const neighbor = playerTile(nx, ny);
    if (!neighbor.ownerId || neighbor.terrain !== "LAND") continue;
    const exits: Array<[number, number]> = [
      [nx, ny - 1],
      [nx + 1, ny],
      [nx, ny + 1],
      [nx - 1, ny]
    ];
    let hasLandExit = false;
    for (const [exRaw, eyRaw] of exits) {
      const ex = wrapX(exRaw, WORLD_WIDTH);
      const ey = wrapY(eyRaw, WORLD_HEIGHT);
      if (ex === wrapX(x, WORLD_WIDTH) && ey === wrapY(y, WORLD_HEIGHT)) continue;
      if (terrainAtRuntime(ex, ey) === "LAND") {
        hasLandExit = true;
        break;
      }
    }
    if (!hasLandExit) return true;
  }
  return false;
};

const tryCreateMountain = (actor: Player, x: number, y: number): { ok: boolean; reason?: string } => {
  if (!playerHasTechIds(actor, ABILITY_DEFS.create_mountain.requiredTechIds)) return { ok: false, reason: "requires Terrain Engineering" };
  if (abilityOnCooldown(actor.id, "create_mountain")) return { ok: false, reason: "create mountain is cooling down" };
  const t = playerTile(x, y);
  const tk = key(t.x, t.y);
  if (t.terrain !== "LAND") return { ok: false, reason: "target must be land" };
  if (!hasOwnedLandWithinRange(actor.id, t.x, t.y, TERRAIN_SHAPING_RANGE)) return { ok: false, reason: "target must be within 2 tiles of your land" };
  if (!ownedActiveObservatoryWithinRange(actor.id, t.x, t.y)) return { ok: false, reason: "target must be within 30 tiles of your observatory" };
  if (combatLocks.has(tk)) return { ok: false, reason: "tile locked in combat" };
  if (hostileObservatoryProtectingTile(actor, t.x, t.y)) return { ok: false, reason: "target is inside enemy observatory protection field" };
  if (townsByTile.has(tk)) return { ok: false, reason: "cannot create mountain on town tile" };
  if (docksByTile.has(tk)) return { ok: false, reason: "cannot create mountain on dock tile" };
  if (fortsByTile.has(tk) || siegeOutpostsByTile.has(tk) || observatoriesByTile.has(tk) || economicStructuresByTile.has(tk)) {
    return { ok: false, reason: "cannot create mountain on structured tile" };
  }
  if (!terrainShapeWithinPlayerDensity(t.x, t.y)) return { ok: false, reason: "too many created mountains nearby" };
  if (terrainShapeWouldSealAdjacentOwnedLand(t.x, t.y)) return { ok: false, reason: "would seal a nearby owned tile" };
  if (actor.points < TERRAIN_SHAPING_GOLD_COST) return { ok: false, reason: "insufficient gold for create mountain" };
  if (!consumeStrategicResource(actor, "CRYSTAL", TERRAIN_SHAPING_CRYSTAL_COST)) return { ok: false, reason: "insufficient CRYSTAL for create mountain" };

  actor.points -= TERRAIN_SHAPING_GOLD_COST;
  startAbilityCooldown(actor.id, "create_mountain");
  const previousOwnerId = t.ownerId;
  if (previousOwnerId) updateOwnership(t.x, t.y, undefined);
  else tileYieldByTile.delete(tk);
  terrainShapesByTile.set(tk, { terrain: "MOUNTAIN", createdByPlayer: true });
  markSummaryChunkDirtyAtTile(t.x, t.y);
  recordMountainShapeHistory(tk, "created");
  recalcPlayerDerived(actor);
  if (previousOwnerId && previousOwnerId !== actor.id) {
    const previousOwner = players.get(previousOwnerId);
    if (previousOwner) {
      recalcPlayerDerived(previousOwner);
      resolveEliminationIfNeeded(previousOwner, socketsByPlayer.has(previousOwner.id));
      sendPlayerUpdate(previousOwner, 0);
    }
  }
  resolveEliminationIfNeeded(actor, socketsByPlayer.has(actor.id));
  return { ok: true };
};

const tryRemoveMountain = (actor: Player, x: number, y: number): { ok: boolean; reason?: string } => {
  if (!playerHasTechIds(actor, ABILITY_DEFS.remove_mountain.requiredTechIds)) return { ok: false, reason: "requires Terrain Engineering" };
  if (abilityOnCooldown(actor.id, "remove_mountain")) return { ok: false, reason: "remove mountain is cooling down" };
  const wx = wrapX(x, WORLD_WIDTH);
  const wy = wrapY(y, WORLD_HEIGHT);
  const tk = key(wx, wy);
  if (terrainAtRuntime(wx, wy) !== "MOUNTAIN") return { ok: false, reason: "target must be mountain" };
  if (!hasOwnedLandWithinRange(actor.id, wx, wy, TERRAIN_SHAPING_RANGE)) return { ok: false, reason: "target must be within 2 tiles of your land" };
  if (!ownedActiveObservatoryWithinRange(actor.id, wx, wy)) return { ok: false, reason: "target must be within 30 tiles of your observatory" };
  if (combatLocks.has(tk)) return { ok: false, reason: "tile locked in combat" };
  if (hostileObservatoryProtectingTile(actor, wx, wy)) return { ok: false, reason: "target is inside enemy observatory protection field" };
  if (actor.points < TERRAIN_SHAPING_GOLD_COST) return { ok: false, reason: "insufficient gold for remove mountain" };
  if (!consumeStrategicResource(actor, "CRYSTAL", TERRAIN_SHAPING_CRYSTAL_COST)) return { ok: false, reason: "insufficient CRYSTAL for remove mountain" };

  actor.points -= TERRAIN_SHAPING_GOLD_COST;
  startAbilityCooldown(actor.id, "remove_mountain");
  const originalTerrain = terrainAt(wx, wy);
  if (originalTerrain === "MOUNTAIN") terrainShapesByTile.set(tk, { terrain: "LAND", createdByPlayer: false });
  else terrainShapesByTile.delete(tk);
  tileYieldByTile.delete(tk);
  markSummaryChunkDirtyAtTile(wx, wy);
  recordMountainShapeHistory(tk, "removed");
  recalcPlayerDerived(actor);
  return { ok: true };
};

const tryAirportBombard = (
  actor: Player,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number
): { ok: boolean; reason?: string; changedTileKeys?: TileKey[]; destroyed?: number } => {
  const airportKey = key(wrapX(fromX, WORLD_WIDTH), wrapY(fromY, WORLD_HEIGHT));
  const airport = activeAirportAt(actor.id, airportKey);
  if (!airport) return { ok: false, reason: "select an active airport first" };
  const [ax, ay] = parseKey(airportKey);
  const targetX = wrapX(toX, WORLD_WIDTH);
  const targetY = wrapY(toY, WORLD_HEIGHT);
  if (chebyshevDistance(ax, ay, targetX, targetY) > AIRPORT_BOMBARD_RANGE) {
    return { ok: false, reason: "target must be within 30 tiles of the airport" };
  }
  if (hostileRadarProtectingTile(actor, targetX, targetY)) {
    return { ok: false, reason: "target is inside enemy radar coverage" };
  }
  if (!consumeStrategicResource(actor, "OIL", AIRPORT_BOMBARD_OIL_COST)) return { ok: false, reason: "insufficient OIL for bombardment" };
  const changedTileKeys: TileKey[] = [];
  let destroyed = 0;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const wx = wrapX(targetX + dx, WORLD_WIDTH);
      const wy = wrapY(targetY + dy, WORLD_HEIGHT);
      const tile = playerTile(wx, wy);
      const tk = key(wx, wy);
      if (
        tile.terrain !== "LAND" ||
        !tile.ownerId ||
        tile.ownerId === actor.id ||
        tile.ownerId === BARBARIAN_OWNER_ID ||
        actor.allies.has(tile.ownerId) ||
        truceBlocksHostility(actor.id, tile.ownerId)
      )
        continue;
      if (combatLocks.has(tk)) continue;
      const defender = players.get(tile.ownerId);
      if (!defender) continue;
      const atkEff = 10 * actor.mods.attack * AIRPORT_BOMBARD_ATTACK_MULT * attackMultiplierForTarget(actor.id, tile) * randomFactor();
      const fortMult = fortDefenseMultAt(defender.id, tk);
      const dockMult = docksByTile.has(tk) ? DOCK_DEFENSE_MULT : 1;
      const settledDefenseMult = settledDefenseMultiplierForTarget(defender.id, tile);
      const newSettlementDefenseMult = settlementDefenseMultAt(defender.id, tk);
      const ownershipDefenseMult = ownershipDefenseMultiplierForTarget(defender.id, tile);
      const frontierDefenseAdd = frontierDefenseAddForTarget(defender.id, tile);
      const defEff =
        (10 * defender.mods.defense * playerDefensiveness(defender) * fortMult * dockMult * settledDefenseMult * newSettlementDefenseMult * ownershipDefenseMult +
          frontierDefenseAdd) *
        randomFactor();
      const win = Math.random() < combatWinChance(atkEff, defEff);
      if (!win) continue;
      updateOwnership(wx, wy, undefined);
      changedTileKeys.push(tk);
      destroyed += 1;
    }
  }
  if (destroyed === 0) return { ok: true, changedTileKeys, destroyed: 0 };
  recalcPlayerDerived(actor);
  return { ok: true, changedTileKeys, destroyed };
};

const tryBuildFort = (actor: Player, x: number, y: number): { ok: boolean; reason?: string } => {
  const effects = getPlayerEffectsForPlayer(actor.id);
  if (!effects.unlockForts) return { ok: false, reason: "unlock forts via Masonry first" };
  const t = playerTile(x, y);
  if (t.terrain !== "LAND") return { ok: false, reason: "fort requires land tile" };
  if (t.ownerId !== actor.id) return { ok: false, reason: "fort tile must be owned" };
  const tk = key(t.x, t.y);
  const existingEconomic = economicStructuresByTile.get(tk);
  const upgradingWoodenFort =
    existingEconomic?.ownerId === actor.id &&
    existingEconomic.type === "WOODEN_FORT" &&
    (existingEconomic.status === "active" || existingEconomic.status === "inactive");
  if (isRelocatableSettlementTown(townsByTile.get(tk))) return { ok: false, reason: "settlements cannot host structures until they grow into towns" };
  if (fortsByTile.has(tk)) return { ok: false, reason: "tile already fortified" };
  if (siegeOutpostsByTile.has(tk)) return { ok: false, reason: "tile already has siege outpost" };
  if (observatoriesByTile.has(tk) || (economicStructuresByTile.has(tk) && !upgradingWoodenFort)) return { ok: false, reason: "tile already has structure" };
  if (
    !structureShowsOnTile("FORT", {
      ownershipState: t.ownershipState,
      resource: t.resource,
      dockId: t.dockId,
      townPopulationTier: townsByTile.get(tk) ? townPopulationTierForTown(townsByTile.get(tk)!) : undefined,
      supportedTownCount: supportedTownKeysForTile(tk, actor.id).length,
      supportedDockCount: supportedDockKeysForTile(tk, actor.id).length
    })
  ) {
    return { ok: false, reason: "fort cannot be built on this tile" };
  }
  if (existingEconomic?.type === "WOODEN_FORT" && !upgradingWoodenFort) return { ok: false, reason: "wooden fort is still being modified" };
  if (!canStartDevelopmentProcess(actor.id)) return { ok: false, reason: developmentSlotsBusyReason(actor.id) };
  const goldCost = Math.ceil(structureBuildGoldCost("FORT", ownedStructureCountForPlayer(actor.id, "FORT")) * effects.fortBuildGoldCostMult);
  if (actor.points < goldCost) return { ok: false, reason: "insufficient gold for fort" };
  if (!consumeStrategicResource(actor, "IRON", FORT_BUILD_IRON_COST)) return { ok: false, reason: "insufficient IRON for fort" };
  actor.points -= goldCost;
  recalcPlayerDerived(actor);
  const fort: Fort = {
    fortId: crypto.randomUUID(),
    ownerId: actor.id,
    tileKey: tk,
    status: "under_construction",
    startedAt: now(),
    completesAt: now() + FORT_BUILD_MS
  };
  if (upgradingWoodenFort) economicStructuresByTile.delete(tk);
  fortsByTile.set(tk, fort);
  markSummaryChunkDirtyAtTile(t.x, t.y);
  recordTileStructureHistory(tk, "FORT");
  pushStrategicReplayEvent({
    at: now(),
    type: "STRUCTURE",
    label: `${actor.name} started a Fort at (${t.x}, ${t.y})`,
    playerId: actor.id,
    playerName: actor.name,
    x: t.x,
    y: t.y,
    structureType: "FORT",
    isBookmark: true
  });
  const timer = setTimeout(() => {
    const current = fortsByTile.get(tk);
    if (!current) return;
    const tileNow = runtimeTileCore(t.x, t.y);
    if (tileNow.ownerId !== actor.id) {
      fortsByTile.delete(tk);
      markSummaryChunkDirtyAtTile(t.x, t.y);
      fortBuildTimers.delete(tk);
      return;
    }
    current.status = "active";
    delete current.completesAt;
    fortBuildTimers.delete(tk);
    updateOwnership(t.x, t.y, actor.id);
  }, FORT_BUILD_MS);
  fortBuildTimers.set(tk, timer);
  return { ok: true };
};

const tryBuildSiegeOutpost = (actor: Player, x: number, y: number): { ok: boolean; reason?: string } => {
  const placement = canBuildSiegeOutpostAt(actor, x, y);
  if (!placement.ok) return placement;
  const t = playerTile(x, y);
  const tk = key(t.x, t.y);
  const existingEconomic = economicStructuresByTile.get(tk);
  const upgradingLightOutpost =
    existingEconomic?.ownerId === actor.id &&
    existingEconomic.type === "LIGHT_OUTPOST" &&
    (existingEconomic.status === "active" || existingEconomic.status === "inactive");
  const goldCost = structureBuildGoldCost("SIEGE_OUTPOST", ownedStructureCountForPlayer(actor.id, "SIEGE_OUTPOST"));
  if (!consumeStrategicResource(actor, "SUPPLY", SIEGE_OUTPOST_BUILD_SUPPLY_COST))
    return { ok: false, reason: "insufficient SUPPLY for siege outpost" };
  actor.points -= goldCost;
  recalcPlayerDerived(actor);
  const siegeOutpost: SiegeOutpost = {
    siegeOutpostId: crypto.randomUUID(),
    ownerId: actor.id,
    tileKey: tk,
    status: "under_construction",
    startedAt: now(),
    completesAt: now() + SIEGE_OUTPOST_BUILD_MS
  };
  if (upgradingLightOutpost) economicStructuresByTile.delete(tk);
  siegeOutpostsByTile.set(tk, siegeOutpost);
  markSummaryChunkDirtyAtTile(t.x, t.y);
  recordTileStructureHistory(tk, "SIEGE_OUTPOST");
  pushStrategicReplayEvent({
    at: now(),
    type: "STRUCTURE",
    label: `${actor.name} started a Siege Outpost at (${t.x}, ${t.y})`,
    playerId: actor.id,
    playerName: actor.name,
    x: t.x,
    y: t.y,
    structureType: "SIEGE_OUTPOST",
    isBookmark: true
  });
  const timer = setTimeout(() => {
    const current = siegeOutpostsByTile.get(tk);
    if (!current) return;
    const tileNow = runtimeTileCore(t.x, t.y);
    if (tileNow.ownerId !== actor.id) {
      siegeOutpostsByTile.delete(tk);
      markSummaryChunkDirtyAtTile(t.x, t.y);
      siegeOutpostBuildTimers.delete(tk);
      return;
    }
    current.status = "active";
    delete current.completesAt;
    siegeOutpostBuildTimers.delete(tk);
    updateOwnership(t.x, t.y, actor.id);
  }, SIEGE_OUTPOST_BUILD_MS);
  siegeOutpostBuildTimers.set(tk, timer);
  return { ok: true };
};

const playerHomeTile = (p: Player): { x: number; y: number } | undefined => {
  const first = activeSettlementTileKeyForPlayer(p.id) ?? p.spawnOrigin ?? [...p.territoryTiles][0];
  if (!first) return undefined;
  const [x, y] = parseKey(first);
  return { x, y };
};

let updateOwnership: (x: number, y: number, newOwner: string | undefined, newState?: OwnershipState) => void;

const {
  serializePlayer,
  offlineUpkeepPausedForPlayer,
  wakeOfflineEconomyForPlayer,
  consumeOfflinePlayerActivity,
  queueOfflineTownCaptureActivity,
  rebuildOwnershipDerivedState,
  spawnPlayer,
  getOrCreatePlayerForIdentity
} = createServerPlayerRuntimeSupport({
  players,
  ownership,
  ownershipStateByTile,
  settledSinceByTile,
  townsByTile,
  clusterByTile,
  clustersById,
  resourceCountsByPlayer,
  clusterControlledTilesByPlayer,
  barbarianAgents,
  strategicResourceStockByPlayer,
  strategicResourceBufferByPlayer,
  economyIndexByPlayer,
  dynamicMissionsByPlayer,
  forcedRevealTilesByPlayer,
  playerEffectsByPlayer,
  playerBaseMods,
  socketsByPlayer,
  BARBARIAN_OWNER_ID,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  DEBUG_SPAWN_NEAR_AI,
  STARTING_GOLD,
  STARTING_MANPOWER,
  STAMINA_MAX,
  OFFLINE_YIELD_ACCUM_MAX_MS,
  colorFromId,
  playerStylePayload,
  defaultMissionStats,
  emptyStrategicStocks,
  emptyPlayerEconomyIndex,
  emptyPlayerEffects,
  setRevealTargetsForPlayer,
  recomputePlayerEffectsForPlayer,
  ensureMissionDefaults,
  normalizePlayerProgressionState,
  recomputeExposure,
  ensureFallbackSettlementForPlayer,
  recomputeTownNetworkForPlayer,
  reconcileCapitalForPlayer,
  updateMissionState,
  removeBarbarianAgent,
  upsertBarbarianAgent,
  playerHomeTile,
  playerTile,
  updateOwnership: (x, y, ownerId, state) => updateOwnership(x, y, ownerId, state),
  createSettlementAtTile,
  sendVisibleTileDeltaAt,
  broadcastBulk,
  clusterResourceType,
  key,
  parseKey,
  wrapX,
  wrapY,
  chebyshevDistance,
  getOrInitResourceCounts,
  setClusterControlDelta,
  now,
  runtimeLogInfo: (payload, message) => {
    if (runtimeState.appRef) runtimeState.appRef.log.info(payload, message);
    else console.info(message, payload);
  },
  runtimeLogError: (payload, message) => {
    if (runtimeState.appRef) runtimeState.appRef.log.error(payload, message);
    else console.error(message, payload);
  }
});

({
  updateOwnership
} = createServerOwnershipRuntime({
  ownership,
  ownershipStateByTile,
  settledSinceByTile,
  townsByTile,
  pendingSettlementsByTile,
  fortsByTile,
  observatoriesByTile,
  siegeOutpostsByTile,
  economicStructuresByTile,
  siphonByTile,
  breachShockByTile,
  settlementDefenseByTile,
  tileYieldByTile,
  revealWatchersByTarget,
  observatoryTileKeysByPlayer,
  economicStructureTileKeysByPlayer,
  players,
  BARBARIAN_OWNER_ID,
  TOWN_CAPTURE_SHOCK_MS,
  playerTile,
  runtimeTileCore,
  key,
  parseKey,
  now,
  cardinalNeighborCores,
  adjacentNeighborCores,
  removeBarbarianAtTile,
  clearPendingSettlement,
  refundPendingSettlement,
  sendToPlayer,
  sendPlayerUpdate,
  cancelFortBuild,
  cancelObservatoryBuild,
  cancelSiegeOutpostBuild,
  economicStructureBuildTimers,
  untrackOwnedTileKey,
  trackOwnedTileKey,
  markSummaryChunkDirtyAtTile,
  recordTileCaptureHistory: (tileKey, oldOwner, newOwner) => recordTileCaptureHistory(tileKey, oldOwner, newOwner),
  applyTownCapturePopulationLoss,
  applyTownCaptureShock,
  getOrInitResourceCounts,
  setClusterControlDelta,
  recomputeExposure,
  recomputeTownNetworkForPlayer,
  reconcileCapitalForPlayer,
  ensureFallbackSettlementForPlayer,
  rebuildEconomyIndexForPlayer,
  relocateCapturedSettlementForPlayer,
  refreshVisibleOwnedTownsForPlayer,
  markAiTerritoryDirtyForPlayers,
  refreshVisibleNearbyTownDeltas,
  markVisibilityDirtyForPlayers,
  sendLocalVisionDeltaForPlayer: (playerId, changedCenters) => sendLocalVisionDeltaForPlayer(playerId, changedCenters),
  refreshSubscribedViewForPlayer: (playerId) => refreshSubscribedViewForPlayer(playerId),
  pushStrategicReplayEvent,
  sendVisibleTileDeltaSquare,
  recordHotPathTimingEvent,
  recordServerDebugEvent,
  runtimeWarn: (payload, message) => app.log.warn(payload, message),
  isRelocatableSettlementTown,
  queueOfflineTownCaptureActivity,
  wakeOfflineEconomyForPlayer
}));

const getOrInitTileHistory = (tileKey: TileKey): TileHistoryState => {
  let history = tileHistoryByTile.get(tileKey);
  if (!history) {
    history = {
      previousOwners: [],
      captureCount: 0,
      structureHistory: []
    };
    tileHistoryByTile.set(tileKey, history);
  }
  return history;
};

const pushRollingUnique = (items: string[], value: string, cap: number): void => {
  if (items[items.length - 1] !== value) items.push(value);
  while (items.length > cap) items.shift();
};

const recordTileCaptureHistory = (tileKey: TileKey, oldOwner: string, newOwner: string): void => {
  if (!oldOwner || !newOwner || oldOwner === newOwner) return;
  const history = getOrInitTileHistory(tileKey);
  history.lastOwnerId = oldOwner;
  pushRollingUnique(history.previousOwners, oldOwner, 5);
  history.captureCount += 1;
  history.lastCapturedAt = now();
};

const recordTileStructureHistory = (tileKey: TileKey, structureType: "FORT" | "SIEGE_OUTPOST" | "OBSERVATORY" | EconomicStructureType): void => {
  const history = getOrInitTileHistory(tileKey);
  history.lastStructureType = structureType;
  history.structureHistory.push(structureType);
  while (history.structureHistory.length > 5) history.structureHistory.shift();
};

const recordMountainShapeHistory = (tileKey: TileKey, kind: "created" | "removed"): void => {
  const history = getOrInitTileHistory(tileKey);
  if (kind === "created") history.wasMountainCreatedByPlayer = true;
  if (kind === "removed") history.wasMountainRemovedByPlayer = true;
};

const {
  saveSnapshot,
  loadSectionedSnapshot,
  loadLegacySnapshot
} = createServerSnapshotIoRuntime({
  WORLD_WIDTH,
  WORLD_HEIGHT,
  players,
  ownership,
  ownershipStateByTile,
  settledSinceByTile,
  barbarianAgents,
  authIdentities: () => [...authIdentityByUid.values()],
  resourceCountsByPlayer,
  strategicResourceStockByPlayer,
  strategicResourceBufferByPlayer,
  tileYieldByTile,
  tileHistoryByTile,
  terrainShapesByTile,
  victoryPressureById,
  frontierSettlementsByPlayer,
  dynamicMissionsByPlayer,
  temporaryAttackBuffUntilByPlayer,
  temporaryIncomeBuffUntilByPlayer,
  forcedRevealTilesByPlayer,
  revealedEmpireTargetsByPlayer,
  allianceRequests,
  fortsByTile,
  observatoriesByTile,
  siegeOutpostsByTile,
  economicStructuresByTile,
  siphonByTile,
  abilityCooldownsByPlayer,
  activeAetherWallsById,
  dockById,
  townsByTile,
  shardSitesByTile,
  firstSpecialSiteCaptureClaimed,
  clustersById,
  clusterByTile,
  pendingSettlementsByTile,
  townCaptureShockUntilByTile,
  townGrowthShockUntilByTile,
  activeSeason: () => activeSeason,
  seasonWinner: () => seasonWinner,
  seasonArchives: () => seasonArchives,
  activeSeasonTechConfig: () => ({
    ...activeSeasonTechConfig,
    activeNodeIds: [...activeSeasonTechConfig.activeNodeIds]
  }),
  serializePlayer,
  SNAPSHOT_DIR,
  SNAPSHOT_FILE,
  SNAPSHOT_INDEX_FILE,
  SNAPSHOT_SECTION_FILES,
  snapshotSectionFile,
  runtimeMemoryStats,
  logSnapshotSerializationMemory: (phase, startedAt, stats, extra) =>
    logSnapshotSerializationMemory(phase, startedAt, stats, extra)
});

const snapshotSaveRunner = createSnapshotSaveRunner({
  save: async () => {
    snapshotSaveRunning = true;
    snapshotSavePending = false;
    const startedAt = now();
    recordServerDebugEvent("info", "snapshot_save_started", {
      startedAt,
      ...hotPathContentionContext()
    });
    try {
      await saveSnapshot();
      recordHotPathTimingEvent(
        "snapshot_save_timing",
        {
          startedAt
        },
        now() - startedAt,
        100
      );
    } finally {
      snapshotSaveRunning = false;
    }
  },
  onError: (err) => {
    logRuntimeError("snapshot save failed", err);
  }
});

const saveSnapshotInBackground = (): void => {
  snapshotSaveRequestedAt = now();
  snapshotSavePending = true;
  recordServerDebugEvent("info", "snapshot_save_requested", {
    requestedAt: snapshotSaveRequestedAt,
    ...hotPathContentionContext()
  });
  if (humanFrontierActionPriorityActive() || humanChunkSnapshotPriorityActive()) {
    if (snapshotSaveDeferredTimer === undefined) {
      snapshotSaveDeferredTimer = setTimeout(() => {
        snapshotSaveDeferredTimer = undefined;
        saveSnapshotInBackground();
      }, 1_000);
    }
    recordServerDebugEvent("info", "snapshot_save_deferred", {
      requestedAt: snapshotSaveRequestedAt,
      reason: humanFrontierActionPriorityActive() ? "human_frontier_action_priority" : "human_chunk_snapshot_priority",
      ...hotPathContentionContext()
    });
    return;
  }
  snapshotSaveRunner.request();
};

const {
  loadSnapshot
} = createServerSnapshotHydrateRuntime({
  ownership,
  ownershipStateByTile,
  settledSinceByTile,
  barbarianAgents,
  barbarianAgentByTileKey,
  authIdentityByUid,
  resourceCountsByPlayer,
  strategicResourceStockByPlayer,
  strategicResourceBufferByPlayer,
  tileHistoryByTile,
  terrainShapesByTile,
  victoryPressureById,
  frontierSettlementsByPlayer,
  tileYieldByTile,
  dynamicMissionsByPlayer,
  temporaryAttackBuffUntilByPlayer,
  temporaryIncomeBuffUntilByPlayer,
  cachedVisibilitySnapshotByPlayer,
  cachedChunkSnapshotByPlayer,
  simulationChunkStateClear: () => simulationChunkState.clear(),
  chunkSnapshotGenerationByPlayer,
  revealWatchersByTarget,
  observatoryTileKeysByPlayer,
  economicStructureTileKeysByPlayer,
  forcedRevealTilesByPlayer,
  revealedEmpireTargetsByPlayer,
  allianceRequests,
  fortsByTile,
  observatoriesByTile,
  siegeOutpostsByTile,
  economicStructuresByTile,
  siphonByTile,
  abilityCooldownsByPlayer,
  activeAetherWallsById,
  docksByTile,
  dockById,
  dockLinkedTileKeysByDockTileKeyClear: () => dockLinkedTileKeysByDockTileKey.clear(),
  townsByTile,
  shardSitesByTile,
  firstSpecialSiteCaptureClaimed,
  clustersById,
  clusterByTile,
  townCaptureShockUntilByTile,
  townGrowthShockUntilByTile,
  players,
  playerBaseMods,
  pendingSettlementsByTile,
  SNAPSHOT_INDEX_FILE,
  SNAPSHOT_FILE,
  logRuntimeError,
  loadSectionedSnapshot,
  loadLegacySnapshot,
  BARBARIAN_OWNER_ID,
  setRevealTargetsForPlayer,
  trackOwnedTileKey,
  isConverterStructureType,
  registerAetherWallEdges,
  townPlacementsNeedNormalization,
  normalizeTownPlacements,
  assignMissingTownNamesForWorld,
  seasonTechConfigIsCompatible,
  chooseSeasonalTechConfig,
  activeSeason: () => activeSeason,
  setActiveSeason: (season) => {
    activeSeason = season;
  },
  seasonWinner: () => seasonWinner,
  setSeasonWinner: (winner) => {
    seasonWinner = winner;
  },
  seasonArchives: () => seasonArchives,
  activeSeasonTechConfig: () => activeSeasonTechConfig,
  setActiveSeasonTechConfig: (config) => {
    activeSeasonTechConfig = config;
  },
  ensureMissionDefaults,
  normalizePlayerProgressionState,
  recomputePlayerEffectsForPlayer,
  defaultMissionStats,
  ensureFallbackSettlementForPlayer,
  spawnBarbarianAgentAt,
  parseKey,
  playerTile,
  runtimeLogInfo: (payload, message) => {
    if (runtimeState.appRef) runtimeState.appRef.log.info(payload, message);
    else console.info(message, payload);
  }
});

const bootstrapRuntimeState = async (): Promise<void> => {
  const loadStartedAt = Date.now();
  const loadedSnapshot = loadSnapshot();
  logStartupPhase("load_snapshot", loadStartedAt, { players: players.size, ownershipTiles: ownership.size });

  const worldStartedAt = Date.now();
  ensureAiPlayers();
  setWorldSeed(activeSeason.worldSeed);
  const minAcceptableClusters = CLUSTER_COUNT_MIN;
  const hasBiomeLinkedClusters = [...clustersById.values()].every((c) => Boolean(c.resourceType));
  const clusterTilesById = new Map<string, number>();
  for (const cid of clusterByTile.values()) clusterTilesById.set(cid, (clusterTilesById.get(cid) ?? 0) + 1);
  const hasLegacyResourceMix = [...clustersById.values()].some((c) => c.resourceType === "WOOD");
  const hasFurClusters = [...clustersById.values()].some((c) => c.resourceType === "FUR");
  const hasExpectedClusterShape =
    clustersById.size === CLUSTER_COUNT_MIN &&
    [...clustersById.values()].every((c) => {
      const expected = clusterTileCountForResource(c.resourceType ?? clusterResourceType(c), c.centerX, c.centerY);
      return (clusterTilesById.get(c.clusterId) ?? 0) === expected;
    });
  const hasGemOnNonSand = (() => {
    for (const [tk, cid] of clusterByTile) {
      const c = clustersById.get(cid);
      if (!c || c.resourceType !== "GEMS") continue;
      const [x, y] = parseKey(tk);
      if (landBiomeAt(x, y) !== "SAND") return true;
    }
    return false;
  })();
  if (
    !loadedSnapshot && (
    clustersById.size < minAcceptableClusters ||
    clusterByTile.size === 0 ||
    !hasBiomeLinkedClusters ||
    !hasExpectedClusterShape ||
    hasLegacyResourceMix ||
    !hasFurClusters ||
    hasGemOnNonSand
    )
  ) {
    activeSeason.worldSeed = regenerateStrategicWorld(activeSeason.worldSeed);
    setWorldSeed(activeSeason.worldSeed);
  }
  const hasCrossContinentDockPairs = (() => {
    const seen = new Set<string>();
    let hasCrossContinentLink = false;
    for (const d of dockById.values()) {
      const linkedDockIds = d.connectedDockIds?.length ? d.connectedDockIds : d.pairedDockId ? [d.pairedDockId] : [];
      for (const dockId of linkedDockIds) {
        const pair = dockById.get(dockId);
        if (!pair) return false;
        const edgeKey = d.dockId < pair.dockId ? `${d.dockId}|${pair.dockId}` : `${pair.dockId}|${d.dockId}`;
        if (seen.has(edgeKey)) continue;
        seen.add(edgeKey);
        const [ax, ay] = parseKey(d.tileKey);
        const [bx, by] = parseKey(pair.tileKey);
        const ac = continentIdAt(ax, ay);
        const bc = continentIdAt(bx, by);
        if (ac === undefined || bc === undefined) return false;
        if (ac !== bc) hasCrossContinentLink = true;
      }
    }
    if (seen.size === 0) {
      return false;
    }
    return dockById.size > 0 && hasCrossContinentLink;
  })();
  if (!loadedSnapshot && (dockById.size === 0 || docksByTile.size === 0 || !hasCrossContinentDockPairs || townsByTile.size === 0)) {
    activeSeason.worldSeed = regenerateStrategicWorld(activeSeason.worldSeed);
    setWorldSeed(activeSeason.worldSeed);
  }
  if (activeSeasonTechConfig.rootNodeIds.length === 0 || activeSeasonTechConfig.activeNodeIds.size === 0) {
    activeSeasonTechConfig = chooseSeasonalTechConfig(activeSeason.worldSeed);
    activeSeason.techTreeConfigId = activeSeasonTechConfig.configId;
  }
  logStartupPhase("validate_world_state", worldStartedAt, {
    clusters: clustersById.size,
    docks: dockById.size,
    towns: townsByTile.size
  });

  const playerStartedAt = Date.now();
  for (const p of players.values()) {
    if (!playerBaseMods.has(p.id)) {
      playerBaseMods.set(p.id, {
        attack: p.mods.attack,
        defense: p.mods.defense,
        income: p.mods.income,
        vision: p.mods.vision
      });
    }
    if (!revealedEmpireTargetsByPlayer.has(p.id)) setRevealTargetsForPlayer(p.id, []);
    rebuildEconomyIndexForPlayer(p.id);
    if (!playerEffectsByPlayer.has(p.id)) recomputePlayerEffectsForPlayer(p);
  }
  rebuildOwnershipDerivedState();
  for (const p of players.values()) recomputeTechModsFromOwnedTechs(p);
  for (const p of players.values()) {
    if (p.T <= 0 || p.territoryTiles.size === 0) {
      spawnPlayer(p);
    }
  }
  if (barbarianAgents.size === 0) {
    spawnInitialBarbarians();
  }
  logStartupPhase("hydrate_players", playerStartedAt, { players: players.size, barbarianAgents: barbarianAgents.size });

  const timersStartedAt = Date.now();
  for (const [tk, fort] of fortsByTile.entries()) {
    if ((fort.status !== "under_construction" && fort.status !== "removing") || fort.completesAt === undefined) continue;
    const remaining = fort.completesAt - now();
    if (fort.status === "removing") {
      if (remaining <= 0) {
        completeFortRemoval(tk);
        continue;
      }
      const timer = setTimeout(() => completeFortRemoval(tk), remaining);
      fortBuildTimers.set(tk, timer);
      continue;
    }
    if (remaining <= 0) {
      fort.status = "active";
      delete fort.completesAt;
      continue;
    }
    const timer = setTimeout(() => {
      const live = fortsByTile.get(tk);
      if (!live) return;
      const [fx, fy] = parseKey(tk);
      const tileNow = playerTile(fx, fy);
      if (tileNow.ownerId !== live.ownerId) {
        fortsByTile.delete(tk);
        fortBuildTimers.delete(tk);
        return;
      }
      live.status = "active";
      delete live.completesAt;
      fortBuildTimers.delete(tk);
      updateOwnership(fx, fy, live.ownerId);
    }, remaining);
    fortBuildTimers.set(tk, timer);
  }
  for (const [tk, observatory] of observatoriesByTile.entries()) {
    if ((observatory.status !== "under_construction" && observatory.status !== "removing") || observatory.completesAt === undefined) continue;
    const remaining = observatory.completesAt - now();
    if (observatory.status === "removing") {
      if (remaining <= 0) {
        completeObservatoryRemoval(tk);
        continue;
      }
      const timer = setTimeout(() => completeObservatoryRemoval(tk), remaining);
      observatoryBuildTimers.set(tk, timer);
      continue;
    }
    if (remaining <= 0) {
      observatory.status = "active";
      delete observatory.completesAt;
      continue;
    }
    scheduleObservatoryConstruction(tk, remaining);
  }
  for (const [tk, siege] of siegeOutpostsByTile.entries()) {
    if ((siege.status !== "under_construction" && siege.status !== "removing") || siege.completesAt === undefined) continue;
    const remaining = siege.completesAt - now();
    if (siege.status === "removing") {
      if (remaining <= 0) {
        completeSiegeOutpostRemoval(tk);
        continue;
      }
      const timer = setTimeout(() => completeSiegeOutpostRemoval(tk), remaining);
      siegeOutpostBuildTimers.set(tk, timer);
      continue;
    }
    if (remaining <= 0) {
      siege.status = "active";
      delete siege.completesAt;
      continue;
    }
    const timer = setTimeout(() => {
      const live = siegeOutpostsByTile.get(tk);
      if (!live) return;
      const [sx, sy] = parseKey(tk);
      const tileNow = playerTile(sx, sy);
      if (tileNow.ownerId !== live.ownerId) {
        siegeOutpostsByTile.delete(tk);
        siegeOutpostBuildTimers.delete(tk);
        return;
      }
      live.status = "active";
      delete live.completesAt;
      siegeOutpostBuildTimers.delete(tk);
      updateOwnership(sx, sy, live.ownerId);
    }, remaining);
    siegeOutpostBuildTimers.set(tk, timer);
  }
  for (const [tk, structure] of economicStructuresByTile.entries()) {
    if (structure.completesAt === undefined) continue;
    const remaining = structure.completesAt - now();
    if (structure.status === "under_construction") {
      if (remaining <= 0) {
        structure.status = "active";
        delete structure.inactiveReason;
        delete structure.completesAt;
        continue;
      }
      const [sx, sy] = parseKey(tk);
      const timer = setTimeout(() => {
        const current = economicStructuresByTile.get(tk);
        if (!current) return;
        const tileNow = runtimeTileCore(sx, sy);
        if (tileNow.ownerId !== current.ownerId || tileNow.ownershipState !== "SETTLED") {
          cancelEconomicStructureBuild(tk);
          return;
        }
        current.status = "active";
        delete current.inactiveReason;
        delete current.completesAt;
        economicStructureBuildTimers.delete(tk);
        updateOwnership(sx, sy, current.ownerId);
      }, remaining);
      economicStructureBuildTimers.set(tk, timer);
      continue;
    }
    if (structure.status === "removing") {
      if (remaining <= 0) {
        completeEconomicStructureRemoval(tk);
        continue;
      }
      const timer = setTimeout(() => completeEconomicStructureRemoval(tk), remaining);
      economicStructureBuildTimers.set(tk, timer);
    }
  }
  for (const settlement of pendingSettlementsByTile.values()) {
    if (settlement.resolvesAt <= now()) resolvePendingSettlement(settlement);
    else schedulePendingSettlementResolution(settlement);
  }
  logStartupPhase("schedule_runtime_timers", timersStartedAt, {
    pendingSettlements: pendingSettlementsByTile.size,
    forts: fortsByTile.size,
    observatories: observatoriesByTile.size,
    siegeOutposts: siegeOutpostsByTile.size,
    economicStructures: economicStructuresByTile.size
  });

  const chunkReadStartedAt = Date.now();
  void chunkReadManager
    .hydrateAll()
    .then(() => {
      logStartupPhase("hydrate_chunk_read_worker", chunkReadStartedAt, {
        available: chunkReadWorkerState.available,
        hydrated: chunkReadWorkerState.hydrated,
        deferred: true
      });
    })
    .catch((err) => {
      logRuntimeError("chunk read worker hydration failed", err);
    });
};
const runtimeIntervals: NodeJS.Timeout[] = [];
let intervalRegistrationCount = 0;
const registerInterval = (fn: () => void, ms: number): void => {
  const wrapped = (): void => {
    if (!startupState.ready) return;
    fn();
  };
  const offset = ms <= 1 ? 0 : (intervalRegistrationCount * 97) % ms;
  intervalRegistrationCount += 1;
  const starter = setTimeout(() => {
    wrapped();
    runtimeIntervals.push(setInterval(wrapped, ms));
  }, offset);
  runtimeIntervals.push(starter);
};
recentRuntimeVitals.push(sampleRuntimeVitals());

let lastSnapshotAt = 0;
registerInterval(() => {
  recentRuntimeVitals.push(sampleRuntimeVitals());
}, 5_000);
registerInterval(() => {
  const nowMs = now();
  if (!hasOnlinePlayers() && nowMs - lastSnapshotAt < IDLE_SNAPSHOT_INTERVAL_MS) return;
  saveSnapshotInBackground();
  lastSnapshotAt = nowMs;
}, 30_000);
registerInterval(runBarbarianTick, BARBARIAN_TICK_MS);
registerInterval(runAiTick, AI_DISPATCH_INTERVAL_MS);
registerInterval(enqueueBarbarianMaintenance, BARBARIAN_MAINTENANCE_INTERVAL_MS);
registerInterval(expireShardSites, 5_000);
registerInterval(maybeSpawnScheduledShardRain, 30_000);
registerInterval(maybeBroadcastShardRainWarning, 30_000);
registerInterval(() => {
  const vitals = sampleRuntimeVitals();
  recentRuntimeVitals.push(vitals);
  const cachePayloads = cachedChunkPayloadDiagnostics();
  runtimeIncidentLog.record("runtime_memory", {
    ...vitals,
    onlinePlayers: onlineSocketCount(),
    aiPlayers: [...players.values()].filter((player) => player.isAi).length,
    totalPlayers: players.size,
    ownershipTiles: ownership.size,
    visibilitySnapshots: cachedVisibilitySnapshotByPlayer.size,
    cachedChunkPlayers: cachedChunkSnapshotByPlayer.size,
    cachedChunkPayloads: cachePayloads.payloads,
    cachedChunkPayloadMb: cachePayloads.approxPayloadMb
  });
  maybeLogRuntimeMemoryWatermark("runtime_interval", vitals, {
    onlinePlayers: onlineSocketCount(),
    cachedChunkPayloadMb: cachePayloads.approxPayloadMb
  });
  app.log.info(
    {
      ...vitals,
      onlinePlayers: onlineSocketCount(),
      aiPlayers: [...players.values()].filter((player) => player.isAi).length,
      totalPlayers: players.size,
      ownershipTiles: ownership.size,
      visibilitySnapshots: cachedVisibilitySnapshotByPlayer.size,
      cachedChunkPlayers: cachedChunkSnapshotByPlayer.size,
      cachedChunkPayloads: cachePayloads.payloads,
      cachedChunkPayloadMb: cachePayloads.approxPayloadMb
    },
    "runtime memory"
  );
}, 60_000);

registerInterval(() => {
  if (runtimeLoadShedLevel() === "hard" && onlineSocketCount() > 0) return;
  for (const [tk, shock] of breachShockByTile) {
    if (shock.expiresAt <= now()) {
      breachShockByTile.delete(tk);
      const [x, y] = parseKey(tk);
      markSummaryChunkDirtyAtTile(x, y);
    }
  }
  for (const [tk, defense] of settlementDefenseByTile) {
    if (defense.expiresAt <= now()) settlementDefenseByTile.delete(tk);
  }
  for (const [tk, until] of townCaptureShockUntilByTile) {
    if (until <= now()) townCaptureShockUntilByTile.delete(tk);
  }
  for (const [tk, until] of townGrowthShockUntilByTile) {
    if (until <= now()) townGrowthShockUntilByTile.delete(tk);
  }
  pruneExpiredTruces();
  for (const [pid, until] of temporaryAttackBuffUntilByPlayer) {
    if (until <= now()) temporaryAttackBuffUntilByPlayer.delete(pid);
  }
  for (const [pid, buff] of temporaryIncomeBuffUntilByPlayer) {
    if (buff.until <= now()) temporaryIncomeBuffUntilByPlayer.delete(pid);
  }
  for (const [tk, sabotage] of siphonByTile) {
    if (sabotage.endsAt > now()) continue;
    siphonByTile.delete(tk);
    const [sx, sy] = parseKey(tk);
    markSummaryChunkDirtyAtTile(sx, sy);
    for (const p of players.values()) {
      if (!tileInSubscription(p.id, sx, sy)) continue;
      if (!visible(p, sx, sy)) continue;
      const current = playerTile(sx, sy);
      current.fogged = false;
      sendBulkToPlayer(p.id, { type: "TILE_DELTA", updates: [current] });
    }
  }
  for (const [playerId, caches] of siphonCacheByPlayer) {
    const next = caches.filter((cache) => cache.expiresAt > now());
    if (next.length > 0) siphonCacheByPlayer.set(playerId, next);
    else siphonCacheByPlayer.delete(playerId);
  }
  for (const [bridgeId, bridge] of activeAetherBridgesById) {
    if (bridge.endsAt > now()) continue;
    activeAetherBridgesById.delete(bridgeId);
    const [bx, by] = parseKey(bridge.fromTileKey);
    markSummaryChunkDirtyAtTile(bx, by);
    const [tx, ty] = parseKey(bridge.toTileKey);
    markSummaryChunkDirtyAtTile(tx, ty);
  }
  let aetherWallsChanged = false;
  for (const [wallId, wall] of activeAetherWallsById) {
    if (wall.endsAt > now()) continue;
    activeAetherWallsById.delete(wallId);
    unregisterAetherWallEdges(wall);
    const [originX, originY] = parseKey(wall.originTileKey);
    for (const segment of buildAetherWallSegments(originX, originY, wall.direction, wall.length, (x: number) => wrapX(x, WORLD_WIDTH), (y: number) => wrapY(y, WORLD_HEIGHT))) {
      markSummaryChunkDirtyAtTile(segment.baseX, segment.baseY);
      markSummaryChunkDirtyAtTile(segment.toX, segment.toY);
    }
    aetherWallsChanged = true;
  }
  if (aetherWallsChanged) broadcastAetherWallUpdate();
  for (const [pid, cooldowns] of abilityCooldownsByPlayer) {
    for (const [abilityId, until] of cooldowns) {
      if (until <= now()) cooldowns.delete(abilityId);
    }
    if (cooldowns.size === 0) abilityCooldownsByPlayer.delete(pid);
  }
  for (const [pid, missions] of dynamicMissionsByPlayer) {
    dynamicMissionsByPlayer.set(
      pid,
      missions.filter((m) => m.expiresAt > now() || m.rewarded)
    );
  }
  for (const p of players.values()) {
    const upkeepPaused = offlineUpkeepPausedForPlayer(p);
    const touchedTileKeys = new Set<TileKey>();
    applyManpowerRegen(p);
    const populationTouched = updateTownPopulationForPlayer(p);
    for (const tk of populationTouched) touchedTileKeys.add(tk);
    if (!upkeepPaused) {
      applyStaminaRegen(p);
      recomputeTownNetworkForPlayer(p.id);
      const economicTouched = syncEconomicStructuresForPlayer(p);
      for (const tk of economicTouched) touchedTileKeys.add(tk);
    }
    accumulatePassiveIncomeForPlayer(p);
    if (!upkeepPaused) {
      const upkeepResult = applyUpkeepForPlayer(p);
      for (const tk of upkeepResult.touchedTileKeys) touchedTileKeys.add(tk);
    }
    if (touchedTileKeys.size > 0) {
      const updates = [...touchedTileKeys].map((tk) => {
        const [x, y] = parseKey(tk);
        return playerTile(x, y);
      });
      sendBulkToPlayer(p.id, { type: "TILE_DELTA", updates });
    }
    updateMissionState(p);
    sendPlayerUpdate(p, 0);
  }
  evaluateVictoryPressure();
}, 60_000);

registerInterval(() => {
  if (!hasOnlinePlayers()) return;
  broadcastGlobalStatusUpdate(false);
}, GLOBAL_STATUS_BROADCAST_MS);

registerInterval(() => {
  for (const player of players.values()) completeDueResearchForPlayer(player);
}, 1000);

if (SEASONS_ENABLED) {
  registerInterval(() => {
    if (now() >= activeSeason.endAt) startNewSeason();
  }, 60_000);
}

const app = Fastify({ logger: true });
runtimeState.appRef = app;
const serverDebugBundle = createServerDebugBundleStore();
const runtimeIncidentLog = createRuntimeIncidentLog({
  snapshotDir: SNAPSHOT_DIR,
  ...(RUNTIME_INCIDENT_WEBHOOK_URL ? { notifyWebhookUrl: RUNTIME_INCIDENT_WEBHOOK_URL } : {}),
  logger: app.log
});
runtimeIncidentLog.record("boot_started", { pid: process.pid, startedAt: startupState.startedAt });
await runtimeIncidentLog.notifyLastCrashReport();
await app.register(cors, { origin: true });
await app.register(websocket as never);

const runtimeVictoryOverview = (): Record<string, unknown> => {
  const objectives = currentVictoryPressureObjectives();
  const metrics = collectPlayerCompetitionMetrics();
  const aiMetrics = metrics.filter((metric) => players.get(metric.playerId)?.isAi);
  const topAiByTowns = [...aiMetrics]
    .sort((a, b) => b.controlledTowns - a.controlledTowns || b.settledTiles - a.settledTiles || a.playerId.localeCompare(b.playerId))
    .slice(0, 3)
    .map((metric) => ({
      playerId: metric.playerId,
      name: metric.name,
      towns: metric.controlledTowns,
      settledTiles: metric.settledTiles,
      incomePerMinute: roundTo(metric.incomePerMinute, 1),
      victoryPath: aiVictoryPathByPlayer.get(metric.playerId) ?? null
    }));
  const topAiBySettledTiles = [...aiMetrics]
    .sort((a, b) => b.settledTiles - a.settledTiles || b.controlledTowns - a.controlledTowns || a.playerId.localeCompare(b.playerId))
    .slice(0, 3)
    .map((metric) => ({
      playerId: metric.playerId,
      name: metric.name,
      settledTiles: metric.settledTiles,
      towns: metric.controlledTowns,
      incomePerMinute: roundTo(metric.incomePerMinute, 1),
      victoryPath: aiVictoryPathByPlayer.get(metric.playerId) ?? null
    }));
  const topAiByIncome = [...aiMetrics]
    .sort((a, b) => b.incomePerMinute - a.incomePerMinute || b.controlledTowns - a.controlledTowns || a.playerId.localeCompare(b.playerId))
    .slice(0, 3)
    .map((metric) => ({
      playerId: metric.playerId,
      name: metric.name,
      incomePerMinute: roundTo(metric.incomePerMinute, 1),
      towns: metric.controlledTowns,
      settledTiles: metric.settledTiles,
      victoryPath: aiVictoryPathByPlayer.get(metric.playerId) ?? null
    }));

  return {
    objectives,
    aiPathCounts: aiVictoryPathPopulationCounts(),
    topAiByTowns,
    topAiBySettledTiles,
    topAiByIncome
  };
};

const {
  cachedChunkPayloadDiagnostics,
  maybeLogRuntimeMemoryWatermark,
  logSnapshotSerializationMemory,
  runtimeCollectionDiagnostics,
  recordAiBudgetBreach,
  runtimeHotspotDiagnostics,
  runtimeDashboardPayload
} = createServerRuntimeAdminDashboard({
  cachedChunkSnapshotByPlayer,
  roundTo,
  runtimeMemoryWatermarkThresholdsMb: RUNTIME_MEMORY_WATERMARK_THRESHOLDS_MB,
  runtimeMemoryWatermarksLogged,
  logger: app.log,
  runtimeIncidentLog,
  players,
  ownership,
  townsByTile,
  barbarianAgents,
  clustersById,
  chunkSubscriptionByPlayer,
  cachedVisibilitySnapshotByPlayer,
  cachedSummaryChunkByChunkKey,
  chunkSnapshotGenerationByPlayer,
  chunkSnapshotSentAtByPlayer,
  actionTimestampsByPlayer,
  authIdentityByUid,
  verifiedFirebaseTokenCacheSize,
  townFeedingStateByPlayer,
  tileYieldByTile,
  tileHistoryByTile,
  terrainShapesByTile,
  economicStructuresByTile,
  docksByTile,
  fortsByTile,
  observatoriesByTile,
  siegeOutpostsByTile,
  runtimeIntervalsLength: () => runtimeIntervals.length,
  percentile,
  now,
  recentAiBudgetBreachPerf,
  aiTickBudgetMs: AI_TICK_BUDGET_MS,
  recentAiTickPerf,
  recentChunkSnapshotPerf,
  sampleRuntimeVitals,
  recentRuntimeVitals,
  cachedChunkPayloadDiagnosticsExtras: {
    onlineSocketCount,
    runtimeCpuCount,
    authPressurePending: () => authPressureState.pendingAuthVerifications,
    simulationCommandQueueDepth,
    aiSchedulerState,
    aiWorkerState,
    combatWorkerState,
    chunkSerializerWorkerState,
    chunkReadWorkerState,
    simulationCommandWorkerState,
    runtimeHotspotExtra: () => ({ chunkCacheMb: cachedChunkPayloadDiagnostics().approxPayloadMb }),
    runtimeVictoryOverview
  }
});

registerServerHttpRoutes(app, {
  startupState,
  activeSeason: () => activeSeason,
  seasonWinner: () => seasonWinner,
  activeRootNodeIds: () => activeSeasonTechConfig.rootNodeIds,
  activeTechNodeCount: () => activeSeasonTechConfig.activeNodeIds.size,
  archiveCount: () => seasonArchives.length,
  currentLeaderboardSnapshot,
  currentVictoryPressureObjectives,
  seasonArchives: () => seasonArchives,
  runtimeDashboardPayload,
  renderRuntimeDashboardHtml,
  runtimeIncidentLog,
  seasonsEnabled: SEASONS_ENABLED,
  startNewSeason,
  saveSnapshot,
  regenerateWorldInPlace,
  players,
  onlineSocketCount,
  townsByTile,
  parseKey,
  playerTile,
  townSupport,
  now,
  telemetryCounters,
  aiTurnDebugByPlayer,
  serverDebugBundle,
  buildAdminPlayersPayload: () =>
    buildAdminPlayerListPayload(
      [...players.values()].map((player) => {
        const settledTiles = [...player.territoryTiles].reduce(
          (count, tileKey) => count + (ownershipStateByTile.get(tileKey) === "SETTLED" ? 1 : 0),
          0
        );
        const frontierTiles = [...player.territoryTiles].reduce(
          (count, tileKey) => count + (ownershipStateByTile.get(tileKey) === "FRONTIER" ? 1 : 0),
          0
        );
        return {
          id: player.id,
          name: player.name,
          isAi: Boolean(player.isAi),
          ...(player.tileColor ? { rawTileColor: player.tileColor } : {}),
          effectiveTileColor: player.tileColor ?? colorFromId(player.id),
          visualStyle: empireStyleFromPlayer(player),
          shieldUntil: player.spawnShieldUntil,
          territoryTiles: player.territoryTiles.size,
          settledTiles,
          frontierTiles
        };
      }),
      now()
    )
});

(
  app as unknown as {
    get: (path: string, opts: { websocket: boolean }, handler: (connection: unknown) => void) => void;
  }
).get("/ws", { websocket: true }, (connection) => {
  const maybeSocket = (connection as { socket?: Ws; request?: { url?: string } } | Ws);
  const socket: Ws | undefined = (
    "socket" in maybeSocket ? maybeSocket.socket : maybeSocket
  ) as Ws | undefined;
  const requestUrl = "request" in maybeSocket ? maybeSocket.request?.url : undefined;
  const socketChannel: "control" | "bulk" = (() => {
    if (!requestUrl) return "control";
    try {
      const parsed = new URL(requestUrl, "http://localhost");
      return parsed.searchParams.get("channel") === "bulk" ? "bulk" : "control";
    } catch {
      return "control";
    }
  })();
  if (!socket || typeof socket.on !== "function" || typeof socket.send !== "function") {
    app.log.error({ connectionType: typeof connection }, "Invalid websocket connection object");
    return;
  }
  let authedPlayer: Player | undefined;

  socket.on("message", async (buf: import("ws").RawData) => {
    let raw: unknown;
    try {
      raw = JSON.parse(buf.toString());
    } catch {
      socket.send(JSON.stringify({ type: "ERROR", code: "BAD_JSON", message: "invalid JSON payload" }));
      return;
    }
    const parsed = ClientMessageSchema.safeParse(raw);
    if (!parsed.success) {
      socket.send(JSON.stringify({ type: "ERROR", code: "BAD_MSG", message: parsed.error.message }));
      return;
    }

    const msg = parsed.data as import("@border-empires/shared").ClientMessage;

    if (!startupState.ready) {
      socket.send(JSON.stringify({ type: "ERROR", code: "SERVER_STARTING", message: "server is still starting" }));
      return;
    }

    if (msg.type === "AUTH") {
      const authStartedAt = now();
      authPressureState.authPriorityUntil = Math.max(authPressureState.authPriorityUntil, now() + AUTH_PRIORITY_WINDOW_MS);
      if (socketChannel === "control") {
        sendLoginPhase(socket, "AUTH_RECEIVED", "Securing session", "Game server reached. Verifying your Google session...");
      }
      let decoded = cachedFirebaseIdentityForDecodedToken(msg.token);
      try {
        if (!decoded) {
          const verified = await verifyFirebaseToken(msg.token);
          decoded = {
            uid: String(verified.uid ?? ""),
            email: typeof verified.email === "string" ? verified.email : undefined,
            name: typeof verified.name === "string" ? verified.name : undefined
          };
          cacheVerifiedFirebaseIdentity(msg.token, decoded, typeof verified.exp === "number" ? verified.exp : undefined);
        }
      } catch (err) {
        const authError = classifyAuthError(err);
        if (!decoded) decoded = cachedFirebaseIdentityForDecodedToken(msg.token);
        if (decoded) {
          app.log.warn({ err }, "firebase token verification fallback to cached identity");
        } else {
          if (authError.code === "AUTH_UNAVAILABLE") {
            const fallback = decodeFirebaseTokenFallback(msg.token);
            if (fallback) {
              decoded = {
                uid: fallback.uid,
                email: fallback.email,
                name: fallback.name
              };
              cacheVerifiedFirebaseIdentity(msg.token, decoded, fallback.exp);
              app.log.warn(
                {
                  uid: fallback.uid,
                  authErrorCode: authError.code
                },
                "firebase token verification fallback to unverified payload"
              );
            }
          }
        }
        if (!decoded) {
          app.log.warn(
            {
              err,
              authErrorCode: authError.code
            },
            "firebase token verification failed"
          );
          socket.send(JSON.stringify({ type: "ERROR", code: authError.code, message: authError.message }));
          return;
        }
      }
      if (!decoded.uid) {
        socket.send(JSON.stringify({ type: "ERROR", code: "AUTH_FAIL", message: "Firebase token missing user id." }));
        return;
      }
      const preferredName = decoded.name || decoded.email?.split("@")[0] || `Empire-${decoded.uid.slice(0, 6)}`;
      const existingIdentity = authIdentityByUid.get(decoded.uid);
      const identity: AuthIdentity = existingIdentity ?? {
        uid: decoded.uid,
        playerId: "",
        name: uniquePlayerName(decoded.uid, preferredName),
        email: decoded.email
      };
      if (!existingIdentity) {
        authIdentityByUid.set(decoded.uid, identity);
      } else {
        identity.email = decoded.email;
      }
      const player = getOrCreatePlayerForIdentity(identity);
      if (!player) {
        socket.send(JSON.stringify({ type: "ERROR", code: "AUTH_FAIL", message: "player initialization failed" }));
        return;
      }
      const verifiedAt = now();
      if (socketChannel === "control") {
        authSyncTimingByPlayer.set(player.id, { authVerifiedAt: verifiedAt });
        sendLoginPhase(socket, "AUTH_VERIFIED", "Securing session", "Google session verified. Loading your empire record...");
      }
      app.log.info(
        {
          playerId: player.id,
          uid: decoded.uid,
          cachedToken: Boolean(cachedFirebaseIdentityForToken(msg.token)),
          cachedUidIdentity: !cachedFirebaseIdentityForToken(msg.token) && Boolean(cachedFirebaseIdentityForDecodedToken(msg.token)),
          verifyElapsedMs: verifiedAt - authStartedAt
        },
        "auth verified"
      );
      runtimeIncidentLog.record("auth_verified", {
        playerId: player.id,
        uid: decoded.uid,
        cachedToken: Boolean(cachedFirebaseIdentityForToken(msg.token)),
        cachedUidIdentity: !cachedFirebaseIdentityForToken(msg.token) && Boolean(cachedFirebaseIdentityForDecodedToken(msg.token)),
        verifyElapsedMs: verifiedAt - authStartedAt
      });

      authedPlayer = player;
      if (socketChannel === "bulk") {
        bulkSocketsByPlayer.set(player.id, socket);
        const sub = chunkSubscriptionByPlayer.get(player.id);
        if (sub) sendChunkSnapshot(socket, player, sub);
        return;
      }

      socketsByPlayer.set(player.id, socket);
      resumeVictoryPressureTimers();
      completeDueResearchForPlayer(player);
      applyManpowerRegen(player);
      const economy = playerEconomySnapshot(player);
      const strategicStocks = getOrInitStrategicStocks(player.id);
      const dockPairs = exportDockPairs();
      const offlineActivity = consumeOfflinePlayerActivity(player.id);
      const techPayload = techPayloadSnapshotForPlayer(player, "init");
      sendLoginPhase(socket, "PLAYER_LOADED", "Connecting your empire...", "Empire record ready. Preparing your session...");
      socket.send(
        JSON.stringify({
          type: "INIT",
          player: {
            id: player.id,
            name: player.name,
            profileNeedsSetup: player.profileComplete !== true,
            gold: player.points,
            points: player.points,
            level: player.level,
            mods: player.mods,
            modBreakdown: playerModBreakdown(player),
            incomePerMinute: economy.incomePerMinute,
            strategicResources: strategicStocks,
            strategicProductionPerMinute: economy.strategicProductionPerMinute,
            economyBreakdown: economy.economyBreakdown,
            upkeepPerMinute: economy.upkeepPerMinute,
            upkeepLastTick: economy.upkeepLastTick,
            stamina: player.stamina,
            manpower: player.manpower,
            manpowerCap: playerManpowerCap(player),
            manpowerRegenPerMinute: playerManpowerRegenPerMinute(player),
            manpowerBreakdown: playerManpowerBreakdown(player),
            T: player.T,
            E: player.E,
            Ts: player.Ts,
            Es: player.Es,
            techRootId: player.techRootId,
            techIds: [...player.techIds],
            currentResearch: player.currentResearch,
            domainIds: [...player.domainIds],
            allies: [...player.allies],
            tileColor: player.tileColor,
            visualStyle: empireStyleFromPlayer(player),
            homeTile: playerHomeTile(player),
            availableTechPicks: availableTechPicks(player),
            developmentProcessLimit: developmentProcessCapacityForPlayer(player.id),
            activeDevelopmentProcessCount: activeDevelopmentProcessCountForPlayer(player.id),
            revealCapacity: revealCapacityForPlayer(player),
            activeRevealTargets: [...getOrInitRevealTargets(player.id)],
            abilityCooldowns: Object.fromEntries(getAbilityCooldowns(player.id)),
            activeTruces: activeTruceViewsForPlayer(player.id),
            activeAetherBridges: [...activeAetherBridgesById.values()]
              .filter((bridge) => bridge.ownerId === player.id)
              .map((bridge) => {
                const [fromX, fromY] = parseKey(bridge.fromTileKey);
                const [toX, toY] = parseKey(bridge.toTileKey);
                return { bridgeId: bridge.bridgeId, ownerId: bridge.ownerId, from: { x: fromX, y: fromY }, to: { x: toX, y: toY }, startedAt: bridge.startedAt, endsAt: bridge.endsAt };
              }),
            activeAetherWalls: activeAetherWallViews(),
            strategicReplayEvents,
            pendingSettlements: [...pendingSettlementsByTile.values()]
              .filter((settlement) => settlement.ownerId === player.id)
              .map((settlement) => {
                const [x, y] = parseKey(settlement.tileKey);
                return { x, y, startedAt: settlement.startedAt, resolvesAt: settlement.resolvesAt };
              })
          },
          config: {
            width: WORLD_WIDTH,
            height: WORLD_HEIGHT,
            chunkSize: CHUNK_SIZE,
            visionRadius: VISION_RADIUS,
            fogDisabled: DISABLE_FOG || fogDisabledByPlayer.get(player.id) === true,
            season: activeSeason,
            seasonTechTreeId: activeSeason.techTreeConfigId
          },
          mapMeta: {
            dockCount: dockById.size,
            dockPairCount: dockPairs.length,
            clusterCount: clustersById.size,
            townCount: townsByTile.size,
            dockPairs
          },
          shardRainNotice: shardRainNoticePayload(),
          techChoices: techPayload.techChoices,
          techCatalog: techPayload.techCatalog,
          domainChoices: reachableDomains(player),
          domainCatalog: activeDomainCatalog(player),
          playerStyles: exportPlayerStyles(),
          missions: missionPayload(player),
          leaderboard: leaderboardSnapshotForPlayer(player.id),
          seasonVictory: seasonVictoryObjectivesForPlayer(player.id),
          seasonWinner,
          allianceRequests: [...allianceRequests.values()].filter((r) => r.toPlayerId === player.id),
          outgoingAllianceRequests: [...allianceRequests.values()].filter((r) => r.fromPlayerId === player.id),
          truceRequests: [...truceRequests.values()].filter((r) => r.toPlayerId === player.id),
          outgoingTruceRequests: [...truceRequests.values()].filter((r) => r.fromPlayerId === player.id),
          offlineActivity
        })
      );
      const authSync = authSyncTimingByPlayer.get(player.id);
      if (authSync) {
        authSync.initSentAt = now();
        sendLoginPhase(socket, "INITIAL_SYNC", "Connecting your empire...", "Empire session ready. Waiting for your first world sync...");
        app.log.info(
          {
            playerId: player.id,
            sinceAuthVerifiedMs: authSync.initSentAt - (authSync.authVerifiedAt ?? authSync.initSentAt)
          },
          "auth sync init sent"
        );
        runtimeIncidentLog.record("auth_sync_init", {
          playerId: player.id,
          sinceAuthVerifiedMs: authSync.initSentAt - (authSync.authVerifiedAt ?? authSync.initSentAt)
        });
      }
      return;
    }

    if (!authedPlayer) {
      socket.send(JSON.stringify({ type: "ERROR", code: "NO_AUTH", message: "auth first" }));
      return;
    }
    const actor = authedPlayer;
    if (!actor.isAi && humanFrontierActionMessage(msg)) noteHumanFrontierActionPriority();
    if (await simulationService.handleGatewayMessage(actor, msg, socket)) return;

    if (msg.type === "PING") {
      socket.send(JSON.stringify({ type: "PONG", t: msg.t }));
      return;
    }

    if (msg.type === "SET_TILE_COLOR") {
      actor.tileColor = msg.color;
      broadcastBulk({ type: "PLAYER_STYLE", playerId: actor.id, ...playerStylePayload(actor) });
      return;
    }

    if (msg.type === "SET_PROFILE") {
      const displayName = normalizedPlayerHandle(msg.displayName);
      if (displayName.length < 2) {
        socket.send(JSON.stringify({ type: "ERROR", code: "BAD_PROFILE", message: "Display name must be at least 2 characters." }));
        return;
      }
      actor.name = claimPlayerName(actor.id, displayName);
      actor.tileColor = msg.color;
      actor.profileComplete = true;
      for (const identity of authIdentityByUid.values()) {
        if (identity.playerId === actor.id) {
          identity.name = actor.name;
          break;
        }
      }
      broadcastBulk({ type: "PLAYER_STYLE", playerId: actor.id, ...playerStylePayload(actor) });
      sendPlayerUpdate(actor, 0);
      return;
    }

    if (msg.type === "SET_FOG_DISABLED") {
      if (!playerHasFogAdminAccess(actor.id)) {
        socket.send(JSON.stringify({ type: "ERROR", code: "ADMIN_ONLY", message: "fog toggle is admin-only" }));
        return;
      }
      fogDisabledByPlayer.set(actor.id, msg.disabled);
      const responseSocket = bulkSocketForPlayer(actor.id) ?? socket;
      responseSocket.send(JSON.stringify({ type: "FOG_UPDATE", fogDisabled: DISABLE_FOG || msg.disabled }));
      const sub = chunkSubscriptionByPlayer.get(actor.id);
      if (sub) {
        sendChunkSnapshot(responseSocket, actor, sub);
      }
      return;
    }

    if (msg.type === "SETTLE") {
      const out = startSettlement(actor, msg.x, msg.y);
      if (!out.ok) {
        socket.send(JSON.stringify({ type: "ERROR", code: "SETTLE_INVALID", message: out.reason, x: msg.x, y: msg.y }));
        return;
      }
      sendPlayerUpdate(actor, 0);
      return;
    }

    if (msg.type === "REVEAL_EMPIRE") {
      const out = tryActivateRevealEmpire(actor, msg.targetPlayerId);
      if (!out.ok) {
        socket.send(JSON.stringify({ type: "ERROR", code: "REVEAL_EMPIRE_INVALID", message: out.reason }));
        return;
      }
      sendToPlayer(actor.id, {
        type: "REVEAL_EMPIRE_UPDATE",
        activeTargets: [...getOrInitRevealTargets(actor.id)],
        revealCapacity: revealCapacityForPlayer(actor)
      });
      sendPlayerUpdate(actor, 0);
      refreshSubscribedViewForPlayer(actor.id);
      return;
    }

    if (msg.type === "REVEAL_EMPIRE_STATS") {
      const out = tryRevealEmpireStats(actor, msg.targetPlayerId);
      if (!out.ok) {
        socket.send(JSON.stringify({ type: "ERROR", code: "REVEAL_EMPIRE_STATS_INVALID", message: out.reason }));
        return;
      }
      sendPlayerUpdate(actor, 0);
      sendToPlayer(actor.id, { type: "REVEAL_EMPIRE_STATS_RESULT", stats: out.stats });
      return;
    }

    if (msg.type === "CAST_AETHER_WALL") {
      const out = tryCastAetherWall(actor, msg.x, msg.y, msg.direction, msg.length, {
        ignoreRequirements: socketUsesLoopback(socket)
      });
      if (!out.ok) {
        socket.send(JSON.stringify({ type: "ERROR", code: "AETHER_WALL_INVALID", message: out.reason }));
        return;
      }
      sendPlayerUpdate(actor, 0);
      broadcastAetherWallUpdate();
      return;
    }

    if (msg.type === "CAST_AETHER_BRIDGE") {
      const out = tryCastAetherBridge(actor, msg.x, msg.y);
      if (!out.ok) {
        socket.send(JSON.stringify({ type: "ERROR", code: "AETHER_BRIDGE_INVALID", message: out.reason }));
        return;
      }
      sendPlayerUpdate(actor, 0);
      broadcast({
        type: "AETHER_BRIDGE_UPDATE",
        playerId: actor.id,
        bridges: [...activeAetherBridgesById.values()]
          .filter((bridge) => bridge.ownerId === actor.id)
          .map((bridge) => {
            const [fromX, fromY] = parseKey(bridge.fromTileKey);
            const [toX, toY] = parseKey(bridge.toTileKey);
            return { bridgeId: bridge.bridgeId, ownerId: bridge.ownerId, from: { x: fromX, y: fromY }, to: { x: toX, y: toY }, startedAt: bridge.startedAt, endsAt: bridge.endsAt };
          })
      });
      return;
    }

    if (msg.type === "SIPHON_TILE") {
      const out = trySiphonTile(actor, msg.x, msg.y);
      if (!out.ok) {
        socket.send(JSON.stringify({ type: "ERROR", code: "SIPHON_INVALID", message: out.reason }));
        return;
      }
      const target = runtimeTileCore(msg.x, msg.y);
      sendPlayerUpdate(actor, 0);
      sendVisibleTileDeltaAt(target.x, target.y);
      if (target.ownerId && target.ownerId !== actor.id) {
        sendToPlayer(target.ownerId, {
          type: "ATTACK_ALERT",
          attackerId: actor.id,
          attackerName: `${actor.name} siphon`,
          x: target.x,
          y: target.y,
          resolvesAt: now() + SIPHON_DURATION_MS
        });
      }
      return;
    }

    if (msg.type === "PURGE_SIPHON") {
      const out = tryPurgeSiphon(actor, msg.x, msg.y);
      if (!out.ok) {
        socket.send(JSON.stringify({ type: "ERROR", code: "PURGE_SIPHON_INVALID", message: out.reason }));
        return;
      }
      sendPlayerUpdate(actor, 0);
      sendVisibleTileDeltaAt(msg.x, msg.y);
      return;
    }

    if (msg.type === "BUILD_FORT") {
      const out = tryBuildFort(actor, msg.x, msg.y);
      if (!out.ok) {
        socket.send(JSON.stringify({ type: "ERROR", code: "FORT_BUILD_INVALID", message: out.reason }));
        return;
      }
      updateOwnership(msg.x, msg.y, actor.id);
      sendPlayerUpdate(actor, 0);
      return;
    }

    if (msg.type === "BUILD_OBSERVATORY") {
      const out = tryBuildObservatory(actor, msg.x, msg.y);
      if (!out.ok) {
        socket.send(JSON.stringify({ type: "ERROR", code: "OBSERVATORY_BUILD_INVALID", message: out.reason }));
        return;
      }
      updateOwnership(msg.x, msg.y, actor.id);
      sendPlayerUpdate(actor, 0);
      return;
    }

    if (msg.type === "BUILD_ECONOMIC_STRUCTURE") {
      const out = tryBuildEconomicStructure(actor, msg.x, msg.y, msg.structureType);
      if (!out.ok) {
        socket.send(JSON.stringify({ type: "ERROR", code: "ECONOMIC_STRUCTURE_BUILD_INVALID", message: out.reason }));
        return;
      }
      updateOwnership(msg.x, msg.y, actor.id);
      sendPlayerUpdate(actor, 0);
      return;
    }

    if (msg.type === "OVERLOAD_SYNTHESIZER") {
      const out = tryOverloadSynthesizer(actor, msg.x, msg.y);
      if (!out.ok) {
        socket.send(JSON.stringify({ type: "ERROR", code: "SYNTH_OVERLOAD_INVALID", message: out.reason }));
        return;
      }
      sendPlayerUpdate(actor, 0);
      return;
    }

    if (msg.type === "SET_CONVERTER_STRUCTURE_ENABLED") {
      const out = trySetConverterStructureEnabled(actor, msg.x, msg.y, msg.enabled);
      if (!out.ok) {
        socket.send(JSON.stringify({ type: "ERROR", code: "CONVERTER_TOGGLE_INVALID", message: out.reason }));
        return;
      }
      updateOwnership(msg.x, msg.y, actor.id);
      sendPlayerUpdate(actor, 0);
      return;
    }

    if (msg.type === "CREATE_MOUNTAIN") {
      const out = tryCreateMountain(actor, msg.x, msg.y);
      if (!out.ok) {
        socket.send(JSON.stringify({ type: "ERROR", code: "CREATE_MOUNTAIN_INVALID", message: out.reason }));
        return;
      }
      sendPlayerUpdate(actor, 0);
      broadcastLocalVisionDelta([{ x: wrapX(msg.x, WORLD_WIDTH), y: wrapY(msg.y, WORLD_HEIGHT) }]);
      return;
    }

    if (msg.type === "REMOVE_MOUNTAIN") {
      const out = tryRemoveMountain(actor, msg.x, msg.y);
      if (!out.ok) {
        socket.send(JSON.stringify({ type: "ERROR", code: "REMOVE_MOUNTAIN_INVALID", message: out.reason }));
        return;
      }
      sendPlayerUpdate(actor, 0);
      broadcastLocalVisionDelta([{ x: wrapX(msg.x, WORLD_WIDTH), y: wrapY(msg.y, WORLD_HEIGHT) }]);
      return;
    }

    if (msg.type === "AIRPORT_BOMBARD") {
      const targetX = wrapX(msg.toX, WORLD_WIDTH);
      const targetY = wrapY(msg.toY, WORLD_HEIGHT);
      const radarKey = hostileRadarProtectingTile(actor, targetX, targetY);
      if (radarKey) {
        const radar = economicStructuresByTile.get(radarKey);
        if (radar) {
          sendToPlayer(radar.ownerId, {
            type: "ATTACK_ALERT",
            attackerId: actor.id,
            attackerName: actor.name,
            x: targetX,
            y: targetY,
            fromX: wrapX(msg.fromX, WORLD_WIDTH),
            fromY: wrapY(msg.fromY, WORLD_HEIGHT),
            resolvesAt: now()
          });
        }
      }
      const out = tryAirportBombard(actor, msg.fromX, msg.fromY, msg.toX, msg.toY);
      if (!out.ok) {
        socket.send(JSON.stringify({ type: "ERROR", code: "AIRPORT_BOMBARD_INVALID", message: out.reason }));
        return;
      }
      socket.send(JSON.stringify({
        type: "AIRPORT_BOMBARD_RESULT",
        fromX: wrapX(msg.fromX, WORLD_WIDTH),
        fromY: wrapY(msg.fromY, WORLD_HEIGHT),
        toX: wrapX(msg.toX, WORLD_WIDTH),
        toY: wrapY(msg.toY, WORLD_HEIGHT),
        destroyed: out.destroyed ?? 0
      }));
      sendPlayerUpdate(actor, 0);
      return;
    }

    if (msg.type === "CANCEL_FORT_BUILD") {
      const tk = key(wrapX(msg.x, WORLD_WIDTH), wrapY(msg.y, WORLD_HEIGHT));
      const fort = fortsByTile.get(tk);
      if (!fort || fort.ownerId !== actor.id || fort.status !== "under_construction") {
        socket.send(JSON.stringify({ type: "ERROR", code: "FORT_CANCEL_INVALID", message: "no fort under construction on tile" }));
        return;
      }
      cancelFortBuild(tk);
      updateOwnership(msg.x, msg.y, actor.id);
      return;
    }

    if (msg.type === "CANCEL_STRUCTURE_BUILD") {
      const tk = key(wrapX(msg.x, WORLD_WIDTH), wrapY(msg.y, WORLD_HEIGHT));
      const out = cancelInProgressBuildForPlayer(actor, tk);
      if (!out.ok) {
        socket.send(JSON.stringify({ type: "ERROR", code: out.code, message: out.message }));
        return;
      }
      updateOwnership(msg.x, msg.y, actor.id);
      return;
    }

    if (msg.type === "REMOVE_STRUCTURE") {
      const out = tryRemoveStructure(actor, msg.x, msg.y);
      if (!out.ok) {
        socket.send(JSON.stringify({ type: "ERROR", code: "STRUCTURE_REMOVE_INVALID", message: out.reason }));
        return;
      }
      updateOwnership(msg.x, msg.y, actor.id);
      sendPlayerUpdate(actor, 0);
      return;
    }

    if (msg.type === "BUILD_SIEGE_OUTPOST") {
      const out = tryBuildSiegeOutpost(actor, msg.x, msg.y);
      if (!out.ok) {
        socket.send(JSON.stringify({ type: "ERROR", code: "SIEGE_OUTPOST_BUILD_INVALID", message: out.reason }));
        return;
      }
      updateOwnership(msg.x, msg.y, actor.id);
      sendPlayerUpdate(actor, 0);
      return;
    }

    if (msg.type === "CANCEL_SIEGE_OUTPOST_BUILD") {
      const tk = key(wrapX(msg.x, WORLD_WIDTH), wrapY(msg.y, WORLD_HEIGHT));
      const siege = siegeOutpostsByTile.get(tk);
      if (!siege || siege.ownerId !== actor.id || siege.status !== "under_construction") {
        socket.send(JSON.stringify({ type: "ERROR", code: "SIEGE_OUTPOST_CANCEL_INVALID", message: "no siege outpost under construction on tile" }));
        return;
      }
      cancelSiegeOutpostBuild(tk);
      updateOwnership(msg.x, msg.y, actor.id);
      return;
    }

    if (msg.type === "CANCEL_CAPTURE") {
      const pending = pendingCapturesByAttacker(actor.id);
      const pendingSettles = [...pendingSettlementsByTile.values()].filter((s) => s.ownerId === actor.id);
      if (pending.length === 0 && pendingSettles.length === 0) {
        socket.send(JSON.stringify({ type: "ERROR", code: "NO_ACTIVE_CAPTURE", message: "no active capture to cancel" }));
        return;
      }
      let refunded = 0;
      for (const pcap of pending) {
        refunded += pcap.staminaCost;
        cancelPendingCapture(pcap);
      }
      for (const settle of pendingSettles) {
        clearPendingSettlement(settle);
        refundPendingSettlement(settle);
      }
      if (refunded > 0) actor.stamina = Math.min(STAMINA_MAX, actor.stamina + refunded);
      socket.send(JSON.stringify({ type: "COMBAT_CANCELLED", count: pending.length + pendingSettles.length }));
      sendPlayerUpdate(actor, 0);
      return;
    }

    if (msg.type === "COLLECT_TILE") {
      const tk = key(wrapX(msg.x, WORLD_WIDTH), wrapY(msg.y, WORLD_HEIGHT));
      const [x, y] = parseKey(tk);
      const t = playerTile(x, y);
      if (t.ownerId !== actor.id) {
        socket.send(JSON.stringify({ type: "ERROR", code: "COLLECT_EMPTY", message: "tile is not owned by you", x, y }));
        return;
      }
      if (t.terrain !== "LAND") {
        socket.send(JSON.stringify({ type: "ERROR", code: "COLLECT_EMPTY", message: "tile is not land", x, y }));
        return;
      }
      if (t.ownershipState !== "SETTLED") {
        socket.send(JSON.stringify({ type: "ERROR", code: "COLLECT_EMPTY", message: "only settled tiles can be collected", x, y }));
        return;
      }
      const got = collectYieldFromTile(actor, tk);
      const touched = got.gold > 0 || hasPositiveStrategicBuffer(got.strategic);
      if (!touched) {
        socket.send(JSON.stringify({ type: "ERROR", code: "COLLECT_EMPTY", message: "yield is empty (upkeep may have consumed it)", x, y }));
        return;
      }
      recalcPlayerDerived(actor);
      sendBulkToPlayer(actor.id, { type: "TILE_DELTA", updates: [playerTile(x, y)] });
      sendToPlayer(actor.id, { type: "COLLECT_RESULT", mode: "tile", x, y, gold: got.gold, strategic: got.strategic });
      sendPlayerUpdate(actor, got.gold);
      return;
    }

    if (msg.type === "COLLECT_SHARD") {
      const x = wrapX(msg.x, WORLD_WIDTH);
      const y = wrapY(msg.y, WORLD_HEIGHT);
      const result = collectShardSite(actor, x, y);
      if (!result.ok || !result.amount) {
        socket.send(JSON.stringify({ type: "ERROR", code: "COLLECT_EMPTY", message: result.reason ?? "no shard present", x, y }));
        return;
      }
      sendToPlayer(actor.id, { type: "COLLECT_RESULT", mode: "tile", x, y, gold: 0, strategic: { SHARD: result.amount } });
      sendPlayerUpdate(actor, 0);
      return;
    }

    if (msg.type === "COLLECT_VISIBLE") {
      const cdUntil = collectVisibleCooldownByPlayer.get(actor.id) ?? 0;
      if (cdUntil > now()) {
        socket.send(JSON.stringify({ type: "ERROR", code: "COLLECT_COOLDOWN", message: "collect visible is on cooldown" }));
        return;
      }
      const got = collectVisibleYield(actor);
      collectVisibleCooldownByPlayer.set(actor.id, now() + COLLECT_VISIBLE_COOLDOWN_MS);
      if (got.touchedTileKeys.length > 0) {
        const updates = got.touchedTileKeys.map((tk) => {
          const [x, y] = parseKey(tk);
          return playerTile(x, y);
        });
        sendBulkToPlayer(actor.id, { type: "TILE_DELTA", updates });
      }
      sendToPlayer(actor.id, { type: "COLLECT_RESULT", mode: "visible", tiles: got.tiles, gold: got.gold, strategic: got.strategic });
      sendPlayerUpdate(actor, got.gold);
      return;
    }

    if (msg.type === "UNCAPTURE_TILE") {
      const t = runtimeTileCore(msg.x, msg.y);
      if (t.ownerId !== actor.id) {
        socket.send(JSON.stringify({ type: "ERROR", code: "UNCAPTURE_NOT_OWNER", message: "tile is not owned by you" }));
        return;
      }
      if (actor.T <= 1) {
        socket.send(JSON.stringify({ type: "ERROR", code: "UNCAPTURE_LAST_TILE", message: "cannot uncapture your last tile" }));
        return;
      }
      const tk = key(t.x, t.y);
      if (isRelocatableSettlementTown(townsByTile.get(tk))) {
        socket.send(JSON.stringify({ type: "ERROR", code: "UNCAPTURE_SETTLEMENT", message: "cannot abandon your settlement" }));
        return;
      }
      if (combatLocks.has(tk)) {
        socket.send(JSON.stringify({ type: "ERROR", code: "LOCKED", message: "tile locked in combat" }));
        return;
      }
      updateOwnership(t.x, t.y, undefined);
      updateMissionState(actor);
      resolveEliminationIfNeeded(actor, true);
      sendPlayerUpdate(actor, 0);
      return;
    }

    if (msg.type === "CHOOSE_TECH") {
      const outcome = startTechResearch(actor, msg.techId);
      if (!outcome.ok) {
        socket.send(JSON.stringify({ type: "ERROR", code: "TECH_INVALID", message: outcome.reason }));
        return;
      }
      applyManpowerRegen(actor);
      recomputeClusterBonusForPlayer(actor);
      sendTechUpdate(actor, "completed");
      broadcastBulk({ type: "PLAYER_STYLE", playerId: actor.id, ...playerStylePayload(actor) });
      sendPlayerUpdate(actor, 0);
      return;
    }

    if (msg.type === "CHOOSE_DOMAIN") {
      const outcome = applyDomain(actor, msg.domainId);
      if (!outcome.ok) {
        socket.send(JSON.stringify({ type: "ERROR", code: "DOMAIN_INVALID", message: outcome.reason }));
        return;
      }
      recomputeClusterBonusForPlayer(actor);
      socket.send(
        JSON.stringify({
          type: "DOMAIN_UPDATE",
          domainIds: [...actor.domainIds],
          developmentProcessLimit: developmentProcessCapacityForPlayer(actor.id),
          activeDevelopmentProcessCount: activeDevelopmentProcessCountForPlayer(actor.id),
          mods: actor.mods,
          modBreakdown: playerModBreakdown(actor),
          incomePerMinute: currentIncomePerMinute(actor),
          domainChoices: reachableDomains(actor),
          domainCatalog: activeDomainCatalog(actor),
          missions: missionPayload(actor),
          revealCapacity: revealCapacityForPlayer(actor),
          activeRevealTargets: [...getOrInitRevealTargets(actor.id)]
        })
      );
      broadcastBulk({ type: "PLAYER_STYLE", playerId: actor.id, ...playerStylePayload(actor) });
      sendPlayerUpdate(actor, 0);
      return;
    }

    if (msg.type === "ALLIANCE_REQUEST") {
      const targetNameNeedle = msg.targetPlayerName.trim().toLocaleLowerCase();
      const target = [...players.values()].find((p) => p.name.trim().toLocaleLowerCase() === targetNameNeedle);
      if (!target || target.id === actor.id) {
        socket.send(JSON.stringify({ type: "ERROR", code: "ALLIANCE_TARGET", message: "target not found" }));
        return;
      }
      if (actor.allies.has(target.id)) {
        socket.send(JSON.stringify({ type: "ERROR", code: "ALLIANCE_EXISTS", message: "already allied" }));
        return;
      }
      const existingRequest = findAllianceRequestBetweenPlayers(allianceRequests.values(), actor.id, target.id);
      if (existingRequest) {
        const message =
          existingRequest.fromPlayerId === actor.id
            ? "alliance request already pending"
            : "that player already sent you an alliance request";
        socket.send(JSON.stringify({ type: "ERROR", code: "ALLIANCE_REQUEST_PENDING", message }));
        return;
      }
      const request: AllianceRequest = {
        id: crypto.randomUUID(),
        fromPlayerId: actor.id,
        toPlayerId: target.id,
        createdAt: now(),
        fromName: actor.name,
        toName: target.name
      };
      allianceRequests.set(request.id, request);
      socket.send(JSON.stringify({ type: "ALLIANCE_REQUESTED", request, targetName: target.name }));
      socketsByPlayer.get(target.id)?.send(JSON.stringify({ type: "ALLIANCE_REQUEST_INCOMING", request, fromName: actor.name }));
      return;
    }

    if (msg.type === "TRUCE_REQUEST") {
      const targetNameNeedle = msg.targetPlayerName.trim().toLocaleLowerCase();
      const target = [...players.values()].find((p) => p.name.trim().toLocaleLowerCase() === targetNameNeedle);
      if (!target || target.id === actor.id) {
        socket.send(JSON.stringify({ type: "ERROR", code: "TRUCE_TARGET", message: "target not found" }));
        return;
      }
      if (playerHasActiveTruce(actor.id)) {
        socket.send(JSON.stringify({ type: "ERROR", code: "TRUCE_EXISTS", message: "you already have an active truce" }));
        return;
      }
      if (playerHasActiveTruce(target.id)) {
        socket.send(JSON.stringify({ type: "ERROR", code: "TRUCE_EXISTS", message: "target already has an active truce" }));
        return;
      }
      if (isFinalPushActive() && msg.durationHours > 12) {
        socket.send(JSON.stringify({ type: "ERROR", code: "TRUCE_INVALID", message: "Final Push only allows 12h truces" }));
        return;
      }
      const request: TruceRequest = {
        id: crypto.randomUUID(),
        fromPlayerId: actor.id,
        toPlayerId: target.id,
        createdAt: now(),
        expiresAt: now() + TRUCE_REQUEST_TTL_MS,
        durationHours: msg.durationHours,
        fromName: actor.name,
        toName: target.name
      };
      truceRequests.set(request.id, request);
      socket.send(JSON.stringify({ type: "TRUCE_REQUESTED", request, targetName: target.name }));
      socketsByPlayer.get(target.id)?.send(JSON.stringify({ type: "TRUCE_REQUEST_INCOMING", request, fromName: actor.name }));
      return;
    }

    if (msg.type === "ALLIANCE_ACCEPT") {
      const request = findAllianceRequestForRecipient(allianceRequests, msg.requestId, actor.id);
      if (!request) {
        socket.send(JSON.stringify({ type: "ERROR", code: "ALLIANCE_REQUEST_INVALID", message: "request invalid" }));
        return;
      }
      const from = players.get(request.fromPlayerId);
      if (!from) {
        socket.send(JSON.stringify({ type: "ERROR", code: "ALLIANCE_REQUEST_INVALID", message: "request sender offline/unknown" }));
        allianceRequests.delete(msg.requestId);
        return;
      }
      actor.allies.add(from.id);
      from.allies.add(actor.id);
      recomputeExposure(actor);
      recomputeExposure(from);
      allianceRequests.delete(msg.requestId);
      broadcastAllianceUpdate(actor, from);
      return;
    }

    if (msg.type === "ALLIANCE_REJECT") {
      const request = findAllianceRequestForRecipient(allianceRequests, msg.requestId, actor.id);
      if (!request) {
        socket.send(JSON.stringify({ type: "ERROR", code: "ALLIANCE_REQUEST_INVALID", message: "request invalid" }));
        return;
      }
      const from = players.get(request.fromPlayerId);
      allianceRequests.delete(msg.requestId);
      if (!from) return;
      broadcastAllianceUpdate(actor, from);
      return;
    }

    if (msg.type === "ALLIANCE_CANCEL") {
      const request = findAllianceRequestForSender(allianceRequests, msg.requestId, actor.id);
      if (!request) {
        socket.send(JSON.stringify({ type: "ERROR", code: "ALLIANCE_REQUEST_INVALID", message: "request invalid" }));
        return;
      }
      const target = players.get(request.toPlayerId);
      allianceRequests.delete(msg.requestId);
      if (!target) return;
      broadcastAllianceUpdate(actor, target);
      return;
    }

    if (msg.type === "TRUCE_ACCEPT") {
      const request = truceRequests.get(msg.requestId);
      if (!request || request.toPlayerId !== actor.id || request.expiresAt < now()) {
        socket.send(JSON.stringify({ type: "ERROR", code: "TRUCE_REQUEST_INVALID", message: "request invalid or expired" }));
        return;
      }
      const from = players.get(request.fromPlayerId);
      if (!from) {
        socket.send(JSON.stringify({ type: "ERROR", code: "TRUCE_REQUEST_INVALID", message: "request sender offline/unknown" }));
        truceRequests.delete(msg.requestId);
        return;
      }
      if (playerHasActiveTruce(actor.id) || playerHasActiveTruce(from.id)) {
        socket.send(JSON.stringify({ type: "ERROR", code: "TRUCE_EXISTS", message: "one player already has an active truce" }));
        truceRequests.delete(msg.requestId);
        return;
      }
      const truce: ActiveTruce = {
        playerAId: actor.id < from.id ? actor.id : from.id,
        playerBId: actor.id < from.id ? from.id : actor.id,
        startedAt: now(),
        endsAt: now() + request.durationHours * 60 * 60_000,
        createdByPlayerId: from.id
      };
      truceRequests.delete(msg.requestId);
      trucesByPair.set(playerPairKey(actor.id, from.id), truce);
      pushStrategicReplayEvent({
        at: truce.startedAt,
        type: "TRUCE_START",
        label: `${actor.name} and ${from.name} agreed to a ${request.durationHours}h truce`,
        playerId: actor.id,
        playerName: actor.name,
        targetPlayerId: from.id,
        targetPlayerName: from.name,
        isBookmark: true
      });
      broadcastTruceUpdate(actor, from, `${actor.name} and ${from.name} agreed to a ${request.durationHours}h truce.`);
      return;
    }

    if (msg.type === "TRUCE_REJECT") {
      const request = truceRequests.get(msg.requestId);
      if (!request || request.toPlayerId !== actor.id || request.expiresAt < now()) {
        socket.send(JSON.stringify({ type: "ERROR", code: "TRUCE_REQUEST_INVALID", message: "request invalid or expired" }));
        return;
      }
      const from = players.get(request.fromPlayerId);
      truceRequests.delete(msg.requestId);
      if (!from) return;
      broadcastTruceUpdate(actor, from);
      return;
    }

    if (msg.type === "TRUCE_CANCEL") {
      const request = truceRequests.get(msg.requestId);
      if (!request || request.fromPlayerId !== actor.id || request.expiresAt < now()) {
        socket.send(JSON.stringify({ type: "ERROR", code: "TRUCE_REQUEST_INVALID", message: "request invalid or expired" }));
        return;
      }
      const target = players.get(request.toPlayerId);
      truceRequests.delete(msg.requestId);
      if (!target) return;
      broadcastTruceUpdate(actor, target);
      return;
    }

    if (msg.type === "ALLIANCE_BREAK") {
      const target = players.get(msg.targetPlayerId);
      if (!target || !actor.allies.has(target.id)) {
        socket.send(JSON.stringify({ type: "ERROR", code: "ALLIANCE_BREAK_INVALID", message: "not allied with target" }));
        return;
      }
      actor.allies.delete(target.id);
      target.allies.delete(actor.id);
      recomputeExposure(actor);
      recomputeExposure(target);
      broadcastAllianceUpdate(actor, target);
      return;
    }

    if (msg.type === "TRUCE_BREAK") {
      const target = players.get(msg.targetPlayerId);
      const truce = target ? activeTruceBetween(actor.id, target.id) : undefined;
      if (!target || !truce) {
        socket.send(JSON.stringify({ type: "ERROR", code: "TRUCE_BREAK_INVALID", message: "no active truce with target" }));
        return;
      }
      trucesByPair.delete(playerPairKey(actor.id, target.id));
      truceBreakPenaltyByPair.set(playerPairKey(actor.id, target.id), {
        penalizedPlayerId: actor.id,
        targetPlayerId: target.id,
        endsAt: now() + TRUCE_BREAK_ATTACK_PENALTY_MS
      });
      pushStrategicReplayEvent({
        at: now(),
        type: "TRUCE_BREAK",
        label: `${actor.name} broke truce with ${target.name}`,
        playerId: actor.id,
        playerName: actor.name,
        targetPlayerId: target.id,
        targetPlayerName: target.name,
        isBookmark: true
      });
      broadcastTruceUpdate(actor, target, `${actor.name} broke the truce with ${target.name}.`);
      return;
    }

    if (msg.type === "SUBSCRIBE_CHUNKS") {
      const sub = { cx: msg.cx, cy: msg.cy, radius: Math.max(0, Math.min(msg.radius, MAX_SUBSCRIBE_RADIUS)) };
      const existingSub = chunkSubscriptionByPlayer.get(actor.id);
      const sameRequestedSub =
        existingSub &&
        existingSub.cx === sub.cx &&
        existingSub.cy === sub.cy &&
        existingSub.radius === sub.radius;
      if (sameRequestedSub && chunkSnapshotInFlightByPlayer.has(actor.id)) {
        return;
      }
      chunkSubscriptionByPlayer.set(actor.id, sub);
      const authSync = authSyncTimingByPlayer.get(actor.id);
      if (authSync && authSync.firstSubscribeAt === undefined) {
        authSync.firstSubscribeAt = now();
        sendLoginPhase(controlSocketForPlayer(actor.id), "MAP_SUBSCRIBE", "Connecting your empire...", `Requesting your world view near (${sub.cx}, ${sub.cy})...`);
        app.log.info(
          {
            playerId: actor.id,
            sinceAuthVerifiedMs: authSync.authVerifiedAt ? authSync.firstSubscribeAt - authSync.authVerifiedAt : undefined,
            sinceInitSentMs: authSync.initSentAt ? authSync.firstSubscribeAt - authSync.initSentAt : undefined,
            cx: sub.cx,
            cy: sub.cy,
            radius: sub.radius
          },
          "auth sync first subscribe"
        );
        runtimeIncidentLog.record("auth_sync_first_subscribe", {
          playerId: actor.id,
          sinceAuthVerifiedMs: authSync.authVerifiedAt ? authSync.firstSubscribeAt - authSync.authVerifiedAt : undefined,
          sinceInitSentMs: authSync.initSentAt ? authSync.firstSubscribeAt - authSync.initSentAt : undefined,
          cx: sub.cx,
          cy: sub.cy,
          radius: sub.radius
        });
      }
      const last = chunkSnapshotSentAtByPlayer.get(actor.id);
      if (last && last.cx === sub.cx && last.cy === sub.cy && last.radius === sub.radius && now() - last.sentAt < 2500) {
        return;
      }
      if (sub.radius > INITIAL_CHUNK_BOOTSTRAP_RADIUS) {
        sendChunkSnapshot(
          bulkSocketForPlayer(actor.id) ?? socket,
          actor,
          { ...sub, radius: INITIAL_CHUNK_BOOTSTRAP_RADIUS },
          buildBootstrapChunkStages(sub),
          chunkCoordsForSubscription({ ...sub, radius: INITIAL_CHUNK_BOOTSTRAP_RADIUS })
        );
        return;
      }
      sendChunkSnapshot(bulkSocketForPlayer(actor.id) ?? socket, actor, sub);
      return;
    }

    if (msg.type === "REQUEST_TILE_DETAIL") {
      const wx = wrapX(msg.x, WORLD_WIDTH);
      const wy = wrapY(msg.y, WORLD_HEIGHT);
      const snapshot = visibilitySnapshotForPlayer(actor);
      if (!visibleInSnapshot(snapshot, wx, wy)) {
        socket.send(JSON.stringify({ type: "ERROR", code: "TILE_DETAIL_UNAVAILABLE", message: "tile detail requires current vision" }));
        return;
      }
      sendBulkToPlayer(actor.id, { type: "TILE_DELTA", updates: [playerTile(wx, wy)] });
      return;
    }

    if (msg.type === "ATTACK_PREVIEW") {
      let from = playerTile(msg.fromX, msg.fromY);
      const to = playerTile(msg.toX, msg.toY);
      let fk = key(from.x, from.y);
      const tk = key(to.x, to.y);
      let fromDock = docksByTile.get(fk);
      let adjacent = isAdjacentTile(from.x, from.y, to.x, to.y);
      let dockCrossing = Boolean(fromDock && validDockCrossingTarget(fromDock, to.x, to.y));
      const aetherBridge = activeAetherBridgeForTarget(actor.id, tk);
      let bridgeCrossing = false;
      if (aetherBridge) {
        const [bridgeFromX, bridgeFromY] = parseKey(aetherBridge.fromTileKey);
        from = playerTile(bridgeFromX, bridgeFromY);
        fk = aetherBridge.fromTileKey;
        bridgeCrossing = true;
      }
      if (!adjacent && !dockCrossing) {
        const altFrom = findOwnedDockOriginForCrossing(actor, to.x, to.y);
        if (altFrom) {
          from = altFrom;
          fk = key(from.x, from.y);
          fromDock = docksByTile.get(fk);
          adjacent = isAdjacentTile(from.x, from.y, to.x, to.y);
          dockCrossing = Boolean(fromDock && validDockCrossingTarget(fromDock, to.x, to.y));
        }
      }

      const sendInvalid = (reason: string): void => {
        socket.send(
          JSON.stringify({
            type: "ATTACK_PREVIEW_RESULT",
            from: { x: from.x, y: from.y },
            to: { x: to.x, y: to.y },
            valid: false,
            reason
          })
        );
      };

      if (from.ownerId !== actor.id) {
        sendInvalid("origin not owned");
        return;
      }
      if (!adjacent && !dockCrossing && !bridgeCrossing) {
        sendInvalid("target must be adjacent or valid dock crossing");
        return;
      }
      if (adjacent && !dockCrossing && !bridgeCrossing && crossingBlockedByAetherWall(from.x, from.y, to.x, to.y)) {
        sendInvalid("crossing blocked by aether wall");
        return;
      }
      if (to.terrain !== "LAND") {
        sendInvalid("target is barrier");
        return;
      }
      if (combatLocks.has(fk)) {
        const remainingMs = Math.max(0, (combatLocks.get(fk)?.resolvesAt ?? now()) - now());
        sendInvalid(`origin tile is still on attack cooldown (${Math.ceil(remainingMs / 1000)}s remaining)`);
        return;
      }
      if (combatLocks.has(tk)) {
        sendInvalid("tile locked in combat");
        return;
      }
      applyManpowerRegen(actor);
      const defenderIsBarbarian = to.ownerId === BARBARIAN_OWNER_ID;
      const defender = to.ownerId && !defenderIsBarbarian ? players.get(to.ownerId) : undefined;
      if (!defender && !defenderIsBarbarian) {
        socket.send(
          JSON.stringify({
            type: "ATTACK_PREVIEW_RESULT",
            from: { x: from.x, y: from.y },
            to: { x: to.x, y: to.y },
            valid: true,
            winChance: 1
          })
        );
        return;
      }
      if (defender && (actor.allies.has(defender.id) || truceBlocksHostility(actor.id, defender.id))) {
        sendInvalid("cannot attack allied tile");
        return;
      }
      if (defender && !defenderIsBarbarian && defender.spawnShieldUntil > now()) {
        sendInvalid("target shielded");
        return;
      }
      if (!hasEnoughManpower(actor, ATTACK_MANPOWER_MIN)) {
        sendInvalid(`needs ${ATTACK_MANPOWER_MIN} manpower to launch`);
        return;
      }

      const canBreakthrough =
        actor.techIds.has(BREAKTHROUGH_REQUIRED_TECH_ID) &&
        Boolean(to.ownerId && to.ownerId !== actor.id && to.ownerId !== BARBARIAN_OWNER_ID) &&
        !actor.allies.has(to.ownerId ?? "") &&
        hasEnoughManpower(actor, BREAKTHROUGH_ATTACK_MANPOWER_MIN);
      const shock = breachShockByTile.get(tk);
      const shockMult = defender && shock && shock.ownerId === defender.id && shock.expiresAt > now() ? BREACH_SHOCK_DEF_MULT : 1;
      const defMult = defender ? playerDefensiveness(defender) * shockMult : 1;
      const fortMult = defender ? fortDefenseMultAt(defender.id, tk) : 1;
      const dockMult = docksByTile.has(tk) ? DOCK_DEFENSE_MULT : 1;
      const siegeAtkMult = outpostAttackMultAt(actor.id, fk);
      const atkEff = 10 * actor.mods.attack * siegeAtkMult * activeAttackBuffMult(actor.id) * attackMultiplierForTarget(actor.id, to, fk);
      const settledDefenseMult = defender ? settledDefenseMultiplierForTarget(defender.id, to) : 1;
      const newSettlementDefenseMult = defender ? settlementDefenseMultAt(defender.id, tk) : 1;
      const ownershipDefenseMult = ownershipDefenseMultiplierForTarget(defender?.id, to);
      const frontierDefenseAdd = defender ? frontierDefenseAddForTarget(defender.id, to) : 0;
      const defEff = defenderIsBarbarian
        ? 10 * BARBARIAN_DEFENSE_POWER * dockMult
        : 10 * (defender?.mods.defense ?? 1) * defMult * fortMult * dockMult * settledDefenseMult * newSettlementDefenseMult * ownershipDefenseMult +
          frontierDefenseAdd;
      const breakthroughDefEff = defenderIsBarbarian ? defEff : defEff * BREAKTHROUGH_DEF_MULT_FACTOR;
      socket.send(
        JSON.stringify({
          type: "ATTACK_PREVIEW_RESULT",
          from: { x: from.x, y: from.y },
          to: { x: to.x, y: to.y },
          valid: true,
          manpowerMin: ATTACK_MANPOWER_MIN,
          breakthroughManpowerMin: BREAKTHROUGH_ATTACK_MANPOWER_MIN,
          winChance: combatWinChance(atkEff, defEff),
          breakthroughWinChance: canBreakthrough ? combatWinChance(atkEff, breakthroughDefEff) : undefined,
          atkEff,
          defEff,
          siegeAtkMult,
          defMult,
          fortMult,
          dockMult
        })
      );
      return;
    }

    if (msg.type !== "ATTACK" && msg.type !== "EXPAND" && msg.type !== "BREAKTHROUGH_ATTACK") return;

    app.log.info(
      {
        playerId: actor.id,
        playerName: actor.name,
        action: msg.type,
        fromX: msg.fromX,
        fromY: msg.fromY,
        toX: msg.toX,
        toY: msg.toY
      },
      "action request"
    );
    const nowMs = now();
    const expandTraceId = msg.type === "EXPAND" ? `${actor.id}:${nowMs}:${msg.toX},${msg.toY}` : undefined;
    const attackTraceId =
      msg.type === "ATTACK" || msg.type === "BREAKTHROUGH_ATTACK" ? `${actor.id}:${msg.type}:${nowMs}:${msg.toX},${msg.toY}` : undefined;
    if (msg.type === "EXPAND") {
      app.log.info(
        {
          traceId: expandTraceId,
          attackerId: actor.id,
          origin: key(msg.fromX, msg.fromY),
          target: key(msg.toX, msg.toY),
          phase: "received",
          elapsedMs: 0
        },
        "expand trace"
      );
    }
    if (attackTraceId) {
      app.log.info(
        {
          traceId: attackTraceId,
          attackerId: actor.id,
          actionType: msg.type,
          origin: key(msg.fromX, msg.fromY),
          target: key(msg.toX, msg.toY),
          phase: "received",
          elapsedMs: 0,
          socketReadyState: socket.readyState
        },
        "attack trace"
      );
    }
    recordServerDebugEvent("info", "frontier_action_received", {
      playerId: actor.id,
      actionType: msg.type,
      from: { x: msg.fromX, y: msg.fromY },
      target: { x: msg.toX, y: msg.toY },
      socketReadyState: socket.readyState,
      bufferedAmount: typeof socket.bufferedAmount === "number" ? socket.bufferedAmount : undefined,
      ...(attackTraceId ? { traceId: attackTraceId } : {}),
      ...(expandTraceId ? { traceId: expandTraceId } : {})
    });
    pauseLowPrioritySocketMessages(socket, nowMs + ACTION_CONTROL_PRIORITY_WINDOW_MS, { dropQueued: true });

    const actionTimes = pruneActionTimes(actor.id, nowMs);
    if (actionTimes.length >= ACTION_LIMIT) {
      app.log.info({ playerId: actor.id, action: msg.type }, "action rejected: rate limit");
      recordServerDebugEvent("warn", "frontier_action_rejected", {
        playerId: actor.id,
        actionType: msg.type,
        code: "RATE_LIMIT",
        message: "too many actions; slow down briefly",
        from: { x: msg.fromX, y: msg.fromY },
        target: { x: msg.toX, y: msg.toY }
      });
      sendControlToSocket(socket, { type: "ERROR", code: "RATE_LIMIT", message: "too many actions; slow down briefly" }, { playerId: actor.id });
      return;
    }
    actionTimes.push(nowMs);
    actionTimestampsByPlayer.set(actor.id, actionTimes);

    applyStaminaRegen(actor);
    applyManpowerRegen(actor);
    const staminaCost = 0;
    const manpowerMin = manpowerMinForAction(msg.type);
    const manpowerCost = manpowerCostForAction(msg.type);
    const isBreakthroughAttack = msg.type === "BREAKTHROUGH_ATTACK";

    let from = playerTile(msg.fromX, msg.fromY);
    const to = playerTile(msg.toX, msg.toY);
    const requestedFromKey = key(msg.fromX, msg.fromY);
    const requestedToKey = key(msg.toX, msg.toY);
    logTileSync(
      "action_validation_start",
      actionValidationPayload(actor.id, msg.type, from, to, {
        requestedFrom: requestedFromKey,
        requestedTo: requestedToKey
      })
    );
    const preTk = key(to.x, to.y);
    if (msg.type === "EXPAND" && to.ownerId) {
      logTileSync("action_validation_rejected_target_owned", actionValidationPayload(actor.id, msg.type, from, to));
      app.log.info({ playerId: actor.id, to: preTk, ownerId: to.ownerId }, "action rejected: expand target owned");
      sendHighPrioritySocketMessage(
        socket,
        JSON.stringify({ type: "ERROR", code: "EXPAND_TARGET_OWNED", message: "expand only targets neutral land" })
      );
      return;
    }
    if (isBreakthroughAttack && !to.ownerId) {
      logTileSync("action_validation_rejected_breakthrough_target_invalid", actionValidationPayload(actor.id, msg.type, from, to));
      app.log.info({ playerId: actor.id, to: preTk }, "action rejected: breakthrough target not enemy");
      sendHighPrioritySocketMessage(
        socket,
        JSON.stringify({ type: "ERROR", code: "BREAKTHROUGH_TARGET_INVALID", message: "breakthrough requires enemy tile" })
      );
      return;
    }
    if (isBreakthroughAttack && !actor.techIds.has(BREAKTHROUGH_REQUIRED_TECH_ID)) {
      sendHighPrioritySocketMessage(
        socket,
        JSON.stringify({ type: "ERROR", code: "BREAKTHROUGH_TARGET_INVALID", message: "requires Breach Doctrine" })
      );
      return;
    }
    if (msg.type === "ATTACK" && (!to.ownerId || to.ownerId === actor.id)) {
      logTileSync("action_validation_rejected_attack_target_invalid", actionValidationPayload(actor.id, msg.type, from, to));
      app.log.info({ playerId: actor.id, to: preTk, ownerId: to.ownerId }, "action rejected: attack target not enemy");
      recordServerDebugEvent("warn", "frontier_action_rejected", {
        playerId: actor.id,
        actionType: msg.type,
        code: "ATTACK_TARGET_INVALID",
        message: "target must be enemy-controlled land",
        from: { x: from.x, y: from.y },
        target: { x: to.x, y: to.y }
      });
      sendControlToSocket(socket, { type: "ERROR", code: "ATTACK_TARGET_INVALID", message: "target must be enemy-controlled land" }, { playerId: actor.id });
      return;
    }
    if (!hasEnoughManpower(actor, manpowerMin)) {
      sendHighPrioritySocketMessage(
        socket,
        JSON.stringify({ type: "ERROR", code: "INSUFFICIENT_MANPOWER", message: `need ${manpowerMin.toFixed(0)} manpower to launch attack` })
      );
      return;
    }
    if ((msg.type === "EXPAND" || msg.type === "ATTACK") && actor.points < FRONTIER_ACTION_GOLD_COST) {
      app.log.info({ playerId: actor.id, action: msg.type, points: actor.points, required: FRONTIER_ACTION_GOLD_COST }, "action rejected: insufficient gold");
      sendHighPrioritySocketMessage(
        socket,
        JSON.stringify({
          type: "ERROR",
          code: "INSUFFICIENT_GOLD",
          message: msg.type === "ATTACK" ? "insufficient gold for attack" : "insufficient gold for frontier claim"
        })
      );
      return;
    }
    if (isBreakthroughAttack && actor.points < BREAKTHROUGH_GOLD_COST) {
      app.log.info({ playerId: actor.id, points: actor.points, required: BREAKTHROUGH_GOLD_COST }, "action rejected: insufficient gold for breakthrough");
      sendHighPrioritySocketMessage(
        socket,
        JSON.stringify({ type: "ERROR", code: "INSUFFICIENT_GOLD", message: "insufficient gold for breakthrough" })
      );
      return;
    }
    let fk = key(from.x, from.y);
    const tk = key(to.x, to.y);
    let fromDock = docksByTile.get(fk);
    let adjacent = isAdjacentTile(from.x, from.y, to.x, to.y);
    let dockCrossing = Boolean(fromDock && validDockCrossingTarget(fromDock, to.x, to.y));
    const aetherBridge = activeAetherBridgeForTarget(actor.id, tk);
    let bridgeCrossing = false;
    if (aetherBridge) {
      const [bridgeFromX, bridgeFromY] = parseKey(aetherBridge.fromTileKey);
      from = playerTile(bridgeFromX, bridgeFromY);
      fk = aetherBridge.fromTileKey;
      fromDock = docksByTile.get(fk);
      adjacent = isAdjacentTile(from.x, from.y, to.x, to.y);
      dockCrossing = Boolean(fromDock && validDockCrossingTarget(fromDock, to.x, to.y));
      bridgeCrossing = true;
    }
    if (!adjacent && !dockCrossing) {
      const altFrom = findOwnedDockOriginForCrossing(actor, to.x, to.y);
      if (altFrom) {
        from = altFrom;
        fk = key(from.x, from.y);
        fromDock = docksByTile.get(fk);
        adjacent = isAdjacentTile(from.x, from.y, to.x, to.y);
        dockCrossing = Boolean(fromDock && validDockCrossingTarget(fromDock, to.x, to.y));
      }
    }
    logTileSync(
      "action_validation_resolved_origin",
      actionValidationPayload(actor.id, msg.type, from, to, {
        requestedFrom: requestedFromKey,
        requestedTo: requestedToKey,
        adjacent,
        dockCrossing,
        bridgeCrossing
      })
    );
    if (!adjacent && !dockCrossing && !bridgeCrossing) {
      logTileSync(
        "action_validation_rejected_not_adjacent",
        actionValidationPayload(actor.id, msg.type, from, to, {
          requestedFrom: requestedFromKey,
          requestedTo: requestedToKey,
          adjacent,
          dockCrossing,
          bridgeCrossing
        })
      );
      app.log.info({ playerId: actor.id, from: fk, to: tk }, "action rejected: not adjacent and not dock crossing");
      sendHighPrioritySocketMessage(
        socket,
        JSON.stringify({
          type: "ERROR",
          code: "NOT_ADJACENT",
          message: "target must be adjacent, valid dock crossing, or active aether bridge target"
        })
      );
      return;
    }
    if (dockCrossing && fromDock && fromDock.cooldownUntil > now()) {
      const cooldownRemainingMs = Math.max(0, fromDock.cooldownUntil - now());
      app.log.info(
        { playerId: actor.id, dockId: fromDock.dockId, cooldownUntil: fromDock.cooldownUntil, cooldownRemainingMs },
        "action rejected: dock cooldown"
      );
      sendHighPrioritySocketMessage(
        socket,
        JSON.stringify({
          type: "ERROR",
          code: "DOCK_COOLDOWN",
          message: "dock crossing endpoint on cooldown",
          cooldownRemainingMs
        })
      );
      return;
    }

    if (from.ownerId !== actor.id) {
      logTileSync("action_validation_rejected_origin_not_owned", actionValidationPayload(actor.id, msg.type, from, to));
      app.log.info({ playerId: actor.id, from: fk, fromOwner: from.ownerId }, "action rejected: origin not owned");
      recordServerDebugEvent("warn", "frontier_action_rejected", {
        playerId: actor.id,
        actionType: msg.type,
        code: "NOT_OWNER",
        message: "origin not owned",
        from: { x: from.x, y: from.y },
        target: { x: to.x, y: to.y },
        fromOwnerId: from.ownerId
      });
      sendControlToSocket(socket, { type: "ERROR", code: "NOT_OWNER", message: "origin not owned" }, { playerId: actor.id });
      return;
    }

    if (to.terrain !== "LAND") {
      logTileSync("action_validation_rejected_barrier", actionValidationPayload(actor.id, msg.type, from, to));
      app.log.info({ playerId: actor.id, to: tk, terrain: to.terrain }, "action rejected: barrier target");
      sendHighPrioritySocketMessage(
        socket,
        JSON.stringify({ type: "ERROR", code: "BARRIER", message: "target is barrier" })
      );
      return;
    }

    if (combatLocks.has(fk)) {
      app.log.info({ playerId: actor.id, from: fk, to: tk }, "action rejected: attack cooldown");
      const cooldownRemainingMs = Math.max(0, (combatLocks.get(fk)?.resolvesAt ?? now()) - now());
      recordServerDebugEvent("warn", "frontier_action_rejected", {
        playerId: actor.id,
        actionType: msg.type,
        code: "ATTACK_COOLDOWN",
        message: "origin tile is still on attack cooldown",
        from: { x: from.x, y: from.y },
        target: { x: to.x, y: to.y },
        cooldownRemainingMs
      });
      sendControlToSocket(
        socket,
        { type: "ERROR", code: "ATTACK_COOLDOWN", message: "origin tile is still on attack cooldown", cooldownRemainingMs },
        { playerId: actor.id }
      );
      return;
    }

    if (combatLocks.has(tk)) {
      app.log.info({ playerId: actor.id, from: fk, to: tk }, "action rejected: combat lock");
      recordServerDebugEvent("warn", "frontier_action_rejected", {
        playerId: actor.id,
        actionType: msg.type,
        code: "LOCKED",
        message: "tile locked in combat",
        from: { x: from.x, y: from.y },
        target: { x: to.x, y: to.y }
      });
      sendControlToSocket(socket, { type: "ERROR", code: "LOCKED", message: "tile locked in combat" }, { playerId: actor.id });
      return;
    }

    const defenderIsBarbarian = to.ownerId === BARBARIAN_OWNER_ID;
    const defender = to.ownerId && !defenderIsBarbarian ? players.get(to.ownerId) : undefined;
    if (defender && (actor.allies.has(defender.id) || truceBlocksHostility(actor.id, defender.id))) {
      logTileSync("action_validation_rejected_ally_target", actionValidationPayload(actor.id, msg.type, from, to));
      app.log.info({ playerId: actor.id, defenderId: defender.id }, "action rejected: allied target");
      sendHighPrioritySocketMessage(
        socket,
        JSON.stringify({ type: "ERROR", code: "ALLY_TARGET", message: "cannot attack allied or truced tile" })
      );
      return;
    }
    if (isBreakthroughAttack) {
      if (!consumeStrategicResource(actor, "IRON", BREAKTHROUGH_IRON_COST)) {
        app.log.info({ playerId: actor.id }, "action rejected: insufficient IRON for breakthrough");
        sendHighPrioritySocketMessage(
          socket,
          JSON.stringify({ type: "ERROR", code: "INSUFFICIENT_RESOURCE", message: "insufficient IRON for breakthrough" })
        );
        return;
      }
      actor.points -= BREAKTHROUGH_GOLD_COST;
      recalcPlayerDerived(actor);
      telemetryCounters.breakthroughAttacks += 1;
    }
    if (!actor.isAi && defender?.isAi) markAiDefensePriority(defender.id);
    let precomputedCombatPromise: Promise<PrecomputedFrontierCombat> | undefined;
    if (defender || defenderIsBarbarian) {
      const siegeAtkMult = outpostAttackMultAt(actor.id, fk);
      const shock = breachShockByTile.get(tk);
      const shockMult = defender && shock && shock.ownerId === defender.id && shock.expiresAt > now() ? BREACH_SHOCK_DEF_MULT : 1;
      const defMultRaw = defender ? playerDefensiveness(defender) * shockMult : 1;
      const defMult = isBreakthroughAttack ? defMultRaw * BREAKTHROUGH_DEF_MULT_FACTOR : defMultRaw;
      const fortMult = defender ? fortDefenseMultAt(defender.id, tk) : 1;
      const dockMult = docksByTile.has(tk) ? DOCK_DEFENSE_MULT : 1;
      const settledDefenseMult = defender ? settledDefenseMultiplierForTarget(defender.id, to) : 1;
      const newSettlementDefenseMult = defender ? settlementDefenseMultAt(defender.id, tk) : 1;
      const ownershipDefenseMult = ownershipDefenseMultiplierForTarget(defender?.id, to);
      const frontierDefenseAdd = defender ? frontierDefenseAddForTarget(defender.id, to) : 0;
      precomputedCombatPromise = resolveCombatViaWorker({
        attackBase:
          10 *
          actor.mods.attack *
          activeAttackBuffMult(actor.id) *
          attackMultiplierForTarget(actor.id, to, fk) *
          siegeAtkMult,
        defenseBase: defenderIsBarbarian
          ? 10 * BARBARIAN_DEFENSE_POWER * dockMult
          : 10 * (defender?.mods.defense ?? 1) * defMult * fortMult * dockMult * settledDefenseMult * newSettlementDefenseMult * ownershipDefenseMult +
            frontierDefenseAdd
      }).then((combat): PrecomputedFrontierCombat => {
        const atkEffWithSiege = combat.atkEff;
        const defEff = combat.defEff;
        const winChance = combat.winChance;
        const win = combat.win;
        const previewChanges = (() => {
          if (win) return [{ x: to.x, y: to.y, ownerId: actor.id, ownershipState: "FRONTIER" as const }];
          const fortHeldOrigin = originTileHeldByActiveFort(actor.id, fk);
          if (defenderIsBarbarian) {
            return fortHeldOrigin
              ? [{ x: to.x, y: to.y }]
              : [
                  { x: from.x, y: from.y, ownerId: BARBARIAN_OWNER_ID, ownershipState: "BARBARIAN" as const },
                  { x: to.x, y: to.y }
                ];
          }
          if (defender) {
            return fortHeldOrigin ? [] : [{ x: from.x, y: from.y, ownerId: defender.id, ownershipState: "FRONTIER" as const }];
          }
          return [];
        })();
        const previewWinnerId = win ? actor.id : defenderIsBarbarian ? BARBARIAN_OWNER_ID : defender?.id;
        return {
          atkEff: atkEffWithSiege,
          defEff,
          winChance,
          win,
          previewChanges,
          previewManpowerDelta: -(
            win
              ? Math.max(10, manpowerCost * 0.16)
              : manpowerCost * Math.min(1.25, 0.6 + (defEff / Math.max(1, atkEffWithSiege)) * 0.35)
          ),
          ...(defenderIsBarbarian ? { defenderOwnerId: BARBARIAN_OWNER_ID } : defender?.id ? { defenderOwnerId: defender.id } : {}),
          ...(previewWinnerId ? { previewWinnerId } : {})
        };
      });
    }
    const resolvesAt = now() + (msg.type === "EXPAND" && !to.ownerId ? frontierClaimDurationMsAt(to.x, to.y) : COMBAT_LOCK_MS);
    const pending: PendingCapture = {
      resolvesAt,
      origin: fk,
      target: tk,
      attackerId: actor.id,
      staminaCost,
      manpowerCost,
      cancelled: false,
      actionType: msg.type,
      startedAt: nowMs
    };
    if (!actor.isAi) noteHumanFrontierActionPriority();
    if (expandTraceId) pending.traceId = expandTraceId;
    if (attackTraceId) pending.traceId = attackTraceId;
    combatLocks.set(fk, pending);
    combatLocks.set(tk, pending);
    logTileSync(
      "action_validation_accepted",
      actionValidationPayload(actor.id, msg.type, from, to, {
        requestedFrom: requestedFromKey,
        requestedTo: requestedToKey,
        resolvesAt
      })
    );
    app.log.info({ playerId: actor.id, action: msg.type, from: fk, to: tk, resolvesAt }, "action accepted");
    logExpandTrace("queued", pending);
    logAttackTrace("queued", pending, {
      requestedFrom: requestedFromKey,
      requestedTo: requestedToKey,
      socketReadyState: socket.readyState
    });
    recordServerDebugEvent("info", "frontier_action_accepted", {
      playerId: actor.id,
      actionType: msg.type,
      from: { x: from.x, y: from.y },
      target: { x: to.x, y: to.y },
      resolvesAt,
      elapsedMs: now() - nowMs,
      ...(pending.traceId ? { traceId: pending.traceId } : {})
    });
    sendControlToSocket(
      socket,
      {
        type: "ACTION_ACCEPTED",
        actionType: msg.type,
        origin: { x: from.x, y: from.y },
        target: { x: to.x, y: to.y },
        resolvesAt
      },
      { playerId: actor.id, ...(pending.traceId ? { traceId: pending.traceId } : {}) }
    );
    recordHotPathTimingEvent(
      "frontier_action_accept_timing",
      {
        playerId: actor.id,
        actionType: msg.type,
        from: { x: from.x, y: from.y },
        target: { x: to.x, y: to.y },
        resolvesAt,
        traceId: pending.traceId
      },
      now() - nowMs,
      50
    );
    logAttackTrace("accepted_ack_sent", pending, {
      socketReadyState: socket.readyState
    });
    if (precomputedCombatPromise) {
      pending.precomputedCombatPromise = precomputedCombatPromise.then((computed) => {
        pending.precomputedCombat = computed;
        return computed;
      });
    }
    const predictedResult =
      msg.type === "EXPAND" && !to.ownerId
        ? {
            attackType: msg.type,
            attackerWon: true,
            winnerId: actor.id,
            origin: { x: from.x, y: from.y },
            target: { x: to.x, y: to.y },
            changes: [{ x: to.x, y: to.y, ownerId: actor.id, ownershipState: "FRONTIER" as const }],
            manpowerDelta: 0
          }
        : undefined;
    recordServerDebugEvent("info", "frontier_combat_start", {
      playerId: actor.id,
      actionType: msg.type,
      from: { x: from.x, y: from.y },
      target: { x: to.x, y: to.y },
      resolvesAt,
      predictedResult: Boolean(predictedResult),
      ...(pending.traceId ? { traceId: pending.traceId } : {})
    });
    sendControlToSocket(
      socket,
      {
        type: "COMBAT_START",
        origin: { x: from.x, y: from.y },
        target: { x: to.x, y: to.y },
        resolvesAt,
        ...(predictedResult ? { predictedResult } : {})
      },
      { playerId: actor.id, ...(pending.traceId ? { traceId: pending.traceId } : {}) }
    );
    recordHotPathTimingEvent(
      "frontier_combat_start_timing",
      {
        playerId: actor.id,
        actionType: msg.type,
        from: { x: from.x, y: from.y },
        target: { x: to.x, y: to.y },
        resolvesAt,
        predictedResult: Boolean(predictedResult),
        traceId: pending.traceId
      },
      now() - nowMs,
      50
    );
    logExpandTrace("combat_start_sent", pending);
    logAttackTrace("combat_start_sent", pending, {
      predictedResult: Boolean(predictedResult),
      socketReadyState: socket.readyState
    });
    if (isBreakthroughAttack || bridgeCrossing) sendPlayerUpdate(actor, 0);
    if (defender && !defenderIsBarbarian) {
      sendToPlayer(defender.id, {
        type: "ATTACK_ALERT",
        attackerId: actor.id,
        attackerName: actor.name,
        x: to.x,
        y: to.y,
        resolvesAt
      });
    }

    pending.timeout = setTimeout(async () => {
      if (pending.cancelled) return;
      combatLocks.delete(fk);
      combatLocks.delete(tk);
      if (dockCrossing && fromDock) fromDock.cooldownUntil = now() + DOCK_CROSSING_COOLDOWN_MS;

      if (!defender && !defenderIsBarbarian) {
        if (msg.type === "EXPAND") {
          actor.points -= FRONTIER_ACTION_GOLD_COST;
          recalcPlayerDerived(actor);
        }
        actor.stamina -= staminaCost;
        updateOwnership(to.x, to.y, actor.id, "FRONTIER");
        logExpandTrace("result_applied", pending, { neutralTarget: true });
        const siteBonusGold = claimFirstSpecialSiteCaptureBonus(actor, to.x, to.y);
        telemetryCounters.frontierClaims += 1;
        actor.missionStats.neutralCaptures += 1;
        maybeIssueResourceMission(actor, to.resource);
        updateMissionState(actor);
        const resultSentAt = now();
        const neutralExpandTiming = buildNeutralExpandTiming(pending, resultSentAt);
        if (neutralExpandTiming) {
          app.log.info(
            {
              playerId: actor.id,
              origin: { x: from.x, y: from.y },
              target: { x: to.x, y: to.y },
              ...neutralExpandTiming,
              timerDelayMs: neutralExpandTiming.resultSentAt - neutralExpandTiming.resolvesAt
            },
            "neutral expand timing"
          );
        }
        sendControlToSocket(
          socket,
          {
            type: "COMBAT_RESULT",
            attackType: msg.type,
            attackerWon: true,
            origin: { x: from.x, y: from.y },
            target: { x: to.x, y: to.y },
            winnerId: actor.id,
            changes: [{ x: to.x, y: to.y, ownerId: actor.id, ownershipState: "FRONTIER" }],
            pointsDelta: siteBonusGold,
            levelDelta: 0,
            ...(neutralExpandTiming ? { timing: neutralExpandTiming } : {})
          },
          { playerId: actor.id, ...(pending.traceId ? { traceId: pending.traceId } : {}) }
        );
        recordHotPathTimingEvent(
          "frontier_combat_result_timing",
          {
            playerId: actor.id,
            actionType: msg.type,
            from: { x: from.x, y: from.y },
            target: { x: to.x, y: to.y },
            attackerWon: true,
            neutralTarget: true,
            traceId: pending.traceId
          },
          now() - nowMs,
          50
        );
        logExpandTrace("combat_result_sent", pending, { neutralTarget: true });
        logAttackTrace("combat_result_sent", pending, { neutralTarget: true });
        sendPostCombatFollowUps(actor.id, [{ x: to.x, y: to.y }]);
        logExpandTrace("vision_delta_sent", pending, { centers: 1, neutralTarget: true });
        logAttackTrace("vision_delta_sent", pending, { centers: 1, neutralTarget: true });
        return;
      }

      if (defender && defender.spawnShieldUntil > now()) {
        sendHighPrioritySocketMessage(
          socket,
          JSON.stringify({ type: "ERROR", code: "SHIELDED", message: "target shielded" })
        );
        return;
      }

      if (!pending.precomputedCombat && pending.precomputedCombatPromise) {
        pending.precomputedCombat = await pending.precomputedCombatPromise;
      }

      if (msg.type === "ATTACK") {
        actor.points -= FRONTIER_ACTION_GOLD_COST;
        recalcPlayerDerived(actor);
      }
      actor.stamina -= staminaCost;

      applyTownWarShock(tk);
      const atkEffWithSiege = pending.precomputedCombat?.atkEff ?? 10;
      const defEff = pending.precomputedCombat?.defEff ?? 10;
      const p = pending.precomputedCombat?.winChance ?? 0.5;
      const win = pending.precomputedCombat?.win ?? false;

      let pointsDelta = 0;
      let manpowerDelta = 0;
      let pillagedGold = 0;
      let pillagedShare = 0;
      let pillagedStrategic: Partial<Record<StrategicResource, number>> = {};
      let resultChanges: Array<{
        x: number;
        y: number;
        ownerId?: string;
        ownershipState?: "FRONTIER" | "SETTLED" | "BARBARIAN";
      }> = [];
      if (win) {
        const targetWasSettled = to.ownershipState === "SETTLED";
        const targetHadTown = townsByTile.has(tk);
        const defenderTileCountBeforeCapture = defender ? Math.max(1, settledTileCountForPlayer(defender)) : 0;
        updateOwnership(to.x, to.y, actor.id, "FRONTIER");
        resultChanges = [{ x: to.x, y: to.y, ownerId: actor.id, ownershipState: "FRONTIER" }];
        if (targetHadTown && !playerHasSettledFoodSources(actor.id)) {
          sendToPlayer(actor.id, {
            type: "ERROR",
            code: "TOWN_UNFED",
            message: "Captured town is unfed. Settle a FISH or FARM tile to feed its citizens.",
            x: to.x,
            y: to.y
          });
        }
        if (!defenderIsBarbarian && isBreakthroughAttack && targetWasSettled && defender) {
          applyBreachShockAround(to.x, to.y, defender.id);
        }
        if (defenderIsBarbarian) {
          pointsDelta = BARBARIAN_CLEAR_GOLD_REWARD;
          actor.points += pointsDelta;
          logBarbarianEvent(`cleared by ${actor.id} @ ${to.x},${to.y}`);
        } else {
          actor.missionStats.enemyCaptures += 1;
        }
        if (defender && targetWasSettled) {
          seizeStoredYieldOnCapture(actor, tk);
          const pillage = pillageSettledTile(actor, defender, defenderTileCountBeforeCapture);
          pillagedGold = pillage.gold;
          pillagedShare = pillage.share;
          pillagedStrategic = pillage.strategic;
        }
        actor.missionStats.combatWins += 1;
        if (defender) {
          incrementVendettaCount(actor.id, defender.id);
          maybeIssueVendettaMission(actor, defender.id);
        }
        maybeIssueResourceMission(actor, to.resource);
        if (defender) {
          const attackerRating = ratingFromPointsLevel(actor.points, actor.level);
          const defenderRating = ratingFromPointsLevel(defender.points, defender.level);
          const pairKey = pairKeyFor(actor.id, defender.id);
          const nowMs = now();
          const entries = pruneRepeatFightEntries(pairKey, nowMs);
          entries.push(nowMs);
          repeatFights.set(pairKey, entries);
          const repeatMult = Math.max(PVP_REPEAT_FLOOR, 0.5 ** (entries.length - 1));
          pointsDelta = actor.allies.has(defender.id) ? 0 : pvpPointsReward(baseTileValue(to.resource), attackerRating, defenderRating) * repeatMult * PVP_REWARD_MULT;
          actor.points += pointsDelta;
        }
        manpowerDelta = -settleAttackManpower(actor, manpowerCost, true, atkEffWithSiege, defEff);
      } else {
        manpowerDelta = -settleAttackManpower(actor, manpowerCost, false, atkEffWithSiege, defEff);
        if (defenderIsBarbarian) {
          const barbarianAgentId = barbarianAgentByTileKey.get(tk);
          const barbarianAgent = barbarianAgentId ? barbarianAgents.get(barbarianAgentId) : undefined;
          const failedOutcome = applyFailedAttackTerritoryOutcome(actor.id, undefined, true, from, to, fk, tk);
          if (barbarianAgent) {
            const progressBefore = barbarianAgent.progress;
            barbarianAgent.progress += getBarbarianProgressGain(from);
            const defenderTile = resolveFailedBarbarianDefenseOutcome({
              fortHeldOrigin: !failedOutcome.originLost,
              origin: { x: from.x, y: from.y },
              target: { x: to.x, y: to.y }
            }).defenderTile;
            barbarianAgent.x = defenderTile.x;
            barbarianAgent.y = defenderTile.y;
            barbarianAgent.lastActionAt = now();
            barbarianAgent.nextActionAt = now() + BARBARIAN_ACTION_INTERVAL_MS;
            upsertBarbarianAgent(barbarianAgent);
            resultChanges = failedOutcome.resultChanges;
            logBarbarianEvent(`progress ${barbarianAgent.id} ${progressBefore} -> ${barbarianAgent.progress} on defense ${from.x},${from.y}`);
          } else {
            resultChanges = failedOutcome.resultChanges;
          }
          pointsDelta = 0;
        } else if (defender) {
          const failedOutcome = applyFailedAttackTerritoryOutcome(actor.id, defender.id, false, from, to, fk, tk);
          resultChanges = failedOutcome.resultChanges;
          if (failedOutcome.originLost) {
            defender.missionStats.enemyCaptures += 1;
            maybeIssueResourceMission(defender, from.resource);
          }
          defender.missionStats.combatWins += 1;
          incrementVendettaCount(defender.id, actor.id);
          maybeIssueVendettaMission(defender, actor.id);
          const attackerRating = ratingFromPointsLevel(defender.points, defender.level);
          const defenderRating = ratingFromPointsLevel(actor.points, actor.level);
          pointsDelta = actor.allies.has(defender.id) ? 0 : pvpPointsReward(baseTileValue(from.resource), attackerRating, defenderRating) * PVP_REWARD_MULT;
          defender.points += pointsDelta;
        }
      }

      recalcPlayerDerived(actor);
      if (defender) recalcPlayerDerived(defender);
      if (!actor.isAi && defender?.isAi) markAiDefensePriority(defender.id);
      updateMissionState(actor);
      if (defender) updateMissionState(defender);
      logExpandTrace("result_applied", pending, { neutralTarget: false, attackerWon: win, changes: resultChanges.length });
      logAttackTrace("result_applied", pending, {
        neutralTarget: false,
        attackerWon: win,
        changes: resultChanges.length,
        defenderId: defender?.id,
        defenderIsBarbarian
      });

      resolveEliminationIfNeeded(actor, true);
      if (defender) resolveEliminationIfNeeded(defender, socketsByPlayer.has(defender.id));

      sendControlToSocket(
        socket,
        {
          type: "COMBAT_RESULT",
          attackType: msg.type,
          attackerWon: win,
          winnerId: win ? actor.id : defenderIsBarbarian ? BARBARIAN_OWNER_ID : defender?.id,
          defenderOwnerId: defenderIsBarbarian ? BARBARIAN_OWNER_ID : defender?.id,
          origin: { x: from.x, y: from.y },
          target: { x: to.x, y: to.y },
          atkEff: atkEffWithSiege,
          defEff,
          winChance: p,
          changes: resultChanges,
          pointsDelta,
          manpowerDelta,
          pillagedGold,
          pillagedShare,
          pillagedStrategic,
          levelDelta: 0
        },
        { playerId: actor.id, ...(pending.traceId ? { traceId: pending.traceId } : {}) }
      );
      recordHotPathTimingEvent(
        "frontier_combat_result_timing",
        {
          playerId: actor.id,
          actionType: msg.type,
          from: { x: from.x, y: from.y },
          target: { x: to.x, y: to.y },
          attackerWon: win,
          neutralTarget: false,
          defenderId: defender?.id,
          defenderIsBarbarian,
          changes: resultChanges.length,
          traceId: pending.traceId
        },
        now() - nowMs,
        50
      );
      logExpandTrace("combat_result_sent", pending, { neutralTarget: false, changes: resultChanges.length });
      logAttackTrace("combat_result_sent", pending, {
        neutralTarget: false,
        changes: resultChanges.length,
        socketReadyState: socket.readyState
      });
      const changedCenters = resultChanges.map((change) => ({ x: change.x, y: change.y }));
      sendPostCombatFollowUps(actor.id, changedCenters, defender && !defenderIsBarbarian ? defender.id : undefined);
      logExpandTrace("vision_delta_sent", pending, { centers: changedCenters.length, targetPlayer: actor.id });
      logAttackTrace("vision_delta_sent", pending, {
        centers: changedCenters.length,
        targetPlayer: actor.id
      });
    }, resolvesAt - now());
  });

  socket.on("close", () => {
    if (authedPlayer) {
      if (socketChannel === "bulk") {
        if (bulkSocketsByPlayer.get(authedPlayer.id) === socket) bulkSocketsByPlayer.delete(authedPlayer.id);
        chunkSubscriptionByPlayer.delete(authedPlayer.id);
        chunkSnapshotSentAtByPlayer.delete(authedPlayer.id);
        chunkSnapshotGenerationByPlayer.delete(authedPlayer.id);
        chunkSnapshotInFlightByPlayer.delete(authedPlayer.id);
        return;
      }
      if (socketsByPlayer.get(authedPlayer.id) !== socket) return;
      for (const pcap of pendingCapturesByAttacker(authedPlayer.id)) cancelPendingCapture(pcap);
      socketsByPlayer.delete(authedPlayer.id);
      bulkSocketsByPlayer.delete(authedPlayer.id);
      chunkSubscriptionByPlayer.delete(authedPlayer.id);
      chunkSnapshotSentAtByPlayer.delete(authedPlayer.id);
      chunkSnapshotGenerationByPlayer.delete(authedPlayer.id);
      chunkSnapshotInFlightByPlayer.delete(authedPlayer.id);
      actionTimestampsByPlayer.delete(authedPlayer.id);
      fogDisabledByPlayer.delete(authedPlayer.id);
      if (!hasOnlinePlayers()) {
        cancelAllBarbarianPendingCaptures();
        pauseVictoryPressureTimers();
        saveSnapshotInBackground();
        lastSnapshotAt = now();
      }
    }
  });
});

const shutdown = async (signal: string): Promise<void> => {
  app.log.info({ signal }, "shutting down server");
  runtimeIncidentLog.record("clean_shutdown_started", { signal });
  let exitCode = 0;
  for (const interval of runtimeIntervals) clearInterval(interval);
  runtimeIntervals.length = 0;
  try {
    await saveSnapshot();
  } catch (err) {
    exitCode = 1;
    app.log.error({ err, signal }, "error saving snapshot during shutdown");
  }
  try {
    await app.close();
  } catch (err) {
    exitCode = 1;
    app.log.error({ err, signal }, "error during shutdown");
  } finally {
    await runtimeIncidentLog.markCleanShutdown(signal);
    process.exit(exitCode);
  }
};

process.once("SIGINT", () => {
  void shutdown("SIGINT");
});
process.once("SIGTERM", () => {
  void shutdown("SIGTERM");
});

await app.listen({ host: "0.0.0.0", port: PORT });
logStartupPhase("server_listening", startupState.startedAt, { port: PORT });
try {
  await bootstrapRuntimeState();
  startupState.ready = true;
  startupState.completedAt = Date.now();
  logStartupPhase("startup_ready", startupState.startedAt, {
    players: players.size,
    onlinePlayers: onlineSocketCount()
  });
} catch (err) {
  logRuntimeError("startup bootstrap failed", err);
  process.exit(1);
}
