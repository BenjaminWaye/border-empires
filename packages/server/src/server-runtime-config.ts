import type { FastifyInstance } from "fastify";
import { MANPOWER_BASE_CAP } from "@border-empires/shared";
import path from "node:path";
import os from "node:os";
import { monitorEventLoopDelay, performance } from "node:perf_hooks";

export const PORT = Number(process.env.PORT ?? 3001);
export const DISABLE_FOG = process.env.DISABLE_FOG === "1";
export const AI_PLAYERS = Number(process.env.AI_PLAYERS ?? 40);
export const DEBUG_SPAWN_NEAR_AI = process.env.DEBUG_SPAWN_NEAR_AI === "1";
export const STARTING_MANPOWER = Math.max(MANPOWER_BASE_CAP, Number(process.env.STARTING_MANPOWER ?? MANPOWER_BASE_CAP));
export const AI_TICK_MS = Number(process.env.AI_TICK_MS ?? 3_000);
export const AI_DISPATCH_INTERVAL_MS = Math.max(100, Number(process.env.AI_DISPATCH_INTERVAL_MS ?? 250));
export const AI_TICK_BATCH_SIZE = Math.max(1, Number(process.env.AI_TICK_BATCH_SIZE ?? 1));
export const AI_TICK_BUDGET_MS = Math.max(250, Number(process.env.AI_TICK_BUDGET_MS ?? 1_000));
export const AI_FRONTIER_SELECTOR_BUDGET_MS = Math.max(
  50,
  Number(process.env.AI_FRONTIER_SELECTOR_BUDGET_MS ?? Math.max(150, Math.floor(AI_TICK_BUDGET_MS / 4)))
);
export const AI_HUMAN_PRIORITY_BATCH_SIZE = Math.max(1, Number(process.env.AI_HUMAN_PRIORITY_BATCH_SIZE ?? 1));
export const AI_HUMAN_DEFENSE_BATCH_SIZE = Math.max(
  AI_HUMAN_PRIORITY_BATCH_SIZE,
  Number(process.env.AI_HUMAN_DEFENSE_BATCH_SIZE ?? Math.max(2, AI_HUMAN_PRIORITY_BATCH_SIZE))
);
export const AI_AUTH_PRIORITY_BATCH_SIZE = Math.max(1, Number(process.env.AI_AUTH_PRIORITY_BATCH_SIZE ?? AI_HUMAN_PRIORITY_BATCH_SIZE));
export const AI_DEFENSE_PRIORITY_MS = Math.max(2_000, Number(process.env.AI_DEFENSE_PRIORITY_MS ?? 15_000));
export const AI_WORKER_QUEUE_SOFT_LIMIT = Math.max(1, Number(process.env.AI_WORKER_QUEUE_SOFT_LIMIT ?? AI_TICK_BATCH_SIZE * 2));
export const AI_SIM_QUEUE_SOFT_LIMIT = Math.max(1, Number(process.env.AI_SIM_QUEUE_SOFT_LIMIT ?? AI_TICK_BATCH_SIZE * 3));
export const AI_EVENT_LOOP_P95_SOFT_LIMIT_MS = Math.max(10, Number(process.env.AI_EVENT_LOOP_P95_SOFT_LIMIT_MS ?? 60));
export const AI_EVENT_LOOP_UTILIZATION_SOFT_LIMIT_PCT = Math.max(5, Number(process.env.AI_EVENT_LOOP_UTILIZATION_SOFT_LIMIT_PCT ?? 65));
export const AI_COMPETITION_CONTEXT_TTL_MS = Math.max(250, Number(process.env.AI_COMPETITION_CONTEXT_TTL_MS ?? 2_000));
export const AI_YIELD_COLLECTION_INTERVAL_MS = Math.max(250, Number(process.env.AI_YIELD_COLLECTION_INTERVAL_MS ?? 2_000));
export const AI_PLANNER_WORKER_ENABLED = process.env.AI_PLANNER_WORKER !== "0";
export const AI_PLANNER_TIMEOUT_MS = Math.max(50, Number(process.env.AI_PLANNER_TIMEOUT_MS ?? 750));
export const SIM_COMBAT_WORKER_ENABLED = process.env.SIM_COMBAT_WORKER !== "0";
export const SIM_COMBAT_TIMEOUT_MS = Math.max(50, Number(process.env.SIM_COMBAT_TIMEOUT_MS ?? 750));
export const CHUNK_SERIALIZER_WORKER_ENABLED = process.env.CHUNK_SERIALIZER_WORKER !== "0";
export const CHUNK_SERIALIZER_TIMEOUT_MS = Math.max(50, Number(process.env.CHUNK_SERIALIZER_TIMEOUT_MS ?? 750));
export const CHUNK_READ_WORKER_ENABLED = process.env.CHUNK_READ_WORKER !== "0";
export const SIM_DRAIN_BUDGET_MS = Math.max(4, Number(process.env.SIM_DRAIN_BUDGET_MS ?? 12));
export const SIM_DRAIN_MAX_COMMANDS = Math.max(1, Number(process.env.SIM_DRAIN_MAX_COMMANDS ?? 8));
export const SIM_DRAIN_HUMAN_QUOTA = Math.max(1, Number(process.env.SIM_DRAIN_HUMAN_QUOTA ?? 6));
export const SIM_DRAIN_SYSTEM_QUOTA = Math.max(1, Number(process.env.SIM_DRAIN_SYSTEM_QUOTA ?? 2));
export const SIM_DRAIN_AI_QUOTA = Math.max(1, Number(process.env.SIM_DRAIN_AI_QUOTA ?? 2));
export const MAX_SUBSCRIBE_RADIUS = Number(process.env.MAX_SUBSCRIBE_RADIUS ?? 2);
export const CHUNK_STREAM_BATCH_SIZE = Math.max(1, Number(process.env.CHUNK_STREAM_BATCH_SIZE ?? 2));
export const FOG_ADMIN_EMAIL = "bw199005@gmail.com";
export const SNAPSHOT_DIR = path.resolve(process.env.SNAPSHOT_DIR ?? path.join(process.cwd(), "snapshots"));
export const SNAPSHOT_FILE = path.join(SNAPSHOT_DIR, "state.json");
export const SNAPSHOT_INDEX_FILE = path.join(SNAPSHOT_DIR, "state.index.json");
export const SNAPSHOT_SECTION_FILES = {
  meta: "state.meta.json",
  players: "state.players.json",
  territory: "state.territory.json",
  economy: "state.economy.json",
  systems: "state.systems.json"
} as const;
export const snapshotSectionFile = (name: keyof typeof SNAPSHOT_SECTION_FILES): string => path.join(SNAPSHOT_DIR, SNAPSHOT_SECTION_FILES[name]);

export const runtimeState: {
  appRef?: FastifyInstance;
} = {};

export const startupState: {
  ready: boolean;
  startedAt: number;
  completedAt?: number;
  currentPhase?: string;
} = {
  ready: false,
  startedAt: Date.now()
};

export const logRuntimeError = (message: string, err: unknown): void => {
  if (runtimeState.appRef) {
    runtimeState.appRef.log.error({ err }, message);
    return;
  }
  console.error(message, err);
};

export const perfRing = <T>(limit: number): { push: (value: T) => void; values: () => T[] } => {
  const entries: T[] = [];
  return {
    push: (value: T): void => {
      entries.push(value);
      if (entries.length > limit) entries.shift();
    },
    values: (): T[] => [...entries]
  };
};

export const roundTo = (value: number, digits = 1): number => {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
};

export const percentile = (values: number[], ratio: number): number => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index] ?? 0;
};

export const runtimeMemoryStats = (): {
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

export const runtimeCpuCount = Math.max(1, typeof os.availableParallelism === "function" ? os.availableParallelism() : os.cpus().length);
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

export const sampleRuntimeVitals = (): {
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

export type Ws = import("ws").WebSocket;
export const NOOP_WS = { send: () => undefined, readyState: 1, OPEN: 1 } as unknown as Ws;

export const logStartupPhase = (phase: string, startedAt: number, extra?: Record<string, unknown>): void => {
  startupState.currentPhase = phase;
  const elapsedMs = Date.now() - startedAt;
  if (runtimeState.appRef) {
    runtimeState.appRef.log.info({ phase, elapsedMs, startupElapsedMs: Date.now() - startupState.startedAt, ...extra }, "startup phase");
    return;
  }
  console.log("startup phase", { phase, elapsedMs, startupElapsedMs: Date.now() - startupState.startedAt, ...extra });
};
