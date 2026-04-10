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
  FORT_DEFENSE_MULT,
  LIGHT_OUTPOST_ATTACK_MULT,
  LIGHT_OUTPOST_BUILD_MS,
  OBSERVATORY_BUILD_MS,
  OBSERVATORY_UPKEEP_PER_MIN,
  SIEGE_OUTPOST_ATTACK_MULT,
  SIEGE_OUTPOST_BUILD_COST,
  SIEGE_OUTPOST_BUILD_MS,
  WOODEN_FORT_BUILD_MS,
  WOODEN_FORT_DEFENSE_MULT,
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
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import { currentShardRainNotice, nextShardRainStartAt } from "./server-shard-rain.js";
import { createServerPlayerProgression } from "./server-player-progression.js";
import { createServerStatusMetrics } from "./server-status-metrics.js";
import { createServerVictoryPressure } from "./server-victory-pressure.js";
import { createServerTechDomainRuntime } from "./server-tech-domain-runtime.js";
import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import { Worker } from "node:worker_threads";
import { z } from "zod";
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { loadTechTree, type StatsModKey } from "./tech-tree.js";
import { loadDomainTree } from "./domain-tree.js";
import { buildAdminPlayerListPayload } from "./player-admin-payload.js";
import { rankSeasonVictoryPaths, type AiSeasonVictoryPathId } from "./ai/goap.js";
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
import { appendPlayerActivityEntry, buildTownActivityEntry } from "./player-activity.js";
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

const socketUsesLoopback = (socket: Ws): boolean => {
  const remoteAddress = (socket as Ws & { _socket?: import("node:net").Socket })._socket?.remoteAddress ?? "";
  return (
    remoteAddress === "127.0.0.1" ||
    remoteAddress === "::1" ||
    remoteAddress === "::ffff:127.0.0.1"
  );
};
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
  type SnapshotEconomySection,
  type SnapshotMetaSection,
  type SnapshotPlayersSection,
  type SnapshotSectionIndex,
  type SnapshotState,
  type SnapshotSystemsSection,
  type SnapshotTerritorySection,
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
  ALLIANCE_REQUEST_TTL_MS,
  BARBARIAN_MAINTENANCE_INTERVAL_MS,
  BARBARIAN_MAINTENANCE_MAX_SPAWNS_PER_PASS,
  BARBARIAN_OWNER_ID,
  BARBARIAN_TICK_MS,
  BANK_BUILD_CRYSTAL_COST,
  BANK_BUILD_GOLD_COST,
  BANK_CRYSTAL_UPKEEP,
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
  CARAVANARY_BUILD_CRYSTAL_COST,
  CARAVANARY_BUILD_GOLD_COST,
  CARAVANARY_GOLD_UPKEEP,
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
  MARKET_BUILD_CRYSTAL_COST,
  MARKET_BUILD_GOLD_COST,
  MARKET_CRYSTAL_UPKEEP,
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

type AiTurnAnalysis = {
  territorySummary: AiTerritorySummary;
  aiIncome: number;
  runnerUpIncome: number;
  controlledTowns: number;
  settledTiles: number;
  frontierTiles: number;
  worldFlags: Set<string>;
  underThreat: boolean;
  foodCoverage: number;
  foodCoverageLow: boolean;
  economyWeak: boolean;
  frontierDebt: boolean;
  threatCritical: boolean;
};

type AiStrategicFocus = "BALANCED" | "ECONOMIC_RECOVERY" | "ISLAND_FOOTPRINT" | "MILITARY_PRESSURE" | "BORDER_CONTAINMENT" | "SHARD_RUSH";
type AiFrontPosture = "BREAK" | "CONTAIN" | "TRUCE";

type AiStrategicState = {
  focus: AiStrategicFocus;
  frontPosture: AiFrontPosture;
  targetPlayerId?: string;
  weakestIslandRatio: number;
  undercoveredIslandCount: number;
  updatedAt: number;
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
const aiTurnDebugByPlayer = new Map<string, AiTurnDebugEntry>();
const aiLastActionFailureByPlayer = new Map<string, AiActionFailureEntry>();
const aiVictoryPathByPlayer = new Map<string, AiSeasonVictoryPathId>();
const aiVictoryPathUpdatedAtByPlayer = new Map<string, number>();

const normalizedPlayerHandle = (name: string): string => {
  const cleaned = name.replace(/\s+/g, " ").trim();
  if (!cleaned) return "Empire";
  return cleaned.slice(0, 24);
};

const playerNameTaken = (candidate: string, excludePlayerId?: string): boolean => {
  for (const player of players.values()) {
    if (excludePlayerId && player.id === excludePlayerId) continue;
    if (player.name === candidate) return true;
  }
  return false;
};

const uniquePlayerName = (uid: string, preferred: string): string => {
  const base = normalizedPlayerHandle(preferred);
  const existingIdentity = authIdentityByUid.get(uid);
  if (existingIdentity) return existingIdentity.name;
  let candidate = base;
  let suffix = 2;
  while (playerNameTaken(candidate)) {
    candidate = `${base.slice(0, Math.max(1, 24 - String(suffix).length - 1))}-${suffix}`;
    suffix += 1;
  }
  return candidate;
};

const claimPlayerName = (playerId: string, preferred: string): string => {
  const base = normalizedPlayerHandle(preferred);
  let candidate = base;
  let suffix = 2;
  while (playerNameTaken(candidate, playerId)) {
    candidate = `${base.slice(0, Math.max(1, 24 - String(suffix).length - 1))}-${suffix}`;
    suffix += 1;
  }
  return candidate;
};

const AI_SINGLE_NAMES = [
  "Conan",
  "Boudica",
  "Ragnar",
  "Nyx",
  "Ivar",
  "Brakka",
  "Skarn",
  "Valka",
  "Torvin",
  "Morrigan",
  "Korga",
  "Thyra"
] as const;

const AI_NAME_PREFIXES = [
  "Bastard",
  "Iron",
  "Wolf",
  "Raven",
  "Blood",
  "Ash",
  "Bone",
  "Storm",
  "Night",
  "Skull",
  "Dread",
  "Black"
] as const;

const AI_NAME_SUFFIXES = [
  "Cleaver",
  "Reaver",
  "Fang",
  "Hammer",
  "Render",
  "Maw",
  "Howl",
  "Breaker",
  "Warden",
  "Rider",
  "Seer",
  "Brand"
] as const;

const randomFrom = <T,>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)]!;

const generateAiNickname = (): string => {
  for (let i = 0; i < 24; i += 1) {
    const preferred =
      Math.random() < 0.35
        ? randomFrom(AI_SINGLE_NAMES)
        : `${randomFrom(AI_NAME_PREFIXES)}${randomFrom(AI_NAME_SUFFIXES)}`;
    if (!playerNameTaken(preferred)) return preferred;
  }
  return `${randomFrom(AI_NAME_PREFIXES)}${randomFrom(AI_NAME_SUFFIXES)}`;
};

const aiHasPlaceholderName = (name: string): boolean => /^AI Empire \d+$/.test(name);

const playerHasFogAdminAccess = (playerId: string): boolean => {
  for (const identity of authIdentityByUid.values()) {
    if (identity.playerId !== playerId) continue;
    return identity.email?.toLowerCase() === FOG_ADMIN_EMAIL;
  }
  return false;
};

const ensureAiPlayers = (): void => {
  const existing = [...players.values()].filter((player) => player.isAi);
  if (existing.length > AI_PLAYERS) {
    for (const player of existing.slice(AI_PLAYERS)) {
      players.delete(player.id);
      playerBaseMods.delete(player.id);
      strategicResourceStockByPlayer.delete(player.id);
      strategicResourceBufferByPlayer.delete(player.id);
      economyIndexByPlayer.delete(player.id);
      dynamicMissionsByPlayer.delete(player.id);
      forcedRevealTilesByPlayer.delete(player.id);
      revealedEmpireTargetsByPlayer.delete(player.id);
      playerEffectsByPlayer.delete(player.id);
      clusterControlledTilesByPlayer.delete(player.id);
      resourceCountsByPlayer.delete(player.id);
      frontierSettlementsByPlayer.delete(player.id);
      temporaryAttackBuffUntilByPlayer.delete(player.id);
      temporaryIncomeBuffUntilByPlayer.delete(player.id);
      abilityCooldownsByPlayer.delete(player.id);
      growthPausedUntilByPlayer.delete(player.id);
      townFeedingStateByPlayer.delete(player.id);
      observatoryTileKeysByPlayer.delete(player.id);
      economicStructureTileKeysByPlayer.delete(player.id);
      socketsByPlayer.delete(player.id);
      chunkSubscriptionByPlayer.delete(player.id);
      chunkSnapshotSentAtByPlayer.delete(player.id);
      chunkSnapshotGenerationByPlayer.delete(player.id);
      cachedVisibilitySnapshotByPlayer.delete(player.id);
      cachedChunkSnapshotByPlayer.delete(player.id);
    }
  }
  if (AI_PLAYERS <= 0) return;
  for (const player of existing) {
    if (!aiHasPlaceholderName(player.name)) continue;
    player.name = claimPlayerName(player.id, generateAiNickname());
  }
  for (let i = existing.length; i < AI_PLAYERS; i += 1) {
    const id = crypto.randomUUID();
    const player: Player = {
      id,
      name: claimPlayerName(id, generateAiNickname()),
      isAi: true,
      profileComplete: true,
      points: STARTING_GOLD,
      level: 0,
      techIds: new Set<string>(),
      domainIds: new Set<string>(),
      mods: { attack: 1, defense: 1, income: 1, vision: 1 },
      powerups: {},
      tileColor: colorFromId(id),
      missions: [],
      missionStats: defaultMissionStats(),
      territoryTiles: new Set<TileKey>(),
      T: 0,
      E: 0,
      Ts: 0,
      Es: 0,
      stamina: STAMINA_MAX,
      staminaUpdatedAt: now(),
      manpower: STARTING_MANPOWER,
      manpowerUpdatedAt: now(),
      manpowerCapSnapshot: STARTING_MANPOWER,
      allies: new Set<string>(),
      spawnShieldUntil: now() + 120_000,
      isEliminated: false,
      respawnPending: false,
      lastActiveAt: now(),
      lastEconomyWakeAt: now(),
      activityInbox: []
    };
    players.set(id, player);
    playerBaseMods.set(id, { attack: 1, defense: 1, income: 1, vision: 1 });
    strategicResourceStockByPlayer.set(id, emptyStrategicStocks());
    strategicResourceBufferByPlayer.set(id, emptyStrategicStocks());
    economyIndexByPlayer.set(id, emptyPlayerEconomyIndex());
    dynamicMissionsByPlayer.set(id, []);
    forcedRevealTilesByPlayer.set(id, new Set<TileKey>());
    setRevealTargetsForPlayer(id, []);
    playerEffectsByPlayer.set(id, emptyPlayerEffects());
    clusterControlledTilesByPlayer.set(id, new Map());
  }
};
const ownership = new Map<TileKey, string>();
const ownershipStateByTile = new Map<TileKey, OwnershipState>();
const barbarianAgents = new Map<string, BarbarianAgent>();
const barbarianAgentByTileKey = new Map<TileKey, string>();
interface PendingCapture {
  resolvesAt: number;
  origin: TileKey;
  target: TileKey;
  attackerId: string;
  staminaCost: number;
  manpowerCost: number;
  cancelled: boolean;
  actionType?: "EXPAND" | "ATTACK" | "BREAKTHROUGH_ATTACK" | "DEEP_STRIKE_ATTACK" | "NAVAL_INFILTRATION_ATTACK";
  startedAt?: number;
  traceId?: string;
  precomputedCombat?: {
    atkEff: number;
    defEff: number;
    winChance: number;
    win: boolean;
    previewChanges: Array<{
      x: number;
      y: number;
      ownerId?: string;
      ownershipState?: "FRONTIER" | "SETTLED" | "BARBARIAN";
    }>;
    previewWinnerId?: string;
    defenderOwnerId?: string;
    previewManpowerDelta?: number;
  };
  timeout?: NodeJS.Timeout;
}
type CombatResultChange = {
  x: number;
  y: number;
  ownerId?: string;
  ownershipState?: "FRONTIER" | "SETTLED" | "BARBARIAN";
};
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
const cachedChunkPayloadDiagnostics = (): { payloads: number; approxPayloadMb: number } => {
  let payloads = 0;
  let bytes = 0;
  for (const cached of cachedChunkSnapshotByPlayer.values()) {
    payloads += cached.payloadByChunkKey.size;
    for (const payload of cached.payloadByChunkKey.values()) bytes += Buffer.byteLength(payload, "utf8");
  }
  return {
    payloads,
    approxPayloadMb: roundTo(bytes / (1024 * 1024), 1)
  };
};
const maybeLogRuntimeMemoryWatermark = (
  reason: string,
  memory: ReturnType<typeof runtimeMemoryStats>,
  extra: Record<string, unknown> = {}
): void => {
  for (const thresholdMb of RUNTIME_MEMORY_WATERMARK_THRESHOLDS_MB) {
    if (memory.rssMb < thresholdMb || runtimeMemoryWatermarksLogged.has(thresholdMb)) continue;
    runtimeMemoryWatermarksLogged.add(thresholdMb);
    app.log.warn(
      {
        reason,
        thresholdMb,
        ...memory,
        ...extra
      },
      "runtime memory watermark crossed"
    );
    runtimeIncidentLog.record("memory_watermark", {
      reason,
      thresholdMb,
      ...memory,
      ...extra
    });
  }
};
const logSnapshotSerializationMemory = (
  stage: string,
  startedAt: number,
  memory: ReturnType<typeof runtimeMemoryStats>,
  extra: Record<string, unknown> = {}
): void => {
  app.log.warn(
    {
      stage,
      elapsedMs: Date.now() - startedAt,
      ...memory,
      ...extra
    },
    "snapshot serialization memory"
  );
  runtimeIncidentLog.record("snapshot_serialization", {
    stage,
    elapsedMs: Date.now() - startedAt,
    ...memory,
    ...extra
  });
  maybeLogRuntimeMemoryWatermark(`snapshot:${stage}`, memory, extra);
};
const runtimeCollectionDiagnostics = (): Array<{ name: string; entries: number }> => {
  const collections = [
    { name: "players", entries: players.size },
    { name: "ownership", entries: ownership.size },
    { name: "townsByTile", entries: townsByTile.size },
    { name: "barbarianAgents", entries: barbarianAgents.size },
    { name: "clustersById", entries: clustersById.size },
    { name: "chunkSubscriptionByPlayer", entries: chunkSubscriptionByPlayer.size },
    { name: "cachedVisibilitySnapshotByPlayer", entries: cachedVisibilitySnapshotByPlayer.size },
    { name: "cachedChunkSnapshotByPlayer", entries: cachedChunkSnapshotByPlayer.size },
    { name: "cachedSummaryChunkByChunkKey", entries: cachedSummaryChunkByChunkKey.size },
    { name: "chunkSnapshotGenerationByPlayer", entries: chunkSnapshotGenerationByPlayer.size },
    { name: "chunkSnapshotSentAtByPlayer", entries: chunkSnapshotSentAtByPlayer.size },
    { name: "actionTimestampsByPlayer", entries: actionTimestampsByPlayer.size },
    { name: "authIdentityByUid", entries: authIdentityByUid.size },
    { name: "verifiedFirebaseTokenCache", entries: verifiedFirebaseTokenCacheSize() },
    { name: "townFeedingStateByPlayer", entries: townFeedingStateByPlayer.size },
    { name: "tileYieldByTile", entries: tileYieldByTile.size },
    { name: "tileHistoryByTile", entries: tileHistoryByTile.size },
    { name: "terrainShapesByTile", entries: terrainShapesByTile.size },
    { name: "economicStructuresByTile", entries: economicStructuresByTile.size },
    { name: "docksByTile", entries: docksByTile.size },
    { name: "fortsByTile", entries: fortsByTile.size },
    { name: "observatoriesByTile", entries: observatoriesByTile.size },
    { name: "siegeOutpostsByTile", entries: siegeOutpostsByTile.size },
    { name: "runtimeIntervals", entries: runtimeIntervals.length }
  ];
  return collections.sort((a, b) => b.entries - a.entries || a.name.localeCompare(b.name)).slice(0, 12);
};
const perfSummary = <T,>(
  entries: T[],
  selectElapsedMs: (entry: T) => number
): {
  samples: number;
  avgMs: number;
  p95Ms: number;
  maxMs: number;
  lastMs: number;
} => {
  const elapsed = entries.map(selectElapsedMs).filter((value) => Number.isFinite(value));
  if (!elapsed.length) {
    return { samples: 0, avgMs: 0, p95Ms: 0, maxMs: 0, lastMs: 0 };
  }
  const sum = elapsed.reduce((total, value) => total + value, 0);
  return {
    samples: elapsed.length,
    avgMs: roundTo(sum / elapsed.length, 1),
    p95Ms: roundTo(percentile(elapsed, 0.95), 1),
    maxMs: roundTo(Math.max(...elapsed), 1),
    lastMs: roundTo(elapsed[elapsed.length - 1] ?? 0, 1)
  };
};
const chunkPhaseSummary = <
  T extends {
    visibilityMaskMs: number;
    summaryReadMs: number;
    serializeMs: number;
    sendMs: number;
    cachedPayloadChunks: number;
    rebuiltChunks: number;
    batches: number;
  }
>(
  entries: T[]
): {
  visibilityMaskP95Ms: number;
  summaryReadP95Ms: number;
  serializeP95Ms: number;
  sendP95Ms: number;
  cachedPayloadChunksAvg: number;
  rebuiltChunksAvg: number;
  batchesAvg: number;
  lastVisibilityMaskMs: number;
  lastSummaryReadMs: number;
  lastSerializeMs: number;
  lastSendMs: number;
  lastCachedPayloadChunks: number;
  lastRebuiltChunks: number;
  lastBatches: number;
} => {
  const lastEntry = entries[entries.length - 1];
  return {
    visibilityMaskP95Ms: perfSummary(entries, (entry) => entry.visibilityMaskMs).p95Ms,
    summaryReadP95Ms: perfSummary(entries, (entry) => entry.summaryReadMs).p95Ms,
    serializeP95Ms: perfSummary(entries, (entry) => entry.serializeMs).p95Ms,
    sendP95Ms: perfSummary(entries, (entry) => entry.sendMs).p95Ms,
    cachedPayloadChunksAvg: perfSummary(entries, (entry) => entry.cachedPayloadChunks).avgMs,
    rebuiltChunksAvg: perfSummary(entries, (entry) => entry.rebuiltChunks).avgMs,
    batchesAvg: perfSummary(entries, (entry) => entry.batches).avgMs,
    lastVisibilityMaskMs: roundTo(lastEntry?.visibilityMaskMs ?? 0, 1),
    lastSummaryReadMs: roundTo(lastEntry?.summaryReadMs ?? 0, 1),
    lastSerializeMs: roundTo(lastEntry?.serializeMs ?? 0, 1),
    lastSendMs: roundTo(lastEntry?.sendMs ?? 0, 1),
    lastCachedPayloadChunks: roundTo(lastEntry?.cachedPayloadChunks ?? 0, 1),
    lastRebuiltChunks: roundTo(lastEntry?.rebuiltChunks ?? 0, 1),
    lastBatches: roundTo(lastEntry?.batches ?? 0, 1)
  };
};
const hottestAiTurnPhase = (phaseTimings: Record<string, number>): { phase: string; elapsedMs: number } => {
  let phase = "unknown";
  let elapsedMs = 0;
  for (const [phaseName, phaseDuration] of Object.entries(phaseTimings)) {
    if (phaseDuration <= elapsedMs) continue;
    phase = phaseName;
    elapsedMs = phaseDuration;
  }
  return { phase, elapsedMs };
};
const recordAiBudgetBreach = (
  actor: Player,
  totalElapsedMs: number,
  phaseTimings: Record<string, number>,
  extras?: { reason?: string; actionKey?: string }
): void => {
  if (totalElapsedMs < AI_TICK_BUDGET_MS) return;
  const hottestPhase = hottestAiTurnPhase(phaseTimings);
  const sample = {
    at: now(),
    playerId: actor.id,
    elapsedMs: totalElapsedMs,
    overBudgetMs: totalElapsedMs - AI_TICK_BUDGET_MS,
    phase: hottestPhase.phase,
    phaseElapsedMs: hottestPhase.elapsedMs,
    ...(extras?.reason ? { reason: extras.reason } : {}),
    ...(extras?.actionKey ? { actionKey: extras.actionKey } : {})
  };
  recentAiBudgetBreachPerf.push(sample);
  runtimeState.appRef?.log.warn(sample, "ai budget breach");
};
const runtimeHotspotDiagnostics = (): {
  aiTicks: ReturnType<typeof perfSummary> & { lastAiPlayers: number };
  aiBudget: ReturnType<typeof perfSummary> & {
    budgetMs: number;
    breaches: number;
    lastPhase?: string;
    lastReason?: string;
    lastActionKey?: string;
  };
  chunkSnapshots: ReturnType<typeof perfSummary> &
    ReturnType<typeof chunkPhaseSummary> & {
      maxChunks: number;
      maxTiles: number;
    };
} => {
  const aiEntries = recentAiTickPerf.values();
  const aiBudgetEntries = recentAiBudgetBreachPerf.values();
  const chunkEntries = recentChunkSnapshotPerf.values();
  const lastAiBudgetEntry = aiBudgetEntries[aiBudgetEntries.length - 1];
  return {
    aiTicks: {
      ...perfSummary(aiEntries, (entry) => entry.elapsedMs),
      lastAiPlayers: aiEntries[aiEntries.length - 1]?.aiPlayers ?? 0
    },
    aiBudget: {
      ...perfSummary(aiBudgetEntries, (entry) => entry.elapsedMs),
      budgetMs: AI_TICK_BUDGET_MS,
      breaches: aiBudgetEntries.length,
      ...(lastAiBudgetEntry?.phase ? { lastPhase: lastAiBudgetEntry.phase } : {}),
      ...(lastAiBudgetEntry?.reason ? { lastReason: lastAiBudgetEntry.reason } : {}),
      ...(lastAiBudgetEntry?.actionKey ? { lastActionKey: lastAiBudgetEntry.actionKey } : {})
    },
    chunkSnapshots: {
      ...perfSummary(chunkEntries, (entry) => entry.elapsedMs),
      ...chunkPhaseSummary(chunkEntries),
      maxChunks: chunkEntries.reduce((max, entry) => Math.max(max, entry.chunks), 0),
      maxTiles: chunkEntries.reduce((max, entry) => Math.max(max, entry.tiles), 0)
    }
  };
};
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
  normalizeLegacySettlementTowns,
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
  ownership,
  players,
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
  CARAVANARY_GOLD_UPKEEP,
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
  RADAR_SYSTEM_GOLD_UPKEEP,
  MARKET_CRYSTAL_UPKEEP,
  BANK_CRYSTAL_UPKEEP
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
  MARKET_BUILD_CRYSTAL_COST,
  GRANARY_BUILD_FOOD_COST,
  BANK_BUILD_CRYSTAL_COST,
  CARAVANARY_BUILD_CRYSTAL_COST,
  GARRISON_HALL_BUILD_CRYSTAL_COST,
  CUSTOMS_HOUSE_BUILD_CRYSTAL_COST,
  RADAR_SYSTEM_BUILD_CRYSTAL_COST,
  AIRPORT_BUILD_CRYSTAL_COST,
  MARKET_CRYSTAL_UPKEEP,
  BANK_CRYSTAL_UPKEEP,
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
  victoryPressurePausedAt = undefined;
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

const runtimeTileCore = (x: number, y: number): RuntimeTileCore => {
  const wx = wrapX(x, WORLD_WIDTH);
  const wy = wrapY(y, WORLD_HEIGHT);
  const tileKey = key(wx, wy);
  const terrain = terrainAtRuntime(wx, wy);
  const ownerId = ownership.get(tileKey);
  const ownershipState = ownerId ? (ownershipStateByTile.get(tileKey) ?? (ownerId === BARBARIAN_OWNER_ID ? "BARBARIAN" : "SETTLED")) : undefined;
  const resource = terrain === "LAND" ? applyClusterResources(wx, wy, resourceAt(wx, wy)) : undefined;
  return { x: wx, y: wy, tileKey, terrain, ownerId, ownershipState, resource };
};

const aiTileLiteAt = (x: number, y: number): Tile => {
  const core = runtimeTileCore(x, y);
  const tile: Tile = {
    x: core.x,
    y: core.y,
    terrain: core.terrain,
    lastChangedAt: 0
  };
  if (core.resource) tile.resource = core.resource;
  if (core.ownerId) tile.ownerId = core.ownerId;
  if (core.ownershipState) tile.ownershipState = core.ownershipState;
  const tk = core.tileKey;
  const dock = docksByTile.get(tk);
  if (dock) tile.dockId = dock.dockId;
  if (townsByTile.has(tk)) {
    const town = townsByTile.get(tk)!;
    tile.town = thinTownSummaryForTile(town, core.ownerId);
  }
  const fort = fortsByTile.get(tk);
  if (fort) {
    tile.fort = {
      ownerId: fort.ownerId,
      status: fort.status,
      ...(fort.completesAt !== undefined ? { completesAt: fort.completesAt } : {}),
      ...(fort.disabledUntil !== undefined ? { disabledUntil: fort.disabledUntil } : {})
    };
  }
  const observatory = observatoriesByTile.get(tk);
  if (observatory) {
    tile.observatory = {
      ownerId: observatory.ownerId,
      status: observatory.status,
      ...(observatory.completesAt !== undefined ? { completesAt: observatory.completesAt } : {}),
      ...(observatory.cooldownUntil !== undefined ? { cooldownUntil: observatory.cooldownUntil } : {})
    };
  }
  const siegeOutpost = siegeOutpostsByTile.get(tk);
  if (siegeOutpost) tile.siegeOutpost = { ownerId: siegeOutpost.ownerId, status: siegeOutpost.status, ...(siegeOutpost.completesAt !== undefined ? { completesAt: siegeOutpost.completesAt } : {}) };
  const economic = economicStructuresByTile.get(tk);
  if (economic) {
    tile.economicStructure = {
      ownerId: economic.ownerId,
      type: economic.type,
      status: economic.status,
      ...(economic.inactiveReason !== undefined ? { inactiveReason: economic.inactiveReason } : {}),
      ...(economic.disabledUntil !== undefined ? { disabledUntil: economic.disabledUntil } : {}),
      ...(economic.completesAt !== undefined ? { completesAt: economic.completesAt } : {})
    };
  }
  return tile;
};

const buildTownSummaryForTile = (
  town: TownDefinition,
  ownerId: string | undefined,
  includeConnectedTownNames: boolean
): NonNullable<Tile["town"]> => {
  const support = ownerId ? townSupport(town.tileKey, ownerId) : { supportCurrent: 0, supportMax: 0 };
  const tier = townPopulationTierForTown(town);
  const isFed = isTownFedForOwner(town.tileKey, ownerId);
  const owner = ownerId ? players.get(ownerId) : undefined;
  const manpowerGoldPaused = Boolean(owner && !townGoldIncomeEnabledForPlayer(owner));
  const market = structureForSupportedTown(town.tileKey, ownerId, "MARKET");
  const granary = structureForSupportedTown(town.tileKey, ownerId, "GRANARY");
  const bank = structureForSupportedTown(town.tileKey, ownerId, "BANK");
  const connectedTownKeys = includeConnectedTownNames && ownerId ? directlyConnectedTownKeysForTown(ownerId, town.tileKey) : [];
  return {
    name: prettyTownName(town),
    type: town.type,
    baseGoldPerMinute: tier === "SETTLEMENT" ? SETTLEMENT_BASE_GOLD_PER_MIN : TOWN_BASE_GOLD_PER_MIN,
    supportCurrent: support.supportCurrent,
    supportMax: support.supportMax,
    goldPerMinute: townIncomeForOwner(town, ownerId),
    cap: townCapForOwner(town, ownerId),
    isFed,
    population: town.population,
    maxPopulation: town.maxPopulation,
    populationGrowthPerMinute: townPopulationGrowthPerMinuteForOwner(town, ownerId),
    populationTier: townPopulationTierForTown(town),
    connectedTownCount: town.connectedTownCount,
    connectedTownBonus: town.connectedTownBonus,
    connectedTownNames: connectedTownKeys
      .map((townKey: TileKey) => townsByTile.get(townKey))
      .map((connectedTown: TownDefinition | undefined) => (connectedTown ? prettyTownName(connectedTown) : undefined))
      .filter((label: string | undefined): label is string => Boolean(label)),
    ...(manpowerGoldPaused && owner
      ? {
          goldIncomePausedReason: "MANPOWER_NOT_FULL" as const,
          manpowerCurrent: Math.round(effectiveManpowerAt(owner)),
          manpowerCap: Math.round(playerManpowerCap(owner))
        }
      : {}),
    hasMarket: Boolean(market),
    marketActive: Boolean(market && market.status === "active" && isFed),
    hasGranary: Boolean(granary),
    granaryActive: Boolean(granary && granary.status === "active"),
    hasBank: Boolean(bank),
    bankActive: Boolean(bank && bank.status === "active"),
    foodUpkeepPerMinute: townFoodUpkeepPerMinute(town),
    growthModifiers: townGrowthModifiersForOwner(town, ownerId)
  };
};

const thinTownSummaryForTile = (town: TownDefinition, ownerId: string | undefined): NonNullable<Tile["town"]> =>
  buildTownSummaryForTile(town, ownerId, false);

const townSummaryForTile = (town: TownDefinition, ownerId: string | undefined): NonNullable<Tile["town"]> =>
  buildTownSummaryForTile(town, ownerId, true);

const applyTileYieldSummary = (
  tile: Tile,
  wx: number,
  wy: number,
  ownerId: string | undefined,
  ownershipState: OwnershipState | undefined,
  resource: ResourceType | undefined,
  dock: Dock | undefined,
  town: TownDefinition | undefined,
  terrain: Terrain
): void => {
  const tk = key(wx, wy);
  const yieldBuf = tileYieldByTile.get(tk);
  if (dock) {
    const dockSummary = dockSummaryForOwner(dock, ownerId);
    if (dockSummary) tile.dock = dockSummary;
    else delete tile.dock;
  } else {
    delete tile.dock;
  }
  if (ownerId && ownershipState === "SETTLED" && terrain === "LAND") {
    const sabotageMult = siphonMultiplierAt(tk);
    const goldPerMinuteFromTile =
      ((resource ? (resourceRate[resource] ?? 0) * sabotageMult : 0) +
        (dock ? dockIncomeForOwner(dock, ownerId) : 0) +
        (town ? townIncomeForOwner(town, ownerId) * sabotageMult : 0)) *
      (players.get(ownerId)?.mods.income ?? 1) *
      PASSIVE_INCOME_MULT *
      HARVEST_GOLD_RATE_MULT;
    const strategicPerDay: Partial<Record<StrategicResource, number>> = {};
    const sr = toStrategicResource(resource);
    if (sr && resource) {
      const mult = activeResourceIncomeMult(ownerId, resource);
      strategicPerDay[sr] =
        (strategicDailyFromResource[resource] ?? 0) *
        mult *
        sabotageMult *
        economicStructureOutputMultAt(tk, ownerId);
    }
    const economicStructure = economicStructuresByTile.get(tk);
    if (economicStructure && economicStructure.ownerId === ownerId && economicStructure.status === "active") {
      const converterDaily = converterStructureOutputFor(economicStructure.type, ownerId);
      if (converterDaily) {
        for (const [resourceKey, amount] of Object.entries(converterDaily) as Array<[StrategicResource, number]>) {
          strategicPerDay[resourceKey] = (strategicPerDay[resourceKey] ?? 0) + amount;
        }
      }
    }
    (tile as Tile & { yieldRate?: { goldPerMinute?: number; strategicPerDay?: Partial<Record<StrategicResource, number>> } }).yieldRate = {
      goldPerMinute: Number(goldPerMinuteFromTile.toFixed(4)),
      strategicPerDay
    };
  }
  (tile as Tile & { yieldCap?: { gold: number; strategicEach: number } }).yieldCap = tileYieldCapsFor(tk, ownerId);
  if (yieldBuf && ownerId) {
    const strategic = roundedPositiveStrategic(yieldBuf.strategic);
    if (yieldBuf.gold > 0 || hasPositiveStrategicBuffer(yieldBuf.strategic)) {
      (tile as Tile & { yield?: { gold: number; strategic: Partial<Record<StrategicResource, number>> } }).yield = {
        gold: Number(yieldBuf.gold.toFixed(3)),
        strategic
      };
    }
  }
};

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

const playerTile = (x: number, y: number): Tile => {
  const wx = wrapX(x, WORLD_WIDTH);
  const wy = wrapY(y, WORLD_HEIGHT);
  const tk = key(wx, wy);
  const terrain = terrainAtRuntime(wx, wy);
  const baseResource = terrain === "LAND" ? resourceAt(wx, wy) : undefined;
  const resource = terrain === "LAND" ? applyClusterResources(wx, wy, baseResource) : undefined;
  const ownerId = ownership.get(key(wx, wy));
  const ownershipState = ownershipStateByTile.get(key(wx, wy));
  const clusterId = clusterByTile.get(tk);
  const clusterType = clusterId ? clustersById.get(clusterId)?.clusterType : undefined;
  const dock = terrain === "LAND" ? docksByTile.get(tk) : undefined;
  const shardSite = terrain === "LAND" ? shardSiteViewAt(tk) : undefined;
  const town = terrain === "LAND" ? townsByTile.get(tk) : undefined;
  const fort = terrain === "LAND" ? fortsByTile.get(tk) : undefined;
  const observatory = terrain === "LAND" ? observatoriesByTile.get(tk) : undefined;
  const siegeOutpost = terrain === "LAND" ? siegeOutpostsByTile.get(tk) : undefined;
  const sabotage = siphonByTile.get(tk);
  const breachShock = breachShockByTile.get(tk);
  const history = tileHistoryByTile.get(tk);
  const tile: Tile = {
    x: wx,
    y: wy,
    terrain,
    detailLevel: "full",
    lastChangedAt: now()
  };
  const continentId = continentIdAt(wx, wy);
  const regionType = regionTypeAtLocal(wx, wy);
  if (resource && !dock) tile.resource = resource;
  if (ownerId) {
    tile.ownerId = ownerId;
    tile.ownershipState = ownershipState ?? (ownerId === BARBARIAN_OWNER_ID ? "BARBARIAN" : "SETTLED");
    if (ownerId !== BARBARIAN_OWNER_ID && activeSettlementTileKeyForPlayer(ownerId) === tk) tile.capital = true;
  }
  if (continentId !== undefined) tile.continentId = continentId;
  if (terrain === "LAND" && regionType) (tile as Tile & { regionType?: string }).regionType = regionType;
  if (terrain === "LAND" && clusterId) tile.clusterId = clusterId;
  if (terrain === "LAND" && clusterType) tile.clusterType = clusterType;
  if (dock) tile.dockId = dock.dockId;
  if (terrain === "LAND") tile.shardSite = shardSite ?? null;
  if (breachShock && breachShock.expiresAt > now() && ownerId === breachShock.ownerId) tile.breachShockUntil = breachShock.expiresAt;
  if (town) {
    const owner = ownerId;
  const support = owner ? townSupport(town.tileKey, owner) : { supportCurrent: 0, supportMax: 0 };
  const tier = townPopulationTierForTown(town);
    const goldPerMinute = townIncomeForOwner(town, owner) * siphonMultiplierAt(town.tileKey);
    const isFed = isTownFedForOwner(town.tileKey, owner);
    const ownerPlayer = owner ? players.get(owner) : undefined;
    const manpowerGoldPaused = Boolean(ownerPlayer && !townGoldIncomeEnabledForPlayer(ownerPlayer));
    const connectedTownKeys = owner ? directlyConnectedTownKeysForTown(owner, town.tileKey) : [];
    const market = structureForSupportedTown(town.tileKey, owner, "MARKET");
    const granary = structureForSupportedTown(town.tileKey, owner, "GRANARY");
    const bank = structureForSupportedTown(town.tileKey, owner, "BANK");
    tile.town = {
      name: prettyTownName(town),
      type: town.type,
      baseGoldPerMinute: tier === "SETTLEMENT" ? SETTLEMENT_BASE_GOLD_PER_MIN : TOWN_BASE_GOLD_PER_MIN,
      supportCurrent: support.supportCurrent,
      supportMax: support.supportMax,
      goldPerMinute,
      cap: townCapForOwner(town, owner),
      isFed,
      population: town.population,
      maxPopulation: town.maxPopulation,
      populationGrowthPerMinute: townPopulationGrowthPerMinuteForOwner(town, owner),
      populationTier: townPopulationTierForTown(town),
      connectedTownCount: town.connectedTownCount,
      connectedTownBonus: town.connectedTownBonus,
      connectedTownNames: connectedTownKeys
        .map((townKey: TileKey) => townsByTile.get(townKey))
        .map((connectedTown: TownDefinition | undefined) => (connectedTown ? prettyTownName(connectedTown) : undefined))
        .filter((label: string | undefined): label is string => Boolean(label)),
      ...(manpowerGoldPaused && ownerPlayer
        ? {
            goldIncomePausedReason: "MANPOWER_NOT_FULL" as const,
            manpowerCurrent: Math.round(effectiveManpowerAt(ownerPlayer)),
            manpowerCap: Math.round(playerManpowerCap(ownerPlayer))
          }
        : {}),
      hasMarket: Boolean(market),
      marketActive: Boolean(market && market.status === "active" && isFed),
      hasGranary: Boolean(granary),
      granaryActive: Boolean(granary && granary.status === "active"),
      hasBank: Boolean(bank),
      bankActive: Boolean(bank && bank.status === "active"),
      foodUpkeepPerMinute: townFoodUpkeepPerMinute(town),
      growthModifiers: townGrowthModifiersForOwner(town, owner)
    };
  }
  if (fort) {
    const fortView: { ownerId: string; status: "under_construction" | "active" | "removing"; completesAt?: number; disabledUntil?: number } = {
      ownerId: fort.ownerId,
      status: fort.status
    };
    if ((fort.status === "under_construction" || fort.status === "removing") && fort.completesAt !== undefined) fortView.completesAt = fort.completesAt;
    if (fort.disabledUntil !== undefined) fortView.disabledUntil = fort.disabledUntil;
    tile.fort = fortView;
  }
  if (observatory) {
    const status = observatoryStatusForTile(observatory.ownerId, observatory.tileKey);
    tile.observatory = {
      ownerId: observatory.ownerId,
      status,
      ...(observatory.cooldownUntil !== undefined ? { cooldownUntil: observatory.cooldownUntil } : {})
    };
    if ((status === "under_construction" || status === "removing") && observatory.completesAt !== undefined) tile.observatory.completesAt = observatory.completesAt;
  }
  if (siegeOutpost) {
    const siegeView: { ownerId: string; status: "under_construction" | "active" | "removing"; completesAt?: number } = {
      ownerId: siegeOutpost.ownerId,
      status: siegeOutpost.status
    };
    if ((siegeOutpost.status === "under_construction" || siegeOutpost.status === "removing") && siegeOutpost.completesAt !== undefined) {
      siegeView.completesAt = siegeOutpost.completesAt;
    }
    tile.siegeOutpost = siegeView;
  }
  if (sabotage && sabotage.endsAt > now()) {
    tile.sabotage = {
      ownerId: sabotage.casterPlayerId,
      endsAt: sabotage.endsAt,
      outputMultiplier: 1 - SIPHON_SHARE
    };
  }
  const economicStructure = economicStructuresByTile.get(key(wx, wy));
  if (economicStructure) {
    const economicStructureView: NonNullable<Tile["economicStructure"]> = {
      ownerId: economicStructure.ownerId,
      type: economicStructure.type,
      status: economicStructure.status
    };
    if (economicStructure.inactiveReason !== undefined) economicStructureView.inactiveReason = economicStructure.inactiveReason;
    if (economicStructure.disabledUntil !== undefined) economicStructureView.disabledUntil = economicStructure.disabledUntil;
    if ((economicStructure.status === "under_construction" || economicStructure.status === "removing") && economicStructure.completesAt !== undefined) {
      economicStructureView.completesAt = economicStructure.completesAt;
    }
    tile.economicStructure = economicStructureView;
  }
  if (history && (history.captureCount > 0 || history.structureHistory.length > 0 || history.lastStructureType)) {
    const historyView: NonNullable<Tile["history"]> = {
      previousOwners: [...history.previousOwners],
      captureCount: history.captureCount,
      structureHistory: [...history.structureHistory]
    };
    if (history.lastOwnerId !== undefined) historyView.lastOwnerId = history.lastOwnerId;
    if (history.lastCapturedAt !== undefined) historyView.lastCapturedAt = history.lastCapturedAt;
    if (history.lastStructureType !== undefined) historyView.lastStructureType = history.lastStructureType;
    tile.history = historyView;
  }
  const upkeepEntries = tileUpkeepEntriesForTile(tk, ownerId);
  if (upkeepEntries.length > 0) tile.upkeepEntries = upkeepEntries;
  const yieldBuf = tileYieldByTile.get(key(wx, wy));
  const ownerEffects = ownerId ? getPlayerEffectsForPlayer(ownerId) : emptyPlayerEffects();
  if (ownerId && ownershipState === "SETTLED" && terrain === "LAND") {
    const sabotageMult = siphonMultiplierAt(key(wx, wy));
    const goldPerMinuteFromTile =
      ((resource ? (resourceRate[resource] ?? 0) * sabotageMult : 0) +
        (dock ? dockIncomeForOwner(dock, ownerId) : 0) +
        (town ? townIncomeForOwner(town, ownerId) * sabotageMult : 0)) *
      (players.get(ownerId)?.mods.income ?? 1) *
      PASSIVE_INCOME_MULT *
      HARVEST_GOLD_RATE_MULT;
    const strategicPerDay: Partial<Record<StrategicResource, number>> = {};
    const sr = toStrategicResource(resource);
    if (sr && resource) {
      const mult = activeResourceIncomeMult(ownerId, resource);
      strategicPerDay[sr] =
        (strategicDailyFromResource[resource] ?? 0) *
        mult *
        sabotageMult *
        economicStructureOutputMultAt(key(wx, wy), ownerId);
    }
    const economicStructure = economicStructuresByTile.get(key(wx, wy));
    if (economicStructure && economicStructure.ownerId === ownerId && economicStructure.status === "active") {
      const converterDaily = converterStructureOutputFor(economicStructure.type, ownerId);
      if (converterDaily) {
        for (const [resourceKey, amount] of Object.entries(converterDaily) as Array<[StrategicResource, number]>) {
          strategicPerDay[resourceKey] = (strategicPerDay[resourceKey] ?? 0) + amount;
        }
      }
    }
    (tile as Tile & { yieldRate?: { goldPerMinute?: number; strategicPerDay?: Partial<Record<StrategicResource, number>> } }).yieldRate = {
      goldPerMinute: Number(goldPerMinuteFromTile.toFixed(4)),
      strategicPerDay
    };
  }
  (tile as Tile & { yieldCap?: { gold: number; strategicEach: number } }).yieldCap = tileYieldCapsFor(tk, ownerId);
  if (yieldBuf && ownerId) {
    const strategic = roundedPositiveStrategic(yieldBuf.strategic);
    if (yieldBuf.gold > 0 || hasPositiveStrategicBuffer(yieldBuf.strategic)) {
      (tile as Tile & { yield?: { gold: number; strategic: Partial<Record<StrategicResource, number>> } }).yield = {
        gold: Number(yieldBuf.gold.toFixed(3)),
        strategic
      };
    }
  }
  return tile;
};

const cardinalNeighborCores = (x: number, y: number): RuntimeTileCore[] => [
  runtimeTileCore(x, y - 1),
  runtimeTileCore(x + 1, y),
  runtimeTileCore(x, y + 1),
  runtimeTileCore(x - 1, y)
];

const adjacentNeighborCores = (x: number, y: number): RuntimeTileCore[] => [
  runtimeTileCore(x, y - 1),
  runtimeTileCore(x + 1, y),
  runtimeTileCore(x, y + 1),
  runtimeTileCore(x - 1, y),
  runtimeTileCore(x - 1, y - 1),
  runtimeTileCore(x + 1, y - 1),
  runtimeTileCore(x + 1, y + 1),
  runtimeTileCore(x - 1, y + 1)
];

const isValidCapitalTile = (player: Player, tileKey: TileKey | undefined): tileKey is TileKey => {
  if (!tileKey) return false;
  return ownership.get(tileKey) === player.id && ownershipStateByTile.get(tileKey) === "SETTLED";
};

const chooseCapitalTileKey = (player: Player): TileKey | undefined => {
  const settlementTile = activeSettlementTileKeyForPlayer(player.id);
  if (settlementTile) return settlementTile;
  if (isValidCapitalTile(player, player.spawnOrigin)) return player.spawnOrigin;
  const settledTowns = [...townsByTile.keys()]
    .filter((tk) => ownership.get(tk) === player.id && ownershipStateByTile.get(tk) === "SETTLED")
    .sort();
  if (settledTowns.length > 0) return settledTowns[0];
  const settledTiles = [...player.territoryTiles].filter((tk) => ownershipStateByTile.get(tk) === "SETTLED").sort();
  return settledTiles[0];
};

const logTileSync = (event: string, payload: Record<string, unknown>): void => {
  const playerId = typeof payload.playerId === "string" ? payload.playerId : undefined;
  const playerEmail = playerId
    ? [...authIdentityByUid.values()].find((identity) => identity.playerId === playerId)?.email?.toLowerCase()
    : undefined;
  if (!TILE_SYNC_DEBUG && (!playerEmail || !TILE_SYNC_DEBUG_EMAILS.has(playerEmail))) return;
  app.log.info(payload, `tile sync ${event}`);
};

const actionValidationPayload = (
  playerId: string,
  action: "ATTACK" | "EXPAND" | "BREAKTHROUGH_ATTACK",
  fromTile: ReturnType<typeof playerTile>,
  toTile: ReturnType<typeof playerTile>,
  extra: Record<string, unknown> = {}
): Record<string, unknown> => ({
  playerId,
  action,
  from: key(fromTile.x, fromTile.y),
  fromOwnerId: fromTile.ownerId,
  fromOwnershipState: fromTile.ownershipState,
  to: key(toTile.x, toTile.y),
  toOwnerId: toTile.ownerId,
  toOwnershipState: toTile.ownershipState,
  ...extra
});

const sendVisibleTileDeltaAt = (x: number, y: number): void => {
  for (const p of players.values()) {
    if (!tileInSubscription(p.id, x, y)) continue;
    if (!visible(p, x, y)) continue;
    const current = playerTile(x, y);
    current.fogged = false;
    logTileSync("visible_tile_delta_sent", {
      playerId: p.id,
      tileKey: key(x, y),
      ownerId: current.ownerId,
      ownershipState: current.ownershipState
    });
    sendToPlayer(p.id, { type: "TILE_DELTA", updates: [current] });
  }
};

const sendVisibleTileDeltaSquare = (x: number, y: number, radius: number): void => {
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      sendVisibleTileDeltaAt(wrapX(x + dx, WORLD_WIDTH), wrapY(y + dy, WORLD_HEIGHT));
    }
  }
};

const refreshVisibleOwnedTownsForPlayer = (playerId: string): void => {
  for (const townKey of ownedTownKeysForPlayer(playerId)) {
    const [x, y] = parseKey(townKey);
    sendVisibleTileDeltaAt(x, y);
  }
};

const refreshVisibleNearbyTownDeltas = (x: number, y: number): void => {
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const nx = wrapX(x + dx, WORLD_WIDTH);
      const ny = wrapY(y + dy, WORLD_HEIGHT);
      if (townsByTile.has(key(nx, ny))) sendVisibleTileDeltaAt(nx, ny);
    }
  }
};

const reconcileCapitalForPlayer = (player: Player): void => {
  const previous = player.capitalTileKey;
  const settlementTile = activeSettlementTileKeyForPlayer(player.id);
  const next = settlementTile ?? (isValidCapitalTile(player, previous) ? previous : chooseCapitalTileKey(player));
  if (previous === next) return;
  if (next) player.capitalTileKey = next;
  else delete player.capitalTileKey;
  if (previous) {
    const [x, y] = parseKey(previous);
    sendVisibleTileDeltaAt(x, y);
  }
  if (next) {
    const [x, y] = parseKey(next);
    sendVisibleTileDeltaAt(x, y);
  }
};

const getOrInitResourceCounts = (playerId: string): Record<ResourceType, number> => {
  let counts = resourceCountsByPlayer.get(playerId);
  if (!counts) {
    counts = { FARM: 0, FISH: 0, FUR: 0, WOOD: 0, IRON: 0, GEMS: 0, OIL: 0 };
    resourceCountsByPlayer.set(playerId, counts);
  } else {
    if (counts.FARM === undefined) counts.FARM = 0;
    if (counts.FISH === undefined) counts.FISH = 0;
    if (counts.FUR === undefined) counts.FUR = 0;
    if (counts.WOOD === undefined) counts.WOOD = 0;
    if (counts.IRON === undefined) counts.IRON = 0;
    if (counts.GEMS === undefined) counts.GEMS = 0;
    if (counts.OIL === undefined) counts.OIL = 0;
  }
  return counts;
};

const emptyStrategicStocks = (): Record<StrategicResource, number> => ({
  FOOD: 0,
  IRON: 0,
  CRYSTAL: 0,
  SUPPLY: 0,
  SHARD: 0,
  OIL: 0
});

const emptyTileYield = (): TileYieldBuffer => ({
  gold: 0,
  strategic: emptyStrategicStocks()
});

const emptyPlayerEconomyIndex = (): PlayerEconomyIndex => ({
  settledResourceTileKeys: new Set<TileKey>(),
  settledDockTileKeys: new Set<TileKey>(),
  settledTownTileKeys: new Set<TileKey>()
});

const getOrInitEconomyIndex = (playerId: string): PlayerEconomyIndex => {
  let index = economyIndexByPlayer.get(playerId);
  if (!index) {
    index = emptyPlayerEconomyIndex();
    economyIndexByPlayer.set(playerId, index);
  }
  return index;
};

const getOrInitOwnedTileKeySet = (index: Map<string, Set<TileKey>>, playerId: string): Set<TileKey> => {
  let set = index.get(playerId);
  if (!set) {
    set = new Set<TileKey>();
    index.set(playerId, set);
  }
  return set;
};

const trackOwnedTileKey = (index: Map<string, Set<TileKey>>, playerId: string, tileKey: TileKey): void => {
  getOrInitOwnedTileKeySet(index, playerId).add(tileKey);
};

const untrackOwnedTileKey = (index: Map<string, Set<TileKey>>, playerId: string, tileKey: TileKey): void => {
  const set = index.get(playerId);
  if (!set) return;
  set.delete(tileKey);
  if (set.size === 0) index.delete(playerId);
};

const ownedStructureCountForPlayer = (playerId: string, structureType: "FORT" | "OBSERVATORY" | "SIEGE_OUTPOST" | EconomicStructureType): number => {
  if (structureType === "FORT") {
    let count = 0;
    for (const fort of fortsByTile.values()) {
      if (fort.ownerId === playerId) count += 1;
    }
    return count;
  }
  if (structureType === "OBSERVATORY") return observatoryTileKeysByPlayer.get(playerId)?.size ?? 0;
  if (structureType === "SIEGE_OUTPOST") {
    let count = 0;
    for (const outpost of siegeOutpostsByTile.values()) {
      if (outpost.ownerId === playerId) count += 1;
    }
    return count;
  }
  let count = 0;
  for (const tileKey of economicStructureTileKeysByPlayer.get(playerId) ?? []) {
    const structure = economicStructuresByTile.get(tileKey);
    if (structure?.ownerId === playerId && structure.type === structureType) count += 1;
  }
  return count;
};

const rebuildEconomyIndexForPlayer = (playerId: string): void => {
  const player = players.get(playerId);
  if (!player) {
    economyIndexByPlayer.delete(playerId);
    return;
  }
  const index = getOrInitEconomyIndex(playerId);
  index.settledResourceTileKeys.clear();
  index.settledDockTileKeys.clear();
  index.settledTownTileKeys.clear();
  for (const tileKey of player.territoryTiles) {
    if (ownershipStateByTile.get(tileKey) !== "SETTLED") continue;
    const [x, y] = parseKey(tileKey);
    if (terrainAtRuntime(x, y) !== "LAND") continue;
    const resource = applyClusterResources(x, y, resourceAt(x, y));
    if (resource) index.settledResourceTileKeys.add(tileKey);
    if (docksByTile.has(tileKey)) index.settledDockTileKeys.add(tileKey);
    const town = townsByTile.get(tileKey);
    if (town) index.settledTownTileKeys.add(tileKey);
  }
};

const hasPositiveStrategicBuffer = (strategic: Partial<Record<StrategicResource, number>>): boolean => {
  for (const resource of STRATEGIC_RESOURCE_KEYS) {
    if ((strategic[resource] ?? 0) > 0) return true;
  }
  return false;
};

const pruneEmptyTileYield = (tileKey: TileKey, y: TileYieldBuffer): void => {
  if (y.gold > 0 || hasPositiveStrategicBuffer(y.strategic)) return;
  tileYieldByTile.delete(tileKey);
};

const roundedPositiveStrategic = (strategic: Record<StrategicResource, number>): Partial<Record<StrategicResource, number>> => {
  const out: Partial<Record<StrategicResource, number>> = {};
  for (const resource of STRATEGIC_RESOURCE_KEYS) {
    const value = strategic[resource] ?? 0;
    if (value > 0) out[resource] = Number(value.toFixed(3));
  }
  return out;
};

const getOrInitStrategicStocks = (playerId: string): Record<StrategicResource, number> => {
  let stock = strategicResourceStockByPlayer.get(playerId);
  if (!stock) {
    stock = emptyStrategicStocks();
    strategicResourceStockByPlayer.set(playerId, stock);
  }
  for (const r of ["FOOD", "IRON", "CRYSTAL", "SUPPLY", "SHARD"] as const) {
    if (stock[r] === undefined) stock[r] = 0;
  }
  return stock;
};

const getOrInitStrategicBuffer = (playerId: string): Record<StrategicResource, number> => {
  let buf = strategicResourceBufferByPlayer.get(playerId);
  if (!buf) {
    buf = emptyStrategicStocks();
    strategicResourceBufferByPlayer.set(playerId, buf);
  }
  for (const r of ["FOOD", "IRON", "CRYSTAL", "SUPPLY", "SHARD"] as const) {
    if (buf[r] === undefined) buf[r] = 0;
  }
  return buf;
};

const getOrInitTileYield = (tileKey: TileKey): TileYieldBuffer => {
  let y = tileYieldByTile.get(tileKey);
  if (!y) {
    y = emptyTileYield();
    tileYieldByTile.set(tileKey, y);
  }
  for (const r of ["FOOD", "IRON", "CRYSTAL", "SUPPLY", "SHARD"] as const) {
    if (y.strategic[r] === undefined) y.strategic[r] = 0;
  }
  return y;
};

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

const availableYieldStrategicForPlayer = (player: Player, resource: StrategicResource): number => {
  let total = 0;
  for (const tk of player.territoryTiles) {
    if (ownershipStateByTile.get(tk) !== "SETTLED") continue;
    const y = tileYieldByTile.get(tk);
    if (!y) continue;
    total += Math.max(0, y.strategic[resource] ?? 0);
  }
  return total;
};

const getPlayerEffectsForPlayer = (playerId: string): PlayerEffects => {
  const existing = playerEffectsByPlayer.get(playerId);
  if (existing) return existing;
  const base = emptyPlayerEffects();
  playerEffectsByPlayer.set(playerId, base);
  return base;
};

const recomputePlayerEffectsForPlayer = (player: Player): void => {
  const next = emptyPlayerEffects();
  for (const id of player.techIds) {
    const tech = techById.get(id);
    const effects = tech?.effects;
    if (!effects) continue;
    if (effects.unlockForts) next.unlockForts = true;
    if (effects.unlockSiegeOutposts) next.unlockSiegeOutposts = true;
    if ((effects as { unlockWoodenFort?: boolean }).unlockWoodenFort) next.unlockWoodenFort = true;
    if ((effects as { unlockLightOutpost?: boolean }).unlockLightOutpost) next.unlockLightOutpost = true;
    if ((effects as { unlockSynthOverload?: boolean }).unlockSynthOverload) next.unlockSynthOverload = true;
    if ((effects as { unlockAdvancedSynthesizers?: boolean }).unlockAdvancedSynthesizers) next.unlockAdvancedSynthesizers = true;
    if (effects.unlockGranary) next.unlockGranary = true;
    if (effects.unlockRevealRegion) next.unlockRevealRegion = true;
    if (effects.unlockRevealEmpire) next.unlockRevealEmpire = true;
    if (effects.unlockDeepStrike) next.unlockDeepStrike = true;
    if ((effects as { unlockAetherBridge?: boolean }).unlockAetherBridge) next.unlockAetherBridge = true;
    if (effects.unlockMountainPass) next.unlockMountainPass = true;
    if (effects.unlockTerrainShaping) next.unlockTerrainShaping = true;
    if (effects.unlockBreachAttack) next.unlockBreachAttack = true;
    if (typeof effects.settlementSpeedMult === "number") next.settlementSpeedMult *= effects.settlementSpeedMult;
    if (typeof effects.operationalTempoMult === "number") next.operationalTempoMult *= effects.operationalTempoMult;
    if (typeof effects.researchTimeMult === "number") next.researchTimeMult *= effects.researchTimeMult;
    if (typeof effects.abilityCooldownMult === "number") next.abilityCooldownMult *= effects.abilityCooldownMult;
    if (typeof effects.sabotageCooldownMult === "number") next.sabotageCooldownMult *= effects.sabotageCooldownMult;
    if (typeof effects.populationGrowthMult === "number") next.populationGrowthMult *= effects.populationGrowthMult;
    if (typeof effects.firstThreeTownsPopulationGrowthMult === "number") {
      next.firstThreeTownsPopulationGrowthMult *= effects.firstThreeTownsPopulationGrowthMult;
    }
    if (typeof effects.firstThreeTownsGoldOutputMult === "number") {
      next.firstThreeTownsGoldOutputMult *= effects.firstThreeTownsGoldOutputMult;
    }
    if (typeof effects.populationCapFirst3TownsMult === "number") next.populationCapFirst3TownsMult *= effects.populationCapFirst3TownsMult;
    if (typeof effects.growthPauseDurationMult === "number") next.growthPauseDurationMult *= effects.growthPauseDurationMult;
    if (typeof effects.townFoodUpkeepMult === "number") next.townFoodUpkeepMult *= effects.townFoodUpkeepMult;
    if (typeof effects.settledFoodUpkeepMult === "number") next.settledFoodUpkeepMult *= effects.settledFoodUpkeepMult;
    if (typeof effects.settledGoldUpkeepMult === "number") next.settledGoldUpkeepMult *= effects.settledGoldUpkeepMult;
    if (typeof effects.townGoldOutputMult === "number") next.townGoldOutputMult *= effects.townGoldOutputMult;
    if (typeof effects.townGoldCapMult === "number") next.townGoldCapMult *= effects.townGoldCapMult;
    if (typeof effects.marketBonusMult === "number") {
      next.marketIncomeBonusAdd *= effects.marketBonusMult;
      next.marketCapBonusAdd *= effects.marketBonusMult;
    }
    if (typeof effects.granaryBonusMult === "number") next.granaryCapBonusAdd *= effects.granaryBonusMult;
    if (typeof effects.marketIncomeBonusAdd === "number") next.marketIncomeBonusAdd += effects.marketIncomeBonusAdd;
    if (typeof effects.marketCapBonusAdd === "number") next.marketCapBonusAdd += effects.marketCapBonusAdd;
    if (typeof effects.granaryCapBonusAdd === "number") next.granaryCapBonusAdd += effects.granaryCapBonusAdd;
    if (typeof effects.granaryCapBonusAddPctPoints === "number") next.granaryCapBonusAdd += effects.granaryCapBonusAddPctPoints;
    if (typeof effects.populationIncomeMult === "number") next.populationIncomeMult *= effects.populationIncomeMult;
    if (typeof effects.connectedTownStepBonusAdd === "number") next.connectedTownStepBonusAdd += effects.connectedTownStepBonusAdd;
    if (typeof effects.harvestCapMult === "number") next.harvestCapMult *= effects.harvestCapMult;
    if (typeof effects.fortDefenseMult === "number") next.fortDefenseMult *= effects.fortDefenseMult;
    if (typeof effects.fortIronUpkeepMult === "number") next.fortIronUpkeepMult *= effects.fortIronUpkeepMult;
    if (typeof effects.fortGoldUpkeepMult === "number") next.fortGoldUpkeepMult *= effects.fortGoldUpkeepMult;
    if (typeof effects.outpostAttackMult === "number") next.outpostAttackMult *= effects.outpostAttackMult;
    if (typeof effects.outpostSupplyUpkeepMult === "number") next.outpostSupplyUpkeepMult *= effects.outpostSupplyUpkeepMult;
    if (typeof effects.outpostGoldUpkeepMult === "number") next.outpostGoldUpkeepMult *= effects.outpostGoldUpkeepMult;
    if (typeof effects.revealUpkeepMult === "number") next.revealUpkeepMult *= effects.revealUpkeepMult;
    if (typeof effects.revealCapacityBonus === "number") next.revealCapacityBonus += effects.revealCapacityBonus;
    if (typeof effects.visionRadiusBonus === "number") next.visionRadiusBonus += effects.visionRadiusBonus;
    if (typeof effects.developmentProcessCapacityAdd === "number") next.developmentProcessCapacityAdd += effects.developmentProcessCapacityAdd;
    if (typeof effects.dockGoldOutputMult === "number") next.dockGoldOutputMult *= effects.dockGoldOutputMult;
    if (typeof effects.dockGoldCapMult === "number") next.dockGoldCapMult *= effects.dockGoldCapMult;
    if (typeof effects.dockConnectionBonusPerLink === "number") next.dockConnectionBonusPerLink = effects.dockConnectionBonusPerLink;
    if (effects.dockRoutesVisible) next.dockRoutesVisible = true;
    if (typeof effects.marketCrystalUpkeepMult === "number") next.marketCrystalUpkeepMult *= effects.marketCrystalUpkeepMult;
    if (typeof effects.frontierDefenseAdd === "number") next.frontierDefenseAdd += effects.frontierDefenseAdd;
    if (typeof effects.settledDefenseMult === "number") next.settledDefenseMult *= effects.settledDefenseMult;
    if (typeof effects.attackVsSettledMult === "number") next.attackVsSettledMult *= effects.attackVsSettledMult;
    if (typeof effects.attackVsFortsMult === "number") next.attackVsFortsMult *= effects.attackVsFortsMult;
    if (typeof effects.newSettlementDefenseMult === "number") next.newSettlementDefenseMult *= effects.newSettlementDefenseMult;
    if (effects.resourceOutputMult) {
      if (typeof effects.resourceOutputMult.farm === "number") next.resourceOutputMult.FARM *= effects.resourceOutputMult.farm;
      if (typeof effects.resourceOutputMult.fish === "number") next.resourceOutputMult.FISH *= effects.resourceOutputMult.fish;
      if (typeof effects.resourceOutputMult.iron === "number") next.resourceOutputMult.IRON *= effects.resourceOutputMult.iron;
      if (typeof effects.resourceOutputMult.supply === "number") next.resourceOutputMult.SUPPLY *= effects.resourceOutputMult.supply;
      if (typeof effects.resourceOutputMult.crystal === "number") next.resourceOutputMult.CRYSTAL *= effects.resourceOutputMult.crystal;
      if (typeof effects.resourceOutputMult.shard === "number") next.resourceOutputMult.SHARD *= effects.resourceOutputMult.shard;
    }
  }
  for (const id of player.domainIds) {
    const domain = domainById.get(id);
    const effects = domain?.effects;
    if (!effects) continue;
    if (effects.unlockRevealEmpire) next.unlockRevealEmpire = true;
    if (typeof effects.developmentProcessCapacityAdd === "number") next.developmentProcessCapacityAdd += effects.developmentProcessCapacityAdd;
    if (typeof effects.buildCapacityAdd === "number") next.buildCapacityAdd += effects.buildCapacityAdd;
    if (typeof effects.settlementSpeedMult === "number") next.settlementSpeedMult *= effects.settlementSpeedMult;
    if (typeof effects.researchTimeMult === "number") next.researchTimeMult *= effects.researchTimeMult;
    if (typeof effects.abilityCooldownMult === "number") next.abilityCooldownMult *= effects.abilityCooldownMult;
    if (typeof effects.sabotageCooldownMult === "number") next.sabotageCooldownMult *= effects.sabotageCooldownMult;
    if (typeof effects.populationGrowthMult === "number") next.populationGrowthMult *= effects.populationGrowthMult;
    if (typeof effects.firstThreeTownsPopulationGrowthMult === "number") {
      next.firstThreeTownsPopulationGrowthMult *= effects.firstThreeTownsPopulationGrowthMult;
    }
    if (typeof effects.firstThreeTownsGoldOutputMult === "number") {
      next.firstThreeTownsGoldOutputMult *= effects.firstThreeTownsGoldOutputMult;
    }
    if (typeof effects.populationCapFirst3TownsMult === "number") next.populationCapFirst3TownsMult *= effects.populationCapFirst3TownsMult;
    if (typeof effects.growthPauseDurationMult === "number") next.growthPauseDurationMult *= effects.growthPauseDurationMult;
    if (typeof effects.townFoodUpkeepMult === "number") next.townFoodUpkeepMult *= effects.townFoodUpkeepMult;
    if (typeof effects.settledFoodUpkeepMult === "number") next.settledFoodUpkeepMult *= effects.settledFoodUpkeepMult;
    if (typeof effects.settledGoldUpkeepMult === "number") next.settledGoldUpkeepMult *= effects.settledGoldUpkeepMult;
    if (typeof effects.townGoldOutputMult === "number") next.townGoldOutputMult *= effects.townGoldOutputMult;
    if (typeof effects.townGoldCapMult === "number") next.townGoldCapMult *= effects.townGoldCapMult;
    if (typeof effects.marketBonusMult === "number") {
      next.marketIncomeBonusAdd *= effects.marketBonusMult;
      next.marketCapBonusAdd *= effects.marketBonusMult;
    }
    if (typeof effects.granaryBonusMult === "number") next.granaryCapBonusAdd *= effects.granaryBonusMult;
    if (typeof effects.connectedTownStepBonusAdd === "number") next.connectedTownStepBonusAdd += effects.connectedTownStepBonusAdd;
    if (typeof effects.harvestCapMult === "number") next.harvestCapMult *= effects.harvestCapMult;
    if (typeof effects.fortBuildGoldCostMult === "number") next.fortBuildGoldCostMult *= effects.fortBuildGoldCostMult;
    if (typeof effects.fortDefenseMult === "number") next.fortDefenseMult *= effects.fortDefenseMult;
    if (typeof effects.fortIronUpkeepMult === "number") next.fortIronUpkeepMult *= effects.fortIronUpkeepMult;
    if (typeof effects.fortGoldUpkeepMult === "number") next.fortGoldUpkeepMult *= effects.fortGoldUpkeepMult;
    if (typeof effects.outpostAttackMult === "number") next.outpostAttackMult *= effects.outpostAttackMult;
    if (typeof effects.outpostSupplyUpkeepMult === "number") next.outpostSupplyUpkeepMult *= effects.outpostSupplyUpkeepMult;
    if (typeof effects.outpostGoldUpkeepMult === "number") next.outpostGoldUpkeepMult *= effects.outpostGoldUpkeepMult;
    if (typeof effects.revealUpkeepMult === "number") next.revealUpkeepMult *= effects.revealUpkeepMult;
    if (typeof effects.revealCapacityBonus === "number") next.revealCapacityBonus += effects.revealCapacityBonus;
    if (typeof effects.visionRadiusBonus === "number") next.visionRadiusBonus += effects.visionRadiusBonus;
    if (typeof effects.observatoryProtectionRadiusBonus === "number") next.observatoryProtectionRadiusBonus += effects.observatoryProtectionRadiusBonus;
    if (typeof effects.observatoryCastRadiusBonus === "number") next.observatoryCastRadiusBonus += effects.observatoryCastRadiusBonus;
    if (typeof effects.observatoryVisionBonus === "number") next.observatoryVisionBonus += effects.observatoryVisionBonus;
    if (typeof effects.frontierDefenseAdd === "number") next.frontierDefenseAdd += effects.frontierDefenseAdd;
    if (typeof effects.settledDefenseMult === "number") next.settledDefenseMult *= effects.settledDefenseMult;
    if (typeof effects.settledDefenseNearFortMult === "number") next.settledDefenseNearFortMult *= effects.settledDefenseNearFortMult;
    if (typeof effects.attackVsSettledMult === "number") next.attackVsSettledMult *= effects.attackVsSettledMult;
    if (typeof effects.attackVsFortsMult === "number") next.attackVsFortsMult *= effects.attackVsFortsMult;
    if (typeof effects.newSettlementDefenseMult === "number") next.newSettlementDefenseMult *= effects.newSettlementDefenseMult;
    if (effects.resourceOutputMult) {
      if (typeof effects.resourceOutputMult.farm === "number") next.resourceOutputMult.FARM *= effects.resourceOutputMult.farm;
      if (typeof effects.resourceOutputMult.fish === "number") next.resourceOutputMult.FISH *= effects.resourceOutputMult.fish;
      if (typeof effects.resourceOutputMult.iron === "number") next.resourceOutputMult.IRON *= effects.resourceOutputMult.iron;
      if (typeof effects.resourceOutputMult.supply === "number") next.resourceOutputMult.SUPPLY *= effects.resourceOutputMult.supply;
      if (typeof effects.resourceOutputMult.crystal === "number") next.resourceOutputMult.CRYSTAL *= effects.resourceOutputMult.crystal;
      if (typeof effects.resourceOutputMult.shard === "number") next.resourceOutputMult.SHARD *= effects.resourceOutputMult.shard;
    }
  }
  playerEffectsByPlayer.set(player.id, next);
};

const revealCapacityForPlayer = (player: Player): number => {
  const baseCapacity = playerHasTechIds(player, ABILITY_DEFS.reveal_empire.requiredTechIds) || getOrInitRevealTargets(player.id).size > 0 ? 1 : 0;
  return baseCapacity + getPlayerEffectsForPlayer(player.id).revealCapacityBonus;
};

const effectiveVisionRadiusForPlayer = (player: Player): number =>
  Math.max(1, Math.floor(VISION_RADIUS * player.mods.vision) + getPlayerEffectsForPlayer(player.id).visionRadiusBonus);

const getOrInitRevealTargets = (playerId: string): Set<string> => {
  let set = revealedEmpireTargetsByPlayer.get(playerId);
  if (!set) {
    set = new Set<string>();
    revealedEmpireTargetsByPlayer.set(playerId, set);
  }
  return set;
};

const markVisibilityDirty = (playerId: string): void => {
  cachedVisibilitySnapshotByPlayer.delete(playerId);
  chunkSnapshotGenerationByPlayer.delete(playerId);
};

const markSummaryChunkDirtyAtTile = (x: number, y: number): void => {
  simulationChunkState.markSummaryChunkDirtyAtTile(x, y);
  const wx = wrapX(x, WORLD_WIDTH);
  const wy = wrapY(y, WORLD_HEIGHT);
  void chunkReadManager.patchTile(wx, wy).catch((err) => {
    logRuntimeError("chunk read worker update failed", err);
  });
};

const markVisibilityDirtyForPlayers = (playerIds: Iterable<string>): void => {
  for (const playerId of playerIds) markVisibilityDirty(playerId);
};

const addRevealWatcher = (targetPlayerId: string, watcherPlayerId: string): void => {
  let watchers = revealWatchersByTarget.get(targetPlayerId);
  if (!watchers) {
    watchers = new Set<string>();
    revealWatchersByTarget.set(targetPlayerId, watchers);
  }
  watchers.add(watcherPlayerId);
};

const removeRevealWatcher = (targetPlayerId: string, watcherPlayerId: string): void => {
  const watchers = revealWatchersByTarget.get(targetPlayerId);
  if (!watchers) return;
  watchers.delete(watcherPlayerId);
  if (watchers.size === 0) revealWatchersByTarget.delete(targetPlayerId);
};

const setRevealTargetsForPlayer = (playerId: string, targetPlayerIds: Iterable<string>): Set<string> => {
  const nextTargets = new Set<string>(targetPlayerIds);
  const currentTargets = revealedEmpireTargetsByPlayer.get(playerId);
  if (currentTargets) {
    for (const targetPlayerId of currentTargets) removeRevealWatcher(targetPlayerId, playerId);
  }
  revealedEmpireTargetsByPlayer.set(playerId, nextTargets);
  for (const targetPlayerId of nextTargets) addRevealWatcher(targetPlayerId, playerId);
  markVisibilityDirty(playerId);
  return nextTargets;
};

const getAbilityCooldowns = (playerId: string): Map<AbilityDefinition["id"], number> => {
  let byAbility = abilityCooldownsByPlayer.get(playerId);
  if (!byAbility) {
    byAbility = new Map();
    abilityCooldownsByPlayer.set(playerId, byAbility);
  }
  return byAbility;
};

const abilityReadyAt = (playerId: string, abilityId: AbilityDefinition["id"]): number => getAbilityCooldowns(playerId).get(abilityId) ?? 0;

const abilityOnCooldown = (playerId: string, abilityId: AbilityDefinition["id"]): boolean => abilityReadyAt(playerId, abilityId) > now();

const startAbilityCooldown = (playerId: string, abilityId: AbilityDefinition["id"]): void => {
  const def = ABILITY_DEFS[abilityId];
  if (def.cooldownMs <= 0) return;
  const effects = getPlayerEffectsForPlayer(playerId);
  let cooldownMs = def.cooldownMs * effects.abilityCooldownMult;
  if (abilityId === "siphon") cooldownMs *= effects.sabotageCooldownMult;
  getAbilityCooldowns(playerId).set(abilityId, now() + Math.max(1, Math.round(cooldownMs)));
};

const playerHasTechIds = (player: Player, techIds: string[]): boolean => techIds.every((id) => player.techIds.has(id));

const chebyshevDistance = (ax: number, ay: number, bx: number, by: number): number => {
  const dx = Math.min(Math.abs(ax - bx), WORLD_WIDTH - Math.abs(ax - bx));
  const dy = Math.min(Math.abs(ay - by), WORLD_HEIGHT - Math.abs(ay - by));
  return Math.max(dx, dy);
};

const lineTilesBetween = (ax: number, ay: number, bx: number, by: number): Array<{ x: number; y: number }> => {
  const steps = chebyshevDistance(ax, ay, bx, by);
  if (steps <= 1) return [];
  const tiles: Array<{ x: number; y: number }> = [];
  for (let i = 1; i < steps; i += 1) {
    const ratio = i / steps;
    const x = wrapX(Math.round(ax + (bx - ax) * ratio), WORLD_WIDTH);
    const y = wrapY(Math.round(ay + (by - ay) * ratio), WORLD_HEIGHT);
    tiles.push({ x, y });
  }
  return tiles;
};

const validDeepStrikeTarget = (from: Tile, to: Tile): boolean => {
  if (from.ownerId === undefined) return false;
  const distance = chebyshevDistance(from.x, from.y, to.x, to.y);
  if (distance < 2 || distance > DEEP_STRIKE_MAX_DISTANCE) return false;
  for (const step of lineTilesBetween(from.x, from.y, to.x, to.y)) {
    if (terrainAtRuntime(step.x, step.y) === "MOUNTAIN") return false;
  }
  return true;
};

const validNavalInfiltrationTarget = (from: Tile, to: Tile): boolean => {
  const distance = chebyshevDistance(from.x, from.y, to.x, to.y);
  if (distance < 2 || distance > NAVAL_INFILTRATION_MAX_RANGE) return false;
  const middle = lineTilesBetween(from.x, from.y, to.x, to.y);
  if (middle.length === 0) return false;
  if (!middle.some((step) => terrainAtRuntime(step.x, step.y) === "SEA")) return false;
  if (middle.some((step) => terrainAtRuntime(step.x, step.y) === "MOUNTAIN")) return false;
  if (middle.some((step) => terrainAtRuntime(step.x, step.y) === "LAND")) return false;
  return to.terrain === "LAND";
};

const getOrInitDynamicMissions = (playerId: string): DynamicMissionDef[] => {
  let missions = dynamicMissionsByPlayer.get(playerId);
  if (!missions) {
    missions = [];
    dynamicMissionsByPlayer.set(playerId, missions);
  }
  return missions;
};

const getOrInitForcedReveal = (playerId: string): Set<TileKey> => {
  let set = forcedRevealTilesByPlayer.get(playerId);
  if (!set) {
    set = new Set<TileKey>();
    forcedRevealTilesByPlayer.set(playerId, set);
  }
  return set;
};

const activeAttackBuffMult = (playerId: string): number => {
  const until = temporaryAttackBuffUntilByPlayer.get(playerId) ?? 0;
  return until > now() ? VENDETTA_ATTACK_BUFF_MULT : 1;
};

const revealLinkedDocksForPlayer = (playerId: string, tileKey: TileKey): void => {
  const dock = docksByTile.get(tileKey);
  if (!dock) return;
  const forced = getOrInitForcedReveal(playerId);
  let changed = false;
  for (const linked of dockLinkedDestinations(dock)) {
    const [x, y] = parseKey(linked.tileKey);
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const revealTileKey = key(wrapX(x + dx, WORLD_WIDTH), wrapY(y + dy, WORLD_HEIGHT));
        if (forced.has(revealTileKey)) continue;
        forced.add(revealTileKey);
        changed = true;
      }
    }
  }
  if (changed) markVisibilityDirty(playerId);
};

const activeResourceIncomeMult = (playerId: string, resource: ResourceType): number => {
  const effects = getPlayerEffectsForPlayer(playerId);
  const permanent =
    resource === "FARM"
      ? effects.resourceOutputMult.FARM
      : resource === "FISH"
        ? effects.resourceOutputMult.FISH
        : resource === "IRON"
          ? effects.resourceOutputMult.IRON
          : resource === "GEMS"
            ? effects.resourceOutputMult.CRYSTAL
            : resource === "OIL"
              ? effects.resourceOutputMult.OIL
              : effects.resourceOutputMult.SUPPLY;
  const buff = temporaryIncomeBuffUntilByPlayer.get(playerId);
  if (!buff || buff.until <= now()) return permanent;
  return permanent * (buff.resources.includes(resource) ? RESOURCE_CHAIN_MULT : 1);
};

const fortRecoveryReadyAt = (fort: Pick<Fort, "disabledUntil">): number => fort.disabledUntil ?? 0;

const fortOperationalForOwner = (ownerId: string, tileKey: TileKey): boolean => {
  const fort = fortsByTile.get(tileKey);
  if (!fort || fort.ownerId !== ownerId || fort.status !== "active") return false;
  const [x, y] = parseKey(tileKey);
  if (terrainAtRuntime(x, y) !== "LAND" || ownership.get(tileKey) !== ownerId) return false;
  return fortRecoveryReadyAt(fort) <= now();
};

const fortDefenseMultAt = (defenderId: string, tileKey: TileKey): number => {
  if (fortOperationalForOwner(defenderId, tileKey)) {
    return FORT_DEFENSE_MULT * getPlayerEffectsForPlayer(defenderId).fortDefenseMult;
  }
  const structure = economicStructuresByTile.get(tileKey);
  if (structure?.status !== "active" || structure.ownerId !== defenderId || structure.type !== "WOODEN_FORT") return 1;
  return WOODEN_FORT_DEFENSE_MULT;
};

const settledDefenseNearFortApplies = (defenderId: string, target: Tile): boolean => {
  for (const [tileKey, fort] of fortsByTile) {
    if (fort.ownerId !== defenderId || fort.status !== "active") continue;
    if (fortRecoveryReadyAt(fort) > now()) continue;
    const [x, y] = parseKey(tileKey);
    if (terrainAtRuntime(x, y) !== "LAND" || ownership.get(tileKey) !== defenderId) continue;
    if (wrappedChebyshevDistance(x, y, target.x, target.y) <= SETTLED_DEFENSE_NEAR_FORT_RADIUS) return true;
  }
  for (const [tileKey, structure] of economicStructuresByTile) {
    if (structure.ownerId !== defenderId || structure.status !== "active" || structure.type !== "WOODEN_FORT") continue;
    const [x, y] = parseKey(tileKey);
    if (terrainAtRuntime(x, y) !== "LAND" || ownership.get(tileKey) !== defenderId) continue;
    if (wrappedChebyshevDistance(x, y, target.x, target.y) <= SETTLED_DEFENSE_NEAR_FORT_RADIUS) return true;
  }
  return false;
};

const settlementDefenseMultAt = (defenderId: string, tileKey: TileKey): number => {
  const entry = settlementDefenseByTile.get(tileKey);
  if (!entry || entry.ownerId !== defenderId || entry.expiresAt <= now()) return 1;
  return entry.mult;
};

const ownershipDefenseMultiplierForTarget = (defenderId: string | undefined, target: Tile): number => {
  if (supportedFrontierUsesSettledDefenseAt(defenderId, target)) return 1;
  return target.ownershipState === "FRONTIER" ? 0 : 1;
};

const frontierDefenseAddForTarget = (defenderId: string, target: Tile): number => {
  if (target.ownershipState !== "FRONTIER") return 0;
  if (supportedFrontierUsesSettledDefenseAt(defenderId, target)) return 0;
  return getPlayerEffectsForPlayer(defenderId).frontierDefenseAdd;
};

const outpostAttackMultAt = (attackerId: string, tileKey: TileKey): number => {
  const siegeOnOrigin = siegeOutpostsByTile.get(tileKey);
  if (siegeOnOrigin?.status === "active" && siegeOnOrigin.ownerId === attackerId) {
    return SIEGE_OUTPOST_ATTACK_MULT * getPlayerEffectsForPlayer(attackerId).outpostAttackMult;
  }
  const structure = economicStructuresByTile.get(tileKey);
  if (structure?.status !== "active" || structure.ownerId !== attackerId || structure.type !== "LIGHT_OUTPOST") return 1;
  return LIGHT_OUTPOST_ATTACK_MULT;
};

const attackMultiplierForTarget = (attackerId: string, target: Tile): number => {
  const effects = getPlayerEffectsForPlayer(attackerId);
  let mult = 1;
  if (target.ownershipState === "SETTLED") mult *= effects.attackVsSettledMult;
  const targetKey = key(target.x, target.y);
  if (
    (target.ownerId ? fortOperationalForOwner(target.ownerId, targetKey) : false) ||
    economicStructuresByTile.get(targetKey)?.status === "active" && economicStructuresByTile.get(targetKey)?.type === "WOODEN_FORT"
  ) {
    mult *= effects.attackVsFortsMult;
  }
  if (target.ownerId) mult *= truceBreakAttackMultiplier(attackerId, target.ownerId);
  return mult;
};

const settledDefenseMultiplierForTarget = (defenderId: string, target: Tile): number => {
  if (target.ownershipState !== "SETTLED" && !supportedFrontierUsesSettledDefenseAt(defenderId, target)) return 1;
  const effects = getPlayerEffectsForPlayer(defenderId);
  let mult = effects.settledDefenseMult;
  if (
    target.ownershipState === "SETTLED" &&
    effects.settledDefenseNearFortMult > 1 &&
    settledDefenseNearFortApplies(defenderId, target)
  ) {
    mult *= effects.settledDefenseNearFortMult;
  }
  return mult;
};

const originTileHeldByActiveFort = (actorId: string, tileKey: TileKey): boolean => {
  if (fortOperationalForOwner(actorId, tileKey)) return true;
  const structure = economicStructuresByTile.get(tileKey);
  return Boolean(structure?.ownerId === actorId && structure.status === "active" && structure.type === "WOODEN_FORT");
};

const applyFailedAttackTerritoryOutcome = (
  actorId: string,
  defenderOwnerId: string | undefined,
  defenderIsBarbarian: boolean,
  from: Tile,
  to: Tile,
  originTileKey: TileKey,
  targetTileKey: TileKey
): { resultChanges: CombatResultChange[]; originLost: boolean } => {
  const fortHeldOrigin = originTileHeldByActiveFort(actorId, originTileKey);
  if (defenderIsBarbarian) {
    const failedOutcome = resolveFailedBarbarianDefenseOutcome({
      fortHeldOrigin,
      origin: { x: from.x, y: from.y },
      target: { x: to.x, y: to.y }
    });
    if (failedOutcome.originLost) {
      updateOwnership(from.x, from.y, BARBARIAN_OWNER_ID, "BARBARIAN");
      updateOwnership(to.x, to.y, undefined);
    }
    return {
      originLost: failedOutcome.originLost,
      resultChanges: failedOutcome.resultChanges
    };
  }
  if (!defenderOwnerId || fortHeldOrigin) return { resultChanges: [], originLost: false };
  updateOwnership(from.x, from.y, defenderOwnerId, "FRONTIER");
  return {
    originLost: true,
    resultChanges: [{ x: from.x, y: from.y, ownerId: defenderOwnerId, ownershipState: "FRONTIER" }]
  };
};

const incrementVendettaCount = (attackerId: string, targetId: string): void => {
  let map = vendettaCaptureCountsByPlayer.get(attackerId);
  if (!map) {
    map = new Map<string, number>();
    vendettaCaptureCountsByPlayer.set(attackerId, map);
  }
  map.set(targetId, (map.get(targetId) ?? 0) + 1);
};

const isAlly = (a: string, b: string): boolean => {
  const p = players.get(a);
  return Boolean(p?.allies.has(b));
};

const applyStaminaRegen = (p: Player): void => {
  // Prototype mode: stamina is disabled as a gameplay limiter.
  p.stamina = STAMINA_MAX;
  p.staminaUpdatedAt = now();
};

const settleAttackManpower = (player: Player, committedManpower: number, attackerWon: boolean, atkEff: number, defEff: number): number => {
  if (committedManpower <= 0) return 0;
  if (attackerWon) {
    const loss = Math.max(10, committedManpower * 0.16);
    player.manpower = Math.max(0, player.manpower - loss);
    return loss;
  }
  const combatRatio = defEff / Math.max(1, atkEff);
  const loss = committedManpower * Math.min(1.25, 0.6 + combatRatio * 0.35);
  player.manpower = Math.max(0, player.manpower - loss);
  return loss;
};

const settledTileCountForPlayer = (player: Player): number => {
  let count = 0;
  for (const tk of player.territoryTiles) {
    if (ownershipStateByTile.get(tk) === "SETTLED") count += 1;
  }
  return count;
};

const seizeStoredYieldOnCapture = (
  attacker: Player,
  tileKey: TileKey
): { gold: number; strategic: Partial<Record<StrategicResource, number>> } => {
  const out = { gold: 0, strategic: {} as Partial<Record<StrategicResource, number>> };
  const y = tileYieldByTile.get(tileKey);
  if (!y) return out;
  const gold = Math.floor(y.gold * 100) / 100;
  if (gold > 0) {
    attacker.points += gold;
    out.gold = gold;
    y.gold = 0;
  }
  const stock = getOrInitStrategicStocks(attacker.id);
  for (const r of STRATEGIC_RESOURCE_KEYS) {
    const amt = Math.floor((y.strategic[r] ?? 0) * 100) / 100;
    if (amt <= 0) continue;
    stock[r] += amt;
    out.strategic[r] = amt;
    y.strategic[r] = 0;
  }
  pruneEmptyTileYield(tileKey, y);
  return out;
};

const pillageSettledTile = (
  attacker: Player,
  defender: Player,
  defenderTileCountBeforeCapture: number
): { gold: number; strategic: Partial<Record<StrategicResource, number>>; share: number } => {
  const share = 1 / Math.max(1, defenderTileCountBeforeCapture);
  const gold = Math.max(0, defender.points * share);
  defender.points = Math.max(0, defender.points - gold);
  attacker.points += gold;

  const stolenStrategic: Partial<Record<StrategicResource, number>> = {};
  const attackerStocks = getOrInitStrategicStocks(attacker.id);
  const defenderStocks = getOrInitStrategicStocks(defender.id);
  for (const resource of ["FOOD", "IRON", "CRYSTAL", "SUPPLY", "SHARD", "OIL"] as const) {
    const available = Math.max(0, defenderStocks[resource] ?? 0);
    const amount = available * share;
    if (amount <= 0) continue;
    defenderStocks[resource] = Math.max(0, available - amount);
    attackerStocks[resource] = (attackerStocks[resource] ?? 0) + amount;
    stolenStrategic[resource] = amount;
  }
  return { gold, strategic: stolenStrategic, share };
};

const visible = (p: Player, x: number, y: number): boolean => {
  return visibleInSnapshot(visibilitySnapshotForPlayer(p), wrapX(x, WORLD_WIDTH), wrapY(y, WORLD_HEIGHT));
};

const recalcPlayerDerived = (p: Player): void => {
  p.level = levelFromPoints(p.points);
};

const playerDefensiveness = (p: Player): number => {
  return defensivenessMultiplier(Math.max(1, p.Ts), Math.max(1, p.Es));
};

const sendToPlayer = (playerId: string, payload: unknown): void => {
  const ws = socketsByPlayer.get(playerId);
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload));
};

const onlineSocketCount = (): number => {
  let count = 0;
  for (const ws of socketsByPlayer.values()) {
    if (ws.readyState === ws.OPEN) count += 1;
  }
  return count;
};

const hasOnlinePlayers = (): boolean => onlineSocketCount() > 0 || [...players.values()].some((player) => player.isAi);
let victoryPressurePausedAt: number | undefined;

const pauseVictoryPressureTimers = (): void => {
  if (victoryPressurePausedAt === undefined) victoryPressurePausedAt = now();
};

const resumeVictoryPressureTimers = (): void => {
  if (victoryPressurePausedAt === undefined) return;
  const delta = now() - victoryPressurePausedAt;
  if (delta > 0) {
    for (const tracker of victoryPressureById.values()) {
      if (tracker.holdStartedAt) tracker.holdStartedAt += delta;
    }
  }
  victoryPressurePausedAt = undefined;
};

const isVisibleToAnyOnlinePlayer = (x: number, y: number): boolean => {
  for (const p of players.values()) {
    const ws = socketsByPlayer.get(p.id);
    if (!ws || ws.readyState !== ws.OPEN) continue;
    if (visible(p, x, y)) return true;
  }
  return false;
};

const logBarbarianEvent = (message: string): void => {
  app.log.info(`[barbarian] ${message}`);
};

const refreshSubscribedViewForPlayer = (playerId: string): void => {
  const ws = socketsByPlayer.get(playerId);
  const p = players.get(playerId);
  const sub = chunkSubscriptionByPlayer.get(playerId);
  if (!ws || ws.readyState !== ws.OPEN || !p || !sub) return;
  if (chunkSnapshotInFlightByPlayer.has(playerId)) return;
  sendChunkSnapshot(ws, p, sub);
};

const fogTileForPlayer = (x: number, y: number): Tile => {
  const tk = key(x, y);
  const dock = docksByTile.get(tk);
  const clusterId = clusterByTile.get(tk);
  const clusterType = clusterId ? clustersById.get(clusterId)?.clusterType : undefined;
  const fogTile: Tile = {
    x,
    y,
    terrain: terrainAtRuntime(x, y),
    fogged: true,
    lastChangedAt: now()
  };
  if (dock) fogTile.dockId = dock.dockId;
  if (clusterId) fogTile.clusterId = clusterId;
  if (clusterType) fogTile.clusterType = clusterType;
  return fogTile;
};

const visibleTileForPlayer = (p: Player, x: number, y: number, snapshot?: VisibilitySnapshot): Tile => {
  if ((snapshot ? visibleInSnapshot(snapshot, x, y) : visible(p, x, y))) {
    const tile = playerTile(x, y);
    tile.fogged = false;
    return tile;
  }
  return fogTileForPlayer(x, y);
};

const sendLocalVisionDeltaForPlayer = (playerId: string, centers: Array<{ x: number; y: number }>): void => {
  const ws = socketsByPlayer.get(playerId);
  const p = players.get(playerId);
  const sub = chunkSubscriptionByPlayer.get(playerId);
  if (!ws || ws.readyState !== ws.OPEN || !p || !sub || centers.length === 0) return;
  const radius = effectiveVisionRadiusForPlayer(p) + OBSERVATORY_VISION_BONUS;
  const snapshot = visibilitySnapshotForPlayer(p);
  const seen = new Set<TileKey>();
  const updates: Tile[] = [];
  for (const center of centers) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const x = wrapX(center.x + dx, WORLD_WIDTH);
        const y = wrapY(center.y + dy, WORLD_HEIGHT);
        if (!tileInSubscription(playerId, x, y)) continue;
        const tk = key(x, y);
        if (seen.has(tk)) continue;
        seen.add(tk);
        updates.push(visibleTileForPlayer(p, x, y, snapshot));
      }
    }
  }
  if (updates.length > 0) sendToPlayer(playerId, { type: "TILE_DELTA", updates });
};

const broadcastLocalVisionDelta = (centers: Array<{ x: number; y: number }>): void => {
  for (const playerId of socketsByPlayer.keys()) sendLocalVisionDeltaForPlayer(playerId, centers);
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

const sendPlayerUpdate = (p: Player, incomeDelta: number): void => {
  applyManpowerRegen(p);
  const ws = socketsByPlayer.get(p.id);
  if (!ws || ws.readyState !== ws.OPEN) return;
  refreshGlobalStatusCache(false);
  const economy = playerEconomySnapshot(p);
  const strategicStocks = getOrInitStrategicStocks(p.id);
  const techPayload = techPayloadSnapshotForPlayer(p, "player_update");
  const pendingSettlements = [...pendingSettlementsByTile.values()]
    .filter((settlement) => settlement.ownerId === p.id)
    .map((settlement) => {
      const [x, y] = parseKey(settlement.tileKey);
      return { x, y, startedAt: settlement.startedAt, resolvesAt: settlement.resolvesAt };
    });
  logTileSync("development_player_update", {
    playerId: p.id,
    incomeDelta,
    pendingSettlements,
    ...developmentProcessDebugBreakdownForPlayer(p.id)
  });
  ws.send(
    JSON.stringify({
      type: "PLAYER_UPDATE",
      gold: p.points,
      points: p.points,
      name: p.name,
      tileColor: p.tileColor,
      visualStyle: empireStyleFromPlayer(p),
      profileNeedsSetup: p.profileComplete !== true,
      level: p.level,
      mods: p.mods,
      modBreakdown: playerModBreakdown(p),
      incomePerMinute: economy.incomePerMinute,
      incomeDelta,
      strategicResources: strategicStocks,
      strategicProductionPerMinute: economy.strategicProductionPerMinute,
      economyBreakdown: economy.economyBreakdown,
      upkeepPerMinute: economy.upkeepPerMinute,
      upkeepLastTick: economy.upkeepLastTick,
      stamina: p.stamina,
      manpower: p.manpower,
      manpowerCap: playerManpowerCap(p),
      manpowerRegenPerMinute: playerManpowerRegenPerMinute(p),
      manpowerBreakdown: playerManpowerBreakdown(p),
      T: p.T,
      E: p.E,
      Ts: p.Ts,
      Es: p.Es,
      shieldUntil: p.spawnShieldUntil,
      defensiveness: playerDefensiveness(p),
      currentResearch: p.currentResearch,
      availableTechPicks: availableTechPicks(p),
      developmentProcessLimit: developmentProcessCapacityForPlayer(p.id),
      activeDevelopmentProcessCount: activeDevelopmentProcessCountForPlayer(p.id),
      techChoices: techPayload.techChoices,
      techCatalog: techPayload.techCatalog,
      domainIds: [...p.domainIds],
      domainChoices: reachableDomains(p),
      domainCatalog: activeDomainCatalog(p),
      revealCapacity: revealCapacityForPlayer(p),
      activeRevealTargets: [...getOrInitRevealTargets(p.id)],
      abilityCooldowns: Object.fromEntries(getAbilityCooldowns(p.id)),
      activeTruces: activeTruceViewsForPlayer(p.id),
      activeAetherBridges: [...activeAetherBridgesById.values()]
        .filter((bridge) => bridge.ownerId === p.id)
        .map((bridge) => {
          const [fromX, fromY] = parseKey(bridge.fromTileKey);
          const [toX, toY] = parseKey(bridge.toTileKey);
          return { bridgeId: bridge.bridgeId, ownerId: bridge.ownerId, from: { x: fromX, y: fromY }, to: { x: toX, y: toY }, startedAt: bridge.startedAt, endsAt: bridge.endsAt };
        }),
      activeAetherWalls: activeAetherWallViews(),
      pendingSettlements,
      incomingAllianceRequests: [...allianceRequests.values()].filter((r) => r.toPlayerId === p.id),
      outgoingAllianceRequests: [...allianceRequests.values()].filter((r) => r.fromPlayerId === p.id),
      missions: missionPayload(p),
      leaderboard: leaderboardSnapshotForPlayer(p.id),
      seasonVictory: seasonVictoryObjectivesForPlayer(p.id),
      seasonWinner
    })
  );
};

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

type BasicFrontierActionType = "EXPAND" | "ATTACK";

const hasPendingSettlementForPlayer = (playerId: string): boolean => {
  for (const pending of pendingSettlementsByTile.values()) {
    if (pending.ownerId === playerId) return true;
  }
  return false;
};

const pendingSettlementCountForPlayer = (playerId: string): number => {
  let count = 0;
  for (const pending of pendingSettlementsByTile.values()) {
    if (pending.ownerId === playerId) count += 1;
  }
  return count;
};

const tileHasPendingSettlement = (tileKey: TileKey): boolean => pendingSettlementsByTile.has(tileKey);

const tryQueueBasicFrontierAction = (
  actor: Player,
  actionType: BasicFrontierActionType,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number
):
  | {
      ok: true;
      resolvesAt: number;
      origin: { x: number; y: number };
      target: { x: number; y: number };
      predictedResult?: {
        attackType: BasicFrontierActionType;
        attackerWon: boolean;
        winnerId?: string;
        defenderOwnerId?: string;
        origin: { x: number; y: number };
        target: { x: number; y: number };
        changes: Array<{
          x: number;
          y: number;
          ownerId?: string;
          ownershipState?: "FRONTIER" | "SETTLED" | "BARBARIAN";
        }>;
        manpowerDelta?: number;
      };
      attackAlert?: {
        defenderId: string;
        attackerId: string;
        attackerName: string;
        x: number;
        y: number;
        fromX: number;
        fromY: number;
        resolvesAt: number;
      };
    }
  | { ok: false; code: string; message: string; cooldownRemainingMs?: number } => {
  applyStaminaRegen(actor);
  actor.lastActiveAt = now();

  let from = playerTile(fromX, fromY);
  const to = playerTile(toX, toY);
  if (actionType === "EXPAND" && to.ownerId) return { ok: false, code: "EXPAND_TARGET_OWNED", message: "expand only targets neutral land" };
  if (actionType === "ATTACK" && (!to.ownerId || to.ownerId === actor.id)) {
    return { ok: false, code: "ATTACK_TARGET_INVALID", message: "target must be enemy-controlled land" };
  }

  let fk = key(from.x, from.y);
  const tk = key(to.x, to.y);
  let fromDock = docksByTile.get(fk);
  let adjacent = isAdjacentTile(from.x, from.y, to.x, to.y);
  const allowAdjacentToDock = actionType !== "EXPAND";
  let dockCrossing = Boolean(fromDock && validDockCrossingTarget(fromDock, to.x, to.y, allowAdjacentToDock));
  if (!adjacent && !dockCrossing && actionType === "ATTACK") {
    const altFrom = findOwnedDockOriginForCrossing(actor, to.x, to.y, allowAdjacentToDock);
    if (altFrom) {
      from = altFrom;
      fk = key(from.x, from.y);
      fromDock = docksByTile.get(fk);
      adjacent = isAdjacentTile(from.x, from.y, to.x, to.y);
      dockCrossing = Boolean(fromDock && validDockCrossingTarget(fromDock, to.x, to.y, allowAdjacentToDock));
    }
  }
  if (!adjacent && !dockCrossing) return { ok: false, code: "NOT_ADJACENT", message: "target must be adjacent or valid dock crossing" };
  if (adjacent && !dockCrossing && crossingBlockedByAetherWall(from.x, from.y, to.x, to.y)) {
    return { ok: false, code: "AETHER_WALL_BLOCKED", message: "crossing blocked by aether wall" };
  }
  if (dockCrossing && fromDock && fromDock.cooldownUntil > now()) return { ok: false, code: "DOCK_COOLDOWN", message: "dock crossing endpoint on cooldown" };
  if (from.ownerId !== actor.id) return { ok: false, code: "NOT_OWNER", message: "origin not owned" };
  if (to.terrain !== "LAND") return { ok: false, code: "BARRIER", message: "target is barrier" };
  if (combatLocks.has(fk)) {
    const remainingMs = Math.max(0, (combatLocks.get(fk)?.resolvesAt ?? now()) - now());
    return { ok: false, code: "ATTACK_COOLDOWN", message: "origin tile is still on attack cooldown", cooldownRemainingMs: remainingMs };
  }
  if (combatLocks.has(tk)) return { ok: false, code: "LOCKED", message: "tile locked in combat" };
  if (actor.points < FRONTIER_ACTION_GOLD_COST) {
    return {
      ok: false,
      code: "INSUFFICIENT_GOLD",
      message: actionType === "ATTACK" ? "insufficient gold for attack" : "insufficient gold for frontier claim"
    };
  }
  applyManpowerRegen(actor);
  const manpowerMin = manpowerMinForAction(actionType);
  const manpowerCost = manpowerCostForAction(actionType);
  if (!hasEnoughManpower(actor, manpowerMin)) {
    return { ok: false, code: "INSUFFICIENT_MANPOWER", message: `need ${manpowerMin.toFixed(0)} manpower to launch attack` };
  }

  const defenderIsBarbarian = to.ownerId === BARBARIAN_OWNER_ID;
  const defender = to.ownerId && !defenderIsBarbarian ? players.get(to.ownerId) : undefined;
  if (defender && actor.allies.has(defender.id)) return { ok: false, code: "ALLY_TARGET", message: "cannot attack allied tile" };
  if (defender && defender.spawnShieldUntil > now()) return { ok: false, code: "SHIELDED", message: "target shielded" };
  if (!actor.isAi && defender?.isAi) markAiDefensePriority(defender.id);

  let precomputedCombat: PendingCapture["precomputedCombat"] | undefined;
  if (defender || defenderIsBarbarian) {
    const siegeAtkMult = outpostAttackMultAt(actor.id, fk);
    const atkEff =
      10 * actor.mods.attack * activeAttackBuffMult(actor.id) * attackMultiplierForTarget(actor.id, to) * siegeAtkMult * randomFactor();
    const shock = breachShockByTile.get(tk);
    const shockMult = defender && shock && shock.ownerId === defender.id && shock.expiresAt > now() ? BREACH_SHOCK_DEF_MULT : 1;
    const defMult = defender ? playerDefensiveness(defender) * shockMult : 1;
    const fortMult = defender ? fortDefenseMultAt(defender.id, tk) : 1;
    const dockMult = docksByTile.has(tk) ? DOCK_DEFENSE_MULT : 1;
    const settledDefenseMult = defender ? settledDefenseMultiplierForTarget(defender.id, to) : 1;
    const newSettlementDefenseMult = defender ? settlementDefenseMultAt(defender.id, tk) : 1;
    const ownershipDefenseMult = ownershipDefenseMultiplierForTarget(defender?.id, to);
    const frontierDefenseAdd = defender ? frontierDefenseAddForTarget(defender.id, to) : 0;
    const defEff = defenderIsBarbarian
      ? 10 * BARBARIAN_DEFENSE_POWER * dockMult * randomFactor()
      : (10 * (defender?.mods.defense ?? 1) * defMult * fortMult * dockMult * settledDefenseMult * newSettlementDefenseMult * ownershipDefenseMult +
          frontierDefenseAdd) *
        randomFactor();
    const winChance = combatWinChance(atkEff, defEff);
    const win = Math.random() < winChance;
    const previewChanges = (() => {
      if (win) return [{ x: to.x, y: to.y, ownerId: actor.id, ownershipState: "FRONTIER" as const }];
      const fortHeldOrigin = originTileHeldByActiveFort(actor.id, fk);
      if (defenderIsBarbarian) {
        return resolveFailedBarbarianDefenseOutcome({
          fortHeldOrigin,
          origin: { x: from.x, y: from.y },
          target: { x: to.x, y: to.y }
        }).resultChanges;
      }
      if (defender) return fortHeldOrigin ? [] : [{ x: from.x, y: from.y, ownerId: defender.id, ownershipState: "FRONTIER" as const }];
      return [];
    })();
    const previewWinnerId = win ? actor.id : defenderIsBarbarian ? BARBARIAN_OWNER_ID : defender?.id;
    const previewManpowerDelta = -(
      win
        ? Math.max(10, manpowerCost * 0.16)
        : manpowerCost * Math.min(1.25, 0.6 + (defEff / Math.max(1, atkEff)) * 0.35)
    );
    precomputedCombat = {
      atkEff,
      defEff,
      winChance,
      win,
      previewChanges,
      previewManpowerDelta,
      ...(defenderIsBarbarian ? { defenderOwnerId: BARBARIAN_OWNER_ID } : defender?.id ? { defenderOwnerId: defender.id } : {}),
      ...(previewWinnerId ? { previewWinnerId } : {})
    };
  }

  const resolvesAt = now() + (actionType === "EXPAND" && !to.ownerId ? frontierClaimDurationMsAt(to.x, to.y) : COMBAT_LOCK_MS);
  const pending: PendingCapture = {
    resolvesAt,
    origin: fk,
    target: tk,
    attackerId: actor.id,
    staminaCost: 0,
    manpowerCost,
    cancelled: false
  };
  if (precomputedCombat) pending.precomputedCombat = precomputedCombat;
  combatLocks.set(fk, pending);
  combatLocks.set(tk, pending);

  pending.timeout = setTimeout(async () => {
    if (pending.cancelled) return;
    combatLocks.delete(fk);
    combatLocks.delete(tk);
    if (dockCrossing && fromDock) fromDock.cooldownUntil = now() + DOCK_CROSSING_COOLDOWN_MS;

    if (!defender && !defenderIsBarbarian) {
      actor.points -= FRONTIER_ACTION_GOLD_COST;
      recalcPlayerDerived(actor);
      actor.stamina -= pending.staminaCost;
      updateOwnership(to.x, to.y, actor.id, "FRONTIER");
      claimFirstSpecialSiteCaptureBonus(actor, to.x, to.y);
      telemetryCounters.frontierClaims += 1;
      actor.missionStats.neutralCaptures += 1;
      maybeIssueResourceMission(actor, to.resource);
      updateMissionState(actor);
      sendPlayerUpdate(actor, 0);
      sendLocalVisionDeltaForPlayer(actor.id, [{ x: to.x, y: to.y }]);
      return;
    }

    actor.points -= FRONTIER_ACTION_GOLD_COST;
    actor.stamina -= pending.staminaCost;

    const atkEff = pending.precomputedCombat?.atkEff ?? 10;
    const defEff = pending.precomputedCombat?.defEff ?? 10;
    const winChance = pending.precomputedCombat?.winChance ?? 0.5;
    const win = pending.precomputedCombat?.win ?? false;
    const manpowerDelta = -settleAttackManpower(actor, pending.manpowerCost, win, atkEff, defEff);
    applyTownWarShock(tk);

    let resultChanges: Array<{
      x: number;
      y: number;
      ownerId?: string;
      ownershipState?: "FRONTIER" | "SETTLED" | "BARBARIAN";
    }> = [];

    if (win) {
      updateOwnership(to.x, to.y, actor.id, "FRONTIER");
      resultChanges = [{ x: to.x, y: to.y, ownerId: actor.id, ownershipState: "FRONTIER" }];
      if (defenderIsBarbarian) {
        actor.points += BARBARIAN_CLEAR_GOLD_REWARD;
        logBarbarianEvent(`cleared by ${actor.id} @ ${to.x},${to.y}`);
      } else {
        actor.missionStats.enemyCaptures += 1;
      }
      actor.missionStats.combatWins += 1;
      if (defender) {
        incrementVendettaCount(actor.id, defender.id);
        maybeIssueVendettaMission(actor, defender.id);
        const attackerRating = ratingFromPointsLevel(actor.points, actor.level);
        const defenderRating = ratingFromPointsLevel(defender.points, defender.level);
        const pairKey = pairKeyFor(actor.id, defender.id);
        const nowMs = now();
        const entries = pruneRepeatFightEntries(pairKey, nowMs);
        entries.push(nowMs);
        repeatFights.set(pairKey, entries);
        const repeatMult = Math.max(PVP_REPEAT_FLOOR, 0.5 ** (entries.length - 1));
        actor.points += pvpPointsReward(baseTileValue(to.resource), attackerRating, defenderRating) * repeatMult * PVP_REWARD_MULT;
      }
      maybeIssueResourceMission(actor, to.resource);
    } else if (defenderIsBarbarian) {
      const barbarianAgentId = barbarianAgentByTileKey.get(tk);
      const barbarianAgent = barbarianAgentId ? barbarianAgents.get(barbarianAgentId) : undefined;
      const failedOutcome = applyFailedAttackTerritoryOutcome(actor.id, undefined, true, from, to, fk, tk);
      resultChanges = failedOutcome.resultChanges;
      if (barbarianAgent) {
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
      }
    } else if (defender) {
      const failedOutcome = applyFailedAttackTerritoryOutcome(actor.id, defender.id, false, from, to, fk, tk);
      resultChanges = failedOutcome.resultChanges;
      defender.missionStats.enemyCaptures += 1;
      defender.missionStats.combatWins += 1;
      incrementVendettaCount(defender.id, actor.id);
      maybeIssueVendettaMission(defender, actor.id);
      maybeIssueResourceMission(defender, from.resource);
      const attackerRating = ratingFromPointsLevel(defender.points, defender.level);
      const defenderRating = ratingFromPointsLevel(actor.points, actor.level);
      defender.points += pvpPointsReward(baseTileValue(from.resource), attackerRating, defenderRating) * PVP_REWARD_MULT;
    }

    recalcPlayerDerived(actor);
    if (defender) recalcPlayerDerived(defender);
    updateMissionState(actor);
    if (defender) updateMissionState(defender);
    resolveEliminationIfNeeded(actor, socketsByPlayer.has(actor.id) || actor.isAi === true);
    if (defender) resolveEliminationIfNeeded(defender, socketsByPlayer.has(defender.id) || defender.isAi === true);
    sendToPlayer(actor.id, {
      type: "COMBAT_RESULT",
      attackType: actionType,
      attackerWon: win,
      winnerId: win ? actor.id : defenderIsBarbarian ? BARBARIAN_OWNER_ID : defender?.id,
      defenderOwnerId: defenderIsBarbarian ? BARBARIAN_OWNER_ID : defender?.id,
      origin: { x: from.x, y: from.y },
      target: { x: to.x, y: to.y },
      atkEff,
      defEff,
      winChance,
      changes: resultChanges,
      manpowerDelta
    });
    sendPlayerUpdate(actor, 0);
    if (defender) sendPlayerUpdate(defender, 0);
    const changedCenters = [{ x: from.x, y: from.y }, { x: to.x, y: to.y }];
    sendLocalVisionDeltaForPlayer(actor.id, changedCenters);
    if (defender && !defenderIsBarbarian) sendLocalVisionDeltaForPlayer(defender.id, changedCenters);
  }, resolvesAt - now());

  const result = {
    ok: true as const,
    resolvesAt,
    origin: { x: from.x, y: from.y },
    target: { x: to.x, y: to.y }
  };
  const predictedResult = precomputedCombat
    ? {
        attackType: actionType,
        attackerWon: precomputedCombat.win,
        origin: { x: from.x, y: from.y },
        target: { x: to.x, y: to.y },
        changes: precomputedCombat.previewChanges,
        ...(precomputedCombat.previewWinnerId ? { winnerId: precomputedCombat.previewWinnerId } : {}),
        ...(precomputedCombat.defenderOwnerId ? { defenderOwnerId: precomputedCombat.defenderOwnerId } : {}),
        ...(typeof precomputedCombat.previewManpowerDelta === "number" ? { manpowerDelta: precomputedCombat.previewManpowerDelta } : {})
      }
    : undefined;
  if (defender && !defenderIsBarbarian && actionType === "ATTACK") {
    return {
      ...result,
      ...(predictedResult ? { predictedResult } : {}),
      attackAlert: {
        defenderId: defender.id,
        attackerId: actor.id,
        attackerName: actor.name,
        x: to.x,
        y: to.y,
        fromX: from.x,
        fromY: from.y,
        resolvesAt
      }
    };
  }
  return {
    ...result,
    ...(predictedResult ? { predictedResult } : {})
  };
};

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
      sendToPlayer(actor.id, { type: "TILE_DELTA", updates });
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
    broadcast({ type: "PLAYER_STYLE", playerId: actor.id, ...playerStylePayload(actor) });
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
    broadcast({ type: "PLAYER_STYLE", playerId: actor.id, ...playerStylePayload(actor) });
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
      socket.send(
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
      socket.send(
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

type AiFrontierCandidatePair = {
  from: Tile;
  to: Tile;
};

type AiScoutAdjacencyMetrics = {
  ownedNeighbors: number;
  alliedSettledNeighbors: number;
  frontierNeighbors: number;
  coastlineDiscoveryValue: number;
  exposedSides: number;
};

type AiTerritorySummary = {
  visibility: ReturnType<typeof visibilitySnapshotForPlayer>;
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

type AiTerritoryStructureCache = {
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

type AiPlanningStaticCache = {
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
  frontierOpportunityEconomic: number;
  frontierOpportunityScout: number;
  frontierOpportunityScaffold: number;
  frontierOpportunityWaste: number;
};

type AiSettlementSelectorCache = {
  version: number;
  pendingSettlementCount: number;
  settlementByVictoryPath: Map<string, TileKey | null>;
  townSupportSettlementByVictoryPath: Map<string, TileKey | null>;
  islandSettlementByVictoryPath: Map<string, TileKey | null>;
  frontierSummaryByKey: Map<string, AiFrontierSettlementSummary>;
};

type AiFrontierSettlementSummary = {
  bestSettlementKey: TileKey | null;
  settlementAvailable: boolean;
  bestTownSupportSettlementKey: TileKey | null;
  townSupportSettlementAvailable: boolean;
  bestIslandSettlementKey: TileKey | null;
  islandSettlementAvailable: boolean;
};

type AiSettlementAvailabilityProfile = {
  settlementAvailable: boolean;
  townSupportSettlementAvailable: boolean;
  islandSettlementAvailable: boolean;
};

type AiFrontierAvailabilityProfile = {
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

type AiFrontierPlanningSummary = {
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

const preferAiFrontierCandidate = (
  current: AiFrontierCandidatePair | undefined,
  next: AiFrontierCandidatePair
): AiFrontierCandidatePair => {
  if (!current) return next;
  const currentSettled = current.from.ownershipState === "SETTLED";
  const nextSettled = next.from.ownershipState === "SETTLED";
  if (currentSettled !== nextSettled) return nextSettled ? next : current;
  if (next.from.y !== current.from.y) return next.from.y < current.from.y ? next : current;
  if (next.from.x !== current.from.x) return next.from.x < current.from.x ? next : current;
  return current;
};

const buildAiTerritoryStructureCache = (actor: Player): AiTerritoryStructureCache => {
  const settledTiles: Tile[] = [];
  const frontierTiles: Tile[] = [];
  const expandCandidateByTarget = new Map<TileKey, AiFrontierCandidatePair>();
  const attackCandidateByTarget = new Map<TileKey, AiFrontierCandidatePair>();
  const borderSettledTileKeys = new Set<TileKey>();
  let underThreat = false;
  let neutralTownExpandCount = 0;
  let neutralEconomicExpandCount = 0;
  let neutralLandExpandCount = 0;
  let hostileTownAttackCount = 0;
  let hostileEconomicAttackCount = 0;
  let barbarianAttackAvailable = false;
  let enemyAttackAvailable = false;

  for (const tileKey of actor.territoryTiles) {
    const [x, y] = parseKey(tileKey);
    const from = aiTileLiteAt(x, y);
    const ownershipState = ownershipStateByTile.get(tileKey);
    if (ownershipState === "SETTLED") settledTiles.push(from);
    else if (ownershipState === "FRONTIER") frontierTiles.push(from);
    if (!underThreat && (ownershipState === "SETTLED" || ownershipState === "FRONTIER")) {
      underThreat = adjacentNeighborCores(x, y).some((neighbor) => {
        if (neighbor.terrain !== "LAND") return false;
        if (!neighbor.ownerId || neighbor.ownerId === actor.id || actor.allies.has(neighbor.ownerId)) return false;
        return true;
      });
    }
    for (const to of aiFrontierActionCandidates(actor, from, "EXPAND")) {
      const targetKey = key(to.x, to.y);
      const pair = { from, to };
      const firstSeenTarget = !expandCandidateByTarget.has(targetKey);
      expandCandidateByTarget.set(targetKey, preferAiFrontierCandidate(expandCandidateByTarget.get(targetKey), pair));
      if (firstSeenTarget && to.terrain === "LAND" && !to.ownerId) {
        neutralLandExpandCount += 1;
        if (townsByTile.has(targetKey)) neutralTownExpandCount += 1;
        if (townsByTile.has(targetKey) || docksByTile.has(targetKey) || Boolean(to.resource)) neutralEconomicExpandCount += 1;
      }
      if (from.ownerId === actor.id && from.ownershipState === "SETTLED") borderSettledTileKeys.add(tileKey);
    }
    for (const to of aiFrontierActionCandidates(actor, from, "ATTACK")) {
      const targetKey = key(to.x, to.y);
      const pair = { from, to };
      const firstSeenTarget = !attackCandidateByTarget.has(targetKey);
      attackCandidateByTarget.set(targetKey, preferAiFrontierCandidate(attackCandidateByTarget.get(targetKey), pair));
      if (firstSeenTarget && to.terrain === "LAND" && to.ownerId && to.ownerId !== actor.id && !actor.allies.has(to.ownerId)) {
        if (to.ownerId === BARBARIAN_OWNER_ID) {
          barbarianAttackAvailable = true;
        } else {
          enemyAttackAvailable = true;
          if (townsByTile.has(targetKey)) hostileTownAttackCount += 1;
          else if (Boolean(to.resource) || docksByTile.has(targetKey)) hostileEconomicAttackCount += 1;
        }
      }
      if (from.ownerId === actor.id && from.ownershipState === "SETTLED") borderSettledTileKeys.add(tileKey);
    }
  }

  const expandCandidates = [...expandCandidateByTarget.values()];
  const attackCandidates = [...attackCandidateByTarget.values()];

  const structureCandidateTiles = settledTiles.filter((tile) => {
    const tileKey = key(tile.x, tile.y);
    return borderSettledTileKeys.has(tileKey) || docksByTile.has(tileKey) || townsByTile.has(tileKey) || Boolean(tile.resource);
  });

  return {
    version: aiTerritoryVersionForPlayer(actor.id),
    settledTileCount: settledTiles.length,
    frontierTileCount: frontierTiles.length,
    settledTiles,
    frontierTiles,
    expandCandidates,
    attackCandidates,
    borderSettledTileKeys,
    structureCandidateTiles,
    underThreat,
    worldFlags: playerWorldFlags(actor),
    controlledTowns: countControlledTowns(actor.id),
    neutralTownExpandCount,
    neutralEconomicExpandCount,
    neutralLandExpandCount,
    hostileTownAttackCount,
    hostileEconomicAttackCount,
    barbarianAttackAvailable,
    enemyAttackAvailable,
    scoutRevealCountByTileKey: new Map<TileKey, number>(),
    scoutRevealValueByProfileKey: new Map<string, number>(),
    scoutAdjacencyByTileKey: new Map<TileKey, AiScoutAdjacencyMetrics>()
  };
};

const cachedAiTerritoryStructureForPlayer = (actor: Player): AiTerritoryStructureCache => {
  const version = aiTerritoryVersionForPlayer(actor.id);
  const cached = cachedAiTerritoryStructureByPlayer.get(actor.id);
  if (cached && cached.version === version) return cached;
  const rebuilt = buildAiTerritoryStructureCache(actor);
  cachedAiTerritoryStructureByPlayer.set(actor.id, rebuilt);
  return rebuilt;
};

const collectAiTerritorySummary = (actor: Player): AiTerritorySummary => {
  const cached = cachedAiTerritoryStructureForPlayer(actor);
  return {
    visibility: visibilitySnapshotForPlayer(actor),
    settledTileCount: cached.settledTileCount,
    frontierTileCount: cached.frontierTileCount,
    settledTiles: cached.settledTiles,
    frontierTiles: cached.frontierTiles,
    expandCandidates: cached.expandCandidates,
    attackCandidates: cached.attackCandidates,
    borderSettledTileKeys: cached.borderSettledTileKeys,
    structureCandidateTiles: cached.structureCandidateTiles,
    underThreat: cached.underThreat,
    worldFlags: cached.worldFlags,
    controlledTowns: cached.controlledTowns,
    neutralTownExpandCount: cached.neutralTownExpandCount,
    neutralEconomicExpandCount: cached.neutralEconomicExpandCount,
    neutralLandExpandCount: cached.neutralLandExpandCount,
    hostileTownAttackCount: cached.hostileTownAttackCount,
    hostileEconomicAttackCount: cached.hostileEconomicAttackCount,
    barbarianAttackAvailable: cached.barbarianAttackAvailable,
    enemyAttackAvailable: cached.enemyAttackAvailable,
    foodPressure: aiFoodPressureSignal(actor),
    settlementEvaluationByKey: new Map<string, AiSettlementCandidateEvaluation>(),
    scoutRevealCountByTileKey: cached.scoutRevealCountByTileKey,
    scoutRevealValueByProfileKey: cached.scoutRevealValueByProfileKey,
    scoutAdjacencyByTileKey: cached.scoutAdjacencyByTileKey,
    supportedTownKeysByTileKey: new Map<TileKey, TileKey[]>(),
    dockSignalByTileKey: new Map<TileKey, number>(),
    economicSignalByTileKey: new Map<TileKey, number>(),
    pressureSignalByTileKey: new Map<TileKey, number>(),
    islandFootprintSignalByTileKey: new Map<TileKey, number>(),
    islandFocusTargetId: undefined,
    scoutRevealMarks: new Uint32Array(WORLD_WIDTH * WORLD_HEIGHT),
    scoutRevealStamp: 1
  };
};

const countAiScoutRevealTiles = (
  to: Tile,
  visibility: ReturnType<typeof visibilitySnapshotForPlayer>,
  territorySummary: AiTerritorySummary
): number => {
  const tk = key(to.x, to.y);
  const cached = territorySummary.scoutRevealCountByTileKey.get(tk);
  if (cached !== undefined) return cached;

  territorySummary.scoutRevealStamp += 1;
  if (territorySummary.scoutRevealStamp === 0) {
    territorySummary.scoutRevealMarks.fill(0);
    territorySummary.scoutRevealStamp = 1;
  }
  const stamp = territorySummary.scoutRevealStamp;
  let count = 0;
  for (const next of adjacentNeighborCores(to.x, to.y)) {
    if (next.terrain !== "LAND") continue;
    const firstIndex = tileIndex(next.x, next.y);
    if (!visibleInSnapshot(visibility, next.x, next.y) && territorySummary.scoutRevealMarks[firstIndex] !== stamp) {
      territorySummary.scoutRevealMarks[firstIndex] = stamp;
      count += 1;
    }
    for (const secondRing of adjacentNeighborCores(next.x, next.y)) {
      if (secondRing.terrain !== "LAND") continue;
      const secondIndex = tileIndex(secondRing.x, secondRing.y);
      if (!visibleInSnapshot(visibility, secondRing.x, secondRing.y) && territorySummary.scoutRevealMarks[secondIndex] !== stamp) {
        territorySummary.scoutRevealMarks[secondIndex] = stamp;
        count += 1;
      }
    }
  }
  territorySummary.scoutRevealCountByTileKey.set(tk, count);
  return count;
};

const cachedScoutAdjacencyMetrics = (
  actor: Player,
  to: Tile,
  territorySummary: AiTerritorySummary
): AiScoutAdjacencyMetrics => {
  const tk = key(to.x, to.y);
  const cached = territorySummary.scoutAdjacencyByTileKey.get(tk);
  if (cached) return cached;

  let ownedNeighbors = 0;
  let alliedSettledNeighbors = 0;
  let frontierNeighbors = 0;
  let coastlineDiscoveryValue = 0;
  let exposedSides = 0;

  for (const next of adjacentNeighborCores(to.x, to.y)) {
    if (next.ownerId === actor.id) {
      ownedNeighbors += 1;
      if (next.ownershipState === "SETTLED") alliedSettledNeighbors += 1;
      if (next.ownershipState === "FRONTIER") frontierNeighbors += 1;
    }
    if (next.terrain === "SEA") coastlineDiscoveryValue += 18;
    if (next.terrain !== "LAND" || next.ownerId !== actor.id) exposedSides += 1;
  }

  const metrics = {
    ownedNeighbors,
    alliedSettledNeighbors,
    frontierNeighbors,
    coastlineDiscoveryValue,
    exposedSides
  };
  territorySummary.scoutAdjacencyByTileKey.set(tk, metrics);
  return metrics;
};

const scoreAiScoutRevealValue = (
  actor: Player,
  to: Tile,
  visibility: ReturnType<typeof visibilitySnapshotForPlayer>,
  territorySummary: AiTerritorySummary
): number => {
  const tk = key(to.x, to.y);
  const { economyWeak } = aiEconomyPriorityState(actor, territorySummary);
  const profileKey = `${territorySummary.foodPressure > 0 ? 1 : 0}:${economyWeak ? 1 : 0}:${tk}`;
  const cached = territorySummary.scoutRevealValueByProfileKey.get(profileKey);
  if (cached !== undefined) return cached;

  territorySummary.scoutRevealStamp += 1;
  if (territorySummary.scoutRevealStamp === 0) {
    territorySummary.scoutRevealMarks.fill(0);
    territorySummary.scoutRevealStamp = 1;
  }
  const stamp = territorySummary.scoutRevealStamp;
  const foodPressure = territorySummary.foodPressure;
  let score = 0;

  const considerReveal = (x: number, y: number): void => {
    const revealIndex = tileIndex(x, y);
    if (territorySummary.scoutRevealMarks[revealIndex] === stamp) return;
    territorySummary.scoutRevealMarks[revealIndex] = stamp;
    if (visibleInSnapshot(visibility, x, y)) return;
    if (terrainAt(x, y) !== "LAND") return;

    const revealKey = key(x, y);
    score += 4;
    if (townsByTile.has(revealKey)) {
      score += 90;
      return;
    }
    if (docksByTile.has(revealKey)) {
      score += 85;
      return;
    }
    const clusterId = clusterByTile.get(revealKey);
    const cluster = clusterId ? clustersById.get(clusterId) : undefined;
    if (cluster) {
      const resource = clusterResourceType(cluster);
      score += 50 + Math.round(baseTileValue(resource) * 0.7);
      if (foodPressure > 0 && (resource === "FARM" || resource === "FISH")) score += 60;
      return;
    }

    const biome = landBiomeAt(x, y);
    const shade = grassShadeAt(x, y);
    if (biome === "COASTAL_SAND") {
      score += foodPressure > 0 ? 26 : 14;
      score += 12;
    } else if (biome === "GRASS") {
      score += shade === "LIGHT" ? (foodPressure > 0 ? 22 : 12) : 8;
    } else if (biome === "SAND") {
      score += economyWeak ? 12 : 8;
    }
    if (isNearMountain(x, y, 2)) score += 8;
    if (adjacentNeighborCores(x, y).some((neighbor) => neighbor.terrain === "SEA")) score += 8;
  };

  for (const next of adjacentNeighborCores(to.x, to.y)) {
    if (next.terrain !== "LAND") continue;
    considerReveal(next.x, next.y);
    for (const secondRing of adjacentNeighborCores(next.x, next.y)) {
      if (secondRing.terrain !== "LAND") continue;
      considerReveal(secondRing.x, secondRing.y);
    }
  }

  territorySummary.scoutRevealValueByProfileKey.set(profileKey, score);
  return score;
};

const bestAiFrontierAction = (
  actor: Player,
  kind: BasicFrontierActionType,
  filter: (tile: Tile) => boolean,
  victoryPath?: AiSeasonVictoryPathId,
  territorySummary = collectAiTerritorySummary(actor)
): { from: Tile; to: Tile } | undefined => {
  const { visibility, settledTileCount, frontierTileCount } = territorySummary;
  const earlyExpansionMode = settledTileCount <= 2;
  const economicExpansionMode = settledTileCount <= 6;
  const visibleToActor = (x: number, y: number): boolean => visibleInSnapshot(visibility, x, y);
  const dockScoreForTile = (tile: Tile): number => {
    const tk = key(tile.x, tile.y);
    if (!visibleToActor(tile.x, tile.y)) return 0;
    const dock = docksByTile.get(tk);
    let score = 0;
    if (dock) {
      score += 90;
      const linked = dock.connectedDockIds?.length ? dock.connectedDockIds.length : dock.pairedDockId ? 1 : 0;
      score += linked * 18;
    }
    for (const neighbor of adjacentNeighborCores(tile.x, tile.y)) {
      if (!visibleToActor(neighbor.x, neighbor.y)) continue;
      const neighborDock = docksByTile.get(key(neighbor.x, neighbor.y));
      if (!neighborDock) continue;
      score += 24;
      if (neighbor.ownerId && neighbor.ownerId !== actor.id && !actor.allies.has(neighbor.ownerId)) score += 22;
    }
    return score;
  };

  const scoreFrontierAction = (from: Tile, to: Tile): number => {
    const toVisible = visibleToActor(to.x, to.y);
    const tk = key(to.x, to.y);
    const isTown = toVisible && townsByTile.has(tk);
    const resourceValue = toVisible && to.resource ? baseTileValue(to.resource) : 0;
    const dockValue = dockScoreForTile(to);
    const adjacentInteresting = adjacentNeighborCores(to.x, to.y).reduce((score, neighbor) => {
      if (!visibleToActor(neighbor.x, neighbor.y)) return score;
      const neighborKey = key(neighbor.x, neighbor.y);
      const hostileOwner = neighbor.ownerId && neighbor.ownerId !== actor.id && !actor.allies.has(neighbor.ownerId);
      if (townsByTile.has(neighborKey) && hostileOwner) return score + 45;
      if (neighbor.resource && hostileOwner) return score + Math.max(15, baseTileValue(neighbor.resource) / 2);
      if (docksByTile.has(neighborKey) && hostileOwner) return score + 35;
      return score;
    }, 0);
    const explorationValue = adjacentNeighborCores(to.x, to.y).reduce((score, neighbor) => {
      if (visibleToActor(neighbor.x, neighbor.y)) return score;
      let next = score + 18;
      if (neighbor.terrain === "SEA") next += 10;
      return next;
    }, toVisible ? 0 : 24);
    const exposedSides = adjacentNeighborCores(to.x, to.y).reduce((count, neighbor) => {
      if (neighbor.terrain !== "LAND") return count + 1;
      if (!neighbor.ownerId || neighbor.ownerId !== actor.id) return count + 1;
      return count;
    }, 0);
    const ownedNeighbors = adjacentNeighborCores(to.x, to.y).reduce((count, neighbor) => {
      if (neighbor.ownerId !== actor.id) return count;
      return count + 1;
    }, 0);
    const alliedSettledNeighbors = adjacentNeighborCores(to.x, to.y).reduce((count, neighbor) => {
      if (neighbor.ownerId !== actor.id || neighbor.ownershipState !== "SETTLED") return count;
      return count + 1;
    }, 0);
    const frontierNeighbors = adjacentNeighborCores(to.x, to.y).reduce((count, neighbor) => {
      if (neighbor.ownerId !== actor.id || neighbor.ownershipState !== "FRONTIER") return count;
      return count + 1;
    }, 0);
    const coastlineDiscoveryValue = adjacentNeighborCores(to.x, to.y).reduce((score, neighbor) => {
      if (neighbor.terrain !== "SEA") return score;
      return score + (visibleToActor(neighbor.x, neighbor.y) ? 10 : 18);
    }, 0);
    const compactnessValue = alliedSettledNeighbors * 8 - exposedSides * 12;
    const scoutShapePenalty =
      Math.max(0, ownedNeighbors - 2) * 36 +
      Math.max(0, alliedSettledNeighbors - 1) * 18 +
      Math.max(0, frontierNeighbors - 1) * 12;
    const directionalScoutValue =
      explorationValue +
      coastlineDiscoveryValue -
      scoutShapePenalty +
      (ownedNeighbors <= 2 ? 18 : 0) +
      (from.ownershipState === "FRONTIER" ? 10 : 0);
    const knownEconomicValue = isTown || resourceValue > 0 || dockValue > 0;
    const knownMilitaryValue = adjacentInteresting >= 35 || to.ownerId === BARBARIAN_OWNER_ID;
    const reserveAfterAction = actor.points - FRONTIER_ACTION_GOLD_COST;
    const futureSettlement = kind === "EXPAND"
      ? evaluateAiSettlementCandidate(actor, to, victoryPath, new Set<TileKey>([tk]), territorySummary)
      : undefined;
    const immediateSettlementPlan = Boolean(
      futureSettlement &&
        canAffordGoldCost(actor.points, SETTLE_COST + FRONTIER_ACTION_GOLD_COST) &&
        futureSettlement.supportsImmediatePlan
    );

    let score = 0;
    if (kind === "ATTACK") score += 40;
    if (isTown) score += kind === "ATTACK" ? 180 : 120;
    score += resourceValue * (kind === "ATTACK" ? 1.8 : 1.25);
    score += dockValue;
    score += adjacentInteresting;
    if (kind === "EXPAND" && !knownEconomicValue && !knownMilitaryValue) {
      score += directionalScoutValue;
      if (immediateSettlementPlan && futureSettlement) {
        score += futureSettlement.score * 0.75;
        if (futureSettlement.isDefensivelyCompact) score += 30;
      } else {
        score += compactnessValue * 0.2;
      }
    }
    if (to.ownerId === BARBARIAN_OWNER_ID) score += 35;
    if (victoryPath === "TOWN_CONTROL" && isTown) score += 120;
    if (victoryPath === "ECONOMIC_HEGEMONY") {
      score += resourceValue + dockValue;
      if (isTown) score += 30;
    }
    if (victoryPath === "SETTLED_TERRITORY" && kind === "EXPAND") score += 20;
    score -= exposedSides * (kind === "ATTACK" ? 6 : 18);
    if (actor.points <= SETTLE_COST && !knownEconomicValue && adjacentInteresting < 40) score -= 80;
    if (kind === "EXPAND" && !earlyExpansionMode) {
      if (reserveAfterAction < SETTLE_COST && !knownEconomicValue && adjacentInteresting < 35) score -= 180;
      if (settledTileCount >= 2 && !knownEconomicValue && !knownMilitaryValue) score -= 45;
      if (settledTileCount >= 4 && explorationValue < 45 && !knownEconomicValue) score -= 70;
      if (frontierTileCount >= Math.max(2, settledTileCount) && !knownEconomicValue && !knownMilitaryValue && !immediateSettlementPlan) score -= 140;
    }
    if (kind === "EXPAND" && from.ownershipState !== "SETTLED" && !knownEconomicValue && explorationValue < 35) score -= 10;
    if (earlyExpansionMode && kind === "EXPAND") {
      score += 15;
      if (!knownEconomicValue) {
        score += directionalScoutValue;
        if (immediateSettlementPlan && futureSettlement) score += futureSettlement.score * 0.5;
      }
    }
    if (economicExpansionMode && kind === "EXPAND") {
      if (knownEconomicValue || explorationValue >= 40) score += 20;
      if (knownEconomicValue) score += 15;
    }
    if (kind === "EXPAND" && !knownEconomicValue && !knownMilitaryValue && ownedNeighbors >= 3 && !immediateSettlementPlan) {
      score -= earlyExpansionMode ? 140 : 220;
    }
    if (kind === "EXPAND" && frontierTileCount >= Math.max(1, settledTileCount - 1) && !knownEconomicValue && !knownMilitaryValue && !immediateSettlementPlan) {
      score -= 220;
    }
    if (!toVisible && kind === "ATTACK") {
      score -= 100;
    }
    if (!knownEconomicValue && !knownMilitaryValue && explorationValue < 20 && !earlyExpansionMode) {
      score -= 90;
    }
    return score;
  };

  let best: { score: number; from: Tile; to: Tile } | undefined;
  const frontierCandidates = kind === "ATTACK" ? territorySummary.attackCandidates : territorySummary.expandCandidates;
  for (const { from, to } of frontierCandidates) {
    if (to.terrain !== "LAND" || !filter(to)) continue;
    const score = scoreFrontierAction(from, to);
    if (!best || score > best.score) best = { score, from, to };
  }
  if (!best) return undefined;
  if (kind === "EXPAND" && earlyExpansionMode && best.score > Number.NEGATIVE_INFINITY) {
    return best;
  }
  const minScore =
    kind === "ATTACK"
      ? earlyExpansionMode
        ? 20
        : 35
      : earlyExpansionMode
        ? 0
        : economicExpansionMode
          ? 10
          : 30;
  return best.score >= minScore ? best : undefined;
};

const bestAiOpeningScoutExpand = (
  actor: Player,
  territorySummary = collectAiTerritorySummary(actor)
): { from: Tile; to: Tile } | undefined => {
  const { settledTileCount, visibility } = territorySummary;
  if (settledTileCount > 2) return undefined;

  let best: { score: number; from: Tile; to: Tile } | undefined;
  for (const { from, to } of territorySummary.expandCandidates) {
    if (to.terrain !== "LAND" || to.ownerId) continue;
    const unseenNeighbors = countAiScoutRevealTiles(to, visibility, territorySummary);
    const revealValue = scoreAiScoutRevealValue(actor, to, visibility, territorySummary);
    const { ownedNeighbors, alliedSettledNeighbors, frontierNeighbors, exposedSides, coastlineDiscoveryValue } =
      cachedScoutAdjacencyMetrics(actor, to, territorySummary);
    const score =
      unseenNeighbors * 22 +
      revealValue +
      coastlineDiscoveryValue +
      (ownedNeighbors <= 2 ? 16 : 0) +
      (from.ownershipState === "FRONTIER" ? 10 : 0) -
      Math.max(0, ownedNeighbors - 2) * 34 -
      Math.max(0, alliedSettledNeighbors - 1) * 20 -
      Math.max(0, frontierNeighbors - 1) * 12 -
      exposedSides * 4;
    if (!best || score > best.score) best = { score, from, to };
  }
  return best;
};

const scoreAiScoutExpandCandidate = (
  actor: Player,
  from: Tile,
  to: Tile,
  visibility = visibilitySnapshotForPlayer(actor),
  territorySummary?: AiTerritorySummary
): number => {
  const unseenNeighbors = territorySummary
    ? countAiScoutRevealTiles(to, visibility, territorySummary)
    : (() => {
        const scoutRevealTiles = new Set<TileKey>();
        for (const next of adjacentNeighborCores(to.x, to.y)) {
          if (next.terrain !== "LAND") continue;
          if (!visibleInSnapshot(visibility, next.x, next.y)) scoutRevealTiles.add(key(next.x, next.y));
          for (const secondRing of adjacentNeighborCores(next.x, next.y)) {
            if (secondRing.terrain !== "LAND") continue;
            if (!visibleInSnapshot(visibility, secondRing.x, secondRing.y)) scoutRevealTiles.add(key(secondRing.x, secondRing.y));
          }
        }
        return scoutRevealTiles.size;
      })();
  const { ownedNeighbors, alliedSettledNeighbors, frontierNeighbors, coastlineDiscoveryValue } = territorySummary
    ? cachedScoutAdjacencyMetrics(actor, to, territorySummary)
    : (() => {
        let ownedNeighbors = 0;
        let alliedSettledNeighbors = 0;
        let frontierNeighbors = 0;
        let coastlineDiscoveryValue = 0;
        for (const next of adjacentNeighborCores(to.x, to.y)) {
          if (next.ownerId === actor.id) {
            ownedNeighbors += 1;
            if (next.ownershipState === "SETTLED") alliedSettledNeighbors += 1;
            if (next.ownershipState === "FRONTIER") frontierNeighbors += 1;
          }
          if (next.terrain === "SEA") coastlineDiscoveryValue += 18;
        }
        return { ownedNeighbors, alliedSettledNeighbors, frontierNeighbors, coastlineDiscoveryValue };
      })();
  const revealValue = territorySummary ? scoreAiScoutRevealValue(actor, to, visibility, territorySummary) : 0;
  return (
    unseenNeighbors * 18 +
    revealValue +
    coastlineDiscoveryValue +
    (ownedNeighbors <= 2 ? 16 : 0) +
    (from.ownershipState === "FRONTIER" ? 10 : 0) -
    Math.max(0, ownedNeighbors - 2) * 34 -
    Math.max(0, alliedSettledNeighbors - 1) * 20 -
    Math.max(0, frontierNeighbors - 1) * 12
  );
};

const bestAiScoutExpand = (
  actor: Player,
  territorySummary = collectAiTerritorySummary(actor)
): { from: Tile; to: Tile } | undefined => {
  const { visibility } = territorySummary;
  const startedAt = now();
  let scannedCandidates = 0;
  let best: { score: number; from: Tile; to: Tile } | undefined;
  for (const { from, to } of territorySummary.expandCandidates) {
    if (to.terrain !== "LAND" || to.ownerId) continue;
    scannedCandidates += 1;
    const scoutRevealCount = countAiScoutRevealTiles(to, visibility, territorySummary);
    const adjacency = cachedScoutAdjacencyMetrics(actor, to, territorySummary);
    if (scoutRevealCount <= 0 && adjacency.coastlineDiscoveryValue <= 0) {
      if ((scannedCandidates & 3) === 0 && now() - startedAt >= AI_FRONTIER_SELECTOR_BUDGET_MS) {
        runtimeState.appRef?.log.warn(
          {
            playerId: actor.id,
            scannedCandidates,
            frontierCandidates: territorySummary.expandCandidates.length,
            elapsedMs: now() - startedAt,
            budgetMs: AI_FRONTIER_SELECTOR_BUDGET_MS
          },
          "ai frontier selector budget hit"
        );
        break;
      }
      continue;
    }
    const revealValue = scoreAiScoutRevealValue(actor, to, visibility, territorySummary);
    const score =
      scoutRevealCount * 18 +
      revealValue +
      adjacency.coastlineDiscoveryValue +
      (adjacency.ownedNeighbors <= 2 ? 16 : 0) +
      (from.ownershipState === "FRONTIER" ? 10 : 0) -
      Math.max(0, adjacency.ownedNeighbors - 2) * 34 -
      Math.max(0, adjacency.alliedSettledNeighbors - 1) * 20 -
      Math.max(0, adjacency.frontierNeighbors - 1) * 12;
    if (!best || score > best.score) best = { score, from, to };
    if ((scannedCandidates & 31) === 0 && now() - startedAt >= AI_FRONTIER_SELECTOR_BUDGET_MS) {
      runtimeState.appRef?.log.warn(
        {
          playerId: actor.id,
          scannedCandidates,
          frontierCandidates: territorySummary.expandCandidates.length,
          elapsedMs: now() - startedAt,
          budgetMs: AI_FRONTIER_SELECTOR_BUDGET_MS
        },
        "ai frontier selector budget hit"
      );
      break;
    }
  }
  return best && best.score >= 30 ? best : undefined;
};

type AiFrontierOpportunityCounts = {
  economic: number;
  scout: number;
  scaffold: number;
  waste: number;
};

type AiNeutralFrontierClass = "economic" | "scaffold" | "scout" | "waste";

type AiSettlementCandidateEvaluation = {
  score: number;
  isEconomicallyInteresting: boolean;
  isStrategicallyInteresting: boolean;
  isDefensivelyCompact: boolean;
  supportsImmediatePlan: boolean;
  townSupportSignal: number;
  intrinsicDockValue: number;
  islandFootprintSignal: number;
};

const aiEconomyPriorityState = (
  actor: Player,
  territorySummary?: Pick<AiTerritorySummary, "settledTileCount" | "worldFlags" | "controlledTowns" | "foodPressure">
): {
  controlledTowns: number;
  settledTiles: number;
  aiIncome: number;
  worldFlags: Set<string>;
  foodCoverageLow: boolean;
  economyWeak: boolean;
} => {
  const controlledTowns = territorySummary?.controlledTowns ?? countControlledTowns(actor.id);
  const settledTiles =
    territorySummary?.settledTileCount ?? [...actor.territoryTiles].filter((tileKey) => ownershipStateByTile.get(tileKey) === "SETTLED").length;
  const aiIncome = currentIncomePerMinute(actor);
  const worldFlags = territorySummary?.worldFlags ?? playerWorldFlags(actor);
  const foodCoverageLow = controlledTowns > 0 && currentFoodCoverageForPlayer(actor.id) < 1;
  const economyWeak =
    aiIncome < (controlledTowns === 0 ? 12 : 18) ||
    (!worldFlags.has("active_town") && !worldFlags.has("active_dock") && settledTiles >= 6) ||
    foodCoverageLow;
  return { controlledTowns, settledTiles, aiIncome, worldFlags, foodCoverageLow, economyWeak };
};

const aiFoodPressureSignal = (actor: Player): number => {
  const ownedTownCount = ownedTownKeysForPlayer(actor.id).length;
  if (ownedTownCount <= 0) return 0;
  const coverage = currentFoodCoverageForPlayer(actor.id);
  if (coverage >= 1.2) return 0;
  if (coverage >= 1) return 35;
  if (coverage >= 0.85) return 80;
  return 140;
};

const cachedAiIslandProgress = (
  actor: Player,
  territorySummary?: Pick<AiTerritorySummary, "islandProgress">
): NonNullable<AiTerritorySummary["islandProgress"]> => {
  if (territorySummary?.islandProgress) return territorySummary.islandProgress;
  const { islandIdByTile, landCounts } = islandMap();
  const settledCounts = new Map<number, number>();
  const ownedCounts = new Map<number, number>();
  for (const tk of actor.territoryTiles) {
    const islandId = islandIdByTile.get(tk);
    if (islandId === undefined) continue;
    ownedCounts.set(islandId, (ownedCounts.get(islandId) ?? 0) + 1);
    if (ownershipStateByTile.get(tk) !== "SETTLED") continue;
    settledCounts.set(islandId, (settledCounts.get(islandId) ?? 0) + 1);
  }
  let undercoveredIslandCount = 0;
  let ownedUndercoveredIslandCount = 0;
  let weakestRatio = Number.POSITIVE_INFINITY;
  for (const [islandId, totalLand] of landCounts) {
    if (totalLand <= 0) continue;
    const ratio = (settledCounts.get(islandId) ?? 0) / totalLand;
    if (ratio < SEASON_VICTORY_CONTINENT_FOOTPRINT_SHARE) {
      undercoveredIslandCount += 1;
      if ((ownedCounts.get(islandId) ?? 0) > 0) ownedUndercoveredIslandCount += 1;
    }
    weakestRatio = Math.min(weakestRatio, ratio);
  }
  const progress = {
    settledCounts,
    ownedCounts,
    landCounts,
    totalIslands: landCounts.size,
    undercoveredIslandCount,
    ownedUndercoveredIslandCount,
    weakestRatio: Number.isFinite(weakestRatio) ? weakestRatio : 1
  };
  if (territorySummary) territorySummary.islandProgress = progress;
  return progress;
};

const aiIslandFootprintSignal = (
  actor: Player,
  tile: Tile,
  territorySummary?: Pick<AiTerritorySummary, "islandFootprintSignalByTileKey" | "islandProgress">
): number => {
  const tk = key(tile.x, tile.y);
  const cached = territorySummary?.islandFootprintSignalByTileKey.get(tk);
  if (cached !== undefined) return cached;
  const { islandIdByTile } = islandMap();
  const islandId = islandIdByTile.get(tk);
  if (islandId === undefined) {
    territorySummary?.islandFootprintSignalByTileKey.set(tk, 0);
    return 0;
  }
  const progress = cachedAiIslandProgress(actor, territorySummary);
  const totalLand = progress.landCounts.get(islandId) ?? 0;
  if (totalLand <= 0) {
    territorySummary?.islandFootprintSignalByTileKey.set(tk, 0);
    return 0;
  }
  const settledRatio = (progress.settledCounts.get(islandId) ?? 0) / totalLand;
  if (settledRatio >= SEASON_VICTORY_CONTINENT_FOOTPRINT_SHARE) {
    territorySummary?.islandFootprintSignalByTileKey.set(tk, 0);
    return 0;
  }
  const ownedCount = progress.ownedCounts.get(islandId) ?? 0;
  const missingShare = SEASON_VICTORY_CONTINENT_FOOTPRINT_SHARE - settledRatio;
  let score = 130 + Math.round(missingShare * 1200);
  if (ownedCount === 0) score += 180;
  else if ((progress.settledCounts.get(islandId) ?? 0) === 0) score += 110;
  territorySummary?.islandFootprintSignalByTileKey.set(tk, score);
  return score;
};

const bestAiIslandFocusTargetId = (
  actor: Player,
  territorySummary: Pick<AiTerritorySummary, "expandCandidates" | "frontierTiles" | "islandProgress" | "islandFocusTargetId">
): number | undefined => {
  if (territorySummary.islandFocusTargetId !== undefined) return territorySummary.islandFocusTargetId;
  const progress = cachedAiIslandProgress(actor, territorySummary);
  const { islandIdByTile } = islandMap();
  const candidateIslandIds = new Set<number>();

  for (const tile of territorySummary.frontierTiles) {
    const islandId = islandIdByTile.get(key(tile.x, tile.y));
    if (islandId !== undefined) candidateIslandIds.add(islandId);
  }
  for (const { to } of territorySummary.expandCandidates) {
    if (to.terrain !== "LAND" || to.ownerId) continue;
    const islandId = islandIdByTile.get(key(to.x, to.y));
    if (islandId !== undefined) candidateIslandIds.add(islandId);
  }

  let bestOwnedIslandId: number | undefined;
  let bestOwnedScore = Number.NEGATIVE_INFINITY;
  let bestNewIslandId: number | undefined;
  let bestNewScore = Number.NEGATIVE_INFINITY;

  for (const islandId of candidateIslandIds) {
    const totalLand = progress.landCounts.get(islandId) ?? 0;
    if (totalLand <= 0) continue;
    const settledCount = progress.settledCounts.get(islandId) ?? 0;
    const ownedCount = progress.ownedCounts.get(islandId) ?? 0;
    const settledRatio = settledCount / totalLand;
    if (settledRatio >= SEASON_VICTORY_CONTINENT_FOOTPRINT_SHARE) continue;
    const missingShare = SEASON_VICTORY_CONTINENT_FOOTPRINT_SHARE - settledRatio;
    if (ownedCount > 0) {
      const score = 500 + settledRatio * 700 - missingShare * 220 + Math.min(ownedCount, 12) * 12;
      if (score > bestOwnedScore) {
        bestOwnedIslandId = islandId;
        bestOwnedScore = score;
      }
      continue;
    }
    const score = 220 + missingShare * 260;
    if (score > bestNewScore) {
      bestNewIslandId = islandId;
      bestNewScore = score;
    }
  }

  const focusedIslandId = bestOwnedIslandId ?? bestNewIslandId;
  territorySummary.islandFocusTargetId = focusedIslandId;
  return focusedIslandId;
};

const aiDockStrategicSignal = (
  actor: Player,
  tile: Tile,
  territorySummary?: Partial<Pick<AiTerritorySummary, "dockSignalByTileKey" | "visibility" | "foodPressure" | "settlementEvaluationByKey">>
): number => {
  const tk = key(tile.x, tile.y);
  if (territorySummary?.dockSignalByTileKey) {
    const cached = territorySummary.dockSignalByTileKey.get(tk);
    if (cached !== undefined) return cached;
  }
  const dock = docksByTile.get(tk);
  if (!dock) return 0;
  let score = 140;
  const linkedDockTileKeys = dockLinkedTileKeys(dock);
  score += linkedDockTileKeys.length * 32;
  for (const linkedTileKey of linkedDockTileKeys) {
    const [linkedX, linkedY] = parseKey(linkedTileKey);
    const linkedTile = aiTileLiteAt(linkedX, linkedY);
    if (!linkedTile.ownerId) {
      score += 160;
      continue;
    }
    if (linkedTile.ownerId === actor.id) {
      score += linkedTile.ownershipState === "SETTLED" ? 70 : 110;
      continue;
    }
    if (!actor.allies.has(linkedTile.ownerId)) score += 135;
  }
  territorySummary?.dockSignalByTileKey?.set(tk, score);
  return score;
};

const aiFrontierActionCandidates = (
  actor: Player,
  from: Tile,
  actionType: BasicFrontierActionType
): Tile[] => {
  const out = new Map<TileKey, Tile>();
  for (const neighbor of adjacentNeighborCores(from.x, from.y)) {
    out.set(key(neighbor.x, neighbor.y), aiTileLiteAt(neighbor.x, neighbor.y));
  }
  const fromDock = docksByTile.get(key(from.x, from.y));
  if (fromDock) {
    for (const linkedTileKey of dockLinkedTileKeys(fromDock)) {
      const [linkedX, linkedY] = parseKey(linkedTileKey);
      const linkedTile = aiTileLiteAt(linkedX, linkedY);
      out.set(linkedTileKey, linkedTile);
      if (actionType === "ATTACK") {
        for (const neighbor of adjacentNeighborCores(linkedTile.x, linkedTile.y)) {
          out.set(key(neighbor.x, neighbor.y), aiTileLiteAt(neighbor.x, neighbor.y));
        }
      }
    }
  }
  return [...out.values()];
};

const aiEconomicFrontierSignal = (
  actor: Player,
  tile: Tile,
  visibility = visibilitySnapshotForPlayer(actor),
  foodPressure = aiFoodPressureSignal(actor),
  territorySummary?: Partial<
    Pick<AiTerritorySummary, "economicSignalByTileKey" | "dockSignalByTileKey" | "visibility" | "foodPressure" | "settlementEvaluationByKey">
  >
): number => {
  const tk = key(tile.x, tile.y);
  if (territorySummary?.economicSignalByTileKey) {
    const cached = territorySummary.economicSignalByTileKey.get(tk);
    if (cached !== undefined) return cached;
  }
  const visibleToActor = (x: number, y: number): boolean => visibleInSnapshot(visibility, x, y);
  let score = 0;
  if (visibleToActor(tile.x, tile.y)) {
    if (townsByTile.has(tk)) score += 150;
    if (tile.resource) {
      score += 90 + baseTileValue(tile.resource);
      if (foodPressure > 0 && (tile.resource === "FARM" || tile.resource === "FISH")) score += foodPressure;
    }
    score += aiDockStrategicSignal(actor, tile, territorySummary);
  }
  for (const neighbor of adjacentNeighborCores(tile.x, tile.y)) {
    if (!visibleToActor(neighbor.x, neighbor.y)) continue;
    const neighborKey = key(neighbor.x, neighbor.y);
    if (townsByTile.has(neighborKey)) score += 110;
    if (neighbor.resource) {
      score += 65 + Math.floor(baseTileValue(neighbor.resource) * 0.6);
      if (foodPressure > 0 && (neighbor.resource === "FARM" || neighbor.resource === "FISH")) {
        score += Math.round(foodPressure * 0.7);
      }
    }
    if (docksByTile.has(neighborKey)) score += 95 + Math.round(aiDockStrategicSignal(actor, aiTileLiteAt(neighbor.x, neighbor.y), territorySummary) * 0.45);
  }
  territorySummary?.economicSignalByTileKey?.set(tk, score);
  return score;
};

const aiEnemyPressureSignal = (
  actor: Player,
  tile: Tile,
  visibility = visibilitySnapshotForPlayer(actor),
  territorySummary?: Partial<Pick<AiTerritorySummary, "pressureSignalByTileKey" | "visibility" | "foodPressure" | "settlementEvaluationByKey">>
): number => {
  const tk = key(tile.x, tile.y);
  if (territorySummary?.pressureSignalByTileKey) {
    const cached = territorySummary.pressureSignalByTileKey.get(tk);
    if (cached !== undefined) return cached;
  }
  const visibleToActor = (x: number, y: number): boolean => visibleInSnapshot(visibility, x, y);
  if (!tile.ownerId || tile.ownerId === actor.id || actor.allies.has(tile.ownerId) || tile.ownerId === BARBARIAN_OWNER_ID) return 0;
  let score = 0;
  const firstRing = adjacentNeighborCores(tile.x, tile.y);
  let settledIntrusion = 0;
  let ownedIntrusion = 0;
  for (const neighbor of firstRing) {
    if (neighbor.terrain !== "LAND" || neighbor.ownerId !== actor.id) continue;
    ownedIntrusion += 1;
    if (neighbor.ownershipState === "SETTLED") settledIntrusion += 1;
  }
  if (ownedIntrusion > 0) {
    score += 180 + ownedIntrusion * 95 + settledIntrusion * 70;
    if (tile.ownershipState === "FRONTIER") score += 260;
  }
  if (settledIntrusion > 0) {
    score += 120 + settledIntrusion * 60;
  }
  if (visibleToActor(tile.x, tile.y)) {
    if (townsByTile.has(tk)) score += 180;
    if (tile.resource) score += 110 + baseTileValue(tile.resource);
    if (docksByTile.has(tk)) score += 150;
  }
  for (const neighbor of firstRing) {
    if (!visibleToActor(neighbor.x, neighbor.y)) continue;
    const neighborKey = key(neighbor.x, neighbor.y);
    if (townsByTile.has(neighborKey)) score += 125;
    if (neighbor.resource) score += 85 + Math.floor(baseTileValue(neighbor.resource) * 0.7);
    if (docksByTile.has(neighborKey)) score += 110;
    for (const secondRing of adjacentNeighborCores(neighbor.x, neighbor.y)) {
      if (!visibleToActor(secondRing.x, secondRing.y)) continue;
      const secondRingKey = key(secondRing.x, secondRing.y);
      if (townsByTile.has(secondRingKey)) score += 45;
      if (secondRing.resource) score += 30 + Math.floor(baseTileValue(secondRing.resource) * 0.35);
      if (docksByTile.has(secondRingKey)) score += 40;
    }
  }
  territorySummary?.pressureSignalByTileKey?.set(tk, score);
  return score;
};

const isOwnedTownSupportRingTile = (ownerId: string, tile: Tile): boolean => {
  if (tile.ownerId !== ownerId || tile.ownershipState !== "SETTLED" || tile.terrain !== "LAND") return false;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const nx = wrapX(tile.x + dx, WORLD_WIDTH);
      const ny = wrapY(tile.y + dy, WORLD_HEIGHT);
      const neighborKey = key(nx, ny);
      if (townsByTile.has(neighborKey) && ownership.get(neighborKey) === ownerId && ownershipStateByTile.get(neighborKey) === "SETTLED") {
        return true;
      }
    }
  }
  return false;
};

const cachedSupportedTownKeysForTile = (
  actorId: string,
  tileKey: TileKey,
  territorySummary?: Pick<AiTerritorySummary, "supportedTownKeysByTileKey">
): TileKey[] => {
  if (!territorySummary) return supportedTownKeysForTile(tileKey, actorId);
  const cached = territorySummary.supportedTownKeysByTileKey.get(tileKey);
  if (cached) return cached;
  const resolved = supportedTownKeysForTile(tileKey, actorId);
  territorySummary.supportedTownKeysByTileKey.set(tileKey, resolved);
  return resolved;
};

const pressureAttackThreatensCore = (actor: Player, candidate?: { to: Tile } | undefined): boolean => {
  if (!candidate) return false;
  for (const neighbor of adjacentNeighborCores(candidate.to.x, candidate.to.y)) {
    if (neighbor.terrain !== "LAND" || neighbor.ownerId !== actor.id) continue;
    const neighborKey = key(neighbor.x, neighbor.y);
    if (townsByTile.has(neighborKey) || docksByTile.has(neighborKey)) return true;
    if (isOwnedTownSupportRingTile(actor.id, aiTileLiteAt(neighbor.x, neighbor.y))) return true;
  }
  return false;
};

const fortTileProtectsCore = (actor: Player, tile?: Tile): boolean => {
  if (!tile || tile.ownerId !== actor.id || tile.terrain !== "LAND") return false;
  const tk = key(tile.x, tile.y);
  if (townsByTile.has(tk) || docksByTile.has(tk) || isOwnedTownSupportRingTile(actor.id, tile)) return true;
  for (const neighbor of adjacentNeighborCores(tile.x, tile.y)) {
    if (neighbor.terrain !== "LAND" || neighbor.ownerId !== actor.id) continue;
    const neighborKey = key(neighbor.x, neighbor.y);
    if (townsByTile.has(neighborKey) || docksByTile.has(neighborKey)) return true;
    if (isOwnedTownSupportRingTile(actor.id, aiTileLiteAt(neighbor.x, neighbor.y))) return true;
  }
  return false;
};

const fortTileIsDockChokePoint = (tile?: Tile): boolean => {
  if (!tile) return false;
  const tk = key(tile.x, tile.y);
  if (!docksByTile.has(tk)) return false;
  const adjacentLandCount = adjacentNeighborCores(tile.x, tile.y).reduce((count, neighbor) => count + (neighbor.terrain === "LAND" ? 1 : 0), 0);
  return adjacentLandCount <= 3;
};

const evaluateAiSettlementCandidate = (
  actor: Player,
  tile: Tile,
  victoryPath?: AiSeasonVictoryPathId,
  assumedFrontierKeys?: ReadonlySet<TileKey>,
  territorySummary?: Pick<
    AiTerritorySummary,
    "visibility" | "foodPressure" | "settlementEvaluationByKey" | "islandFootprintSignalByTileKey" | "islandProgress"
  >
): AiSettlementCandidateEvaluation => {
  const tk = key(tile.x, tile.y);
  const cacheKey = `${tk}|${victoryPath ?? "none"}|${assumedFrontierKeys ? [...assumedFrontierKeys].sort().join(",") : "-"}`;
  if (territorySummary) {
    const cached = territorySummary.settlementEvaluationByKey.get(cacheKey);
    if (cached) return cached;
  }
  const assumedOwned = assumedFrontierKeys?.has(tk) ?? false;
  const actualOwnerId = assumedOwned ? actor.id : ownership.get(tk) ?? tile.ownerId;
  const actualOwnershipState = assumedOwned ? "FRONTIER" : ownershipStateByTile.get(tk) ?? tile.ownershipState;
  if (tile.terrain !== "LAND" || actualOwnerId !== actor.id || actualOwnershipState !== "FRONTIER") {
    const invalidEvaluation = {
      score: Number.NEGATIVE_INFINITY,
      isEconomicallyInteresting: false,
      isStrategicallyInteresting: false,
      isDefensivelyCompact: false,
      supportsImmediatePlan: false,
      townSupportSignal: 0,
      intrinsicDockValue: 0,
      islandFootprintSignal: 0
    };
    if (territorySummary) {
      territorySummary.settlementEvaluationByKey.set(cacheKey, invalidEvaluation);
    }
    return invalidEvaluation;
  }

  const neighborOwnership = (neighbor: RuntimeTileCore): { ownerId: string | undefined; ownershipState: OwnershipState | undefined } => {
    const neighborKey = key(neighbor.x, neighbor.y);
    if (assumedFrontierKeys?.has(neighborKey)) {
      return { ownerId: actor.id, ownershipState: "FRONTIER" };
    }
    return { ownerId: neighbor.ownerId, ownershipState: neighbor.ownershipState };
  };

  const isTown = townsByTile.has(tk);
  const resourceValue = tile.resource ? baseTileValue(tile.resource) : 0;
  const economicFrontierSignal = aiEconomicFrontierSignal(actor, tile, territorySummary?.visibility, territorySummary?.foodPressure, territorySummary);
  const foodPressure = territorySummary?.foodPressure ?? aiFoodPressureSignal(actor);
  const dockValue = docksByTile.has(tk) ? aiDockStrategicSignal(actor, tile, territorySummary) : 0;
  const islandFootprintSignal = aiIslandFootprintSignal(actor, tile, territorySummary);
  let townSupportSignal = 0;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const nx = wrapX(tile.x + dx, WORLD_WIDTH);
      const ny = wrapY(tile.y + dy, WORLD_HEIGHT);
      if (terrainAt(nx, ny) !== "LAND") continue;
      const neighborKey = key(nx, ny);
      if (!townsByTile.has(neighborKey)) continue;
      if (ownership.get(neighborKey) !== actor.id || ownershipStateByTile.get(neighborKey) !== "SETTLED") continue;
      const support = townSupport(neighborKey, actor.id);
      const deficit = Math.max(0, support.supportMax - support.supportCurrent);
      if (deficit <= 0) continue;
      townSupportSignal += 120 + deficit * 36;
    }
  }
  const foodSettlementSignal =
    foodPressure > 0 && (tile.resource === "FARM" || tile.resource === "FISH") ? Math.round(foodPressure * 0.9) : 0;
  const adjacentInteresting = adjacentNeighborCores(tile.x, tile.y).reduce((score, neighbor) => {
    const neighborKey = key(neighbor.x, neighbor.y);
    const hostileOwner = neighbor.ownerId && neighbor.ownerId !== actor.id && !actor.allies.has(neighbor.ownerId);
    if (townsByTile.has(neighborKey) && hostileOwner) return score + 35;
    if (neighbor.resource && hostileOwner) return score + Math.max(12, baseTileValue(neighbor.resource) / 2);
    if (docksByTile.has(neighborKey) && hostileOwner) return score + 28;
    return score;
  }, 0);
  const exposedSides = adjacentNeighborCores(tile.x, tile.y).reduce((count, neighbor) => {
    const ownership = neighborOwnership(neighbor);
    if (neighbor.terrain !== "LAND") return count + 1;
    if (!ownership.ownerId || ownership.ownerId !== actor.id) return count + 1;
    return count;
  }, 0);
  const ownedNeighbors = adjacentNeighborCores(tile.x, tile.y).reduce((count, neighbor) => {
    const ownership = neighborOwnership(neighbor);
    if (ownership.ownerId !== actor.id) return count;
    return count + 1;
  }, 0);
  const alliedSettledNeighbors = adjacentNeighborCores(tile.x, tile.y).reduce((count, neighbor) => {
    const ownership = neighborOwnership(neighbor);
    if (ownership.ownerId !== actor.id || ownership.ownershipState !== "SETTLED") return count;
    return count + 1;
  }, 0);
  const alliedFrontierNeighbors = adjacentNeighborCores(tile.x, tile.y).reduce((count, neighbor) => {
    const ownership = neighborOwnership(neighbor);
    if (ownership.ownerId !== actor.id || ownership.ownershipState !== "FRONTIER") return count;
    return count + 1;
  }, 0);
  const defensiveShapeValue =
    alliedSettledNeighbors * 22 +
    alliedFrontierNeighbors * 10 -
    exposedSides * 14 +
    (ownedNeighbors >= 3 ? 24 : 0) +
    (exposedSides <= 1 ? 18 : 0);
  const connectedCoreValue = alliedSettledNeighbors >= 2 ? 24 : alliedSettledNeighbors >= 1 ? 10 : -10;
  const isEconomicallyInteresting =
    isTown || Boolean(tile.resource) || dockValue > 0 || economicFrontierSignal >= 95 || townSupportSignal > 0;
  const isDefensivelyCompact = ownedNeighbors >= 3 && exposedSides <= 1;
  const isStrategicallyInteresting = adjacentInteresting >= 35 || defensiveShapeValue >= 26 || townSupportSignal > 0;

  let score = 0;
  if (isTown) score += 140;
  score += resourceValue * 1.5;
  score += foodSettlementSignal;
  score += dockValue;
  score += economicFrontierSignal;
  score += victoryPath === "SETTLED_TERRITORY" ? islandFootprintSignal : Math.round(islandFootprintSignal * 0.35);
  score += townSupportSignal;
  score += adjacentInteresting;
  score += defensiveShapeValue + connectedCoreValue;
  if (victoryPath === "SETTLED_TERRITORY") score += 25;
  if (victoryPath === "ECONOMIC_HEGEMONY") score += resourceValue + dockValue + (isTown ? 30 : 0);
  if (!isEconomicallyInteresting && !isStrategicallyInteresting) score -= 120;
  if (ownedNeighbors <= 1 && !isEconomicallyInteresting) score -= 70;
  if (exposedSides >= 3 && !isEconomicallyInteresting && adjacentInteresting < 25) score -= 55;

  const supportsImmediatePlan =
    isEconomicallyInteresting ||
    isDefensivelyCompact ||
    townSupportSignal > 0 ||
    score >= (victoryPath === "SETTLED_TERRITORY" ? 36 : 58);

  const evaluation = {
    score,
    isEconomicallyInteresting,
    isStrategicallyInteresting,
    isDefensivelyCompact,
    supportsImmediatePlan,
    townSupportSignal,
    intrinsicDockValue: dockValue,
    islandFootprintSignal
  };
  if (territorySummary) {
    territorySummary.settlementEvaluationByKey.set(cacheKey, evaluation);
  }
  return evaluation;
};

const isAiVisibleEconomicFrontierTile = (
  actor: Player,
  tile: Tile,
  territorySummary?: Pick<AiTerritorySummary, "visibility" | "foodPressure">
): boolean => {
  return aiEconomicFrontierSignal(actor, tile, territorySummary?.visibility, territorySummary?.foodPressure, territorySummary) >= 95;
};

const classifyAiNeutralFrontierOpportunity = (
  actor: Player,
  from: Tile,
  to: Tile,
  victoryPath?: AiSeasonVictoryPathId,
  territorySummary?: Pick<
    AiTerritorySummary,
    | "visibility"
    | "foodPressure"
    | "settlementEvaluationByKey"
    | "scoutRevealCountByTileKey"
    | "scoutRevealMarks"
    | "scoutRevealStamp"
    | "islandFootprintSignalByTileKey"
    | "islandProgress"
  >
): AiNeutralFrontierClass => {
  if (isAiVisibleEconomicFrontierTile(actor, to, territorySummary)) return "economic";
  const scaffoldEvaluation = evaluateAiSettlementCandidate(actor, to, victoryPath, new Set<TileKey>([key(to.x, to.y)]), territorySummary);
  if (scaffoldEvaluation.supportsImmediatePlan && scaffoldEvaluation.score >= 45) return "scaffold";
  if (scoreAiScoutExpandCandidate(actor, from, to, territorySummary?.visibility, territorySummary as AiTerritorySummary | undefined) >= 30) return "scout";
  return "waste";
};

const bestAiScaffoldExpand = (
  actor: Player,
  victoryPath?: AiSeasonVictoryPathId,
  territorySummary = collectAiTerritorySummary(actor)
): { from: Tile; to: Tile } | undefined => {
  const { economyWeak, foodCoverageLow } = aiEconomyPriorityState(actor, territorySummary);
  let best: { score: number; from: Tile; to: Tile } | undefined;
  for (const { from, to } of territorySummary.expandCandidates) {
    if (to.terrain !== "LAND" || to.ownerId) continue;
    const evaluation = evaluateAiSettlementCandidate(actor, to, victoryPath, new Set<TileKey>([key(to.x, to.y)]), territorySummary);
    if (!evaluation.supportsImmediatePlan) continue;
    if ((economyWeak || foodCoverageLow) && !evaluation.isEconomicallyInteresting) continue;
    let score = evaluation.score;
    if (evaluation.isDefensivelyCompact) score += 30;
    if (evaluation.isEconomicallyInteresting) score += 25;
    if (from.ownershipState === "SETTLED") score += 8;
    if (!best || score > best.score) best = { score, from, to };
  }
  return best && best.score >= 45 ? best : undefined;
};

const bestAiEconomicExpand = (
  actor: Player,
  victoryPath?: AiSeasonVictoryPathId,
  territorySummary = collectAiTerritorySummary(actor)
): { from: Tile; to: Tile } | undefined => {
  return bestAiFrontierAction(
    actor,
    "EXPAND",
    (tile) => !tile.ownerId && isAiVisibleEconomicFrontierTile(actor, tile, territorySummary),
    victoryPath,
    territorySummary
  );
};

const bestAiIslandExpand = (
  actor: Player,
  territorySummary = collectAiTerritorySummary(actor)
): { from: Tile; to: Tile } | undefined => {
  const focusIslandId = bestAiIslandFocusTargetId(actor, territorySummary);
  const { islandIdByTile } = islandMap();
  let best: { score: number; from: Tile; to: Tile } | undefined;
  for (const { from, to } of territorySummary.expandCandidates) {
    if (to.terrain !== "LAND" || to.ownerId) continue;
    const islandId = islandIdByTile.get(key(to.x, to.y));
    if (focusIslandId !== undefined && islandId !== focusIslandId) continue;
    const islandSignal = aiIslandFootprintSignal(actor, to, territorySummary);
    if (islandSignal <= 0) continue;
    const scoutScore = scoreAiScoutExpandCandidate(actor, from, to, territorySummary.visibility, territorySummary);
    const economicSignal = aiEconomicFrontierSignal(actor, to, territorySummary.visibility, territorySummary.foodPressure, territorySummary);
    let score = islandSignal + Math.round(economicSignal * 0.55) + Math.round(scoutScore * 0.45) + 120;
    if (from.ownershipState === "SETTLED") score += 12;
    if (!best || score > best.score) best = { score, from, to };
  }
  return best && best.score >= 150 ? best : undefined;
};

const frontierPlanningSummaryForPlayer = (
  actor: Player,
  territorySummary: AiTerritorySummary
): AiFrontierPlanningSummary => {
  if (territorySummary.frontierPlanningSummary) return territorySummary.frontierPlanningSummary;
  const visibility = territorySummary.visibility;
  const settledTiles = territorySummary.settledTileCount;
  let neutralExpandAvailable = false;
  let openingScoutAvailable = false;
  let scoutExpandAvailable = false;
  let economicExpandAvailable = false;
  let scaffoldExpandAvailable = false;
  let islandExpandAvailable = false;
  let frontierOpportunityEconomic = 0;
  let frontierOpportunityScout = 0;
  let frontierOpportunityScaffold = 0;
  let frontierOpportunityWaste = 0;
  let bestEconomicExpand: { score: number; from: Tile; to: Tile } | undefined;
  let bestScoutExpand: { score: number; from: Tile; to: Tile } | undefined;
  let bestScaffoldExpand: { score: number; from: Tile; to: Tile } | undefined;
  let bestIslandExpand: { score: number; from: Tile; to: Tile } | undefined;
  let bestAnyNeutralExpand: { score: number; from: Tile; to: Tile } | undefined;

  for (const { from, to } of territorySummary.expandCandidates) {
    if (to.terrain !== "LAND" || to.ownerId) continue;
    neutralExpandAvailable = true;
    const tileKey = key(to.x, to.y);
    const adjacency = cachedScoutAdjacencyMetrics(actor, to, territorySummary);
    const ownedNeighbors = adjacency.ownedNeighbors;
    const exposedSides = adjacency.exposedSides;
    const scoutRevealCount = countAiScoutRevealTiles(to, visibility, territorySummary);
    const scoutValue = scoreAiScoutRevealValue(actor, to, visibility, territorySummary);
    const scoutScore = scoutValue + scoutRevealCount * 18 + (from.ownershipState === "SETTLED" ? 8 : 0);
    if (settledTiles <= 2 && scoutRevealCount > 0) openingScoutAvailable = true;
    if (scoutRevealCount > 0) scoutExpandAvailable = true;
    const economic = isAiVisibleEconomicFrontierTile(actor, to, territorySummary);
    const economicSignal = aiEconomicFrontierSignal(actor, to, visibility, territorySummary.foodPressure, territorySummary);
    if (economic) economicExpandAvailable = true;
    const islandSignal = aiIslandFootprintSignal(actor, to, territorySummary);
    if (!islandExpandAvailable && islandSignal > 0) islandExpandAvailable = true;
    const scaffold =
      cachedSupportedTownKeysForTile(actor.id, tileKey, territorySummary).length > 0 ||
      (ownedNeighbors >= 3 && exposedSides <= 1) ||
      townsByTile.has(tileKey) ||
      Boolean(to.resource) ||
      docksByTile.has(tileKey);
    const scaffoldScore =
      (cachedSupportedTownKeysForTile(actor.id, tileKey, territorySummary).length > 0 ? 160 : 0) +
      (townsByTile.has(tileKey) ? 180 : 0) +
      (to.resource ? 120 + baseTileValue(to.resource) : 0) +
      (docksByTile.has(tileKey) ? 130 : 0) +
      ownedNeighbors * 20 -
      exposedSides * 16 +
      (from.ownershipState === "SETTLED" ? 8 : 0);
    if (economic) {
      frontierOpportunityEconomic += 1;
      const score = 260 + economicSignal + (from.ownershipState === "SETTLED" ? 6 : 0);
      if (!bestEconomicExpand || score > bestEconomicExpand.score) bestEconomicExpand = { score, from, to };
    } else if (scaffold) {
      scaffoldExpandAvailable = true;
      frontierOpportunityScaffold += 1;
      if (!bestScaffoldExpand || scaffoldScore > bestScaffoldExpand.score) bestScaffoldExpand = { score: scaffoldScore, from, to };
    } else if (scoutRevealCount > 0 || !visibleInSnapshot(visibility, to.x, to.y)) {
      frontierOpportunityScout += 1;
      if (!bestScoutExpand || scoutScore > bestScoutExpand.score) bestScoutExpand = { score: scoutScore, from, to };
    } else {
      frontierOpportunityWaste += 1;
    }

    if (islandSignal > 0) {
      const score =
        islandSignal + Math.round(economicSignal * 0.55) + Math.round(scoutScore * 0.45) + 120 + (from.ownershipState === "SETTLED" ? 12 : 0);
      if (!bestIslandExpand || score > bestIslandExpand.score) bestIslandExpand = { score, from, to };
    }

    const frontierClass: AiNeutralFrontierClass = economic
      ? "economic"
      : scaffold
        ? "scaffold"
        : scoutRevealCount > 0 || !visibleInSnapshot(visibility, to.x, to.y)
          ? "scout"
          : "waste";
    const anyNeutralBase =
      frontierClass === "economic"
        ? 260 + economicSignal
        : frontierClass === "scaffold"
          ? 180 + scaffoldScore
          : frontierClass === "scout"
            ? 120 + scoutScore
            : 50 + scoutScore + Math.max(0, scaffoldScore / 4);
    const anyNeutralScore = anyNeutralBase + islandSignal + (from.ownershipState === "SETTLED" ? 6 : 0);
    if (!bestAnyNeutralExpand || anyNeutralScore > bestAnyNeutralExpand.score) {
      bestAnyNeutralExpand = { score: anyNeutralScore, from, to };
    }
  }

  const summary: AiFrontierPlanningSummary = {
    neutralExpandAvailable,
    openingScoutAvailable,
    scoutExpandAvailable,
    economicExpandAvailable,
    scaffoldExpandAvailable,
    islandExpandAvailable,
    frontierOpportunityEconomic,
    frontierOpportunityScout,
    frontierOpportunityScaffold,
    frontierOpportunityWaste,
    ...(bestEconomicExpand ? { bestEconomicExpand: { from: bestEconomicExpand.from, to: bestEconomicExpand.to } } : {}),
    ...(bestScoutExpand ? { bestScoutExpand: { from: bestScoutExpand.from, to: bestScoutExpand.to } } : {}),
    ...(bestScaffoldExpand ? { bestScaffoldExpand: { from: bestScaffoldExpand.from, to: bestScaffoldExpand.to } } : {}),
    ...(bestIslandExpand ? { bestIslandExpand: { from: bestIslandExpand.from, to: bestIslandExpand.to } } : {}),
    ...(bestAnyNeutralExpand ? { bestAnyNeutralExpand: { from: bestAnyNeutralExpand.from, to: bestAnyNeutralExpand.to } } : {})
  };
  territorySummary.frontierPlanningSummary = summary;
  return summary;
};

const estimateAiSettlementAvailabilityProfile = (
  actor: Player,
  territorySummary: AiTerritorySummary,
  focusIslandId: number | undefined,
  economyWeak: boolean,
  foodCoverageLow: boolean
): AiSettlementAvailabilityProfile => {
  const { islandIdByTile } = islandMap();
  let settlementAvailable = false;
  let townSupportSettlementAvailable = false;
  let islandSettlementAvailable = false;

  for (const tile of territorySummary.frontierTiles) {
    const tileKey = key(tile.x, tile.y);
    if (tileHasPendingSettlement(tileKey)) continue;

    const hasTownSupport = cachedSupportedTownKeysForTile(actor.id, tileKey, territorySummary).length > 0;
    const hasIntrinsicEconomicValue = townsByTile.has(tileKey) || Boolean(tile.resource) || docksByTile.has(tileKey);
    const isFoodTile = tile.resource === "FARM" || tile.resource === "FISH";

    if (!townSupportSettlementAvailable && hasTownSupport) townSupportSettlementAvailable = true;

    if (!settlementAvailable) {
      if (hasIntrinsicEconomicValue || hasTownSupport || isFoodTile || (!economyWeak && !foodCoverageLow && !territorySummary.underThreat)) {
        settlementAvailable = true;
      }
    }

    if (!islandSettlementAvailable) {
      const islandId = islandIdByTile.get(tileKey);
      const matchesFocus = focusIslandId !== undefined ? islandId === focusIslandId : islandId !== undefined;
      if (matchesFocus && (hasIntrinsicEconomicValue || hasTownSupport || isFoodTile || (!economyWeak && !foodCoverageLow && !territorySummary.underThreat))) {
        islandSettlementAvailable = true;
      }
    }

    if (settlementAvailable && townSupportSettlementAvailable && islandSettlementAvailable) break;
  }

  return {
    settlementAvailable,
    townSupportSettlementAvailable,
    islandSettlementAvailable
  };
};

const hasAiFocusedIslandExpand = (
  territorySummary: AiTerritorySummary,
  focusIslandId: number | undefined,
  undercoveredIslandCount: number
): boolean => {
  if (undercoveredIslandCount <= 0) return false;
  const { islandIdByTile } = islandMap();
  for (const { to } of territorySummary.expandCandidates) {
    if (to.terrain !== "LAND" || to.ownerId) continue;
    const islandId = islandIdByTile.get(key(to.x, to.y));
    if (focusIslandId === undefined ? islandId !== undefined : islandId === focusIslandId) return true;
  }
  return false;
};

const estimateAiFrontierAvailabilityProfile = (
  actor: Player,
  territorySummary: AiTerritorySummary
): AiFrontierAvailabilityProfile => {
  let frontierOpportunityScaffold = 0;
  let frontierOpportunityScout = 0;

  for (const { to } of territorySummary.expandCandidates) {
    if (to.terrain !== "LAND" || to.ownerId) continue;
    const tileKey = key(to.x, to.y);
    if (townsByTile.has(tileKey) || docksByTile.has(tileKey) || Boolean(to.resource)) continue;
    const adjacency = cachedScoutAdjacencyMetrics(actor, to, territorySummary);
    const ownedNeighbors = adjacency.ownedNeighbors;
    const exposedSides = adjacency.exposedSides;
    if (ownedNeighbors >= 3 && exposedSides <= 1) {
      frontierOpportunityScaffold += 1;
    } else if (countAiScoutRevealTiles(to, territorySummary.visibility, territorySummary) > 0 || adjacency.coastlineDiscoveryValue > 0) {
      frontierOpportunityScout += 1;
    }
  }

  const neutralExpandAvailable = territorySummary.neutralLandExpandCount > 0;
  const economicExpandAvailable = territorySummary.neutralEconomicExpandCount > 0;
  const frontierOpportunityEconomic = territorySummary.neutralEconomicExpandCount;
  const frontierOpportunityWaste = Math.max(
    0,
    territorySummary.neutralLandExpandCount - frontierOpportunityEconomic - frontierOpportunityScout - frontierOpportunityScaffold
  );

  return {
    neutralExpandAvailable,
    openingScoutAvailable: territorySummary.settledTileCount <= 2 && frontierOpportunityScout > 0,
    scoutExpandAvailable: frontierOpportunityScout > 0,
    economicExpandAvailable,
    scaffoldExpandAvailable: frontierOpportunityScaffold > 0,
    frontierOpportunityEconomic,
    frontierOpportunityScout,
    frontierOpportunityScaffold,
    frontierOpportunityWaste
  };
};

const bestAiTownSupportSettlementTile = (
  actor: Player,
  victoryPath?: AiSeasonVictoryPathId,
  territorySummary = collectAiTerritorySummary(actor)
): Tile | undefined => {
  const { foodCoverageLow, economyWeak } = aiEconomyPriorityState(actor, territorySummary);
  const summary = frontierSettlementSummaryForPlayer(
    actor,
    victoryPath,
    territorySummary,
    undefined,
    economyWeak,
    foodCoverageLow
  );
  return cachedAiTileFromKey(summary.bestTownSupportSettlementKey);
};

const bestAiAnyNeutralExpand = (
  actor: Player,
  victoryPath?: AiSeasonVictoryPathId,
  territorySummary = collectAiTerritorySummary(actor)
): { from: Tile; to: Tile } | undefined => {
  let best: { score: number; from: Tile; to: Tile } | undefined;
  for (const { from, to } of territorySummary.expandCandidates) {
    if (to.terrain !== "LAND" || to.ownerId) continue;
    const frontierClass = classifyAiNeutralFrontierOpportunity(actor, from, to, victoryPath, territorySummary);
    const economicSignal = aiEconomicFrontierSignal(actor, to, territorySummary.visibility, territorySummary.foodPressure, territorySummary);
    const scoutScore = scoreAiScoutExpandCandidate(actor, from, to, territorySummary.visibility, territorySummary);
    const settlementEvaluation = evaluateAiSettlementCandidate(actor, to, victoryPath, new Set<TileKey>([key(to.x, to.y)]), territorySummary);
    const islandSignal = victoryPath === "SETTLED_TERRITORY" ? aiIslandFootprintSignal(actor, to, territorySummary) : 0;
    let score =
      frontierClass === "economic"
        ? 260 + economicSignal
        : frontierClass === "scaffold"
          ? 180 + settlementEvaluation.score
          : frontierClass === "scout"
            ? 120 + scoutScore
            : 50 + scoutScore + Math.max(0, settlementEvaluation.score);
    score += islandSignal;
    if (from.ownershipState === "SETTLED") score += 6;
    if (!best || score > best.score) best = { score, from, to };
  }
  return best;
};

const bestAiEnemyPressureAttack = (
  actor: Player,
  victoryPath?: AiSeasonVictoryPathId,
  territorySummary = collectAiTerritorySummary(actor)
): { from: Tile; to: Tile; score: number } | undefined => {
  let best: { from: Tile; to: Tile; score: number } | undefined;
  for (const { from, to } of territorySummary.attackCandidates) {
    if (
      to.terrain !== "LAND" ||
      !to.ownerId ||
      to.ownerId === actor.id ||
      to.ownerId === BARBARIAN_OWNER_ID ||
      actor.allies.has(to.ownerId)
    ) {
      continue;
    }
    const signal = aiEnemyPressureSignal(actor, to, territorySummary.visibility, territorySummary);
    if (signal <= 0) continue;
    let score = signal;
    const defender = players.get(to.ownerId);
    const attackBase = 10 * actor.mods.attack * activeAttackBuffMult(actor.id) * attackMultiplierForTarget(actor.id, to);
    const defenseBase =
      10 *
      (defender?.mods.defense ?? 1) *
      (defender ? playerDefensiveness(defender) : 1) *
      (defender ? fortDefenseMultAt(defender.id, key(to.x, to.y)) : 1) *
      (docksByTile.has(key(to.x, to.y)) ? DOCK_DEFENSE_MULT : 1) *
      (defender ? settledDefenseMultiplierForTarget(defender.id, to) : 1) *
      ownershipDefenseMultiplierForTarget(defender?.id, to);
    const winChance = combatWinChance(attackBase, defenseBase);
    score += Math.round(winChance * 220);
    if (to.ownershipState === "FRONTIER") score += 120;
    if (victoryPath === "TOWN_CONTROL") score += 45;
    if (victoryPath === "ECONOMIC_HEGEMONY") score += 20;
    if (!best || score > best.score) best = { from, to, score };
  }
  return best && best.score >= 80 ? best : undefined;
};

const aiFrontierOpportunityCounts = (
  actor: Player,
  victoryPath?: AiSeasonVictoryPathId,
  territorySummary = collectAiTerritorySummary(actor)
): AiFrontierOpportunityCounts => {
  const counts: AiFrontierOpportunityCounts = {
    economic: 0,
    scout: 0,
    scaffold: 0,
    waste: 0
  };
  for (const { from, to } of territorySummary.expandCandidates) {
    if (to.terrain !== "LAND" || to.ownerId) continue;
    const frontierClass = classifyAiNeutralFrontierOpportunity(actor, from, to, victoryPath, territorySummary);
    counts[frontierClass] += 1;
  }
  return counts;
};

const estimateAiPressureAttackProfile = (
  actor: Player,
  territorySummary: Pick<AiTerritorySummary, "attackCandidates" | "visibility">
): { score: number; threatensCore: boolean } => {
  let bestScore = 0;
  let threatensCore = false;
  for (const { to } of territorySummary.attackCandidates) {
    if (
      to.terrain !== "LAND" ||
      !to.ownerId ||
      to.ownerId === actor.id ||
      to.ownerId === BARBARIAN_OWNER_ID ||
      actor.allies.has(to.ownerId)
    ) {
      continue;
    }
    const tk = key(to.x, to.y);
    let score = 0;
    const ownedAdjacency = adjacentNeighborCores(to.x, to.y).reduce((count, neighbor) => count + (neighbor.ownerId === actor.id ? 1 : 0), 0);
    const settledAdjacency = adjacentNeighborCores(to.x, to.y).reduce(
      (count, neighbor) => count + (neighbor.ownerId === actor.id && neighbor.ownershipState === "SETTLED" ? 1 : 0),
      0
    );
    score += ownedAdjacency * 95 + settledAdjacency * 70;
    if (to.ownershipState === "FRONTIER") score += 220;
    if (visibleInSnapshot(territorySummary.visibility, to.x, to.y)) {
      if (townsByTile.has(tk)) score += 160;
      if (to.resource) score += 100 + baseTileValue(to.resource);
      if (docksByTile.has(tk)) score += 130;
    }
    if (score > bestScore) bestScore = score;
    if (!threatensCore) {
      for (const neighbor of adjacentNeighborCores(to.x, to.y)) {
        if (neighbor.terrain !== "LAND" || neighbor.ownerId !== actor.id) continue;
        const neighborKey = key(neighbor.x, neighbor.y);
        if (townsByTile.has(neighborKey) || docksByTile.has(neighborKey) || isOwnedTownSupportRingTile(actor.id, aiTileLiteAt(neighbor.x, neighbor.y))) {
          threatensCore = true;
          break;
        }
      }
    }
  }
  return {
    score: bestScore,
    threatensCore
  };
};

const qualifiesAiSettlementAvailability = (
  actor: Player,
  tile: Tile,
  victoryPath: AiSeasonVictoryPathId | undefined,
  territorySummary: AiTerritorySummary,
  economyWeak: boolean,
  foodCoverageLow: boolean
): boolean => {
  const tileKey = key(tile.x, tile.y);
  const evaluation = evaluateAiSettlementCandidate(actor, tile, victoryPath, undefined, territorySummary);
  if (!evaluation.isEconomicallyInteresting && !evaluation.isStrategicallyInteresting) return false;
  const hasIntrinsicEconomicValue = townsByTile.has(tileKey) || Boolean(tile.resource) || docksByTile.has(tileKey);
  if (
    (economyWeak || territorySummary.underThreat || foodCoverageLow) &&
    !hasIntrinsicEconomicValue &&
    tile.resource !== "FARM" &&
    tile.resource !== "FISH" &&
    evaluation.townSupportSignal <= 0 &&
    !(victoryPath === "SETTLED_TERRITORY" && evaluation.islandFootprintSignal >= 180 && !foodCoverageLow && !economyWeak)
  ) {
    return false;
  }
  const minScore =
    hasIntrinsicEconomicValue || (victoryPath === "SETTLED_TERRITORY" && evaluation.islandFootprintSignal >= 180)
      ? 20
      : victoryPath === "SETTLED_TERRITORY"
        ? 32
        : 55;
  return evaluation.score >= minScore;
};

const qualifiesAiTownSupportSettlementAvailability = (
  actor: Player,
  tile: Tile,
  territorySummary: AiTerritorySummary
): boolean => {
  const evaluation = evaluateAiSettlementCandidate(actor, tile, undefined, undefined, territorySummary);
  if (evaluation.townSupportSignal <= 0) return false;
  const score = evaluation.townSupportSignal * 2 + evaluation.score;
  return score >= 160;
};

const qualifiesAiIslandSettlementAvailability = (
  actor: Player,
  tile: Tile,
  territorySummary: AiTerritorySummary,
  focusIslandId: number | undefined
): boolean => {
  const { islandIdByTile } = islandMap();
  const islandId = islandIdByTile.get(key(tile.x, tile.y));
  if (focusIslandId !== undefined && islandId !== focusIslandId) return false;
  const evaluation = evaluateAiSettlementCandidate(actor, tile, "SETTLED_TERRITORY", undefined, territorySummary);
  if (evaluation.islandFootprintSignal <= 0) return false;
  const score = evaluation.score + evaluation.islandFootprintSignal + (evaluation.townSupportSignal > 0 ? evaluation.townSupportSignal * 2 : 0) + 140;
  return score >= 120;
};

const buildAiPlanningStaticCache = (
  actor: Player,
  territorySummary: AiTerritorySummary
): AiPlanningStaticCache => {
  const structureCandidateCount = territorySummary.structureCandidateTiles.length;
  let settlementAvailable = false;
  let supportSettlementAvailable = false;
  let islandSettlementAvailable = false;
  let fortAvailable = false;
  let fortProtectsCore = false;
  let fortIsDockChokePoint = false;
  let economicBuildAvailable = false;
  let undercoveredIslandCount = 0;
  let weakestIslandRatio = 1;

  const islandProgress = cachedAiIslandProgress(actor, territorySummary);
  undercoveredIslandCount = islandProgress.undercoveredIslandCount;
  const focusIslandId = bestAiIslandFocusTargetId(actor, territorySummary);
  if (focusIslandId !== undefined) {
    const focusLand = islandProgress.landCounts.get(focusIslandId) ?? 0;
    weakestIslandRatio = focusLand > 0 ? (islandProgress.settledCounts.get(focusIslandId) ?? 0) / focusLand : islandProgress.weakestRatio;
  } else {
    weakestIslandRatio = islandProgress.weakestRatio;
  }
  const { economyWeak, foodCoverageLow } = aiEconomyPriorityState(actor, territorySummary);
  const settlementAvailability = estimateAiSettlementAvailabilityProfile(
    actor,
    territorySummary,
    focusIslandId,
    economyWeak,
    foodCoverageLow
  );
  settlementAvailable = settlementAvailability.settlementAvailable;
  supportSettlementAvailable = settlementAvailability.townSupportSettlementAvailable;
  islandSettlementAvailable = settlementAvailability.islandSettlementAvailable;
  const frontierAvailability = estimateAiFrontierAvailabilityProfile(actor, territorySummary);

  if (structureCandidateCount > 0) {
    const playerEffects = getPlayerEffectsForPlayer(actor.id);
    const stock = getOrInitStrategicStocks(actor.id);
    const canPlaceGranary =
      playerEffects.unlockGranary && actor.points >= GRANARY_BUILD_GOLD_COST && (stock.FOOD ?? 0) >= GRANARY_BUILD_FOOD_COST;
    const canPlaceFarmstead =
      actor.techIds.has("agriculture") && actor.points >= FARMSTEAD_BUILD_GOLD_COST && (stock.FOOD ?? 0) >= FARMSTEAD_BUILD_FOOD_COST;
    const canPlaceCamp =
      actor.techIds.has("leatherworking") && actor.points >= CAMP_BUILD_GOLD_COST && (stock.SUPPLY ?? 0) >= CAMP_BUILD_SUPPLY_COST;
    const canPlaceMine =
      actor.techIds.has("mining") && actor.points >= MINE_BUILD_GOLD_COST;
    const canPlaceMarket =
      actor.techIds.has("trade") && actor.points >= MARKET_BUILD_GOLD_COST && (stock.CRYSTAL ?? 0) >= MARKET_BUILD_CRYSTAL_COST;

    for (const tile of territorySummary.structureCandidateTiles) {
      const tk = key(tile.x, tile.y);
      if (!fortAvailable && !fortsByTile.has(tk) && (docksByTile.has(tk) || territorySummary.borderSettledTileKeys.has(tk))) {
        fortAvailable = true;
        fortProtectsCore = townsByTile.has(tk) || docksByTile.has(tk) || isOwnedTownSupportRingTile(actor.id, tile);
        if (docksByTile.has(tk)) {
          const adjacentLandCount = adjacentNeighborCores(tile.x, tile.y).reduce((count, neighbor) => count + (neighbor.terrain === "LAND" ? 1 : 0), 0);
          fortIsDockChokePoint = adjacentLandCount <= 3;
        }
      }
      if (economicBuildAvailable || tile.economicStructure) continue;
      if ((tile.resource === "FARM" || tile.resource === "FISH") && (canPlaceFarmstead || canPlaceGranary)) {
        economicBuildAvailable = true;
      } else if ((tile.resource === "FUR" || tile.resource === "WOOD") && (canPlaceCamp || canPlaceMarket)) {
        economicBuildAvailable = true;
      } else if (
        (tile.resource === "IRON" || tile.resource === "GEMS") &&
        (canPlaceMarket || (canPlaceMine && ((tile.resource === "IRON" ? stock.IRON : stock.CRYSTAL) ?? 0) >= MINE_BUILD_RESOURCE_COST))
      ) {
        economicBuildAvailable = true;
      } else if (townsByTile.has(tk) && (canPlaceMarket || canPlaceGranary)) {
        economicBuildAvailable = true;
      }
    }
  }

  const pressureAttackProfile = estimateAiPressureAttackProfile(actor, territorySummary);

  return {
    version: aiTerritoryVersionForPlayer(actor.id),
    openingScoutAvailable: frontierAvailability.openingScoutAvailable,
    neutralExpandAvailable: frontierAvailability.neutralExpandAvailable,
    economicExpandAvailable: frontierAvailability.economicExpandAvailable,
    scoutExpandAvailable: frontierAvailability.scoutExpandAvailable,
    scaffoldExpandAvailable: frontierAvailability.scaffoldExpandAvailable,
    barbarianAttackAvailable: territorySummary.barbarianAttackAvailable,
    enemyAttackAvailable: territorySummary.enemyAttackAvailable,
    pressureAttackScore: pressureAttackProfile.score,
    pressureThreatensCore: pressureAttackProfile.threatensCore,
    settlementAvailable,
    townSupportSettlementAvailable: supportSettlementAvailable,
    islandExpandAvailable: hasAiFocusedIslandExpand(territorySummary, focusIslandId, undercoveredIslandCount),
    islandSettlementAvailable,
    weakestIslandRatio,
    undercoveredIslandCount,
    fortAvailable,
    fortProtectsCore,
    fortIsDockChokePoint,
    economicBuildAvailable,
    frontierOpportunityEconomic: frontierAvailability.frontierOpportunityEconomic,
    frontierOpportunityScout: frontierAvailability.frontierOpportunityScout,
    frontierOpportunityScaffold: frontierAvailability.frontierOpportunityScaffold,
    frontierOpportunityWaste: frontierAvailability.frontierOpportunityWaste
  };
};

const cachedAiPlanningStaticForPlayer = (actor: Player, territorySummary: AiTerritorySummary): AiPlanningStaticCache => {
  const version = aiTerritoryVersionForPlayer(actor.id);
  const cached = cachedAiPlanningStaticByPlayer.get(actor.id);
  if (cached && cached.version === version) return cached;
  const startedAt = now();
  const rebuilt = buildAiPlanningStaticCache(actor, territorySummary);
  const elapsedMs = now() - startedAt;
  if (elapsedMs >= 150) {
    runtimeState.appRef?.log.warn(
      {
        playerId: actor.id,
        frontierTiles: territorySummary.frontierTileCount,
        expandCandidates: territorySummary.expandCandidates.length,
        attackCandidates: territorySummary.attackCandidates.length,
        structureCandidates: territorySummary.structureCandidateTiles.length,
        elapsedMs
      },
      "slow ai planning static cache"
    );
  }
  cachedAiPlanningStaticByPlayer.set(actor.id, rebuilt);
  return rebuilt;
};

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

  let frontPosture: AiFrontPosture = "BREAK";
  if (!planningStatic.pressureThreatensCore && planningStatic.pressureAttackScore > 0 && canPivotToGrowth) {
    frontPosture =
      analysis.underThreat && (analysis.foodCoverageLow || analysis.economyWeak) && primaryVictoryPath !== "TOWN_CONTROL" ? "TRUCE" : "CONTAIN";
  }
  if (planningStatic.pressureThreatensCore || (primaryVictoryPath === "TOWN_CONTROL" && planningStatic.pressureAttackScore >= 160)) {
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
    goldHealthy: canAffordGoldCost(actor.points, SETTLE_COST + FRONTIER_ACTION_GOLD_COST)
  };
};

const aiSettlementSelectorCacheForPlayer = (actor: Player): AiSettlementSelectorCache => {
  const version = aiTerritoryVersionForPlayer(actor.id);
  const pendingSettlementCount = pendingSettlementCountForPlayer(actor.id);
  const cached = cachedAiSettlementSelectorByPlayer.get(actor.id);
  if (cached && cached.version === version && cached.pendingSettlementCount === pendingSettlementCount) return cached;
  const rebuilt: AiSettlementSelectorCache = {
    version,
    pendingSettlementCount,
    settlementByVictoryPath: new Map<string, TileKey | null>(),
    townSupportSettlementByVictoryPath: new Map<string, TileKey | null>(),
    islandSettlementByVictoryPath: new Map<string, TileKey | null>(),
    frontierSummaryByKey: new Map<string, AiFrontierSettlementSummary>()
  };
  cachedAiSettlementSelectorByPlayer.set(actor.id, rebuilt);
  return rebuilt;
};

const cachedAiTileFromKey = (tileKey: TileKey | null | undefined): Tile | undefined =>
  tileKey ? aiTileLiteAt(...parseKey(tileKey)) : undefined;

const aiFrontierCandidateFromExecuteCandidate = (
  candidate: AiExecuteCandidate | null | undefined
): { from: Tile; to: Tile } | undefined => {
  if (!candidate || candidate.kind !== "frontier") return undefined;
  const from = cachedAiTileFromKey(candidate.originTileKey);
  const to = cachedAiTileFromKey(candidate.targetTileKey);
  return from && to ? { from, to } : undefined;
};

const aiTileCandidateFromExecuteCandidate = (
  candidate: AiExecuteCandidate | null | undefined
): Tile | undefined => {
  if (!candidate || candidate.kind !== "tile") return undefined;
  return cachedAiTileFromKey(candidate.tileKey);
};

const frontierSettlementSummaryCacheKey = (
  victoryPath: AiSeasonVictoryPathId | undefined,
  focusIslandId: number | undefined,
  economyWeak: boolean,
  foodCoverageLow: boolean
): string => `${victoryPath ?? "none"}|${focusIslandId ?? -1}|${economyWeak ? 1 : 0}|${foodCoverageLow ? 1 : 0}`;

const frontierSettlementSummaryForPlayer = (
  actor: Player,
  victoryPath: AiSeasonVictoryPathId | undefined,
  territorySummary: AiTerritorySummary,
  focusIslandId: number | undefined,
  economyWeak: boolean,
  foodCoverageLow: boolean
): AiFrontierSettlementSummary => {
  const selectorCache = aiSettlementSelectorCacheForPlayer(actor);
  const cacheKey = frontierSettlementSummaryCacheKey(victoryPath, focusIslandId, economyWeak, foodCoverageLow);
  const cached = selectorCache.frontierSummaryByKey.get(cacheKey);
  if (cached) return cached;
  const startedAt = now();

  const { islandIdByTile } = islandMap();
  let bestSettlement:
    | (AiSettlementCandidateEvaluation & {
        tileKey: TileKey;
        priorityScore: number;
      })
    | undefined;
  let bestTownSupport:
    | (AiSettlementCandidateEvaluation & {
        tileKey: TileKey;
        totalScore: number;
      })
    | undefined;
  let bestIsland:
    | (AiSettlementCandidateEvaluation & {
        tileKey: TileKey;
        totalScore: number;
      })
    | undefined;

  for (const tile of territorySummary.frontierTiles) {
    const tileKey = key(tile.x, tile.y);
    if (tileHasPendingSettlement(tileKey)) continue;

    const evaluation = evaluateAiSettlementCandidate(actor, tile, victoryPath, undefined, territorySummary);
    const hasIntrinsicEconomicValue = townsByTile.has(tileKey) || Boolean(tile.resource) || docksByTile.has(tileKey);
    const settlementPriorityScore =
      evaluation.score +
      (hasIntrinsicEconomicValue ? 480 : 0) +
      (evaluation.townSupportSignal > 0 ? 980 + evaluation.townSupportSignal * 2 : 0) +
      (victoryPath === "SETTLED_TERRITORY" ? evaluation.islandFootprintSignal : 0);

    if (
      (evaluation.isEconomicallyInteresting || evaluation.isStrategicallyInteresting) &&
      !(
        (economyWeak || territorySummary.underThreat || foodCoverageLow) &&
        !hasIntrinsicEconomicValue &&
        tile.resource !== "FARM" &&
        tile.resource !== "FISH" &&
        evaluation.townSupportSignal <= 0 &&
        !(victoryPath === "SETTLED_TERRITORY" && evaluation.islandFootprintSignal >= 180 && !foodCoverageLow && !economyWeak)
      )
    ) {
      const minScore =
        hasIntrinsicEconomicValue || (victoryPath === "SETTLED_TERRITORY" && evaluation.islandFootprintSignal >= 180)
          ? 20
          : victoryPath === "SETTLED_TERRITORY"
            ? 32
            : 55;
      if (
        evaluation.score >= minScore &&
        (!bestSettlement ||
          settlementPriorityScore > bestSettlement.priorityScore ||
          (settlementPriorityScore === bestSettlement.priorityScore && evaluation.score > bestSettlement.score))
      ) {
        bestSettlement = {
          ...evaluation,
          tileKey,
          priorityScore: settlementPriorityScore
        };
      }
    }

    if (evaluation.townSupportSignal > 0) {
      const townSupportScore = evaluation.townSupportSignal * 2 + evaluation.score;
      if (townSupportScore >= 160 && (!bestTownSupport || townSupportScore > bestTownSupport.totalScore)) {
        bestTownSupport = {
          ...evaluation,
          tileKey,
          totalScore: townSupportScore
        };
      }
    }

    const islandId = islandIdByTile.get(tileKey);
    if (focusIslandId !== undefined && islandId !== focusIslandId) continue;
    const islandEvaluation =
      victoryPath === "SETTLED_TERRITORY"
        ? evaluation
        : evaluateAiSettlementCandidate(actor, tile, "SETTLED_TERRITORY", undefined, territorySummary);
    if (islandEvaluation.islandFootprintSignal <= 0) continue;
    const islandScore =
      islandEvaluation.score +
      islandEvaluation.islandFootprintSignal +
      (islandEvaluation.townSupportSignal > 0 ? islandEvaluation.townSupportSignal * 2 : 0) +
      140;
    if (islandScore >= 120 && (!bestIsland || islandScore > bestIsland.totalScore)) {
      bestIsland = {
        ...islandEvaluation,
        tileKey,
        totalScore: islandScore
      };
    }
  }

  const summary: AiFrontierSettlementSummary = {
    bestSettlementKey: bestSettlement?.tileKey ?? null,
    settlementAvailable: Boolean(bestSettlement),
    bestTownSupportSettlementKey: bestTownSupport?.tileKey ?? null,
    townSupportSettlementAvailable: Boolean(bestTownSupport),
    bestIslandSettlementKey: bestIsland?.tileKey ?? null,
    islandSettlementAvailable: Boolean(bestIsland)
  };

  selectorCache.frontierSummaryByKey.set(cacheKey, summary);
  selectorCache.settlementByVictoryPath.set(victoryPath ?? "", summary.bestSettlementKey);
  selectorCache.townSupportSettlementByVictoryPath.set(victoryPath ?? "", summary.bestTownSupportSettlementKey);
  if (focusIslandId !== undefined || victoryPath === "SETTLED_TERRITORY") {
    selectorCache.islandSettlementByVictoryPath.set(victoryPath ?? "", summary.bestIslandSettlementKey);
  }
  const elapsedMs = now() - startedAt;
  if (elapsedMs >= 150) {
    runtimeState.appRef?.log.warn(
      {
        playerId: actor.id,
        victoryPath: victoryPath ?? "none",
        frontierTiles: territorySummary.frontierTileCount,
        focusIslandId,
        elapsedMs
      },
      "slow ai frontier settlement summary"
    );
  }
  return summary;
};

const bestAiSettlementTile = (
  actor: Player,
  victoryPath?: AiSeasonVictoryPathId,
  territorySummary = collectAiTerritorySummary(actor)
): Tile | undefined => {
  const { foodCoverageLow, economyWeak } = aiEconomyPriorityState(actor, territorySummary);
  const summary = frontierSettlementSummaryForPlayer(
    actor,
    victoryPath,
    territorySummary,
    undefined,
    economyWeak,
    foodCoverageLow
  );
  return cachedAiTileFromKey(summary.bestSettlementKey);
};

const bestAiIslandSettlementTile = (
  actor: Player,
  territorySummary = collectAiTerritorySummary(actor)
): Tile | undefined => {
  const focusIslandId = bestAiIslandFocusTargetId(actor, territorySummary);
  const { foodCoverageLow, economyWeak } = aiEconomyPriorityState(actor, territorySummary);
  const summary = frontierSettlementSummaryForPlayer(
    actor,
    "SETTLED_TERRITORY",
    territorySummary,
    focusIslandId,
    economyWeak,
    foodCoverageLow
  );
  return cachedAiTileFromKey(summary.bestIslandSettlementKey);
};

const bestAiFortTile = (actor: Player, territorySummary = collectAiTerritorySummary(actor)): Tile | undefined => {
  let best: { tile: Tile; score: number } | undefined;
  for (const tile of territorySummary.structureCandidateTiles) {
    const tk = key(tile.x, tile.y);
    if (fortsByTile.has(tk)) continue;
    if (!docksByTile.has(tk) && !isBorderTile(tile.x, tile.y, actor.id)) continue;
    let score = 0;
    if (townsByTile.has(tk)) score += 140;
    if (docksByTile.has(tk)) score += 120;
    if (tile.resource) score += baseTileValue(tile.resource) * 2;
    const adjacentLandCount = adjacentNeighborCores(tile.x, tile.y).reduce((count, neighbor) => count + (neighbor.terrain === "LAND" ? 1 : 0), 0);
    const isChokePoint = adjacentLandCount <= 3;
    if (isChokePoint) score += 70;
    if (docksByTile.has(tk) && isChokePoint) score += 110;
    const hostileAdjacency = adjacentNeighborCores(tile.x, tile.y).reduce((count, neighbor) => {
      if (neighbor.terrain !== "LAND") return count;
      if (!neighbor.ownerId || neighbor.ownerId === actor.id || actor.allies.has(neighbor.ownerId)) return count;
      return count + 1;
    }, 0);
    score += hostileAdjacency * 24;
    const neutralAdjacency = adjacentNeighborCores(tile.x, tile.y).reduce((count, neighbor) => {
      if (neighbor.terrain !== "LAND") return count;
      if (neighbor.ownerId) return count;
      return count + 1;
    }, 0);
    score += neutralAdjacency * (docksByTile.has(tk) ? 10 : 4);
    if (!best || score > best.score) best = { tile, score };
  }
  return best && best.score >= 70 ? best.tile : undefined;
};

const bestAiEconomicStructure = (
  actor: Player,
  territorySummary = collectAiTerritorySummary(actor)
): { tile: Tile; structureType: EconomicStructureType } | undefined => {
  const stock = getOrInitStrategicStocks(actor.id);
  const { foodCoverageLow } = aiEconomyPriorityState(actor, territorySummary);
  const economicVictoryBias = aiVictoryPathByPlayer.get(actor.id) === "ECONOMIC_HEGEMONY";
  let best: { score: number; tile: Tile; structureType: EconomicStructureType } | undefined;
  const consider = (score: number, tile: Tile, structureType: EconomicStructureType): void => {
    if (!best || score > best.score) best = { score, tile, structureType };
  };
  for (const tile of territorySummary.structureCandidateTiles) {
    const tileKey = key(tile.x, tile.y);
    if (tile.economicStructure) continue;
    if (tile.resource === "FARM" || tile.resource === "FISH") {
      consider(foodCoverageLow ? 190 : 60, tile, "FARMSTEAD");
      consider(foodCoverageLow ? 140 : 28, tile, "GRANARY");
    } else if (tile.resource === "FUR" || tile.resource === "WOOD") {
      consider(economicVictoryBias ? 52 : 40, tile, "CAMP");
      consider(economicVictoryBias ? 36 : 20, tile, "MARKET");
    } else if (tile.resource === "IRON" || tile.resource === "GEMS") {
      consider(economicVictoryBias ? 58 : 45, tile, "MINE");
      consider(economicVictoryBias ? 34 : 22, tile, "MARKET");
    } else if (townsByTile.has(tileKey)) {
      consider(foodCoverageLow ? 160 : economicVictoryBias ? 54 : 35, tile, foodCoverageLow ? "GRANARY" : "MARKET");
      consider(foodCoverageLow ? 132 : 22, tile, "GRANARY");
      consider(economicVictoryBias ? 44 : 20, tile, "MARKET");
    }
  }
  if (best) {
    const placed = canPlaceEconomicStructure(actor, best.tile, best.structureType);
    if (!placed.ok) best = undefined;
    else if (best.structureType === "FARMSTEAD" && (!actor.techIds.has("agriculture") || actor.points < FARMSTEAD_BUILD_GOLD_COST || (stock.FOOD ?? 0) < FARMSTEAD_BUILD_FOOD_COST)) best = undefined;
    else if (best.structureType === "CAMP" && (!actor.techIds.has("leatherworking") || actor.points < CAMP_BUILD_GOLD_COST || (stock.SUPPLY ?? 0) < CAMP_BUILD_SUPPLY_COST)) best = undefined;
    else if (
      best.structureType === "MINE" &&
      (!actor.techIds.has("mining") || actor.points < MINE_BUILD_GOLD_COST || ((best.tile.resource === "IRON" ? stock.IRON : stock.CRYSTAL) ?? 0) < MINE_BUILD_RESOURCE_COST)
    ) best = undefined;
    else if (best.structureType === "MARKET" && (!actor.techIds.has("trade") || actor.points < MARKET_BUILD_GOLD_COST || (stock.CRYSTAL ?? 0) < MARKET_BUILD_CRYSTAL_COST)) best = undefined;
    else if (
      best.structureType === "GRANARY" &&
      (!getPlayerEffectsForPlayer(actor.id).unlockGranary || actor.points < GRANARY_BUILD_GOLD_COST || (stock.FOOD ?? 0) < GRANARY_BUILD_FOOD_COST)
    ) best = undefined;
    else return { tile: best.tile, structureType: best.structureType };
  }
  for (const tile of territorySummary.structureCandidateTiles) {
    const tileKey = key(tile.x, tile.y);
    if (tile.economicStructure) continue;
    const candidates: EconomicStructureType[] =
      tile.resource === "FARM" || tile.resource === "FISH"
        ? ["FARMSTEAD", "GRANARY"]
        : tile.resource === "FUR" || tile.resource === "WOOD"
          ? ["CAMP", "MARKET"]
          : tile.resource === "IRON" || tile.resource === "GEMS"
            ? ["MINE", "MARKET"]
            : townsByTile.has(tileKey)
              ? ["MARKET", "GRANARY"]
              : [];
    for (const structureType of candidates) {
      const placed = canPlaceEconomicStructure(actor, tile, structureType);
      if (!placed.ok) continue;
      if (structureType === "FARMSTEAD" && (!actor.techIds.has("agriculture") || actor.points < FARMSTEAD_BUILD_GOLD_COST || (stock.FOOD ?? 0) < FARMSTEAD_BUILD_FOOD_COST)) continue;
      if (structureType === "CAMP" && (!actor.techIds.has("leatherworking") || actor.points < CAMP_BUILD_GOLD_COST || (stock.SUPPLY ?? 0) < CAMP_BUILD_SUPPLY_COST)) continue;
      if (structureType === "MINE" && (!actor.techIds.has("mining") || actor.points < MINE_BUILD_GOLD_COST || ((tile.resource === "IRON" ? stock.IRON : stock.CRYSTAL) ?? 0) < MINE_BUILD_RESOURCE_COST)) continue;
      if (structureType === "MARKET" && (!actor.techIds.has("trade") || actor.points < MARKET_BUILD_GOLD_COST || (stock.CRYSTAL ?? 0) < MARKET_BUILD_CRYSTAL_COST)) continue;
      if (structureType === "GRANARY" && (!getPlayerEffectsForPlayer(actor.id).unlockGranary || actor.points < GRANARY_BUILD_GOLD_COST || (stock.FOOD ?? 0) < GRANARY_BUILD_FOOD_COST)) continue;
      return { tile, structureType };
    }
  }
  return undefined;
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

const executeSystemSimulationCommand = async (command: SystemSimulationCommand): Promise<void> => {
  if (command.type === "BARBARIAN_MAINTENANCE") {
    maintainBarbarianPopulation();
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
    const candidate =
      aiFrontierCandidateFromExecuteCandidate(
        cachedExecuteCandidate(() => {
          const resolved =
            candidates?.pressureAttack ??
            candidates?.enemyAttack ??
            bestAiEnemyPressureAttack(actor, victoryPath, territorySummary) ??
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

const chooseOpeningAiVictoryPath = (
  actor: Player,
  analysis: AiTurnAnalysis,
  townsTarget: number,
  settledTilesTarget: number
): AiSeasonVictoryPathId => {
  const scored = scoreAiVictoryPathChoices(actor, analysis, townsTarget, settledTilesTarget);
  return scored[0]?.id ?? "ECONOMIC_HEGEMONY";
};

const AI_VICTORY_PATH_REEVALUATE_MS = 5 * 60_000;
const AI_VICTORY_PATH_REPIVOT_MARGIN = 22;
const AI_VICTORY_PATH_ARCHETYPE_BONUS = 34;
const AI_VICTORY_PATH_POPULATION_PENALTY = 18;

const aiVictoryPathPopulationCounts = (): Record<AiSeasonVictoryPathId, number> => {
  const counts: Record<AiSeasonVictoryPathId, number> = {
    TOWN_CONTROL: 0,
    ECONOMIC_HEGEMONY: 0,
    SETTLED_TERRITORY: 0
  };
  for (const path of aiVictoryPathByPlayer.values()) {
    counts[path] += 1;
  }
  return counts;
};

const scoreAiVictoryPathChoices = (
  actor: Player,
  analysis: AiTurnAnalysis,
  townsTarget: number,
  settledTilesTarget: number
): Array<{ id: AiSeasonVictoryPathId; score: number }> => {
  const territorySummary = analysis.territorySummary;
  const townOpportunityScore = territorySummary.neutralTownExpandCount * 5 + territorySummary.hostileTownAttackCount * 6;
  const economicOpportunityScore = territorySummary.neutralEconomicExpandCount * 4 + territorySummary.hostileEconomicAttackCount * 3;
  const expansionOpportunityScore = territorySummary.neutralLandExpandCount + Math.min(territorySummary.frontierTileCount, 24);

  const ranked = rankSeasonVictoryPaths({
    townsControlled: analysis.controlledTowns,
    townsTarget,
    incomePerMinute: analysis.aiIncome,
    incomeLeaderGap: analysis.aiIncome - analysis.runnerUpIncome,
    settledTiles: analysis.settledTiles,
    settledTilesTarget,
    underThreat: analysis.underThreat,
    goldHealthy: canAffordGoldCost(actor.points, SETTLE_COST + FRONTIER_ACTION_GOLD_COST),
    staminaHealthy: actor.stamina >= 0
  });

  const tieBreak = [...actor.id].reduce((total, char) => total + char.charCodeAt(0), 0);
  const archetype = tieBreak % 3;
  const populationCounts = aiVictoryPathPopulationCounts();
  const minimumPopulation = Math.min(populationCounts.TOWN_CONTROL, populationCounts.ECONOMIC_HEGEMONY, populationCounts.SETTLED_TERRITORY);
  const openingScores: Record<AiSeasonVictoryPathId, number> = {
    TOWN_CONTROL:
      townOpportunityScore * 42 +
      (analysis.controlledTowns === 0 ? 35 : 0) +
      (analysis.underThreat ? -15 : 0) +
      (archetype === 0 ? AI_VICTORY_PATH_ARCHETYPE_BONUS : 0),
    ECONOMIC_HEGEMONY:
      economicOpportunityScore * 40 +
      (analysis.worldFlags.has("active_dock") ? 28 : 0) +
      (analysis.worldFlags.has("active_town") ? 12 : 0) +
      (analysis.foodCoverageLow ? 10 : 0) +
      (archetype === 1 ? AI_VICTORY_PATH_ARCHETYPE_BONUS : 0),
    SETTLED_TERRITORY:
      expansionOpportunityScore * 3.5 +
      Math.min(territorySummary.neutralLandExpandCount, 18) * 0.3 +
      (analysis.underThreat ? -10 : 6) +
      (analysis.worldFlags.has("active_town") ? 6 : 0) +
      (archetype === 2 ? AI_VICTORY_PATH_ARCHETYPE_BONUS : 0)
  };

  return [...ranked]
    .map((entry) => ({
      id: entry.id,
      score:
        openingScores[entry.id] +
        entry.score * 0.28 -
        Math.max(0, populationCounts[entry.id] - minimumPopulation) * AI_VICTORY_PATH_POPULATION_PENALTY
    }))
    .sort((left, right) => right.score - left.score);
};

const ensureAiVictoryPath = (
  actor: Player,
  analysis: AiTurnAnalysis,
  townsTarget: number,
  settledTilesTarget: number
): AiSeasonVictoryPathId => {
  const existing = aiVictoryPathByPlayer.get(actor.id);
  const updatedAt = aiVictoryPathUpdatedAtByPlayer.get(actor.id) ?? 0;
  if (existing) {
    if (now() - updatedAt < AI_VICTORY_PATH_REEVALUATE_MS) return existing;
    const scored = scoreAiVictoryPathChoices(actor, analysis, townsTarget, settledTilesTarget);
    const best = scored[0];
    const currentScore = scored.find((entry) => entry.id === existing)?.score ?? Number.NEGATIVE_INFINITY;
    aiVictoryPathUpdatedAtByPlayer.set(actor.id, now());
    if (best && best.id !== existing && !analysis.underThreat && best.score >= currentScore + AI_VICTORY_PATH_REPIVOT_MARGIN) {
      aiVictoryPathByPlayer.set(actor.id, best.id);
      return best.id;
    }
    return existing;
  }
  const selected = chooseOpeningAiVictoryPath(actor, analysis, townsTarget, settledTilesTarget);
  aiVictoryPathByPlayer.set(actor.id, selected);
  aiVictoryPathUpdatedAtByPlayer.set(actor.id, now());
  return selected;
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

const aiWorkerState: {
  queue: AiWorkerJob[];
  draining: boolean;
} = {
  queue: [],
  draining: false
};

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

const resolveAiPlannerFallback = (snapshot: AiPlanningSnapshot, reason: string): AiPlanningDecision => {
  aiPlannerWorkerState.lastUsedWorker = false;
  aiPlannerWorkerState.lastFallbackReason = reason;
  return planAiDecision(snapshot);
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

const drainAiWorkerQueue = async (): Promise<void> => {
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
  app.log.info(
    {
      traceId: capture.traceId,
      attackerId: capture.attackerId,
      origin: capture.origin,
      target: capture.target,
      phase,
      elapsedMs: now() - capture.startedAt,
      resolvesAt: capture.resolvesAt,
      ...extra
    },
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
  app.log.info(
    {
      traceId: capture.traceId,
      attackerId: capture.attackerId,
      actionType: capture.actionType,
      origin: capture.origin,
      target: capture.target,
      phase,
      elapsedMs: now() - capture.startedAt,
      resolvesAt: capture.resolvesAt,
      ...extra
    },
    "attack trace"
  );
};

const cancelAllBarbarianPendingCaptures = (): void => {
  const uniq = new Set<PendingCapture>();
  for (const lock of combatLocks.values()) {
    if (!lock.attackerId.startsWith(`${BARBARIAN_OWNER_ID}:`)) continue;
    uniq.add(lock);
  }
  for (const capture of uniq) cancelPendingCapture(capture);
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
  pending.timeout = setTimeout(async () => {
    if (pending.cancelled) return;
    if (!hasOnlinePlayers()) {
      cancelPendingCapture(pending);
      return;
    }
    combatLocks.delete(currentKey);
    combatLocks.delete(targetKey);
    const live = barbarianAgents.get(agent.id);
    if (!live) return;
    const liveTile = runtimeTileCore(live.x, live.y);
    if (liveTile.ownerId !== BARBARIAN_OWNER_ID || key(liveTile.x, liveTile.y) !== currentKey) return;
    const currentTarget = playerTile(target.x, target.y);
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
      logBarbarianEvent(`attack-loss ${live.id} @ ${live.x},${live.y} vs ${target.x},${target.y}`);
      return;
    }
    const gain = getBarbarianProgressGain(currentTarget);
    live.progress += gain;
    logBarbarianEvent(`progress ${live.id} ${progressBefore} -> ${live.progress} at ${target.x},${target.y}`);
    const shouldMultiply = live.progress >= BARBARIAN_MULTIPLY_THRESHOLD;
    const oldX = live.x;
    const oldY = live.y;
    updateOwnership(target.x, target.y, BARBARIAN_OWNER_ID, "BARBARIAN");
    live.x = target.x;
    live.y = target.y;
    if (shouldMultiply) {
      updateOwnership(oldX, oldY, BARBARIAN_OWNER_ID, "BARBARIAN");
      spawnBarbarianAgentAt(oldX, oldY, 0);
      live.progress = 0;
      logBarbarianEvent(`multiply ${live.id} @ ${oldX},${oldY} after capture ${target.x},${target.y}`);
    } else {
      updateOwnership(oldX, oldY, undefined);
    }
    live.lastActionAt = now();
    live.nextActionAt = now() + BARBARIAN_ACTION_INTERVAL_MS;
    upsertBarbarianAgent(live);
    recalcPlayerDerived(defender);
    updateMissionState(defender);
    resolveEliminationIfNeeded(defender, socketsByPlayer.has(defender.id));
    logBarbarianEvent(`attack-win ${live.id} now @ ${live.x},${live.y} after ${target.x},${target.y}`);
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
  wa?.send(
    JSON.stringify({
      type: "TRUCE_UPDATE",
      activeTruces: activeTruceViewsForPlayer(a.id),
      incomingTruceRequests: [...truceRequests.values()].filter((request) => request.toPlayerId === a.id),
      announcement
    })
  );
  wb?.send(
    JSON.stringify({
      type: "TRUCE_UPDATE",
      activeTruces: activeTruceViewsForPlayer(b.id),
      incomingTruceRequests: [...truceRequests.values()].filter((request) => request.toPlayerId === b.id),
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

const chunkCountX = Math.ceil(WORLD_WIDTH / CHUNK_SIZE);
const chunkCountY = Math.ceil(WORLD_HEIGHT / CHUNK_SIZE);
const wrapChunkX = (cx: number): number => ((cx % chunkCountX) + chunkCountX) % chunkCountX;
const wrapChunkY = (cy: number): number => ((cy % chunkCountY) + chunkCountY) % chunkCountY;
const chunkKeyAtTile = (x: number, y: number): string => `${Math.floor(wrapX(x, WORLD_WIDTH) / CHUNK_SIZE)},${Math.floor(wrapY(y, WORLD_HEIGHT) / CHUNK_SIZE)}`;
const tileIndex = (x: number, y: number): number => y * WORLD_WIDTH + x;
const CHUNK_SNAPSHOT_WARN_MS = 60;
const CHUNK_SNAPSHOT_BATCH_SIZE = 4;
const CHUNK_SNAPSHOT_BUDGET_MS = 24;
const CHUNK_SNAPSHOT_YIELD_MS = 4;
const CHUNK_SNAPSHOT_OVERLOAD_YIELD_MS = 16;
const INITIAL_CHUNK_BOOTSTRAP_RADIUS = 0;

const buildVisibilitySnapshot = (p: Player): VisibilitySnapshot => {
  if (DISABLE_FOG || fogDisabledByPlayer.get(p.id) === true) {
    return { allVisible: true, visibleMask: new Uint8Array(0) };
  }

  const visibleMask = new Uint8Array(WORLD_WIDTH * WORLD_HEIGHT);
  const revealRadiusForPlayer = (player: Player): void => {
    const radius = effectiveVisionRadiusForPlayer(player);
    for (const tk of player.territoryTiles) {
      const [tx, ty] = parseKey(tk);
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          const vx = wrapX(tx + dx, WORLD_WIDTH);
          const vy = wrapY(ty + dy, WORLD_HEIGHT);
          visibleMask[tileIndex(vx, vy)] = 1;
        }
      }
    }
  };
  const forced = forcedRevealTilesByPlayer.get(p.id);
  if (forced) {
    for (const tk of forced) {
      const [fx, fy] = parseKey(tk);
      visibleMask[tileIndex(fx, fy)] = 1;
    }
  }
  const revealTargets = revealedEmpireTargetsByPlayer.get(p.id);
  if (revealTargets && revealTargets.size > 0) {
    for (const targetId of revealTargets) {
      const target = players.get(targetId);
      if (!target) continue;
      for (const tk of target.territoryTiles) {
        const [rx, ry] = parseKey(tk);
        visibleMask[tileIndex(rx, ry)] = 1;
      }
    }
  }
  revealRadiusForPlayer(p);
  for (const allyId of p.allies) {
    const ally = players.get(allyId);
    if (!ally) continue;
    revealRadiusForPlayer(ally);
  }

  return { allVisible: false, visibleMask };
};

const visibilitySnapshotForPlayer = (player: Player): VisibilitySnapshot => {
  const cached = cachedVisibilitySnapshotByPlayer.get(player.id);
  if (cached) return cached;
  const snapshot = buildVisibilitySnapshot(player);
  cachedVisibilitySnapshotByPlayer.set(player.id, snapshot);
  return snapshot;
};

const visibleInSnapshot = (snapshot: VisibilitySnapshot, x: number, y: number): boolean => {
  if (snapshot.allVisible) return true;
  return snapshot.visibleMask[tileIndex(x, y)] === 1;
};

const chunkReadManager = createChunkReadManager({
  enabled: CHUNK_READ_WORKER_ENABLED,
  now,
  chunkCountX,
  chunkCountY,
  chunkSize: CHUNK_SIZE,
  onError: logRuntimeError,
  loadChunkTilesLocal: (cx, cy, mode) => summaryChunkTiles(cx, cy, mode),
  loadChunkTileLocal: (x, y, mode) => summaryTileAt(x, y, mode)
});
const chunkReadWorkerState = chunkReadManager.state;

const {
  chunkCoordsForSubscription,
  buildBootstrapChunkStages,
  sendChunkSnapshot,
  tileInSubscription
} = createChunkSnapshotController<Player>({
  chunkSize: CHUNK_SIZE,
  chunkCountX,
  chunkCountY,
  initialBootstrapRadius: INITIAL_CHUNK_BOOTSTRAP_RADIUS,
  chunkStreamBatchSize: CHUNK_STREAM_BATCH_SIZE,
  chunkSnapshotBatchSize: CHUNK_SNAPSHOT_BATCH_SIZE,
  chunkSnapshotBudgetMs: CHUNK_SNAPSHOT_BUDGET_MS,
  chunkSnapshotWarnMs: CHUNK_SNAPSHOT_WARN_MS,
  chunkSnapshotYieldMs: CHUNK_SNAPSHOT_YIELD_MS,
  chunkSnapshotOverloadYieldMs: CHUNK_SNAPSHOT_OVERLOAD_YIELD_MS,
  now,
  wrapChunkX,
  wrapChunkY,
  runtimeMemoryStats,
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
    app.log.warn(
      { playerId, elapsedMs, chunks, tiles, radius, ...phases, ...memory },
      "slow chunk snapshot"
    );
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
  visibilitySnapshotForPlayer,
  cachedChunkSnapshotByPlayer,
  fogChunkTilesByChunkKey,
  chunkSnapshotGenerationByPlayer,
  chunkSnapshotInFlightByPlayer,
  chunkSnapshotSentAtByPlayer,
  chunkSubscriptionByPlayer,
  authSyncTimingByPlayer,
  fogChunkTiles: (worldCx, worldCy) => {
    const chunkKey = `${worldCx},${worldCy}`;
    const cached = fogChunkTilesByChunkKey.get(chunkKey);
    if (cached) return cached;
    const startX = worldCx * CHUNK_SIZE;
    const startY = worldCy * CHUNK_SIZE;
    const tiles: Tile[] = [];
    for (let y = startY; y < startY + CHUNK_SIZE; y += 1) {
      for (let x = startX; x < startX + CHUNK_SIZE; x += 1) {
        const wx = wrapX(x, WORLD_WIDTH);
        const wy = wrapY(y, WORLD_HEIGHT);
        const tk = key(wx, wy);
        const fogTile: Tile = {
          x: wx,
          y: wy,
          terrain: terrainAtRuntime(wx, wy),
          fogged: true,
          lastChangedAt: 0
        };
        const dock = docksByTile.get(tk);
        const clusterId = clusterByTile.get(tk);
        const clusterType = clusterId ? clustersById.get(clusterId)?.clusterType : undefined;
        if (dock) fogTile.dockId = dock.dockId;
        if (clusterId) fogTile.clusterId = clusterId;
        if (clusterType) fogTile.clusterType = clusterType;
        tiles.push(Object.freeze(fogTile));
      }
    }
    fogChunkTilesByChunkKey.set(chunkKey, tiles);
    return tiles;
  },
  summaryChunkTiles,
  summaryChunkVersion: (worldCx, worldCy) =>
    simulationChunkState.summaryChunkVersionByChunkKey.get(`${worldCx},${worldCy}`) ?? 0,
  loadSummaryChunkTilesBatch: (requests) => chunkReadManager.loadBatch(requests),
  visibleInSnapshot,
  wrapX,
  wrapY,
  worldWidth: WORLD_WIDTH,
  worldHeight: WORLD_HEIGHT,
  serializeChunkBatchViaWorker,
  serializeChunkBatchDirect: (inputs) => inputs.map((chunk) => serializeChunkBody(buildChunkFromInput(chunk))),
  serializeChunkBatchBodies,
  runtimeLoadShedLevel
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
    return;
  }
  if (live.ownershipState !== "FRONTIER") {
    refundPendingSettlement(settlement);
    sendToPlayer(liveActor.id, { type: "ERROR", code: "SETTLE_INVALID", message: "settlement cancelled and gold returned", x, y });
    sendPlayerUpdate(liveActor, 0);
    return;
  }
  updateOwnership(x, y, liveActor.id, "SETTLED");
  logTileSync("settlement_applied", {
    playerId: liveActor.id,
    tileKey: settlement.tileKey,
    ownerId: liveActor.id,
    ownershipState: "SETTLED",
    ...developmentProcessDebugBreakdownForPlayer(liveActor.id)
  });
  revealLinkedDocksForPlayer(liveActor.id, settlement.tileKey);
  recordFrontierSettlementForPressure(liveActor.id);
  const effects = getPlayerEffectsForPlayer(liveActor.id);
  if (effects.newSettlementDefenseMult > 1) {
    settlementDefenseByTile.set(settlement.tileKey, {
      ownerId: liveActor.id,
      expiresAt: now() + NEW_SETTLEMENT_DEFENSE_MS,
      mult: effects.newSettlementDefenseMult
    });
  }
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
  sendPlayerUpdate(liveActor, 0);
  telemetryCounters.settlements += 1;
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
  for (const segment of buildAetherWallSegments(originX, originY, wall.direction, wall.length, (x) => wrapX(x, WORLD_WIDTH), (y) => wrapY(y, WORLD_HEIGHT))) {
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
  for (const segment of buildAetherWallSegments(originX, originY, wall.direction, wall.length, (x) => wrapX(x, WORLD_WIDTH), (y) => wrapY(y, WORLD_HEIGHT))) {
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
  broadcast({ type: "AETHER_WALL_UPDATE", walls: activeAetherWallViews() });
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
  const segments = buildAetherWallSegments(x, y, direction, length, (wx) => wrapX(wx, WORLD_WIDTH), (wy) => wrapY(wy, WORLD_HEIGHT));
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

const updateOwnership = (x: number, y: number, newOwner: string | undefined, newState?: OwnershipState): void => {
  const t = playerTile(x, y);
  const oldOwner = t.ownerId;
  const oldOwnershipState = t.ownershipState;
  const k = key(t.x, t.y);
  const clusterId = t.clusterId;
  let displacedSettlement: { ownerId: string; town: Pick<TownDefinition, "townId" | "type" | "name"> } | undefined;
  const affectedPlayers = new Set<string>();
  if (oldOwner) affectedPlayers.add(oldOwner);
  if (newOwner) affectedPlayers.add(newOwner);
  for (const n of cardinalNeighborCores(t.x, t.y)) {
    if (n.ownerId) affectedPlayers.add(n.ownerId);
  }

  if (oldOwner && newOwner !== oldOwner) {
    wakeOfflineEconomyForPlayer(oldOwner);
    const capturedTown = townsByTile.get(k);
    if (capturedTown) queueOfflineTownCaptureActivity(oldOwner, newOwner, capturedTown);
    if (oldOwner !== BARBARIAN_OWNER_ID && capturedTown && isRelocatableSettlementTown(capturedTown)) {
      displacedSettlement = {
        ownerId: oldOwner,
        town: {
          townId: capturedTown.townId,
          type: capturedTown.type,
          ...(capturedTown.name ? { name: capturedTown.name } : {})
        }
      };
      townsByTile.delete(k);
      markSummaryChunkDirtyAtTile(t.x, t.y);
    }
    if (oldOwner === BARBARIAN_OWNER_ID) {
      removeBarbarianAtTile(k);
    }
    const settle = pendingSettlementsByTile.get(k);
    if (settle) {
      clearPendingSettlement(settle);
      if (!newOwner || newOwner === settle.ownerId) {
        refundPendingSettlement(settle);
        const player = players.get(settle.ownerId);
        if (player) {
          sendToPlayer(player.id, { type: "ERROR", code: "SETTLE_INVALID", message: "settlement cancelled and gold returned", x: t.x, y: t.y });
          sendPlayerUpdate(player, 0);
        }
      } else {
        const player = players.get(settle.ownerId);
        if (player) {
          sendToPlayer(player.id, { type: "ERROR", code: "SETTLE_INVALID", message: "tile captured during settlement; gold forfeited", x: t.x, y: t.y });
          sendPlayerUpdate(player, 0);
        }
      }
    }
    const fort = fortsByTile.get(k);
    if (fort) {
      if (fort.status === "under_construction" || fort.status === "removing") {
        cancelFortBuild(k);
        fortsByTile.delete(k);
      } else if (newOwner) {
        fort.ownerId = newOwner;
        fort.disabledUntil = now() + TOWN_CAPTURE_SHOCK_MS;
        delete fort.completesAt;
        delete fort.previousStatus;
      } else {
        fortsByTile.delete(k);
      }
    }
    const observatory = observatoriesByTile.get(k);
    if (observatory) {
      if (observatory.status === "under_construction") {
        cancelObservatoryBuild(k);
      } else {
        untrackOwnedTileKey(observatoryTileKeysByPlayer, observatory.ownerId, k);
        observatoriesByTile.delete(k);
      }
    }
    const economic = economicStructuresByTile.get(k);
    const siege = siegeOutpostsByTile.get(k);
    if (siege) {
      cancelSiegeOutpostBuild(k);
      siegeOutpostsByTile.delete(k);
    }
    siphonByTile.delete(k);
    breachShockByTile.delete(k);
    settlementDefenseByTile.delete(k);
    if (economic) {
      if (economic.status === "under_construction" || economic.status === "removing") {
        const timer = economicStructureBuildTimers.get(k);
        if (timer) clearTimeout(timer);
        economicStructureBuildTimers.delete(k);
        untrackOwnedTileKey(economicStructureTileKeysByPlayer, economic.ownerId, k);
        economicStructuresByTile.delete(k);
        markSummaryChunkDirtyAtTile(t.x, t.y);
      } else if (newOwner) {
        untrackOwnedTileKey(economicStructureTileKeysByPlayer, economic.ownerId, k);
        economic.ownerId = newOwner;
        economic.status = "inactive";
        delete economic.completesAt;
        economic.disabledUntil = now() + TOWN_CAPTURE_SHOCK_MS;
        delete economic.inactiveReason;
        economic.nextUpkeepAt = economic.disabledUntil;
        trackOwnedTileKey(economicStructureTileKeysByPlayer, newOwner, k);
      } else {
        untrackOwnedTileKey(economicStructureTileKeysByPlayer, economic.ownerId, k);
        economicStructuresByTile.delete(k);
      }
    }
  }

  if (newOwner) {
    ownership.set(k, newOwner);
    const stateToSet =
      newState ??
      (newOwner === BARBARIAN_OWNER_ID ? "BARBARIAN" : oldOwner === newOwner ? ownershipStateByTile.get(k) : "FRONTIER");
    ownershipStateByTile.set(k, stateToSet ?? (newOwner === BARBARIAN_OWNER_ID ? "BARBARIAN" : "FRONTIER"));
  } else {
    ownership.delete(k);
    ownershipStateByTile.delete(k);
    const observatory = observatoriesByTile.get(k);
    if (observatory) {
      if (observatory.status === "under_construction") {
        cancelObservatoryBuild(k);
      } else {
        untrackOwnedTileKey(observatoryTileKeysByPlayer, observatory.ownerId, k);
        observatoriesByTile.delete(k);
      }
    }
    const economic = economicStructuresByTile.get(k);
    if (economic) {
      if (economic.status === "under_construction" || economic.status === "removing") {
        const timer = economicStructureBuildTimers.get(k);
        if (timer) clearTimeout(timer);
        economicStructureBuildTimers.delete(k);
        untrackOwnedTileKey(economicStructureTileKeysByPlayer, economic.ownerId, k);
        economicStructuresByTile.delete(k);
        markSummaryChunkDirtyAtTile(t.x, t.y);
      } else {
        untrackOwnedTileKey(economicStructureTileKeysByPlayer, economic.ownerId, k);
        economicStructuresByTile.delete(k);
      }
    }
    siphonByTile.delete(k);
    breachShockByTile.delete(k);
    settlementDefenseByTile.delete(k);
  }
  const finalState = ownershipStateByTile.get(k);
  if (newOwner && newOwner !== BARBARIAN_OWNER_ID && finalState === "SETTLED") {
    if (!(oldOwner === newOwner && oldOwnershipState === "SETTLED")) settledSinceByTile.set(k, now());
  } else {
    settledSinceByTile.delete(k);
  }
  if (oldOwner !== newOwner) {
    if (!newOwner) tileYieldByTile.delete(k);
    if (oldOwner && newOwner) recordTileCaptureHistory(k, oldOwner, newOwner);
    if (oldOwner && newOwner) {
      const capturedTown = townsByTile.get(k);
      if (capturedTown) {
        applyTownCapturePopulationLoss(capturedTown);
        applyTownCaptureShock(k);
      }
    }
  }

  if (oldOwner) {
    const p = players.get(oldOwner);
    if (p) {
      p.territoryTiles.delete(k);
      const r = t.resource;
      if (r) getOrInitResourceCounts(oldOwner)[r] = (getOrInitResourceCounts(oldOwner)[r] ?? 0) - 1;
      if (clusterId) setClusterControlDelta(oldOwner, clusterId, -1);
    }
  }

  if (newOwner) {
    const p = players.get(newOwner);
    if (p) {
      p.territoryTiles.add(k);
      const r = t.resource;
      if (r) getOrInitResourceCounts(newOwner)[r] = (getOrInitResourceCounts(newOwner)[r] ?? 0) + 1;
      if (clusterId) setClusterControlDelta(newOwner, clusterId, 1);
    }
  }

  for (const pid of affectedPlayers) {
    const p = players.get(pid);
    if (!p) continue;
    recomputeExposure(p);
    recomputeTownNetworkForPlayer(pid);
    reconcileCapitalForPlayer(p);
    if (!displacedSettlement || displacedSettlement.ownerId !== pid) ensureFallbackSettlementForPlayer(pid);
    rebuildEconomyIndexForPlayer(pid);
  }
  if (displacedSettlement) {
    relocateCapturedSettlementForPlayer(displacedSettlement.ownerId, displacedSettlement.town);
    const displacedPlayer = players.get(displacedSettlement.ownerId);
    if (displacedPlayer) {
      ensureFallbackSettlementForPlayer(displacedPlayer.id);
      rebuildEconomyIndexForPlayer(displacedPlayer.id);
    }
  }

  for (const pid of affectedPlayers) refreshVisibleOwnedTownsForPlayer(pid);
  if (displacedSettlement) refreshVisibleOwnedTownsForPlayer(displacedSettlement.ownerId);
  markAiTerritoryDirtyForPlayers(affectedPlayers);

  const changedFoodTile = t.resource === "FARM" || t.resource === "FISH";
  const changedTownTile = townsByTile.has(k);
  const changedSupportAdjacency = adjacentNeighborCores(t.x, t.y).some((neighbor) => townsByTile.has(key(neighbor.x, neighbor.y)));
  if (changedFoodTile || changedTownTile || changedSupportAdjacency) {
    refreshVisibleNearbyTownDeltas(t.x, t.y);
  }

  const visibilityAffectedPlayers = new Set<string>();
  if (oldOwner) {
    visibilityAffectedPlayers.add(oldOwner);
    for (const allyId of players.get(oldOwner)?.allies ?? []) visibilityAffectedPlayers.add(allyId);
    for (const watcherPlayerId of revealWatchersByTarget.get(oldOwner) ?? []) visibilityAffectedPlayers.add(watcherPlayerId);
  }
  if (newOwner) {
    visibilityAffectedPlayers.add(newOwner);
    for (const allyId of players.get(newOwner)?.allies ?? []) visibilityAffectedPlayers.add(allyId);
    for (const watcherPlayerId of revealWatchersByTarget.get(newOwner) ?? []) visibilityAffectedPlayers.add(watcherPlayerId);
  }
  markVisibilityDirtyForPlayers(visibilityAffectedPlayers);
  markSummaryChunkDirtyAtTile(t.x, t.y);

  if (oldOwner !== newOwner || oldOwnershipState !== t.ownershipState) {
    const ownerName = t.ownerId ? players.get(t.ownerId)?.name : undefined;
    const replayEvent: Omit<StrategicReplayEvent, "id"> = {
      at: now(),
      type: "OWNERSHIP",
      label: t.ownerId ? `${ownerName ?? t.ownerId.slice(0, 8)} ${t.ownershipState === "SETTLED" ? "settled" : "claimed"} (${t.x}, ${t.y})` : `Tile lost at (${t.x}, ${t.y})`,
      ownerId: t.ownerId ?? null,
      ownershipState: t.ownershipState ?? null,
      x: t.x,
      y: t.y,
      isBookmark: townsByTile.has(k) && oldOwner !== newOwner
    };
    if (t.ownerId) replayEvent.playerId = t.ownerId;
    if (ownerName) replayEvent.playerName = ownerName;
    pushStrategicReplayEvent(replayEvent);
  }

  sendVisibleTileDeltaSquare(t.x, t.y, 1);
};

const spawnPlayer = (p: Player): void => {
  const hasNearbyPlayerSpawn = (x: number, y: number, radius: number): boolean => {
    for (const other of players.values()) {
      if (other.id === p.id) continue;
      const home = playerHomeTile(other);
      const spawnOrigin = other.spawnOrigin;
      const [ox, oy] = home ? [home.x, home.y] : spawnOrigin ? parseKey(spawnOrigin) : [Number.NaN, Number.NaN];
      if (Number.isNaN(ox) || Number.isNaN(oy)) continue;
      if (chebyshevDistance(x, y, ox, oy) < radius) return true;
    }
    return false;
  };
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
        const tk = key(wrapX(x + dx, WORLD_WIDTH), wrapY(y + dy, WORLD_HEIGHT));
        const clusterId = clusterByTile.get(tk);
        const cluster = clusterId ? clustersById.get(clusterId) : undefined;
        if (!cluster) continue;
        const resource = clusterResourceType(cluster);
        if (resource === "FARM" || resource === "FISH") return true;
      }
    }
    return false;
  };
  const trySpawnAt = (x: number, y: number): boolean => {
    const t = playerTile(x, y);
    if (t.terrain !== "LAND") return false;
    if (townsByTile.has(key(x, y))) return false;
    const owner = t.ownerId;
    if (owner && owner !== BARBARIAN_OWNER_ID) return false;
    updateOwnership(x, y, p.id, "SETTLED");
    if (!townsByTile.has(key(x, y))) createSettlementAtTile(p.id, key(x, y));
    p.spawnOrigin = key(x, y);
    p.capitalTileKey = key(x, y);
    sendVisibleTileDeltaAt(x, y);
    p.spawnShieldUntil = now() + 120_000;
    p.isEliminated = false;
    p.respawnPending = false;
    broadcast({ type: "PLAYER_STYLE", playerId: p.id, ...playerStylePayload(p) });
    if (runtimeState.appRef) runtimeState.appRef.log.info({ playerId: p.id, x, y }, "spawned player");
    return true;
  };

  if (!p.isAi && DEBUG_SPAWN_NEAR_AI) {
    for (const other of players.values()) {
      if (!other.isAi) continue;
      const home = playerHomeTile(other);
      const spawnOrigin = other.spawnOrigin;
      const [ox, oy] = home ? [home.x, home.y] : spawnOrigin ? parseKey(spawnOrigin) : [Number.NaN, Number.NaN];
      if (Number.isNaN(ox) || Number.isNaN(oy)) continue;
      const neighbors: Array<[number, number]> = [
        [ox, oy - 1],
        [ox + 1, oy],
        [ox, oy + 1],
        [ox - 1, oy]
      ];
      for (const [nxRaw, nyRaw] of neighbors) {
        const nx = wrapX(nxRaw, WORLD_WIDTH);
        const ny = wrapY(nyRaw, WORLD_HEIGHT);
        if (trySpawnAt(nx, ny)) return;
      }
    }
  }

  for (let i = 0; i < 8000; i += 1) {
    const x = Math.floor(Math.random() * WORLD_WIDTH);
    const y = Math.floor(Math.random() * WORLD_HEIGHT);
    const t = playerTile(x, y);
    if (t.terrain !== "LAND" || t.ownerId) continue;
    if (hasNearbyPlayerSpawn(x, y, 50)) continue;
    if (!hasNearbyTown(x, y, 10)) continue;
    if (!hasNearbyFood(x, y, 10)) continue;
    if (trySpawnAt(x, y)) return;
  }

  for (let i = 0; i < 5000; i += 1) {
    const x = Math.floor(Math.random() * WORLD_WIDTH);
    const y = Math.floor(Math.random() * WORLD_HEIGHT);
    const t = playerTile(x, y);
    if (t.terrain !== "LAND" || t.ownerId) continue;
    if (hasNearbyPlayerSpawn(x, y, 50)) continue;
    if (!hasNearbyTown(x, y, 10)) continue;
    if (trySpawnAt(x, y)) return;
  }

  for (let i = 0; i < 5000; i += 1) {
    const x = Math.floor(Math.random() * WORLD_WIDTH);
    const y = Math.floor(Math.random() * WORLD_HEIGHT);
    const t = playerTile(x, y);
    if (t.terrain !== "LAND" || t.ownerId) continue;
    if (hasNearbyPlayerSpawn(x, y, 50)) continue;
    if (!hasNearbyFood(x, y, 10)) continue;
    if (trySpawnAt(x, y)) return;
  }

  for (let i = 0; i < 5000; i += 1) {
    const x = Math.floor(Math.random() * WORLD_WIDTH);
    const y = Math.floor(Math.random() * WORLD_HEIGHT);
    const t = playerTile(x, y);
    if (t.terrain !== "LAND") continue;
    if (hasNearbyPlayerSpawn(x, y, 50)) continue;
    if (!t.ownerId && trySpawnAt(x, y)) return;
  }

  // Fallback: allow reclaiming barbarian land so spawn is never impossible.
  for (let i = 0; i < 20_000; i += 1) {
    const x = Math.floor(Math.random() * WORLD_WIDTH);
    const y = Math.floor(Math.random() * WORLD_HEIGHT);
    const t = playerTile(x, y);
    if (t.terrain !== "LAND" || t.ownerId !== BARBARIAN_OWNER_ID) continue;
    if (trySpawnAt(x, y)) return;
  }

  // Final safety: deterministic scan in case random attempts miss.
  for (let y = 0; y < WORLD_HEIGHT; y += 1) {
    for (let x = 0; x < WORLD_WIDTH; x += 1) {
      if (trySpawnAt(x, y)) return;
    }
  }

  if (runtimeState.appRef) runtimeState.appRef.log.error({ playerId: p.id }, "failed to find any land tile for spawn");
  else console.error("failed to find any land tile for spawn", { playerId: p.id });
};

const serializePlayer = (p: Player) => ({
  ...p,
  techIds: [...p.techIds],
  domainIds: [...p.domainIds],
  territoryTiles: [...p.territoryTiles],
  allies: [...p.allies]
});

const lastEconomyActivityAtForPlayer = (player: Player): number => Math.max(player.lastActiveAt, player.lastEconomyWakeAt ?? 0);

const offlineUpkeepPausedForPlayer = (player: Player): boolean => now() - lastEconomyActivityAtForPlayer(player) > OFFLINE_YIELD_ACCUM_MAX_MS;

const wakeOfflineEconomyForPlayer = (playerId: string | undefined): void => {
  if (!playerId || playerId === BARBARIAN_OWNER_ID) return;
  const player = players.get(playerId);
  if (!player) return;
  player.lastEconomyWakeAt = now();
};

const queueOfflinePlayerActivity = (playerId: string, entry: import("@border-empires/shared").PlayerActivityEntry): void => {
  const player = players.get(playerId);
  if (!player) return;
  const socket = socketsByPlayer.get(playerId);
  if (socket && socket.readyState === socket.OPEN) return;
  player.activityInbox = appendPlayerActivityEntry(player.activityInbox ?? [], entry);
};

const consumeOfflinePlayerActivity = (playerId: string): import("@border-empires/shared").PlayerActivityEntry[] => {
  const player = players.get(playerId);
  if (!player || player.activityInbox.length === 0) return [];
  const pending = [...player.activityInbox];
  player.activityInbox = [];
  return pending;
};

const playerActivityName = (playerId: string | undefined): string => {
  if (!playerId) return "Neutral territory";
  if (playerId === BARBARIAN_OWNER_ID) return "Barbarians";
  return players.get(playerId)?.name ?? playerId.slice(0, 8);
};

const queueOfflineTownCaptureActivity = (oldOwnerId: string | undefined, newOwnerId: string | undefined, town: TownDefinition): void => {
  if (!town.name) return;
  const occurredAt = now();
  if (oldOwnerId && oldOwnerId !== BARBARIAN_OWNER_ID && oldOwnerId !== newOwnerId) {
    queueOfflinePlayerActivity(
      oldOwnerId,
      buildTownActivityEntry({
        kind: "lost",
        townName: town.name,
        actorName: playerActivityName(newOwnerId),
        tileKey: town.tileKey,
        at: occurredAt
      })
    );
  }
  if (newOwnerId && newOwnerId !== BARBARIAN_OWNER_ID && newOwnerId !== oldOwnerId) {
    queueOfflinePlayerActivity(
      newOwnerId,
      buildTownActivityEntry({
        kind: "captured",
        townName: town.name,
        actorName: playerActivityName(oldOwnerId),
        tileKey: town.tileKey,
        at: occurredAt
      })
    );
  }
};

const rebuildOwnershipDerivedState = (): void => {
  for (const p of players.values()) {
    p.territoryTiles.clear();
    p.T = 0;
    p.E = 0;
    p.Ts = 0;
    p.Es = 0;
    resourceCountsByPlayer.set(p.id, { FARM: 0, FISH: 0, FUR: 0, WOOD: 0, IRON: 0, GEMS: 0, OIL: 0 });
    clusterControlledTilesByPlayer.set(p.id, new Map());
  }

  for (const [tk, ownerId] of [...ownership.entries()]) {
    if (ownerId === BARBARIAN_OWNER_ID) {
      const [x, y] = parseKey(tk);
      const t = playerTile(x, y);
      if (t.terrain !== "LAND") {
        ownership.delete(tk);
        ownershipStateByTile.delete(tk);
        continue;
      }
      ownershipStateByTile.set(tk, "BARBARIAN");
      continue;
    }
    const p = players.get(ownerId);
    if (!p) {
      ownership.delete(tk);
      continue;
    }
    const [x, y] = parseKey(tk);
    const t = playerTile(x, y);
    if (t.terrain !== "LAND") {
      ownership.delete(tk);
      ownershipStateByTile.delete(tk);
      continue;
    }
    if (!ownershipStateByTile.has(tk)) ownershipStateByTile.set(tk, "SETTLED");
    if (ownershipStateByTile.get(tk) === "SETTLED" && !settledSinceByTile.has(tk)) settledSinceByTile.set(tk, 0);
    p.territoryTiles.add(tk);
    p.T += 1;
    if (t.resource) getOrInitResourceCounts(ownerId)[t.resource] = (getOrInitResourceCounts(ownerId)[t.resource] ?? 0) + 1;
    if (t.clusterId) setClusterControlDelta(ownerId, t.clusterId, 1);
  }

  for (const p of players.values()) {
    recomputeExposure(p);
    ensureFallbackSettlementForPlayer(p.id);
    recomputeTownNetworkForPlayer(p.id);
    reconcileCapitalForPlayer(p);
    updateMissionState(p);
  }
  for (const agent of [...barbarianAgents.values()]) {
    const t = playerTile(agent.x, agent.y);
    if (t.ownerId !== BARBARIAN_OWNER_ID || t.terrain !== "LAND") {
      removeBarbarianAgent(agent.id);
      continue;
    }
    upsertBarbarianAgent(agent);
  }
};

const playerHomeTile = (p: Player): { x: number; y: number } | undefined => {
  const first = activeSettlementTileKeyForPlayer(p.id) ?? p.spawnOrigin ?? [...p.territoryTiles][0];
  if (!first) return undefined;
  const [x, y] = parseKey(first);
  return { x, y };
};

const getOrCreatePlayerForIdentity = (identity: AuthIdentity): Player | undefined => {
  let player = players.get(identity.playerId);
  if (!player) player = [...players.values()].find((p) => p.name === identity.name);
  if (!player) {
    player = {
      id: crypto.randomUUID(),
      name: identity.name,
      profileComplete: false,
      points: STARTING_GOLD,
      level: 0,
      techIds: new Set<string>(),
      domainIds: new Set<string>(),
      mods: { attack: 1, defense: 1, income: 1, vision: 1 },
      powerups: {},
      tileColor: colorFromId(identity.name),
      missions: [],
      missionStats: defaultMissionStats(),
      territoryTiles: new Set<TileKey>(),
      T: 0,
      E: 0,
      Ts: 0,
      Es: 0,
      stamina: STAMINA_MAX,
      staminaUpdatedAt: now(),
      manpower: STARTING_MANPOWER,
      manpowerUpdatedAt: now(),
      manpowerCapSnapshot: STARTING_MANPOWER,
      allies: new Set<string>(),
      spawnShieldUntil: now() + 120_000,
      isEliminated: false,
      respawnPending: false,
      lastActiveAt: now(),
      lastEconomyWakeAt: now(),
      activityInbox: []
    };
    players.set(player.id, player);
    identity.playerId = player.id;
    playerBaseMods.set(player.id, { attack: 1, defense: 1, income: 1, vision: 1 });
    strategicResourceStockByPlayer.set(player.id, emptyStrategicStocks());
    strategicResourceBufferByPlayer.set(player.id, emptyStrategicStocks());
    economyIndexByPlayer.set(player.id, emptyPlayerEconomyIndex());
    dynamicMissionsByPlayer.set(player.id, []);
    forcedRevealTilesByPlayer.set(player.id, new Set<TileKey>());
    setRevealTargetsForPlayer(player.id, []);
    playerEffectsByPlayer.set(player.id, emptyPlayerEffects());
    spawnPlayer(player);
  }
  if (!player) return undefined;
  if (!Array.isArray(player.activityInbox)) player.activityInbox = [];
  if (!(player.domainIds instanceof Set)) {
    (player as unknown as { domainIds: Set<string> }).domainIds = new Set<string>();
  }
  normalizePlayerProgressionState(player);
  if (player.T <= 0 || player.territoryTiles.size === 0) {
    spawnPlayer(player);
  }
  if (!player.tileColor) {
    player.tileColor = colorFromId(player.id);
  }
  if (player.name !== identity.name) {
    player.name = identity.name;
  }
  recomputePlayerEffectsForPlayer(player);
  ensureMissionDefaults(player);
  updateMissionState(player);
  return player;
};

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

const buildSnapshotState = (): SnapshotState => {
  const snapshot: SnapshotState = {
    world: { width: WORLD_WIDTH, height: WORLD_HEIGHT },
    townPlacementsNormalized: true,
    players: [...players.values()].map(serializePlayer),
    ownership: [...ownership.entries()],
    ownershipState: [...ownershipStateByTile.entries()],
    settledSince: [...settledSinceByTile.entries()],
    barbarianAgents: [...barbarianAgents.values()],
    authIdentities: [...authIdentityByUid.values()],
    resources: [...resourceCountsByPlayer.entries()],
    strategicResources: [...strategicResourceStockByPlayer.entries()],
    strategicResourceBuffer: [...strategicResourceBufferByPlayer.entries()],
    tileYield: [...tileYieldByTile.entries()],
    tileHistory: [...tileHistoryByTile.entries()],
    terrainShapes: [...terrainShapesByTile.entries()],
    seasonVictory: [...victoryPressureById.entries()],
    frontierSettlements: [...frontierSettlementsByPlayer.entries()],
    dynamicMissions: [...dynamicMissionsByPlayer.entries()],
    temporaryAttackBuffUntil: [...temporaryAttackBuffUntilByPlayer.entries()],
    temporaryIncomeBuff: [...temporaryIncomeBuffUntilByPlayer.entries()],
    forcedReveal: [...forcedRevealTilesByPlayer.entries()].map(([pid, set]) => [pid, [...set]]),
    revealedEmpireTargets: [...revealedEmpireTargetsByPlayer.entries()].map(([pid, set]) => [pid, [...set]]),
    allianceRequests: [...allianceRequests.values()],
    forts: [...fortsByTile.values()],
    observatories: [...observatoriesByTile.values()],
    siegeOutposts: [...siegeOutpostsByTile.values()],
    economicStructures: [...economicStructuresByTile.values()],
    sabotage: [...siphonByTile.values()],
    abilityCooldowns: [...abilityCooldownsByPlayer.entries()].map(([pid, map]) => [pid, [...map.entries()]]),
    aetherWalls: [...activeAetherWallsById.values()],
    docks: [...dockById.values()],
    towns: [...townsByTile.values()],
    shardSites: [...shardSitesByTile.values()],
    firstSpecialSiteCaptureClaimed: [...firstSpecialSiteCaptureClaimed],
    clusters: [...clustersById.values()],
    clusterTiles: [...clusterByTile.entries()],
    pendingSettlements: [...pendingSettlementsByTile.values()].map((settle) => ({
      tileKey: settle.tileKey,
      ownerId: settle.ownerId,
      startedAt: settle.startedAt,
      resolvesAt: settle.resolvesAt,
      goldCost: settle.goldCost
    })),
    townCaptureShock: [...townCaptureShockUntilByTile.entries()],
    townGrowthShock: [...townGrowthShockUntilByTile.entries()],
    season: activeSeason,
    seasonArchives,
    seasonTechConfig: {
      ...activeSeasonTechConfig,
      activeNodeIds: [...activeSeasonTechConfig.activeNodeIds]
    }
  };
  if (seasonWinner) snapshot.seasonWinner = seasonWinner;
  return snapshot;
};

const splitSnapshotState = (
  snapshot: SnapshotState
): {
  meta: SnapshotMetaSection;
  players: SnapshotPlayersSection;
  territory: SnapshotTerritorySection;
  economy: SnapshotEconomySection;
  systems: SnapshotSystemsSection;
} => ({
  meta: {
    world: snapshot.world,
    ...(snapshot.townPlacementsNormalized ? { townPlacementsNormalized: snapshot.townPlacementsNormalized } : {}),
    ...(snapshot.season ? { season: snapshot.season } : {}),
    ...(snapshot.seasonWinner ? { seasonWinner: snapshot.seasonWinner } : {}),
    ...(snapshot.seasonArchives ? { seasonArchives: snapshot.seasonArchives } : {}),
    ...(snapshot.seasonTechConfig ? { seasonTechConfig: snapshot.seasonTechConfig } : {})
  },
  players: {
    players: snapshot.players,
    ...(snapshot.authIdentities ? { authIdentities: snapshot.authIdentities } : {})
  },
  territory: {
    ownership: snapshot.ownership,
    ...(snapshot.ownershipState ? { ownershipState: snapshot.ownershipState } : {}),
    ...(snapshot.settledSince ? { settledSince: snapshot.settledSince } : {}),
    ...(snapshot.barbarianAgents ? { barbarianAgents: snapshot.barbarianAgents } : {}),
    ...(snapshot.tileHistory ? { tileHistory: snapshot.tileHistory } : {}),
    ...(snapshot.terrainShapes ? { terrainShapes: snapshot.terrainShapes } : {}),
    ...(snapshot.docks ? { docks: snapshot.docks } : {}),
    ...(snapshot.towns ? { towns: snapshot.towns } : {}),
    ...(snapshot.shardSites ? { shardSites: snapshot.shardSites } : {}),
    ...(snapshot.firstSpecialSiteCaptureClaimed ? { firstSpecialSiteCaptureClaimed: snapshot.firstSpecialSiteCaptureClaimed } : {}),
    ...(snapshot.clusters ? { clusters: snapshot.clusters } : {}),
    ...(snapshot.clusterTiles ? { clusterTiles: snapshot.clusterTiles } : {}),
    ...(snapshot.townCaptureShock ? { townCaptureShock: snapshot.townCaptureShock } : {}),
    ...(snapshot.townGrowthShock ? { townGrowthShock: snapshot.townGrowthShock } : {})
  },
  economy: {
    resources: snapshot.resources,
    ...(snapshot.strategicResources ? { strategicResources: snapshot.strategicResources } : {}),
    ...(snapshot.strategicResourceBuffer ? { strategicResourceBuffer: snapshot.strategicResourceBuffer } : {}),
    ...(snapshot.tileYield ? { tileYield: snapshot.tileYield } : {}),
    ...(snapshot.frontierSettlements ? { frontierSettlements: snapshot.frontierSettlements } : {}),
    ...(snapshot.dynamicMissions ? { dynamicMissions: snapshot.dynamicMissions } : {}),
    ...(snapshot.temporaryAttackBuffUntil ? { temporaryAttackBuffUntil: snapshot.temporaryAttackBuffUntil } : {}),
    ...(snapshot.temporaryIncomeBuff ? { temporaryIncomeBuff: snapshot.temporaryIncomeBuff } : {}),
    ...(snapshot.pendingSettlements ? { pendingSettlements: snapshot.pendingSettlements } : {})
  },
  systems: {
    ...(snapshot.seasonVictory ? { seasonVictory: snapshot.seasonVictory } : {}),
    ...(snapshot.forcedReveal ? { forcedReveal: snapshot.forcedReveal } : {}),
    ...(snapshot.revealedEmpireTargets ? { revealedEmpireTargets: snapshot.revealedEmpireTargets } : {}),
    ...(snapshot.allianceRequests ? { allianceRequests: snapshot.allianceRequests } : {}),
    ...(snapshot.forts ? { forts: snapshot.forts } : {}),
    ...(snapshot.observatories ? { observatories: snapshot.observatories } : {}),
    ...(snapshot.siegeOutposts ? { siegeOutposts: snapshot.siegeOutposts } : {}),
    ...(snapshot.economicStructures ? { economicStructures: snapshot.economicStructures } : {}),
    ...(snapshot.sabotage ? { sabotage: snapshot.sabotage } : {}),
    ...(snapshot.abilityCooldowns ? { abilityCooldowns: snapshot.abilityCooldowns } : {}),
    ...(snapshot.aetherWalls ? { aetherWalls: snapshot.aetherWalls } : {})
  }
});

const writeSnapshotJsonAtomic = async (targetFile: string, serialized: string): Promise<void> => {
  const tmpFile = `${targetFile}.${process.pid}.tmp`;
  await fs.promises.writeFile(tmpFile, serialized);
  await fs.promises.rename(tmpFile, targetFile);
};

const readSnapshotJsonSync = <T>(file: string): { data: T; bytes: number; elapsedMs: number } => {
  const startedAt = Date.now();
  const text = fs.readFileSync(file, "utf8");
  return {
    data: JSON.parse(text) as T,
    bytes: Buffer.byteLength(text),
    elapsedMs: Date.now() - startedAt
  };
};

let snapshotSavePromise: Promise<void> = Promise.resolve();
const saveSnapshot = async (): Promise<void> => {
  const startedAt = Date.now();
  logSnapshotSerializationMemory("before_build", startedAt, runtimeMemoryStats());
  const snapshot = buildSnapshotState();
  logSnapshotSerializationMemory("after_build", startedAt, runtimeMemoryStats());
  const sections = splitSnapshotState(snapshot);
  logSnapshotSerializationMemory("after_split", startedAt, runtimeMemoryStats());
  const serializedSections = {
    meta: "",
    players: "",
    territory: "",
    economy: "",
    systems: ""
  };
  serializedSections.meta = JSON.stringify(sections.meta);
  logSnapshotSerializationMemory("after_stringify_meta", startedAt, runtimeMemoryStats(), {
    section: "meta",
    bytes: Buffer.byteLength(serializedSections.meta, "utf8")
  });
  serializedSections.players = JSON.stringify(sections.players);
  logSnapshotSerializationMemory("after_stringify_players", startedAt, runtimeMemoryStats(), {
    section: "players",
    bytes: Buffer.byteLength(serializedSections.players, "utf8")
  });
  serializedSections.territory = JSON.stringify(sections.territory);
  logSnapshotSerializationMemory("after_stringify_territory", startedAt, runtimeMemoryStats(), {
    section: "territory",
    bytes: Buffer.byteLength(serializedSections.territory, "utf8")
  });
  serializedSections.economy = JSON.stringify(sections.economy);
  logSnapshotSerializationMemory("after_stringify_economy", startedAt, runtimeMemoryStats(), {
    section: "economy",
    bytes: Buffer.byteLength(serializedSections.economy, "utf8")
  });
  serializedSections.systems = JSON.stringify(sections.systems);
  logSnapshotSerializationMemory("after_stringify_systems", startedAt, runtimeMemoryStats(), {
    section: "systems",
    bytes: Buffer.byteLength(serializedSections.systems, "utf8")
  });
  const index: SnapshotSectionIndex = {
    formatVersion: 2,
    sections: {
      meta: SNAPSHOT_SECTION_FILES.meta,
      players: SNAPSHOT_SECTION_FILES.players,
      territory: SNAPSHOT_SECTION_FILES.territory,
      economy: SNAPSHOT_SECTION_FILES.economy,
      systems: SNAPSHOT_SECTION_FILES.systems
    }
  };
  const serializedIndex = JSON.stringify(index);
  logSnapshotSerializationMemory("after_stringify_index", startedAt, runtimeMemoryStats(), {
    section: "index",
    bytes: Buffer.byteLength(serializedIndex, "utf8"),
    totalBytes:
      Buffer.byteLength(serializedSections.meta, "utf8") +
      Buffer.byteLength(serializedSections.players, "utf8") +
      Buffer.byteLength(serializedSections.territory, "utf8") +
      Buffer.byteLength(serializedSections.economy, "utf8") +
      Buffer.byteLength(serializedSections.systems, "utf8") +
      Buffer.byteLength(serializedIndex, "utf8")
  });
  snapshotSavePromise = snapshotSavePromise
    .catch(() => undefined)
    .then(async () => {
      await fs.promises.mkdir(SNAPSHOT_DIR, { recursive: true });
      await Promise.all([
        writeSnapshotJsonAtomic(snapshotSectionFile("meta"), serializedSections.meta),
        writeSnapshotJsonAtomic(snapshotSectionFile("players"), serializedSections.players),
        writeSnapshotJsonAtomic(snapshotSectionFile("territory"), serializedSections.territory),
        writeSnapshotJsonAtomic(snapshotSectionFile("economy"), serializedSections.economy),
        writeSnapshotJsonAtomic(snapshotSectionFile("systems"), serializedSections.systems)
      ]);
      await writeSnapshotJsonAtomic(SNAPSHOT_INDEX_FILE, serializedIndex);
      logSnapshotSerializationMemory("after_write", startedAt, runtimeMemoryStats());
    });
  return snapshotSavePromise;
};

const snapshotSaveRunner = createSnapshotSaveRunner({
  save: saveSnapshot,
  onError: (err) => {
    logRuntimeError("snapshot save failed", err);
  }
});

const saveSnapshotInBackground = (): void => {
  snapshotSaveRunner.request();
};

const loadSectionedSnapshot = (): SnapshotState | undefined => {
  if (!fs.existsSync(SNAPSHOT_INDEX_FILE)) return undefined;
  const indexStartedAt = Date.now();
  const index = readSnapshotJsonSync<SnapshotSectionIndex>(SNAPSHOT_INDEX_FILE);
  logStartupPhase("load_snapshot_index", indexStartedAt, { bytes: index.bytes });
  if (index.data.formatVersion !== 2) {
    throw new Error(`unsupported snapshot index format ${index.data.formatVersion}`);
  }
  const meta = readSnapshotJsonSync<SnapshotMetaSection>(path.join(SNAPSHOT_DIR, index.data.sections.meta));
  const playersSection = readSnapshotJsonSync<SnapshotPlayersSection>(path.join(SNAPSHOT_DIR, index.data.sections.players));
  const territory = readSnapshotJsonSync<SnapshotTerritorySection>(path.join(SNAPSHOT_DIR, index.data.sections.territory));
  const economy = readSnapshotJsonSync<SnapshotEconomySection>(path.join(SNAPSHOT_DIR, index.data.sections.economy));
  const systems = readSnapshotJsonSync<SnapshotSystemsSection>(path.join(SNAPSHOT_DIR, index.data.sections.systems));
  if (runtimeState.appRef) {
    runtimeState.appRef.log.info(
      {
        sections: {
          meta: { bytes: meta.bytes, elapsedMs: meta.elapsedMs },
          players: { bytes: playersSection.bytes, elapsedMs: playersSection.elapsedMs },
          territory: { bytes: territory.bytes, elapsedMs: territory.elapsedMs },
          economy: { bytes: economy.bytes, elapsedMs: economy.elapsedMs },
          systems: { bytes: systems.bytes, elapsedMs: systems.elapsedMs }
        }
      },
      "snapshot section timings"
    );
  }
  return {
    ...meta.data,
    townPlacementsNormalized: meta.data.townPlacementsNormalized ?? true,
    ...playersSection.data,
    ...territory.data,
    ...economy.data,
    ...systems.data
  };
};

const loadLegacySnapshot = (): SnapshotState | undefined => {
  if (!fs.existsSync(SNAPSHOT_FILE)) return undefined;
  return readSnapshotJsonSync<SnapshotState>(SNAPSHOT_FILE).data;
};

const hydrateSnapshotState = (raw: SnapshotState): void => {
  const hydrateStartedAt = Date.now();
  let phaseStartedAt = hydrateStartedAt;
  clearAllAiLatchedIntents(aiIntentLatchState);
  clearAllAiExecuteCandidates(aiExecuteCandidateCacheState);
  const logHydratePhase = (phase: string, extra: Record<string, number> = {}): void => {
    if (!runtimeState.appRef) {
      phaseStartedAt = Date.now();
      return;
    }
    const nowMs = Date.now();
    runtimeState.appRef.log.info(
      {
        phase: `hydrate_snapshot:${phase}`,
        elapsedMs: nowMs - phaseStartedAt,
        hydrateElapsedMs: nowMs - hydrateStartedAt,
        ...extra
      },
      "startup phase"
    );
    phaseStartedAt = nowMs;
  };
  if (!raw.world || raw.world.width !== WORLD_WIDTH || raw.world.height !== WORLD_HEIGHT) {
    return;
  }
  for (const [k, v] of raw.ownership) ownership.set(k, v);
  if (raw.ownershipState && raw.ownershipState.length > 0) {
    for (const [k, v] of raw.ownershipState) ownershipStateByTile.set(k, v);
  } else {
    // Legacy snapshots: treat owned tiles as settled for compatibility.
    for (const [k, ownerId] of raw.ownership) {
      ownershipStateByTile.set(k, ownerId === BARBARIAN_OWNER_ID ? "BARBARIAN" : "SETTLED");
    }
  }
  for (const [k, settledAt] of raw.settledSince ?? []) settledSinceByTile.set(k, settledAt);
  barbarianAgents.clear();
  barbarianAgentByTileKey.clear();
  for (const agent of raw.barbarianAgents ?? []) {
    upsertBarbarianAgent(agent);
  }
  for (const identity of raw.authIdentities ?? []) authIdentityByUid.set(identity.uid, identity);
  for (const [pid, c] of raw.resources) {
    resourceCountsByPlayer.set(pid, {
      FARM: c.FARM ?? 0,
      FISH: c.FISH ?? 0,
      FUR: c.FUR ?? 0,
      WOOD: c.WOOD ?? 0,
      IRON: c.IRON ?? 0,
      GEMS: c.GEMS ?? 0,
      OIL: c.OIL ?? 0
    });
  }
  for (const [pid, c] of raw.strategicResources ?? []) {
    const legacy = c as Record<string, number>;
    strategicResourceStockByPlayer.set(pid, {
      FOOD: c.FOOD ?? 0,
      IRON: c.IRON ?? 0,
      CRYSTAL: c.CRYSTAL ?? 0,
      SUPPLY: c.SUPPLY ?? legacy.STONE ?? 0,
      SHARD: c.SHARD ?? 0,
      OIL: c.OIL ?? 0
    });
  }
  for (const [tk, history] of raw.tileHistory ?? []) {
    const normalized: TileHistoryState = {
      previousOwners: [...(history.previousOwners ?? [])].slice(-5),
      captureCount: history.captureCount ?? 0,
      structureHistory: [...(history.structureHistory ?? [])].slice(-5)
    };
    if (history.lastOwnerId !== undefined) normalized.lastOwnerId = history.lastOwnerId;
    if (history.lastCapturedAt !== undefined) normalized.lastCapturedAt = history.lastCapturedAt;
    if (history.lastStructureType !== undefined) normalized.lastStructureType = history.lastStructureType;
    if (history.wasMountainCreatedByPlayer !== undefined) normalized.wasMountainCreatedByPlayer = history.wasMountainCreatedByPlayer;
    if (history.wasMountainRemovedByPlayer !== undefined) normalized.wasMountainRemovedByPlayer = history.wasMountainRemovedByPlayer;
    tileHistoryByTile.set(tk, normalized);
  }
  for (const [tk, shape] of raw.terrainShapes ?? []) {
    terrainShapesByTile.set(tk, shape);
  }
  const legacySnapshot = raw as SnapshotState & { victoryPressure?: [SeasonVictoryPathId, VictoryPressureTracker][] };
  for (const [objectiveId, tracker] of raw.seasonVictory ?? legacySnapshot.victoryPressure ?? []) {
    const normalized: VictoryPressureTracker = {};
    if (tracker.leaderPlayerId !== undefined) normalized.leaderPlayerId = tracker.leaderPlayerId;
    if (tracker.holdStartedAt !== undefined) normalized.holdStartedAt = tracker.holdStartedAt;
    victoryPressureById.set(objectiveId, normalized);
  }
  for (const [playerId, timestamps] of raw.frontierSettlements ?? []) {
    frontierSettlementsByPlayer.set(playerId, [...timestamps]);
  }
  for (const [pid, c] of raw.strategicResourceBuffer ?? []) {
    const legacy = c as Record<string, number>;
    strategicResourceBufferByPlayer.set(pid, {
      FOOD: c.FOOD ?? 0,
      IRON: c.IRON ?? 0,
      CRYSTAL: c.CRYSTAL ?? 0,
      SUPPLY: c.SUPPLY ?? legacy.STONE ?? 0,
      SHARD: c.SHARD ?? 0,
      OIL: c.OIL ?? 0
    });
  }
  for (const [tk, y] of raw.tileYield ?? []) {
    const legacyStrategic = (y.strategic ?? {}) as Record<string, number>;
    tileYieldByTile.set(tk, {
      gold: y.gold ?? 0,
      strategic: {
        FOOD: y.strategic?.FOOD ?? 0,
        IRON: y.strategic?.IRON ?? 0,
        CRYSTAL: y.strategic?.CRYSTAL ?? 0,
        SUPPLY: y.strategic?.SUPPLY ?? legacyStrategic.STONE ?? 0,
        SHARD: y.strategic?.SHARD ?? 0,
        OIL: y.strategic?.OIL ?? 0
      }
    });
  }
  for (const [pid, missions] of raw.dynamicMissions ?? []) {
    dynamicMissionsByPlayer.set(pid, missions);
  }
  for (const [pid, until] of raw.temporaryAttackBuffUntil ?? []) {
    temporaryAttackBuffUntilByPlayer.set(pid, until);
  }
  for (const [pid, buff] of raw.temporaryIncomeBuff ?? []) {
    temporaryIncomeBuffUntilByPlayer.set(pid, buff);
  }
  logHydratePhase("territory_and_economy", {
    ownershipTiles: raw.ownership.length,
    tileHistory: raw.tileHistory?.length ?? 0,
    structures: (raw.forts?.length ?? 0) + (raw.observatories?.length ?? 0) + (raw.economicStructures?.length ?? 0)
  });
  cachedVisibilitySnapshotByPlayer.clear();
  cachedChunkSnapshotByPlayer.clear();
  simulationChunkState.clear();
  chunkSnapshotGenerationByPlayer.clear();
  revealWatchersByTarget.clear();
  observatoryTileKeysByPlayer.clear();
  economicStructureTileKeysByPlayer.clear();
  for (const [pid, tiles] of raw.forcedReveal ?? []) {
    forcedRevealTilesByPlayer.set(pid, new Set<TileKey>(tiles));
  }
  for (const [pid, targets] of raw.revealedEmpireTargets ?? []) {
    setRevealTargetsForPlayer(pid, targets);
  }
  logHydratePhase("visibility_and_reveal", {
    forcedRevealPlayers: raw.forcedReveal?.length ?? 0,
    revealTargets: raw.revealedEmpireTargets?.length ?? 0
  });
  for (const request of raw.allianceRequests ?? []) allianceRequests.set(request.id, request);
  for (const f of raw.forts ?? []) fortsByTile.set(f.tileKey, f);
  for (const observatory of raw.observatories ?? []) {
    const normalized: Observatory = {
      observatoryId: observatory.observatoryId,
      ownerId: observatory.ownerId,
      tileKey: observatory.tileKey,
      status: observatory.status ?? "active"
    };
    if (observatory.completesAt !== undefined) normalized.completesAt = observatory.completesAt;
    if (observatory.cooldownUntil !== undefined) normalized.cooldownUntil = observatory.cooldownUntil;
    observatoriesByTile.set(observatory.tileKey, normalized);
    trackOwnedTileKey(observatoryTileKeysByPlayer, observatory.ownerId, observatory.tileKey);
  }
  for (const s of raw.siegeOutposts ?? []) siegeOutpostsByTile.set(s.tileKey, s);
  for (const structure of raw.economicStructures ?? []) {
    const legacy = structure as EconomicStructure & { isActive?: boolean };
    const normalized: EconomicStructure = {
      id: structure.id,
      type: structure.type,
      tileKey: structure.tileKey,
      ownerId: structure.ownerId,
      status: structure.status ?? (legacy.isActive ? "active" : "inactive"),
      nextUpkeepAt: structure.nextUpkeepAt
    };
    if (structure.completesAt !== undefined) normalized.completesAt = structure.completesAt;
    if (structure.disabledUntil !== undefined) normalized.disabledUntil = structure.disabledUntil;
    if (structure.inactiveReason !== undefined) normalized.inactiveReason = structure.inactiveReason;
    else if (normalized.status === "inactive" && isConverterStructureType(normalized.type) && normalized.disabledUntil === undefined) normalized.inactiveReason = "manual";
    economicStructuresByTile.set(structure.tileKey, normalized);
    trackOwnedTileKey(economicStructureTileKeysByPlayer, structure.ownerId, structure.tileKey);
  }
  for (const sabotage of raw.sabotage ?? []) siphonByTile.set(sabotage.targetTileKey, sabotage);
  for (const [pid, entries] of raw.abilityCooldowns ?? []) {
    abilityCooldownsByPlayer.set(pid, new Map(entries));
  }
  for (const wall of raw.aetherWalls ?? []) {
    activeAetherWallsById.set(wall.wallId, wall);
    registerAetherWallEdges(wall);
  }
  logHydratePhase("systems_structures", {
    forts: raw.forts?.length ?? 0,
    observatories: raw.observatories?.length ?? 0,
    siegeOutposts: raw.siegeOutposts?.length ?? 0,
    economicStructures: raw.economicStructures?.length ?? 0,
    aetherWalls: raw.aetherWalls?.length ?? 0
  });
  for (const d of raw.docks ?? []) {
    docksByTile.set(d.tileKey, d);
    dockById.set(d.dockId, d);
  }
  dockLinkedTileKeysByDockTileKey.clear();
  for (const t of raw.towns ?? []) townsByTile.set(t.tileKey, t);
  for (const shardSite of raw.shardSites ?? []) shardSitesByTile.set(shardSite.tileKey, shardSite);
  for (const tk of raw.firstSpecialSiteCaptureClaimed ?? []) firstSpecialSiteCaptureClaimed.add(tk);
  for (const c of raw.clusters ?? []) clustersById.set(c.clusterId, c);
  for (const [tk, cid] of raw.clusterTiles ?? []) clusterByTile.set(tk, cid);
  for (const [tk, until] of raw.townCaptureShock ?? []) townCaptureShockUntilByTile.set(tk, until);
  for (const [tk, until] of raw.townGrowthShock ?? []) townGrowthShockUntilByTile.set(tk, until);
  normalizeLegacySettlementTowns();
  logHydratePhase("world_maps", {
    docks: raw.docks?.length ?? 0,
    towns: raw.towns?.length ?? 0,
    shardSites: raw.shardSites?.length ?? 0,
    clusters: raw.clusters?.length ?? 0,
    clusterTiles: raw.clusterTiles?.length ?? 0
  });
  const shouldNormalizeTownPlacements = raw.townPlacementsNormalized === true ? false : townPlacementsNeedNormalization();
  if (shouldNormalizeTownPlacements) {
    normalizeTownPlacements();
    logHydratePhase("town_normalization", { normalized: 1, towns: raw.towns?.length ?? 0 });
  } else {
    logHydratePhase("town_normalization", { normalized: 0, towns: raw.towns?.length ?? 0 });
  }
  assignMissingTownNamesForWorld();
  if (raw.season) activeSeason = raw.season;
  if (raw.seasonWinner) seasonWinner = raw.seasonWinner;
  if (raw.seasonArchives) seasonArchives.push(...raw.seasonArchives);
  if (raw.seasonTechConfig) {
    activeSeasonTechConfig = {
      ...raw.seasonTechConfig,
      activeNodeIds: new Set(raw.seasonTechConfig.activeNodeIds)
    };
  }
  if (!seasonTechConfigIsCompatible(activeSeasonTechConfig)) {
    activeSeasonTechConfig = chooseSeasonalTechConfig(activeSeason.worldSeed);
    activeSeason.techTreeConfigId = activeSeasonTechConfig.configId;
  }
  logHydratePhase("season_and_meta", {
    alliances: raw.allianceRequests?.length ?? 0,
    seasonArchives: raw.seasonArchives?.length ?? 0
  });
  logHydratePhase("systems_and_world_meta", {
    docks: raw.docks?.length ?? 0,
    towns: raw.towns?.length ?? 0
  });
  for (const p of raw.players) {
    const hydrated: Player = {
      ...p,
      profileComplete: p.profileComplete ?? true,
      Ts: p.Ts ?? 0,
      Es: p.Es ?? 0,
      lastEconomyWakeAt: p.lastEconomyWakeAt ?? p.lastActiveAt,
      techIds: new Set(p.techIds),
      domainIds: new Set(p.domainIds ?? []),
      territoryTiles: new Set(p.territoryTiles),
      allies: new Set(p.allies),
      missions: p.missions ?? [],
      missionStats: p.missionStats ?? defaultMissionStats(),
      activityInbox: p.activityInbox ?? []
    };
    ensureMissionDefaults(hydrated);
    normalizePlayerProgressionState(hydrated);
    players.set(p.id, hydrated);
    playerBaseMods.set(hydrated.id, {
      attack: hydrated.mods.attack,
      defense: hydrated.mods.defense,
      income: hydrated.mods.income,
      vision: hydrated.mods.vision
    });
    recomputePlayerEffectsForPlayer(hydrated);
  }
  logHydratePhase("players", { players: raw.players.length });
  for (const settlement of raw.pendingSettlements ?? []) {
    const hydrated: PendingSettlement = {
      tileKey: settlement.tileKey,
      ownerId: settlement.ownerId,
      startedAt: settlement.startedAt,
      resolvesAt: settlement.resolvesAt,
      goldCost: settlement.goldCost,
      cancelled: false
    };
    pendingSettlementsByTile.set(hydrated.tileKey, hydrated);
  }
  logHydratePhase("pending_settlements", { pendingSettlements: raw.pendingSettlements?.length ?? 0 });
  for (const playerId of players.keys()) ensureFallbackSettlementForPlayer(playerId);
  if (barbarianAgents.size === 0) {
    for (const [tk, ownerId] of ownership.entries()) {
      if (ownerId !== BARBARIAN_OWNER_ID) continue;
      const [x, y] = parseKey(tk);
      spawnBarbarianAgentAt(x, y, 0);
    }
  }
  logHydratePhase("barbarian_backfill", { barbarianAgents: barbarianAgents.size });
};

const loadSnapshot = (): void => {
  let raw: SnapshotState | undefined;
  try {
    raw = loadSectionedSnapshot() ?? loadLegacySnapshot();
  } catch (err) {
    logRuntimeError("snapshot load failed", err);
    try {
      if (fs.existsSync(SNAPSHOT_INDEX_FILE)) {
        fs.renameSync(SNAPSHOT_INDEX_FILE, `${SNAPSHOT_INDEX_FILE}.corrupt-${Date.now()}`);
      } else if (fs.existsSync(SNAPSHOT_FILE)) {
        fs.renameSync(SNAPSHOT_FILE, `${SNAPSHOT_FILE}.corrupt-${Date.now()}`);
      }
    } catch (renameErr) {
      logRuntimeError("failed to quarantine corrupt snapshot", renameErr);
    }
    return;
  }
  if (!raw) return;
  hydrateSnapshotState(raw);
};

const bootstrapRuntimeState = async (): Promise<void> => {
  const loadStartedAt = Date.now();
  loadSnapshot();
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
    clustersById.size < minAcceptableClusters ||
    clusterByTile.size === 0 ||
    !hasBiomeLinkedClusters ||
    !hasExpectedClusterShape ||
    hasLegacyResourceMix ||
    !hasFurClusters ||
    hasGemOnNonSand
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
  if (dockById.size === 0 || docksByTile.size === 0 || !hasCrossContinentDockPairs || townsByTile.size === 0) {
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
  for (const [id, req] of allianceRequests) {
    if (req.expiresAt < now()) allianceRequests.delete(id);
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
      sendToPlayer(p.id, { type: "TILE_DELTA", updates: [current] });
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
    for (const segment of buildAetherWallSegments(originX, originY, wall.direction, wall.length, (x) => wrapX(x, WORLD_WIDTH), (y) => wrapY(y, WORLD_HEIGHT))) {
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
    if (!upkeepPaused) {
      applyStaminaRegen(p);
      recomputeTownNetworkForPlayer(p.id);
      const populationTouched = updateTownPopulationForPlayer(p);
      const economicTouched = syncEconomicStructuresForPlayer(p);
      for (const tk of populationTouched) touchedTileKeys.add(tk);
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
      sendToPlayer(p.id, { type: "TILE_DELTA", updates });
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

const runtimeDashboardPayload = (): {
  ok: true;
  at: number;
  runtime: ReturnType<typeof sampleRuntimeVitals> & { pid: number; cpuCount: number; nodeVersion: string };
  counts: {
    onlinePlayers: number;
    totalPlayers: number;
    aiPlayers: number;
    ownershipTiles: number;
    towns: number;
    docks: number;
    clusters: number;
    barbarianAgents: number;
  };
  caches: {
    visibilitySnapshots: number;
    cachedChunkPlayers: number;
    cachedChunkPayloads: number;
    cachedChunkPayloadMb: number;
  };
  queuePressure: {
    pendingAuthVerifications: number;
    runtimeIntervals: number;
    humanSimulationQueueDepth: number;
    systemSimulationQueueDepth: number;
    aiSimulationQueueDepth: number;
    aiQueueDepth: number;
    aiPlannerPending: number;
    combatWorkerPending: number;
    chunkSerializerPending: number;
    chunkReadPending: number;
    simulationCommandQueueDepth: number;
    aiDraining: boolean;
    simulationCommandDraining: boolean;
    lastSimulationPriority: "human" | "system" | "ai" | "idle";
    lastSimulationDrainAt: number;
    lastSimulationDrainElapsedMs: number;
    lastSimulationDrainCommands: number;
    lastSimulationDrainHumanCommands: number;
    lastSimulationDrainSystemCommands: number;
    lastSimulationDrainAiCommands: number;
    aiPlannerAvailable: boolean;
    aiPlannerCrashed: boolean;
    aiPlannerLastRoundTripMs: number;
    aiPlannerLastUsedWorker: boolean;
    aiPlannerLastFallbackReason?: string;
    combatWorkerAvailable: boolean;
    combatWorkerCrashed: boolean;
    combatWorkerLastRoundTripMs: number;
    combatWorkerLastUsedWorker: boolean;
    combatWorkerLastFallbackReason?: string;
    chunkSerializerAvailable: boolean;
    chunkSerializerCrashed: boolean;
    chunkSerializerLastRoundTripMs: number;
    chunkSerializerLastUsedWorker: boolean;
    chunkSerializerLastFallbackReason?: string;
    chunkReadAvailable: boolean;
    chunkReadCrashed: boolean;
    chunkReadLastRoundTripMs: number;
    chunkReadLastUsedWorker: boolean;
    chunkReadHydrated: boolean;
  };
  aiScheduler: {
    at: number;
    dispatchIntervalMs: number;
    targetCadenceMs: number;
    batchSize: number;
    selectedAiPlayers: number;
    totalAiPlayers: number;
    urgentAiPlayers: number;
    humanPlayersOnline: boolean;
    authPriorityActive: boolean;
    aiQueueBackpressure: boolean;
    simulationQueueBackpressure: boolean;
    eventLoopOverloaded: boolean;
    reason: string;
  };
  aiBudget: {
    budgetMs: number;
    breaches: number;
    lastPhase?: string;
    lastReason?: string;
    lastActionKey?: string;
    recent: ReturnType<typeof recentAiBudgetBreachPerf.values>;
  };
  hotspots: ReturnType<typeof runtimeHotspotDiagnostics>;
  collections: Array<{ name: string; entries: number }>;
  history: {
    vitals: ReturnType<typeof recentRuntimeVitals.values>;
    aiTicks: ReturnType<typeof recentAiTickPerf.values>;
    chunkSnapshots: ReturnType<typeof recentChunkSnapshotPerf.values>;
  };
} => {
  const latestVitals = recentRuntimeVitals.values().at(-1) ?? sampleRuntimeVitals();
  const cachePayloads = cachedChunkPayloadDiagnostics();
  const recentAiBudgetBreaches = recentAiBudgetBreachPerf.values();
  const lastAiBudgetBreach = recentAiBudgetBreaches.at(-1);
  return {
    ok: true,
    at: now(),
    runtime: {
      ...latestVitals,
      pid: process.pid,
      cpuCount: runtimeCpuCount,
      nodeVersion: process.version
    },
    counts: {
      onlinePlayers: onlineSocketCount(),
      totalPlayers: players.size,
      aiPlayers: [...players.values()].filter((player) => player.isAi).length,
      ownershipTiles: ownership.size,
      towns: townsByTile.size,
      docks: docksByTile.size,
      clusters: clustersById.size,
      barbarianAgents: barbarianAgents.size
    },
    caches: {
      visibilitySnapshots: cachedVisibilitySnapshotByPlayer.size,
      cachedChunkPlayers: cachedChunkSnapshotByPlayer.size,
      cachedChunkPayloads: cachePayloads.payloads,
      cachedChunkPayloadMb: cachePayloads.approxPayloadMb
    },
    queuePressure: {
      pendingAuthVerifications: authPressureState.pendingAuthVerifications,
      runtimeIntervals: runtimeIntervals.length,
      humanSimulationQueueDepth: simulationCommandWorkerState.humanQueue.length,
      systemSimulationQueueDepth: simulationCommandWorkerState.systemQueue.length,
      aiSimulationQueueDepth: simulationCommandWorkerState.aiQueue.length,
      aiQueueDepth: aiWorkerState.queue.length,
      aiPlannerPending: aiPlannerWorkerState.pending,
      combatWorkerPending: combatWorkerState.pending,
      chunkSerializerPending: chunkSerializerWorkerState.pending,
      chunkReadPending: chunkReadWorkerState.pending,
      simulationCommandQueueDepth: simulationCommandQueueDepth(),
      aiDraining: aiWorkerState.draining,
      simulationCommandDraining: simulationCommandWorkerState.draining,
      lastSimulationPriority: simulationCommandWorkerState.lastDequeuedPriority,
      lastSimulationDrainAt: simulationCommandWorkerState.lastDrainAt,
      lastSimulationDrainElapsedMs: simulationCommandWorkerState.lastDrainElapsedMs,
      lastSimulationDrainCommands: simulationCommandWorkerState.lastDrainCommands,
      lastSimulationDrainHumanCommands: simulationCommandWorkerState.lastDrainHumanCommands,
      lastSimulationDrainSystemCommands: simulationCommandWorkerState.lastDrainSystemCommands,
      lastSimulationDrainAiCommands: simulationCommandWorkerState.lastDrainAiCommands,
      aiPlannerAvailable: aiPlannerWorkerState.available,
      aiPlannerCrashed: aiPlannerWorkerState.crashed,
      aiPlannerLastRoundTripMs: aiPlannerWorkerState.lastRoundTripMs,
      aiPlannerLastUsedWorker: aiPlannerWorkerState.lastUsedWorker,
      ...(aiPlannerWorkerState.lastFallbackReason ? { aiPlannerLastFallbackReason: aiPlannerWorkerState.lastFallbackReason } : {}),
      combatWorkerAvailable: combatWorkerState.available,
      combatWorkerCrashed: combatWorkerState.crashed,
      combatWorkerLastRoundTripMs: combatWorkerState.lastRoundTripMs,
      combatWorkerLastUsedWorker: combatWorkerState.lastUsedWorker,
      ...(combatWorkerState.lastFallbackReason ? { combatWorkerLastFallbackReason: combatWorkerState.lastFallbackReason } : {}),
      chunkSerializerAvailable: chunkSerializerWorkerState.available,
      chunkSerializerCrashed: chunkSerializerWorkerState.crashed,
      chunkSerializerLastRoundTripMs: chunkSerializerWorkerState.lastRoundTripMs,
      chunkSerializerLastUsedWorker: chunkSerializerWorkerState.lastUsedWorker,
      ...(chunkSerializerWorkerState.lastFallbackReason ? { chunkSerializerLastFallbackReason: chunkSerializerWorkerState.lastFallbackReason } : {}),
      chunkReadAvailable: chunkReadWorkerState.available,
      chunkReadCrashed: chunkReadWorkerState.crashed,
      chunkReadLastRoundTripMs: chunkReadWorkerState.lastRoundTripMs,
      chunkReadLastUsedWorker: chunkReadWorkerState.lastUsedWorker,
      chunkReadHydrated: chunkReadWorkerState.hydrated
    },
    aiScheduler: {
      dispatchIntervalMs: AI_DISPATCH_INTERVAL_MS,
      targetCadenceMs: AI_TICK_MS,
      ...aiSchedulerState
    },
    aiBudget: {
      budgetMs: AI_TICK_BUDGET_MS,
      breaches: recentAiBudgetBreaches.length,
      ...(lastAiBudgetBreach?.phase ? { lastPhase: lastAiBudgetBreach.phase } : {}),
      ...(lastAiBudgetBreach?.reason ? { lastReason: lastAiBudgetBreach.reason } : {}),
      ...(lastAiBudgetBreach?.actionKey ? { lastActionKey: lastAiBudgetBreach.actionKey } : {}),
      recent: recentAiBudgetBreaches
    },
    hotspots: runtimeHotspotDiagnostics(),
    collections: runtimeCollectionDiagnostics(),
    history: {
      vitals: recentRuntimeVitals.values(),
      aiTicks: recentAiTickPerf.values(),
      chunkSnapshots: recentChunkSnapshotPerf.values()
    }
  };
};

const renderRuntimeDashboardHtml = (): string => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Border Empires Runtime Dashboard</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #09131a;
        --bg2: #10222c;
        --panel: rgba(14, 29, 37, 0.9);
        --panel-border: rgba(156, 198, 210, 0.18);
        --text: #e7f4f7;
        --muted: #8da7af;
        --accent: #67e8f9;
        --warn: #fbbf24;
        --danger: #f87171;
        --good: #4ade80;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        background:
          radial-gradient(circle at top left, rgba(103, 232, 249, 0.16), transparent 28rem),
          radial-gradient(circle at top right, rgba(248, 113, 113, 0.12), transparent 24rem),
          linear-gradient(180deg, var(--bg), #050a0e 75%);
        color: var(--text);
      }
      .wrap {
        max-width: 1440px;
        margin: 0 auto;
        padding: 24px;
      }
      .hero {
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
        gap: 16px;
        align-items: end;
        margin-bottom: 20px;
      }
      .hero h1 {
        margin: 0;
        font-size: clamp(28px, 4vw, 44px);
        letter-spacing: -0.04em;
      }
      .hero p, .meta {
        margin: 6px 0 0;
        color: var(--muted);
      }
      .status {
        display: inline-flex;
        gap: 10px;
        align-items: center;
        border: 1px solid var(--panel-border);
        background: rgba(103, 232, 249, 0.06);
        padding: 10px 14px;
        border-radius: 999px;
      }
      .dot {
        width: 10px;
        height: 10px;
        border-radius: 999px;
        background: var(--good);
        box-shadow: 0 0 18px rgba(74, 222, 128, 0.8);
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(12, minmax(0, 1fr));
        gap: 14px;
      }
      .panel {
        grid-column: span 12;
        background: var(--panel);
        border: 1px solid var(--panel-border);
        border-radius: 18px;
        padding: 16px;
        backdrop-filter: blur(10px);
        box-shadow: 0 24px 60px rgba(0, 0, 0, 0.25);
      }
      .span-3 { grid-column: span 3; }
      .span-4 { grid-column: span 4; }
      .span-5 { grid-column: span 5; }
      .span-6 { grid-column: span 6; }
      .span-7 { grid-column: span 7; }
      .span-8 { grid-column: span 8; }
      .span-12 { grid-column: span 12; }
      .panel h2, .panel h3 {
        margin: 0 0 12px;
        font-size: 14px;
        text-transform: uppercase;
        letter-spacing: 0.14em;
        color: var(--muted);
      }
      .metric {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        padding: 10px 0;
        border-top: 1px solid rgba(255, 255, 255, 0.06);
      }
      .metric:first-of-type { border-top: 0; padding-top: 0; }
      .metric strong {
        font-size: 24px;
        display: block;
        margin-top: 4px;
      }
      .muted { color: var(--muted); }
      .flag {
        display: inline-block;
        padding: 4px 8px;
        border-radius: 999px;
        font-size: 12px;
        border: 1px solid currentColor;
      }
      .flag.good { color: var(--good); }
      .flag.warn { color: var(--warn); }
      .flag.danger { color: var(--danger); }
      .mini-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }
      .chart {
        margin-top: 14px;
        height: 160px;
        border-radius: 12px;
        background: linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01));
        border: 1px solid rgba(255,255,255,0.06);
        padding: 10px;
      }
      svg { width: 100%; height: 100%; overflow: visible; }
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 13px;
      }
      th, td {
        text-align: left;
        padding: 10px 0;
        border-bottom: 1px solid rgba(255,255,255,0.06);
      }
      th { color: var(--muted); font-weight: 500; }
      .bar {
        height: 10px;
        border-radius: 999px;
        background: rgba(255,255,255,0.08);
        overflow: hidden;
      }
      .bar > span {
        display: block;
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(90deg, var(--accent), #38bdf8);
      }
      .empty {
        color: var(--muted);
        padding: 18px 0 4px;
      }
      @media (max-width: 980px) {
        .span-3, .span-4, .span-5, .span-6, .span-7, .span-8, .span-12 { grid-column: span 12; }
        .mini-grid { grid-template-columns: 1fr; }
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="hero">
        <div>
          <h1>Runtime Pressure Dashboard</h1>
          <p>Track what is consuming CPU time, memory, and event-loop headroom on this server.</p>
          <p class="meta" id="subtitle">Waiting for first sample...</p>
        </div>
        <div class="status">
          <span class="dot"></span>
          <span id="status-text">Polling /admin/runtime/debug every 5s</span>
        </div>
      </div>

      <div class="grid">
        <section class="panel span-3" id="summary-runtime"></section>
        <section class="panel span-3" id="summary-memory"></section>
        <section class="panel span-3" id="summary-load"></section>
        <section class="panel span-3" id="summary-world"></section>
        <section class="panel span-8" id="timeline-panel"></section>
        <section class="panel span-4" id="hotspots-panel"></section>
        <section class="panel span-6" id="collections-panel"></section>
        <section class="panel span-6" id="events-panel"></section>
      </div>
    </div>
    <script>
      const setHtml = (id, html) => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = html;
      };
      const fmt = (value, suffix = "") => {
        if (value === null || value === undefined || Number.isNaN(Number(value))) return "n/a";
        return \`\${Number(value).toLocaleString(undefined, { maximumFractionDigits: 1 })}\${suffix}\`;
      };
      const fmtTime = (ts) => new Date(ts).toLocaleTimeString();
      const healthFlag = (value, warnAt, dangerAt, inverse = false) => {
        const state = inverse
          ? value <= dangerAt ? "danger" : value <= warnAt ? "warn" : "good"
          : value >= dangerAt ? "danger" : value >= warnAt ? "warn" : "good";
        return \`<span class="flag \${state}">\${state}</span>\`;
      };
      const sparkline = (values, color, maxValue) => {
        if (!values.length) return '<div class="empty">No samples yet.</div>';
        const width = 600;
        const height = 140;
        const max = Math.max(maxValue || 0, ...values, 1);
        const min = Math.min(...values, 0);
        const range = Math.max(1, max - min);
        const points = values.map((value, index) => {
          const x = (index / Math.max(1, values.length - 1)) * width;
          const y = height - ((value - min) / range) * height;
          return \`\${x},\${y}\`;
        }).join(" ");
        return \`
          <svg viewBox="0 0 \${width} \${height}" preserveAspectRatio="none">
            <polyline fill="none" stroke="\${color}" stroke-width="3" points="\${points}" />
          </svg>
        \`;
      };
      const metricRow = (label, value, detail = "") => \`
        <div class="metric">
          <div>
            <div class="muted">\${label}</div>
            \${detail ? \`<div class="muted">\${detail}</div>\` : ""}
          </div>
          <div style="text-align:right"><strong>\${value}</strong></div>
        </div>
      \`;
      const renderCollections = (items) => {
        if (!items.length) return '<div class="empty">No collection stats available.</div>';
        const max = Math.max(...items.map((item) => item.entries), 1);
        return \`
          <h2>Largest Internal Collections</h2>
          <table>
            <thead><tr><th>Collection</th><th>Entries</th><th>Share</th></tr></thead>
            <tbody>
              \${items.map((item) => \`
                <tr>
                  <td>\${item.name}</td>
                  <td>\${item.entries.toLocaleString()}</td>
                  <td style="width:38%">
                    <div class="bar"><span style="width:\${Math.max(4, (item.entries / max) * 100)}%"></span></div>
                  </td>
                </tr>\`).join("")}
            </tbody>
          </table>
        \`;
      };
      const renderHotspotBlock = (title, hotspot, extraHtml) => \`
        <div style="padding:12px 0;border-top:1px solid rgba(255,255,255,0.06)">
          <div style="display:flex;justify-content:space-between;gap:12px;align-items:center">
            <strong>\${title}</strong>
            \${healthFlag(hotspot.p95Ms, 40, 100)}
          </div>
          <div class="mini-grid" style="margin-top:10px">
            <div>\${metricRow("Last", fmt(hotspot.lastMs, " ms"))}</div>
            <div>\${metricRow("P95", fmt(hotspot.p95Ms, " ms"))}</div>
            <div>\${metricRow("Average", fmt(hotspot.avgMs, " ms"))}</div>
            <div>\${metricRow("Max", fmt(hotspot.maxMs, " ms"))}</div>
          </div>
          \${extraHtml}
        </div>
      \`;
      const load = async () => {
        try {
          const res = await fetch("/admin/runtime/debug", { cache: "no-store" });
          const data = await res.json();
          const runtime = data.runtime;
          const vitals = data.history.vitals || [];
          const rssSeries = vitals.map((entry) => entry.rssMb);
          const cpuSeries = vitals.map((entry) => entry.cpuPercent);
          const loopSeries = vitals.map((entry) => entry.eventLoopUtilizationPercent);
          document.getElementById("subtitle").textContent =
            \`PID \${runtime.pid} • Node \${runtime.nodeVersion} • \${runtime.cpuCount} CPU cores • last sample \${fmtTime(data.at)}\`;

          setHtml("summary-runtime", \`
            <h2>Process Runtime</h2>
            \${metricRow("CPU (host normalized)", fmt(runtime.cpuPercent, "%"), "Percent of total machine CPU capacity")}
            \${metricRow("CPU (single core view)", fmt(runtime.cpuSingleCorePercent, "%"), "Can exceed 100% when multiple cores are busy")}
            \${metricRow("Event loop utilization", fmt(runtime.eventLoopUtilizationPercent, "%"))}
            \${metricRow("Uptime", fmt(runtime.uptimeSec, " s"))}
            \${metricRow("Handles / requests", \`\${fmt(runtime.activeHandles)} / \${fmt(runtime.activeRequests)}\`)}
          \`);

          setHtml("summary-memory", \`
            <h2>Memory</h2>
            \${metricRow("RSS", fmt(runtime.rssMb, " MB"), healthFlag(runtime.rssMb, 700, 1200))}
            \${metricRow("Heap used", fmt(runtime.heapUsedMb, " MB"))}
            \${metricRow("Heap total", fmt(runtime.heapTotalMb, " MB"))}
            \${metricRow("External", fmt(runtime.externalMb, " MB"))}
            \${metricRow("Array buffers", fmt(runtime.arrayBuffersMb, " MB"))}
          \`);

          setHtml("summary-load", \`
            <h2>Pressure</h2>
            \${metricRow("Event loop p95", fmt(runtime.eventLoopDelayP95Ms, " ms"), healthFlag(runtime.eventLoopDelayP95Ms, 30, 80))}
            \${metricRow("Event loop max", fmt(runtime.eventLoopDelayMaxMs, " ms"))}
            \${metricRow("Pending auth verifications", fmt(data.queuePressure.pendingAuthVerifications))}
            \${metricRow("Runtime intervals", fmt(data.queuePressure.runtimeIntervals))}
            \${metricRow("AI budget breaches", fmt(data.aiBudget.breaches), healthFlag(data.aiBudget.breaches, 1, 3))}
            \${metricRow("Chunk cache payload", fmt(data.caches.cachedChunkPayloadMb, " MB"))}
          \`);

          setHtml("summary-world", \`
            <h2>World / Cache Load</h2>
            \${metricRow("Players online / total", \`\${fmt(data.counts.onlinePlayers)} / \${fmt(data.counts.totalPlayers)}\`)}
            \${metricRow("AI players", fmt(data.counts.aiPlayers))}
            \${metricRow("Ownership tiles", fmt(data.counts.ownershipTiles))}
            \${metricRow("Towns / docks / clusters", \`\${fmt(data.counts.towns)} / \${fmt(data.counts.docks)} / \${fmt(data.counts.clusters)}\`)}
            \${metricRow("Visibility / chunk cache", \`\${fmt(data.caches.visibilitySnapshots)} / \${fmt(data.caches.cachedChunkPlayers)}\`)}
          \`);

          setHtml("timeline-panel", \`
            <h2>Recent Pressure Timeline</h2>
            <div class="mini-grid">
              <div>
                <div class="muted">CPU % of host</div>
                <div class="chart">\${sparkline(cpuSeries, "#67e8f9", 100)}</div>
              </div>
              <div>
                <div class="muted">RSS MB</div>
                <div class="chart">\${sparkline(rssSeries, "#f87171")}</div>
              </div>
              <div>
                <div class="muted">Event loop utilization %</div>
                <div class="chart">\${sparkline(loopSeries, "#fbbf24", 100)}</div>
              </div>
              <div>
                <div class="muted">Actionable read</div>
                <div class="metric">
                  <div>
                    <div class="muted">If CPU climbs with AI p95, AI ticks are the likely thief.</div>
                    <div class="muted">If RSS climbs with chunk cache MB, snapshot caching is the likely thief.</div>
                    <div class="muted">If event-loop delay spikes while handles stay flat, a synchronous code path is blocking.</div>
                  </div>
                </div>
              </div>
            </div>
          \`);

          setHtml("hotspots-panel", \`
            <h2>Internal Hotspots</h2>
            \${renderHotspotBlock("AI tick loop", data.hotspots.aiTicks, \`
              <div class="muted" style="margin-top:8px">Last AI player count: \${fmt(data.hotspots.aiTicks.lastAiPlayers)}</div>
            \`)}
            \${renderHotspotBlock("AI budget breaches", data.hotspots.aiBudget, \`
              <div class="muted" style="margin-top:8px">Budget: \${fmt(data.hotspots.aiBudget.budgetMs, " ms")} • Last phase: \${data.hotspots.aiBudget.lastPhase || "n/a"} • Last action: \${data.hotspots.aiBudget.lastActionKey || "n/a"}</div>
            \`)}
            \${renderHotspotBlock("Chunk snapshot generation", data.hotspots.chunkSnapshots, \`
              <div class="muted" style="margin-top:8px">Largest recent snapshot: \${fmt(data.hotspots.chunkSnapshots.maxChunks)} chunks / \${fmt(data.hotspots.chunkSnapshots.maxTiles)} tiles</div>
              <div class="muted" style="margin-top:8px">Last phases: mask \${fmt(data.hotspots.chunkSnapshots.lastVisibilityMaskMs, " ms")} • read \${fmt(data.hotspots.chunkSnapshots.lastSummaryReadMs, " ms")} • serialize \${fmt(data.hotspots.chunkSnapshots.lastSerializeMs, " ms")} • send \${fmt(data.hotspots.chunkSnapshots.lastSendMs, " ms")}</div>
              <div class="muted" style="margin-top:4px">P95 phases: mask \${fmt(data.hotspots.chunkSnapshots.visibilityMaskP95Ms, " ms")} • read \${fmt(data.hotspots.chunkSnapshots.summaryReadP95Ms, " ms")} • serialize \${fmt(data.hotspots.chunkSnapshots.serializeP95Ms, " ms")} • send \${fmt(data.hotspots.chunkSnapshots.sendP95Ms, " ms")}</div>
              <div class="muted" style="margin-top:4px">Reuse: cached chunks avg \${fmt(data.hotspots.chunkSnapshots.cachedPayloadChunksAvg)} • rebuilt avg \${fmt(data.hotspots.chunkSnapshots.rebuiltChunksAvg)} • batches avg \${fmt(data.hotspots.chunkSnapshots.batchesAvg)}</div>
            \`)}
          \`);

          setHtml("collections-panel", renderCollections(data.collections));

          const aiHistory = data.history.aiTicks || [];
          const chunkHistory = data.history.chunkSnapshots || [];
          setHtml("events-panel", \`
            <h2>Recent Heavy Operations</h2>
            <table>
              <thead><tr><th>Category</th><th>Latest</th><th>P95</th><th>Samples</th></tr></thead>
              <tbody>
                <tr><td>AI ticks</td><td>\${fmt(data.hotspots.aiTicks.lastMs, " ms")}</td><td>\${fmt(data.hotspots.aiTicks.p95Ms, " ms")}</td><td>\${fmt(data.hotspots.aiTicks.samples)}</td></tr>
                <tr><td>AI budget</td><td>\${fmt(data.hotspots.aiBudget.lastMs, " ms")}</td><td>\${fmt(data.hotspots.aiBudget.p95Ms, " ms")}</td><td>\${fmt(data.hotspots.aiBudget.samples)}</td></tr>
                <tr><td>Chunk snapshots</td><td>\${fmt(data.hotspots.chunkSnapshots.lastMs, " ms")}</td><td>\${fmt(data.hotspots.chunkSnapshots.p95Ms, " ms")}</td><td>\${fmt(data.hotspots.chunkSnapshots.samples)}</td></tr>
                <tr><td>Last AI sample at</td><td colspan="3">\${aiHistory.length ? fmtTime(aiHistory[aiHistory.length - 1].at) : "n/a"}</td></tr>
                <tr><td>Last chunk snapshot at</td><td colspan="3">\${chunkHistory.length ? fmtTime(chunkHistory[chunkHistory.length - 1].at) : "n/a"}</td></tr>
              </tbody>
            </table>
          \`);
        } catch (err) {
          document.getElementById("status-text").textContent = \`Dashboard fetch failed: \${err instanceof Error ? err.message : String(err)}\`;
        }
      };
      load();
      setInterval(load, 5000);
    </script>
  </body>
</html>`;

const app = Fastify({ logger: true });
runtimeState.appRef = app;
const runtimeIncidentLog = createRuntimeIncidentLog({
  snapshotDir: SNAPSHOT_DIR,
  ...(RUNTIME_INCIDENT_WEBHOOK_URL ? { notifyWebhookUrl: RUNTIME_INCIDENT_WEBHOOK_URL } : {}),
  logger: app.log
});
runtimeIncidentLog.record("boot_started", { pid: process.pid, startedAt: startupState.startedAt });
await runtimeIncidentLog.notifyLastCrashReport();
await app.register(cors, { origin: true });
await app.register(websocket as never);

app.get("/health", async (_request, reply) => {
  if (!startupState.ready) {
    reply.code(503);
    return {
      ok: false,
      status: "starting",
      startupElapsedMs: Date.now() - startupState.startedAt,
      phase: startupState.currentPhase ?? "boot"
    };
  }
  return {
    ok: true,
    startupElapsedMs: (startupState.completedAt ?? Date.now()) - startupState.startedAt
  };
});
app.get("/season", async () => ({
  activeSeason,
  seasonWinner,
  seasonTechTreeId: activeSeason.techTreeConfigId,
  activeRoots: activeSeasonTechConfig.rootNodeIds,
  activeTechNodeCount: activeSeasonTechConfig.activeNodeIds.size,
  archiveCount: seasonArchives.length
}));
app.get("/admin/telemetry", async () => {
  let activeTowns = 0;
  let supportSum = 0;
  let supportCount = 0;
  for (const town of townsByTile.values()) {
    const [x, y] = parseKey(town.tileKey);
    const t = playerTile(x, y);
    if (!t.ownerId || t.ownershipState !== "SETTLED") continue;
    activeTowns += 1;
    const support = townSupport(town.tileKey, t.ownerId);
    if (support.supportMax > 0) {
      supportSum += support.supportCurrent / support.supportMax;
      supportCount += 1;
    }
  }
  return {
    ok: true,
    at: now(),
    onlinePlayers: onlineSocketCount(),
    totalPlayers: players.size,
    activeTowns,
    avgTownSupportRatio: supportCount > 0 ? supportSum / supportCount : 0,
    counters: telemetryCounters
  };
});
app.get("/admin/ai/debug", async () => {
  const entries = [...aiTurnDebugByPlayer.values()].sort((a, b) => a.name.localeCompare(b.name));
  const reasons = new Map<string, number>();
  for (const entry of entries) reasons.set(entry.reason, (reasons.get(entry.reason) ?? 0) + 1);
  return {
    ok: true,
    at: now(),
    aiPlayers: entries.length,
    reasons: [...reasons.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason)),
    entries
  };
});
app.get("/admin/players", async () =>
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
);
app.get("/admin/runtime/debug", async () => runtimeDashboardPayload());
app.get("/admin/runtime/incidents", async () => ({
  ok: true,
  currentBootId: runtimeIncidentLog.bootId,
  lastUncleanShutdown: runtimeIncidentLog.getLastCrashReport()
}));
app.get("/admin/runtime/dashboard", async (_request, reply) => {
  reply.type("text/html; charset=utf-8");
  return renderRuntimeDashboardHtml();
});
app.post("/admin/season/rollover", async () => {
  if (!SEASONS_ENABLED) return { ok: false, disabled: true, message: "seasons temporarily disabled" };
  startNewSeason();
  await saveSnapshot();
  return { ok: true, activeSeason };
});
app.post("/admin/world/regenerate", async () => {
  regenerateWorldInPlace();
  await saveSnapshot();
  return { ok: true, activeSeason, regenerated: true };
});

(
  app as unknown as {
    get: (path: string, opts: { websocket: boolean }, handler: (connection: unknown) => void) => void;
  }
).get("/ws", { websocket: true }, (connection) => {
  const maybeSocket = (connection as { socket?: Ws } | Ws);
  const socket: Ws | undefined = (
    "socket" in maybeSocket ? maybeSocket.socket : maybeSocket
  ) as Ws | undefined;
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
      sendLoginPhase(socket, "AUTH_RECEIVED", "Securing session", "Game server reached. Verifying your Google session...");
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
      authSyncTimingByPlayer.set(player.id, { authVerifiedAt: verifiedAt });
      sendLoginPhase(socket, "AUTH_VERIFIED", "Securing session", "Google session verified. Loading your empire record...");
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
          truceRequests: [...truceRequests.values()].filter((r) => r.toPlayerId === player.id),
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
    if (await simulationService.handleGatewayMessage(actor, msg, socket)) return;

    if (msg.type === "PING") {
      socket.send(JSON.stringify({ type: "PONG", t: msg.t }));
      return;
    }

    if (msg.type === "SET_TILE_COLOR") {
      actor.tileColor = msg.color;
      broadcast({ type: "PLAYER_STYLE", playerId: actor.id, ...playerStylePayload(actor) });
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
      broadcast({ type: "PLAYER_STYLE", playerId: actor.id, ...playerStylePayload(actor) });
      sendPlayerUpdate(actor, 0);
      return;
    }

    if (msg.type === "SET_FOG_DISABLED") {
      if (!playerHasFogAdminAccess(actor.id)) {
        socket.send(JSON.stringify({ type: "ERROR", code: "ADMIN_ONLY", message: "fog toggle is admin-only" }));
        return;
      }
      fogDisabledByPlayer.set(actor.id, msg.disabled);
      socket.send(JSON.stringify({ type: "FOG_UPDATE", fogDisabled: DISABLE_FOG || msg.disabled }));
      const sub = chunkSubscriptionByPlayer.get(actor.id);
      if (sub) {
        sendChunkSnapshot(socket, actor, sub);
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
      sendToPlayer(actor.id, { type: "TILE_DELTA", updates: [playerTile(x, y)] });
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
        sendToPlayer(actor.id, { type: "TILE_DELTA", updates });
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
      broadcast({ type: "PLAYER_STYLE", playerId: actor.id, ...playerStylePayload(actor) });
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
      broadcast({ type: "PLAYER_STYLE", playerId: actor.id, ...playerStylePayload(actor) });
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
      const request: AllianceRequest = {
        id: crypto.randomUUID(),
        fromPlayerId: actor.id,
        toPlayerId: target.id,
        createdAt: now(),
        expiresAt: now() + ALLIANCE_REQUEST_TTL_MS,
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
      const request = allianceRequests.get(msg.requestId);
      if (!request || request.toPlayerId !== actor.id || request.expiresAt < now()) {
        socket.send(JSON.stringify({ type: "ERROR", code: "ALLIANCE_REQUEST_INVALID", message: "request invalid or expired" }));
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
        sendLoginPhase(socket, "MAP_SUBSCRIBE", "Connecting your empire...", `Requesting your world view near (${sub.cx}, ${sub.cy})...`);
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
          socket,
          actor,
          { ...sub, radius: INITIAL_CHUNK_BOOTSTRAP_RADIUS },
          buildBootstrapChunkStages(sub),
          chunkCoordsForSubscription({ ...sub, radius: INITIAL_CHUNK_BOOTSTRAP_RADIUS })
        );
        return;
      }
      sendChunkSnapshot(socket, actor, sub);
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
      sendToPlayer(actor.id, { type: "TILE_DELTA", updates: [playerTile(wx, wy)] });
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
      const atkEff = 10 * actor.mods.attack * siegeAtkMult * activeAttackBuffMult(actor.id) * attackMultiplierForTarget(actor.id, to);
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
    const actionTimes = pruneActionTimes(actor.id, nowMs);
    if (actionTimes.length >= ACTION_LIMIT) {
      app.log.info({ playerId: actor.id, action: msg.type }, "action rejected: rate limit");
      socket.send(JSON.stringify({ type: "ERROR", code: "RATE_LIMIT", message: "too many actions; slow down briefly" }));
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
      socket.send(JSON.stringify({ type: "ERROR", code: "EXPAND_TARGET_OWNED", message: "expand only targets neutral land" }));
      return;
    }
    if (isBreakthroughAttack && !to.ownerId) {
      logTileSync("action_validation_rejected_breakthrough_target_invalid", actionValidationPayload(actor.id, msg.type, from, to));
      app.log.info({ playerId: actor.id, to: preTk }, "action rejected: breakthrough target not enemy");
      socket.send(JSON.stringify({ type: "ERROR", code: "BREAKTHROUGH_TARGET_INVALID", message: "breakthrough requires enemy tile" }));
      return;
    }
    if (isBreakthroughAttack && !actor.techIds.has(BREAKTHROUGH_REQUIRED_TECH_ID)) {
      socket.send(JSON.stringify({ type: "ERROR", code: "BREAKTHROUGH_TARGET_INVALID", message: "requires Breach Doctrine" }));
      return;
    }
    if (msg.type === "ATTACK" && (!to.ownerId || to.ownerId === actor.id)) {
      logTileSync("action_validation_rejected_attack_target_invalid", actionValidationPayload(actor.id, msg.type, from, to));
      app.log.info({ playerId: actor.id, to: preTk, ownerId: to.ownerId }, "action rejected: attack target not enemy");
      socket.send(JSON.stringify({ type: "ERROR", code: "ATTACK_TARGET_INVALID", message: "target must be enemy-controlled land" }));
      return;
    }
    if (!hasEnoughManpower(actor, manpowerMin)) {
      socket.send(JSON.stringify({ type: "ERROR", code: "INSUFFICIENT_MANPOWER", message: `need ${manpowerMin.toFixed(0)} manpower to launch attack` }));
      return;
    }
    if ((msg.type === "EXPAND" || msg.type === "ATTACK") && actor.points < FRONTIER_ACTION_GOLD_COST) {
      app.log.info({ playerId: actor.id, action: msg.type, points: actor.points, required: FRONTIER_ACTION_GOLD_COST }, "action rejected: insufficient gold");
      socket.send(
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
      socket.send(JSON.stringify({ type: "ERROR", code: "INSUFFICIENT_GOLD", message: "insufficient gold for breakthrough" }));
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
      socket.send(
        JSON.stringify({
          type: "ERROR",
          code: "NOT_ADJACENT",
          message: "target must be adjacent, valid dock crossing, or active aether bridge target"
        })
      );
      return;
    }
    if (dockCrossing && fromDock && fromDock.cooldownUntil > now()) {
      app.log.info({ playerId: actor.id, dockId: fromDock.dockId, cooldownUntil: fromDock.cooldownUntil }, "action rejected: dock cooldown");
      socket.send(JSON.stringify({ type: "ERROR", code: "DOCK_COOLDOWN", message: "dock crossing endpoint on cooldown" }));
      return;
    }

    if (from.ownerId !== actor.id) {
      logTileSync("action_validation_rejected_origin_not_owned", actionValidationPayload(actor.id, msg.type, from, to));
      app.log.info({ playerId: actor.id, from: fk, fromOwner: from.ownerId }, "action rejected: origin not owned");
      socket.send(JSON.stringify({ type: "ERROR", code: "NOT_OWNER", message: "origin not owned" }));
      return;
    }

    if (to.terrain !== "LAND") {
      logTileSync("action_validation_rejected_barrier", actionValidationPayload(actor.id, msg.type, from, to));
      app.log.info({ playerId: actor.id, to: tk, terrain: to.terrain }, "action rejected: barrier target");
      socket.send(JSON.stringify({ type: "ERROR", code: "BARRIER", message: "target is barrier" }));
      return;
    }

    if (combatLocks.has(fk)) {
      app.log.info({ playerId: actor.id, from: fk, to: tk }, "action rejected: attack cooldown");
      const cooldownRemainingMs = Math.max(0, (combatLocks.get(fk)?.resolvesAt ?? now()) - now());
      socket.send(
        JSON.stringify({
          type: "ERROR",
          code: "ATTACK_COOLDOWN",
          message: "origin tile is still on attack cooldown",
          cooldownRemainingMs
        })
      );
      return;
    }

    if (combatLocks.has(tk)) {
      app.log.info({ playerId: actor.id, from: fk, to: tk }, "action rejected: combat lock");
      socket.send(JSON.stringify({ type: "ERROR", code: "LOCKED", message: "tile locked in combat" }));
      return;
    }

    const defenderIsBarbarian = to.ownerId === BARBARIAN_OWNER_ID;
    const defender = to.ownerId && !defenderIsBarbarian ? players.get(to.ownerId) : undefined;
    if (defender && (actor.allies.has(defender.id) || truceBlocksHostility(actor.id, defender.id))) {
      logTileSync("action_validation_rejected_ally_target", actionValidationPayload(actor.id, msg.type, from, to));
      app.log.info({ playerId: actor.id, defenderId: defender.id }, "action rejected: allied target");
      socket.send(JSON.stringify({ type: "ERROR", code: "ALLY_TARGET", message: "cannot attack allied or truced tile" }));
      return;
    }
    if (isBreakthroughAttack) {
      if (!consumeStrategicResource(actor, "IRON", BREAKTHROUGH_IRON_COST)) {
        app.log.info({ playerId: actor.id }, "action rejected: insufficient IRON for breakthrough");
        socket.send(JSON.stringify({ type: "ERROR", code: "INSUFFICIENT_RESOURCE", message: "insufficient IRON for breakthrough" }));
        return;
      }
      actor.points -= BREAKTHROUGH_GOLD_COST;
      recalcPlayerDerived(actor);
      telemetryCounters.breakthroughAttacks += 1;
    }
    if (!actor.isAi && defender?.isAi) markAiDefensePriority(defender.id);
    let precomputedCombat:
      | {
          atkEff: number;
          defEff: number;
          winChance: number;
          win: boolean;
          previewChanges: Array<{
            x: number;
            y: number;
            ownerId?: string;
            ownershipState?: "FRONTIER" | "SETTLED" | "BARBARIAN";
          }>;
          previewWinnerId?: string;
          defenderOwnerId?: string;
          previewManpowerDelta?: number;
        }
      | undefined;
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
      const combat = await resolveCombatViaWorker({
        attackBase:
          10 *
          actor.mods.attack *
          activeAttackBuffMult(actor.id) *
          attackMultiplierForTarget(actor.id, to) *
          siegeAtkMult,
        defenseBase: defenderIsBarbarian
          ? 10 * BARBARIAN_DEFENSE_POWER * dockMult
          : 10 * (defender?.mods.defense ?? 1) * defMult * fortMult * dockMult * settledDefenseMult * newSettlementDefenseMult * ownershipDefenseMult +
            frontierDefenseAdd
      });
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
      precomputedCombat = {
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
    if (precomputedCombat) pending.precomputedCombat = precomputedCombat;
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
    socket.send(
      JSON.stringify({
        type: "ACTION_ACCEPTED",
        actionType: msg.type,
        origin: { x: from.x, y: from.y },
        target: { x: to.x, y: to.y },
        resolvesAt
      })
    );
    logAttackTrace("accepted_ack_sent", pending, {
      socketReadyState: socket.readyState
    });
    const predictedResult =
      pending.precomputedCombat
        ? {
            attackType: msg.type,
            attackerWon: pending.precomputedCombat.win,
            winnerId: pending.precomputedCombat.previewWinnerId,
            defenderOwnerId: pending.precomputedCombat.defenderOwnerId,
            origin: { x: from.x, y: from.y },
            target: { x: to.x, y: to.y },
            changes: pending.precomputedCombat.previewChanges,
            manpowerDelta: pending.precomputedCombat.previewManpowerDelta
          }
        : msg.type === "EXPAND" && !to.ownerId
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
    socket.send(
      JSON.stringify({
        type: "COMBAT_START",
        origin: { x: from.x, y: from.y },
        target: { x: to.x, y: to.y },
        resolvesAt,
        ...(predictedResult ? { predictedResult } : {})
      })
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
        socket.send(
          JSON.stringify({
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
          })
        );
        logExpandTrace("combat_result_sent", pending, { neutralTarget: true });
        logAttackTrace("combat_result_sent", pending, { neutralTarget: true });
        sendPlayerUpdate(actor, 0);
        sendLocalVisionDeltaForPlayer(actor.id, [{ x: to.x, y: to.y }]);
        logExpandTrace("vision_delta_sent", pending, { centers: 1, neutralTarget: true });
        logAttackTrace("vision_delta_sent", pending, { centers: 1, neutralTarget: true });
        return;
      }

      if (defender && defender.spawnShieldUntil > now()) {
        socket.send(JSON.stringify({ type: "ERROR", code: "SHIELDED", message: "target shielded" }));
        return;
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

      socket.send(JSON.stringify({
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
      }));
      logExpandTrace("combat_result_sent", pending, { neutralTarget: false, changes: resultChanges.length });
      logAttackTrace("combat_result_sent", pending, {
        neutralTarget: false,
        changes: resultChanges.length,
        socketReadyState: socket.readyState
      });
      sendPlayerUpdate(actor, 0);
      if (defender && !defenderIsBarbarian) sendPlayerUpdate(defender, 0);
      const changedCenters = resultChanges.map((change) => ({ x: change.x, y: change.y }));
      sendLocalVisionDeltaForPlayer(actor.id, changedCenters);
      logExpandTrace("vision_delta_sent", pending, { centers: changedCenters.length, targetPlayer: actor.id });
      logAttackTrace("vision_delta_sent", pending, {
        centers: changedCenters.length,
        targetPlayer: actor.id
      });
      if (defender && !defenderIsBarbarian) sendLocalVisionDeltaForPlayer(defender.id, changedCenters);
    }, resolvesAt - now());
  });

  socket.on("close", () => {
    if (authedPlayer) {
      for (const pcap of pendingCapturesByAttacker(authedPlayer.id)) cancelPendingCapture(pcap);
      socketsByPlayer.delete(authedPlayer.id);
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
