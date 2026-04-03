import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import {
  ATTACK_MANPOWER_COST,
  ATTACK_MANPOWER_MIN,
  BARBARIAN_ACTION_INTERVAL_MS,
  BARBARIAN_ATTACK_POWER,
  BARBARIAN_CLEAR_GOLD_REWARD,
  BARBARIAN_DEFENSE_POWER,
  BARBARIAN_MULTIPLY_THRESHOLD,
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
  ECONOMIC_STRUCTURE_REMOVE_MS,
  FRONTIER_CLAIM_MS,
  DOCK_CROSSING_COOLDOWN_MS,
  DOCK_DEFENSE_MULT,
  DOCK_PAIRS_MAX,
  DOCK_PAIRS_MIN,
  FORT_BUILD_COST,
  FORT_BUILD_MS,
  FORT_DEFENSE_MULT,
  OBSERVATORY_BUILD_MS,
  SIEGE_OUTPOST_ATTACK_MULT,
  SIEGE_OUTPOST_BUILD_COST,
  SIEGE_OUTPOST_BUILD_MS,
  PVP_REPEAT_FLOOR,
  PVP_REPEAT_WINDOW_MS,
  SEASON_LENGTH_DAYS,
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
  continentIdAt,
  exposureWeightFromSides,
  terrainAt,
  wrapX,
  wrapY,
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
import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import { Worker } from "node:worker_threads";
import { z } from "zod";
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { loadTechTree, type StatsModKey } from "./tech-tree.js";
import { loadDomainTree } from "./domain-tree.js";
import { rankSeasonVictoryPaths, type AiSeasonVictoryPathId } from "./ai/goap.js";
import { planAiDecision, type AiPlanningDecision, type AiPlanningSnapshot } from "./ai/planner-shared.js";
import { resolveCombatRoll, type CombatResolutionRequest, type CombatResolutionResult } from "./sim/combat-shared.js";
import { buildChunkFromInput, serializeChunkBatchBodies, serializeChunkBody, type ChunkBuildInput, type ChunkPayloadChunk } from "./chunk/serializer-shared.js";

const PORT = Number(process.env.PORT ?? 3001);
const DISABLE_FOG = process.env.DISABLE_FOG === "1";
const AI_PLAYERS = Number(process.env.AI_PLAYERS ?? 40);
const DEBUG_SPAWN_NEAR_AI = process.env.DEBUG_SPAWN_NEAR_AI === "1";
const STARTING_MANPOWER = Math.max(MANPOWER_BASE_CAP, Number(process.env.STARTING_MANPOWER ?? MANPOWER_BASE_CAP));
const AI_TICK_MS = Number(process.env.AI_TICK_MS ?? 3_000);
const AI_DISPATCH_INTERVAL_MS = Math.max(100, Number(process.env.AI_DISPATCH_INTERVAL_MS ?? 250));
const AI_TICK_BATCH_SIZE = Math.max(1, Number(process.env.AI_TICK_BATCH_SIZE ?? 1));
const AI_HUMAN_PRIORITY_BATCH_SIZE = Math.max(1, Number(process.env.AI_HUMAN_PRIORITY_BATCH_SIZE ?? 1));
const AI_HUMAN_DEFENSE_BATCH_SIZE = Math.max(
  AI_HUMAN_PRIORITY_BATCH_SIZE,
  Number(process.env.AI_HUMAN_DEFENSE_BATCH_SIZE ?? Math.max(2, AI_HUMAN_PRIORITY_BATCH_SIZE))
);
const AI_AUTH_PRIORITY_BATCH_SIZE = Math.max(1, Number(process.env.AI_AUTH_PRIORITY_BATCH_SIZE ?? AI_HUMAN_PRIORITY_BATCH_SIZE));
const AI_DEFENSE_PRIORITY_MS = Math.max(2_000, Number(process.env.AI_DEFENSE_PRIORITY_MS ?? 15_000));
const AI_WORKER_QUEUE_SOFT_LIMIT = Math.max(1, Number(process.env.AI_WORKER_QUEUE_SOFT_LIMIT ?? AI_TICK_BATCH_SIZE * 2));
const AI_SIM_QUEUE_SOFT_LIMIT = Math.max(1, Number(process.env.AI_SIM_QUEUE_SOFT_LIMIT ?? AI_TICK_BATCH_SIZE * 3));
const AI_EVENT_LOOP_P95_SOFT_LIMIT_MS = Math.max(10, Number(process.env.AI_EVENT_LOOP_P95_SOFT_LIMIT_MS ?? 60));
const AI_EVENT_LOOP_UTILIZATION_SOFT_LIMIT_PCT = Math.max(5, Number(process.env.AI_EVENT_LOOP_UTILIZATION_SOFT_LIMIT_PCT ?? 65));
const AI_COMPETITION_CONTEXT_TTL_MS = Math.max(250, Number(process.env.AI_COMPETITION_CONTEXT_TTL_MS ?? 2_000));
const AI_YIELD_COLLECTION_INTERVAL_MS = Math.max(250, Number(process.env.AI_YIELD_COLLECTION_INTERVAL_MS ?? 2_000));
const AI_PLANNER_WORKER_ENABLED = process.env.AI_PLANNER_WORKER !== "0";
const AI_PLANNER_TIMEOUT_MS = Math.max(50, Number(process.env.AI_PLANNER_TIMEOUT_MS ?? 750));
const SIM_COMBAT_WORKER_ENABLED = process.env.SIM_COMBAT_WORKER !== "0";
const SIM_COMBAT_TIMEOUT_MS = Math.max(50, Number(process.env.SIM_COMBAT_TIMEOUT_MS ?? 750));
const CHUNK_SERIALIZER_WORKER_ENABLED = process.env.CHUNK_SERIALIZER_WORKER !== "0";
const CHUNK_SERIALIZER_TIMEOUT_MS = Math.max(50, Number(process.env.CHUNK_SERIALIZER_TIMEOUT_MS ?? 750));
const SIM_DRAIN_BUDGET_MS = Math.max(4, Number(process.env.SIM_DRAIN_BUDGET_MS ?? 12));
const SIM_DRAIN_MAX_COMMANDS = Math.max(1, Number(process.env.SIM_DRAIN_MAX_COMMANDS ?? 8));
const SIM_DRAIN_HUMAN_QUOTA = Math.max(1, Number(process.env.SIM_DRAIN_HUMAN_QUOTA ?? 6));
const SIM_DRAIN_SYSTEM_QUOTA = Math.max(1, Number(process.env.SIM_DRAIN_SYSTEM_QUOTA ?? 2));
const SIM_DRAIN_AI_QUOTA = Math.max(1, Number(process.env.SIM_DRAIN_AI_QUOTA ?? 2));
const MAX_SUBSCRIBE_RADIUS = Number(process.env.MAX_SUBSCRIBE_RADIUS ?? 2);
const CHUNK_STREAM_BATCH_SIZE = Math.max(1, Number(process.env.CHUNK_STREAM_BATCH_SIZE ?? 2));
const FOG_ADMIN_EMAIL = "bw199005@gmail.com";
const SNAPSHOT_DIR = path.resolve(process.env.SNAPSHOT_DIR ?? path.join(process.cwd(), "snapshots"));
const SNAPSHOT_FILE = path.join(SNAPSHOT_DIR, "state.json");
const SNAPSHOT_INDEX_FILE = path.join(SNAPSHOT_DIR, "state.index.json");
const SNAPSHOT_SECTION_FILES = {
  meta: "state.meta.json",
  players: "state.players.json",
  territory: "state.territory.json",
  economy: "state.economy.json",
  systems: "state.systems.json"
} as const;
const snapshotSectionFile = (name: keyof typeof SNAPSHOT_SECTION_FILES): string => path.join(SNAPSHOT_DIR, SNAPSHOT_SECTION_FILES[name]);

let appRef: FastifyInstance | undefined;
const startupState: {
  ready: boolean;
  startedAt: number;
  completedAt?: number;
  currentPhase?: string;
} = {
  ready: false,
  startedAt: Date.now()
};
const logRuntimeError = (message: string, err: unknown): void => {
  if (appRef) {
    appRef.log.error({ err }, message);
    return;
  }
  console.error(message, err);
};
const perfRing = <T>(limit: number): { push: (value: T) => void; values: () => T[] } => {
  const entries: T[] = [];
  return {
    push: (value: T): void => {
      entries.push(value);
      if (entries.length > limit) entries.shift();
    },
    values: (): T[] => [...entries]
  };
};
const roundTo = (value: number, digits = 1): number => {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
};
const percentile = (values: number[], ratio: number): number => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index] ?? 0;
};
const runtimeMemoryStats = (): {
  rssMb: number;
  heapUsedMb: number;
  heapTotalMb: number;
  externalMb: number;
  arrayBuffersMb: number;
} => {
  const usage = process.memoryUsage();
  const toMb = (value: number): number => Math.round((value / (1024 * 1024)) * 10) / 10;
  return {
    rssMb: toMb(usage.rss),
    heapUsedMb: toMb(usage.heapUsed),
    heapTotalMb: toMb(usage.heapTotal),
    externalMb: toMb(usage.external),
    arrayBuffersMb: toMb(usage.arrayBuffers)
  };
};
const runtimeCpuCount = Math.max(1, typeof os.availableParallelism === "function" ? os.availableParallelism() : os.cpus().length);
const eventLoopDelayMonitor = monitorEventLoopDelay({ resolution: 20 });
eventLoopDelayMonitor.enable();
let lastRuntimeCpuSampleAt = Date.now();
let lastRuntimeCpuUsage = process.cpuUsage();
let lastEventLoopUtilization = performance.eventLoopUtilization();
const getActiveHandleCount = (): number => {
  const getHandles = (process as NodeJS.Process & { _getActiveHandles?: () => unknown[] })._getActiveHandles;
  return typeof getHandles === "function" ? getHandles().length : 0;
};
const getActiveRequestCount = (): number => {
  const getRequests = (process as NodeJS.Process & { _getActiveRequests?: () => unknown[] })._getActiveRequests;
  return typeof getRequests === "function" ? getRequests().length : 0;
};
const sampleRuntimeVitals = (): {
  at: number;
  uptimeSec: number;
  cpuPercent: number;
  cpuSingleCorePercent: number;
  systemCpuPercent: number;
  eventLoopUtilizationPercent: number;
  eventLoopDelayP95Ms: number;
  eventLoopDelayMaxMs: number;
  activeHandles: number;
  activeRequests: number;
  rssMb: number;
  heapUsedMb: number;
  heapTotalMb: number;
  externalMb: number;
  arrayBuffersMb: number;
} => {
  const at = Date.now();
  const elapsedMs = Math.max(1, at - lastRuntimeCpuSampleAt);
  const elapsedMicros = elapsedMs * 1_000;
  const cpuUsage = process.cpuUsage(lastRuntimeCpuUsage);
  lastRuntimeCpuUsage = process.cpuUsage();
  lastRuntimeCpuSampleAt = at;
  const totalCpuMicros = cpuUsage.user + cpuUsage.system;
  const currentElu = performance.eventLoopUtilization();
  const deltaElu = performance.eventLoopUtilization(currentElu, lastEventLoopUtilization);
  lastEventLoopUtilization = currentElu;
  const memory = runtimeMemoryStats();
  const eventLoopDelayP95Ms = Number.isFinite(eventLoopDelayMonitor.percentile(95))
    ? eventLoopDelayMonitor.percentile(95) / 1_000_000
    : 0;
  const eventLoopDelayMaxMs = Number.isFinite(eventLoopDelayMonitor.max) ? eventLoopDelayMonitor.max / 1_000_000 : 0;
  eventLoopDelayMonitor.reset();
  return {
    at,
    uptimeSec: roundTo(process.uptime(), 1),
    cpuPercent: roundTo((totalCpuMicros / elapsedMicros / runtimeCpuCount) * 100, 1),
    cpuSingleCorePercent: roundTo((totalCpuMicros / elapsedMicros) * 100, 1),
    systemCpuPercent: roundTo((cpuUsage.system / elapsedMicros / runtimeCpuCount) * 100, 1),
    eventLoopUtilizationPercent: roundTo((deltaElu.utilization || 0) * 100, 1),
    eventLoopDelayP95Ms: roundTo(eventLoopDelayP95Ms, 1),
    eventLoopDelayMaxMs: roundTo(eventLoopDelayMaxMs, 1),
    activeHandles: getActiveHandleCount(),
    activeRequests: getActiveRequestCount(),
    ...memory
  };
};

type Ws = import("ws").WebSocket;
const NOOP_WS = { send: () => undefined, readyState: 1, OPEN: 1 } as unknown as Ws;

const logStartupPhase = (phase: string, startedAt: number, extra?: Record<string, unknown>): void => {
  startupState.currentPhase = phase;
  const elapsedMs = Date.now() - startedAt;
  if (appRef) {
    appRef.log.info({ phase, elapsedMs, startupElapsedMs: Date.now() - startupState.startedAt, ...extra }, "startup phase");
    return;
  }
  console.log("startup phase", { phase, elapsedMs, startupElapsedMs: Date.now() - startupState.startedAt, ...extra });
};

interface AuthIdentity {
  uid: string;
  playerId: string;
  name: string;
  email?: string | undefined;
}

const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID ?? "border-empires";
const FIREBASE_TOKEN_CACHE_TTL_MS = 55 * 60 * 1000;
const FIREBASE_JWKS_TIMEOUT_MS = Math.max(1_500, Number(process.env.FIREBASE_JWKS_TIMEOUT_MS ?? 4_000));
const FIREBASE_JWKS_COOLDOWN_MS = Math.max(5_000, Number(process.env.FIREBASE_JWKS_COOLDOWN_MS ?? 15_000));
const AUTH_PRIORITY_WINDOW_MS = Math.max(2_000, Number(process.env.AUTH_PRIORITY_WINDOW_MS ?? 10_000));
const firebaseJwks = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"),
  {
    timeoutDuration: FIREBASE_JWKS_TIMEOUT_MS,
    cooldownDuration: FIREBASE_JWKS_COOLDOWN_MS,
    cacheMaxAge: 12 * 60 * 60 * 1000
  }
);
const verifiedFirebaseTokenCache = new Map<string, { decoded: { uid: string; email?: string | undefined; name?: string | undefined }; expiresAt: number }>();
const firebaseAdminEnabled = Boolean(
  process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    (process.env.FIREBASE_ADMIN_CLIENT_EMAIL && process.env.FIREBASE_ADMIN_PRIVATE_KEY)
);
const firebaseAdminApp = firebaseAdminEnabled
  ? getApps()[0] ??
    initializeApp({
      credential: applicationDefault(),
      projectId: FIREBASE_PROJECT_ID
    })
  : undefined;
const firebaseAdminAuth = firebaseAdminApp ? getAuth(firebaseAdminApp) : undefined;
let pendingAuthVerifications = 0;
let authPriorityUntil = 0;
const authSyncTimingByPlayer = new Map<string, { authVerifiedAt?: number; initSentAt?: number; firstSubscribeAt?: number; firstChunkSentAt?: number }>();
const classifyAuthError = (err: unknown): { code: "AUTH_FAIL" | "AUTH_UNAVAILABLE"; message: string } => {
  const text = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  if (
    text.includes("JWKSTimeout") ||
    text.includes("ERR_JWKS_TIMEOUT") ||
    text.includes("fetch failed") ||
    text.includes("ECONNREFUSED") ||
    text.includes("ECONNRESET") ||
    text.includes("ENOTFOUND") ||
    text.includes("ETIMEDOUT") ||
    text.includes("timed out") ||
    text.includes("network")
  ) {
    return { code: "AUTH_UNAVAILABLE", message: "Authentication service temporarily unavailable." };
  }
  return { code: "AUTH_FAIL", message: "Firebase token verification failed." };
};

const cachedFirebaseIdentityForToken = (token: string): { uid: string; email?: string | undefined; name?: string | undefined } | undefined => {
  const cached = verifiedFirebaseTokenCache.get(token);
  if (!cached) return undefined;
  if (cached.expiresAt <= now()) {
    verifiedFirebaseTokenCache.delete(token);
    return undefined;
  }
  return cached.decoded;
};

const cacheVerifiedFirebaseIdentity = (
  token: string,
  decoded: { uid: string; email?: string | undefined; name?: string | undefined },
  exp?: number
): void => {
  const expiresAt =
    typeof exp === "number" && Number.isFinite(exp)
      ? Math.max(now() + 60_000, exp * 1000)
      : now() + FIREBASE_TOKEN_CACHE_TTL_MS;
  verifiedFirebaseTokenCache.set(token, { decoded, expiresAt });
};

const decodeJwtPayload = (token: string): Record<string, unknown> | undefined => {
  const parts = token.split(".");
  if (parts.length < 2) return undefined;
  try {
    const json = Buffer.from(parts[1]!.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const parsed = JSON.parse(json) as Record<string, unknown>;
    return parsed && typeof parsed === "object" ? parsed : undefined;
  } catch {
    return undefined;
  }
};

const decodeFirebaseTokenFallback = (
  token: string
): { uid: string; email?: string | undefined; name?: string | undefined; exp?: number } | undefined => {
  const payload = decodeJwtPayload(token);
  if (!payload) return undefined;
  const issuer = typeof payload.iss === "string" ? payload.iss : "";
  const audience = typeof payload.aud === "string" ? payload.aud : "";
  const uid = typeof payload.user_id === "string" ? payload.user_id : typeof payload.sub === "string" ? payload.sub : "";
  const exp = typeof payload.exp === "number" ? payload.exp : undefined;
  const iat = typeof payload.iat === "number" ? payload.iat : undefined;
  if (issuer !== `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`) return undefined;
  if (audience !== FIREBASE_PROJECT_ID) return undefined;
  if (!uid) return undefined;
  const nowSec = Math.floor(now() / 1000);
  if (typeof exp === "number" && exp <= nowSec) return undefined;
  if (typeof iat === "number" && iat > nowSec + 60) return undefined;
  const decoded: { uid: string; email?: string | undefined; name?: string | undefined; exp?: number } = { uid };
  if (typeof payload.email === "string") decoded.email = payload.email;
  if (typeof payload.name === "string") decoded.name = payload.name;
  if (typeof exp === "number") decoded.exp = exp;
  return decoded;
};

const verifyFirebaseToken = async (
  token: string
): Promise<{ uid: string; email?: string | undefined; name?: string | undefined; exp?: number }> => {
  pendingAuthVerifications += 1;
  authPriorityUntil = Math.max(authPriorityUntil, now() + AUTH_PRIORITY_WINDOW_MS);
  try {
    if (firebaseAdminAuth) {
      try {
        const verified = await firebaseAdminAuth.verifyIdToken(token, true);
        const decoded: { uid: string; email?: string | undefined; name?: string | undefined; exp?: number } = {
          uid: String(verified.uid ?? "")
        };
        if (typeof verified.email === "string") decoded.email = verified.email;
        if (typeof verified.name === "string") decoded.name = verified.name;
        if (typeof verified.exp === "number") decoded.exp = verified.exp;
        return decoded;
      } catch (err) {
        const text = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
        const adminCredentialUnavailable =
          text.includes("Could not load the default credentials") ||
          text.includes("app/invalid-credential") ||
          text.includes("MetadataLookupWarning");
        if (!adminCredentialUnavailable) throw err;
      }
    }

    const verified = await jwtVerify(token, firebaseJwks, {
      issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
      audience: FIREBASE_PROJECT_ID
    });
    const decoded: { uid: string; email?: string | undefined; name?: string | undefined; exp?: number } = {
      uid: String(verified.payload.user_id ?? verified.payload.sub ?? "")
    };
    if (typeof verified.payload.email === "string") decoded.email = verified.payload.email;
    if (typeof verified.payload.name === "string") decoded.name = verified.payload.name;
    if (typeof verified.payload.exp === "number") decoded.exp = verified.payload.exp;
    return decoded;
  } finally {
    pendingAuthVerifications = Math.max(0, pendingAuthVerifications - 1);
  }
};

const GLOBAL_STATUS_CACHE_TTL_MS = 1_000;
const GLOBAL_STATUS_BROADCAST_MS = 2_000;
const STRATEGIC_REPLAY_LIMIT = 16_000;

interface AllianceRequest {
  id: string;
  fromPlayerId: string;
  toPlayerId: string;
  createdAt: number;
  expiresAt: number;
  fromName?: string;
  toName?: string;
}

type ManpowerBreakdownLine = {
  label: string;
  amount: number;
  note?: string;
};

interface TruceRequest {
  id: string;
  fromPlayerId: string;
  toPlayerId: string;
  createdAt: number;
  expiresAt: number;
  durationHours: 12 | 24;
  fromName?: string;
  toName?: string;
}

interface ActiveTruce {
  playerAId: string;
  playerBId: string;
  startedAt: number;
  endsAt: number;
  createdByPlayerId: string;
}

type VictoryPressureTracker = {
  leaderPlayerId?: string;
  holdStartedAt?: number;
  holdAnnouncedAt?: number;
  lastRemainingMilestoneHours?: number;
};

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

type LeaderboardOverallEntry = {
  id: string;
  name: string;
  tiles: number;
  incomePerMinute: number;
  techs: number;
  score: number;
  rank: number;
};

type LeaderboardMetricEntry = {
  id: string;
  name: string;
  value: number;
};

type LeaderboardSnapshotView = {
  overall: LeaderboardOverallEntry[];
  selfOverall: LeaderboardOverallEntry | undefined;
  byTiles: LeaderboardMetricEntry[];
  byIncome: LeaderboardMetricEntry[];
  byTechs: LeaderboardMetricEntry[];
};

type PlayerCompetitionMetrics = {
  playerId: string;
  name: string;
  tiles: number;
  settledTiles: number;
  incomePerMinute: number;
  techs: number;
  controlledTowns: number;
};

type VictoryPressureDefinition = {
  id: SeasonVictoryPathId;
  name: string;
  description: string;
  holdDurationSeconds: number;
};

interface MissionDef {
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

interface SeasonArchiveEntry {
  seasonId: string;
  endedAt: number;
  mostTerritory: Array<{ playerId: string; name: string; value: number }>;
  mostPoints: Array<{ playerId: string; name: string; value: number }>;
  longestSurvivalMs: Array<{ playerId: string; name: string; value: number }>;
  winner?: SeasonWinnerView;
  replayEvents?: StrategicReplayEvent[];
}

interface SnapshotState {
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

interface SnapshotMetaSection {
  world: { width: number; height: number };
  townPlacementsNormalized?: boolean;
  season?: Season;
  seasonWinner?: SeasonWinnerView;
  seasonArchives?: SeasonArchiveEntry[];
  seasonTechConfig?: Omit<SeasonalTechConfig, "activeNodeIds"> & { activeNodeIds: string[] };
}

interface SnapshotPlayersSection {
  players: SnapshotState["players"];
  authIdentities?: AuthIdentity[];
}

interface SnapshotTerritorySection {
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

interface SnapshotEconomySection {
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

interface SnapshotSystemsSection {
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
}

interface SnapshotSectionIndex {
  formatVersion: 2;
  sections: Record<keyof typeof SNAPSHOT_SECTION_FILES, string>;
}

interface ClusterDefinition {
  clusterId: string;
  clusterType: ClusterType;
  resourceType?: ResourceType;
  centerX: number;
  centerY: number;
  radius: number;
  controlThreshold: number;
}

interface SeasonalTechConfig {
  configId: string;
  rootNodeIds: string[];
  activeNodeIds: Set<string>;
  balanceConstants: Record<string, number>;
}

interface TownDefinition {
  townId: string;
  tileKey: TileKey;
  type: "MARKET" | "FARMING";
  population: number;
  maxPopulation: number;
  connectedTownCount: number;
  connectedTownBonus: number;
  lastGrowthTickAt: number;
}

interface ShardSiteState {
  tileKey: TileKey;
  kind: "CACHE" | "FALL";
  amount: number;
  expiresAt?: number;
}

type StrategicResource = "FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD" | "OIL";
const STRATEGIC_RESOURCE_KEYS: readonly StrategicResource[] = ["FOOD", "IRON", "CRYSTAL", "SUPPLY", "SHARD", "OIL"];

interface Observatory {
  observatoryId: string;
  ownerId: string;
  tileKey: TileKey;
  status: "under_construction" | "active" | "inactive";
  completesAt?: number;
}

interface ActiveSabotage {
  targetTileKey: TileKey;
  casterPlayerId: string;
  endsAt: number;
  outputMultiplier?: number;
}

interface ActiveSiphon {
  targetTileKey: TileKey;
  casterPlayerId: string;
  endsAt: number;
}

interface SiphonCache {
  siphonId: string;
  targetTileKey: TileKey;
  expiresAt: number;
  strategic: Partial<Record<StrategicResource, number>>;
  gold: number;
}

interface ActiveAetherBridge {
  bridgeId: string;
  ownerId: string;
  fromTileKey: TileKey;
  toTileKey: TileKey;
  startedAt: number;
  endsAt: number;
}

interface TileYieldBuffer {
  gold: number;
  strategic: Record<StrategicResource, number>;
}

interface RuntimeTileCore {
  x: number;
  y: number;
  tileKey: TileKey;
  terrain: Tile["terrain"];
  ownerId: string | undefined;
  ownershipState: OwnershipState | undefined;
  resource: ResourceType | undefined;
}

interface PlayerEconomyIndex {
  settledResourceTileKeys: Set<TileKey>;
  settledDockTileKeys: Set<TileKey>;
  settledTownTileKeys: Set<TileKey>;
}

const emptyPlayerEffects = (): PlayerEffects => ({
  unlockForts: false,
  unlockSiegeOutposts: false,
  unlockGranary: false,
  unlockRevealRegion: false,
  unlockRevealEmpire: false,
  unlockDeepStrike: false,
  unlockAetherBridge: false,
  unlockMountainPass: false,
  unlockTerrainShaping: false,
  unlockBreachAttack: false,
  settlementSpeedMult: 1,
  operationalTempoMult: 1,
  researchTimeMult: 1,
  abilityCooldownMult: 1,
  sabotageCooldownMult: 1,
  populationGrowthMult: 1,
  firstThreeTownsPopulationGrowthMult: 1,
  firstThreeTownsGoldOutputMult: 1,
  populationCapFirst3TownsMult: 1,
  growthPauseDurationMult: 1,
  townFoodUpkeepMult: 1,
  settledFoodUpkeepMult: 1,
  settledGoldUpkeepMult: 1,
  townGoldOutputMult: 1,
  townGoldCapMult: 1,
  marketIncomeBonusAdd: 0.5,
  marketCapBonusAdd: 0.5,
  granaryCapBonusAdd: 0.2,
  populationIncomeMult: 1,
  connectedTownStepBonusAdd: 0,
  harvestCapMult: 1,
  fortBuildGoldCostMult: 1,
  fortDefenseMult: 1,
  fortIronUpkeepMult: 1,
  fortGoldUpkeepMult: 1,
  outpostAttackMult: 1,
  outpostSupplyUpkeepMult: 1,
  outpostGoldUpkeepMult: 1,
  revealUpkeepMult: 1,
  revealCapacityBonus: 0,
  visionRadiusBonus: 0,
  observatoryProtectionRadiusBonus: 0,
  observatoryCastRadiusBonus: 0,
  observatoryVisionBonus: 0,
  dockGoldOutputMult: 1,
  dockGoldCapMult: 1,
  dockConnectionBonusPerLink: 0.5,
  dockRoutesVisible: false,
  marketCrystalUpkeepMult: 1,
  settledDefenseMult: 1,
  attackVsSettledMult: 1,
  attackVsFortsMult: 1,
  newSettlementDefenseMult: 1,
  buildCapacityAdd: 0,
  developmentProcessCapacityAdd: 0,
  frontierDefenseAdd: 0,
  resourceOutputMult: { FARM: 1, FISH: 1, IRON: 1, CRYSTAL: 1, SUPPLY: 1, SHARD: 1, OIL: 1 }
});

interface TechRequirementChecklist {
  label: string;
  met: boolean;
}

interface DomainRequirementChecklist {
  label: string;
  met: boolean;
}

interface PlayerEffects {
  unlockForts: boolean;
  unlockSiegeOutposts: boolean;
  unlockGranary: boolean;
  unlockRevealRegion: boolean;
  unlockRevealEmpire: boolean;
  unlockDeepStrike: boolean;
  unlockAetherBridge: boolean;
  unlockMountainPass: boolean;
  unlockTerrainShaping: boolean;
  unlockBreachAttack: boolean;
  settlementSpeedMult: number;
  operationalTempoMult: number;
  researchTimeMult: number;
  abilityCooldownMult: number;
  sabotageCooldownMult: number;
  populationGrowthMult: number;
  firstThreeTownsPopulationGrowthMult: number;
  firstThreeTownsGoldOutputMult: number;
  populationCapFirst3TownsMult: number;
  growthPauseDurationMult: number;
  townFoodUpkeepMult: number;
  settledFoodUpkeepMult: number;
  settledGoldUpkeepMult: number;
  townGoldOutputMult: number;
  townGoldCapMult: number;
  marketIncomeBonusAdd: number;
  marketCapBonusAdd: number;
  granaryCapBonusAdd: number;
  populationIncomeMult: number;
  connectedTownStepBonusAdd: number;
  harvestCapMult: number;
  fortBuildGoldCostMult: number;
  fortDefenseMult: number;
  fortIronUpkeepMult: number;
  fortGoldUpkeepMult: number;
  outpostAttackMult: number;
  outpostSupplyUpkeepMult: number;
  outpostGoldUpkeepMult: number;
  revealUpkeepMult: number;
  revealCapacityBonus: number;
  visionRadiusBonus: number;
  observatoryProtectionRadiusBonus: number;
  observatoryCastRadiusBonus: number;
  observatoryVisionBonus: number;
  dockGoldOutputMult: number;
  dockGoldCapMult: number;
  dockConnectionBonusPerLink: number;
  dockRoutesVisible: boolean;
  marketCrystalUpkeepMult: number;
  settledDefenseMult: number;
  attackVsSettledMult: number;
  attackVsFortsMult: number;
  newSettlementDefenseMult: number;
  buildCapacityAdd: number;
  developmentProcessCapacityAdd: number;
  frontierDefenseAdd: number;
  resourceOutputMult: { FARM: number; FISH: number; IRON: number; CRYSTAL: number; SUPPLY: number; SHARD: number; OIL: number };
}

interface TelemetryCounters {
  frontierClaims: number;
  settlements: number;
  breakthroughAttacks: number;
  techUnlocks: number;
}

type StatsModBreakdownEntry = { label: string; mult: number };
type StatsModBreakdown = Record<StatsModKey, StatsModBreakdownEntry[]>;

type AiTurnDebugEntry = {
  at: number;
  playerId: string;
  name: string;
  reason: string;
  points: number;
  incomePerMinute?: number;
  controlledTowns?: number;
  settledTiles?: number;
  primaryVictoryPath?: AiSeasonVictoryPathId;
  goapGoalId?: string;
  goapActionKey?: string;
  executed?: boolean;
  details?: Record<string, boolean | number | string | undefined>;
};

type AiActionFailureEntry = {
  at: number;
  actionKey: string;
  code: string;
  reason: string;
  x?: number;
  y?: number;
};

interface AbilityDefinition {
  id: "reveal_empire" | "aether_bridge" | "siphon" | "create_mountain" | "remove_mountain";
  name: string;
  requiredTechIds: string[];
  crystalCost: number;
  cooldownMs: number;
  upkeepCrystalPerMinute?: number;
  durationMs?: number;
}

interface DynamicMissionDef {
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

const key = (x: number, y: number): TileKey => `${x},${y}`;
const parseKey = (k: TileKey): [number, number] => {
  const [xs, ys] = k.split(",");
  return [Number(xs), Number(ys)];
};
const BARBARIAN_OWNER_ID = "barbarian";
const BARBARIAN_TICK_MS = 5_000;

const playerPairKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

const now = (): number => Date.now();
const ALLIANCE_REQUEST_TTL_MS = 5 * 60_000;
const TRUCE_REQUEST_TTL_MS = 5 * 60_000;
const TRUCE_BREAK_LOCKOUT_MS = 12 * 60 * 60_000;
const TRUCE_BREAK_ATTACK_MULT = 0.75;
const TRUCE_BREAK_ATTACK_PENALTY_MS = 60 * 60_000;
const PASSIVE_INCOME_MULT = 1.0;
const FRONTIER_ACTION_GOLD_COST = 1;
const GOLD_COST_EPSILON = 1e-6;
const canAffordGoldCost = (gold: number, cost: number): boolean => gold + GOLD_COST_EPSILON >= cost;
const HARVEST_GOLD_RATE_MULT = 1;
const HARVEST_RESOURCE_RATE_MULT = 1 / 1440;
const TILE_YIELD_CAP_GOLD = 24;
const TILE_YIELD_CAP_RESOURCE = 6;
const OFFLINE_YIELD_ACCUM_MAX_MS = 12 * 60 * 60 * 1000;
const COLLECT_VISIBLE_COOLDOWN_MS = 20_000;
const IDLE_SNAPSHOT_INTERVAL_MS = 5 * 60_000;
const SHARD_CACHE_COUNT = Math.max(28, Math.floor((WORLD_WIDTH * WORLD_HEIGHT) / 28_000));
const SHARD_RAIN_SCHEDULE_HOURS = [12, 20] as const;
const SHARD_RAIN_SITE_MIN = 3;
const SHARD_RAIN_SITE_MAX = 6;
const SHARD_RAIN_TTL_MS = 30 * 60_000;
const FIRST_SPECIAL_SITE_CAPTURE_GOLD = 6;
const STARTING_GOLD = 100;
const MIN_ACTIVE_BARBARIAN_AGENTS = 80;
const BARBARIAN_MAINTENANCE_INTERVAL_MS = 10_000;
const BARBARIAN_MAINTENANCE_MAX_SPAWNS_PER_PASS = 6;
const PVP_REWARD_MULT = 0.55;
const TOWN_BASE_GOLD_PER_MIN = 4;
const DOCK_INCOME_PER_MIN = 2;
const BREAKTHROUGH_GOLD_COST = 2;
const BREAKTHROUGH_IRON_COST = 1;
const FORT_BUILD_IRON_COST = 45;
const SIEGE_OUTPOST_BUILD_SUPPLY_COST = 45;
const BREAKTHROUGH_DEF_MULT_FACTOR = 0.6;
const BREAKTHROUGH_REQUIRED_TECH_ID = "breach-doctrine";
const OBSERVATORY_BUILD_COST = structureBaseGoldCost("OBSERVATORY");
const OBSERVATORY_VISION_BONUS = 5;
const OBSERVATORY_BUILD_CRYSTAL_COST = 45;
const OBSERVATORY_UPKEEP_PER_MIN = 0.025;
const OBSERVATORY_PROTECTION_RADIUS = 10;
const OBSERVATORY_CAST_RADIUS = 30;
const ECONOMIC_STRUCTURE_UPKEEP_INTERVAL_MS = 10 * 60_000;
const FARMSTEAD_BUILD_GOLD_COST = structureBaseGoldCost("FARMSTEAD");
const FARMSTEAD_BUILD_FOOD_COST = 20;
const FARMSTEAD_GOLD_UPKEEP = 1;
const CAMP_BUILD_GOLD_COST = structureBaseGoldCost("CAMP");
const CAMP_BUILD_SUPPLY_COST = 30;
const CAMP_GOLD_UPKEEP = 1.2;
const MINE_BUILD_GOLD_COST = structureBaseGoldCost("MINE");
const MINE_BUILD_RESOURCE_COST = 30;
const MINE_GOLD_UPKEEP = 1.2;
const MARKET_BUILD_GOLD_COST = structureBaseGoldCost("MARKET");
const MARKET_BUILD_CRYSTAL_COST = 40;
const MARKET_CRYSTAL_UPKEEP = 0.05;
const GRANARY_BUILD_GOLD_COST = structureBaseGoldCost("GRANARY");
const GRANARY_BUILD_FOOD_COST = 40;
const GRANARY_GOLD_UPKEEP = 1;
const BANK_BUILD_GOLD_COST = structureBaseGoldCost("BANK");
const BANK_BUILD_CRYSTAL_COST = 60;
const BANK_CRYSTAL_UPKEEP = 0.05;
const AIRPORT_BUILD_GOLD_COST = structureBaseGoldCost("AIRPORT");
const AIRPORT_BUILD_CRYSTAL_COST = 80;
const QUARTERMASTER_BUILD_GOLD_COST = structureBaseGoldCost("QUARTERMASTER");
const IRONWORKS_BUILD_GOLD_COST = structureBaseGoldCost("IRONWORKS");
const CRYSTAL_SYNTHESIZER_BUILD_GOLD_COST = structureBaseGoldCost("CRYSTAL_SYNTHESIZER");
const FUEL_PLANT_BUILD_GOLD_COST = structureBaseGoldCost("FUEL_PLANT");
const CARAVANARY_BUILD_GOLD_COST = structureBaseGoldCost("CARAVANARY");
const CARAVANARY_BUILD_CRYSTAL_COST = 60;
const CUSTOMS_HOUSE_BUILD_GOLD_COST = structureBaseGoldCost("CUSTOMS_HOUSE");
const CUSTOMS_HOUSE_BUILD_CRYSTAL_COST = 60;
const GARRISON_HALL_BUILD_GOLD_COST = structureBaseGoldCost("GARRISON_HALL");
const GARRISON_HALL_BUILD_CRYSTAL_COST = 80;
const GOVERNORS_OFFICE_BUILD_GOLD_COST = structureBaseGoldCost("GOVERNORS_OFFICE");
const RADAR_SYSTEM_BUILD_GOLD_COST = structureBaseGoldCost("RADAR_SYSTEM");
const RADAR_SYSTEM_BUILD_CRYSTAL_COST = 120;
const FOUNDRY_BUILD_GOLD_COST = structureBaseGoldCost("FOUNDRY");
const MANPOWER_EPSILON = 1e-6;
const TOWN_MANPOWER_BY_TIER: Record<PopulationTier, { cap: number; regenPerMinute: number }> = {
  SETTLEMENT: { cap: 150, regenPerMinute: 10 },
  TOWN: { cap: 300, regenPerMinute: 15 },
  CITY: { cap: 600, regenPerMinute: 30 },
  GREAT_CITY: { cap: 1_200, regenPerMinute: 60 },
  METROPOLIS: { cap: 2_400, regenPerMinute: 120 }
};
const SETTLEMENT_BASE_GOLD_PER_MIN = 1;
const QUARTERMASTER_GOLD_UPKEEP = 120;
const IRONWORKS_GOLD_UPKEEP = 120;
const CRYSTAL_SYNTHESIZER_GOLD_UPKEEP = 160;
const FUEL_PLANT_GOLD_UPKEEP = 180;
const CARAVANARY_GOLD_UPKEEP = 15;
const CUSTOMS_HOUSE_GOLD_UPKEEP = 15;
const GARRISON_HALL_GOLD_UPKEEP = 25;
const GOVERNORS_OFFICE_GOLD_UPKEEP = 30;
const RADAR_SYSTEM_GOLD_UPKEEP = 45;
const FOUNDRY_GOLD_UPKEEP = 50;
const QUARTERMASTER_SUPPLY_PER_DAY = 18;
const IRONWORKS_IRON_PER_DAY = 18;
const CRYSTAL_SYNTHESIZER_CRYSTAL_PER_DAY = 12;
const FUEL_PLANT_OIL_PER_DAY = 10;
const AIRPORT_OIL_UPKEEP_PER_MIN = 0.025;
const AIRPORT_BOMBARD_OIL_COST = 1;
const AIRPORT_BOMBARD_RANGE = 30;
const AIRPORT_BOMBARD_ATTACK_MULT = 0.95;
const AIRPORT_BOMBARD_MIN_FIELD_TILES = 2;
const AIRPORT_BOMBARD_MAX_FIELD_TILES = 4;
const STRUCTURE_OUTPUT_MULT = 1.5;
const FOUNDRY_RADIUS = 10;
const FOUNDRY_OUTPUT_MULT = 2;
const GOVERNORS_OFFICE_RADIUS = 10;
const GOVERNORS_OFFICE_UPKEEP_MULT = 0.8;
const RADAR_SYSTEM_RADIUS = 30;
const REVEAL_EMPIRE_ACTIVATION_COST = 20;
const REVEAL_EMPIRE_UPKEEP_PER_MIN = 0.015;
const DEEP_STRIKE_CRYSTAL_COST = 25;
const DEEP_STRIKE_COOLDOWN_MS = 20 * 60_000;
const DEEP_STRIKE_ATTACK_MULT = 0.9;
const DEEP_STRIKE_MAX_DISTANCE = 2;
const NAVAL_INFILTRATION_CRYSTAL_COST = 30;
const NAVAL_INFILTRATION_COOLDOWN_MS = 30 * 60_000;
const NAVAL_INFILTRATION_ATTACK_MULT = 0.85;
const NAVAL_INFILTRATION_MAX_RANGE = 5;
const SABOTAGE_CRYSTAL_COST = 20;
const SABOTAGE_COOLDOWN_MS = 15 * 60_000;
const SABOTAGE_DURATION_MS = 45 * 60_000;
const SABOTAGE_OUTPUT_MULT = 0.5;
const AETHER_BRIDGE_CRYSTAL_COST = 30;
const AETHER_BRIDGE_COOLDOWN_MS = 30 * 60_000;
const AETHER_BRIDGE_DURATION_MS = 8 * 60_000;
const AETHER_BRIDGE_MAX_SEA_TILES = 4;
const SIPHON_CRYSTAL_COST = 20;
const SIPHON_COOLDOWN_MS = 15 * 60_000;
const SIPHON_DURATION_MS = 30 * 60_000;
const SIPHON_SHARE = 0.5;
const SIPHON_PURGE_CRYSTAL_COST = 10;
const TERRAIN_SHAPING_GOLD_COST = 8000;
const TERRAIN_SHAPING_CRYSTAL_COST = 400;
const TERRAIN_SHAPING_COOLDOWN_MS = 20 * 60_000;
const TERRAIN_SHAPING_RANGE = 2;
const PLAYER_MOUNTAIN_DENSITY_RADIUS = 5;
const PLAYER_MOUNTAIN_DENSITY_LIMIT = 3;
const NEW_SETTLEMENT_DEFENSE_MS = 15 * 60_000;
const POPULATION_GROWTH_BASE_RATE = 0.00032;
const POPULATION_MIN = 3_000;
const POPULATION_MAX = 10_000_000;
const POPULATION_START_SPREAD = 2_000;
const POPULATION_TOWN_MIN = 10_000;
const POPULATION_GROWTH_TICK_MS = 60_000;
const GROWTH_PAUSE_MS = 60 * 60_000;
const GROWTH_PAUSE_MAX_MS = 6 * 60 * 60_000;
const LARGE_ISLAND_MULTI_DOCK_TILE_THRESHOLD = 250;
const BREACH_SHOCK_MS = 180_000;
const BREACH_SHOCK_DEF_MULT = 0.72;
const DYNAMIC_MISSION_MS = 7 * 24 * 60 * 60 * 1000;
const VENDETTA_ATTACK_BUFF_MULT = 1.15;
const VENDETTA_ATTACK_BUFF_MS = 24 * 60 * 60 * 1000;
const RESOURCE_CHAIN_BUFF_MS = 24 * 60 * 60 * 1000;
const RESOURCE_CHAIN_MULT = 1.4;
const SEASON_VICTORY_HOLD_MS = 24 * 60 * 60_000;
const SEASON_VICTORY_TOWN_CONTROL_SHARE = 0.5;
const SEASON_VICTORY_SETTLED_TERRITORY_SHARE = 0.66;
const SEASON_VICTORY_ECONOMY_MIN_INCOME = 200;
const SEASON_VICTORY_ECONOMY_LEAD_MULT = 1.33;
const SEASON_VICTORY_CONTINENT_FOOTPRINT_SHARE = 0.1;
const VICTORY_PRESSURE_FRONTIER_REACH_WINDOW_MS = 2 * 60 * 60_000;
const VICTORY_PRESSURE_DEFS: VictoryPressureDefinition[] = [
  {
    id: "TOWN_CONTROL",
    name: "Town Control",
    description: "Control 50% of all towns in the world.",
    holdDurationSeconds: SEASON_VICTORY_HOLD_MS / 1000
  },
  {
    id: "SETTLED_TERRITORY",
    name: "Settled Territory",
    description: "Control 66% of all claimable land tiles as settled territory.",
    holdDurationSeconds: SEASON_VICTORY_HOLD_MS / 1000
  },
  {
    id: "ECONOMIC_HEGEMONY",
    name: "Economy",
    description: "Reach at least 200 gold per minute and stay 33% ahead of second place.",
    holdDurationSeconds: SEASON_VICTORY_HOLD_MS / 1000
  },
  {
    id: "RESOURCE_MONOPOLY",
    name: "Resource Monopoly",
    description: "Control all tiles of at least one world resource type.",
    holdDurationSeconds: SEASON_VICTORY_HOLD_MS / 1000
  },
  {
    id: "CONTINENT_FOOTPRINT",
    name: "Continental Footprint",
    description: "Settle at least 10% of claimable land on every island.",
    holdDurationSeconds: SEASON_VICTORY_HOLD_MS / 1000
  }
];
const ABILITY_DEFS: Record<AbilityDefinition["id"], AbilityDefinition> = {
  reveal_empire: {
    id: "reveal_empire",
    name: "Reveal Empire",
    requiredTechIds: ["cryptography"],
    crystalCost: REVEAL_EMPIRE_ACTIVATION_COST,
    cooldownMs: 0,
    upkeepCrystalPerMinute: REVEAL_EMPIRE_UPKEEP_PER_MIN
  },
  aether_bridge: {
    id: "aether_bridge",
    name: "Aether Bridge",
    requiredTechIds: ["navigation"],
    crystalCost: AETHER_BRIDGE_CRYSTAL_COST,
    cooldownMs: AETHER_BRIDGE_COOLDOWN_MS,
    durationMs: AETHER_BRIDGE_DURATION_MS
  },
  siphon: {
    id: "siphon",
    name: "Siphon",
    requiredTechIds: ["cryptography"],
    crystalCost: SIPHON_CRYSTAL_COST,
    cooldownMs: SIPHON_COOLDOWN_MS,
    durationMs: SIPHON_DURATION_MS
  },
  create_mountain: {
    id: "create_mountain",
    name: "Create Mountain",
    requiredTechIds: ["terrain-engineering"],
    crystalCost: TERRAIN_SHAPING_CRYSTAL_COST,
    cooldownMs: TERRAIN_SHAPING_COOLDOWN_MS
  },
  remove_mountain: {
    id: "remove_mountain",
    name: "Remove Mountain",
    requiredTechIds: ["terrain-engineering"],
    crystalCost: TERRAIN_SHAPING_CRYSTAL_COST,
    cooldownMs: TERRAIN_SHAPING_COOLDOWN_MS
  }
};
const MISSION_DEFS: MissionDef[] = [
  {
    id: "frontier-scout",
    kind: "NEUTRAL_CAPTURES",
    name: "Frontier Scout",
    description: "Capture 6 neutral tiles.",
    unlockPoints: 0,
    target: 6,
    rewardPoints: 0,
    rewardLabel: "Reward: +1 FOOD +1 SUPPLY"
  },
  {
    id: "frontier-commander",
    kind: "NEUTRAL_CAPTURES",
    name: "Frontier Commander",
    description: "Capture 16 neutral tiles.",
    unlockPoints: 50,
    prerequisiteId: "frontier-scout",
    target: 16,
    rewardPoints: 0,
    rewardLabel: "Reward: +1 IRON +1 CRYSTAL"
  },
  {
    id: "regional-footprint",
    kind: "SETTLED_TILES_HELD",
    name: "Regional Footprint",
    description: "Hold 20 settled tiles at once.",
    unlockPoints: 80,
    target: 20,
    rewardPoints: 0,
    rewardLabel: "Reward: +1 SHARD"
  },
  {
    id: "breadbasket-protocol",
    kind: "FARMS_HELD",
    name: "Breadbasket Protocol",
    description: "Control 4 farms at once.",
    unlockPoints: 140,
    target: 4,
    rewardPoints: 150
  },
  {
    id: "first-bloodline",
    kind: "ENEMY_CAPTURES",
    name: "First Bloodline",
    description: "Capture 3 enemy-owned tiles.",
    unlockPoints: 200,
    target: 3,
    rewardPoints: 220
  },
  {
    id: "victory-rhythm",
    kind: "COMBAT_WINS",
    name: "Victory Rhythm",
    description: "Win 10 combats.",
    unlockPoints: 320,
    target: 10,
    rewardPoints: 300
  },
  {
    id: "tech-apprentice",
    kind: "TECH_PICKS",
    name: "Tech Apprentice",
    description: "Select 3 techs.",
    unlockPoints: 250,
    target: 3,
    rewardPoints: 260
  },
  {
    id: "tech-master",
    kind: "TECH_PICKS",
    name: "Tech Master",
    description: "Select 8 techs.",
    unlockPoints: 600,
    prerequisiteId: "tech-apprentice",
    target: 8,
    rewardPoints: 700
  },
  {
    id: "continental-triad",
    kind: "CONTINENTS_HELD",
    name: "Continental Triad",
    description: "Hold land on 3 continents at once.",
    unlockPoints: 450,
    target: 3,
    rewardPoints: 700
  },
  {
    id: "continental-grip",
    kind: "TILES_HELD",
    name: "Continental Grip",
    description: "Hold 50 tiles at once.",
    unlockPoints: 700,
    target: 50,
    rewardPoints: 600
  },
  {
    id: "agri-hegemon",
    kind: "FARMS_HELD",
    name: "Agri Hegemon",
    description: "Control 10 farms at once.",
    unlockPoints: 1100,
    target: 10,
    rewardPoints: 900
  },
  {
    id: "war-ledger",
    kind: "ENEMY_CAPTURES",
    name: "War Ledger",
    description: "Capture 20 enemy-owned tiles.",
    unlockPoints: 1500,
    target: 20,
    rewardPoints: 1200
  }
];
const colorFromId = (id: string): string => {
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const hue = (h >>> 0) % 360;
  const c = (1 - Math.abs((2 * 0.48) - 1)) * 0.7;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = 0.48 - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hue < 60) [r, g, b] = [c, x, 0];
  else if (hue < 120) [r, g, b] = [x, c, 0];
  else if (hue < 180) [r, g, b] = [0, c, x];
  else if (hue < 240) [r, g, b] = [0, x, c];
  else if (hue < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toHex = (n: number): string => Math.round((n + m) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
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

const toStrategicResource = (resource: ResourceType | undefined): StrategicResource | undefined => {
  if (!resource) return undefined;
  if (resource === "FARM" || resource === "FISH") return "FOOD";
  if (resource === "IRON") return "IRON";
  if (resource === "GEMS") return "CRYSTAL";
  if (resource === "WOOD" || resource === "FUR") return "SUPPLY";
  if (resource === "OIL") return "OIL";
  return undefined;
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
  for (const town of townsByTile.values()) {
    const [x, y] = parseKey(town.tileKey);
    const t = playerTile(x, y);
    if (t.ownerId !== player.id || t.ownershipState !== "SETTLED") continue;
  }
  return out;
};

const players = new Map<string, Player>();
const authIdentityByUid = new Map<string, AuthIdentity>();
const socketsByPlayer = new Map<string, Ws>();
const aiTurnDebugByPlayer = new Map<string, AiTurnDebugEntry>();
const aiLastActionFailureByPlayer = new Map<string, AiActionFailureEntry>();
const aiVictoryPathByPlayer = new Map<string, AiSeasonVictoryPathId>();

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
      lastActiveAt: now()
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
interface PendingSettlement {
  tileKey: TileKey;
  ownerId: string;
  startedAt: number;
  resolvesAt: number;
  goldCost: number;
  cancelled: boolean;
  timeout?: NodeJS.Timeout;
}
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
interface TileHistoryState {
  lastOwnerId?: string | null;
  previousOwners: string[];
  captureCount: number;
  lastCapturedAt?: number | null;
  lastStructureType?: "FORT" | "SIEGE_OUTPOST" | "OBSERVATORY" | EconomicStructureType | null;
  structureHistory: Array<"FORT" | "SIEGE_OUTPOST" | "OBSERVATORY" | EconomicStructureType>;
  wasMountainCreatedByPlayer?: boolean;
  wasMountainRemovedByPlayer?: boolean;
}
interface TerrainShapeState {
  terrain: "LAND" | "MOUNTAIN";
  createdByPlayer: boolean;
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
    payloadByChunkKey: Map<string, string>;
    visibilityMaskByChunkKey: Map<string, Uint8Array>;
  }
>();
const summaryChunkVersionByChunkKey = new Map<string, number>();
const cachedSummaryChunkByChunkKey = new Map<string, { version: number; tiles: readonly Tile[] }>();
const fogChunkTilesByChunkKey = new Map<string, readonly Tile[]>();
const aiDefensePriorityUntilByPlayer = new Map<string, number>();
const chunkSnapshotGenerationByPlayer = new Map<string, number>();
const allianceRequests = new Map<string, AllianceRequest>();
const truceRequests = new Map<string, TruceRequest>();
const trucesByPair = new Map<string, ActiveTruce>();
const truceBreakPenaltyByPair = new Map<string, { penalizedPlayerId: string; targetPlayerId: string; endsAt: number }>();
const chunkSubscriptionByPlayer = new Map<string, { cx: number; cy: number; radius: number }>();
const chunkSnapshotSentAtByPlayer = new Map<string, { cx: number; cy: number; radius: number; sentAt: number }>();
const recentAiTickPerf = perfRing<{ at: number; elapsedMs: number; aiPlayers: number; rssMb: number; heapUsedMb: number }>(30);
const recentChunkSnapshotPerf = perfRing<{ at: number; playerId: string; elapsedMs: number; chunks: number; tiles: number; radius: number; rssMb: number; heapUsedMb: number }>(50);
const recentRuntimeVitals = perfRing<ReturnType<typeof sampleRuntimeVitals>>(180);
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
const revealedEmpireTargetsByPlayer = new Map<string, Set<string>>();
const revealWatchersByTarget = new Map<string, Set<string>>();
const siphonByTile = new Map<TileKey, ActiveSiphon>();
const siphonCacheByPlayer = new Map<string, SiphonCache[]>();
const activeAetherBridgesById = new Map<string, ActiveAetherBridge>();
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
    { name: "verifiedFirebaseTokenCache", entries: verifiedFirebaseTokenCache.size },
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
const runtimeHotspotDiagnostics = (): {
  aiTicks: ReturnType<typeof perfSummary> & { lastAiPlayers: number };
  chunkSnapshots: ReturnType<typeof perfSummary> & { maxChunks: number; maxTiles: number };
} => {
  const aiEntries = recentAiTickPerf.values();
  const chunkEntries = recentChunkSnapshotPerf.values();
  return {
    aiTicks: {
      ...perfSummary(aiEntries, (entry) => entry.elapsedMs),
      lastAiPlayers: aiEntries[aiEntries.length - 1]?.aiPlayers ?? 0
    },
    chunkSnapshots: {
      ...perfSummary(chunkEntries, (entry) => entry.elapsedMs),
      maxChunks: chunkEntries.reduce((max, entry) => Math.max(max, entry.chunks), 0),
      maxTiles: chunkEntries.reduce((max, entry) => Math.max(max, entry.tiles), 0)
    }
  };
};
const frontierSettlementsByPlayer = new Map<string, number[]>();
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

const seeded01 = (x: number, y: number, seed: number): number => {
  const n = Math.sin((x * 12.9898 + y * 78.233 + seed * 43758.5453) % 100000) * 43758.5453123;
  return n - Math.floor(n);
};

const terrainAtRuntime = (x: number, y: number): "LAND" | "SEA" | "MOUNTAIN" => {
  const wx = wrapX(x, WORLD_WIDTH);
  const wy = wrapY(y, WORLD_HEIGHT);
  return terrainShapesByTile.get(key(wx, wy))?.terrain ?? terrainAt(wx, wy);
};

const terrainShapeWithinPlayerDensity = (x: number, y: number): boolean => {
  let count = 0;
  for (let dy = -PLAYER_MOUNTAIN_DENSITY_RADIUS; dy <= PLAYER_MOUNTAIN_DENSITY_RADIUS; dy += 1) {
    for (let dx = -PLAYER_MOUNTAIN_DENSITY_RADIUS; dx <= PLAYER_MOUNTAIN_DENSITY_RADIUS; dx += 1) {
      const tk = key(wrapX(x + dx, WORLD_WIDTH), wrapY(y + dy, WORLD_HEIGHT));
      const shape = terrainShapesByTile.get(tk);
      if (shape?.terrain === "MOUNTAIN" && shape.createdByPlayer) count += 1;
      if (count >= PLAYER_MOUNTAIN_DENSITY_LIMIT) return false;
    }
  }
  return true;
};

const hasOwnedLandWithinRange = (playerId: string, x: number, y: number, range: number): boolean => {
  for (const tk of players.get(playerId)?.territoryTiles ?? []) {
    const [tx, ty] = parseKey(tk);
    if (terrainAtRuntime(tx, ty) !== "LAND") continue;
    if (chebyshevDistance(tx, ty, x, y) <= range) return true;
  }
  return false;
};

const regionTypeAtLocal = (x: number, y: number): "FERTILE_PLAINS" | "BROKEN_HIGHLANDS" | "DEEP_FOREST" | "ANCIENT_HEARTLAND" | "CRYSTAL_WASTES" | undefined =>
  terrainAt(x, y) === "LAND" ? regionTypeAt(x, y) : undefined;

const isAdjacentTile = (ax: number, ay: number, bx: number, by: number): boolean => {
  const dx = Math.min(Math.abs(ax - bx), WORLD_WIDTH - Math.abs(ax - bx));
  const dy = Math.min(Math.abs(ay - by), WORLD_HEIGHT - Math.abs(ay - by));
  return dx <= 1 && dy <= 1 && (dx !== 0 || dy !== 0);
};

const isCoastalLand = (x: number, y: number): boolean => {
  if (terrainAt(x, y) !== "LAND") return false;
  const n = [
    terrainAt(wrapX(x, WORLD_WIDTH), wrapY(y - 1, WORLD_HEIGHT)),
    terrainAt(wrapX(x + 1, WORLD_WIDTH), wrapY(y, WORLD_HEIGHT)),
    terrainAt(wrapX(x, WORLD_WIDTH), wrapY(y + 1, WORLD_HEIGHT)),
    terrainAt(wrapX(x - 1, WORLD_WIDTH), wrapY(y, WORLD_HEIGHT))
  ];
  return n.includes("SEA");
};

const worldIndex = (x: number, y: number): number => y * WORLD_WIDTH + x;
const largestSeaComponentMask = (): Uint8Array => {
  const total = WORLD_WIDTH * WORLD_HEIGHT;
  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);
  let largest: number[] = [];

  for (let y = 0; y < WORLD_HEIGHT; y += 1) {
    for (let x = 0; x < WORLD_WIDTH; x += 1) {
      const startIdx = worldIndex(x, y);
      if (visited[startIdx] || terrainAt(x, y) !== "SEA") continue;

      let head = 0;
      let tail = 0;
      const component: number[] = [];
      visited[startIdx] = 1;
      queue[tail++] = startIdx;

      while (head < tail) {
        const idx = queue[head++]!;
        component.push(idx);
        const cx = idx % WORLD_WIDTH;
        const cy = Math.floor(idx / WORLD_WIDTH);
        const neighbors: Array<[number, number]> = [
          [wrapX(cx, WORLD_WIDTH), wrapY(cy - 1, WORLD_HEIGHT)],
          [wrapX(cx + 1, WORLD_WIDTH), wrapY(cy, WORLD_HEIGHT)],
          [wrapX(cx, WORLD_WIDTH), wrapY(cy + 1, WORLD_HEIGHT)],
          [wrapX(cx - 1, WORLD_WIDTH), wrapY(cy, WORLD_HEIGHT)]
        ];
        for (const [nx, ny] of neighbors) {
          const nIdx = worldIndex(nx, ny);
          if (visited[nIdx] || terrainAt(nx, ny) !== "SEA") continue;
          visited[nIdx] = 1;
          queue[tail++] = nIdx;
        }
      }

      if (component.length > largest.length) largest = component;
    }
  }

  const ocean = new Uint8Array(total);
  for (const idx of largest) ocean[idx] = 1;
  return ocean;
};

const adjacentOceanSea = (x: number, y: number, oceanMask: Uint8Array): { x: number; y: number } | undefined => {
  const neighbors: Array<[number, number]> = [
    [wrapX(x, WORLD_WIDTH), wrapY(y - 1, WORLD_HEIGHT)],
    [wrapX(x + 1, WORLD_WIDTH), wrapY(y, WORLD_HEIGHT)],
    [wrapX(x, WORLD_WIDTH), wrapY(y + 1, WORLD_HEIGHT)],
    [wrapX(x - 1, WORLD_WIDTH), wrapY(y, WORLD_HEIGHT)]
  ];
  for (const [nx, ny] of neighbors) {
    if (terrainAt(nx, ny) !== "SEA") continue;
    if (!oceanMask[worldIndex(nx, ny)]) continue;
    return { x: nx, y: ny };
  }
  return undefined;
};

const clusterTypeDefs: Array<{
  type: ClusterType;
  resourceType: ResourceType;
  threshold: number;
}> = [
  { type: "FERTILE_PLAINS", resourceType: "FARM", threshold: 3 },
  { type: "IRON_HILLS", resourceType: "IRON", threshold: 3 },
  { type: "CRYSTAL_BASIN", resourceType: "GEMS", threshold: 3 },
  { type: "HORSE_STEPPES", resourceType: "FUR", threshold: 3 },
  { type: "COASTAL_SHOALS", resourceType: "FISH", threshold: 3 }
];

const clusterResourceType = (cluster: ClusterDefinition): ResourceType => {
  if (cluster.resourceType) return cluster.resourceType;
  if (cluster.clusterType === "FERTILE_PLAINS") return "FARM";
  if (cluster.clusterType === "IRON_HILLS") return "IRON";
  if (cluster.clusterType === "CRYSTAL_BASIN") return "GEMS";
  if (cluster.clusterType === "HORSE_STEPPES") return "FUR";
  if (cluster.clusterType === "COASTAL_SHOALS") return "FISH";
  if (cluster.clusterType === "OIL_FIELD") return "OIL";
  return "GEMS";
};

const discoverOilFieldNearAirport = (ownerId: string, airportTileKey: TileKey): TileKey[] => {
  const [ax, ay] = parseKey(airportTileKey);
  const candidateKeys: TileKey[] = [];
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const x = wrapX(ax + dx, WORLD_WIDTH);
      const y = wrapY(ay + dy, WORLD_HEIGHT);
      const tk = key(x, y);
      if (terrainAtRuntime(x, y) !== "LAND") continue;
      if (clusterByTile.has(tk) || townsByTile.has(tk) || docksByTile.has(tk)) continue;
      if (fortsByTile.has(tk) || siegeOutpostsByTile.has(tk) || observatoriesByTile.has(tk) || economicStructuresByTile.has(tk)) continue;
      candidateKeys.push(tk);
    }
  }
  candidateKeys.sort((left, right) => {
    const leftTile = playerTile(...parseKey(left));
    const rightTile = playerTile(...parseKey(right));
    const leftScore = leftTile.ownerId === ownerId && leftTile.ownershipState === "SETTLED" ? 0 : leftTile.ownerId === ownerId ? 1 : 2;
    const rightScore = rightTile.ownerId === ownerId && rightTile.ownershipState === "SETTLED" ? 0 : rightTile.ownerId === ownerId ? 1 : 2;
    return leftScore - rightScore;
  });
  const desiredCount =
    AIRPORT_BOMBARD_MIN_FIELD_TILES +
    Math.floor(seeded01(ax, ay, activeSeason.worldSeed + 811) * (AIRPORT_BOMBARD_MAX_FIELD_TILES - AIRPORT_BOMBARD_MIN_FIELD_TILES + 1));
  const candidateSet = new Set(candidateKeys);
  const selected: TileKey[] = [];
  for (const start of candidateKeys) {
    if (selected.length >= desiredCount) break;
    if (selected.includes(start)) continue;
    const queue = [start];
    const visited = new Set<TileKey>([start]);
    while (queue.length > 0 && selected.length < desiredCount) {
      const current = queue.shift()!;
      if (!selected.includes(current)) selected.push(current);
      const [cx, cy] = parseKey(current);
      for (let ny = cy - 1; ny <= cy + 1; ny += 1) {
        for (let nx = cx - 1; nx <= cx + 1; nx += 1) {
          const neighborKey = key(wrapX(nx, WORLD_WIDTH), wrapY(ny, WORLD_HEIGHT));
          if (!candidateSet.has(neighborKey) || visited.has(neighborKey)) continue;
          visited.add(neighborKey);
          queue.push(neighborKey);
        }
      }
    }
    if (selected.length >= AIRPORT_BOMBARD_MIN_FIELD_TILES) break;
  }
  if (selected.length < AIRPORT_BOMBARD_MIN_FIELD_TILES) return [];
  const clusterId = `oil-${crypto.randomUUID()}`;
  clustersById.set(clusterId, {
    clusterId,
    clusterType: "OIL_FIELD",
    resourceType: "OIL",
    centerX: ax,
    centerY: ay,
    radius: 1,
    controlThreshold: 2
  });
  const affectedOwners = new Set<string>();
  for (const tk of selected) {
    clusterByTile.set(tk, clusterId);
    const owner = ownership.get(tk);
    if (!owner) continue;
    getOrInitResourceCounts(owner).OIL = (getOrInitResourceCounts(owner).OIL ?? 0) + 1;
    affectedOwners.add(owner);
  }
  for (const affectedOwner of affectedOwners) {
    rebuildEconomyIndexForPlayer(affectedOwner);
    const player = players.get(affectedOwner);
    if (player) sendPlayerUpdate(player, 0);
  }
  for (const tk of selected) {
    const [x, y] = parseKey(tk);
    sendVisibleTileDeltaAt(x, y);
  }
  return selected;
};

const chooseSeasonalTechConfig = (seed: number): SeasonalTechConfig => {
  const activeNodeIds = new Set<string>();
  for (const tech of TECHS) {
    activeNodeIds.add(tech.id);
  }
  return {
    configId: `tree-${seed}`,
    rootNodeIds: [...TECH_ROOTS],
    activeNodeIds,
    balanceConstants: {}
  };
};

const seasonTechConfigIsCompatible = (config: SeasonalTechConfig): boolean => {
  if (config.rootNodeIds.length !== TECH_ROOTS.length) return false;
  if (config.rootNodeIds.some((id) => !TECH_ROOTS.includes(id))) return false;
  for (const id of config.activeNodeIds) {
    if (!techById.has(id)) return false;
  }
  return true;
};

const recomputeClusterBonusForPlayer = (player: Player): void => {
  void player;
};

const playerModBreakdown = (player: Player): StatsModBreakdown => {
  const breakdown: StatsModBreakdown = {
    attack: [{ label: "Base", mult: 1 }],
    defense: [{ label: "Base", mult: 1 }],
    income: [{ label: "Base", mult: 1 }],
    vision: [{ label: "Base", mult: 1 }]
  };
  for (const techId of player.techIds) {
    const tech = techById.get(techId);
    if (!tech?.mods) continue;
    if (tech.mods.attack && tech.mods.attack !== 1) breakdown.attack.push({ label: `Tech: ${tech.name}`, mult: tech.mods.attack });
    if (tech.mods.defense && tech.mods.defense !== 1) breakdown.defense.push({ label: `Tech: ${tech.name}`, mult: tech.mods.defense });
    if (tech.mods.income && tech.mods.income !== 1) breakdown.income.push({ label: `Tech: ${tech.name}`, mult: tech.mods.income });
    if (tech.mods.vision && tech.mods.vision !== 1) breakdown.vision.push({ label: `Tech: ${tech.name}`, mult: tech.mods.vision });
  }
  for (const domainId of player.domainIds) {
    const domain = domainById.get(domainId);
    if (!domain?.mods) continue;
    if (domain.mods.attack && domain.mods.attack !== 1) breakdown.attack.push({ label: `Domain: ${domain.name}`, mult: domain.mods.attack });
    if (domain.mods.defense && domain.mods.defense !== 1) breakdown.defense.push({ label: `Domain: ${domain.name}`, mult: domain.mods.defense });
    if (domain.mods.income && domain.mods.income !== 1) breakdown.income.push({ label: `Domain: ${domain.name}`, mult: domain.mods.income });
    if (domain.mods.vision && domain.mods.vision !== 1) breakdown.vision.push({ label: `Domain: ${domain.name}`, mult: domain.mods.vision });
  }

  for (const key of ["attack", "defense", "income", "vision"] as const) {
    const computed = breakdown[key].reduce((product, entry) => product * entry.mult, 1);
    const live = player.mods[key];
    if (Math.abs(computed - live) > 0.0001) {
      breakdown[key].push({ label: "Other", mult: live / Math.max(0.0001, computed) });
    }
  }
  return breakdown;
};

const recomputeTechModsFromOwnedTechs = (player: Player): void => {
  const depthMemo = new Map<string, number>();
  const depthOf = (id: string): number => {
    const cached = depthMemo.get(id);
    if (cached !== undefined) return cached;
    const t = techById.get(id);
    if (!t || !t.requires) {
      depthMemo.set(id, 0);
      return 0;
    }
    const d = depthOf(t.requires) + 1;
    depthMemo.set(id, d);
    return d;
  };

  const owned = [...player.techIds].sort((a, b) => depthOf(a) - depthOf(b));
  const rebuilt = { attack: 1, defense: 1, income: 1, vision: 1 };
  for (const id of owned) {
    const tech = techById.get(id);
    if (!tech?.mods) continue;
    if (tech.mods.attack) rebuilt.attack *= tech.mods.attack;
    if (tech.mods.defense) rebuilt.defense *= tech.mods.defense;
    if (tech.mods.income) rebuilt.income *= tech.mods.income;
    if (tech.mods.vision) rebuilt.vision *= tech.mods.vision;
  }
  for (const id of player.domainIds) {
    const domain = domainById.get(id);
    if (!domain?.mods) continue;
    if (domain.mods.attack) rebuilt.attack *= domain.mods.attack;
    if (domain.mods.defense) rebuilt.defense *= domain.mods.defense;
    if (domain.mods.income) rebuilt.income *= domain.mods.income;
    if (domain.mods.vision) rebuilt.vision *= domain.mods.vision;
  }

  player.mods.attack = rebuilt.attack;
  player.mods.defense = rebuilt.defense;
  player.mods.income = rebuilt.income;
  player.mods.vision = rebuilt.vision;
  playerBaseMods.set(player.id, rebuilt);
  recomputePlayerEffectsForPlayer(player);
  recomputeClusterBonusForPlayer(player);
  markVisibilityDirty(player.id);
};

const setClusterControlDelta = (playerId: string, clusterId: string, delta: number): void => {
  let byCluster = clusterControlledTilesByPlayer.get(playerId);
  if (!byCluster) {
    byCluster = new Map<string, number>();
    clusterControlledTilesByPlayer.set(playerId, byCluster);
  }
  byCluster.set(clusterId, (byCluster.get(clusterId) ?? 0) + delta);
  if ((byCluster.get(clusterId) ?? 0) <= 0) byCluster.delete(clusterId);
  const p = players.get(playerId);
  if (p) recomputeClusterBonusForPlayer(p);
};

const isNearMountain = (x: number, y: number, r = 4): boolean => {
  for (let dy = -r; dy <= r; dy += 1) {
    for (let dx = -r; dx <= r; dx += 1) {
      if (Math.abs(dx) + Math.abs(dy) > r) continue;
      const wx = wrapX(x + dx, WORLD_WIDTH);
      const wy = wrapY(y + dy, WORLD_HEIGHT);
      if (terrainAt(wx, wy) === "MOUNTAIN") return true;
    }
  }
  return false;
};

const isGrassIronTile = (x: number, y: number, relaxed = false): boolean => {
  if (terrainAt(x, y) !== "LAND") return false;
  if (landBiomeAt(x, y) !== "GRASS") return false;
  return isNearMountain(x, y, relaxed ? 2 : 1);
};

const clusterRuleMatch = (x: number, y: number, resource: ResourceType): boolean => {
  if (terrainAt(x, y) !== "LAND") return false;
  const biome = landBiomeAt(x, y);
  const shade = grassShadeAt(x, y);
  const region = regionTypeAtLocal(x, y);
  if (resource === "FISH") return biome === "COASTAL_SAND";
  if (resource === "IRON") return (biome === "SAND" && isNearMountain(x, y, 4)) || isGrassIronTile(x, y);
  if (resource === "GEMS") return biome === "SAND";
  if (resource === "FARM") return biome === "GRASS" && shade === "LIGHT";
  if (resource === "FUR") return !isCoastalLand(x, y) && ((biome === "GRASS" && shade === "DARK" && region === "DEEP_FOREST") || biome === "SAND");
  return false;
};

const clusterRuleMatchRelaxed = (x: number, y: number, resource: ResourceType): boolean => {
  if (terrainAt(x, y) !== "LAND") return false;
  const biome = landBiomeAt(x, y);
  const shade = grassShadeAt(x, y);
  if (resource === "FISH") return biome === "COASTAL_SAND";
  if (resource === "IRON") return (biome === "SAND" && isNearMountain(x, y, 5)) || isGrassIronTile(x, y, true);
  if (resource === "GEMS") return biome === "SAND";
  if (resource === "FARM") return biome === "GRASS";
  if (resource === "FUR") return biome === "SAND" || (biome === "GRASS" && shade === "DARK");
  return false;
};

const resourcePlacementAllowed = (x: number, y: number, resource: ResourceType, relaxed = false): boolean =>
  relaxed ? clusterRuleMatchRelaxed(x, y, resource) : clusterRuleMatch(x, y, resource);

const isForestFrontierTile = (x: number, y: number): boolean =>
  terrainAt(x, y) === "LAND" && landBiomeAt(x, y) === "GRASS" && grassShadeAt(x, y) === "DARK";

const FOREST_FRONTIER_CLAIM_MULT = 4;
const FOREST_SETTLEMENT_MULT = 2;

const frontierClaimDurationMsAt = (x: number, y: number): number =>
  isForestFrontierTile(x, y) ? FRONTIER_CLAIM_MS * FOREST_FRONTIER_CLAIM_MULT : FRONTIER_CLAIM_MS;

const nearestLandTiles = (
  originX: number,
  originY: number,
  candidates: Array<{ x: number; y: number }>,
  limit: number,
  predicate?: (tile: { x: number; y: number }) => boolean
): TileKey[] => {
  return candidates
    .filter((tile) => (predicate ? predicate(tile) : true))
    .sort((a, b) => {
      const adx = Math.min(Math.abs(a.x - originX), WORLD_WIDTH - Math.abs(a.x - originX));
      const ady = Math.min(Math.abs(a.y - originY), WORLD_HEIGHT - Math.abs(a.y - originY));
      const bdx = Math.min(Math.abs(b.x - originX), WORLD_WIDTH - Math.abs(b.x - originX));
      const bdy = Math.min(Math.abs(b.y - originY), WORLD_HEIGHT - Math.abs(b.y - originY));
      return adx + ady - (bdx + bdy);
    })
    .slice(0, limit)
    .map((tile) => key(tile.x, tile.y));
};

const collectClusterTiles = (cx: number, cy: number, resource: ResourceType, count: number): TileKey[] => {
  const out: TileKey[] = [];
  const q: Array<{ x: number; y: number; d: number }> = [{ x: cx, y: cy, d: 0 }];
  const seen = new Set<string>([key(cx, cy)]);
  const maxDist = resource === "IRON" && landBiomeAt(cx, cy) === "GRASS" ? 3 : 5;
  while (q.length > 0 && out.length < count) {
    const cur = q.shift()!;
    if (cur.d > maxDist) continue;
    const wx = wrapX(cur.x, WORLD_WIDTH);
    const wy = wrapY(cur.y, WORLD_HEIGHT);
    const tk = key(wx, wy);
    if (!clusterByTile.has(tk) && clusterRuleMatch(wx, wy, resource)) out.push(tk);
    const next = [
      [cur.x, cur.y - 1],
      [cur.x + 1, cur.y],
      [cur.x, cur.y + 1],
      [cur.x - 1, cur.y]
    ] as const;
    for (const [nx, ny] of next) {
      const nwx = wrapX(nx, WORLD_WIDTH);
      const nwy = wrapY(ny, WORLD_HEIGHT);
      const nk = key(nwx, nwy);
      if (seen.has(nk)) continue;
      seen.add(nk);
      q.push({ x: nwx, y: nwy, d: cur.d + 1 });
    }
  }
  return out.length >= count ? out.slice(0, count) : [];
};

const collectClusterTilesRelaxed = (cx: number, cy: number, resource: ResourceType, count: number): TileKey[] => {
  const out: TileKey[] = [];
  const q: Array<{ x: number; y: number; d: number }> = [{ x: cx, y: cy, d: 0 }];
  const seen = new Set<string>([key(cx, cy)]);
  const maxDist = resource === "IRON" && landBiomeAt(cx, cy) === "GRASS" ? 4 : 6;
  while (q.length > 0 && out.length < count) {
    const cur = q.shift()!;
    if (cur.d > maxDist) continue;
    const wx = wrapX(cur.x, WORLD_WIDTH);
    const wy = wrapY(cur.y, WORLD_HEIGHT);
    const tk = key(wx, wy);
    if (!clusterByTile.has(tk) && clusterRuleMatchRelaxed(wx, wy, resource)) out.push(tk);
    const next = [
      [cur.x, cur.y - 1],
      [cur.x + 1, cur.y],
      [cur.x, cur.y + 1],
      [cur.x - 1, cur.y]
    ] as const;
    for (const [nx, ny] of next) {
      const nwx = wrapX(nx, WORLD_WIDTH);
      const nwy = wrapY(ny, WORLD_HEIGHT);
      const nk = key(nwx, nwy);
      if (seen.has(nk)) continue;
      seen.add(nk);
      q.push({ x: nwx, y: nwy, d: cur.d + 1 });
    }
  }
  return out.length >= count ? out.slice(0, count) : [];
};

const clusterTileCountForResource = (resource: ResourceType, x: number, y: number): number => {
  if (resource === "FUR" && landBiomeAt(x, y) === "SAND") return 4;
  if (resource === "IRON" && landBiomeAt(x, y) === "GRASS") return 4;
  return 8;
};

const clusterRadiusForResource = (resource: ResourceType, x: number, y: number): number => {
  if (resource === "FUR" && landBiomeAt(x, y) === "SAND") return 2;
  if (resource === "IRON" && landBiomeAt(x, y) === "GRASS") return 2;
  return 3;
};

const generateClusters = (seed: number): void => {
  clusterByTile.clear();
  clustersById.clear();
  const clusterPlan: ResourceType[] = [
    ...Array.from({ length: 52 }, () => "FARM" as const),
    ...Array.from({ length: 52 }, () => "FUR" as const),
    ...Array.from({ length: 30 }, () => "GEMS" as const),
    ...Array.from({ length: 52 }, () => "IRON" as const),
    ...Array.from({ length: 52 }, () => "FISH" as const)
  ];

  const defByResource = new Map<ResourceType, (typeof clusterTypeDefs)[number]>();
  for (const def of clusterTypeDefs) defByResource.set(def.resourceType, def);

  const centers: Array<{ x: number; y: number }> = [];
  const minCenterDist = 9;
  let attemptSeed = 0;
  for (let i = 0; i < clusterPlan.length; i += 1) {
    const resource = clusterPlan[i]!;
    const def = defByResource.get(resource);
    if (!def) continue;
    let placed = false;
    for (let tries = 0; tries < 5000; tries += 1) {
      const cx = Math.floor(seeded01((attemptSeed + tries) * 31, (attemptSeed + tries) * 47, seed + 101) * WORLD_WIDTH);
      const cy = Math.floor(seeded01((attemptSeed + tries) * 53, (attemptSeed + tries) * 67, seed + 151) * WORLD_HEIGHT);
      if (!clusterRuleMatch(cx, cy, resource)) continue;
      const tooClose = centers.some((c) => {
        const dx = Math.min(Math.abs(c.x - cx), WORLD_WIDTH - Math.abs(c.x - cx));
        const dy = Math.min(Math.abs(c.y - cy), WORLD_HEIGHT - Math.abs(c.y - cy));
        return dx + dy < minCenterDist;
      });
      if (tooClose) continue;
      const clusterTileCount = clusterTileCountForResource(resource, cx, cy);
      const tiles = collectClusterTiles(cx, cy, resource, clusterTileCount);
      if (tiles.length < clusterTileCount) continue;
      const clusterId = `cl-${clustersById.size}`;
      clustersById.set(clusterId, {
        clusterId,
        clusterType: def.type,
        resourceType: def.resourceType,
        centerX: cx,
        centerY: cy,
        radius: clusterRadiusForResource(resource, cx, cy),
        controlThreshold: def.threshold
      });
      for (const tk of tiles) clusterByTile.set(tk, clusterId);
      centers.push({ x: cx, y: cy });
      placed = true;
      break;
    }
    attemptSeed += 911;
    if (!placed) {
      for (let tries = 0; tries < 3500; tries += 1) {
        const cx = Math.floor(seeded01((attemptSeed + tries) * 17, (attemptSeed + tries) * 29, seed + 701) * WORLD_WIDTH);
        const cy = Math.floor(seeded01((attemptSeed + tries) * 37, (attemptSeed + tries) * 43, seed + 751) * WORLD_HEIGHT);
        if (!clusterRuleMatchRelaxed(cx, cy, resource)) continue;
        const clusterTileCount = clusterTileCountForResource(resource, cx, cy);
        const tiles = collectClusterTilesRelaxed(cx, cy, resource, clusterTileCount);
        if (tiles.length < clusterTileCount) continue;
        const clusterId = `cl-${clustersById.size}`;
        clustersById.set(clusterId, {
          clusterId,
          clusterType: def.type,
          resourceType: def.resourceType,
          centerX: cx,
          centerY: cy,
          radius: clusterRadiusForResource(resource, cx, cy),
          controlThreshold: def.threshold
        });
        for (const tk of tiles) clusterByTile.set(tk, clusterId);
        placed = true;
        break;
      }
    }
  }
};

const applyClusterResources = (x: number, y: number, base: ResourceType | undefined): ResourceType | undefined => {
  const cid = clusterByTile.get(key(x, y));
  if (!cid) return base;
  const c = clustersById.get(cid);
  if (!c) return base;
  // Cluster membership is already validated when the world is generated or restored.
  // Re-running placement rules here turns every runtime tile read into a worldgen check.
  return clusterResourceType(c);
};

type DockCandidate = { x: number; y: number; componentId: number; seaX: number; seaY: number };
type LandComponentMeta = {
  id: number;
  tileCount: number;
  fallbackX: number;
  fallbackY: number;
  oceanCandidates: DockCandidate[];
};

const selectSpacedDockCandidates = (candidates: DockCandidate[], count: number, seed: number): DockCandidate[] => {
  if (count <= 0 || candidates.length === 0) return [];
  const pool = [...candidates];
  const startIdx = Math.floor(seeded01(seed + count, seed + pool.length, seed + 4123) * pool.length);
  const selected: DockCandidate[] = [pool[startIdx]!];
  while (selected.length < count && selected.length < pool.length) {
    let bestCandidate: DockCandidate | undefined;
    let bestDistance = Number.NEGATIVE_INFINITY;
    for (const candidate of pool) {
      if (selected.includes(candidate)) continue;
      let minDistance = Number.POSITIVE_INFINITY;
      for (const existing of selected) {
        const dx = Math.min(Math.abs(candidate.seaX - existing.seaX), WORLD_WIDTH - Math.abs(candidate.seaX - existing.seaX));
        const dy = Math.min(Math.abs(candidate.seaY - existing.seaY), WORLD_HEIGHT - Math.abs(candidate.seaY - existing.seaY));
        minDistance = Math.min(minDistance, dx + dy);
      }
      if (minDistance > bestDistance) {
        bestDistance = minDistance;
        bestCandidate = candidate;
      }
    }
    if (!bestCandidate) break;
    selected.push(bestCandidate);
  }
  return selected;
};
const analyzeLandComponentsForDocks = (
  seed: number,
  oceanMask: Uint8Array
): { components: LandComponentMeta[]; componentByIndex: Int32Array } => {
  const total = WORLD_WIDTH * WORLD_HEIGHT;
  const visited = new Uint8Array(total);
  const componentByIndex = new Int32Array(total);
  componentByIndex.fill(-1);
  const queue = new Int32Array(total);
  const out: LandComponentMeta[] = [];
  let componentId = 0;

  for (let y = 0; y < WORLD_HEIGHT; y += 1) {
    for (let x = 0; x < WORLD_WIDTH; x += 1) {
      const startIdx = worldIndex(x, y);
      if (visited[startIdx] || terrainAt(x, y) !== "LAND") continue;
      visited[startIdx] = 1;
      let head = 0;
      let tail = 0;
      queue[tail++] = startIdx;
      const comp: LandComponentMeta = { id: componentId, tileCount: 0, fallbackX: x, fallbackY: y, oceanCandidates: [] };

      while (head < tail) {
        const idx = queue[head++]!;
        componentByIndex[idx] = componentId;
        comp.tileCount += 1;
        const cx = idx % WORLD_WIDTH;
        const cy = Math.floor(idx / WORLD_WIDTH);
        if (seeded01(cx, cy, seed + 733) > 0.997) {
          comp.fallbackX = cx;
          comp.fallbackY = cy;
        }
        const ocean = adjacentOceanSea(cx, cy, oceanMask);
        if (ocean && !clusterByTile.has(key(cx, cy))) {
          comp.oceanCandidates.push({
            x: cx,
            y: cy,
            componentId,
            seaX: ocean.x,
            seaY: ocean.y
          });
        }
        const neighbors: Array<[number, number]> = [
          [wrapX(cx, WORLD_WIDTH), wrapY(cy - 1, WORLD_HEIGHT)],
          [wrapX(cx + 1, WORLD_WIDTH), wrapY(cy, WORLD_HEIGHT)],
          [wrapX(cx, WORLD_WIDTH), wrapY(cy + 1, WORLD_HEIGHT)],
          [wrapX(cx - 1, WORLD_WIDTH), wrapY(cy, WORLD_HEIGHT)]
        ];
        for (const [nx, ny] of neighbors) {
          const nIdx = worldIndex(nx, ny);
          if (visited[nIdx] || terrainAt(nx, ny) !== "LAND") continue;
          visited[nIdx] = 1;
          queue[tail++] = nIdx;
        }
      }

      out.push(comp);
      componentId += 1;
    }
  }
  return { components: out, componentByIndex };
};

const generateDocks = (seed: number): void => {
  docksByTile.clear();
  dockById.clear();
  dockLinkedTileKeysByDockTileKey.clear();
  const oceanMask = largestSeaComponentMask();
  const { components, componentByIndex } = analyzeLandComponentsForDocks(seed, oceanMask);
  const eligibleComponents = components.filter((comp) => comp.tileCount >= 24 && comp.oceanCandidates.length > 0);
  const primaryDockCandidateByComponent = new Map<number, DockCandidate>();
  for (const comp of eligibleComponents) {
    const primary = selectSpacedDockCandidates(comp.oceanCandidates, 1, seed + comp.id * 17)[0];
    if (primary) primaryDockCandidateByComponent.set(comp.id, primary);
  }

  const componentIds = eligibleComponents.map((comp) => comp.id);
  const componentSeaDistance = (aComponentId: number, bComponentId: number): number => {
    const a = primaryDockCandidateByComponent.get(aComponentId);
    const b = primaryDockCandidateByComponent.get(bComponentId);
    if (!a || !b) return Number.POSITIVE_INFINITY;
    const dx = Math.min(Math.abs(a.seaX - b.seaX), WORLD_WIDTH - Math.abs(a.seaX - b.seaX));
    const dy = Math.min(Math.abs(a.seaY - b.seaY), WORLD_HEIGHT - Math.abs(a.seaY - b.seaY));
    return dx + dy;
  };

  const componentEdges: Array<[number, number]> = [];
  const componentEdgeKeys = new Set<string>();
  const addComponentEdge = (aComponentId: number, bComponentId: number): void => {
    if (aComponentId === bComponentId) return;
    const edgeKey = aComponentId < bComponentId ? `${aComponentId}|${bComponentId}` : `${bComponentId}|${aComponentId}`;
    if (componentEdgeKeys.has(edgeKey)) return;
    componentEdgeKeys.add(edgeKey);
    componentEdges.push([aComponentId, bComponentId]);
  };

  if (componentIds.length > 1) {
    const visitedComponents = new Set<number>([componentIds[0]!]);
    while (visitedComponents.size < componentIds.length) {
      let bestFrom = -1;
      let bestTo = -1;
      let bestDist = Number.POSITIVE_INFINITY;
      for (const fromComponentId of visitedComponents) {
        for (const toComponentId of componentIds) {
          if (visitedComponents.has(toComponentId)) continue;
          const dist = componentSeaDistance(fromComponentId, toComponentId);
          if (dist < bestDist) {
            bestDist = dist;
            bestFrom = fromComponentId;
            bestTo = toComponentId;
          }
        }
      }
      if (bestFrom < 0 || bestTo < 0) break;
      addComponentEdge(bestFrom, bestTo);
      visitedComponents.add(bestTo);
    }

    for (const componentId of componentIds) {
      const comp = eligibleComponents.find((candidate) => candidate.id === componentId);
      if (!comp || comp.tileCount >= LARGE_ISLAND_MULTI_DOCK_TILE_THRESHOLD) continue;
      let bestNeighbor = -1;
      let bestDist = Number.POSITIVE_INFINITY;
      for (const otherComponentId of componentIds) {
        if (otherComponentId === componentId) continue;
        const dist = componentSeaDistance(componentId, otherComponentId);
        if (dist < bestDist) {
          bestDist = dist;
          bestNeighbor = otherComponentId;
        }
      }
      if (bestNeighbor >= 0) addComponentEdge(componentId, bestNeighbor);
    }
  }

  const degreeByComponent = new Map<number, number>();
  for (const [aComponentId, bComponentId] of componentEdges) {
    degreeByComponent.set(aComponentId, (degreeByComponent.get(aComponentId) ?? 0) + 1);
    degreeByComponent.set(bComponentId, (degreeByComponent.get(bComponentId) ?? 0) + 1);
  }

  const selectedByComponent = new Map<number, DockCandidate[]>();
  for (const comp of eligibleComponents) {
    const desiredCount =
      comp.tileCount >= LARGE_ISLAND_MULTI_DOCK_TILE_THRESHOLD ? Math.max(2, degreeByComponent.get(comp.id) ?? 1) : 1;
    const picks = selectSpacedDockCandidates(comp.oceanCandidates, Math.min(desiredCount, comp.oceanCandidates.length), seed + comp.id * 97);
    if (picks.length > 0) selectedByComponent.set(comp.id, picks);
  }

  const selected = [...selectedByComponent.values()].flat();
  const docks: Dock[] = selected.map((s, i) => ({
    dockId: `dock-${i}`,
    tileKey: key(s.x, s.y),
    pairedDockId: "",
    connectedDockIds: [],
    cooldownUntil: 0
  }));

  const dockIndexByTileKey = new Map<TileKey, number>();
  const dockIndicesByComponent = new Map<number, number[]>();
  for (let i = 0; i < selected.length; i += 1) {
    dockIndexByTileKey.set(key(selected[i]!.x, selected[i]!.y), i);
    const componentId = selected[i]!.componentId;
    const indices = dockIndicesByComponent.get(componentId) ?? [];
    indices.push(i);
    dockIndicesByComponent.set(componentId, indices);
  }

  const edgeKeys = new Set<string>();
  const addDockConnection = (aIdx: number, bIdx: number): void => {
    if (aIdx === bIdx) return;
    const a = docks[aIdx]!;
    const b = docks[bIdx]!;
    const edgeKey = a.dockId < b.dockId ? `${a.dockId}|${b.dockId}` : `${b.dockId}|${a.dockId}`;
    if (edgeKeys.has(edgeKey)) return;
    edgeKeys.add(edgeKey);
    if (!a.connectedDockIds?.includes(b.dockId)) a.connectedDockIds = [...(a.connectedDockIds ?? []), b.dockId];
    if (!b.connectedDockIds?.includes(a.dockId)) b.connectedDockIds = [...(b.connectedDockIds ?? []), a.dockId];
    if (!a.pairedDockId) a.pairedDockId = b.dockId;
    if (!b.pairedDockId) b.pairedDockId = a.dockId;
  };

  const nextDockOffsetByComponent = new Map<number, number>();
  const dockIndexForEdge = (componentId: number): number | undefined => {
    const indices = dockIndicesByComponent.get(componentId);
    if (!indices || indices.length === 0) return undefined;
    const comp = eligibleComponents.find((candidate) => candidate.id === componentId);
    if (!comp || comp.tileCount < LARGE_ISLAND_MULTI_DOCK_TILE_THRESHOLD) return indices[0];
    const offset = nextDockOffsetByComponent.get(componentId) ?? 0;
    nextDockOffsetByComponent.set(componentId, offset + 1);
    return indices[Math.min(offset, indices.length - 1)];
  };

  for (const [aComponentId, bComponentId] of componentEdges) {
    const aIdx = dockIndexForEdge(aComponentId);
    const bIdx = dockIndexForEdge(bComponentId);
    if (aIdx === undefined || bIdx === undefined) continue;
    addDockConnection(aIdx, bIdx);
  }

  for (const d of docks) {
    if (!d.pairedDockId && (!d.connectedDockIds || d.connectedDockIds.length === 0)) continue;
    docksByTile.set(d.tileKey, d);
    dockById.set(d.dockId, d);
  }
};

const townTypeAt = (x: number, y: number): "MARKET" | "FARMING" => {
  const region = regionTypeAtLocal(x, y);
  if (region === "FERTILE_PLAINS") return seeded01(x, y, activeSeason.worldSeed + 881) > 0.2 ? "FARMING" : "MARKET";
  if (region === "ANCIENT_HEARTLAND") return "MARKET";
  if (region === "CRYSTAL_WASTES") return "MARKET";
  if (region === "BROKEN_HIGHLANDS") return seeded01(x, y, activeSeason.worldSeed + 884) > 0.72 ? "FARMING" : "MARKET";

  const biome = landBiomeAt(x, y);
  if (biome === "GRASS") return seeded01(x, y, activeSeason.worldSeed + 882) > 0.7 ? "MARKET" : "FARMING";
  return "MARKET";
};

const generateTowns = (seed: number): void => {
  townsByTile.clear();
  firstSpecialSiteCaptureClaimed.clear();
  const worldScale = (WORLD_WIDTH * WORLD_HEIGHT) / 1_000_000;
  const target = Math.max(70, Math.floor(180 * worldScale));
  const minSpacing = Math.max(5, Math.floor(Math.min(WORLD_WIDTH, WORLD_HEIGHT) * 0.018));
  const placed: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < 120_000 && placed.length < target; i += 1) {
    const x = Math.floor(seeded01(i * 13, i * 17, seed + 9301) * WORLD_WIDTH);
    const y = Math.floor(seeded01(i * 19, i * 23, seed + 9311) * WORLD_HEIGHT);
    if (terrainAt(x, y) !== "LAND") continue;
    const tileKey = key(x, y);
    if (docksByTile.has(tileKey) || clusterByTile.has(tileKey)) continue;
    const tooClose = placed.some((p) => {
      const dx = Math.min(Math.abs(p.x - x), WORLD_WIDTH - Math.abs(p.x - x));
      const dy = Math.min(Math.abs(p.y - y), WORLD_HEIGHT - Math.abs(p.y - y));
      return dx + dy < minSpacing;
    });
    if (tooClose) continue;
    placed.push({ x, y });
    townsByTile.set(tileKey, {
      townId: `town-${townsByTile.size}`,
      tileKey,
      type: townTypeAt(x, y),
      population: POPULATION_MIN + Math.floor(seeded01(x, y, seed + 9601) * POPULATION_START_SPREAD),
      maxPopulation: POPULATION_MAX,
      connectedTownCount: 0,
      connectedTownBonus: 0,
      lastGrowthTickAt: now()
    });
  }
};

const canHostShardSiteAt = (x: number, y: number): boolean => {
  if (terrainAt(x, y) !== "LAND") return false;
  const tileKey = key(x, y);
  if (docksByTile.has(tileKey) || clusterByTile.has(tileKey) || townsByTile.has(tileKey)) return false;
  return !shardSitesByTile.has(tileKey);
};

const shardSiteViewAt = (tileKey: TileKey): Tile["shardSite"] | undefined => {
  const site = shardSitesByTile.get(tileKey);
  if (!site) return undefined;
  if (typeof site.expiresAt === "number" && site.expiresAt <= now()) return undefined;
  return {
    kind: site.kind,
    amount: site.amount,
    ...(typeof site.expiresAt === "number" ? { expiresAt: site.expiresAt } : {})
  };
};

const generateShardCaches = (seed: number): void => {
  shardSitesByTile.clear();
  let placed = 0;
  for (let i = 0; i < 200_000 && placed < SHARD_CACHE_COUNT; i += 1) {
    const x = Math.floor(seeded01(i * 41, i * 59, seed + 11_101) * WORLD_WIDTH);
    const y = Math.floor(seeded01(i * 67, i * 71, seed + 11_171) * WORLD_HEIGHT);
    if (!canHostShardSiteAt(x, y)) continue;
    const amount = seeded01(x, y, seed + 11_221) > 0.84 ? 2 : 1;
    shardSitesByTile.set(key(x, y), {
      tileKey: key(x, y),
      kind: "CACHE",
      amount
    });
    placed += 1;
  }
};

const ensureSpawnShardNearby = (x: number, y: number): void => {
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      const sx = wrapX(x + dx, WORLD_WIDTH);
      const sy = wrapY(y + dy, WORLD_HEIGHT);
      if (shardSitesByTile.has(key(sx, sy))) return;
    }
  }
  const preferredOffsets: Array<[number, number]> = [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
    [2, 0],
    [0, 2],
    [-2, 0],
    [0, -2]
  ];
  for (const [dx, dy] of preferredOffsets) {
    const sx = wrapX(x + dx, WORLD_WIDTH);
    const sy = wrapY(y + dy, WORLD_HEIGHT);
    if (!canHostShardSiteAt(sx, sy)) continue;
    const tileKey = key(sx, sy);
    shardSitesByTile.set(tileKey, {
      tileKey,
      kind: "CACHE",
      amount: 2
    });
    markSummaryChunkDirtyAtTile(sx, sy);
    return;
  }
};

const spawnShardRain = (): void => {
  if (!hasOnlinePlayers()) return;
  const count = SHARD_RAIN_SITE_MIN + Math.floor(Math.random() * (SHARD_RAIN_SITE_MAX - SHARD_RAIN_SITE_MIN + 1));
  const touched: Array<{ x: number; y: number }> = [];
  let placed = 0;
  let latestExpiresAt = 0;
  let attempts = 0;
  while (placed < count && attempts < count * 300) {
    attempts += 1;
    const x = Math.floor(Math.random() * WORLD_WIDTH);
    const y = Math.floor(Math.random() * WORLD_HEIGHT);
    if (!canHostShardSiteAt(x, y)) continue;
    const tileKey = key(x, y);
    shardSitesByTile.set(tileKey, {
      tileKey,
      kind: "FALL",
      amount: 1 + (Math.random() > 0.8 ? 1 : 0),
      expiresAt: now() + SHARD_RAIN_TTL_MS
    });
    latestExpiresAt = Math.max(latestExpiresAt, shardSitesByTile.get(tileKey)?.expiresAt ?? 0);
    touched.push({ x, y });
    placed += 1;
  }
  if (touched.length > 0) {
    broadcast({
      type: "SHARD_RAIN_EVENT",
      siteCount: touched.length,
      expiresAt: latestExpiresAt
    });
    broadcastLocalVisionDelta(touched);
  }
};

const maybeSpawnScheduledShardRain = (): void => {
  const current = new Date(now());
  const hour = current.getHours();
  const minute = current.getMinutes();
  if (minute !== 0) return;
  if (!SHARD_RAIN_SCHEDULE_HOURS.includes(hour as (typeof SHARD_RAIN_SCHEDULE_HOURS)[number])) return;
  const slotKey = `${current.getFullYear()}-${current.getMonth() + 1}-${current.getDate()}-${hour}`;
  if (lastShardRainSlotKey === slotKey) return;
  lastShardRainSlotKey = slotKey;
  spawnShardRain();
};

const expireShardSites = (): void => {
  const touched: Array<{ x: number; y: number }> = [];
  for (const [tileKey, site] of shardSitesByTile) {
    if (site.kind !== "FALL" || typeof site.expiresAt !== "number" || site.expiresAt > now()) continue;
    shardSitesByTile.delete(tileKey);
    const [x, y] = parseKey(tileKey);
    touched.push({ x, y });
    markSummaryChunkDirtyAtTile(x, y);
  }
  if (touched.length > 0) broadcastLocalVisionDelta(touched);
};

const collectShardSite = (player: Player, x: number, y: number): { ok: boolean; amount?: number; reason?: string } => {
  if (!visible(player, x, y)) return { ok: false, reason: "tile is not visible" };
  const tileKey = key(x, y);
  const site = shardSitesByTile.get(tileKey);
  if (!site) return { ok: false, reason: "no shard cache on this tile" };
  if (typeof site.expiresAt === "number" && site.expiresAt <= now()) {
    shardSitesByTile.delete(tileKey);
    return { ok: false, reason: "the shardfall has already faded" };
  }
  shardSitesByTile.delete(tileKey);
  const stock = getOrInitStrategicStocks(player.id);
  stock.SHARD += site.amount;
  markSummaryChunkDirtyAtTile(x, y);
  broadcastLocalVisionDelta([{ x, y }]);
  return { ok: true, amount: site.amount };
};

const canPlaceTownAt = (x: number, y: number, ignoreTileKey?: TileKey): boolean => {
  if (terrainAt(x, y) !== "LAND") return false;
  const tk = key(x, y);
  if (tk !== ignoreTileKey && townsByTile.has(tk)) return false;
  if (docksByTile.has(tk)) return false;
  if (clusterByTile.has(tk)) return false;
  return true;
};

const findNearestTownPlacement = (originX: number, originY: number, ignoreTileKey?: TileKey): TileKey | undefined => {
  if (canPlaceTownAt(originX, originY, ignoreTileKey)) return key(originX, originY);
  const maxRadius = Math.max(WORLD_WIDTH, WORLD_HEIGHT);
  for (let radius = 1; radius <= maxRadius; radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const x = wrapX(originX + dx, WORLD_WIDTH);
        const y = wrapY(originY + dy, WORLD_HEIGHT);
        if (canPlaceTownAt(x, y, ignoreTileKey)) return key(x, y);
      }
    }
  }
  return undefined;
};

const townPlacementsNeedNormalization = (): boolean => {
  const seen = new Set<TileKey>();
  for (const town of townsByTile.values()) {
    const tileKey = town.tileKey;
    if (seen.has(tileKey)) return true;
    seen.add(tileKey);
    const [x, y] = parseKey(tileKey);
    if (!canPlaceTownAt(x, y, tileKey)) return true;
  }
  return false;
};

const normalizeTownPlacements = (): void => {
  const existingTowns = [...townsByTile.values()];
  townsByTile.clear();
  for (const town of existingTowns) {
    const [x, y] = parseKey(town.tileKey);
    const destinationKey = findNearestTownPlacement(x, y, town.tileKey);
    if (!destinationKey) continue;
    const [destX, destY] = parseKey(destinationKey);
    townsByTile.set(destinationKey, {
      ...town,
      tileKey: destinationKey,
      type: townTypeAt(destX, destY)
    });
  }
};

const TOWN_CAPTURE_SHOCK_MS = 10 * 60 * 1000;
const TOWN_CAPTURE_GROWTH_RADIUS = 20;

const applyTownWarShock = (tileKey: TileKey): void => {
  const [x, y] = parseKey(tileKey);
  const until = now() + TOWN_CAPTURE_SHOCK_MS;
  for (const otherTownKey of townsByTile.keys()) {
    const [ox, oy] = parseKey(otherTownKey);
    if (chebyshevDistance(ox, oy, x, y) > TOWN_CAPTURE_GROWTH_RADIUS) continue;
    const currentUntil = townGrowthShockUntilByTile.get(otherTownKey) ?? 0;
    townGrowthShockUntilByTile.set(otherTownKey, Math.max(currentUntil, until));
  }
};

const applyTownCaptureShock = (tileKey: TileKey): void => {
  const until = now() + TOWN_CAPTURE_SHOCK_MS;
  townCaptureShockUntilByTile.set(tileKey, until);
  applyTownWarShock(tileKey);
};

const ensureBaselineEconomyCoverage = (seed: number): void => {
  const block = 30;
  for (let by = 0; by < WORLD_HEIGHT; by += block) {
    for (let bx = 0; bx < WORLD_WIDTH; bx += block) {
      const land: Array<{ x: number; y: number }> = [];
      let hasTown = false;
      let hasFood = false;

      for (let dy = 0; dy < block; dy += 1) {
        for (let dx = 0; dx < block; dx += 1) {
          const x = wrapX(bx + dx, WORLD_WIDTH);
          const y = wrapY(by + dy, WORLD_HEIGHT);
          if (terrainAt(x, y) !== "LAND") continue;
          const tk = key(x, y);
          land.push({ x, y });
          if (townsByTile.has(tk)) hasTown = true;
          const clusterId = clusterByTile.get(tk);
          const cluster = clusterId ? clustersById.get(clusterId) : undefined;
          if (cluster && (clusterResourceType(cluster) === "FARM" || clusterResourceType(cluster) === "FISH")) hasFood = true;
        }
      }

      if (land.length === 0) continue;

      if (!hasTown) {
        const picked = land.find((tile) => !docksByTile.has(key(tile.x, tile.y)) && !clusterByTile.has(key(tile.x, tile.y)) && !townsByTile.has(key(tile.x, tile.y)));
        if (picked) {
          townsByTile.set(key(picked.x, picked.y), {
            townId: `town-${townsByTile.size}`,
            tileKey: key(picked.x, picked.y),
            type: townTypeAt(picked.x, picked.y),
            population: POPULATION_MIN + Math.floor(seeded01(picked.x, picked.y, seed + 9601) * POPULATION_START_SPREAD),
            maxPopulation: POPULATION_MAX,
            connectedTownCount: 0,
            connectedTownBonus: 0,
            lastGrowthTickAt: now()
          });
        }
      }

      if (!hasFood) {
        const center = land[Math.floor(seeded01(bx + 3, by + 7, seed + 9501) * land.length)]!;
        const pickFoodTiles = (resource: ResourceType, relaxed: boolean): TileKey[] =>
          nearestLandTiles(center.x, center.y, land, 8, (tile) => {
            const tk = key(tile.x, tile.y);
            if (clusterByTile.has(tk) || docksByTile.has(tk) || townsByTile.has(tk)) return false;
            return resourcePlacementAllowed(tile.x, tile.y, resource, relaxed);
          });
        let resourceType: ResourceType | undefined;
        let foodTiles = pickFoodTiles("FARM", false);
        if (foodTiles.length >= 6) resourceType = "FARM";
        else {
          foodTiles = pickFoodTiles("FISH", false);
          if (foodTiles.length >= 6) resourceType = "FISH";
        }
        if (!resourceType) {
          foodTiles = pickFoodTiles("FARM", true);
          if (foodTiles.length >= 6) resourceType = "FARM";
          else {
            foodTiles = pickFoodTiles("FISH", true);
            if (foodTiles.length >= 6) resourceType = "FISH";
          }
        }
        if (foodTiles.length >= 6) {
          const clusterId = `cl-${clustersById.size}`;
          clustersById.set(clusterId, {
            clusterId,
            clusterType: resourceType === "FISH" ? "COASTAL_SHOALS" : "FERTILE_PLAINS",
            resourceType: resourceType ?? "FARM",
            centerX: center.x,
            centerY: center.y,
            radius: 3,
            controlThreshold: 3
          });
          for (const tk of foodTiles) clusterByTile.set(tk, clusterId);
        }
      }
    }
  }
};

const ensureInterestCoverage = (seed: number): void => {
  const block = 15;
  for (let by = 0; by < WORLD_HEIGHT; by += block) {
    for (let bx = 0; bx < WORLD_WIDTH; bx += block) {
      const land: Array<{ x: number; y: number }> = [];
      let interesting = false;
      for (let dy = 0; dy < block; dy += 1) {
        for (let dx = 0; dx < block; dx += 1) {
          const x = wrapX(bx + dx, WORLD_WIDTH);
          const y = wrapY(by + dy, WORLD_HEIGHT);
          if (terrainAt(x, y) !== "LAND") continue;
          const tk = key(x, y);
          land.push({ x, y });
          if (clusterByTile.has(tk) || docksByTile.has(tk) || townsByTile.has(tk)) interesting = true;
        }
      }
      if (interesting || land.length === 0) continue;
      let picked = land[Math.floor(seeded01(bx, by, seed + 9401) * land.length)]!;
      for (let i = 0; i < land.length; i += 1) {
        const cand = land[i]!;
        if (clusterByTile.has(key(cand.x, cand.y))) continue;
        if (docksByTile.has(key(cand.x, cand.y))) continue;
        picked = cand;
        break;
      }
      const tk = key(picked.x, picked.y);
      if (!townsByTile.has(tk) && !docksByTile.has(tk) && !clusterByTile.has(tk)) {
        townsByTile.set(tk, {
          townId: `town-${townsByTile.size}`,
          tileKey: tk,
          type: townTypeAt(picked.x, picked.y),
          population: POPULATION_MIN + Math.floor(seeded01(picked.x, picked.y, seed + 9601) * POPULATION_START_SPREAD),
          maxPopulation: POPULATION_MAX,
          connectedTownCount: 0,
          connectedTownBonus: 0,
          lastGrowthTickAt: now()
        });
      }
    }
  }
};

const townSupport = (townKey: TileKey, ownerId: string): { supportCurrent: number; supportMax: number } => {
  const town = townsByTile.get(townKey);
  if (town && townPopulationTier(town.population) === "SETTLEMENT") return { supportCurrent: 0, supportMax: 0 };
  const [x, y] = parseKey(townKey);
  let supportCurrent = 0;
  let supportMax = 0;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const nx = wrapX(x + dx, WORLD_WIDTH);
      const ny = wrapY(y + dy, WORLD_HEIGHT);
      if (terrainAt(nx, ny) !== "LAND") continue;
      supportMax += 1;
      const nk = key(nx, ny);
      if (ownership.get(nk) !== ownerId) continue;
      if (ownershipStateByTile.get(nk) !== "SETTLED") continue;
      supportCurrent += 1;
    }
  }
  return { supportCurrent, supportMax };
};

const townPopulationTier = (population: number): PopulationTier => {
  if (population >= 5_000_000) return "METROPOLIS";
  if (population >= 1_000_000) return "GREAT_CITY";
  if (population >= 100_000) return "CITY";
  if (population >= POPULATION_TOWN_MIN) return "TOWN";
  return "SETTLEMENT";
};

const townPopulationMultiplier = (population: number): number => {
  const tier = townPopulationTier(population);
  if (tier === "SETTLEMENT") return 0.6;
  if (tier === "CITY") return 1.5;
  if (tier === "GREAT_CITY") return 2.5;
  if (tier === "METROPOLIS") return 3.2;
  return 1;
};

const townManpowerSnapshotForOwner = (
  town: TownDefinition,
  ownerId: string | undefined
): { cap: number; regenPerMinute: number } => {
  if (!ownerId) return { cap: 0, regenPerMinute: 0 };
  if (!isTownFedForOwner(town.tileKey, ownerId)) return { cap: 0, regenPerMinute: 0 };
  const base = TOWN_MANPOWER_BY_TIER[townPopulationTier(town.population)];
  if ((townCaptureShockUntilByTile.get(town.tileKey) ?? 0) > now()) {
    return { cap: 0, regenPerMinute: 0 };
  }
  return base;
};

const playerManpowerCap = (player: Player): number => {
  let cap = 0;
  for (const tk of ownedTownKeysForPlayer(player.id)) {
    const town = townsByTile.get(tk);
    if (!town) continue;
    cap += townManpowerSnapshotForOwner(town, player.id).cap;
  }
  return Math.max(0, cap);
};

const manpowerRegenWeightForSettlementIndex = (index: number): number => {
  if (index < 5) return 1;
  if (index < 15) return 0.5;
  return 0.2;
};

const prettyTownTypeLabel = (type: TownDefinition["type"]): string => {
  if (type === "MARKET") return "Market";
  if (type === "FARMING") return "Farming";
  return "Ancient";
};

const prettyEconomicStructureLabel = (type: EconomicStructureType): string => {
  if (type === "FARMSTEAD") return "Farmstead";
  if (type === "CAMP") return "Camp";
  if (type === "MINE") return "Mine";
  if (type === "MARKET") return "Market";
  if (type === "GRANARY") return "Granary";
  if (type === "BANK") return "Bank";
  if (type === "AIRPORT") return "Airport";
  if (type === "QUARTERMASTER") return "Quartermaster";
  if (type === "IRONWORKS") return "Ironworks";
  if (type === "CRYSTAL_SYNTHESIZER") return "Crystal Synthesizer";
  if (type === "FUEL_PLANT") return "Fuel Plant";
  if (type === "CARAVANARY") return "Caravanary";
  if (type === "CUSTOMS_HOUSE") return "Customs House";
  if (type === "GARRISON_HALL") return "Garrison Hall";
  if (type === "GOVERNORS_OFFICE") return "Governor's Office";
  return "Radar System";
};

const prettyTownName = (town: TownDefinition, tileKey = town.tileKey): string => {
  const [x, y] = parseKey(tileKey);
  return `${prettyTownTypeLabel(town.type)} town (${x}, ${y})`;
};

const playerManpowerRegenPerMinute = (player: Player): number => {
  let regen = 0;
  const townKeys = ownedTownKeysForPlayer(player.id);
  for (const [index, tk] of townKeys.entries()) {
    const town = townsByTile.get(tk);
    if (!town) continue;
    regen += townManpowerSnapshotForOwner(town, player.id).regenPerMinute * manpowerRegenWeightForSettlementIndex(index);
  }
  return Math.max(0, regen);
};

const playerManpowerBreakdown = (
  player: Player
): { cap: ManpowerBreakdownLine[]; regen: ManpowerBreakdownLine[] } => {
  const cap: ManpowerBreakdownLine[] = [];
  const regen: ManpowerBreakdownLine[] = [];
  const townKeys = ownedTownKeysForPlayer(player.id);
  for (const [index, tk] of townKeys.entries()) {
    const town = townsByTile.get(tk);
    if (!town) continue;
    const snapshot = townManpowerSnapshotForOwner(town, player.id);
    if (snapshot.cap > 0) {
      const tier = townPopulationTier(town.population);
      const captured = (townCaptureShockUntilByTile.get(town.tileKey) ?? 0) > now();
      cap.push({
        label: `${prettyTownName(town, tk)} (${tier.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())})`,
        amount: snapshot.cap,
        ...(captured ? { note: "Recently captured" } : {})
      });
    }
    if (snapshot.regenPerMinute > 0) {
      const weight = manpowerRegenWeightForSettlementIndex(index);
      const amount = snapshot.regenPerMinute * weight;
      regen.push({
        label: prettyTownName(town, tk),
        amount,
        ...(weight < 1 ? { note: `${Math.round(weight * 100)}% weight` } : {})
      });
    }
  }
  return { cap, regen };
};

const effectiveManpowerAt = (player: Player, nowMs = now()): number => {
  const cap = playerManpowerCap(player);
  if (!Number.isFinite(player.manpower)) return cap;
  if (!Number.isFinite(player.manpowerUpdatedAt)) return Math.min(cap, Math.max(0, player.manpower));
  const elapsedMinutes = Math.max(0, (nowMs - player.manpowerUpdatedAt) / 60_000);
  const regenPerMinute = playerManpowerRegenPerMinute(player);
  const nextManpower = elapsedMinutes > 0 ? player.manpower + elapsedMinutes * regenPerMinute : player.manpower;
  return Math.max(0, Math.min(cap, nextManpower));
};

const townGoldIncomeEnabledForPlayer = (player: Player, nowMs = now()): boolean =>
  effectiveManpowerAt(player, nowMs) + MANPOWER_EPSILON >= playerManpowerCap(player);

const applyManpowerRegen = (player: Player): void => {
  const cap = playerManpowerCap(player);
  if (!Number.isFinite(player.manpower)) player.manpower = cap;
  const previousCap = Number.isFinite(player.manpowerCapSnapshot) ? player.manpowerCapSnapshot! : cap;
  if (cap > previousCap) {
    player.manpower = Math.min(cap, Math.max(0, player.manpower) + (cap - previousCap));
  }
  if (!Number.isFinite(player.manpowerUpdatedAt)) {
    player.manpower = Math.min(cap, Math.max(0, player.manpower));
    player.manpowerUpdatedAt = now();
    player.manpowerCapSnapshot = cap;
    return;
  }
  const nowMs = now();
  player.manpower = effectiveManpowerAt(player, nowMs);
  player.manpowerUpdatedAt = nowMs;
  player.manpowerCapSnapshot = cap;
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

const activeStructureAt = (tileKey: TileKey, ownerId: string | undefined, type: EconomicStructureType): boolean => {
  const structure = economicStructuresByTile.get(tileKey);
  return Boolean(structure && structure.type === type && ownerId && structure.ownerId === ownerId && structure.status === "active");
};

const ownedStructureAt = (tileKey: TileKey, ownerId: string | undefined, type: EconomicStructureType): boolean => {
  const structure = economicStructuresByTile.get(tileKey);
  return Boolean(structure && structure.type === type && ownerId && structure.ownerId === ownerId);
};

const supportedTownKeysForTile = (tileKey: TileKey, ownerId: string | undefined): TileKey[] => {
  if (!ownerId) return [];
  const [x, y] = parseKey(tileKey);
  const out: TileKey[] = [];
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const nx = wrapX(x + dx, WORLD_WIDTH);
      const ny = wrapY(y + dy, WORLD_HEIGHT);
      const nk = key(nx, ny);
      const town = townsByTile.get(nk);
      if (!town || townPopulationTier(town.population) === "SETTLEMENT") continue;
      if (ownership.get(nk) !== ownerId) continue;
      if (ownershipStateByTile.get(nk) !== "SETTLED") continue;
      out.push(nk);
    }
  }
  return out;
};

const structureForSupportedTown = (townKey: TileKey, ownerId: string | undefined, type: EconomicStructureType): EconomicStructure | undefined => {
  if (!ownerId) return undefined;
  const [x, y] = parseKey(townKey);
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const nk = key(wrapX(x + dx, WORLD_WIDTH), wrapY(y + dy, WORLD_HEIGHT));
      const structure = economicStructuresByTile.get(nk);
      if (structure && structure.type === type && structure.ownerId === ownerId) return structure;
    }
  }
  return undefined;
};

const SUPPORT_ONLY_STRUCTURE_TYPES: EconomicStructureType[] = [
  "MARKET",
  "GRANARY",
  "BANK",
  "QUARTERMASTER",
  "IRONWORKS",
  "CRYSTAL_SYNTHESIZER",
  "FUEL_PLANT"
];

const isSupportOnlyStructureType = (structureType: EconomicStructureType): boolean => SUPPORT_ONLY_STRUCTURE_TYPES.includes(structureType);

const availableSupportTileKeysForTown = (
  townKey: TileKey,
  ownerId: string | undefined,
  structureType: EconomicStructureType
): TileKey[] => {
  if (!ownerId || !isSupportOnlyStructureType(structureType)) return [];
  if (structureForSupportedTown(townKey, ownerId, structureType)) return [];
  const [x, y] = parseKey(townKey);
  const out: TileKey[] = [];
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const nx = wrapX(x + dx, WORLD_WIDTH);
      const ny = wrapY(y + dy, WORLD_HEIGHT);
      const nk = key(nx, ny);
      const tile = playerTile(nx, ny);
      if (tile.terrain !== "LAND") continue;
      if (tile.ownerId !== ownerId || tile.ownershipState !== "SETTLED") continue;
      if (tile.resource || townsByTile.has(nk) || docksByTile.has(nk)) continue;
      if (fortsByTile.has(nk) || siegeOutpostsByTile.has(nk) || observatoriesByTile.has(nk) || economicStructuresByTile.has(nk)) continue;
      const supportedTowns = supportedTownKeysForTile(nk, ownerId);
      if (supportedTowns.length !== 1 || supportedTowns[0] !== townKey) continue;
      out.push(nk);
    }
  }
  return out;
};

const pickRandomAvailableSupportTileForTown = (
  townKey: TileKey,
  ownerId: string | undefined,
  structureType: EconomicStructureType
): TileKey | undefined => {
  const candidates = availableSupportTileKeysForTown(townKey, ownerId, structureType);
  if (candidates.length === 0) return undefined;
  return candidates[Math.floor(Math.random() * candidates.length)];
};

const ownedTownKeysForPlayer = (playerId: string): TileKey[] =>
  [...townsByTile.values()]
    .filter((town) => ownership.get(town.tileKey) === playerId && ownershipStateByTile.get(town.tileKey) === "SETTLED")
    .sort((a, b) => a.townId.localeCompare(b.townId))
    .map((town) => town.tileKey);

const initialSettlementPopulationAt = (x: number, y: number): number =>
  POPULATION_MIN + Math.floor(seeded01(x, y, activeSeason.worldSeed + 9601) * POPULATION_START_SPREAD);

const isRelocatableSettlementTown = (town: TownDefinition | undefined): town is TownDefinition =>
  Boolean(town && townPopulationTier(town.population) === "SETTLEMENT");

const oldestSettledSettlementCandidateForPlayer = (playerId: string): TileKey | undefined => {
  const player = players.get(playerId);
  if (!player) return undefined;
  return [...player.territoryTiles]
    .filter((tk) => {
      if (ownership.get(tk) !== playerId) return false;
      if (ownershipStateByTile.get(tk) !== "SETTLED") return false;
      const [x, y] = parseKey(tk);
      if (terrainAtRuntime(x, y) !== "LAND") return false;
      if (townsByTile.has(tk) || docksByTile.has(tk)) return false;
      if (applyClusterResources(x, y, resourceAt(x, y))) return false;
      if (fortsByTile.has(tk) || observatoriesByTile.has(tk) || siegeOutpostsByTile.has(tk) || economicStructuresByTile.has(tk)) return false;
      return true;
    })
    .sort((left, right) => {
      const leftAge = settledSinceByTile.get(left) ?? Number.MAX_SAFE_INTEGER;
      const rightAge = settledSinceByTile.get(right) ?? Number.MAX_SAFE_INTEGER;
      if (leftAge !== rightAge) return leftAge - rightAge;
      return left.localeCompare(right);
    })[0];
};

const createSettlementAtTile = (
  ownerId: string,
  tileKey: TileKey,
  previousTown?: Pick<TownDefinition, "townId" | "type">
): TownDefinition | undefined => {
  const [x, y] = parseKey(tileKey);
  if (ownership.get(tileKey) !== ownerId || ownershipStateByTile.get(tileKey) !== "SETTLED") return undefined;
  if (terrainAtRuntime(x, y) !== "LAND") return undefined;
  if (townsByTile.has(tileKey) || docksByTile.has(tileKey) || fortsByTile.has(tileKey) || observatoriesByTile.has(tileKey) || siegeOutpostsByTile.has(tileKey) || economicStructuresByTile.has(tileKey))
    return undefined;
  if (applyClusterResources(x, y, resourceAt(x, y))) return undefined;
  const town: TownDefinition = {
    townId: previousTown?.townId ?? `town-${townsByTile.size}`,
    tileKey,
    type: previousTown?.type ?? townTypeAt(x, y),
    population: initialSettlementPopulationAt(x, y),
    maxPopulation: POPULATION_MAX,
    connectedTownCount: 0,
    connectedTownBonus: 0,
    lastGrowthTickAt: now()
  };
  townsByTile.set(tileKey, town);
  markSummaryChunkDirtyAtTile(x, y);
  sendVisibleTileDeltaAt(x, y);
  return town;
};

const playerHasOtherGoldIncome = (playerId: string): boolean => {
  const player = players.get(playerId);
  if (!player) return false;
  for (const tk of player.territoryTiles) {
    if (ownership.get(tk) !== playerId || ownershipStateByTile.get(tk) !== "SETTLED") continue;
    const [x, y] = parseKey(tk);
    if (terrainAtRuntime(x, y) !== "LAND") continue;
    const resource = resourceAt(x, y);
    if (resource && (resourceRate[resource] ?? 0) > 0) return true;
    const dock = docksByTile.get(tk);
    if (dock && dockIncomeForOwner(dock, playerId) > 0) return true;
    const town = townsByTile.get(tk);
    if (town && townPopulationTier(town.population) !== "SETTLEMENT" && townPotentialIncomeForOwner(town, playerId, { ignoreSuppression: true, ignoreManpowerGate: true }) > 0)
      return true;
  }
  return false;
};

const ensureFallbackSettlementForPlayer = (playerId: string): boolean => {
  const player = players.get(playerId);
  if (!player) return false;
  if (ownedTownKeysForPlayer(playerId).some((tk) => isRelocatableSettlementTown(townsByTile.get(tk)))) return false;
  if (playerHasOtherGoldIncome(playerId)) return false;
  const candidate = oldestSettledSettlementCandidateForPlayer(playerId);
  if (!candidate) return false;
  const created = createSettlementAtTile(playerId, candidate);
  if (!created) return false;
  recomputeTownNetworkForPlayer(playerId);
  return true;
};

const relocateCapturedSettlementForPlayer = (playerId: string, displacedTown: Pick<TownDefinition, "townId" | "type">): boolean => {
  const candidate = oldestSettledSettlementCandidateForPlayer(playerId);
  if (!candidate) return false;
  const created = createSettlementAtTile(playerId, candidate, displacedTown);
  if (!created) return false;
  recomputeTownNetworkForPlayer(playerId);
  return true;
};

const firstThreeTownKeySetForPlayer = (playerId: string): Set<TileKey> => {
  return new Set(ownedTownKeysForPlayer(playerId).slice(0, 3));
};

const townMaxPopulationForOwner = (town: TownDefinition, ownerId: string | undefined): number => {
  if (!ownerId) return POPULATION_MAX;
  const effects = getPlayerEffectsForPlayer(ownerId);
  if (effects.populationCapFirst3TownsMult <= 1) return POPULATION_MAX;
  const featured = ownedTownKeysForPlayer(ownerId).slice(0, 3);
  return featured.includes(town.tileKey) ? Math.round(POPULATION_MAX * effects.populationCapFirst3TownsMult) : POPULATION_MAX;
};

const connectedTownStepCount = (connectedTownCount: number): number => Math.max(0, Math.min(3, connectedTownCount));

const connectedTownBonusForOwner = (connectedTownCount: number, ownerId: string | undefined): number => {
  const stepCount = connectedTownStepCount(connectedTownCount);
  if (stepCount <= 0) return 0;
  const baseSteps = [0.5, 0.4, 0.3];
  const effects = ownerId ? getPlayerEffectsForPlayer(ownerId) : emptyPlayerEffects();
  const extraPerStep = effects.connectedTownStepBonusAdd;
  let total = 0;
  for (let index = 0; index < stepCount; index += 1) total += baseSteps[index]! + extraPerStep;
  return total;
};

const computeTownFeedingState = (
  playerId: string,
  availableFood: number
): { foodCoverage: number; fedTownKeys: Set<TileKey> } => {
  const player = players.get(playerId);
  if (!player) {
    return {
      foodCoverage: foodUpkeepCoverageByPlayer.get(playerId) ?? 1,
      fedTownKeys: new Set()
    };
  }

  const effects = getPlayerEffectsForPlayer(playerId);
  const townKeys = ownedTownKeysForPlayer(playerId);
  let upkeepNeed = 0;
  for (const townKey of townKeys) {
    const town = townsByTile.get(townKey);
    if (!town) continue;
    upkeepNeed += townFoodUpkeepPerMinute(town) * effects.townFoodUpkeepMult * governorUpkeepMultiplierAtTile(playerId, townKey);
  }
  let remainingFood = Math.max(0, availableFood);
  const fedTownKeys = new Set<TileKey>();
  for (const townKey of townKeys) {
    const town = townsByTile.get(townKey);
    if (!town) continue;
    const townNeed = townFoodUpkeepPerMinute(town) * effects.townFoodUpkeepMult * governorUpkeepMultiplierAtTile(playerId, townKey);
    if (townNeed <= 0) {
      fedTownKeys.add(townKey);
      continue;
    }
    if (remainingFood + 1e-9 < townNeed) continue;
    fedTownKeys.add(townKey);
    remainingFood = Math.max(0, remainingFood - townNeed);
  }
  const foodCoverage = upkeepNeed <= 0 ? 1 : Math.max(0, Math.min(1, Math.max(0, availableFood) / upkeepNeed));
  return { foodCoverage, fedTownKeys };
};

const townFeedingStateForPlayer = (
  playerId: string
): { foodCoverage: number; fedTownKeys: Set<TileKey> } => {
  const cached = townFeedingStateByPlayer.get(playerId);
  if (cached) return cached;
  const player = players.get(playerId);
  if (!player) {
    return {
      foodCoverage: foodUpkeepCoverageByPlayer.get(playerId) ?? 1,
      fedTownKeys: new Set()
    };
  }
  const stock = getOrInitStrategicStocks(playerId);
  return computeTownFeedingState(playerId, Math.max(0, stock.FOOD ?? 0) + availableYieldStrategicForPlayer(player, "FOOD"));
};

const isTownFedForOwner = (townKey: TileKey, ownerId: string | undefined): boolean => {
  if (!ownerId) return false;
  return townFeedingStateForPlayer(ownerId).fedTownKeys.has(townKey);
};

const townIncomeSuppressed = (townKey: TileKey): boolean => (townCaptureShockUntilByTile.get(townKey) ?? 0) > now();

const townGrowthSuppressed = (townKey: TileKey): boolean =>
  (townCaptureShockUntilByTile.get(townKey) ?? 0) > now() || (townGrowthShockUntilByTile.get(townKey) ?? 0) > now();

const marketIncomeMultiplierAt = (tileKey: TileKey, ownerId: string | undefined): number => {
  const structure = structureForSupportedTown(tileKey, ownerId, "MARKET");
  if (!structure || structure.status !== "active" || !isTownFedForOwner(tileKey, ownerId)) return 1;
  const effects = ownerId ? getPlayerEffectsForPlayer(ownerId) : emptyPlayerEffects();
  return 1 + effects.marketIncomeBonusAdd;
};

const marketCapMultiplierAt = (tileKey: TileKey, ownerId: string | undefined): number => {
  const structure = structureForSupportedTown(tileKey, ownerId, "MARKET");
  if (!structure || structure.status !== "active" || !isTownFedForOwner(tileKey, ownerId)) return 1;
  const effects = ownerId ? getPlayerEffectsForPlayer(ownerId) : emptyPlayerEffects();
  return 1 + effects.marketCapBonusAdd;
};

const granaryGrowthMultiplierAt = (tileKey: TileKey, ownerId: string | undefined): number => {
  const structure = structureForSupportedTown(tileKey, ownerId, "GRANARY");
  if (!structure || structure.status !== "active") return 1;
  const effects = ownerId ? getPlayerEffectsForPlayer(ownerId) : emptyPlayerEffects();
  return 1 + effects.granaryCapBonusAdd;
};

const bankIncomeMultiplierAt = (tileKey: TileKey, ownerId: string | undefined): number => {
  const structure = structureForSupportedTown(tileKey, ownerId, "BANK");
  return structure && structure.status === "active" ? 1.5 : 1;
};

const bankFlatIncomeBonusAt = (tileKey: TileKey, ownerId: string | undefined): number => {
  const structure = structureForSupportedTown(tileKey, ownerId, "BANK");
  return structure && structure.status === "active" ? 1 : 0;
};

const dockConnectedOwnedSettledCount = (dock: Dock, ownerId: string | undefined): number => {
  if (!ownerId) return 0;
  const linkedDockIds = dock.connectedDockIds?.length ? dock.connectedDockIds : [dock.pairedDockId];
  let count = 0;
  for (const dockId of linkedDockIds) {
    const linked = dockById.get(dockId);
    if (!linked) continue;
    if (ownership.get(linked.tileKey) !== ownerId) continue;
    if (ownershipStateByTile.get(linked.tileKey) !== "SETTLED") continue;
    count += 1;
  }
  return count;
};

const dockIncomeForOwner = (dock: Dock, ownerId: string | undefined): number => {
  if (!ownerId) return 0;
  if (ownership.get(dock.tileKey) !== ownerId) return 0;
  if (ownershipStateByTile.get(dock.tileKey) !== "SETTLED") return 0;
  const effects = getPlayerEffectsForPlayer(ownerId);
  const connectionCount = dockConnectedOwnedSettledCount(dock, ownerId);
  return DOCK_INCOME_PER_MIN * effects.dockGoldOutputMult * (1 + effects.dockConnectionBonusPerLink * connectionCount);
};

const dockCapForOwner = (dock: Dock, ownerId: string | undefined): number => {
  if (!ownerId) return TILE_YIELD_CAP_GOLD;
  return dockIncomeForOwner(dock, ownerId) * 60 * 8 * getPlayerEffectsForPlayer(ownerId).dockGoldCapMult;
};

const townPotentialIncomeForOwner = (
  town: TownDefinition,
  ownerId: string | undefined,
  options?: { ignoreSuppression?: boolean; ignoreManpowerGate?: boolean }
): number => {
  if (!ownerId) return 0;
  if (ownership.get(town.tileKey) !== ownerId) return 0;
  if (ownershipStateByTile.get(town.tileKey) !== "SETTLED") return 0;
  if (!options?.ignoreSuppression && townIncomeSuppressed(town.tileKey)) return 0;
  const owner = players.get(ownerId);
  if (!owner) return 0;
  if (!options?.ignoreManpowerGate && !townGoldIncomeEnabledForPlayer(owner)) return 0;
  const populationTier = townPopulationTier(town.population);
  if (populationTier === "SETTLEMENT") return SETTLEMENT_BASE_GOLD_PER_MIN;
  const { supportCurrent, supportMax } = townSupport(town.tileKey, ownerId);
  const supportRatio = supportMax <= 0 ? 1 : supportCurrent / supportMax;
  if (!isTownFedForOwner(town.tileKey, ownerId)) return 0;
  const effects = getPlayerEffectsForPlayer(ownerId);
  const firstThreeTownKeys = firstThreeTownKeySetForPlayer(ownerId);
  return (
    TOWN_BASE_GOLD_PER_MIN *
    supportRatio *
    townPopulationMultiplier(town.population) *
    (1 + town.connectedTownBonus) *
    marketIncomeMultiplierAt(town.tileKey, ownerId) *
    bankIncomeMultiplierAt(town.tileKey, ownerId) *
    (firstThreeTownKeys.has(town.tileKey) ? effects.firstThreeTownsGoldOutputMult : 1) *
    effects.townGoldOutputMult *
    effects.populationIncomeMult
  ) + bankFlatIncomeBonusAt(town.tileKey, ownerId);
};

const townIncomeForOwner = (town: TownDefinition, ownerId: string | undefined): number => townPotentialIncomeForOwner(town, ownerId);

const townCapForOwner = (town: TownDefinition, ownerId: string | undefined): number => {
  if (!ownerId) return TILE_YIELD_CAP_GOLD;
  const effects = getPlayerEffectsForPlayer(ownerId);
  const income = townPotentialIncomeForOwner(town, ownerId, { ignoreSuppression: true, ignoreManpowerGate: true });
  if (townPopulationTier(town.population) === "SETTLEMENT") return income * 60 * 8;
  return income * 60 * 8 * effects.townGoldCapMult * marketCapMultiplierAt(town.tileKey, ownerId);
};

const settledLandKeysForPlayer = (playerId: string): Set<TileKey> => {
  const settledLand = new Set<TileKey>();
  for (const tk of players.get(playerId)?.territoryTiles ?? []) {
    if (ownershipStateByTile.get(tk) === "SETTLED" && terrainAtRuntime(...parseKey(tk)) === "LAND") settledLand.add(tk);
  }
  return settledLand;
};

const directlyConnectedTownKeysForTown = (playerId: string, originTownKey: TileKey, settledLand = settledLandKeysForPlayer(playerId)): TileKey[] => {
  if (!settledLand.has(originTownKey)) return [];
  const ownedTownKeySet = new Set(ownedTownKeysForPlayer(playerId));
  const queue = [originTownKey];
  const visited = new Set<TileKey>([originTownKey]);
  const connectedTowns = new Set<TileKey>();
  while (queue.length > 0) {
    const current = queue.shift()!;
    const [cx, cy] = parseKey(current);
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const nextKey = key(wrapX(cx + dx, WORLD_WIDTH), wrapY(cy + dy, WORLD_HEIGHT));
        if (!settledLand.has(nextKey) || visited.has(nextKey)) continue;
        if (ownedTownKeySet.has(nextKey) && nextKey !== originTownKey) {
          connectedTowns.add(nextKey);
          visited.add(nextKey);
          continue;
        }
        visited.add(nextKey);
        queue.push(nextKey);
      }
    }
  }
  return [...connectedTowns];
};

const recomputeTownNetworkForPlayer = (playerId: string): void => {
  const settledLand = settledLandKeysForPlayer(playerId);
  for (const townKey of ownedTownKeysForPlayer(playerId)) {
    const town = townsByTile.get(townKey);
    if (!town) continue;
    const connectedTownCount = directlyConnectedTownKeysForTown(playerId, townKey, settledLand).length;
    town.connectedTownCount = connectedTownCount;
    town.connectedTownBonus = connectedTownBonusForOwner(connectedTownCount, playerId);
  }
};

const townFoodUpkeepPerMinute = (town: TownDefinition): number => {
  const base = 0.1;
  const tier = townPopulationTier(town.population);
  if (tier === "SETTLEMENT") return 0;
  if (tier === "CITY") return base * 2;
  if (tier === "GREAT_CITY") return base * 4;
  if (tier === "METROPOLIS") return base * 8;
  return base;
};

const pausePopulationGrowthFromWar = (playerId: string): void => {
  const effects = getPlayerEffectsForPlayer(playerId);
  const pauseMs = Math.round(GROWTH_PAUSE_MS * effects.growthPauseDurationMult);
  const currentUntil = growthPausedUntilByPlayer.get(playerId) ?? 0;
  const baseUntil = Math.max(now(), currentUntil);
  growthPausedUntilByPlayer.set(playerId, Math.min(now() + GROWTH_PAUSE_MAX_MS, baseUntil + pauseMs));
};

const baseTownPopulationGrowthPerMinuteForOwner = (town: TownDefinition, ownerId: string | undefined): number => {
  if (!ownerId) return 0;
  if (ownership.get(town.tileKey) !== ownerId) return 0;
  if (ownershipStateByTile.get(town.tileKey) !== "SETTLED") return 0;
  if (!isTownFedForOwner(town.tileKey, ownerId)) return 0;
  const effects = getPlayerEffectsForPlayer(ownerId);
  const firstThreeTownKeys = firstThreeTownKeySetForPlayer(ownerId);
  const populationTier = townPopulationTier(town.population);
  const growthMult =
    effects.populationGrowthMult *
    (firstThreeTownKeys.has(town.tileKey) ? effects.firstThreeTownsPopulationGrowthMult : 1) *
    granaryGrowthMultiplierAt(town.tileKey, ownerId) *
    (populationTier === "SETTLEMENT" ? 4 : 1);
  const logisticFactor = 1 - town.population / Math.max(1, town.maxPopulation);
  if (logisticFactor <= 0) return 0;
  return town.population * POPULATION_GROWTH_BASE_RATE * growthMult * logisticFactor;
};

const townGrowthModifiersForOwner = (
  town: TownDefinition,
  ownerId: string | undefined
): Array<{ label: "Recently captured" | "Nearby war" | "Long time peace"; deltaPerMinute: number }> => {
  const baseGrowth = baseTownPopulationGrowthPerMinuteForOwner(town, ownerId);
  if (baseGrowth <= 0) return [];
  if ((townCaptureShockUntilByTile.get(town.tileKey) ?? 0) > now()) {
    return [{ label: "Recently captured", deltaPerMinute: -baseGrowth }];
  }
  if ((townGrowthShockUntilByTile.get(town.tileKey) ?? 0) > now()) {
    return [{ label: "Nearby war", deltaPerMinute: -baseGrowth }];
  }
  return [{ label: "Long time peace", deltaPerMinute: baseGrowth }];
};

const updateTownPopulationForPlayer = (player: Player): Set<TileKey> => {
  const touched = new Set<TileKey>();
  const nowMs = now();
  for (const tk of ownedTownKeysForPlayer(player.id)) {
    const town = townsByTile.get(tk);
    if (!town) continue;
    const elapsedMinutes = Math.floor((nowMs - town.lastGrowthTickAt) / POPULATION_GROWTH_TICK_MS);
    if (elapsedMinutes <= 0) continue;
    town.lastGrowthTickAt += elapsedMinutes * POPULATION_GROWTH_TICK_MS;
    town.maxPopulation = townMaxPopulationForOwner(town, player.id);
    const baseGrowth = baseTownPopulationGrowthPerMinuteForOwner(town, player.id);
    if (baseGrowth <= 0) continue;
    const growth = townGrowthSuppressed(tk) ? 0 : baseGrowth * 2 * elapsedMinutes;
    if (growth <= 0) continue;
    town.population = Math.min(town.maxPopulation, town.population + growth);
    touched.add(tk);
  }
  return touched;
};

const townPopulationGrowthPerMinuteForOwner = (town: TownDefinition, ownerId: string | undefined): number => {
  const baseGrowth = baseTownPopulationGrowthPerMinuteForOwner(town, ownerId);
  if (baseGrowth <= 0 || townGrowthSuppressed(town.tileKey)) return 0;
  return baseGrowth * 2;
};

const tileYieldCapsFor = (tileKey: TileKey, ownerId: string | undefined): { gold: number; strategicEach: number } => {
  const effects = ownerId ? getPlayerEffectsForPlayer(ownerId) : emptyPlayerEffects();
  if (!ownerId) {
    return {
      gold: TILE_YIELD_CAP_GOLD * effects.harvestCapMult,
      strategicEach: TILE_YIELD_CAP_RESOURCE * effects.harvestCapMult
    };
  }
  const [x, y] = parseKey(tileKey);
  const resource = resourceAt(x, y);
  const dock = docksByTile.get(tileKey);
  const town = townsByTile.get(tileKey);
  const sabotageMult = siphonMultiplierAt(tileKey);
  const goldPerMinute =
    ((resource ? (resourceRate[resource] ?? 0) * sabotageMult : 0) +
      (dock ? dockIncomeForOwner(dock, ownerId) : 0) +
      (town ? townIncomeForOwner(town, ownerId) * sabotageMult : 0)) *
    (players.get(ownerId)?.mods.income ?? 1) *
    PASSIVE_INCOME_MULT *
    HARVEST_GOLD_RATE_MULT;
  const strategicResource = toStrategicResource(resource);
  const strategicBaseDaily = strategicResource && resource ? (strategicDailyFromResource[resource] ?? 0) : 0;
  const structure = economicStructuresByTile.get(tileKey);
  const converterDaily = structure && structure.ownerId === ownerId && structure.status === "active" ? converterStructureOutputFor(structure.type) : undefined;
  const converterMaxDaily = converterDaily ? Math.max(0, ...Object.values(converterDaily)) : 0;
  const fallbackGoldCap = TILE_YIELD_CAP_GOLD * effects.harvestCapMult;
  const fallbackResourceCap = TILE_YIELD_CAP_RESOURCE * effects.harvestCapMult;
  return {
    gold: town
      ? townCapForOwner(town, ownerId)
      : dock
        ? dockCapForOwner(dock, ownerId)
        : goldPerMinute > 0
          ? goldPerMinute * 60 * 8
          : fallbackGoldCap,
    strategicEach: strategicBaseDaily > 0 ? strategicBaseDaily / 3 : converterMaxDaily > 0 ? converterMaxDaily / 3 : fallbackResourceCap
  };
};

const claimFirstSpecialSiteCaptureBonus = (player: Player, x: number, y: number): number => {
  const tk = key(x, y);
  if (firstSpecialSiteCaptureClaimed.has(tk)) return 0;
  const town = townsByTile.get(tk);
  if (!town) return 0;
  firstSpecialSiteCaptureClaimed.add(tk);
  player.points += FIRST_SPECIAL_SITE_CAPTURE_GOLD;
  recalcPlayerDerived(player);
  return FIRST_SPECIAL_SITE_CAPTURE_GOLD;
};

const worldLooksBland = (): boolean => {
  const step = 15;
  let checkedBlocks = 0;
  let blandBlocks = 0;
  for (let y = 0; y < WORLD_HEIGHT; y += step) {
    for (let x = 0; x < WORLD_WIDTH; x += step) {
      let land = 0;
      let nearBarrier = 0;
      let nearHook = 0;
      for (let dy = 0; dy < step; dy += 1) {
        for (let dx = 0; dx < step; dx += 1) {
          const wx = wrapX(x + dx, WORLD_WIDTH);
          const wy = wrapY(y + dy, WORLD_HEIGHT);
          const tt = terrainAt(wx, wy);
          if (tt !== "LAND") continue;
          land += 1;
          const neighbors: Array<[number, number]> = [
            [wx, wrapY(wy - 1, WORLD_HEIGHT)],
            [wrapX(wx + 1, WORLD_WIDTH), wy],
            [wx, wrapY(wy + 1, WORLD_HEIGHT)],
            [wrapX(wx - 1, WORLD_WIDTH), wy]
          ];
          if (neighbors.some(([nx, ny]) => terrainAt(nx, ny) !== "LAND")) nearBarrier += 1;
          const tk = key(wx, wy);
          if (clusterByTile.has(tk) || townsByTile.has(tk) || docksByTile.has(tk)) nearHook += 1;
        }
      }
      checkedBlocks += 1;
      if (land < step * step * 0.45) continue;
      const barrierRatio = nearBarrier / Math.max(1, land);
      const hookRatio = nearHook / Math.max(1, land);
      if (barrierRatio < 0.08 && hookRatio < 0.02) blandBlocks += 1;
    }
  }
  return blandBlocks > checkedBlocks * 0.22;
};

const regenerateStrategicWorld = (initialSeed: number): number => {
  let seed = initialSeed;
  for (let i = 0; i < 8; i += 1) {
    setWorldSeed(seed);
    generateClusters(seed);
    generateDocks(seed);
    generateTowns(seed);
    generateShardCaches(seed);
    ensureBaselineEconomyCoverage(seed);
    ensureInterestCoverage(seed);
    normalizeTownPlacements();
    if (!worldLooksBland()) return seed;
    seed = Math.floor(seeded01(seed + i * 101, seed + i * 137, seed + 9001) * 1_000_000_000);
  }
  return seed;
};

const dockLinkedDestinations = (fromDock: Dock): Dock[] => {
  const out: Dock[] = [];
  const seen = new Set<string>();
  for (const dockId of fromDock.connectedDockIds ?? []) {
    const linked = dockById.get(dockId);
    if (!linked || seen.has(linked.dockId)) continue;
    out.push(linked);
    seen.add(linked.dockId);
  }
  if (seen.size === 0 && fromDock.pairedDockId) {
    const direct = dockById.get(fromDock.pairedDockId);
    if (direct) {
      out.push(direct);
      seen.add(direct.dockId);
    }
    for (const d of dockById.values()) {
      if (d.dockId === fromDock.dockId) continue;
      if (d.pairedDockId !== fromDock.dockId) continue;
      if (seen.has(d.dockId)) continue;
      out.push(d);
      seen.add(d.dockId);
    }
  }
  return out;
};

const dockLinkedTileKeysByDockTileKey = new Map<TileKey, TileKey[]>();

const dockLinkedTileKeys = (fromDock: Dock): TileKey[] => {
  const cached = dockLinkedTileKeysByDockTileKey.get(fromDock.tileKey);
  if (cached) return cached;
  const linked = dockLinkedDestinations(fromDock).map((dock) => dock.tileKey);
  dockLinkedTileKeysByDockTileKey.set(fromDock.tileKey, linked);
  return linked;
};

const validDockCrossingTarget = (fromDock: Dock, toX: number, toY: number, allowAdjacentToDock = true): boolean => {
  const linked = dockLinkedDestinations(fromDock);
  for (const targetDock of linked) {
    const [px, py] = parseKey(targetDock.tileKey);
    if (toX === px && toY === py) return true;
    if (allowAdjacentToDock && isAdjacentTile(px, py, toX, toY)) return true;
  }
  return false;
};

const findOwnedDockOriginForCrossing = (
  actor: Player,
  toX: number,
  toY: number,
  allowAdjacentToDock = true
): Tile | undefined => {
  for (const tk of actor.territoryTiles) {
    const dock = docksByTile.get(tk);
    if (!dock) continue;
    const [x, y] = parseKey(tk);
    const t = playerTile(x, y);
    if (t.ownerId !== actor.id || t.terrain !== "LAND") continue;
    if (validDockCrossingTarget(dock, toX, toY, allowAdjacentToDock)) return t;
  }
  return undefined;
};

const adjacentNeighbors = (x: number, y: number): Tile[] => [
  playerTile(x, y - 1),
  playerTile(x + 1, y),
  playerTile(x, y + 1),
  playerTile(x - 1, y),
  playerTile(x - 1, y - 1),
  playerTile(x + 1, y - 1),
  playerTile(x + 1, y + 1),
  playerTile(x - 1, y + 1)
];

const isOccupiedPlayerTile = (tile: Tile): boolean => {
  if (!tile.ownerId) return false;
  if (tile.ownerId === BARBARIAN_OWNER_ID) return false;
  const state = tile.ownershipState ?? "SETTLED";
  return state === "FRONTIER" || state === "SETTLED";
};

const isValuableTile = (tile: Tile): boolean =>
  Boolean(tile.resource || tile.town || tile.fort || tile.siegeOutpost || tile.dockId);

const isBarbarianPriorityValueTile = (tile: Tile): boolean =>
  Boolean(tile.resource || tile.town || tile.siegeOutpost || tile.dockId);

const getBarbarianTargetPriority = (tile: Tile): number | null => {
  if (tile.terrain !== "LAND") return null;
  if (tile.fort) return null;
  if (!tile.ownerId) return isBarbarianPriorityValueTile(tile) ? 5 : 6;
  if (!isOccupiedPlayerTile(tile)) return null;
  const state = tile.ownershipState ?? "SETTLED";
  const highValue = isBarbarianPriorityValueTile(tile);
  if (state === "FRONTIER") return highValue ? 1 : 2;
  return highValue ? 3 : 4;
};

const removeBarbarianAgent = (agentId: string): void => {
  const agent = barbarianAgents.get(agentId);
  if (!agent) return;
  barbarianAgents.delete(agentId);
  barbarianAgentByTileKey.delete(key(agent.x, agent.y));
};

const removeBarbarianAtTile = (tileKey: TileKey): void => {
  const agentId = barbarianAgentByTileKey.get(tileKey);
  if (!agentId) return;
  removeBarbarianAgent(agentId);
};

const upsertBarbarianAgent = (agent: BarbarianAgent): void => {
  const existing = barbarianAgents.get(agent.id);
  if (existing) {
    barbarianAgentByTileKey.delete(key(existing.x, existing.y));
  }
  barbarianAgents.set(agent.id, agent);
  barbarianAgentByTileKey.set(key(agent.x, agent.y), agent.id);
};

const spawnBarbarianAgentAt = (x: number, y: number, progress = 0): BarbarianAgent => {
  const agent: BarbarianAgent = {
    id: `barb-${crypto.randomUUID()}`,
    x,
    y,
    progress,
    lastActionAt: now(),
    nextActionAt: now() + BARBARIAN_ACTION_INTERVAL_MS
  };
  upsertBarbarianAgent(agent);
  return agent;
};

const isNearPlayerTerritory = (x: number, y: number, radius: number): boolean => {
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      const t = playerTile(x + dx, y + dy);
      if (t.ownerId && t.ownerId !== BARBARIAN_OWNER_ID) return true;
    }
  }
  return false;
};

const spawnInitialBarbarians = (): void => {
  const worldScale = (WORLD_WIDTH * WORLD_HEIGHT) / 1_000_000;
  const target = Math.max(20, Math.floor(INITIAL_BARBARIAN_COUNT * worldScale));
  let spawned = 0;
  let attempts = 0;
  while (spawned < target && attempts < target * 200) {
    attempts += 1;
    const x = Math.floor(Math.random() * WORLD_WIDTH);
    const y = Math.floor(Math.random() * WORLD_HEIGHT);
    const tk = key(x, y);
    const t = playerTile(x, y);
    if (t.terrain !== "LAND") continue;
    if (t.ownerId) continue;
    if (t.town || t.dockId || t.fort || t.siegeOutpost) continue;
    if (isNearPlayerTerritory(x, y, 2)) continue;
    updateOwnership(x, y, BARBARIAN_OWNER_ID, "BARBARIAN");
    spawnBarbarianAgentAt(x, y);
    spawned += 1;
  }
};

const isOutOfSightOfAllPlayers = (x: number, y: number): boolean => {
  for (const p of players.values()) {
    if (visible(p, x, y)) return false;
  }
  return true;
};

const isValidBarbarianSpawnTile = (x: number, y: number): boolean => {
  const t = playerTile(x, y);
  if (t.terrain !== "LAND") return false;
  if (t.ownerId) return false;
  if (t.town || t.dockId || t.fort || t.siegeOutpost) return false;
  return true;
};

const maintainBarbarianPopulation = (): void => {
  if (!hasOnlinePlayers()) return;
  const deficit = Math.max(0, MIN_ACTIVE_BARBARIAN_AGENTS - barbarianAgents.size);
  if (deficit <= 0) return;
  const wanted = Math.min(deficit, BARBARIAN_MAINTENANCE_MAX_SPAWNS_PER_PASS);
  let spawned = 0;
  let attempts = 0;
  const maxAttempts = wanted * 600;
  while (spawned < wanted && attempts < maxAttempts) {
    attempts += 1;
    const x = Math.floor(Math.random() * WORLD_WIDTH);
    const y = Math.floor(Math.random() * WORLD_HEIGHT);
    if (!isValidBarbarianSpawnTile(x, y)) continue;
    if (!isOutOfSightOfAllPlayers(x, y)) continue;
    updateOwnership(x, y, BARBARIAN_OWNER_ID, "BARBARIAN");
    spawnBarbarianAgentAt(x, y, 0);
    spawned += 1;
    logBarbarianEvent(`spawn maintenance @ ${x},${y}`);
  }
};

const enqueueBarbarianMaintenance = (): void => {
  if (
    hasQueuedSystemSimulationCommand(
      (job) => job.command.type === "BARBARIAN_MAINTENANCE"
    )
  ) {
    return;
  }
  enqueueSystemSimulationCommand({ type: "BARBARIAN_MAINTENANCE" });
};

const getBarbarianProgressGain = (tile: Tile): number => (isOccupiedPlayerTile(tile) && isValuableTile(tile) ? 2 : 1);

const barbarianDefenseScore = (tile: Tile): number => {
  if (!tile.ownerId || tile.ownerId === BARBARIAN_OWNER_ID) return 0;
  const defender = players.get(tile.ownerId);
  if (!defender) return 10;
  const tk = key(tile.x, tile.y);
  const fortMult = fortDefenseMultAt(defender.id, tk);
  const dockMult = docksByTile.has(tk) ? DOCK_DEFENSE_MULT : 1;
  return (
    10 *
    defender.mods.defense *
    playerDefensiveness(defender) *
    fortMult *
    dockMult *
    settledDefenseMultiplierForTarget(defender.id, tile) *
    ownershipDefenseMultiplierForTarget(tile)
  );
};

const chooseBarbarianTarget = (agent: BarbarianAgent): Tile | undefined => {
  const candidates = adjacentNeighbors(agent.x, agent.y)
    .map((tile) => ({
      tile,
      priority: getBarbarianTargetPriority(tile),
      defenseScore: barbarianDefenseScore(tile),
      random: Math.random()
    }))
    .filter((entry) => entry.priority !== null) as Array<{ tile: Tile; priority: number; defenseScore: number; random: number }>;
  if (candidates.length === 0) return undefined;
  candidates.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    if (a.defenseScore !== b.defenseScore) return a.defenseScore - b.defenseScore;
    return a.random - b.random;
  });
  return candidates[0]?.tile;
};

const exportDockPairs = (): Array<{ ax: number; ay: number; bx: number; by: number }> => {
  const out: Array<{ ax: number; ay: number; bx: number; by: number }> = [];
  const seen = new Set<string>();
  for (const d of dockById.values()) {
    const linkedDockIds = d.connectedDockIds?.length ? d.connectedDockIds : d.pairedDockId ? [d.pairedDockId] : [];
    for (const dockId of linkedDockIds) {
      const pair = dockById.get(dockId);
      if (!pair) continue;
      const edgeKey = d.dockId < pair.dockId ? `${d.dockId}|${pair.dockId}` : `${pair.dockId}|${d.dockId}`;
      if (seen.has(edgeKey)) continue;
      seen.add(edgeKey);
      const [ax, ay] = parseKey(d.tileKey);
      const [bx, by] = parseKey(pair.tileKey);
      out.push({ ax, ay, bx, by });
    }
  }
  return out;
};

const applyBreachShockAround = (x: number, y: number, defenderId: string): void => {
  const neighbors: Array<[number, number]> = [
    [x, y - 1],
    [x + 1, y],
    [x, y + 1],
    [x - 1, y]
  ];
  for (const [nxRaw, nyRaw] of neighbors) {
    const nx = wrapX(nxRaw, WORLD_WIDTH);
    const ny = wrapY(nyRaw, WORLD_HEIGHT);
    const t = playerTile(nx, ny);
    if (t.terrain !== "LAND") continue;
    if (t.ownerId !== defenderId) continue;
    if (t.ownershipState !== "SETTLED") continue;
    breachShockByTile.set(key(nx, ny), { ownerId: defenderId, expiresAt: now() + BREACH_SHOCK_MS });
    markSummaryChunkDirtyAtTile(nx, ny);
  }
};

const clearWorldProgressForSeason = (): void => {
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
  cachedAiTerritoryStructureByPlayer.clear();
  cachedAiPlanningStaticByPlayer.clear();
  aiTerritoryVersionByPlayer.clear();
  cachedAiCompetitionContext = undefined;
  cachedChunkSnapshotByPlayer.clear();
  cachedSummaryChunkByChunkKey.clear();
  summaryChunkVersionByChunkKey.clear();
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
  generateShardCaches(activeSeason.worldSeed);
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
  if (fort) tile.fort = { ownerId: fort.ownerId, status: fort.status, ...(fort.completesAt !== undefined ? { completesAt: fort.completesAt } : {}) };
  const observatory = observatoriesByTile.get(tk);
  if (observatory) {
    tile.observatory = {
      ownerId: observatory.ownerId,
      status: observatory.status,
      ...(observatory.completesAt !== undefined ? { completesAt: observatory.completesAt } : {})
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
  const tier = townPopulationTier(town.population);
  const isFed = isTownFedForOwner(town.tileKey, ownerId);
  const owner = ownerId ? players.get(ownerId) : undefined;
  const manpowerGoldPaused = Boolean(owner && !townGoldIncomeEnabledForPlayer(owner));
  const market = structureForSupportedTown(town.tileKey, ownerId, "MARKET");
  const granary = structureForSupportedTown(town.tileKey, ownerId, "GRANARY");
  const bank = structureForSupportedTown(town.tileKey, ownerId, "BANK");
  const connectedTownKeys = includeConnectedTownNames && ownerId ? directlyConnectedTownKeysForTown(ownerId, town.tileKey) : [];
  return {
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
    populationTier: townPopulationTier(town.population),
    connectedTownCount: town.connectedTownCount,
    connectedTownBonus: town.connectedTownBonus,
    connectedTownNames: connectedTownKeys
      .map((townKey) => townsByTile.get(townKey)?.townId)
      .filter((label): label is string => Boolean(label)),
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
  const ownerEffects = ownerId ? getPlayerEffectsForPlayer(ownerId) : emptyPlayerEffects();
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
      const converterDaily = converterStructureOutputFor(economicStructure.type);
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

const playerTileSummary = (x: number, y: number, mode: ChunkSummaryMode = "thin"): Tile => {
  const wx = wrapX(x, WORLD_WIDTH);
  const wy = wrapY(y, WORLD_HEIGHT);
  const tk = key(wx, wy);
  const terrain = terrainAtRuntime(wx, wy);
  const ownerId = ownership.get(tk);
  const ownershipState = ownershipStateByTile.get(tk);
  const baseResource = terrain === "LAND" ? resourceAt(wx, wy) : undefined;
  const resource = terrain === "LAND" ? applyClusterResources(wx, wy, baseResource) : undefined;
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
  const tile: Tile = {
    x: wx,
    y: wy,
    terrain,
    detailLevel: "summary",
    lastChangedAt: mode === "thin" ? 0 : now()
  };
  if (resource && !dock) tile.resource = resource;
  if (ownerId) {
    tile.ownerId = ownerId;
    tile.ownershipState = ownershipState ?? (ownerId === BARBARIAN_OWNER_ID ? "BARBARIAN" : "SETTLED");
    if (ownerId !== BARBARIAN_OWNER_ID && players.get(ownerId)?.capitalTileKey === tk) tile.capital = true;
  }
  if (terrain === "LAND" && clusterType) tile.clusterType = clusterType;
  if (dock) tile.dockId = dock.dockId;
  if (terrain === "LAND") tile.shardSite = shardSite ?? null;
  if (breachShock && breachShock.expiresAt > now() && ownerId === breachShock.ownerId) tile.breachShockUntil = breachShock.expiresAt;
  if (town) tile.town = mode === "thin" ? thinTownSummaryForTile(town, ownerId) : townSummaryForTile(town, ownerId);
  if (fort) {
    const fortView: { ownerId: string; status: "under_construction" | "active"; completesAt?: number } = {
      ownerId: fort.ownerId,
      status: fort.status
    };
    if (fort.status === "under_construction") fortView.completesAt = fort.completesAt;
    tile.fort = fortView;
  }
  if (observatory) {
    tile.observatory = {
      ownerId: observatory.ownerId,
      status: mode === "thin" ? observatory.status : observatoryStatusForTile(observatory.ownerId, observatory.tileKey)
    };
    if (tile.observatory.status === "under_construction" && observatory.completesAt !== undefined) tile.observatory.completesAt = observatory.completesAt;
  }
  if (siegeOutpost) {
    const siegeView: { ownerId: string; status: "under_construction" | "active"; completesAt?: number } = {
      ownerId: siegeOutpost.ownerId,
      status: siegeOutpost.status
    };
    if (siegeOutpost.status === "under_construction") siegeView.completesAt = siegeOutpost.completesAt;
    tile.siegeOutpost = siegeView;
  }
  if (sabotage && sabotage.endsAt > now()) {
    tile.sabotage = {
      ownerId: sabotage.casterPlayerId,
      endsAt: sabotage.endsAt,
      outputMultiplier: 1 - SIPHON_SHARE
    };
  }
  const economicStructure = economicStructuresByTile.get(tk);
  if (economicStructure) {
    tile.economicStructure = {
      ownerId: economicStructure.ownerId,
      type: economicStructure.type,
      status: economicStructure.status
    };
    if ((economicStructure.status === "under_construction" || economicStructure.status === "removing") && economicStructure.completesAt !== undefined) {
      tile.economicStructure.completesAt = economicStructure.completesAt;
    }
  }
  applyTileYieldSummary(tile, wx, wy, ownerId, ownershipState, resource, dock, town, terrain);
  tile.fogged = false;
  return tile;
};

const summaryChunkTiles = (worldCx: number, worldCy: number, mode: ChunkSummaryMode = "thin"): readonly Tile[] => {
  const chunkKey = `${worldCx},${worldCy}`;
  const summaryCacheKey = `${mode}:${chunkKey}`;
  const version = summaryChunkVersionByChunkKey.get(chunkKey) ?? 0;
  const cached = cachedSummaryChunkByChunkKey.get(summaryCacheKey);
  if (cached?.version === version) return cached.tiles;
  const startX = worldCx * CHUNK_SIZE;
  const startY = worldCy * CHUNK_SIZE;
  const tiles: Tile[] = [];
  for (let y = startY; y < startY + CHUNK_SIZE; y += 1) {
    for (let x = startX; x < startX + CHUNK_SIZE; x += 1) {
      const wx = wrapX(x, WORLD_WIDTH);
      const wy = wrapY(y, WORLD_HEIGHT);
      tiles.push(Object.freeze(playerTileSummary(wx, wy, mode)));
    }
  }
  cachedSummaryChunkByChunkKey.set(summaryCacheKey, { version, tiles });
  return tiles;
};

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
    if (ownerId !== BARBARIAN_OWNER_ID && players.get(ownerId)?.capitalTileKey === tk) tile.capital = true;
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
  const tier = townPopulationTier(town.population);
    const goldPerMinute = townIncomeForOwner(town, owner) * siphonMultiplierAt(town.tileKey);
    const isFed = isTownFedForOwner(town.tileKey, owner);
    const ownerPlayer = owner ? players.get(owner) : undefined;
    const manpowerGoldPaused = Boolean(ownerPlayer && !townGoldIncomeEnabledForPlayer(ownerPlayer));
    const connectedTownKeys = owner ? directlyConnectedTownKeysForTown(owner, town.tileKey) : [];
    const market = structureForSupportedTown(town.tileKey, owner, "MARKET");
    const granary = structureForSupportedTown(town.tileKey, owner, "GRANARY");
    const bank = structureForSupportedTown(town.tileKey, owner, "BANK");
    tile.town = {
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
      populationTier: townPopulationTier(town.population),
      connectedTownCount: town.connectedTownCount,
      connectedTownBonus: town.connectedTownBonus,
      connectedTownNames: connectedTownKeys
        .map((townKey) => townsByTile.get(townKey)?.townId)
        .filter((label): label is string => Boolean(label)),
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
    const fortView: { ownerId: string; status: "under_construction" | "active"; completesAt?: number } = {
      ownerId: fort.ownerId,
      status: fort.status
    };
    if (fort.status === "under_construction") fortView.completesAt = fort.completesAt;
    tile.fort = fortView;
  }
  if (observatory) {
    const status = observatoryStatusForTile(observatory.ownerId, observatory.tileKey);
    tile.observatory = {
      ownerId: observatory.ownerId,
      status
    };
    if (status === "under_construction" && observatory.completesAt !== undefined) tile.observatory.completesAt = observatory.completesAt;
  }
  if (siegeOutpost) {
    const siegeView: { ownerId: string; status: "under_construction" | "active"; completesAt?: number } = {
      ownerId: siegeOutpost.ownerId,
      status: siegeOutpost.status
    };
    if (siegeOutpost.status === "under_construction") siegeView.completesAt = siegeOutpost.completesAt;
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
    tile.economicStructure = {
      ownerId: economicStructure.ownerId,
      type: economicStructure.type,
      status: economicStructure.status
    };
    if ((economicStructure.status === "under_construction" || economicStructure.status === "removing") && economicStructure.completesAt !== undefined) {
      tile.economicStructure.completesAt = economicStructure.completesAt;
    }
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
      const converterDaily = converterStructureOutputFor(economicStructure.type);
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
  if (isValidCapitalTile(player, player.spawnOrigin)) return player.spawnOrigin;
  const settledTowns = [...townsByTile.keys()]
    .filter((tk) => ownership.get(tk) === player.id && ownershipStateByTile.get(tk) === "SETTLED")
    .sort();
  if (settledTowns.length > 0) return settledTowns[0];
  const settledTiles = [...player.territoryTiles].filter((tk) => ownershipStateByTile.get(tk) === "SETTLED").sort();
  return settledTiles[0];
};

const sendVisibleTileDeltaAt = (x: number, y: number): void => {
  for (const p of players.values()) {
    if (!tileInSubscription(p.id, x, y)) continue;
    if (!visible(p, x, y)) continue;
    const current = playerTile(x, y);
    current.fogged = false;
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
  const next = isValidCapitalTile(player, previous) ? previous : chooseCapitalTileKey(player);
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
  cachedChunkSnapshotByPlayer.delete(playerId);
  chunkSnapshotGenerationByPlayer.delete(playerId);
};

const markSummaryChunkDirtyAtTile = (x: number, y: number): void => {
  const chunkKey = chunkKeyAtTile(x, y);
  summaryChunkVersionByChunkKey.set(chunkKey, (summaryChunkVersionByChunkKey.get(chunkKey) ?? 0) + 1);
  cachedSummaryChunkByChunkKey.delete(chunkKey);
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

const isOwnedSettledLandTile = (playerId: string, tileKey: TileKey): boolean => {
  const [x, y] = parseKey(tileKey);
  if (terrainAtRuntime(x, y) !== "LAND") return false;
  return ownership.get(tileKey) === playerId && ownershipStateByTile.get(tileKey) === "SETTLED";
};

const observatoryStatusForTile = (playerId: string, tileKey: TileKey): "under_construction" | "active" | "inactive" => {
  const observatory = observatoriesByTile.get(tileKey);
  if (!observatory || observatory.ownerId !== playerId) return "inactive";
  if (observatory.status === "under_construction") return "under_construction";
  return isOwnedSettledLandTile(playerId, tileKey) ? observatory.status : "inactive";
};

const activeObservatoryTileKeysForPlayer = (playerId: string): TileKey[] => {
  const out: TileKey[] = [];
  for (const tk of observatoryTileKeysByPlayer.get(playerId) ?? []) {
    if (observatoryStatusForTile(playerId, tk) === "active") out.push(tk);
  }
  return out;
};

const syncObservatoriesForPlayer = (playerId: string, active: boolean): void => {
  let changed = false;
  for (const tk of observatoryTileKeysByPlayer.get(playerId) ?? []) {
    const observatory = observatoriesByTile.get(tk);
    if (!observatory) continue;
    if (observatory.status === "under_construction") continue;
    const nextStatus = active && isOwnedSettledLandTile(playerId, tk) ? "active" : "inactive";
    if (observatory.status !== nextStatus) {
      observatory.status = nextStatus;
      changed = true;
    }
  }
  if (changed) markVisibilityDirty(playerId);
};

const hostileObservatoryProtectingTile = (actor: Player, x: number, y: number): TileKey | undefined => {
  for (const [tk, observatory] of observatoriesByTile) {
    if (observatory.ownerId === actor.id || actor.allies.has(observatory.ownerId)) continue;
    if (observatoryStatusForTile(observatory.ownerId, tk) !== "active") continue;
    const [ox, oy] = parseKey(tk);
    const protectionRadius = OBSERVATORY_PROTECTION_RADIUS + getPlayerEffectsForPlayer(observatory.ownerId).observatoryProtectionRadiusBonus;
    if (chebyshevDistance(ox, oy, x, y) <= protectionRadius) return tk;
  }
  return undefined;
};

const ownedActiveObservatoryWithinRange = (playerId: string, x: number, y: number, range = OBSERVATORY_CAST_RADIUS): boolean => {
  const castRadius = range + getPlayerEffectsForPlayer(playerId).observatoryCastRadiusBonus;
  for (const tk of observatoryTileKeysByPlayer.get(playerId) ?? []) {
    if (observatoryStatusForTile(playerId, tk) !== "active") continue;
    const [ox, oy] = parseKey(tk);
    if (chebyshevDistance(ox, oy, x, y) <= castRadius) return true;
  }
  return false;
};

const activeAirportAt = (ownerId: string, tileKey: TileKey): EconomicStructure | undefined => {
  const structure = economicStructuresByTile.get(tileKey);
  return structure && structure.ownerId === ownerId && structure.type === "AIRPORT" && structure.status === "active" ? structure : undefined;
};

const activeOwnedEconomicStructureWithinRange = (
  ownerId: string,
  type: EconomicStructureType,
  x: number,
  y: number,
  range: number
): TileKey | undefined => {
  for (const tk of economicStructureTileKeysByPlayer.get(ownerId) ?? []) {
    const structure = economicStructuresByTile.get(tk);
    if (!structure || structure.type !== type || structure.status !== "active") continue;
    const [sx, sy] = parseKey(tk);
    if (chebyshevDistance(sx, sy, x, y) <= range) return tk;
  }
  return undefined;
};

const hostileRadarProtectingTile = (actor: Player, x: number, y: number): TileKey | undefined => {
  for (const [tk, structure] of economicStructuresByTile) {
    if (structure.type !== "RADAR_SYSTEM" || structure.status !== "active") continue;
    if (structure.ownerId === actor.id || actor.allies.has(structure.ownerId)) continue;
    const [rx, ry] = parseKey(tk);
    if (chebyshevDistance(rx, ry, x, y) <= RADAR_SYSTEM_RADIUS) return tk;
  }
  return undefined;
};

const governorUpkeepMultiplierAtTile = (ownerId: string | undefined, tileKey: TileKey): number => {
  if (!ownerId) return 1;
  const [x, y] = parseKey(tileKey);
  return activeOwnedEconomicStructureWithinRange(ownerId, "GOVERNORS_OFFICE", x, y, GOVERNORS_OFFICE_RADIUS)
    ? GOVERNORS_OFFICE_UPKEEP_MULT
    : 1;
};

const foundryMineOutputMultiplierAt = (ownerId: string | undefined, tileKey: TileKey): number => {
  if (!ownerId) return 1;
  const structure = economicStructuresByTile.get(tileKey);
  if (!structure || structure.ownerId !== ownerId || structure.status !== "active" || structure.type !== "MINE") return 1;
  const [x, y] = parseKey(tileKey);
  return activeOwnedEconomicStructureWithinRange(ownerId, "FOUNDRY", x, y, FOUNDRY_RADIUS) ? FOUNDRY_OUTPUT_MULT : 1;
};

const converterStructureOutputFor = (structureType: EconomicStructureType): Partial<Record<StrategicResource, number>> | undefined => {
  if (structureType === "QUARTERMASTER") return { SUPPLY: QUARTERMASTER_SUPPLY_PER_DAY };
  if (structureType === "IRONWORKS") return { IRON: IRONWORKS_IRON_PER_DAY };
  if (structureType === "CRYSTAL_SYNTHESIZER") return { CRYSTAL: CRYSTAL_SYNTHESIZER_CRYSTAL_PER_DAY };
  if (structureType === "FUEL_PLANT") return { OIL: FUEL_PLANT_OIL_PER_DAY };
  return undefined;
};

const activeSiphonAt = (tileKey: TileKey): ActiveSiphon | undefined => {
  const siphon = siphonByTile.get(tileKey);
  if (!siphon || siphon.endsAt <= now()) {
    if (siphon) siphonByTile.delete(tileKey);
    return undefined;
  }
  return siphon;
};

const siphonMultiplierAt = (tileKey: TileKey): number => (activeSiphonAt(tileKey) ? 1 - SIPHON_SHARE : 1);

const addToSiphonCache = (
  casterPlayerId: string,
  targetTileKey: TileKey,
  gold: number,
  strategic: Partial<Record<StrategicResource, number>>,
  expiresAt: number
): void => {
  const caches = siphonCacheByPlayer.get(casterPlayerId) ?? [];
  let current = caches.find((cache) => cache.targetTileKey === targetTileKey && cache.expiresAt === expiresAt);
  if (!current) {
    current = { siphonId: crypto.randomUUID(), targetTileKey, expiresAt, gold: 0, strategic: {} };
    caches.push(current);
    siphonCacheByPlayer.set(casterPlayerId, caches);
  }
  current.gold += gold;
  for (const [resource, amount] of Object.entries(strategic) as Array<[StrategicResource, number]>) {
    current.strategic[resource] = (current.strategic[resource] ?? 0) + amount;
  }
};

const economicStructureForTile = (tileKey: TileKey): EconomicStructure | undefined => economicStructuresByTile.get(tileKey);

const economicStructureUpkeepDue = (structure: EconomicStructure): boolean => structure.nextUpkeepAt <= now();

const economicStructureResourceType = (resource: ResourceType | undefined): EconomicStructureType | undefined => {
  if (resource === "FARM" || resource === "FISH") return "FARMSTEAD";
  if (resource === "WOOD" || resource === "FUR") return "CAMP";
  if (resource === "IRON" || resource === "GEMS") return "MINE";
  return undefined;
};

const economicStructureOutputMultAt = (tileKey: TileKey, ownerId: string | undefined): number => {
  const structure = economicStructuresByTile.get(tileKey);
  if (!structure || !ownerId || structure.ownerId !== ownerId || structure.status !== "active") return 1;
  if (
    structure.type === "GRANARY" ||
    structure.type === "MARKET" ||
    structure.type === "BANK" ||
    structure.type === "AIRPORT" ||
    structure.type === "QUARTERMASTER" ||
    structure.type === "IRONWORKS" ||
    structure.type === "CRYSTAL_SYNTHESIZER" ||
    structure.type === "FUEL_PLANT" ||
    structure.type === "FOUNDRY" ||
    structure.type === "GOVERNORS_OFFICE" ||
    structure.type === "RADAR_SYSTEM"
  ) {
    return 1;
  }
  return STRUCTURE_OUTPUT_MULT * foundryMineOutputMultiplierAt(ownerId, tileKey);
};

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

const upkeepPerMinuteForPlayer = (player: Player): {
  food: number;
  iron: number;
  supply: number;
  crystal: number;
  oil: number;
  gold: number;
} => {
  let townFoodUpkeep = 0;
  let settledTileGoldUpkeep = 0;
  let fortCount = 0;
  let outpostCount = 0;
  let observatoryCount = 0;
  let airportCount = 0;
  for (const tk of player.territoryTiles) {
    if (ownershipStateByTile.get(tk) !== "SETTLED") continue;
    const town = townsByTile.get(tk);
    if (!(town && townPopulationTier(town.population) === "SETTLEMENT")) {
      settledTileGoldUpkeep += 0.04 * governorUpkeepMultiplierAtTile(player.id, tk);
    }
    if (town) townFoodUpkeep += townFoodUpkeepPerMinute(town) * governorUpkeepMultiplierAtTile(player.id, tk);
    const fort = fortsByTile.get(tk);
    if (fort?.ownerId === player.id && fort.status === "active") fortCount += 1;
    const siege = siegeOutpostsByTile.get(tk);
    if (siege?.ownerId === player.id && siege.status === "active") outpostCount += 1;
    const observatory = observatoriesByTile.get(tk);
    if (observatory?.ownerId === player.id && observatory?.status === "active") observatoryCount += 1;
    const airport = economicStructuresByTile.get(tk);
    if (airport?.ownerId === player.id && airport.status === "active" && airport.type === "AIRPORT") airportCount += 1;
  }
  const activeRevealCount = Math.min(1, getOrInitRevealTargets(player.id).size);
  const effects = getPlayerEffectsForPlayer(player.id);
  return {
    // Base town upkeep is 0.25 / 10 min. City tier and above pay double.
    food: townFoodUpkeep * effects.townFoodUpkeepMult,
    // 0.25 / 10 min per fort.
    iron: fortCount * 0.025 * effects.fortIronUpkeepMult,
    // 0.25 / 10 min per outpost.
    supply: outpostCount * 0.025 * effects.outpostSupplyUpkeepMult,
    // 0.25 / 10 min for each active empire reveal.
    crystal: activeRevealCount * REVEAL_EMPIRE_UPKEEP_PER_MIN * effects.revealUpkeepMult + observatoryCount * OBSERVATORY_UPKEEP_PER_MIN,
    oil: airportCount * AIRPORT_OIL_UPKEEP_PER_MIN,
    // 10 gold / 10 min per fort + 10 gold / 10 min per outpost + 1 gold / 10 min per 40 settled tiles.
    gold: fortCount * 1 * effects.fortGoldUpkeepMult + outpostCount * 1 * effects.outpostGoldUpkeepMult + settledTileGoldUpkeep * effects.settledGoldUpkeepMult
  };
};

const settledTileGoldUpkeepPerMinuteAt = (playerId: string, tileKey: TileKey): number => {
  const town = townsByTile.get(tileKey);
  if (town && townPopulationTier(town.population) === "SETTLEMENT") return 0;
  return 0.04 * governorUpkeepMultiplierAtTile(playerId, tileKey);
};

const economicStructureGoldUpkeepPerInterval = (structureType: EconomicStructureType): number =>
  structureType === "FARMSTEAD"
    ? FARMSTEAD_GOLD_UPKEEP
    : structureType === "CAMP"
      ? CAMP_GOLD_UPKEEP
      : structureType === "MINE"
        ? MINE_GOLD_UPKEEP
        : structureType === "GRANARY"
          ? GRANARY_GOLD_UPKEEP
          : structureType === "CARAVANARY"
            ? CARAVANARY_GOLD_UPKEEP
            : structureType === "QUARTERMASTER"
              ? QUARTERMASTER_GOLD_UPKEEP
              : structureType === "IRONWORKS"
                ? IRONWORKS_GOLD_UPKEEP
                : structureType === "CRYSTAL_SYNTHESIZER"
                  ? CRYSTAL_SYNTHESIZER_GOLD_UPKEEP
                  : structureType === "FUEL_PLANT"
                    ? FUEL_PLANT_GOLD_UPKEEP
                    : structureType === "FOUNDRY"
                      ? FOUNDRY_GOLD_UPKEEP
                      : structureType === "GARRISON_HALL"
                        ? GARRISON_HALL_GOLD_UPKEEP
                        : structureType === "CUSTOMS_HOUSE"
                          ? CUSTOMS_HOUSE_GOLD_UPKEEP
                          : structureType === "GOVERNORS_OFFICE"
                            ? GOVERNORS_OFFICE_GOLD_UPKEEP
                            : structureType === "RADAR_SYSTEM"
                              ? RADAR_SYSTEM_GOLD_UPKEEP
                              : 0;

const economicStructureCrystalUpkeepPerInterval = (structureType: EconomicStructureType, playerId: string): number =>
  structureType === "MARKET" || structureType === "BANK"
    ? (structureType === "MARKET" ? MARKET_CRYSTAL_UPKEEP : BANK_CRYSTAL_UPKEEP) * getPlayerEffectsForPlayer(playerId).marketCrystalUpkeepMult
    : 0;

const pushUpkeepContributor = (
  map: Map<string, UpkeepContributor>,
  label: string,
  amountPerMinute: number,
  options: { count?: number; note?: string } = {}
): void => {
  if (amountPerMinute <= 0.0001) return;
  const existing = map.get(label);
  if (existing) {
    existing.amountPerMinute += amountPerMinute;
    existing.count = (existing.count ?? 0) + (options.count ?? 0);
    if (options.note) existing.note = options.note;
    return;
  }
  const contributor: UpkeepContributor = { label, amountPerMinute };
  if (options.count !== undefined) contributor.count = options.count;
  if (options.note !== undefined) contributor.note = options.note;
  map.set(label, contributor);
};

const sortedUpkeepContributors = (map: Map<string, UpkeepContributor>): UpkeepContributor[] =>
  [...map.values()].sort((a, b) => b.amountPerMinute - a.amountPerMinute || a.label.localeCompare(b.label));

const upkeepContributorsForPlayer = (player: Player): Record<"food" | "iron" | "supply" | "crystal" | "oil" | "gold", UpkeepContributor[]> => {
  const food = new Map<string, UpkeepContributor>();
  const iron = new Map<string, UpkeepContributor>();
  const supply = new Map<string, UpkeepContributor>();
  const crystal = new Map<string, UpkeepContributor>();
  const oil = new Map<string, UpkeepContributor>();
  const gold = new Map<string, UpkeepContributor>();
  const effects = getPlayerEffectsForPlayer(player.id);
  let townCount = 0;
  let settledTileCount = 0;
  let settledTileGoldUpkeep = 0;
  let fortCount = 0;
  let outpostCount = 0;
  let observatoryCount = 0;
  let airportCount = 0;
  const goldStructureCounts = new Map<EconomicStructureType, number>();
  const crystalStructureCounts = new Map<EconomicStructureType, number>();

  for (const tk of player.territoryTiles) {
    if (ownershipStateByTile.get(tk) !== "SETTLED") continue;
    settledTileCount += 1;
    settledTileGoldUpkeep += settledTileGoldUpkeepPerMinuteAt(player.id, tk);
    if (townsByTile.has(tk)) townCount += 1;
    const fort = fortsByTile.get(tk);
    if (fort?.ownerId === player.id && fort.status === "active") fortCount += 1;
    const siege = siegeOutpostsByTile.get(tk);
    if (siege?.ownerId === player.id && siege.status === "active") outpostCount += 1;
    const observatory = observatoriesByTile.get(tk);
    if (observatory?.ownerId === player.id && observatory.status === "active") observatoryCount += 1;
    const structure = economicStructuresByTile.get(tk);
    if (structure?.ownerId === player.id && structure.status === "active") {
      const goldPerMinute = economicStructureGoldUpkeepPerInterval(structure.type) / 10;
      const crystalPerMinute = economicStructureCrystalUpkeepPerInterval(structure.type, player.id) / 10;
      if (goldPerMinute > 0) goldStructureCounts.set(structure.type, (goldStructureCounts.get(structure.type) ?? 0) + 1);
      if (crystalPerMinute > 0) crystalStructureCounts.set(structure.type, (crystalStructureCounts.get(structure.type) ?? 0) + 1);
      if (structure.type === "AIRPORT") airportCount += 1;
    }
  }

  if (townCount > 0) {
    let townFoodUpkeep = 0;
    for (const tk of player.territoryTiles) {
      if (ownershipStateByTile.get(tk) !== "SETTLED") continue;
      const town = townsByTile.get(tk);
      if (!town) continue;
      townFoodUpkeep += townFoodUpkeepPerMinute(town) * governorUpkeepMultiplierAtTile(player.id, tk);
    }
    if (townFoodUpkeep > 0.0001) {
      pushUpkeepContributor(food, "Town upkeep", townFoodUpkeep * effects.townFoodUpkeepMult, {
        count: townCount,
        note: `${townCount} town${townCount === 1 ? "" : "s"}`
      });
    }
  }

  pushUpkeepContributor(gold, "Settled land upkeep", settledTileGoldUpkeep * effects.settledGoldUpkeepMult, {
    count: settledTileCount,
    note: `${settledTileCount} settled tiles`
  });

  if (fortCount > 0) {
    pushUpkeepContributor(gold, "Fort upkeep", fortCount * effects.fortGoldUpkeepMult, {
      count: fortCount,
      note: `${fortCount} active fort${fortCount === 1 ? "" : "s"}`
    });
    pushUpkeepContributor(iron, "Fort upkeep", fortCount * 0.025 * effects.fortIronUpkeepMult, {
      count: fortCount,
      note: `${fortCount} active fort${fortCount === 1 ? "" : "s"}`
    });
  }

  if (outpostCount > 0) {
    pushUpkeepContributor(gold, "Siege outpost upkeep", outpostCount * effects.outpostGoldUpkeepMult, {
      count: outpostCount,
      note: `${outpostCount} active outpost${outpostCount === 1 ? "" : "s"}`
    });
    pushUpkeepContributor(supply, "Siege outpost upkeep", outpostCount * 0.025 * effects.outpostSupplyUpkeepMult, {
      count: outpostCount,
      note: `${outpostCount} active outpost${outpostCount === 1 ? "" : "s"}`
    });
  }

  const activeRevealCount = Math.min(1, getOrInitRevealTargets(player.id).size);
  if (activeRevealCount > 0) {
    pushUpkeepContributor(crystal, "Empire reveal upkeep", activeRevealCount * REVEAL_EMPIRE_UPKEEP_PER_MIN * effects.revealUpkeepMult, {
      count: activeRevealCount,
      note: `${activeRevealCount} active reveal`
    });
  }

  if (observatoryCount > 0) {
    pushUpkeepContributor(crystal, "Observatory upkeep", observatoryCount * OBSERVATORY_UPKEEP_PER_MIN, {
      count: observatoryCount,
      note: `${observatoryCount} active observator${observatoryCount === 1 ? "y" : "ies"}`
    });
  }

  if (airportCount > 0) {
    pushUpkeepContributor(oil, "Airport upkeep", airportCount * AIRPORT_OIL_UPKEEP_PER_MIN, {
      count: airportCount,
      note: `${airportCount} active airport${airportCount === 1 ? "" : "s"}`
    });
  }

  for (const [type, count] of goldStructureCounts) {
    pushUpkeepContributor(gold, `${prettyEconomicStructureLabel(type)} upkeep`, (economicStructureGoldUpkeepPerInterval(type) / 10) * count, {
      count,
      note: `${count} active ${prettyEconomicStructureLabel(type).toLowerCase()}${count === 1 ? "" : "s"}`
    });
  }

  for (const [type, count] of crystalStructureCounts) {
    pushUpkeepContributor(crystal, `${prettyEconomicStructureLabel(type)} upkeep`, (economicStructureCrystalUpkeepPerInterval(type, player.id) / 10) * count, {
      count,
      note: `${count} active ${prettyEconomicStructureLabel(type).toLowerCase()}${count === 1 ? "" : "s"}`
    });
  }

  return {
    food: sortedUpkeepContributors(food),
    iron: sortedUpkeepContributors(iron),
    supply: sortedUpkeepContributors(supply),
    crystal: sortedUpkeepContributors(crystal),
    oil: sortedUpkeepContributors(oil),
    gold: sortedUpkeepContributors(gold)
  };
};

function currentFoodCoverageForPlayer(playerId: string): number {
  const player = players.get(playerId);
  if (!player) return foodUpkeepCoverageByPlayer.get(playerId) ?? 1;
  return townFeedingStateForPlayer(playerId).foodCoverage;
}

const playerHasSettledFoodSources = (playerId: string): boolean => {
  const player = players.get(playerId);
  if (!player) return false;
  for (const tk of player.territoryTiles) {
    if (ownershipStateByTile.get(tk) !== "SETTLED") continue;
    const [x, y] = parseKey(tk);
    const resource = playerTile(x, y).resource;
    if (resource === "FARM" || resource === "FISH") return true;
  }
  return false;
};

const canPlaceEconomicStructure = (actor: Player, t: Tile, structureType: EconomicStructureType): { ok: boolean; reason?: string } => {
  if (t.terrain !== "LAND") return { ok: false, reason: "structure requires land tile" };
  const tk = key(t.x, t.y);
  const isFoundry = structureType === "FOUNDRY";
  if (isFoundry) {
    if (t.ownerId && t.ownerId !== actor.id) return { ok: false, reason: "foundry cannot be placed on enemy land" };
    if (t.ownerId === actor.id && t.ownershipState !== "SETTLED") return { ok: false, reason: "foundry requires settled owned land when placed in your territory" };
    if (!t.ownerId) {
      const touchesOwned = cardinalNeighborCores(t.x, t.y).some((neighbor) => neighbor.ownerId === actor.id);
      if (!touchesOwned) return { ok: false, reason: "foundry on neutral land must touch your territory" };
    }
  } else if (t.ownerId !== actor.id || t.ownershipState !== "SETTLED") {
    return { ok: false, reason: "structure requires settled owned tile" };
  }
  if (fortsByTile.has(tk) || siegeOutpostsByTile.has(tk) || observatoriesByTile.has(tk) || economicStructuresByTile.has(tk)) {
    return { ok: false, reason: "tile already has structure" };
  }
  if (structureType === "FARMSTEAD" && t.resource !== "FARM" && t.resource !== "FISH") return { ok: false, reason: "farmstead requires FARM or FISH tile" };
  if (structureType === "CAMP" && t.resource !== "WOOD" && t.resource !== "FUR") return { ok: false, reason: "camp requires SUPPLY tile" };
  if (structureType === "MINE" && t.resource !== "IRON" && t.resource !== "GEMS") return { ok: false, reason: "mine requires IRON or CRYSTAL tile" };
  if (structureType === "AIRPORT") {
    if (t.resource || townsByTile.has(tk) || docksByTile.has(tk)) return { ok: false, reason: "airport requires empty settled land" };
  }
  const tileTown = townsByTile.get(tk);
  if (tileTown && townPopulationTier(tileTown.population) === "SETTLEMENT") {
    return { ok: false, reason: "settlements cannot host structures until they grow into towns" };
  }
  if (structureType === "RADAR_SYSTEM" || structureType === "GOVERNORS_OFFICE" || structureType === "FOUNDRY") {
    if (t.resource || townsByTile.has(tk) || docksByTile.has(tk)) return { ok: false, reason: `${structureType.toLowerCase()} requires empty land` };
  }
  if (isSupportOnlyStructureType(structureType)) {
    if (townsByTile.has(tk)) {
      const supportTileKey = pickRandomAvailableSupportTileForTown(tk, actor.id, structureType);
      if (!supportTileKey) return { ok: false, reason: `${structureType.toLowerCase()} needs an open support tile next to this town` };
    } else {
      const supportedTowns = supportedTownKeysForTile(tk, actor.id);
      if (supportedTowns.length === 0) return { ok: false, reason: `${structureType.toLowerCase()} requires a support tile next to your town` };
      if (supportedTowns.length > 1) return { ok: false, reason: "support tile touches multiple towns" };
      const supportedTownKey = supportedTowns[0];
      if (supportedTownKey && structureForSupportedTown(supportedTownKey, actor.id, structureType)) {
        return { ok: false, reason: `town already has ${structureType.toLowerCase()}` };
      }
    }
  }
  return { ok: true };
};

const tryBuildEconomicStructure = (actor: Player, x: number, y: number, structureType: EconomicStructureType): { ok: boolean; reason?: string } => {
  const clickedTile = playerTile(x, y);
  const placed = canPlaceEconomicStructure(actor, clickedTile, structureType);
  if (!placed.ok) return placed;
  let t = clickedTile;
  if (isSupportOnlyStructureType(structureType) && townsByTile.has(key(clickedTile.x, clickedTile.y))) {
    const supportTileKey = pickRandomAvailableSupportTileForTown(key(clickedTile.x, clickedTile.y), actor.id, structureType);
    if (!supportTileKey) return { ok: false, reason: `${structureType.toLowerCase()} needs an open support tile next to this town` };
    const [sx, sy] = parseKey(supportTileKey);
    t = playerTile(sx, sy);
  }
  const tk = key(t.x, t.y);

  if (structureType === "FARMSTEAD" && !actor.techIds.has("agriculture")) return { ok: false, reason: "unlock farmsteads via Agriculture first" };
  if (structureType === "CAMP" && !actor.techIds.has("leatherworking")) return { ok: false, reason: "unlock camps via Leatherworking first" };
  if (structureType === "MINE" && !actor.techIds.has("mining")) return { ok: false, reason: "unlock mines via Mining first" };
  if (structureType === "MARKET" && !actor.techIds.has("trade")) return { ok: false, reason: "unlock markets via Trade first" };
  if (structureType === "GRANARY" && !getPlayerEffectsForPlayer(actor.id).unlockGranary) return { ok: false, reason: "unlock granaries via Pottery first" };
  if (structureType === "BANK" && !actor.techIds.has("coinage")) return { ok: false, reason: "unlock banks via Coinage first" };
  if (structureType === "AIRPORT" && !actor.techIds.has("aeronautics")) return { ok: false, reason: "unlock airports via Aeronautics first" };
  if (structureType === "FOUNDRY" && !actor.techIds.has("industrial-extraction")) return { ok: false, reason: "unlock foundries via Industrial Extraction first" };
  if (structureType === "GOVERNORS_OFFICE" && !actor.techIds.has("civil-service")) return { ok: false, reason: "unlock governor's offices via Civil Service first" };
  if (structureType === "RADAR_SYSTEM" && !actor.techIds.has("radar")) return { ok: false, reason: "unlock radar systems via Radar first" };
  if (
    (structureType === "QUARTERMASTER" || structureType === "IRONWORKS" || structureType === "CRYSTAL_SYNTHESIZER") &&
    !actor.techIds.has("workshops")
  ) {
    return { ok: false, reason: "unlock converters via Workshops first" };
  }
  if (structureType === "FUEL_PLANT" && !actor.techIds.has("plastics")) return { ok: false, reason: "unlock fuel plants via Plastics first" };
  if (!canStartDevelopmentProcess(actor.id)) return { ok: false, reason: developmentSlotsBusyReason(actor.id) };
  const goldCost = structureBuildGoldCost(structureType, ownedStructureCountForPlayer(actor.id, structureType));

  if (structureType === "FARMSTEAD") {
    if (actor.points < goldCost) return { ok: false, reason: "insufficient gold for farmstead" };
    if (!consumeStrategicResource(actor, "FOOD", FARMSTEAD_BUILD_FOOD_COST)) return { ok: false, reason: "insufficient FOOD for farmstead" };
    actor.points -= goldCost;
  } else if (structureType === "CAMP") {
    if (actor.points < goldCost) return { ok: false, reason: "insufficient gold for camp" };
    if (!consumeStrategicResource(actor, "SUPPLY", CAMP_BUILD_SUPPLY_COST)) return { ok: false, reason: "insufficient SUPPLY for camp" };
    actor.points -= goldCost;
  } else if (structureType === "MINE") {
    if (actor.points < goldCost) return { ok: false, reason: "insufficient gold for mine" };
    const matching = t.resource === "IRON" ? "IRON" : "CRYSTAL";
    if (!consumeStrategicResource(actor, matching, MINE_BUILD_RESOURCE_COST)) return { ok: false, reason: `insufficient ${matching} for mine` };
    actor.points -= goldCost;
  } else {
    if (structureType === "MARKET") {
      if (actor.points < goldCost) return { ok: false, reason: "insufficient gold for market" };
      if (!consumeStrategicResource(actor, "CRYSTAL", MARKET_BUILD_CRYSTAL_COST)) return { ok: false, reason: "insufficient CRYSTAL for market" };
      actor.points -= goldCost;
    } else if (structureType === "GRANARY") {
      if (actor.points < goldCost) return { ok: false, reason: "insufficient gold for granary" };
      if (!consumeStrategicResource(actor, "FOOD", GRANARY_BUILD_FOOD_COST)) return { ok: false, reason: "insufficient FOOD for granary" };
      actor.points -= goldCost;
    } else if (structureType === "BANK") {
      if (actor.points < goldCost) return { ok: false, reason: "insufficient gold for bank" };
      if (!consumeStrategicResource(actor, "CRYSTAL", BANK_BUILD_CRYSTAL_COST)) return { ok: false, reason: "insufficient CRYSTAL for bank" };
      actor.points -= goldCost;
    } else if (structureType === "CARAVANARY") {
      if (actor.points < goldCost) return { ok: false, reason: "insufficient gold for caravanary" };
      if (!consumeStrategicResource(actor, "CRYSTAL", CARAVANARY_BUILD_CRYSTAL_COST)) return { ok: false, reason: "insufficient CRYSTAL for caravanary" };
      actor.points -= goldCost;
    } else if (structureType === "QUARTERMASTER") {
      if (actor.points < goldCost) return { ok: false, reason: "insufficient gold for quartermaster" };
      actor.points -= goldCost;
    } else if (structureType === "IRONWORKS") {
      if (actor.points < goldCost) return { ok: false, reason: "insufficient gold for ironworks" };
      actor.points -= goldCost;
    } else if (structureType === "CRYSTAL_SYNTHESIZER") {
      if (actor.points < goldCost) return { ok: false, reason: "insufficient gold for crystal synthesizer" };
      actor.points -= goldCost;
    } else if (structureType === "FUEL_PLANT") {
      if (actor.points < goldCost) return { ok: false, reason: "insufficient gold for fuel plant" };
      actor.points -= goldCost;
    } else if (structureType === "FOUNDRY") {
      if (actor.points < goldCost) return { ok: false, reason: "insufficient gold for foundry" };
      actor.points -= goldCost;
    } else if (structureType === "GARRISON_HALL") {
      if (actor.points < goldCost) return { ok: false, reason: "insufficient gold for garrison hall" };
      if (!consumeStrategicResource(actor, "CRYSTAL", GARRISON_HALL_BUILD_CRYSTAL_COST)) return { ok: false, reason: "insufficient CRYSTAL for garrison hall" };
      actor.points -= goldCost;
    } else if (structureType === "CUSTOMS_HOUSE") {
      if (actor.points < goldCost) return { ok: false, reason: "insufficient gold for customs house" };
      if (!consumeStrategicResource(actor, "CRYSTAL", CUSTOMS_HOUSE_BUILD_CRYSTAL_COST)) return { ok: false, reason: "insufficient CRYSTAL for customs house" };
      actor.points -= goldCost;
    } else if (structureType === "GOVERNORS_OFFICE") {
      if (actor.points < goldCost) return { ok: false, reason: "insufficient gold for governor's office" };
      actor.points -= goldCost;
    } else if (structureType === "RADAR_SYSTEM") {
      if (actor.points < goldCost) return { ok: false, reason: "insufficient gold for radar system" };
      if (!consumeStrategicResource(actor, "CRYSTAL", RADAR_SYSTEM_BUILD_CRYSTAL_COST)) return { ok: false, reason: "insufficient CRYSTAL for radar system" };
      actor.points -= goldCost;
    } else {
      if (actor.points < goldCost) return { ok: false, reason: "insufficient gold for airport" };
      if (!consumeStrategicResource(actor, "CRYSTAL", AIRPORT_BUILD_CRYSTAL_COST)) return { ok: false, reason: "insufficient CRYSTAL for airport" };
      actor.points -= goldCost;
    }
  }

  recalcPlayerDerived(actor);
  const completesAt = now() + ECONOMIC_STRUCTURE_BUILD_MS;
  economicStructuresByTile.set(tk, {
    id: crypto.randomUUID(),
    type: structureType,
    tileKey: tk,
    ownerId: actor.id,
    status: "under_construction",
    completesAt,
    nextUpkeepAt: completesAt + ECONOMIC_STRUCTURE_UPKEEP_INTERVAL_MS
  });
  markSummaryChunkDirtyAtTile(t.x, t.y);
  trackOwnedTileKey(economicStructureTileKeysByPlayer, actor.id, tk);
  recordTileStructureHistory(tk, structureType);
  const timer = setTimeout(() => {
    const current = economicStructuresByTile.get(tk);
    if (!current) return;
    const tileNow = runtimeTileCore(t.x, t.y);
    const ownsActiveSite =
      current.type === "FOUNDRY"
        ? tileNow.ownerId === actor.id && tileNow.terrain === "LAND"
        : tileNow.ownerId === actor.id && tileNow.ownershipState === "SETTLED";
    if (!ownsActiveSite) {
      cancelEconomicStructureBuild(tk);
      return;
    }
    current.status = "active";
    delete current.completesAt;
    economicStructureBuildTimers.delete(tk);
    markSummaryChunkDirtyAtTile(t.x, t.y);
    if (current.type === "AIRPORT") discoverOilFieldNearAirport(actor.id, tk);
    updateOwnership(t.x, t.y, actor.id);
  }, ECONOMIC_STRUCTURE_BUILD_MS);
  economicStructureBuildTimers.set(tk, timer);
  return { ok: true };
};

const syncEconomicStructuresForPlayer = (player: Player): Set<TileKey> => {
  const touched = new Set<TileKey>();
  const stock = getOrInitStrategicStocks(player.id);
  for (const tk of economicStructureTileKeysByPlayer.get(player.id) ?? []) {
    const structure = economicStructuresByTile.get(tk);
    if (!structure) continue;
    if (structure.status === "under_construction" || structure.status === "removing") continue;
    const [x, y] = parseKey(tk);
    const tile = playerTile(x, y);
    const canRemainActive =
      structure.type === "FOUNDRY"
        ? tile.ownerId === player.id && tile.terrain === "LAND"
        : tile.ownerId === player.id && tile.ownershipState === "SETTLED";
    if (!canRemainActive) {
      structure.status = "inactive";
      touched.add(tk);
      continue;
    }
    if (!economicStructureUpkeepDue(structure)) continue;
    if (structure.type === "MARKET" || structure.type === "BANK") {
      const crystalUpkeep =
        (structure.type === "MARKET" ? MARKET_CRYSTAL_UPKEEP : BANK_CRYSTAL_UPKEEP) * getPlayerEffectsForPlayer(player.id).marketCrystalUpkeepMult;
      if ((stock.CRYSTAL ?? 0) >= crystalUpkeep) {
        stock.CRYSTAL = Math.max(0, (stock.CRYSTAL ?? 0) - crystalUpkeep);
        structure.status = "active";
      } else {
        structure.status = "inactive";
      }
    } else {
      const upkeep =
        structure.type === "FARMSTEAD"
          ? FARMSTEAD_GOLD_UPKEEP
          : structure.type === "CAMP"
            ? CAMP_GOLD_UPKEEP
            : structure.type === "MINE"
              ? MINE_GOLD_UPKEEP
              : structure.type === "GRANARY"
                ? GRANARY_GOLD_UPKEEP
                : structure.type === "CARAVANARY"
                  ? CARAVANARY_GOLD_UPKEEP
                : structure.type === "QUARTERMASTER"
                  ? QUARTERMASTER_GOLD_UPKEEP
                : structure.type === "IRONWORKS"
                  ? IRONWORKS_GOLD_UPKEEP
                : structure.type === "CRYSTAL_SYNTHESIZER"
                  ? CRYSTAL_SYNTHESIZER_GOLD_UPKEEP
                : structure.type === "FUEL_PLANT"
                  ? FUEL_PLANT_GOLD_UPKEEP
                : structure.type === "FOUNDRY"
                  ? FOUNDRY_GOLD_UPKEEP
                  : structure.type === "GARRISON_HALL"
                    ? GARRISON_HALL_GOLD_UPKEEP
                    : structure.type === "CUSTOMS_HOUSE"
                      ? CUSTOMS_HOUSE_GOLD_UPKEEP
                  : structure.type === "GOVERNORS_OFFICE"
                    ? GOVERNORS_OFFICE_GOLD_UPKEEP
                    : structure.type === "RADAR_SYSTEM"
                              ? RADAR_SYSTEM_GOLD_UPKEEP
                : 0;
      if (player.points >= upkeep) {
        player.points = Math.max(0, player.points - upkeep);
        if (structure.type !== "AIRPORT") structure.status = "active";
      } else {
        if (structure.type !== "AIRPORT") structure.status = "inactive";
      }
    }
    structure.nextUpkeepAt = now() + ECONOMIC_STRUCTURE_UPKEEP_INTERVAL_MS;
    touched.add(tk);
  }
  return touched;
};

const applyUpkeepForPlayer = (player: Player): { touchedTileKeys: Set<TileKey> } => {
  const stock = getOrInitStrategicStocks(player.id);
  syncObservatoriesForPlayer(player.id, true);
  const upkeep = upkeepPerMinuteForPlayer(player);
  const touchedTileKeys = new Set<TileKey>();
  const diag = emptyUpkeepDiagnostics();
  const availableFoodBeforeUpkeep = Math.max(0, stock.FOOD ?? 0) + availableYieldStrategicForPlayer(player, "FOOD");
  const foodFeedingState = computeTownFeedingState(player.id, availableFoodBeforeUpkeep);

  const payResource = (resource: StrategicResource, needRaw: number): UpkeepBreakdown => {
    const need = Math.max(0, needRaw);
    const fromYield = consumeYieldStrategicForPlayer(player, resource, need, touchedTileKeys);
    const afterYield = Math.max(0, need - fromYield);
    const have = Math.max(0, stock[resource] ?? 0);
    const fromStock = Math.min(afterYield, have);
    stock[resource] = Math.max(0, have - fromStock);
    const remaining = Math.max(0, need - fromYield - fromStock);
    return { need, fromYield, fromStock, remaining, contributors: [] };
  };

  diag.food = payResource("FOOD", upkeep.food);
  diag.iron = payResource("IRON", upkeep.iron);
  diag.supply = payResource("SUPPLY", upkeep.supply);
  diag.crystal = payResource("CRYSTAL", upkeep.crystal);
  diag.oil = payResource("OIL", upkeep.oil);
  const upkeepContributors = upkeepContributorsForPlayer(player);
  diag.food.contributors = upkeepContributors.food;
  diag.iron.contributors = upkeepContributors.iron;
  diag.supply.contributors = upkeepContributors.supply;
  diag.crystal.contributors = upkeepContributors.crystal;
  diag.oil.contributors = upkeepContributors.oil;
  diag.foodCoverage = foodFeedingState.foodCoverage;
  foodUpkeepCoverageByPlayer.set(player.id, diag.foodCoverage);
  townFeedingStateByPlayer.set(player.id, foodFeedingState);

  if (diag.crystal.need > 0 && diag.crystal.remaining > 0) {
    const activeReveals = revealedEmpireTargetsByPlayer.get(player.id);
    if (activeReveals && activeReveals.size > 0) {
      activeReveals.clear();
      sendToPlayer(player.id, { type: "REVEAL_EMPIRE_UPDATE", activeTargets: [] });
    }
    syncObservatoriesForPlayer(player.id, false);
    for (const [tk, observatory] of observatoriesByTile) {
      if (observatory.ownerId === player.id) touchedTileKeys.add(tk);
    }
  } else {
    syncObservatoriesForPlayer(player.id, true);
    for (const [tk, observatory] of observatoriesByTile) {
      if (observatory.ownerId === player.id) touchedTileKeys.add(tk);
    }
  }

  for (const tk of economicStructureTileKeysByPlayer.get(player.id) ?? []) {
    const structure = economicStructuresByTile.get(tk);
    if (!structure || structure.type !== "AIRPORT" || structure.status === "under_construction") continue;
    const nextStatus = diag.oil.need > 0 && diag.oil.remaining > 0 ? "inactive" : "active";
    if (structure.status !== nextStatus) {
      structure.status = nextStatus;
      touchedTileKeys.add(tk);
    }
  }

  const goldNeed = Math.max(0, upkeep.gold);
  const goldFromYield = consumeYieldGoldForPlayer(player, goldNeed, touchedTileKeys);
  const goldAfterYield = Math.max(0, goldNeed - goldFromYield);
  const goldFromWallet = Math.min(goldAfterYield, Math.max(0, player.points));
  player.points = Math.max(0, player.points - goldFromWallet);
  diag.gold = {
    need: goldNeed,
    fromYield: goldFromYield,
    fromStock: goldFromWallet,
    remaining: Math.max(0, goldNeed - goldFromYield - goldFromWallet),
    contributors: upkeepContributors.gold
  };

  lastUpkeepByPlayer.set(player.id, diag);
  return { touchedTileKeys };
};

const addTileYield = (tileKey: TileKey, goldDelta: number, strategicDelta?: Partial<Record<StrategicResource, number>>): void => {
  const y = getOrInitTileYield(tileKey);
  const ownerId = ownership.get(tileKey);
  const caps = tileYieldCapsFor(tileKey, ownerId);
  const goldCap = caps.gold;
  const resourceCap = caps.strategicEach;
  if (goldDelta > 0) y.gold = Math.min(goldCap, y.gold + goldDelta);
  if (strategicDelta) {
    for (const [r, v] of Object.entries(strategicDelta) as Array<[StrategicResource, number]>) {
      if (v <= 0) continue;
      y.strategic[r] = Math.min(resourceCap, (y.strategic[r] ?? 0) + v);
    }
  }
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

const fortDefenseMultAt = (defenderId: string, tileKey: TileKey): number => {
  const fortOnTarget = fortsByTile.get(tileKey);
  if (fortOnTarget?.status !== "active" || fortOnTarget.ownerId !== defenderId) return 1;
  return FORT_DEFENSE_MULT * getPlayerEffectsForPlayer(defenderId).fortDefenseMult;
};

const settlementDefenseMultAt = (defenderId: string, tileKey: TileKey): number => {
  const entry = settlementDefenseByTile.get(tileKey);
  if (!entry || entry.ownerId !== defenderId || entry.expiresAt <= now()) return 1;
  return entry.mult;
};

const ownershipDefenseMultiplierForTarget = (target: Tile): number => {
  return target.ownershipState === "FRONTIER" ? 0 : 1;
};

const frontierDefenseAddForTarget = (defenderId: string, target: Tile): number => {
  if (target.ownershipState !== "FRONTIER") return 0;
  return getPlayerEffectsForPlayer(defenderId).frontierDefenseAdd;
};

const outpostAttackMultAt = (attackerId: string, tileKey: TileKey): number => {
  const siegeOnOrigin = siegeOutpostsByTile.get(tileKey);
  if (siegeOnOrigin?.status !== "active" || siegeOnOrigin.ownerId !== attackerId) return 1;
  return SIEGE_OUTPOST_ATTACK_MULT * getPlayerEffectsForPlayer(attackerId).outpostAttackMult;
};

const attackMultiplierForTarget = (attackerId: string, target: Tile): number => {
  const effects = getPlayerEffectsForPlayer(attackerId);
  let mult = 1;
  if (target.ownershipState === "SETTLED") mult *= effects.attackVsSettledMult;
  if (fortsByTile.get(key(target.x, target.y))?.status === "active") mult *= effects.attackVsFortsMult;
  if (target.ownerId) mult *= truceBreakAttackMultiplier(attackerId, target.ownerId);
  return mult;
};

const settledDefenseMultiplierForTarget = (defenderId: string, target: Tile): number => {
  if (target.ownershipState !== "SETTLED") return 1;
  return getPlayerEffectsForPlayer(defenderId).settledDefenseMult;
};

const originTileHeldByActiveFort = (actorId: string, tileKey: TileKey): boolean => {
  const fort = fortsByTile.get(tileKey);
  return Boolean(fort?.ownerId === actorId && fort.status === "active");
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
    if (!fortHeldOrigin) updateOwnership(from.x, from.y, BARBARIAN_OWNER_ID, "BARBARIAN");
    updateOwnership(to.x, to.y, undefined);
    return {
      originLost: !fortHeldOrigin,
      resultChanges: fortHeldOrigin
        ? [{ x: to.x, y: to.y }]
        : [
            { x: from.x, y: from.y, ownerId: BARBARIAN_OWNER_ID, ownershipState: "BARBARIAN" },
            { x: to.x, y: to.y }
          ]
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

const sendPlayerUpdate = (p: Player, incomeDelta: number): void => {
  applyManpowerRegen(p);
  const ws = socketsByPlayer.get(p.id);
  if (!ws || ws.readyState !== ws.OPEN) return;
  refreshGlobalStatusCache(false);
  const strategicStocks = getOrInitStrategicStocks(p.id);
  const strategicProduction = strategicProductionPerMinute(p);
  const upkeepDiag = lastUpkeepByPlayer.get(p.id) ?? emptyUpkeepDiagnostics();
  const upkeepNeed = upkeepPerMinuteForPlayer(p);
  const pendingSettlements = [...pendingSettlementsByTile.values()]
    .filter((settlement) => settlement.ownerId === p.id)
    .map((settlement) => {
      const [x, y] = parseKey(settlement.tileKey);
      return { x, y, startedAt: settlement.startedAt, resolvesAt: settlement.resolvesAt };
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
      incomePerMinute: currentIncomePerMinute(p),
      incomeDelta,
      strategicResources: strategicStocks,
      strategicProductionPerMinute: strategicProduction,
      upkeepPerMinute: upkeepNeed,
      upkeepLastTick: upkeepDiag,
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
      techChoices: reachableTechs(p),
      techCatalog: activeTechCatalog(p),
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
      pendingSettlements,
      incomingAllianceRequests: [...allianceRequests.values()].filter((r) => r.toPlayerId === p.id),
      outgoingAllianceRequests: [...allianceRequests.values()].filter((r) => r.fromPlayerId === p.id),
      missions: missionPayload(p),
      leaderboard: cachedLeaderboardSnapshot,
      seasonVictory: cachedVictoryPressureObjectives,
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
  | { ok: false; code: string; message: string } => {
  applyStaminaRegen(actor);
  actor.lastActiveAt = now();

  let from = playerTile(fromX, fromY);
  const to = playerTile(toX, toY);
  if (actionType === "EXPAND" && to.ownerId) return { ok: false, code: "EXPAND_TARGET_OWNED", message: "expand only targets neutral land" };
  if (actionType === "ATTACK" && (!to.ownerId || to.ownerId === actor.id)) return { ok: false, code: "NOT_ADJACENT", message: "target must be enemy-controlled land" };

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
  if (dockCrossing && fromDock && fromDock.cooldownUntil > now()) return { ok: false, code: "DOCK_COOLDOWN", message: "dock crossing endpoint on cooldown" };
  if (from.ownerId !== actor.id) return { ok: false, code: "NOT_OWNER", message: "origin not owned" };
  if (to.terrain !== "LAND") return { ok: false, code: "BARRIER", message: "target is barrier" };
  if (combatLocks.has(fk) || combatLocks.has(tk)) return { ok: false, code: "LOCKED", message: "tile locked in combat" };
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
    const ownershipDefenseMult = ownershipDefenseMultiplierForTarget(to);
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
        return fortHeldOrigin
          ? [{ x: to.x, y: to.y }]
          : [
              { x: from.x, y: from.y, ownerId: BARBARIAN_OWNER_ID, ownershipState: "BARBARIAN" as const },
              { x: to.x, y: to.y }
            ];
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
        barbarianAgent.x = from.x;
        barbarianAgent.y = from.y;
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

  if (!queuedExecution && socket !== NOOP_WS && isQueuedSimulationMessage(msg)) {
    enqueueSimulationCommand(actor, msg, socket, "human");
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
    updateOwnership(msg.x, msg.y, actor.id);
    sendPlayerUpdate(actor, 0);
    return true;
  }

  if (msg.type === "CANCEL_STRUCTURE_BUILD") {
    const tk = key(wrapX(msg.x, WORLD_WIDTH), wrapY(msg.y, WORLD_HEIGHT));
    const structure = economicStructuresByTile.get(tk);
    if (!structure || structure.ownerId !== actor.id || (structure.status !== "under_construction" && structure.status !== "removing")) {
      socket.send(JSON.stringify({ type: "ERROR", code: "STRUCTURE_CANCEL_INVALID", message: "no removable structure action on tile" }));
      return true;
    }
    cancelEconomicStructureBuild(tk);
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
      socket.send(JSON.stringify({ type: "ERROR", code: result.code, message: result.message }));
    } else {
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
  foodPressure: number;
  settlementEvaluationByKey: Map<string, AiSettlementCandidateEvaluation>;
  scoutRevealCountByTileKey: Map<TileKey, number>;
  scoutRevealValueByTileKey: Map<TileKey, number>;
  supportedTownKeysByTileKey: Map<TileKey, TileKey[]>;
  dockSignalByTileKey: Map<TileKey, number>;
  economicSignalByTileKey: Map<TileKey, number>;
  pressureSignalByTileKey: Map<TileKey, number>;
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
  settlementAvailable: boolean;
  fortAvailable: boolean;
  fortProtectsCore: boolean;
  fortIsDockChokePoint: boolean;
  economicBuildAvailable: boolean;
  frontierOpportunityEconomic: number;
  frontierOpportunityScout: number;
  frontierOpportunityScaffold: number;
  frontierOpportunityWaste: number;
};

const buildAiTerritoryStructureCache = (actor: Player): AiTerritoryStructureCache => {
  const settledTiles: Tile[] = [];
  const frontierTiles: Tile[] = [];
  const expandCandidates: AiFrontierCandidatePair[] = [];
  const attackCandidates: AiFrontierCandidatePair[] = [];
  const borderSettledTileKeys = new Set<TileKey>();
  let underThreat = false;

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
      expandCandidates.push({ from, to });
      if (from.ownerId === actor.id && from.ownershipState === "SETTLED") borderSettledTileKeys.add(tileKey);
    }
    for (const to of aiFrontierActionCandidates(actor, from, "ATTACK")) {
      attackCandidates.push({ from, to });
      if (from.ownerId === actor.id && from.ownershipState === "SETTLED") borderSettledTileKeys.add(tileKey);
    }
  }

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
    controlledTowns: countControlledTowns(actor.id)
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
    foodPressure: aiFoodPressureSignal(actor),
    settlementEvaluationByKey: new Map<string, AiSettlementCandidateEvaluation>(),
    scoutRevealCountByTileKey: new Map<TileKey, number>(),
    scoutRevealValueByTileKey: new Map<TileKey, number>(),
    supportedTownKeysByTileKey: new Map<TileKey, TileKey[]>(),
    dockSignalByTileKey: new Map<TileKey, number>(),
    economicSignalByTileKey: new Map<TileKey, number>(),
    pressureSignalByTileKey: new Map<TileKey, number>(),
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

const scoreAiScoutRevealValue = (
  actor: Player,
  to: Tile,
  visibility: ReturnType<typeof visibilitySnapshotForPlayer>,
  territorySummary: AiTerritorySummary
): number => {
  const tk = key(to.x, to.y);
  const cached = territorySummary.scoutRevealValueByTileKey.get(tk);
  if (cached !== undefined) return cached;

  territorySummary.scoutRevealStamp += 1;
  if (territorySummary.scoutRevealStamp === 0) {
    territorySummary.scoutRevealMarks.fill(0);
    territorySummary.scoutRevealStamp = 1;
  }
  const stamp = territorySummary.scoutRevealStamp;
  const foodPressure = territorySummary.foodPressure;
  const { economyWeak } = aiEconomyPriorityState(actor, territorySummary);
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

  territorySummary.scoutRevealValueByTileKey.set(tk, score);
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
    const ownedNeighbors = adjacentNeighborCores(to.x, to.y).reduce((count, next) => {
      if (next.ownerId !== actor.id) return count;
      return count + 1;
    }, 0);
    const alliedSettledNeighbors = adjacentNeighborCores(to.x, to.y).reduce((count, next) => {
      if (next.ownerId !== actor.id || next.ownershipState !== "SETTLED") return count;
      return count + 1;
    }, 0);
    const frontierNeighbors = adjacentNeighborCores(to.x, to.y).reduce((count, next) => {
      if (next.ownerId !== actor.id || next.ownershipState !== "FRONTIER") return count;
      return count + 1;
    }, 0);
    const exposedSides = adjacentNeighborCores(to.x, to.y).reduce((count, next) => {
      if (next.terrain !== "LAND") return count + 1;
      if (!next.ownerId || next.ownerId !== actor.id) return count + 1;
      return count;
    }, 0);
    const coastlineDiscoveryValue = adjacentNeighborCores(to.x, to.y).reduce((score, next) => {
      if (next.terrain !== "SEA") return score;
      return score + 18;
    }, 0);
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
  const ownedNeighbors = adjacentNeighborCores(to.x, to.y).reduce((count, next) => {
    if (next.ownerId !== actor.id) return count;
    return count + 1;
  }, 0);
  const alliedSettledNeighbors = adjacentNeighborCores(to.x, to.y).reduce((count, next) => {
    if (next.ownerId !== actor.id || next.ownershipState !== "SETTLED") return count;
    return count + 1;
  }, 0);
  const frontierNeighbors = adjacentNeighborCores(to.x, to.y).reduce((count, next) => {
    if (next.ownerId !== actor.id || next.ownershipState !== "FRONTIER") return count;
    return count + 1;
  }, 0);
  const coastlineDiscoveryValue = adjacentNeighborCores(to.x, to.y).reduce((score, next) => {
    if (next.terrain !== "SEA") return score;
    return score + 18;
  }, 0);
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
  let best: { score: number; from: Tile; to: Tile } | undefined;
  for (const { from, to } of territorySummary.expandCandidates) {
    if (to.terrain !== "LAND" || to.ownerId) continue;
    const score = scoreAiScoutExpandCandidate(actor, from, to, visibility, territorySummary);
    if (!best || score > best.score) best = { score, from, to };
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
  const foodCoverageLow = controlledTowns > 0 && (territorySummary ? territorySummary.foodPressure > 0 && currentFoodCoverageForPlayer(actor.id) < 1.05 : currentFoodCoverageForPlayer(actor.id) < 1.05);
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
  territorySummary?: Pick<AiTerritorySummary, "visibility" | "foodPressure" | "settlementEvaluationByKey">
): AiSettlementCandidateEvaluation => {
  const tk = key(tile.x, tile.y);
  const cacheKey = `${tk}|${victoryPath ?? "none"}|${assumedFrontierKeys ? [...assumedFrontierKeys].sort().join(",") : "-"}`;
  if (territorySummary) {
    const cached = territorySummary.settlementEvaluationByKey.get(cacheKey);
    if (cached) return cached;
  }
  const assumedOwned = assumedFrontierKeys?.has(tk) ?? false;
  const actualOwnerId = assumedOwned ? actor.id : tile.ownerId;
  const actualOwnershipState = assumedOwned ? "FRONTIER" : tile.ownershipState;
  if (tile.terrain !== "LAND" || actualOwnerId !== actor.id || actualOwnershipState !== "FRONTIER") {
    const invalidEvaluation = {
      score: Number.NEGATIVE_INFINITY,
      isEconomicallyInteresting: false,
      isStrategicallyInteresting: false,
      isDefensivelyCompact: false,
      supportsImmediatePlan: false,
      townSupportSignal: 0,
      intrinsicDockValue: 0
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
      townSupportSignal += 60 + deficit * 18;
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
    intrinsicDockValue: dockValue
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
    "visibility" | "foodPressure" | "settlementEvaluationByKey" | "scoutRevealCountByTileKey" | "scoutRevealMarks" | "scoutRevealStamp"
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
    let score =
      frontierClass === "economic"
        ? 260 + economicSignal
        : frontierClass === "scaffold"
          ? 180 + settlementEvaluation.score
          : frontierClass === "scout"
            ? 120 + scoutScore
            : 50 + scoutScore + Math.max(0, settlementEvaluation.score);
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
      ownershipDefenseMultiplierForTarget(to);
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

const estimateAiPressureAttackScore = (
  actor: Player,
  territorySummary: Pick<AiTerritorySummary, "attackCandidates" | "visibility">
): number => {
  let bestScore = 0;
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
  }
  return bestScore;
};

const buildAiPlanningStaticCache = (
  actor: Player,
  territorySummary: AiTerritorySummary
): AiPlanningStaticCache => {
  const visibility = territorySummary.visibility;
  const visibleToActor = (x: number, y: number): boolean => visibleInSnapshot(visibility, x, y);
  const settledTiles = territorySummary.settledTileCount;
  const structureCandidateCount = territorySummary.structureCandidateTiles.length;
  let openingScoutAvailable = false;
  let neutralExpandAvailable = false;
  let economicExpandAvailable = false;
  let scoutExpandAvailable = false;
  let scaffoldExpandAvailable = false;
  let barbarianAttackAvailable = false;
  let enemyAttackAvailable = false;
  let settlementAvailable = false;
  let frontierOpportunityEconomic = 0;
  let frontierOpportunityScout = 0;
  let frontierOpportunityScaffold = 0;
  let frontierOpportunityWaste = 0;

  for (const tile of territorySummary.frontierTiles) {
    const tileKey = key(tile.x, tile.y);
    const hasTownSupport = cachedSupportedTownKeysForTile(actor.id, tileKey, territorySummary).length > 0;
    if (townsByTile.has(tileKey) || Boolean(tile.resource) || docksByTile.has(tileKey) || hasTownSupport) {
      settlementAvailable = true;
      break;
    }
  }

  for (const { from, to } of territorySummary.expandCandidates) {
    if (to.terrain !== "LAND" || to.ownerId) continue;
    neutralExpandAvailable = true;
    const tileKey = key(to.x, to.y);
    const ownedNeighbors = adjacentNeighborCores(to.x, to.y).reduce((count, neighbor) => count + (neighbor.ownerId === actor.id ? 1 : 0), 0);
    const exposedSides = adjacentNeighborCores(to.x, to.y).reduce((count, neighbor) => {
      if (neighbor.terrain !== "LAND") return count + 1;
      if (!neighbor.ownerId || neighbor.ownerId !== actor.id) return count + 1;
      return count;
    }, 0);
    const scoutRevealCount = countAiScoutRevealTiles(to, visibility, territorySummary);
    if (settledTiles <= 2 && scoutRevealCount > 0) openingScoutAvailable = true;
    if (scoutRevealCount > 0) scoutExpandAvailable = true;
    const economic = isAiVisibleEconomicFrontierTile(actor, to, territorySummary);
    const scaffold =
      cachedSupportedTownKeysForTile(actor.id, tileKey, territorySummary).length > 0 ||
      (ownedNeighbors >= 3 && exposedSides <= 1) ||
      townsByTile.has(tileKey) ||
      Boolean(to.resource) ||
      docksByTile.has(tileKey);
    if (economic) {
      frontierOpportunityEconomic += 1;
    } else if (scaffold) {
      scaffoldExpandAvailable = true;
      frontierOpportunityScaffold += 1;
    } else if (scoutRevealCount > 0 || !visibleToActor(to.x, to.y)) {
      frontierOpportunityScout += 1;
    } else {
      frontierOpportunityWaste += 1;
    }
  }

  for (const { to } of territorySummary.attackCandidates) {
    if (to.terrain !== "LAND" || !to.ownerId || to.ownerId === actor.id || actor.allies.has(to.ownerId)) continue;
    if (to.ownerId === BARBARIAN_OWNER_ID) barbarianAttackAvailable = true;
    else enemyAttackAvailable = true;
    if (barbarianAttackAvailable && enemyAttackAvailable) break;
  }

  const pressureAttackScore = estimateAiPressureAttackScore(actor, territorySummary);
  const fortCandidate = structureCandidateCount > 0 ? bestAiFortTile(actor, territorySummary) : undefined;
  const economicExpandCandidate = bestAiEconomicExpand(actor, undefined, territorySummary);
  const economicBuildAvailable =
    structureCandidateCount > 0 &&
    territorySummary.structureCandidateTiles.some((tile) => {
      const tileKey = key(tile.x, tile.y);
      if (economicStructuresByTile.has(tileKey)) return false;
      if (tile.resource || townsByTile.has(tileKey)) return true;
      return cachedSupportedTownKeysForTile(actor.id, tileKey, territorySummary).length > 0;
    });

  return {
    version: aiTerritoryVersionForPlayer(actor.id),
    openingScoutAvailable,
    neutralExpandAvailable,
    economicExpandAvailable: Boolean(economicExpandCandidate),
    scoutExpandAvailable,
    scaffoldExpandAvailable,
    barbarianAttackAvailable,
    enemyAttackAvailable,
    pressureAttackScore,
    settlementAvailable,
    fortAvailable: Boolean(fortCandidate),
    fortProtectsCore: fortTileProtectsCore(actor, fortCandidate),
    fortIsDockChokePoint: fortTileIsDockChokePoint(fortCandidate),
    economicBuildAvailable,
    frontierOpportunityEconomic,
    frontierOpportunityScout,
    frontierOpportunityScaffold,
    frontierOpportunityWaste
  };
};

const cachedAiPlanningStaticForPlayer = (actor: Player, territorySummary: AiTerritorySummary): AiPlanningStaticCache => {
  const version = aiTerritoryVersionForPlayer(actor.id);
  const cached = cachedAiPlanningStaticByPlayer.get(actor.id);
  if (cached && cached.version === version) return cached;
  const rebuilt = buildAiPlanningStaticCache(actor, territorySummary);
  cachedAiPlanningStaticByPlayer.set(actor.id, rebuilt);
  return rebuilt;
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

  return {
    primaryVictoryPath,
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
    pressureAttackScore: planningStatic.pressureAttackScore,
    settlementAvailable: planningStatic.settlementAvailable,
    fortAvailable: planningStatic.fortAvailable,
    fortProtectsCore: planningStatic.fortProtectsCore,
    fortIsDockChokePoint: planningStatic.fortIsDockChokePoint,
    economicBuildAvailable: planningStatic.economicBuildAvailable,
    frontierOpportunityEconomic: planningStatic.frontierOpportunityEconomic,
    frontierOpportunityScout: planningStatic.frontierOpportunityScout,
    frontierOpportunityScaffold: planningStatic.frontierOpportunityScaffold,
    frontierOpportunityWaste: planningStatic.frontierOpportunityWaste,
    canAffordFrontierAction: canAffordGoldCost(actor.points, FRONTIER_ACTION_GOLD_COST),
    canAffordSettlement: canAffordGoldCost(actor.points, SETTLE_COST),
    canBuildFort:
      planningStatic.fortAvailable &&
      playerEffects.unlockForts &&
      actor.points >= structureBuildGoldCost("FORT", ownedStructureCountForPlayer(actor.id, "FORT")) &&
      (strategicStocks.IRON ?? 0) >= FORT_BUILD_IRON_COST,
    canBuildEconomy: planningStatic.economicBuildAvailable,
    goldHealthy: canAffordGoldCost(actor.points, SETTLE_COST + FRONTIER_ACTION_GOLD_COST)
  };
};

const bestAiSettlementTile = (
  actor: Player,
  victoryPath?: AiSeasonVictoryPathId,
  territorySummary = collectAiTerritorySummary(actor)
): Tile | undefined => {
  const { foodCoverageLow, economyWeak } = aiEconomyPriorityState(actor, territorySummary);
  let best:
    | (ReturnType<typeof evaluateAiSettlementCandidate> & {
        tile: Tile;
        hasIntrinsicEconomicValue: boolean;
        priorityScore: number;
      })
    | undefined;
  for (const tile of territorySummary.frontierTiles) {
    const tileKey = key(tile.x, tile.y);
    const evaluation = evaluateAiSettlementCandidate(actor, tile, victoryPath, undefined, territorySummary);
    const hasIntrinsicEconomicValue = townsByTile.has(tileKey) || Boolean(tile.resource) || docksByTile.has(tileKey);
    const priorityScore =
      evaluation.score + (hasIntrinsicEconomicValue ? 480 : 0) + (evaluation.townSupportSignal > 0 ? 520 + evaluation.townSupportSignal : 0);
    if (!best || priorityScore > best.priorityScore || (priorityScore === best.priorityScore && evaluation.score > best.score)) {
      best = { tile, ...evaluation, hasIntrinsicEconomicValue, priorityScore };
    }
  }
  if (!best) return undefined;
  if (!best.isEconomicallyInteresting && !best.isStrategicallyInteresting) return undefined;
  if (
    (economyWeak || territorySummary.underThreat || foodCoverageLow) &&
    !best.hasIntrinsicEconomicValue &&
    best.tile.resource !== "FARM" &&
    best.tile.resource !== "FISH" &&
    best.townSupportSignal <= 0
  ) {
    return undefined;
  }
  const minScore = best.hasIntrinsicEconomicValue ? 20 : victoryPath === "SETTLED_TERRITORY" ? 32 : 55;
  return best.score >= minScore ? best.tile : undefined;
};

const bestAiFortTile = (actor: Player, territorySummary = collectAiTerritorySummary(actor)): Tile | undefined => {
  let best: { tile: Tile; score: number } | undefined;
  for (const tile of territorySummary.structureCandidateTiles) {
    const tk = key(tile.x, tile.y);
    if (!territorySummary.borderSettledTileKeys.has(tk) && !docksByTile.has(tk)) continue;
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
  let best: { score: number; tile: Tile; structureType: EconomicStructureType } | undefined;
  const consider = (score: number, tile: Tile, structureType: EconomicStructureType): void => {
    if (!best || score > best.score) best = { score, tile, structureType };
  };
  for (const tile of territorySummary.structureCandidateTiles) {
    const tileKey = key(tile.x, tile.y);
    if (tile.economicStructure) continue;
    if (tile.resource === "FARM" || tile.resource === "FISH") {
      consider(50, tile, "FARMSTEAD");
      consider(25, tile, "GRANARY");
    } else if (tile.resource === "FUR" || tile.resource === "WOOD") {
      consider(40, tile, "CAMP");
      consider(20, tile, "MARKET");
    } else if (tile.resource === "IRON" || tile.resource === "GEMS") {
      consider(45, tile, "MINE");
      consider(22, tile, "MARKET");
    } else if (townsByTile.has(tileKey)) {
      consider(35, tile, "MARKET");
      consider(18, tile, "GRANARY");
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
  const foodCoverageLow = controlledTowns > 0 && foodCoverage < 1.05;
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

type SimulationCommand =
  | { type: "EXPAND"; fromX: number; fromY: number; toX: number; toY: number }
  | { type: "ATTACK"; fromX: number; fromY: number; toX: number; toY: number }
  | { type: "SETTLE"; x: number; y: number }
  | { type: "BUILD_FORT"; x: number; y: number }
  | { type: "BUILD_ECONOMIC_STRUCTURE"; x: number; y: number; structureType: EconomicStructureType };

type QueuedSimulationMessage =
  | SimulationCommand
  | { type: "BUILD_OBSERVATORY"; x: number; y: number }
  | { type: "BUILD_SIEGE_OUTPOST"; x: number; y: number };

type SystemSimulationCommand =
  | { type: "BARBARIAN_ACTION"; agentId: string }
  | { type: "BARBARIAN_MAINTENANCE" };

type SimulationCommandJob = {
  actor?: Player;
  command: QueuedSimulationMessage | SystemSimulationCommand;
  socket: Ws;
  priority: "human" | "system" | "ai";
};

const simulationCommandWorkerState: {
  humanQueue: SimulationCommandJob[];
  systemQueue: SimulationCommandJob[];
  aiQueue: SimulationCommandJob[];
  draining: boolean;
  lastDequeuedPriority: "human" | "system" | "ai" | "idle";
  lastDrainAt: number;
  lastDrainElapsedMs: number;
  lastDrainCommands: number;
  lastDrainHumanCommands: number;
  lastDrainSystemCommands: number;
  lastDrainAiCommands: number;
} = {
  humanQueue: [],
  systemQueue: [],
  aiQueue: [],
  draining: false,
  lastDequeuedPriority: "idle",
  lastDrainAt: 0,
  lastDrainElapsedMs: 0,
  lastDrainCommands: 0,
  lastDrainHumanCommands: 0,
  lastDrainSystemCommands: 0,
  lastDrainAiCommands: 0
};

const simulationCommandQueueDepth = (): number =>
  simulationCommandWorkerState.humanQueue.length +
  simulationCommandWorkerState.systemQueue.length +
  simulationCommandWorkerState.aiQueue.length;

const aiTerritoryVersionByPlayer = new Map<string, number>();
const cachedAiTerritoryStructureByPlayer = new Map<string, AiTerritoryStructureCache>();
const cachedAiPlanningStaticByPlayer = new Map<string, AiPlanningStaticCache>();

const aiTerritoryVersionForPlayer = (playerId: string): number => aiTerritoryVersionByPlayer.get(playerId) ?? 0;
const markAiTerritoryDirtyForPlayers = (playerIds: Iterable<string>): void => {
  for (const playerId of playerIds) {
    aiTerritoryVersionByPlayer.set(playerId, aiTerritoryVersionForPlayer(playerId) + 1);
    cachedAiTerritoryStructureByPlayer.delete(playerId);
    cachedAiPlanningStaticByPlayer.delete(playerId);
  }
};

const queueSimulationDrain = (): void => {
  if (simulationCommandWorkerState.draining) return;
  simulationCommandWorkerState.draining = true;
  setTimeout(() => {
    void drainSimulationCommandQueue();
  }, 0);
};

const hasQueuedSystemSimulationCommand = (predicate: (job: SimulationCommandJob) => boolean): boolean =>
  simulationCommandWorkerState.systemQueue.some(predicate);

const isQueuedSimulationMessage = (msg: ClientMessage): msg is QueuedSimulationMessage =>
  msg.type === "SETTLE" ||
  msg.type === "BUILD_FORT" ||
  msg.type === "BUILD_OBSERVATORY" ||
  msg.type === "BUILD_ECONOMIC_STRUCTURE" ||
  msg.type === "BUILD_SIEGE_OUTPOST" ||
  msg.type === "ATTACK" ||
  msg.type === "EXPAND";

const dequeueSimulationCommandJob = (
  drainedHumanCommands: number,
  drainedSystemCommands: number,
  drainedAiCommands: number
): SimulationCommandJob | undefined => {
  const humanPending = simulationCommandWorkerState.humanQueue.length > 0;
  const systemPending = simulationCommandWorkerState.systemQueue.length > 0;
  const aiPending = simulationCommandWorkerState.aiQueue.length > 0;
  if (!humanPending && !systemPending && !aiPending) return undefined;
  if (humanPending && (drainedHumanCommands < SIM_DRAIN_HUMAN_QUOTA || (!systemPending && !aiPending))) {
    return simulationCommandWorkerState.humanQueue.shift();
  }
  if (systemPending && (drainedSystemCommands < SIM_DRAIN_SYSTEM_QUOTA || (!humanPending && !aiPending))) {
    return simulationCommandWorkerState.systemQueue.shift();
  }
  if (aiPending && (drainedAiCommands < SIM_DRAIN_AI_QUOTA || !humanPending)) {
    return simulationCommandWorkerState.aiQueue.shift();
  }
  if (humanPending) return simulationCommandWorkerState.humanQueue.shift();
  if (systemPending) return simulationCommandWorkerState.systemQueue.shift();
  return simulationCommandWorkerState.aiQueue.shift();
};

const executeSystemSimulationCommand = async (command: SystemSimulationCommand): Promise<void> => {
  if (command.type === "BARBARIAN_MAINTENANCE") {
    maintainBarbarianPopulation();
    return;
  }
  const live = barbarianAgents.get(command.agentId);
  if (!live) return;
  runBarbarianAction(live);
};

const drainSimulationCommandQueue = async (): Promise<void> => {
  let drainedCommands = 0;
  let drainedHumanCommands = 0;
  let drainedSystemCommands = 0;
  let drainedAiCommands = 0;
  const drainStartedAt = now();
  while (drainedCommands < SIM_DRAIN_MAX_COMMANDS && now() - drainStartedAt < SIM_DRAIN_BUDGET_MS) {
    const job = dequeueSimulationCommandJob(drainedHumanCommands, drainedSystemCommands, drainedAiCommands);
    if (!job) break;
    simulationCommandWorkerState.lastDequeuedPriority = job.priority;
    try {
      if (job.priority === "system") {
        await executeSystemSimulationCommand(job.command as SystemSimulationCommand);
      } else {
        await executeUnifiedGameplayMessage(job.actor!, job.command as ClientMessage, job.socket, true);
      }
    } catch (err) {
      logRuntimeError("simulation command failed", err);
    }
    drainedCommands += 1;
    if (job.priority === "human") drainedHumanCommands += 1;
    else if (job.priority === "system") drainedSystemCommands += 1;
    else drainedAiCommands += 1;
  }
  simulationCommandWorkerState.lastDrainAt = now();
  simulationCommandWorkerState.lastDrainElapsedMs = simulationCommandWorkerState.lastDrainAt - drainStartedAt;
  simulationCommandWorkerState.lastDrainCommands = drainedCommands;
  simulationCommandWorkerState.lastDrainHumanCommands = drainedHumanCommands;
  simulationCommandWorkerState.lastDrainSystemCommands = drainedSystemCommands;
  simulationCommandWorkerState.lastDrainAiCommands = drainedAiCommands;
  if (simulationCommandQueueDepth() <= 0) {
    simulationCommandWorkerState.draining = false;
    simulationCommandWorkerState.lastDequeuedPriority = "idle";
    return;
  }
  setTimeout(() => {
    void drainSimulationCommandQueue();
  }, 0);
};

const enqueueSimulationCommand = (
  actor: Player | undefined,
  command: QueuedSimulationMessage | SystemSimulationCommand,
  socket: Ws,
  priority: "human" | "system" | "ai"
): void => {
  const job: SimulationCommandJob = actor
    ? { actor, command, socket, priority }
    : { command, socket, priority };
  if (priority === "human") simulationCommandWorkerState.humanQueue.push(job);
  else if (priority === "system") simulationCommandWorkerState.systemQueue.push(job);
  else simulationCommandWorkerState.aiQueue.push(job);
  queueSimulationDrain();
};

const executeSimulationCommand = (actor: Player, command: SimulationCommand): void => {
  enqueueSimulationCommand(actor, command, NOOP_WS, "ai");
};

const enqueueSystemSimulationCommand = (command: SystemSimulationCommand): void => {
  enqueueSimulationCommand(undefined, command, NOOP_WS, "system");
};

const executeAiGoapAction = (
  actor: Player,
  actionKey: string,
  victoryPath?: AiSeasonVictoryPathId,
  territorySummary?: AiTerritorySummary,
  candidates?: {
    neutralExpand?: ReturnType<typeof bestAiEconomicExpand>;
    anyNeutralExpand?: ReturnType<typeof bestAiAnyNeutralExpand>;
    scoutExpand?: ReturnType<typeof bestAiScoutExpand>;
    scaffoldExpand?: ReturnType<typeof bestAiScaffoldExpand>;
    barbarianAttack?: ReturnType<typeof bestAiFrontierAction>;
    enemyAttack?: ReturnType<typeof bestAiFrontierAction>;
    settlementTile?: ReturnType<typeof bestAiSettlementTile>;
    fortAnchor?: ReturnType<typeof bestAiFortTile>;
    economicBuild?: ReturnType<typeof bestAiEconomicStructure>;
    pressureAttack?: ReturnType<typeof bestAiEnemyPressureAttack>;
  }
): boolean => {
  if (actionKey === "wait_and_recover") return true;
  if (actionKey === "claim_neutral_border_tile") {
    const candidate = candidates?.neutralExpand ?? candidates?.anyNeutralExpand ?? bestAiEconomicExpand(actor, victoryPath, territorySummary) ?? bestAiAnyNeutralExpand(actor, victoryPath, territorySummary);
    if (!candidate) return false;
    executeSimulationCommand(actor, { type: "EXPAND", fromX: candidate.from.x, fromY: candidate.from.y, toX: candidate.to.x, toY: candidate.to.y });
    return true;
  }
  if (actionKey === "claim_food_border_tile") {
    const candidate = candidates?.neutralExpand ?? bestAiEconomicExpand(actor, victoryPath, territorySummary);
    if (!candidate) return false;
    executeSimulationCommand(actor, { type: "EXPAND", fromX: candidate.from.x, fromY: candidate.from.y, toX: candidate.to.x, toY: candidate.to.y });
    return true;
  }
  if (actionKey === "claim_scout_border_tile") {
    const candidate = candidates?.scoutExpand ?? bestAiScoutExpand(actor, territorySummary);
    if (!candidate) return false;
    executeSimulationCommand(actor, { type: "EXPAND", fromX: candidate.from.x, fromY: candidate.from.y, toX: candidate.to.x, toY: candidate.to.y });
    return true;
  }
  if (actionKey === "claim_scaffold_border_tile") {
    const candidate = candidates?.scaffoldExpand ?? bestAiScaffoldExpand(actor, victoryPath, territorySummary);
    if (!candidate) return false;
    executeSimulationCommand(actor, { type: "EXPAND", fromX: candidate.from.x, fromY: candidate.from.y, toX: candidate.to.x, toY: candidate.to.y });
    return true;
  }
  if (actionKey === "attack_barbarian_border_tile") {
    const candidate =
      candidates?.barbarianAttack ?? bestAiFrontierAction(actor, "ATTACK", (tile) => tile.ownerId === BARBARIAN_OWNER_ID, victoryPath, territorySummary);
    if (!candidate) return false;
    executeSimulationCommand(actor, { type: "ATTACK", fromX: candidate.from.x, fromY: candidate.from.y, toX: candidate.to.x, toY: candidate.to.y });
    return true;
  }
  if (actionKey === "attack_enemy_border_tile") {
    const candidate =
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
    if (!candidate) return false;
    executeSimulationCommand(actor, { type: "ATTACK", fromX: candidate.from.x, fromY: candidate.from.y, toX: candidate.to.x, toY: candidate.to.y });
    return true;
  }
  if (actionKey === "settle_owned_frontier_tile") {
    const tile = candidates?.settlementTile ?? bestAiSettlementTile(actor, victoryPath, territorySummary);
    if (!tile) return false;
    executeSimulationCommand(actor, { type: "SETTLE", x: tile.x, y: tile.y });
    return true;
  }
  if (actionKey === "build_fort_on_exposed_tile") {
    const tile = candidates?.fortAnchor ?? bestAiFortTile(actor, territorySummary);
    if (!tile) return false;
    if (!getPlayerEffectsForPlayer(actor.id).unlockForts) return false;
    if ((getOrInitStrategicStocks(actor.id).IRON ?? 0) < FORT_BUILD_IRON_COST) return false;
    if (actor.points < structureBuildGoldCost("FORT", ownedStructureCountForPlayer(actor.id, "FORT"))) return false;
    executeSimulationCommand(actor, { type: "BUILD_FORT", x: tile.x, y: tile.y });
    return true;
  }
  if (actionKey === "build_economic_structure") {
    const candidate = candidates?.economicBuild ?? bestAiEconomicStructure(actor, territorySummary);
    if (!candidate) return false;
    executeSimulationCommand(actor, { type: "BUILD_ECONOMIC_STRUCTURE", x: candidate.tile.x, y: candidate.tile.y, structureType: candidate.structureType });
    return true;
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
  const territorySummary = analysis.territorySummary;
  let townOpportunityScore = 0;
  let economicOpportunityScore = 0;
  let expansionOpportunityScore = 0;

  for (const { to } of territorySummary.expandCandidates) {
    if (to.terrain !== "LAND" || to.ownerId) continue;
    const tk = key(to.x, to.y);
    if (townsByTile.has(tk)) {
      townOpportunityScore += 5;
      continue;
    }
    if (isAiVisibleEconomicFrontierTile(actor, to, territorySummary)) {
      economicOpportunityScore += 4;
      continue;
    }
    expansionOpportunityScore += 1;
  }

  for (const { to } of territorySummary.attackCandidates) {
    if (to.terrain !== "LAND" || !to.ownerId || to.ownerId === actor.id || actor.allies.has(to.ownerId) || to.ownerId === BARBARIAN_OWNER_ID) continue;
    const tk = key(to.x, to.y);
    if (townsByTile.has(tk)) townOpportunityScore += 6;
    else if (Boolean(to.resource) || docksByTile.has(tk)) economicOpportunityScore += 3;
  }

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

  const tieBreak = [...actor.id].reduce((total, char) => total + char.charCodeAt(0), 0) % 7;
  const openingScores: Record<AiSeasonVictoryPathId, number> = {
    TOWN_CONTROL:
      townOpportunityScore * 40 +
      (analysis.controlledTowns === 0 ? 35 : 0) +
      (analysis.underThreat ? -15 : 0),
    ECONOMIC_HEGEMONY:
      economicOpportunityScore * 36 +
      (analysis.worldFlags.has("active_dock") ? 28 : 0) +
      (analysis.worldFlags.has("active_town") ? 12 : 0) +
      (analysis.foodCoverageLow ? 10 : 0),
    SETTLED_TERRITORY:
      expansionOpportunityScore * 10 +
      territorySummary.expandCandidates.length * 0.5 +
      (analysis.underThreat ? -8 : 8)
  };

  return [...ranked]
    .map((entry) => ({
      id: entry.id,
      score: openingScores[entry.id] + entry.score * 0.2 + (entry.id === "SETTLED_TERRITORY" ? tieBreak : 0)
    }))
    .sort((left, right) => right.score - left.score)[0]?.id ?? "ECONOMIC_HEGEMONY";
};

const ensureAiVictoryPath = (
  actor: Player,
  analysis: AiTurnAnalysis,
  townsTarget: number,
  settledTilesTarget: number
): AiSeasonVictoryPathId => {
  const existing = aiVictoryPathByPlayer.get(actor.id);
  if (existing) return existing;
  const selected = chooseOpeningAiVictoryPath(actor, analysis, townsTarget, settledTilesTarget);
  aiVictoryPathByPlayer.set(actor.id, selected);
  return selected;
};

const recordAiActionFailure = (
  actor: Player,
  actionKey: string,
  code: string,
  reason: string,
  coords?: { x: number; y: number }
): void => {
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
  if (!actor.isAi) return;
  actor.lastActiveAt = now();
  if (actor.T <= 0 || actor.territoryTiles.size === 0 || actor.respawnPending) {
    actor.respawnPending = false;
    spawnPlayer(actor);
    setAiTurnDebug(actor, "respawned");
    return;
  }
  const pendingCaptures = pendingCapturesByAttacker(actor.id).length;
  const pendingSettlement = hasPendingSettlementForPlayer(actor.id);
  if (pendingCaptures > 0) {
    setAiTurnDebug(actor, "waiting_on_pending_capture_resolution", {
      details: {
        pendingCaptures,
        pendingSettlement
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
  const analysis = tickContext
    ? (tickContext.analysisByPlayerId.get(actor.id) ??
      buildAiTurnAnalysis(actor, territoryMetrics, tickContext.incomeByPlayerId))
    : buildAiTurnAnalysis(actor, territoryMetrics, new Map<string, number>());
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
  const primaryVictoryPath = ensureAiVictoryPath(actor, analysis, townsTarget, settledTilesTarget);
  const planningSnapshot = buildAiPlanningSnapshot(actor, primaryVictoryPath, analysis, townsTarget, settledTilesTarget);
  const decision = await planAiDecisionViaWorker(planningSnapshot);
  const debugDetails = {
    hasNeutralLandOpportunity: planningSnapshot.neutralExpandAvailable,
    hasScoutOpportunity: planningSnapshot.scoutExpandAvailable,
    hasScaffoldOpportunity: planningSnapshot.scaffoldExpandAvailable,
    hasBarbarianTarget: planningSnapshot.barbarianAttackAvailable,
    hasWeakEnemyBorder: planningSnapshot.pressureAttackAvailable || planningSnapshot.enemyAttackAvailable,
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
    lastActionFailureY: aiLastActionFailureByPlayer.get(actor.id)?.y
  };
  const resolvedReason = (executed: boolean): string =>
    executed && decision.reason.startsWith("failed_")
      ? decision.reason.replace("failed_", "executed_")
      : !executed && decision.reason.startsWith("executed_")
        ? decision.reason.replace("executed_", "failed_")
        : decision.reason;

  if (!decision.actionKey) {
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
    const opening = bestAiOpeningScoutExpand(actor, territorySummary);
    const executed = Boolean(
      opening &&
        tryQueueBasicFrontierAction(actor, "EXPAND", opening.from.x, opening.from.y, opening.to.x, opening.to.y)
    );
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

  const executed = executeAiGoapAction(actor, decision.actionKey, primaryVictoryPath, territorySummary);
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

let aiRoundRobinOffset = 0;
let aiCycleCounter = 0;
const aiNextDueAtByPlayer = new Map<string, number>();
const aiTurnsInFlight = new Set<string>();
const aiSchedulerState: {
  at: number;
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
} = {
  at: 0,
  batchSize: 0,
  selectedAiPlayers: 0,
  totalAiPlayers: 0,
  urgentAiPlayers: 0,
  humanPlayersOnline: false,
  authPriorityActive: false,
  aiQueueBackpressure: false,
  simulationQueueBackpressure: false,
  eventLoopOverloaded: false,
  reason: "idle"
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

const onlineHumanPlayerCount = (): number => {
  let count = 0;
  for (const playerId of socketsByPlayer.keys()) {
    const player = players.get(playerId);
    if (!player?.isAi) count += 1;
  }
  return count;
};

const markAiDefensePriority = (playerId: string, durationMs = AI_DEFENSE_PRIORITY_MS): void => {
  const player = players.get(playerId);
  if (!player?.isAi) return;
  aiDefensePriorityUntilByPlayer.set(playerId, now() + durationMs);
};

const aiHasDefensePriority = (playerId: string, nowMs = now()): boolean => {
  const expiresAt = aiDefensePriorityUntilByPlayer.get(playerId);
  if (!expiresAt) return false;
  if (expiresAt <= nowMs) {
    aiDefensePriorityUntilByPlayer.delete(playerId);
    return false;
  }
  return true;
};

const aiDefensePriorityCount = (aiPlayers: readonly Player[], nowMs = now()): number => {
  let count = 0;
  for (const actor of aiPlayers) {
    if (aiHasDefensePriority(actor.id, nowMs)) count += 1;
  }
  return count;
};

const ensureAiDueAt = (playerId: string, nowMs = now()): number => {
  const dueAt = aiNextDueAtByPlayer.get(playerId);
  if (dueAt !== undefined) return dueAt;
  aiNextDueAtByPlayer.set(playerId, nowMs);
  return nowMs;
};

const scheduleNextAiTurn = (playerId: string, nowMs = now()): void => {
  aiNextDueAtByPlayer.set(playerId, nowMs + AI_TICK_MS);
};

const chooseAiBatchSize = (totalAiPlayers: number): number => {
  if (totalAiPlayers <= 0) return 0;
  const vitals = latestRuntimeVitalsSample();
  const humanPlayersOnline = onlineHumanPlayerCount() > 0;
  const nowMs = now();
  const urgentAiCount = aiDefensePriorityCount([...players.values()].filter((actor) => actor.isAi), nowMs);
  const authPriorityActive = pendingAuthVerifications > 0 || authPriorityUntil > now();
  const aiQueueBackpressure = aiWorkerState.queue.length >= AI_WORKER_QUEUE_SOFT_LIMIT;
  const simulationQueueBackpressure = simulationCommandQueueDepth() >= AI_SIM_QUEUE_SOFT_LIMIT;
  const eventLoopOverloaded = Boolean(
    vitals &&
      (vitals.eventLoopDelayP95Ms >= AI_EVENT_LOOP_P95_SOFT_LIMIT_MS ||
        vitals.eventLoopUtilizationPercent >= AI_EVENT_LOOP_UTILIZATION_SOFT_LIMIT_PCT)
  );
  let batchSize = Math.min(totalAiPlayers, AI_TICK_BATCH_SIZE);
  let reason = "base";

  if (humanPlayersOnline) {
    batchSize = Math.min(batchSize, AI_HUMAN_PRIORITY_BATCH_SIZE);
    reason = "human_priority";
    if (urgentAiCount > 0) {
      batchSize = Math.min(totalAiPlayers, Math.max(batchSize, Math.min(AI_HUMAN_DEFENSE_BATCH_SIZE, urgentAiCount)));
      reason = "human_priority+defense_priority";
    }
  }
  if (authPriorityActive) {
    batchSize = Math.min(batchSize, AI_AUTH_PRIORITY_BATCH_SIZE);
    reason = reason === "base" ? "auth_priority" : `${reason}+auth_priority`;
  }
  if (aiQueueBackpressure || simulationQueueBackpressure || eventLoopOverloaded) {
    batchSize = 1;
    const overloadReasons = [
      aiQueueBackpressure ? "ai_queue_backpressure" : "",
      simulationQueueBackpressure ? "simulation_queue_backpressure" : "",
      eventLoopOverloaded ? "event_loop_overloaded" : ""
    ].filter(Boolean);
    reason = overloadReasons.join("+") || "overloaded";
  }

  aiSchedulerState.at = now();
  aiSchedulerState.batchSize = Math.max(1, batchSize);
  aiSchedulerState.selectedAiPlayers = Math.max(1, batchSize);
  aiSchedulerState.totalAiPlayers = totalAiPlayers;
  aiSchedulerState.urgentAiPlayers = urgentAiCount;
  aiSchedulerState.humanPlayersOnline = humanPlayersOnline;
  aiSchedulerState.authPriorityActive = authPriorityActive;
  aiSchedulerState.aiQueueBackpressure = aiQueueBackpressure;
  aiSchedulerState.simulationQueueBackpressure = simulationQueueBackpressure;
  aiSchedulerState.eventLoopOverloaded = eventLoopOverloaded;
  aiSchedulerState.reason = reason;
  return Math.max(1, batchSize);
};

const runAiTick = (): void => {
  const aiPlayers = [...players.values()].filter((actor) => actor.isAi);
  if (aiPlayers.length === 0) return;
  const nowMs = now();
  const batchSize = Math.min(aiPlayers.length, chooseAiBatchSize(aiPlayers.length));
  const urgentAiPlayers = aiPlayers.filter((actor) => aiHasDefensePriority(actor.id, nowMs));
  const orderedAiPlayers = urgentAiPlayers.length
    ? [
        ...urgentAiPlayers,
        ...aiPlayers.filter((actor) => !urgentAiPlayers.some((urgent) => urgent.id === actor.id))
      ]
    : aiPlayers;
  const eligibleAiPlayers = orderedAiPlayers.filter((actor) => {
    if (aiTurnsInFlight.has(actor.id)) return false;
    if (aiHasDefensePriority(actor.id, nowMs)) return true;
    return ensureAiDueAt(actor.id, nowMs) <= nowMs;
  });
  if (eligibleAiPlayers.length === 0) return;
  const selectedAiPlayers =
    batchSize >= eligibleAiPlayers.length
      ? eligibleAiPlayers
      : Array.from({ length: batchSize }, (_, index) => eligibleAiPlayers[(aiRoundRobinOffset + index) % eligibleAiPlayers.length]).filter(
          (actor): actor is Player => Boolean(actor)
        );
  if (selectedAiPlayers.length === 0) return;
  aiSchedulerState.at = now();
  aiSchedulerState.selectedAiPlayers = selectedAiPlayers.length;
  aiRoundRobinOffset = (aiRoundRobinOffset + batchSize) % eligibleAiPlayers.length;
  const startedAt = now();
  const competitionContext = getAiCompetitionContext(nowMs);
  const competitionMetrics = competitionContext.competitionMetrics;
  const incomeByPlayerId = competitionContext.incomeByPlayerId;
  const analysisByPlayerId = new Map<string, AiTurnAnalysis>();
  for (const actor of selectedAiPlayers) {
    analysisByPlayerId.set(actor.id, cachedAiTurnAnalysisForPlayer(actor, competitionContext));
  }
  const tickContext: AiTickContext = {
    cycleId: ++aiCycleCounter,
    competitionMetrics,
    incomeByPlayerId,
    townsTarget: competitionContext.townsTarget,
    settledTilesTarget: competitionContext.settledTilesTarget,
    analysisByPlayerId
  };
  const slotMs = Math.max(10, Math.floor(AI_DISPATCH_INTERVAL_MS / Math.max(1, selectedAiPlayers.length)));
  let pending = selectedAiPlayers.length;
  let activeElapsedMs = 0;

  selectedAiPlayers.forEach((actor, index) => {
    aiTurnsInFlight.add(actor.id);
    scheduleNextAiTurn(actor.id, nowMs);
    const delayMs = Math.min(AI_DISPATCH_INTERVAL_MS - 1, index * slotMs);
    setTimeout(() => {
      enqueueAiWorkerJob({
        actor,
        tickContext,
        onComplete: (elapsedMs) => {
          aiTurnsInFlight.delete(actor.id);
          activeElapsedMs += elapsedMs;
          pending -= 1;
          if (pending > 0) return;
          const memory = runtimeMemoryStats();
          const elapsedMsTotal = activeElapsedMs;
          const wallElapsedMs = now() - startedAt;
          recentAiTickPerf.push({
            at: now(),
            elapsedMs: elapsedMsTotal,
            aiPlayers: selectedAiPlayers.length,
            rssMb: memory.rssMb,
            heapUsedMb: memory.heapUsedMb
          });
          if (elapsedMsTotal >= 250) {
            app.log.warn(
              {
                elapsedMs: elapsedMsTotal,
                wallElapsedMs,
                aiPlayers: selectedAiPlayers.length,
                totalAiPlayers: aiPlayers.length,
                queueDepth: aiWorkerState.queue.length,
                cycleId: tickContext.cycleId,
                ...memory
              },
              "slow ai tick"
            );
          }
        }
      });
    }, delayMs);
  });
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
        ownershipDefenseMultiplierForTarget(currentTarget)
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
const INITIAL_CHUNK_BOOTSTRAP_RADIUS = 0;
type ChunkSummaryMode = "thin" | "standard";

type ChunkFollowUpStage = {
  sub: { cx: number; cy: number; radius: number };
  chunkCoords: Array<{ cx: number; cy: number }>;
  summaryMode: ChunkSummaryMode;
  batchSize: number;
  next?: ChunkFollowUpStage;
};
const chunkDist = (a: number, b: number, mod: number): number => {
  const d = Math.abs(a - b);
  return Math.min(d, mod - d);
};

interface VisibilitySnapshot {
  allVisible: boolean;
  visibleMask: Uint8Array;
}

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

const chunkCoordsForSubscription = (
  sub: { cx: number; cy: number; radius: number },
  minChebyshevRadius = 0
): Array<{ cx: number; cy: number }> => {
  const coords: Array<{ cx: number; cy: number }> = [];
  for (let cy = sub.cy - sub.radius; cy <= sub.cy + sub.radius; cy += 1) {
    for (let cx = sub.cx - sub.radius; cx <= sub.cx + sub.radius; cx += 1) {
      const wrappedCx = wrapChunkX(cx);
      const wrappedCy = wrapChunkY(cy);
      const distance = Math.max(
        chunkDist(wrappedCx, wrapChunkX(sub.cx), chunkCountX),
        chunkDist(wrappedCy, wrapChunkY(sub.cy), chunkCountY)
      );
      if (distance < minChebyshevRadius) continue;
      coords.push({ cx: wrappedCx, cy: wrappedCy });
    }
  }
  coords.sort((a, b) => {
    const adx = chunkDist(a.cx, wrapChunkX(sub.cx), chunkCountX);
    const ady = chunkDist(a.cy, wrapChunkY(sub.cy), chunkCountY);
    const bdx = chunkDist(b.cx, wrapChunkX(sub.cx), chunkCountX);
    const bdy = chunkDist(b.cy, wrapChunkY(sub.cy), chunkCountY);
    const aChebyshev = Math.max(adx, ady);
    const bChebyshev = Math.max(bdx, bdy);
    if (aChebyshev !== bChebyshev) return aChebyshev - bChebyshev;
    const aManhattan = adx + ady;
    const bManhattan = bdx + bdy;
    if (aManhattan !== bManhattan) return aManhattan - bManhattan;
    if (a.cy !== b.cy) return a.cy - b.cy;
    return a.cx - b.cx;
  });
  return coords;
};

const chunkSnapshotCacheForPlayer = (
  playerId: string,
  visibility: VisibilitySnapshot
): {
  payloadByChunkKey: Map<string, string>;
  visibilityMaskByChunkKey: Map<string, Uint8Array>;
} => {
  const cached = cachedChunkSnapshotByPlayer.get(playerId);
  if (cached?.visibility === visibility) {
    return {
      payloadByChunkKey: cached.payloadByChunkKey,
      visibilityMaskByChunkKey: cached.visibilityMaskByChunkKey
    };
  }
  const payloadByChunkKey = new Map<string, string>();
  const visibilityMaskByChunkKey = new Map<string, Uint8Array>();
  cachedChunkSnapshotByPlayer.set(playerId, { visibility, payloadByChunkKey, visibilityMaskByChunkKey });
  return { payloadByChunkKey, visibilityMaskByChunkKey };
};

const fogChunkTiles = (worldCx: number, worldCy: number): readonly Tile[] => {
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
};

const chunkVisibilityMask = (playerId: string, snapshot: VisibilitySnapshot, worldCx: number, worldCy: number): Uint8Array => {
  const chunkKey = `${worldCx},${worldCy}`;
  const cache = chunkSnapshotCacheForPlayer(playerId, snapshot);
  const cachedMask = cache.visibilityMaskByChunkKey.get(chunkKey);
  if (cachedMask) return cachedMask;
  const startX = worldCx * CHUNK_SIZE;
  const startY = worldCy * CHUNK_SIZE;
  const mask = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
  let index = 0;
  for (let y = startY; y < startY + CHUNK_SIZE; y += 1) {
    for (let x = startX; x < startX + CHUNK_SIZE; x += 1) {
      const wx = wrapX(x, WORLD_WIDTH);
      const wy = wrapY(y, WORLD_HEIGHT);
      mask[index] = visibleInSnapshot(snapshot, wx, wy) ? 1 : 0;
      index += 1;
    }
  }
  cache.visibilityMaskByChunkKey.set(chunkKey, mask);
  return mask;
};

const chunkSnapshotPayload = (
  actor: Player,
  snapshot: VisibilitySnapshot,
  worldCx: number,
  worldCy: number,
  mode: ChunkSummaryMode,
): { buildInput?: ChunkBuildInput; payload?: string; tileCount: number; chunkKey: string } => {
  const cache = chunkSnapshotCacheForPlayer(actor.id, snapshot);
  const chunkKey = `${worldCx},${worldCy}`;
  const payloadCacheKey = `${mode}:${chunkKey}`;
  const cachedPayload = cache.payloadByChunkKey.get(payloadCacheKey);
  if (cachedPayload) {
    return {
      payload: cachedPayload,
      tileCount: CHUNK_SIZE * CHUNK_SIZE,
      chunkKey: payloadCacheKey
    };
  }

  return {
    buildInput: {
      cx: worldCx,
      cy: worldCy,
      fogTiles: [...fogChunkTiles(worldCx, worldCy)],
      visibleTiles: [...summaryChunkTiles(worldCx, worldCy, mode)],
      visibleMask: chunkVisibilityMask(actor.id, snapshot, worldCx, worldCy)
    },
    tileCount: CHUNK_SIZE * CHUNK_SIZE,
    chunkKey: payloadCacheKey
  };
};

const buildBootstrapChunkStages = (sub: { cx: number; cy: number; radius: number }): ChunkFollowUpStage | undefined => {
  if (sub.radius <= INITIAL_CHUNK_BOOTSTRAP_RADIUS) return undefined;
  const stageRadii: number[] = [];
  for (let radius = INITIAL_CHUNK_BOOTSTRAP_RADIUS + 1; radius <= sub.radius; radius += 1) {
    stageRadii.push(radius);
  }
  let next: ChunkFollowUpStage | undefined;
  for (let index = stageRadii.length - 1; index >= 0; index -= 1) {
    const radius = stageRadii[index]!;
    next = {
      sub: { ...sub, radius },
      chunkCoords: chunkCoordsForSubscription({ ...sub, radius }, radius),
      summaryMode: "thin",
      batchSize: 1,
      ...(next ? { next } : {})
    };
  }
  return next;
};

const chunkBatchSizeForSnapshot = (
  chunkCoords: Array<{ cx: number; cy: number }>,
  followUpStage: ChunkFollowUpStage | undefined,
  batchSizeOverride?: number
): number => {
  if (batchSizeOverride !== undefined) return Math.max(1, batchSizeOverride);
  if (followUpStage || chunkCoords.length > CHUNK_SNAPSHOT_BATCH_SIZE) return 1;
  return Math.max(1, Math.min(CHUNK_STREAM_BATCH_SIZE, CHUNK_SNAPSHOT_BATCH_SIZE));
};

const sendChunkSnapshot = (
  socket: Ws,
  actor: Player,
  sub: { cx: number; cy: number; radius: number },
  followUpStage?: ChunkFollowUpStage,
  chunkCoordsOverride?: Array<{ cx: number; cy: number }>,
  summaryMode: ChunkSummaryMode = "thin",
  batchSizeOverride?: number
): void => {
  const startedAt = now();
  const authSync = authSyncTimingByPlayer.get(actor.id);
  const snapshot = visibilitySnapshotForPlayer(actor);
  const generation = (chunkSnapshotGenerationByPlayer.get(actor.id) ?? 0) + 1;
  chunkSnapshotGenerationByPlayer.set(actor.id, generation);
  chunkSnapshotSentAtByPlayer.set(actor.id, { cx: sub.cx, cy: sub.cy, radius: sub.radius, sentAt: now() });
  let chunkCount = 0;
  let tileCount = 0;
  const chunkCoords = chunkCoordsOverride ?? chunkCoordsForSubscription(sub);
  const batchSize = chunkBatchSizeForSnapshot(chunkCoords, followUpStage, batchSizeOverride);

  let index = 0;
  const streamNext = async (): Promise<void> => {
    if (chunkSnapshotGenerationByPlayer.get(actor.id) !== generation) return;
    if (socket.readyState !== socket.OPEN) return;
    const chunkBatchBodies: string[] = [];
    const pendingBuilds: Array<{ chunkKey: string; buildInput: ChunkBuildInput }> = [];
    const end = Math.min(index + batchSize, chunkCoords.length);
    for (; index < end; index += 1) {
      const coords = chunkCoords[index]!;
      const chunk = chunkSnapshotPayload(actor, snapshot, coords.cx, coords.cy, summaryMode);
      if (chunk.payload) {
        chunkBatchBodies.push(chunk.payload);
      } else if (chunk.buildInput) {
        pendingBuilds.push({ chunkKey: chunk.chunkKey, buildInput: chunk.buildInput });
      }
      chunkCount += 1;
      tileCount += chunk.tileCount;
    }
    if (pendingBuilds.length > 0) {
      const payloads = await serializeChunkBatchViaWorker(pendingBuilds.map((chunk) => chunk.buildInput));
      const payloadCache = chunkSnapshotCacheForPlayer(actor.id, snapshot).payloadByChunkKey;
      for (let payloadIndex = 0; payloadIndex < payloads.length; payloadIndex += 1) {
        const pending = pendingBuilds[payloadIndex]!;
        const payload = payloads[payloadIndex]!;
        payloadCache.set(pending.chunkKey, payload);
        chunkBatchBodies.push(payload);
      }
    }
    if (chunkBatchBodies.length > 0) {
      socket.send(serializeChunkBatchBodies(chunkBatchBodies));
    }
    if (index < chunkCoords.length) {
      setTimeout(() => {
        void streamNext();
      }, 0);
      return;
    }
    const elapsed = now() - startedAt;
    const memory = runtimeMemoryStats();
    if (authSync && authSync.firstChunkSentAt === undefined) {
      authSync.firstChunkSentAt = now();
      app.log.info(
        {
          playerId: actor.id,
          sinceAuthVerifiedMs: authSync.authVerifiedAt ? authSync.firstChunkSentAt - authSync.authVerifiedAt : undefined,
          sinceInitSentMs: authSync.initSentAt ? authSync.firstChunkSentAt - authSync.initSentAt : undefined,
          sinceFirstSubscribeMs: authSync.firstSubscribeAt ? authSync.firstChunkSentAt - authSync.firstSubscribeAt : undefined,
          chunkCount,
          tileCount,
          radius: sub.radius
        },
        "auth sync first chunk sent"
      );
    }
    recentChunkSnapshotPerf.push({
      at: now(),
      playerId: actor.id,
      elapsedMs: elapsed,
      chunks: chunkCount,
      tiles: tileCount,
      radius: sub.radius,
      rssMb: memory.rssMb,
      heapUsedMb: memory.heapUsedMb
    });
    if (elapsed >= CHUNK_SNAPSHOT_WARN_MS) {
      app.log.warn(
        { playerId: actor.id, elapsedMs: elapsed, chunks: chunkCount, tiles: tileCount, radius: sub.radius, ...memory },
        "slow chunk snapshot"
      );
    }
    if (
      followUpStage &&
      socket.readyState === socket.OPEN &&
      chunkSnapshotGenerationByPlayer.get(actor.id) === generation
    ) {
      setTimeout(() => {
        if (socket.readyState !== socket.OPEN) return;
        const currentSub = chunkSubscriptionByPlayer.get(actor.id);
        if (!currentSub) return;
        if (
          currentSub.cx !== followUpStage.sub.cx ||
          currentSub.cy !== followUpStage.sub.cy ||
          currentSub.radius < followUpStage.sub.radius
        ) {
          return;
        }
        sendChunkSnapshot(
          socket,
          actor,
          followUpStage.sub,
          followUpStage.next,
          followUpStage.chunkCoords,
          followUpStage.summaryMode,
          followUpStage.batchSize
        );
      }, 0);
    }
  };

  void streamNext();
};

const tileInSubscription = (playerId: string, x: number, y: number): boolean => {
  const sub = chunkSubscriptionByPlayer.get(playerId);
  if (!sub) return false;
  const tcx = wrapChunkX(Math.floor(x / CHUNK_SIZE));
  const tcy = wrapChunkY(Math.floor(y / CHUNK_SIZE));
  const scx = wrapChunkX(sub.cx);
  const scy = wrapChunkY(sub.cy);
  return chunkDist(tcx, scx, chunkCountX) <= sub.radius && chunkDist(tcy, scy, chunkCountY) <= sub.radius;
};

const hasActiveResearch = (player: Player): boolean => Boolean(player.currentResearch && player.currentResearch.completesAt > now());

const availableTechPicks = (player: Player): number => {
  return hasActiveResearch(player) ? 0 : 1;
};

const defaultMissionStats = (): MissionStats => ({
  neutralCaptures: 0,
  enemyCaptures: 0,
  combatWins: 0,
  maxTilesHeld: 0,
  maxSettledTilesHeld: 0,
  maxFarmsHeld: 0,
  maxContinentsHeld: 0,
  maxTechPicks: 0
});

const ensureMissionDefaults = (player: Player): void => {
  if (!player.missionStats) player.missionStats = defaultMissionStats();
  if (player.missionStats.maxSettledTilesHeld === undefined) player.missionStats.maxSettledTilesHeld = 0;
  if (player.missionStats.maxContinentsHeld === undefined) player.missionStats.maxContinentsHeld = 0;
  if (player.missionStats.maxTechPicks === undefined) player.missionStats.maxTechPicks = 0;
  if (!player.missions) player.missions = [];
};

const missionProgressValue = (player: Player, kind: MissionKind): number => {
  ensureMissionDefaults(player);
  if (kind === "NEUTRAL_CAPTURES") return player.missionStats.neutralCaptures;
  if (kind === "ENEMY_CAPTURES") return player.missionStats.enemyCaptures;
  if (kind === "COMBAT_WINS") return player.missionStats.combatWins;
  if (kind === "TILES_HELD") return player.missionStats.maxTilesHeld;
  if (kind === "SETTLED_TILES_HELD") return player.missionStats.maxSettledTilesHeld;
  if (kind === "FARMS_HELD") return player.missionStats.maxFarmsHeld;
  if (kind === "CONTINENTS_HELD") return player.missionStats.maxContinentsHeld;
  return player.missionStats.maxTechPicks;
};

const ownedDockCount = (playerId: string): number => {
  let n = 0;
  for (const d of docksByTile.values()) {
    const [x, y] = parseKey(d.tileKey);
    const t = playerTile(x, y);
    if (t.ownerId === playerId) n += 1;
  }
  return n;
};

const dynamicMissionProgress = (player: Player, mission: DynamicMissionDef): { progress: number; target: number } => {
  if (mission.type === "VENDETTA") {
    const target = 8;
    const map = vendettaCaptureCountsByPlayer.get(player.id);
    const progress = mission.targetPlayerId ? (map?.get(mission.targetPlayerId) ?? 0) : 0;
    return { progress: Math.min(target, progress), target };
  }
  if (mission.type === "DOCK_HUNT") {
    return { progress: ownedDockCount(player.id) >= 1 ? 1 : 0, target: mission.targetDockCount ?? 1 };
  }
  const pair = mission.focusResources;
  if (!pair) return { progress: 0, target: 16 };
  const counts = getOrInitResourceCounts(player.id);
  const a = Math.min(8, counts[pair[0]] ?? 0);
  const b = Math.min(8, counts[pair[1]] ?? 0);
  return { progress: a + b, target: 16 };
};

const applyDynamicMissionReward = (player: Player, mission: DynamicMissionDef): void => {
  if (mission.rewarded) return;
  if (mission.type === "VENDETTA") {
    temporaryAttackBuffUntilByPlayer.set(player.id, Math.max(temporaryAttackBuffUntilByPlayer.get(player.id) ?? 0, now() + VENDETTA_ATTACK_BUFF_MS));
  } else if (mission.type === "DOCK_HUNT") {
    const reveal = getOrInitForcedReveal(player.id);
    const candidates = [...dockById.values()].filter((d) => {
      const [x, y] = parseKey(d.tileKey);
      return !visible(player, x, y);
    });
    for (let i = 0; i < Math.min(3, candidates.length); i += 1) {
      const d = candidates[i]!;
      const [x, y] = parseKey(d.tileKey);
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          reveal.add(key(wrapX(x + dx, WORLD_WIDTH), wrapY(y + dy, WORLD_HEIGHT)));
        }
      }
    }
  } else if (mission.focusResources) {
    temporaryIncomeBuffUntilByPlayer.set(player.id, { until: now() + RESOURCE_CHAIN_BUFF_MS, resources: mission.focusResources });
  }
  mission.rewarded = true;
};

const maybeIssueVendettaMission = (_player: Player, _targetPlayerId: string): void => {};

const maybeIssueDockMission = (_player: Player): void => {};

const maybeIssueResourceMission = (_player: Player, _captured?: ResourceType): void => {};

const dynamicMissionPayload = (_player: Player): MissionState[] => [];

const applyStaticMissionReward = (player: Player, mission: MissionState): void => {
  const stock = getOrInitStrategicStocks(player.id);
  if (mission.id === "frontier-scout") {
    stock.FOOD += 1;
    stock.SUPPLY += 1;
    return;
  }
  if (mission.id === "frontier-commander") {
    stock.IRON += 1;
    stock.CRYSTAL += 1;
    return;
  }
  if (mission.id === "regional-footprint") {
    stock.SHARD += 1;
  }
};

const syncMissionProgress = (_player: Player): boolean => false;

const unlockMissions = (_player: Player): boolean => false;

const continentsHeldCount = (player: Player): number => {
  const set = new Set<number>();
  for (const tk of player.territoryTiles) {
    const [x, y] = parseKey(tk);
    const cid = continentIdAt(x, y);
    if (cid !== undefined) set.add(cid);
  }
  return set.size;
};

const updateMissionState = (player: Player): boolean => {
  ensureMissionDefaults(player);
  player.missions = [];
  dynamicMissionsByPlayer.delete(player.id);
  return false;
};

const missionPayload = (_player: Player): MissionState[] => [];

const normalizePlayerProgressionState = (player: Player): void => {
  player.techIds = new Set([...player.techIds].filter((id) => techById.has(id)));
  player.domainIds = new Set([...player.domainIds].filter((id) => domainById.has(id)));
  if (!Number.isFinite(player.manpower)) player.manpower = playerManpowerCap(player);
  if (!Number.isFinite(player.manpowerUpdatedAt)) player.manpowerUpdatedAt = now();
  applyManpowerRegen(player);
  if (player.currentResearch) {
    const researchingTech = techById.get(player.currentResearch.techId);
    if (!researchingTech || player.techIds.has(player.currentResearch.techId)) {
      delete player.currentResearch;
    }
  }
};

const computeLeaderboardSnapshot = (limitTop = 5): LeaderboardSnapshotView => {
  const rows = collectPlayerCompetitionMetrics().map((metric) => ({
    id: metric.playerId,
    name: metric.name,
    tiles: metric.settledTiles,
    incomePerMinute: metric.incomePerMinute,
    techs: metric.techs
  }));
  const overallRanked = [...rows]
    .map((r) => ({ ...r, score: r.tiles * 1 + r.incomePerMinute * 3 + r.techs * 8 }))
    .sort((a, b) => b.score - a.score || b.tiles - a.tiles || b.incomePerMinute - a.incomePerMinute || b.techs - a.techs || a.id.localeCompare(b.id))
    .map((r, index) => ({ ...r, rank: index + 1 }));
  const overall = overallRanked
    .slice(0, limitTop);
  const byTiles = [...rows]
    .sort((a, b) => b.tiles - a.tiles)
    .slice(0, limitTop)
    .map((r) => ({ id: r.id, name: r.name, value: r.tiles }));
  const byIncome = [...rows]
    .sort((a, b) => b.incomePerMinute - a.incomePerMinute)
    .slice(0, limitTop)
    .map((r) => ({ id: r.id, name: r.name, value: r.incomePerMinute }));
  const byTechs = [...rows]
    .sort((a, b) => b.techs - a.techs)
    .slice(0, limitTop)
    .map((r) => ({ id: r.id, name: r.name, value: r.techs }));

  return { overall, selfOverall: undefined, byTiles, byIncome, byTechs };
};

const leaderboardSnapshotForPlayer = (playerId: string | undefined): LeaderboardSnapshotView => {
  const base = cachedLeaderboardSnapshot;
  if (!playerId) return { ...base, selfOverall: undefined };
  if (base.overall.some((entry) => entry.id === playerId)) return { ...base, selfOverall: undefined };
  const rows = collectPlayerCompetitionMetrics().map((metric) => ({
    id: metric.playerId,
    name: metric.name,
    tiles: metric.settledTiles,
    incomePerMinute: metric.incomePerMinute,
    techs: metric.techs,
    score: metric.settledTiles * 1 + metric.incomePerMinute * 3 + metric.techs * 8
  }));
  const ranked = rows
    .sort((a, b) => b.score - a.score || b.tiles - a.tiles || b.incomePerMinute - a.incomePerMinute || b.techs - a.techs || a.id.localeCompare(b.id))
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
  const selfOverall = ranked.find((entry) => entry.id === playerId);
  return selfOverall ? { ...base, selfOverall } : { ...base, selfOverall: undefined };
};

const trimFrontierSettlementsWindow = (playerId: string, nowMs = now()): number[] => {
  const timestamps = frontierSettlementsByPlayer.get(playerId);
  if (!timestamps || timestamps.length === 0) return [];
  let writeIndex = 0;
  for (let readIndex = 0; readIndex < timestamps.length; readIndex += 1) {
    const timestamp = timestamps[readIndex]!;
    if (nowMs - timestamp > VICTORY_PRESSURE_FRONTIER_REACH_WINDOW_MS) continue;
    timestamps[writeIndex] = timestamp;
    writeIndex += 1;
  }
  if (writeIndex !== timestamps.length) timestamps.length = writeIndex;
  if (writeIndex === 0) {
    frontierSettlementsByPlayer.delete(playerId);
    return [];
  }
  return timestamps;
};

const recordFrontierSettlementForPressure = (playerId: string): void => {
  const next = trimFrontierSettlementsWindow(playerId);
  next.push(now());
  frontierSettlementsByPlayer.set(playerId, next);
};

const uniqueLeader = (entries: Array<{ playerId: string; value: number }>): { playerId?: string; value: number } => {
  if (entries.length === 0) return { value: 0 };
  let top = entries[0]!;
  let runnerUp: { playerId: string; value: number } | undefined;
  for (let i = 1; i < entries.length; i += 1) {
    const entry = entries[i]!;
    if (entry.value > top.value) {
      runnerUp = top;
      top = entry;
      continue;
    }
    if (!runnerUp || entry.value > runnerUp.value) runnerUp = entry;
  }
  if (top.value <= 0) return { value: top.value };
  if (runnerUp && runnerUp.value === top.value) return { value: top.value };
  return { playerId: top.playerId, value: top.value };
};

const leadingPair = (entries: Array<{ playerId: string; value: number }>): {
  leaderPlayerId?: string;
  leaderValue: number;
  runnerUpValue: number;
  tied: boolean;
} => {
  if (entries.length === 0) return { leaderValue: 0, runnerUpValue: 0, tied: false };
  const sorted = [...entries].sort((a, b) => b.value - a.value);
  const leader = sorted[0]!;
  const runnerUp = sorted[1];
  return {
    leaderPlayerId: leader.playerId,
    leaderValue: leader.value,
    runnerUpValue: runnerUp?.value ?? 0,
    tied: Boolean(runnerUp && runnerUp.value === leader.value)
  };
};

const countControlledTowns = (playerId: string): number => {
  let count = 0;
  for (const tk of townsByTile.keys()) {
    if (ownership.get(tk) !== playerId) continue;
    if (ownershipStateByTile.get(tk) !== "SETTLED") continue;
    count += 1;
  }
  return count;
};

const worldResourceTileCounts = (): Record<ResourceType, number> => {
  const counts: Record<ResourceType, number> = { FARM: 0, FISH: 0, FUR: 0, WOOD: 0, IRON: 0, GEMS: 0, OIL: 0 };
  for (let y = 0; y < WORLD_HEIGHT; y += 1) {
    for (let x = 0; x < WORLD_WIDTH; x += 1) {
      if (terrainAtRuntime(x, y) !== "LAND") continue;
      const resource = applyClusterResources(x, y, resourceAt(x, y));
      if (!resource) continue;
      counts[resource] = (counts[resource] ?? 0) + 1;
    }
  }
  return counts;
};

const controlledResourceTileCounts = (playerId: string): Record<ResourceType, number> => {
  const counts: Record<ResourceType, number> = { FARM: 0, FISH: 0, FUR: 0, WOOD: 0, IRON: 0, GEMS: 0, OIL: 0 };
  for (const tk of players.get(playerId)?.territoryTiles ?? []) {
    const [x, y] = parseKey(tk);
    if (terrainAtRuntime(x, y) !== "LAND") continue;
    const resource = applyClusterResources(x, y, resourceAt(x, y));
    if (!resource) continue;
    counts[resource] = (counts[resource] ?? 0) + 1;
  }
  return counts;
};

let cachedIslandMap:
  | {
      seed: number;
      islandIdByTile: Map<TileKey, number>;
      landCounts: Map<number, number>;
    }
  | undefined;

const buildIslandMap = (): { islandIdByTile: Map<TileKey, number>; landCounts: Map<number, number> } => {
  const islandIdByTile = new Map<TileKey, number>();
  const landCounts = new Map<number, number>();
  let nextIslandId = 0;
  for (let y = 0; y < WORLD_HEIGHT; y += 1) {
    for (let x = 0; x < WORLD_WIDTH; x += 1) {
      if (terrainAtRuntime(x, y) !== "LAND") continue;
      const startKey = key(x, y);
      if (islandIdByTile.has(startKey)) continue;
      const islandId = nextIslandId;
      nextIslandId += 1;
      const queue: Array<{ x: number; y: number }> = [{ x, y }];
      islandIdByTile.set(startKey, islandId);
      let islandLand = 0;
      while (queue.length > 0) {
        const current = queue.shift()!;
        islandLand += 1;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if (dx === 0 && dy === 0) continue;
            const nx = wrapX(current.x + dx, WORLD_WIDTH);
            const ny = wrapY(current.y + dy, WORLD_HEIGHT);
            if (terrainAtRuntime(nx, ny) !== "LAND") continue;
            const neighborKey = key(nx, ny);
            if (islandIdByTile.has(neighborKey)) continue;
            islandIdByTile.set(neighborKey, islandId);
            queue.push({ x: nx, y: ny });
          }
        }
      }
      landCounts.set(islandId, islandLand);
    }
  }
  return { islandIdByTile, landCounts };
};

const islandMap = (): { islandIdByTile: Map<TileKey, number>; landCounts: Map<number, number> } => {
  if (cachedIslandMap?.seed === activeSeason.worldSeed) {
    return { islandIdByTile: cachedIslandMap.islandIdByTile, landCounts: cachedIslandMap.landCounts };
  }
  const next = buildIslandMap();
  cachedIslandMap = { seed: activeSeason.worldSeed, ...next };
  return next;
};

const islandLandCounts = (): Map<number, number> => islandMap().landCounts;

const islandSettledCounts = (playerId: string): Map<number, number> => {
  const counts = new Map<number, number>();
  const ids = islandMap().islandIdByTile;
  for (const tk of players.get(playerId)?.territoryTiles ?? []) {
    const [x, y] = parseKey(tk);
    if (terrainAtRuntime(x, y) !== "LAND") continue;
    if (ownership.get(tk) !== playerId || ownershipStateByTile.get(tk) !== "SETTLED") continue;
    const islandId = ids.get(tk);
    if (islandId === undefined) continue;
    counts.set(islandId, (counts.get(islandId) ?? 0) + 1);
  }
  return counts;
};

let cachedClaimableLandTileCount: { seed: number; count: number } | undefined;
const claimableLandTileCount = (): number => {
  if (cachedClaimableLandTileCount?.seed === activeSeason.worldSeed) return cachedClaimableLandTileCount?.count ?? 0;
  let count = 0;
  for (let y = 0; y < WORLD_HEIGHT; y += 1) {
    for (let x = 0; x < WORLD_WIDTH; x += 1) {
      if (terrainAtRuntime(x, y) === "LAND") count += 1;
    }
  }
  cachedClaimableLandTileCount = { seed: activeSeason.worldSeed, count };
  return count;
};

const collectPlayerCompetitionMetrics = (nowMs = now()): PlayerCompetitionMetrics[] => {
  const metrics: PlayerCompetitionMetrics[] = [];
  for (const player of players.values()) {
    const territoryStructure = cachedAiTerritoryStructureForPlayer(player);
    metrics.push({
      playerId: player.id,
      name: player.name,
      tiles: player.T,
      settledTiles: territoryStructure.settledTileCount,
      incomePerMinute: currentIncomePerMinute(player),
      techs: player.techIds.size,
      controlledTowns: territoryStructure.controlledTowns
    });
  }
  return metrics;
};

let cachedAiCompetitionContext: AiCompetitionContext | undefined;
const getAiCompetitionContext = (nowMs = now()): AiCompetitionContext => {
  if (cachedAiCompetitionContext && nowMs - cachedAiCompetitionContext.computedAt <= AI_COMPETITION_CONTEXT_TTL_MS) {
    return cachedAiCompetitionContext;
  }
  const competitionMetrics = collectPlayerCompetitionMetrics(nowMs);
  const context: AiCompetitionContext = {
    computedAt: nowMs,
    competitionMetrics,
    incomeByPlayerId: new Map(competitionMetrics.map((metric) => [metric.playerId, metric.incomePerMinute])),
    townsTarget: Math.max(1, Math.ceil(Math.max(1, townsByTile.size) * SEASON_VICTORY_TOWN_CONTROL_SHARE)),
    settledTilesTarget: Math.max(1, Math.ceil(claimableLandTileCount() * SEASON_VICTORY_SETTLED_TERRITORY_SHARE)),
    analysisByPlayerId: new Map<string, AiTurnAnalysis>()
  };
  cachedAiCompetitionContext = context;
  return context;
};

const uniqueLeaderFromMetrics = (
  metrics: PlayerCompetitionMetrics[],
  selectValue: (metric: PlayerCompetitionMetrics) => number
): { playerId?: string; value: number } => {
  return uniqueLeader(metrics.map((metric) => ({ playerId: metric.playerId, value: selectValue(metric) })));
};

const getVictoryPressureTracker = (id: SeasonVictoryPathId): VictoryPressureTracker => {
  let tracker = victoryPressureById.get(id);
  if (!tracker) {
    tracker = {};
    victoryPressureById.set(id, tracker);
  }
  return tracker;
};

const currentSeasonWinner = (): SeasonWinnerView | undefined => seasonWinner;
const isFinalPushActive = (nowMs = now()): boolean => activeSeason.endAt - nowMs <= FINAL_PUSH_MS;

const pushStrategicReplayEvent = (event: Omit<StrategicReplayEvent, "id">): StrategicReplayEvent => {
  const fullEvent: StrategicReplayEvent = { ...event, id: crypto.randomUUID() };
  strategicReplayEvents.push(fullEvent);
  while (strategicReplayEvents.length > STRATEGIC_REPLAY_LIMIT) strategicReplayEvents.shift();
  broadcast({ type: "STRATEGIC_REPLAY_EVENT", event: fullEvent });
  return fullEvent;
};

const computeVictoryPressureObjectives = (): SeasonVictoryObjectiveView[] => {
  const nowMs = now();
  const totalTownCount = Math.max(1, townsByTile.size);
  const townTarget = Math.max(1, Math.ceil(totalTownCount * SEASON_VICTORY_TOWN_CONTROL_SHARE));
  const settledTarget = Math.max(1, Math.ceil(claimableLandTileCount() * SEASON_VICTORY_SETTLED_TERRITORY_SHARE));
  const metrics = collectPlayerCompetitionMetrics(nowMs);
  const totalResourceCounts = worldResourceTileCounts();
  const allIslands = islandLandCounts();
  return VICTORY_PRESSURE_DEFS.map((def) => {
    const tracker = getVictoryPressureTracker(def.id);
    let leaderPlayerId: string | undefined;
    let leaderValue = 0;
    let conditionMet = false;
    let progressLabel = "";
    let thresholdLabel = "";

    if (def.id === "TOWN_CONTROL") {
      const leader = uniqueLeaderFromMetrics(metrics, (metric) => metric.controlledTowns);
      leaderPlayerId = leader.playerId;
      leaderValue = leader.value;
      conditionMet = Boolean(leaderPlayerId && leaderValue >= townTarget);
      progressLabel = `${leaderValue}/${townTarget} towns`;
      thresholdLabel = `Need ${townTarget} towns`;
    } else if (def.id === "SETTLED_TERRITORY") {
      const leader = uniqueLeaderFromMetrics(metrics, (metric) => metric.settledTiles);
      leaderPlayerId = leader.playerId;
      leaderValue = leader.value;
      conditionMet = Boolean(leaderPlayerId && leaderValue >= settledTarget);
      progressLabel = `${leaderValue}/${settledTarget} settled land`;
      thresholdLabel = `Need ${settledTarget} settled land tiles`;
    } else if (def.id === "ECONOMIC_HEGEMONY") {
      const pair = leadingPair(metrics.map((metric) => ({ playerId: metric.playerId, value: metric.incomePerMinute })));
      leaderPlayerId = pair.tied ? undefined : pair.leaderPlayerId;
      leaderValue = pair.leaderValue;
      const incomeThreshold = pair.runnerUpValue <= 0 ? Number.POSITIVE_INFINITY : pair.runnerUpValue * SEASON_VICTORY_ECONOMY_LEAD_MULT;
      conditionMet = Boolean(
        leaderPlayerId &&
          !pair.tied &&
          leaderValue >= SEASON_VICTORY_ECONOMY_MIN_INCOME &&
          pair.runnerUpValue > 0 &&
          leaderValue >= incomeThreshold
      );
      progressLabel = `${leaderValue.toFixed(1)} gold/m vs ${pair.runnerUpValue.toFixed(1)}`;
      thresholdLabel = `Need at least ${SEASON_VICTORY_ECONOMY_MIN_INCOME} gold/m and 33% lead`;
    } else if (def.id === "RESOURCE_MONOPOLY") {
      let bestLeaderId: string | undefined;
      let bestOwned = 0;
      let bestTotal = 0;
      let bestResource: ResourceType | undefined;
      for (const metric of metrics) {
        const controlled = controlledResourceTileCounts(metric.playerId);
        for (const resource of Object.keys(totalResourceCounts) as ResourceType[]) {
          const total = totalResourceCounts[resource];
          if ((total ?? 0) <= 0) continue;
          const owned = controlled[resource] ?? 0;
          if (owned > bestOwned) {
            bestLeaderId = metric.playerId;
            bestOwned = owned;
            bestTotal = total ?? 0;
            bestResource = resource;
          }
        }
      }
      leaderPlayerId = bestLeaderId;
      leaderValue = bestOwned;
      conditionMet = Boolean(leaderPlayerId && bestResource && bestTotal > 0 && bestOwned >= bestTotal);
      progressLabel = bestResource ? `${bestOwned}/${bestTotal} ${bestResource}` : "No resource leader";
      thresholdLabel = "Need 100% control of one resource type";
    } else {
      let bestLeaderId: string | undefined;
      let bestQualifiedCount = 0;
      let bestRatio = -1;
      let bestMinPct = 0;
      const totalIslands = Math.max(1, allIslands.size);
      for (const metric of metrics) {
        const settled = islandSettledCounts(metric.playerId);
        let minRatio = Number.POSITIVE_INFINITY;
        let validIslands = 0;
        let qualifiedCount = 0;
        for (const [islandId, totalLand] of allIslands) {
          if (totalLand <= 0) continue;
          validIslands += 1;
          const owned = settled.get(islandId) ?? 0;
          const ratio = owned / totalLand;
          if (ratio >= SEASON_VICTORY_CONTINENT_FOOTPRINT_SHARE) qualifiedCount += 1;
          minRatio = Math.min(minRatio, ratio);
        }
        if (validIslands === 0) continue;
        if (
          qualifiedCount > bestQualifiedCount ||
          (qualifiedCount === bestQualifiedCount &&
            (minRatio > bestRatio || (minRatio === bestRatio && metric.playerId < (bestLeaderId ?? "~"))))
        ) {
          bestQualifiedCount = qualifiedCount;
          bestRatio = minRatio;
          bestMinPct = Math.round(minRatio * 100);
          bestLeaderId = metric.playerId;
        }
      }
      leaderPlayerId = bestLeaderId;
      leaderValue = bestQualifiedCount;
      conditionMet = Boolean(leaderPlayerId && bestRatio >= SEASON_VICTORY_CONTINENT_FOOTPRINT_SHARE);
      progressLabel = `${bestQualifiedCount}/${totalIslands} islands at 10%+ settled · weakest island ${bestMinPct}%`;
      thresholdLabel = "Need 10% settled land on every island";
    }

    const winner = currentSeasonWinner();
    const holdRemainingSeconds =
      !winner &&
      conditionMet &&
      tracker.leaderPlayerId === leaderPlayerId &&
      tracker.holdStartedAt
        ? Math.max(0, Math.ceil((tracker.holdStartedAt + def.holdDurationSeconds * 1000 - nowMs) / 1000))
        : undefined;
    const statusLabel = winner
      ? winner.objectiveId === def.id
        ? `Winner crowned: ${winner.playerName}`
        : "Season already decided"
      : conditionMet
        ? holdRemainingSeconds !== undefined
          ? `Holding · ${Math.max(0, Math.ceil(holdRemainingSeconds / 3600))}h left`
          : "Threshold met"
        : leaderValue > 0
          ? "Pressure building"
          : "No contender";
    const view: SeasonVictoryObjectiveView = {
      id: def.id,
      name: def.name,
      description: def.description,
      leaderName: leaderPlayerId ? players.get(leaderPlayerId)?.name ?? leaderPlayerId.slice(0, 8) : leaderValue > 0 ? "Contested" : "No leader",
      progressLabel,
      thresholdLabel,
      holdDurationSeconds: def.holdDurationSeconds,
      statusLabel,
      conditionMet
    };
    if (leaderPlayerId !== undefined) view.leaderPlayerId = leaderPlayerId;
    if (holdRemainingSeconds !== undefined) view.holdRemainingSeconds = holdRemainingSeconds;
    return view;
  });
};

let cachedLeaderboardSnapshot: LeaderboardSnapshotView = { overall: [], selfOverall: undefined, byTiles: [], byIncome: [], byTechs: [] };
let cachedVictoryPressureObjectives: SeasonVictoryObjectiveView[] = [];
let globalStatusCacheExpiresAt = 0;
let lastGlobalStatusBroadcastSig = "";

const refreshGlobalStatusCache = (force = false): void => {
  const nowMs = now();
  if (!force && nowMs < globalStatusCacheExpiresAt) return;
  cachedLeaderboardSnapshot = computeLeaderboardSnapshot();
  cachedVictoryPressureObjectives = computeVictoryPressureObjectives();
  globalStatusCacheExpiresAt = nowMs + GLOBAL_STATUS_CACHE_TTL_MS;
};

const currentLeaderboardSnapshot = (): LeaderboardSnapshotView => {
  refreshGlobalStatusCache(false);
  return cachedLeaderboardSnapshot;
};

const currentVictoryPressureObjectives = (): SeasonVictoryObjectiveView[] => {
  refreshGlobalStatusCache(false);
  return cachedVictoryPressureObjectives;
};

const globalStatusBroadcastSignature = (): string =>
  JSON.stringify({
    leaderboard: cachedLeaderboardSnapshot,
    seasonVictory: cachedVictoryPressureObjectives,
    seasonWinner
  });

const broadcastGlobalStatusUpdate = (force = false): void => {
  refreshGlobalStatusCache(force);
  const nextSig = globalStatusBroadcastSignature();
  if (!force && nextSig === lastGlobalStatusBroadcastSig) return;
  lastGlobalStatusBroadcastSig = nextSig;
  for (const player of players.values()) {
    sendToPlayer(player.id, {
      type: "GLOBAL_STATUS_UPDATE",
      leaderboard: leaderboardSnapshotForPlayer(player.id),
      seasonVictory: cachedVictoryPressureObjectives,
      seasonWinner
    });
  }
};

const broadcastVictoryPressureUpdate = (announcement?: string): void => {
  refreshGlobalStatusCache(true);
  lastGlobalStatusBroadcastSig = globalStatusBroadcastSignature();
  broadcast({
    type: "SEASON_VICTORY_UPDATE",
    objectives: cachedVictoryPressureObjectives,
    announcement,
    seasonWinner
  });
};

const crownSeasonWinner = (playerId: string, def: VictoryPressureDefinition): void => {
  if (seasonWinner) return;
  const player = players.get(playerId);
  if (!player) return;
  seasonWinner = {
    playerId,
    playerName: player.name,
    crownedAt: now(),
    objectiveId: def.id,
    objectiveName: def.name
  };
  pushStrategicReplayEvent({
    at: seasonWinner.crownedAt,
    type: "WINNER",
    label: `${player.name} won the season via ${def.name}`,
    playerId,
    playerName: player.name,
    objectiveId: def.id,
    objectiveName: def.name,
    isBookmark: true
  });
  refreshGlobalStatusCache(true);
  lastGlobalStatusBroadcastSig = globalStatusBroadcastSignature();
  broadcast({
    type: "SEASON_WINNER_CROWNED",
    winner: seasonWinner,
    leaderboard: cachedLeaderboardSnapshot,
    objectives: cachedVictoryPressureObjectives
  });
};

const evaluateVictoryPressure = (): void => {
  if (seasonWinner) {
    refreshGlobalStatusCache(false);
    return;
  }
  const nowMs = now();
  const finalPushActive = isFinalPushActive(nowMs);
  const totalTownCount = Math.max(1, townsByTile.size);
  const townTarget = Math.max(1, Math.ceil(totalTownCount * SEASON_VICTORY_TOWN_CONTROL_SHARE));
  const settledTarget = Math.max(1, Math.ceil(claimableLandTileCount() * SEASON_VICTORY_SETTLED_TERRITORY_SHARE));
  const metrics = collectPlayerCompetitionMetrics(nowMs);
  let crowned: SeasonWinnerView | undefined;
  let announcement: string | undefined;

  for (const def of VICTORY_PRESSURE_DEFS) {
    const tracker = getVictoryPressureTracker(def.id);
    const previousLeaderPlayerId = tracker.leaderPlayerId;
    let leaderPlayerId: string | undefined;
    let conditionMet = false;

    if (def.id === "TOWN_CONTROL") {
      const leader = uniqueLeaderFromMetrics(metrics, (metric) => metric.controlledTowns);
      leaderPlayerId = leader.playerId;
      conditionMet = Boolean(leaderPlayerId && leader.value >= townTarget);
    } else if (def.id === "SETTLED_TERRITORY") {
      const leader = uniqueLeaderFromMetrics(metrics, (metric) => metric.settledTiles);
      leaderPlayerId = leader.playerId;
      conditionMet = Boolean(leaderPlayerId && leader.value >= settledTarget);
    } else {
      const pair = leadingPair(metrics.map((metric) => ({ playerId: metric.playerId, value: metric.incomePerMinute })));
      leaderPlayerId = pair.tied ? undefined : pair.leaderPlayerId;
      conditionMet = Boolean(
        leaderPlayerId &&
          !pair.tied &&
          pair.leaderValue >= SEASON_VICTORY_ECONOMY_MIN_INCOME &&
          pair.runnerUpValue > 0 &&
          pair.leaderValue >= pair.runnerUpValue * SEASON_VICTORY_ECONOMY_LEAD_MULT
      );
    }

    if (!conditionMet || !leaderPlayerId) {
      if (tracker.holdAnnouncedAt && previousLeaderPlayerId) {
        const previousLeaderName = players.get(previousLeaderPlayerId)?.name ?? previousLeaderPlayerId.slice(0, 8);
        announcement = `${previousLeaderName} lost the ${def.name} victory hold.`;
        pushStrategicReplayEvent({
          at: nowMs,
          type: "HOLD_BREAK",
          label: `${previousLeaderName} lost the ${def.name} hold`,
          playerId: previousLeaderPlayerId,
          playerName: previousLeaderName,
          objectiveId: def.id,
          objectiveName: def.name,
          isBookmark: true
        });
      }
      delete tracker.leaderPlayerId;
      delete tracker.holdStartedAt;
      delete tracker.holdAnnouncedAt;
      delete tracker.lastRemainingMilestoneHours;
      continue;
    }
    if (tracker.leaderPlayerId !== leaderPlayerId) {
      tracker.leaderPlayerId = leaderPlayerId;
      tracker.holdStartedAt = nowMs;
      delete tracker.holdAnnouncedAt;
      delete tracker.lastRemainingMilestoneHours;
      if (finalPushActive) {
        const leaderName = players.get(leaderPlayerId)?.name ?? leaderPlayerId.slice(0, 8);
        announcement = `${leaderName} took the ${def.name} lead.`;
      }
      continue;
    }
    if (!tracker.holdStartedAt) {
      tracker.holdStartedAt = nowMs;
      delete tracker.holdAnnouncedAt;
      delete tracker.lastRemainingMilestoneHours;
      continue;
    }
    const holdElapsedMs = nowMs - tracker.holdStartedAt;
    const holdRemainingMs = Math.max(0, def.holdDurationSeconds * 1000 - holdElapsedMs);
    if (!tracker.holdAnnouncedAt && holdElapsedMs >= HOLD_START_BROADCAST_DELAY_MS) {
      const leaderName = players.get(leaderPlayerId)?.name ?? leaderPlayerId.slice(0, 8);
      announcement = `${leaderName} has started a ${def.name} victory hold.`;
      tracker.holdAnnouncedAt = nowMs;
      pushStrategicReplayEvent({
        at: nowMs,
        type: "HOLD_START",
        label: `${leaderName} started a ${def.name} hold`,
        playerId: leaderPlayerId,
        playerName: leaderName,
        objectiveId: def.id,
        objectiveName: def.name,
        isBookmark: true
      });
    } else if (tracker.holdAnnouncedAt) {
      for (const milestoneHours of HOLD_REMAINING_BROADCAST_HOURS) {
        if (holdRemainingMs > milestoneHours * 60 * 60_000) continue;
        if (tracker.lastRemainingMilestoneHours !== undefined && tracker.lastRemainingMilestoneHours <= milestoneHours) continue;
        const leaderName = players.get(leaderPlayerId)?.name ?? leaderPlayerId.slice(0, 8);
        announcement = `${leaderName} has ${milestoneHours}h left on ${def.name}.`;
        tracker.lastRemainingMilestoneHours = milestoneHours;
        break;
      }
    }
    if (nowMs - tracker.holdStartedAt < def.holdDurationSeconds * 1000) continue;
    crownSeasonWinner(leaderPlayerId, def);
    crowned = currentSeasonWinner();
    break;
  }
  broadcastVictoryPressureUpdate(crowned ? `${crowned.playerName} was crowned season winner via ${crowned.objectiveName}.` : announcement);
};

const reachableTechs = (player: Player): string[] => {
  const out: string[] = [];
  for (const tech of TECHS) {
    if (!activeSeasonTechConfig.activeNodeIds.has(tech.id)) continue;
    if (player.techIds.has(tech.id)) continue;
    const prereqs = tech.prereqIds && tech.prereqIds.length > 0 ? tech.prereqIds : tech.requires ? [tech.requires] : [];
    if (prereqs.every((req) => player.techIds.has(req))) out.push(tech.id);
  }
  return out;
};

const techDepth = (id: string): number => {
  const seen = new Set<string>();
  const walk = (techId: string): number => {
    if (seen.has(techId)) return 0;
    seen.add(techId);
    const cur = techById.get(techId);
    if (!cur) return 0;
    const parents = cur.prereqIds && cur.prereqIds.length > 0 ? cur.prereqIds : cur.requires ? [cur.requires] : [];
    if (parents.length === 0) return 0;
    return Math.max(...parents.map((p) => walk(p))) + 1;
  };
  return walk(id);
};

const playerWorldFlags = (player: Player): Set<string> => {
  const flags = new Set<string>();
  if (player.Ts >= 8) flags.add("settled_tiles_8");
  if (player.Ts >= 16) flags.add("settled_tiles_16");
  let hasIron = false;
  let hasCrystal = false;
  let hasTown = false;
  let hasDock = false;
  for (const tk of player.territoryTiles) {
    if (ownershipStateByTile.get(tk) !== "SETTLED") continue;
    const [x, y] = parseKey(tk);
    const t = runtimeTileCore(x, y);
    if (t.resource === "IRON") hasIron = true;
    if (t.resource === "GEMS") hasCrystal = true;
    if (docksByTile.has(tk)) hasDock = true;
    const town = townsByTile.get(tk);
    if (town) hasTown = true;
  }
  if (hasIron) flags.add("active_iron_site");
  if (hasCrystal) flags.add("active_crystal_site");
  if (hasTown) flags.add("active_town");
  if (hasDock) flags.add("active_dock");
  return flags;
};

const techRequirements = (tech: (typeof TECHS)[number]): { gold: number; resources: Partial<Record<StrategicResource, number>> } => {
  if (tech.cost) {
    const resources: Partial<Record<StrategicResource, number>> = {};
    const food = tech.cost.food ?? 0;
    const iron = tech.cost.iron ?? 0;
    const crystal = tech.cost.crystal ?? 0;
    const supply = tech.cost.supply ?? 0;
    const shard = tech.cost.shard ?? 0;
    if (food > 0) resources.FOOD = food;
    if (iron > 0) resources.IRON = iron;
    if (crystal > 0) resources.CRYSTAL = crystal;
    if (supply > 0) resources.SUPPLY = supply;
    if (shard > 0) resources.SHARD = shard;
    return { gold: tech.cost.gold ?? 0, resources };
  }
  const depth = techDepth(tech.id);
  const gold = Math.max(15, 12 + depth * 9);
  const resources: Partial<Record<StrategicResource, number>> = {};

  const mods = tech.mods ?? {};
  const offensive = (mods.attack ?? 1) > 1;
  const defensive = (mods.defense ?? 1) > 1;
  const economic = (mods.income ?? 1) > 1;
  const vision = (mods.vision ?? 1) > 1;

  if (offensive) resources.IRON = Math.max(resources.IRON ?? 0, Math.max(0, Math.ceil(depth / 2)));
  if (defensive) resources.SUPPLY = Math.max(resources.SUPPLY ?? 0, Math.max(0, Math.ceil(depth / 3)));
  if (economic) resources.FOOD = Math.max(resources.FOOD ?? 0, Math.max(0, Math.ceil(depth / 2)));
  if (vision) resources.CRYSTAL = Math.max(resources.CRYSTAL ?? 0, Math.max(0, Math.ceil(depth / 2)));
  if (depth >= 6) {
    resources.SHARD = Math.max(resources.SHARD ?? 0, 1);
  }
  return { gold, resources };
};

const techChecklistFor = (
  player: Player,
  tech: (typeof TECHS)[number]
): { ok: boolean; checks: TechRequirementChecklist[]; resources: Partial<Record<StrategicResource, number>>; gold: number } => {
  const req = techRequirements(tech);
  const checks: TechRequirementChecklist[] = [];
  const stocks = getOrInitStrategicStocks(player.id);
  checks.push({ label: `Gold ${req.gold}`, met: player.points >= req.gold });
  for (const [r, amount] of Object.entries(req.resources) as Array<[StrategicResource, number]>) {
    checks.push({ label: `${r} ${amount}`, met: (stocks[r] ?? 0) >= amount });
  }
  return { ok: checks.every((c) => c.met), checks, resources: req.resources, gold: req.gold };
};

const activeTechCatalog = (player?: Player): Array<{
  id: string;
  tier: number;
  name: string;
  researchTimeSeconds?: number;
  rootId?: string;
  requires?: string;
  prereqIds?: string[];
  description: string;
  mods: Partial<Record<StatsModKey, number>>;
  effects?: (typeof TECHS)[number]["effects"];
  requirements: {
    gold: number;
    resources: Partial<Record<StrategicResource, number>>;
    checklist?: TechRequirementChecklist[];
    canResearch?: boolean;
  };
  grantsPowerup?: { id: string; charges: number };
}> => {
  return TECHS.filter((t) => activeSeasonTechConfig.activeNodeIds.has(t.id)).map((t) => {
    const out: {
      id: string;
      tier: number;
      name: string;
      researchTimeSeconds?: number;
      rootId?: string;
      requires?: string;
      prereqIds?: string[];
      description: string;
      mods: Partial<Record<StatsModKey, number>>;
      effects?: (typeof TECHS)[number]["effects"];
      requirements: {
        gold: number;
        resources: Partial<Record<StrategicResource, number>>;
        checklist?: TechRequirementChecklist[];
        canResearch?: boolean;
      };
      grantsPowerup?: { id: string; charges: number };
    } = {
      id: t.id,
      tier: t.tier ?? 0,
      name: t.name,
      description: t.description,
      mods: t.mods ?? {},
      requirements: techRequirements(t)
    };
    if (t.effects) out.effects = { ...t.effects };
    if (t.rootId) out.rootId = t.rootId;
    if (t.requires) out.requires = t.requires;
    if (t.prereqIds && t.prereqIds.length > 0) out.prereqIds = [...t.prereqIds];
    if (t.grantsPowerup) out.grantsPowerup = t.grantsPowerup;
    if (player) {
      const check = techChecklistFor(player, t);
      out.requirements.checklist = check.checks;
      out.requirements.canResearch = check.ok;
    }
    return out;
  });
};

const IRON_DOMAIN_IDS = new Set<string>();
const SUPPLY_DOMAIN_IDS = new Set(["expansion"]);
const FOOD_DOMAIN_IDS = new Set(["urbanization"]);
const CRYSTAL_DOMAIN_IDS = new Set<string>();

const IRON_TECH_IDS = new Set(["masonry", "mining", "bronze-working", "fortified-walls", "siegecraft", "industrial-extraction", "breach-doctrine", "steelworking"]);
const SUPPLY_TECH_IDS = new Set(["toolmaking", "leatherworking", "harborcraft", "logistics", "navigation", "organized-supply", "deep-operations", "terrain-engineering", "imperial-roads", "workshops"]);
const FOOD_TECH_IDS = new Set(["agriculture", "irrigation", "pottery", "banking", "civil-service", "workshops"]);
const CRYSTAL_TECH_IDS = new Set([
  "cartography",
  "signal-fires",
  "surveying",
  "beacon-towers",
  "cryptography",
  "grand-cartography",
  "banking",
  "trade",
  "ledger-keeping",
  "coinage",
  "maritime-trade",
  "port-infrastructure",
  "global-trade-networks",
  "urban-markets",
  "aeronautics",
  "radar",
  "plastics"
]);

const empireStyleFromPlayer = (player: Player): EmpireVisualStyle => {
  const primaryOverlay = player.tileColor ?? colorFromId(player.id);
  let secondaryTint: EmpireVisualStyle["secondaryTint"] = "BALANCED";

  for (const id of player.domainIds) {
    if (IRON_DOMAIN_IDS.has(id)) {
      secondaryTint = "IRON";
      break;
    }
    if (SUPPLY_DOMAIN_IDS.has(id)) {
      secondaryTint = "SUPPLY";
      break;
    }
    if (FOOD_DOMAIN_IDS.has(id)) {
      secondaryTint = "FOOD";
      break;
    }
    if (CRYSTAL_DOMAIN_IDS.has(id)) {
      secondaryTint = "CRYSTAL";
      break;
    }
  }

  if (secondaryTint === "BALANCED") {
    const scores = { IRON: 0, SUPPLY: 0, FOOD: 0, CRYSTAL: 0 } satisfies Record<Exclude<EmpireVisualStyle["secondaryTint"], "BALANCED">, number>;
    for (const id of player.techIds) {
      if (IRON_TECH_IDS.has(id)) scores.IRON += 1;
      if (SUPPLY_TECH_IDS.has(id)) scores.SUPPLY += 1;
      if (FOOD_TECH_IDS.has(id)) scores.FOOD += 1;
      if (CRYSTAL_TECH_IDS.has(id)) scores.CRYSTAL += 1;
    }
    const ranked = (Object.entries(scores) as Array<[Exclude<EmpireVisualStyle["secondaryTint"], "BALANCED">, number]>)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    if ((ranked[0]?.[1] ?? 0) >= 2) secondaryTint = ranked[0]![0];
  }

  const borderStyle: EmpireVisualStyle["borderStyle"] =
    secondaryTint === "IRON" ? "HEAVY" : secondaryTint === "SUPPLY" ? "DASHED" : secondaryTint === "FOOD" ? "SOFT" : secondaryTint === "CRYSTAL" ? "GLOW" : "SHARP";
  const structureAccent: EmpireVisualStyle["structureAccent"] = secondaryTint === "BALANCED" ? "NEUTRAL" : secondaryTint;

  return { primaryOverlay, secondaryTint, borderStyle, structureAccent };
};

const domainCostResources = (
  cost: Partial<Record<"gold" | "food" | "iron" | "supply" | "crystal" | "shard", number>>
): Partial<Record<StrategicResource, number>> => {
  const resources: Partial<Record<StrategicResource, number>> = {};
  if ((cost.food ?? 0) > 0) resources.FOOD = cost.food ?? 0;
  if ((cost.iron ?? 0) > 0) resources.IRON = cost.iron ?? 0;
  if ((cost.supply ?? 0) > 0) resources.SUPPLY = cost.supply ?? 0;
  if ((cost.crystal ?? 0) > 0) resources.CRYSTAL = cost.crystal ?? 0;
  if ((cost.shard ?? 0) > 0) resources.SHARD = cost.shard ?? 0;
  return resources;
};

const chosenDomainTierMax = (player: Player): number => {
  let tier = 0;
  for (const id of player.domainIds) {
    const d = domainById.get(id);
    if (d) tier = Math.max(tier, d.tier);
  }
  return tier;
};

const domainChecklistFor = (
  player: Player,
  domainId: string
): { ok: boolean; checks: DomainRequirementChecklist[]; gold: number; resources: Partial<Record<StrategicResource, number>> } => {
  const d = domainById.get(domainId);
  if (!d) return { ok: false, checks: [{ label: "Domain exists", met: false }], gold: 0, resources: {} };
  const checks: DomainRequirementChecklist[] = [];
  const stocks = getOrInitStrategicStocks(player.id);
  const gold = d.cost.gold ?? 0;
  const resources = domainCostResources(d.cost);
  const tierMax = chosenDomainTierMax(player);
  const pickedThisTier = [...player.domainIds].some((id) => domainById.get(id)?.tier === d.tier);
  checks.push({ label: `Requires tech ${d.requiresTechId}`, met: player.techIds.has(d.requiresTechId) });
  checks.push({ label: `Tier ${d.tier} progression`, met: d.tier <= tierMax + 1 });
  checks.push({ label: `One domain per tier`, met: !pickedThisTier });
  checks.push({ label: `Gold ${gold}`, met: player.points >= gold });
  for (const [r, amount] of Object.entries(resources) as Array<[StrategicResource, number]>) {
    checks.push({ label: `${r} ${amount}`, met: (stocks[r] ?? 0) >= amount });
  }
  return { ok: checks.every((c) => c.met), checks, gold, resources };
};

const reachableDomains = (player: Player): string[] => {
  const tierMax = chosenDomainTierMax(player);
  const targetTier = Math.min(5, tierMax + 1);
  const pickedAtTargetTier = [...player.domainIds].some((id) => domainById.get(id)?.tier === targetTier);
  if (pickedAtTargetTier) return [];
  return DOMAINS.filter((d) => d.tier === targetTier).map((d) => d.id);
};

const activeDomainCatalog = (player?: Player): Array<{
  id: string;
  tier: number;
  name: string;
  description: string;
  requiresTechId: string;
  mods: Partial<Record<StatsModKey, number>>;
  effects?: (typeof DOMAINS)[number]["effects"];
  requirements: {
    gold: number;
    resources: Partial<Record<StrategicResource, number>>;
    checklist?: DomainRequirementChecklist[];
    canResearch?: boolean;
  };
}> => {
  return DOMAINS.map((d) => {
    const out: {
      id: string;
      tier: number;
      name: string;
      description: string;
      requiresTechId: string;
      mods: Partial<Record<StatsModKey, number>>;
      effects?: (typeof DOMAINS)[number]["effects"];
      requirements: {
        gold: number;
        resources: Partial<Record<StrategicResource, number>>;
        checklist?: DomainRequirementChecklist[];
        canResearch?: boolean;
      };
    } = {
      id: d.id,
      tier: d.tier,
      name: d.name,
      description: d.description,
      requiresTechId: d.requiresTechId,
      mods: d.mods ?? {},
      requirements: {
        gold: d.cost.gold ?? 0,
        resources: domainCostResources(d.cost)
      }
    };
    if (d.effects) out.effects = { ...d.effects };
    if (player) {
      const check = domainChecklistFor(player, d.id);
      out.requirements.checklist = check.checks;
      out.requirements.canResearch = check.ok;
    }
    return out;
  });
};

const applyDomain = (player: Player, domainId: string): { ok: boolean; reason?: string } => {
  const d = domainById.get(domainId);
  if (!d) return { ok: false, reason: "domain not found" };
  if (player.domainIds.has(domainId)) return { ok: false, reason: "domain already selected" };
  const check = domainChecklistFor(player, domainId);
  if (!check.ok) {
    const miss = check.checks.find((c) => !c.met);
    return { ok: false, reason: `requirements not met: ${miss?.label ?? "unknown"}` };
  }
  player.points = Math.max(0, player.points - check.gold);
  const stock = getOrInitStrategicStocks(player.id);
  for (const [r, amount] of Object.entries(check.resources) as Array<[StrategicResource, number]>) {
    stock[r] = Math.max(0, stock[r] - amount);
  }
  player.domainIds.add(domainId);
  recomputeTechModsFromOwnedTechs(player);
  telemetryCounters.techUnlocks += 1;
  return { ok: true };
};

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
  sendToPlayer(player.id, {
    type: "TECH_UPDATE",
    status,
    techRootId: player.techRootId,
    currentResearch: player.currentResearch,
    techIds: [...player.techIds],
    mods: player.mods,
    modBreakdown: playerModBreakdown(player),
    incomePerMinute: currentIncomePerMinute(player),
    powerups: player.powerups,
    nextChoices: reachableTechs(player),
    availableTechPicks: availableTechPicks(player),
    missions: missionPayload(player),
    techCatalog: activeTechCatalog(player),
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
    if (fort.ownerId === playerId && fort.status === "under_construction") n += 1;
  }
  for (const observatory of observatoriesByTile.values()) {
    if (observatory.ownerId === playerId && observatory.status === "under_construction") n += 1;
  }
  for (const siege of siegeOutpostsByTile.values()) {
    if (siege.ownerId === playerId && siege.status === "under_construction") n += 1;
  }
  for (const structure of economicStructuresByTile.values()) {
    if (structure.ownerId === playerId && (structure.status === "under_construction" || structure.status === "removing")) n += 1;
  }
  return n;
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

const tryRemoveEconomicStructure = (actor: Player, x: number, y: number): { ok: boolean; reason?: string } => {
  const t = playerTile(x, y);
  const tk = key(t.x, t.y);
  const structure = economicStructuresByTile.get(tk);
  if (!structure || structure.ownerId !== actor.id) return { ok: false, reason: "no owned structure on tile" };
  if (structure.status === "under_construction") return { ok: false, reason: "cancel construction instead" };
  if (structure.status === "removing") return { ok: false, reason: "structure is already being removed" };
  if (t.terrain !== "LAND" || t.ownerId !== actor.id || t.ownershipState !== "SETTLED") return { ok: false, reason: "structure requires settled owned tile" };
  if (!canStartDevelopmentProcess(actor.id)) return { ok: false, reason: developmentSlotsBusyReason(actor.id) };
  structure.previousStatus = structure.status;
  structure.status = "removing";
  structure.completesAt = now() + ECONOMIC_STRUCTURE_REMOVE_MS;
  markSummaryChunkDirtyAtTile(x, y);
  const timer = setTimeout(() => completeEconomicStructureRemoval(tk), ECONOMIC_STRUCTURE_REMOVE_MS);
  economicStructureBuildTimers.set(tk, timer);
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
  if (t.terrain !== "LAND") return { ok: false, reason: "settlement requires land tile" };
  if (t.ownerId !== actor.id) return { ok: false, reason: "tile must be owned" };
  if (t.ownershipState !== "FRONTIER") return { ok: false, reason: "tile is already settled" };
  if (!canAffordGoldCost(actor.points, goldCost)) return { ok: false, reason: "insufficient gold to settle" };
  const tk = key(t.x, t.y);
  if (pendingSettlementsByTile.has(tk)) return { ok: false, reason: "tile already settling" };
  if (combatLocks.has(tk)) return { ok: false, reason: "tile is locked in combat" };
  if (!canStartDevelopmentProcess(actor.id)) return { ok: false, reason: developmentSlotsBusyReason(actor.id) };

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
  if (!playerHasTechIds(actor, ABILITY_DEFS.aether_bridge.requiredTechIds)) return { ok: false, reason: "requires Navigation" };
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

const trySiphonTile = (actor: Player, x: number, y: number): { ok: boolean; reason?: string } => {
  if (!playerHasTechIds(actor, ABILITY_DEFS.siphon.requiredTechIds)) return { ok: false, reason: "requires Cryptography" };
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
  if (t.resource || townsByTile.has(tk) || docksByTile.has(tk)) return { ok: false, reason: "observatory requires empty settled land" };
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
      const ownershipDefenseMult = ownershipDefenseMultiplierForTarget(tile);
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
  if (isRelocatableSettlementTown(townsByTile.get(tk))) return { ok: false, reason: "settlements cannot host structures until they grow into towns" };
  if (fortsByTile.has(tk)) return { ok: false, reason: "tile already fortified" };
  if (siegeOutpostsByTile.has(tk)) return { ok: false, reason: "tile already has siege outpost" };
  if (observatoriesByTile.has(tk) || economicStructuresByTile.has(tk)) return { ok: false, reason: "tile already has structure" };
  const dock = docksByTile.get(tk);
  if (!dock && !isBorderTile(t.x, t.y, actor.id)) return { ok: false, reason: "fort must be on border tile or dock" };
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
  if (isRelocatableSettlementTown(townsByTile.get(tk))) return { ok: false, reason: "settlements cannot host structures until they grow into towns" };
  if (siegeOutpostsByTile.has(tk)) return { ok: false, reason: "tile already has siege outpost" };
  if (fortsByTile.has(tk)) return { ok: false, reason: "tile already has fort" };
  if (observatoriesByTile.has(tk) || economicStructuresByTile.has(tk)) return { ok: false, reason: "tile already has structure" };
  if (!isBorderTile(t.x, t.y, actor.id)) return { ok: false, reason: "siege outpost must be on border tile" };
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
  let displacedSettlement: { ownerId: string; town: Pick<TownDefinition, "townId" | "type"> } | undefined;
  const affectedPlayers = new Set<string>();
  if (oldOwner) affectedPlayers.add(oldOwner);
  if (newOwner) affectedPlayers.add(newOwner);
  for (const n of cardinalNeighborCores(t.x, t.y)) {
    if (n.ownerId) affectedPlayers.add(n.ownerId);
  }

  if (oldOwner && newOwner !== oldOwner) {
    const capturedTown = townsByTile.get(k);
    if (oldOwner !== BARBARIAN_OWNER_ID && isRelocatableSettlementTown(capturedTown)) {
      displacedSettlement = { ownerId: oldOwner, town: { townId: capturedTown.townId, type: capturedTown.type } };
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
      cancelFortBuild(k);
      fortsByTile.delete(k);
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
      if (economic.status === "under_construction") {
        cancelEconomicStructureBuild(k);
      } else if (newOwner) {
        untrackOwnedTileKey(economicStructureTileKeysByPlayer, economic.ownerId, k);
        economic.ownerId = newOwner;
        economic.status = "inactive";
        delete economic.completesAt;
        economic.nextUpkeepAt = now() + ECONOMIC_STRUCTURE_UPKEEP_INTERVAL_MS;
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
      if (economic.status === "under_construction") {
        cancelEconomicStructureBuild(k);
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
    if (oldOwner && newOwner && townsByTile.has(k)) applyTownCaptureShock(k);
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
    const owner = t.ownerId;
    if (owner && owner !== BARBARIAN_OWNER_ID) return false;
    updateOwnership(x, y, p.id, "SETTLED");
    if (!townsByTile.has(key(x, y))) createSettlementAtTile(p.id, key(x, y));
    p.spawnOrigin = key(x, y);
    p.capitalTileKey = key(x, y);
    ensureSpawnShardNearby(x, y);
    sendVisibleTileDeltaAt(x, y);
    p.spawnShieldUntil = now() + 120_000;
    p.isEliminated = false;
    p.respawnPending = false;
    broadcast({ type: "PLAYER_STYLE", playerId: p.id, ...playerStylePayload(p) });
    if (appRef) appRef.log.info({ playerId: p.id, x, y }, "spawned player");
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

  if (appRef) appRef.log.error({ playerId: p.id }, "failed to find any land tile for spawn");
  else console.error("failed to find any land tile for spawn", { playerId: p.id });
};

const serializePlayer = (p: Player) => ({
  ...p,
  techIds: [...p.techIds],
  domainIds: [...p.domainIds],
  territoryTiles: [...p.territoryTiles],
  allies: [...p.allies]
});

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
  const first = p.spawnOrigin ?? [...p.territoryTiles][0];
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
      lastActiveAt: now()
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
    ...(snapshot.abilityCooldowns ? { abilityCooldowns: snapshot.abilityCooldowns } : {})
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
  const snapshot = buildSnapshotState();
  const sections = splitSnapshotState(snapshot);
  const serializedSections = {
    meta: JSON.stringify(sections.meta),
    players: JSON.stringify(sections.players),
    territory: JSON.stringify(sections.territory),
    economy: JSON.stringify(sections.economy),
    systems: JSON.stringify(sections.systems)
  };
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
    });
  return snapshotSavePromise;
};

const saveSnapshotInBackground = (): void => {
  void saveSnapshot().catch((err) => {
    logRuntimeError("snapshot save failed", err);
  });
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
  if (appRef) {
    appRef.log.info(
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
  const logHydratePhase = (phase: string, extra: Record<string, number> = {}): void => {
    if (!appRef) {
      phaseStartedAt = Date.now();
      return;
    }
    const nowMs = Date.now();
    appRef.log.info(
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
  cachedSummaryChunkByChunkKey.clear();
  summaryChunkVersionByChunkKey.clear();
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
    economicStructuresByTile.set(structure.tileKey, normalized);
    trackOwnedTileKey(economicStructureTileKeysByPlayer, structure.ownerId, structure.tileKey);
  }
  for (const sabotage of raw.sabotage ?? []) siphonByTile.set(sabotage.targetTileKey, sabotage);
  for (const [pid, entries] of raw.abilityCooldowns ?? []) {
    abilityCooldownsByPlayer.set(pid, new Map(entries));
  }
  logHydratePhase("systems_structures", {
    forts: raw.forts?.length ?? 0,
    observatories: raw.observatories?.length ?? 0,
    siegeOutposts: raw.siegeOutposts?.length ?? 0,
    economicStructures: raw.economicStructures?.length ?? 0
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
      techIds: new Set(p.techIds),
      domainIds: new Set(p.domainIds ?? []),
      territoryTiles: new Set(p.territoryTiles),
      allies: new Set(p.allies),
      missions: p.missions ?? [],
      missionStats: p.missionStats ?? defaultMissionStats()
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

const bootstrapRuntimeState = (): void => {
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
  if (shardSitesByTile.size === 0) {
    generateShardCaches(activeSeason.worldSeed);
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
    if (fort.status !== "under_construction") continue;
    const remaining = fort.completesAt - now();
    if (remaining <= 0) {
      fort.status = "active";
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
      fortBuildTimers.delete(tk);
      updateOwnership(fx, fy, live.ownerId);
    }, remaining);
    fortBuildTimers.set(tk, timer);
  }
  for (const [tk, observatory] of observatoriesByTile.entries()) {
    if (observatory.status !== "under_construction" || observatory.completesAt === undefined) continue;
    const remaining = observatory.completesAt - now();
    if (remaining <= 0) {
      observatory.status = "active";
      delete observatory.completesAt;
      continue;
    }
    scheduleObservatoryConstruction(tk, remaining);
  }
  for (const [tk, siege] of siegeOutpostsByTile.entries()) {
    if (siege.status !== "under_construction") continue;
    const remaining = siege.completesAt - now();
    if (remaining <= 0) {
      siege.status = "active";
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
};
const runtimeIntervals: NodeJS.Timeout[] = [];
const registerInterval = (fn: () => void, ms: number): void => {
  runtimeIntervals.push(
    setInterval(() => {
      if (!startupState.ready) return;
      fn();
    }, ms)
  );
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
registerInterval(() => {
  const vitals = sampleRuntimeVitals();
  recentRuntimeVitals.push(vitals);
  const cachePayloads = cachedChunkPayloadDiagnostics();
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
    if (now() - p.lastActiveAt > OFFLINE_YIELD_ACCUM_MAX_MS) {
      continue;
    }
    applyStaminaRegen(p);
    applyManpowerRegen(p);
    recomputeTownNetworkForPlayer(p.id);
    const populationTouched = updateTownPopulationForPlayer(p);
    const economicTouched = syncEconomicStructuresForPlayer(p);
    const economyIndex = getOrInitEconomyIndex(p.id);
    for (const tk of economyIndex.settledResourceTileKeys) {
      const [x, y] = parseKey(tk);
      const resource = applyClusterResources(x, y, resourceAt(x, y));
      if (!resource) continue;
      const siphon = activeSiphonAt(tk);
      const ownerMult = siphon ? 1 - SIPHON_SHARE : 1;
      const goldBase = (resourceRate[resource] ?? 0) * p.mods.income * PASSIVE_INCOME_MULT * HARVEST_GOLD_RATE_MULT;
      const goldDelta = goldBase * ownerMult;
      const strategic: Partial<Record<StrategicResource, number>> = {};
      const sr = toStrategicResource(resource);
      if (sr) {
        strategic[sr] =
          (strategicDailyFromResource[resource] ?? 0) * activeResourceIncomeMult(p.id, resource) * HARVEST_RESOURCE_RATE_MULT * ownerMult;
      }
      if (siphon) {
        const siphonedStrategic: Partial<Record<StrategicResource, number>> = {};
        if (sr) {
          siphonedStrategic[sr] =
            (strategicDailyFromResource[resource] ?? 0) * activeResourceIncomeMult(p.id, resource) * HARVEST_RESOURCE_RATE_MULT * SIPHON_SHARE;
        }
        addToSiphonCache(siphon.casterPlayerId, tk, goldBase * SIPHON_SHARE, siphonedStrategic, siphon.endsAt);
      }
      if (goldDelta > 0 || hasPositiveStrategicBuffer(strategic)) addTileYield(tk, goldDelta, strategic);
    }
    for (const tk of economyIndex.settledDockTileKeys) {
      const dock = docksByTile.get(tk);
      if (!dock) continue;
      const goldDelta = dockIncomeForOwner(dock, p.id) * p.mods.income * PASSIVE_INCOME_MULT * HARVEST_GOLD_RATE_MULT;
      if (goldDelta > 0) addTileYield(tk, goldDelta, undefined);
    }
    for (const tk of economyIndex.settledTownTileKeys) {
      const town = townsByTile.get(tk);
      if (!town) continue;
      const siphon = activeSiphonAt(tk);
      const ownerMult = siphon ? 1 - SIPHON_SHARE : 1;
      const townGoldBase = townIncomeForOwner(town, p.id) * p.mods.income * PASSIVE_INCOME_MULT * HARVEST_GOLD_RATE_MULT;
      const goldDelta = townGoldBase * ownerMult;
      if (siphon) {
        addToSiphonCache(
          siphon.casterPlayerId,
          tk,
          townGoldBase * SIPHON_SHARE,
          {},
          siphon.endsAt
        );
      }
      if (goldDelta > 0) addTileYield(tk, goldDelta, undefined);
    }
    for (const tk of economicStructureTileKeysByPlayer.get(p.id) ?? []) {
      const structure = economicStructuresByTile.get(tk);
      if (!structure || structure.ownerId !== p.id || structure.status !== "active") continue;
      const strategicDaily = converterStructureOutputFor(structure.type);
      if (!strategicDaily) continue;
      const strategic: Partial<Record<StrategicResource, number>> = {};
      for (const [resource, amount] of Object.entries(strategicDaily) as Array<[StrategicResource, number]>) {
        strategic[resource] = amount * HARVEST_RESOURCE_RATE_MULT;
      }
      if (hasPositiveStrategicBuffer(strategic)) addTileYield(tk, 0, strategic);
    }
    const upkeepResult = applyUpkeepForPlayer(p);
    const touchedTileKeys = new Set<TileKey>([...populationTouched, ...economicTouched, ...upkeepResult.touchedTileKeys]);
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
      pendingAuthVerifications,
      runtimeIntervals: runtimeIntervals.length,
      humanSimulationQueueDepth: simulationCommandWorkerState.humanQueue.length,
      systemSimulationQueueDepth: simulationCommandWorkerState.systemQueue.length,
      aiSimulationQueueDepth: simulationCommandWorkerState.aiQueue.length,
      aiQueueDepth: aiWorkerState.queue.length,
      aiPlannerPending: aiPlannerWorkerState.pending,
      combatWorkerPending: combatWorkerState.pending,
      chunkSerializerPending: chunkSerializerWorkerState.pending,
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
      ...(chunkSerializerWorkerState.lastFallbackReason ? { chunkSerializerLastFallbackReason: chunkSerializerWorkerState.lastFallbackReason } : {})
    },
    aiScheduler: {
      dispatchIntervalMs: AI_DISPATCH_INTERVAL_MS,
      targetCadenceMs: AI_TICK_MS,
      ...aiSchedulerState
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
            \${renderHotspotBlock("Chunk snapshot generation", data.hotspots.chunkSnapshots, \`
              <div class="muted" style="margin-top:8px">Largest recent snapshot: \${fmt(data.hotspots.chunkSnapshots.maxChunks)} chunks / \${fmt(data.hotspots.chunkSnapshots.maxTiles)} tiles</div>
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
appRef = app;
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
app.get("/admin/runtime/debug", async () => runtimeDashboardPayload());
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
      authPriorityUntil = Math.max(authPriorityUntil, now() + AUTH_PRIORITY_WINDOW_MS);
      let decoded = cachedFirebaseIdentityForToken(msg.token);
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
        if (!decoded) decoded = cachedFirebaseIdentityForToken(msg.token);
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
      app.log.info(
        {
          playerId: player.id,
          uid: decoded.uid,
          cachedToken: Boolean(cachedFirebaseIdentityForToken(msg.token)),
          verifyElapsedMs: verifiedAt - authStartedAt
        },
        "auth verified"
      );

      authedPlayer = player;
      socketsByPlayer.set(player.id, socket);
      resumeVictoryPressureTimers();
      const strategicStocks = getOrInitStrategicStocks(player.id);
      const strategicProduction = strategicProductionPerMinute(player);
      const dockPairs = exportDockPairs();
      completeDueResearchForPlayer(player);
      applyManpowerRegen(player);
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
            incomePerMinute: currentIncomePerMinute(player),
            strategicResources: strategicStocks,
            strategicProductionPerMinute: strategicProduction,
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
          techChoices: reachableTechs(player),
          techCatalog: activeTechCatalog(player),
          domainChoices: reachableDomains(player),
          domainCatalog: activeDomainCatalog(player),
          playerStyles: exportPlayerStyles(),
          missions: missionPayload(player),
          leaderboard: currentLeaderboardSnapshot(),
          seasonVictory: currentVictoryPressureObjectives(),
          seasonWinner,
          allianceRequests: [...allianceRequests.values()].filter((r) => r.toPlayerId === player.id),
          truceRequests: [...truceRequests.values()].filter((r) => r.toPlayerId === player.id)
        })
      );
      const authSync = authSyncTimingByPlayer.get(player.id);
      if (authSync) {
        authSync.initSentAt = now();
        app.log.info(
          {
            playerId: player.id,
            sinceAuthVerifiedMs: authSync.initSentAt - (authSync.authVerifiedAt ?? authSync.initSentAt)
          },
          "auth sync init sent"
        );
      }
      return;
    }

    if (!authedPlayer) {
      socket.send(JSON.stringify({ type: "ERROR", code: "NO_AUTH", message: "auth first" }));
      return;
    }
    const actor = authedPlayer;
    if (await executeUnifiedGameplayMessage(actor, msg, socket)) return;

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
      const structure = economicStructuresByTile.get(tk);
      if (!structure || structure.ownerId !== actor.id || (structure.status !== "under_construction" && structure.status !== "removing")) {
        socket.send(JSON.stringify({ type: "ERROR", code: "STRUCTURE_CANCEL_INVALID", message: "no removable structure action on tile" }));
        return;
      }
      cancelEconomicStructureBuild(tk);
      updateOwnership(msg.x, msg.y, actor.id);
      return;
    }

    if (msg.type === "REMOVE_ECONOMIC_STRUCTURE") {
      const out = tryRemoveEconomicStructure(actor, msg.x, msg.y);
      if (!out.ok) {
        socket.send(JSON.stringify({ type: "ERROR", code: "ECONOMIC_STRUCTURE_REMOVE_INVALID", message: out.reason }));
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
      chunkSubscriptionByPlayer.set(actor.id, sub);
      const authSync = authSyncTimingByPlayer.get(actor.id);
      if (authSync && authSync.firstSubscribeAt === undefined) {
        authSync.firstSubscribeAt = now();
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
      }
      const last = chunkSnapshotSentAtByPlayer.get(actor.id);
      if (last && last.cx === sub.cx && last.cy === sub.cy && last.radius === sub.radius && now() - last.sentAt < 2500) {
        return;
      }
      if (authSync && authSync.firstChunkSentAt === undefined && sub.radius > INITIAL_CHUNK_BOOTSTRAP_RADIUS) {
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
      if (to.terrain !== "LAND") {
        sendInvalid("target is barrier");
        return;
      }
      if (combatLocks.has(fk) || combatLocks.has(tk)) {
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
      const ownershipDefenseMult = ownershipDefenseMultiplierForTarget(to);
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
    const preTk = key(to.x, to.y);
    if (msg.type === "EXPAND" && to.ownerId) {
      app.log.info({ playerId: actor.id, to: preTk, ownerId: to.ownerId }, "action rejected: expand target owned");
      socket.send(JSON.stringify({ type: "ERROR", code: "EXPAND_TARGET_OWNED", message: "expand only targets neutral land" }));
      return;
    }
    if (isBreakthroughAttack && !to.ownerId) {
      app.log.info({ playerId: actor.id, to: preTk }, "action rejected: breakthrough target not enemy");
      socket.send(JSON.stringify({ type: "ERROR", code: "BREAKTHROUGH_TARGET_INVALID", message: "breakthrough requires enemy tile" }));
      return;
    }
    if (isBreakthroughAttack && !actor.techIds.has(BREAKTHROUGH_REQUIRED_TECH_ID)) {
      socket.send(JSON.stringify({ type: "ERROR", code: "BREAKTHROUGH_TARGET_INVALID", message: "requires Breach Doctrine" }));
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
    if (!adjacent && !dockCrossing && !bridgeCrossing) {
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
      app.log.info({ playerId: actor.id, from: fk, fromOwner: from.ownerId }, "action rejected: origin not owned");
      socket.send(JSON.stringify({ type: "ERROR", code: "NOT_OWNER", message: "origin not owned" }));
      return;
    }

    if (to.terrain !== "LAND") {
      app.log.info({ playerId: actor.id, to: tk, terrain: to.terrain }, "action rejected: barrier target");
      socket.send(JSON.stringify({ type: "ERROR", code: "BARRIER", message: "target is barrier" }));
      return;
    }

    if (combatLocks.has(fk) || combatLocks.has(tk)) {
      app.log.info({ playerId: actor.id, from: fk, to: tk }, "action rejected: combat lock");
      socket.send(JSON.stringify({ type: "ERROR", code: "LOCKED", message: "tile locked in combat" }));
      return;
    }

    const defenderIsBarbarian = to.ownerId === BARBARIAN_OWNER_ID;
    const defender = to.ownerId && !defenderIsBarbarian ? players.get(to.ownerId) : undefined;
    if (defender && (actor.allies.has(defender.id) || truceBlocksHostility(actor.id, defender.id))) {
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
      const ownershipDefenseMult = ownershipDefenseMultiplierForTarget(to);
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
    combatLocks.set(fk, pending);
    combatLocks.set(tk, pending);
    app.log.info({ playerId: actor.id, action: msg.type, from: fk, to: tk, resolvesAt }, "action accepted");
    logExpandTrace("queued", pending);
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
            levelDelta: 0
          })
        );
        logExpandTrace("combat_result_sent", pending, { neutralTarget: true });
        sendPlayerUpdate(actor, 0);
        sendLocalVisionDeltaForPlayer(actor.id, [{ x: to.x, y: to.y }]);
        logExpandTrace("vision_delta_sent", pending, { centers: 1, neutralTarget: true });
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
            barbarianAgent.x = from.x;
            barbarianAgent.y = from.y;
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
      sendPlayerUpdate(actor, 0);
      if (defender && !defenderIsBarbarian) sendPlayerUpdate(defender, 0);
      const changedCenters = resultChanges.map((change) => ({ x: change.x, y: change.y }));
      sendLocalVisionDeltaForPlayer(actor.id, changedCenters);
      logExpandTrace("vision_delta_sent", pending, { centers: changedCenters.length, targetPlayer: actor.id });
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
  bootstrapRuntimeState();
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
