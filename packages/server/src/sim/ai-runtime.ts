import type { Player } from "@border-empires/shared";

import { createAiScheduler, type AiSchedulerState } from "../ai/scheduler.js";

type RuntimeVitalsSample = {
  eventLoopDelayP95Ms: number;
  eventLoopUtilizationPercent: number;
};

type RuntimeMemoryStats = {
  rssMb: number;
  heapUsedMb: number;
  heapTotalMb: number;
  externalMb: number;
  arrayBuffersMb: number;
};

export type CachedAiCompetitionContext<TCompetitionMetric, TAnalysis> = {
  computedAt: number;
  competitionMetrics: TCompetitionMetric[];
  incomeByPlayerId: Map<string, number>;
  townsTarget: number;
  settledTilesTarget: number;
  analysisByPlayerId: Map<string, TAnalysis>;
};

type SchedulerAiCompetitionContext<TCompetitionMetric, TAnalysis> = Omit<
  CachedAiCompetitionContext<TCompetitionMetric, TAnalysis>,
  "computedAt"
>;

type CreateAiRuntimeDeps<TPlayer extends Player, TCompetitionMetric, TAnalysis, TTickContext> = {
  config: {
    tickMs: number;
    dispatchIntervalMs: number;
    idleDispatchIntervalMs: number;
    tickBatchSize: number;
    humanPriorityBatchSize: number;
    humanDefenseBatchSize: number;
    authPriorityBatchSize: number;
    defensePriorityMs: number;
    workerQueueSoftLimit: number;
    simulationQueueSoftLimit: number;
    eventLoopP95SoftLimitMs: number;
    eventLoopUtilizationSoftLimitPct: number;
  };
  now: () => number;
  contextTtlMs: number;
  getAllPlayers: () => TPlayer[];
  onlineHumanPlayerCount: () => number;
  latestRuntimeVitalsSample: () => RuntimeVitalsSample | undefined;
  pendingAuthVerifications: () => number;
  authPriorityUntil: () => number;
  aiQueueDepth: () => number;
  simulationQueueDepth: () => number;
  humanChunkSnapshotPriorityActive: () => boolean;
  collectCompetitionMetrics: (nowMs: number) => TCompetitionMetric[];
  incomeForMetric: (metric: TCompetitionMetric) => number;
  playerIdForMetric: (metric: TCompetitionMetric) => string;
  computeTargets: () => { townsTarget: number; settledTilesTarget: number };
  createTickContext: (cycleId: number, context: SchedulerAiCompetitionContext<TCompetitionMetric, TAnalysis>) => TTickContext;
  enqueueAiWorkerJob: (job: { actor: TPlayer; tickContext: TTickContext; onComplete: (elapsedMs: number) => void }) => void;
  runtimeMemoryStats: () => RuntimeMemoryStats;
  pushAiTickPerf: (sample: { at: number; elapsedMs: number; aiPlayers: number; rssMb: number; heapUsedMb: number }) => void;
  onSlowAiTick: (event: {
    elapsedMs: number;
    wallElapsedMs: number;
    aiPlayers: number;
    totalAiPlayers: number;
    queueDepth: number;
    cycleId: number;
    memory: RuntimeMemoryStats;
  }) => void;
};

export const createAiRuntime = <
  TPlayer extends Player,
  TCompetitionMetric,
  TAnalysis,
  TTickContext
>(
  deps: CreateAiRuntimeDeps<TPlayer, TCompetitionMetric, TAnalysis, TTickContext>
): {
  state: AiSchedulerState;
  runAiTick: () => void;
  markAiDefensePriority: (playerId: string, durationMs?: number) => void;
  clearPlayer: (playerId: string) => void;
  getCompetitionContext: (nowMs?: number) => CachedAiCompetitionContext<TCompetitionMetric, TAnalysis>;
  clearCompetitionContext: () => void;
} => {
  let cachedCompetitionContext: CachedAiCompetitionContext<TCompetitionMetric, TAnalysis> | undefined;

  const getCompetitionContext = (nowMs = deps.now()): CachedAiCompetitionContext<TCompetitionMetric, TAnalysis> => {
    if (cachedCompetitionContext && nowMs - cachedCompetitionContext.computedAt <= deps.contextTtlMs) {
      return cachedCompetitionContext;
    }
    const competitionMetrics = deps.collectCompetitionMetrics(nowMs);
    const targets = deps.computeTargets();
    const context: CachedAiCompetitionContext<TCompetitionMetric, TAnalysis> = {
      computedAt: nowMs,
      competitionMetrics,
      incomeByPlayerId: new Map(competitionMetrics.map((metric) => [deps.playerIdForMetric(metric), deps.incomeForMetric(metric)])),
      townsTarget: targets.townsTarget,
      settledTilesTarget: targets.settledTilesTarget,
      analysisByPlayerId: new Map<string, TAnalysis>()
    };
    cachedCompetitionContext = context;
    return context;
  };

  const scheduler = createAiScheduler<TPlayer, TCompetitionMetric, TAnalysis, TTickContext>({
    config: deps.config,
    now: deps.now,
    getAllPlayers: deps.getAllPlayers,
    onlineHumanPlayerCount: deps.onlineHumanPlayerCount,
    latestRuntimeVitalsSample: deps.latestRuntimeVitalsSample,
    pendingAuthVerifications: deps.pendingAuthVerifications,
    authPriorityUntil: deps.authPriorityUntil,
    aiQueueDepth: deps.aiQueueDepth,
    simulationQueueDepth: deps.simulationQueueDepth,
    humanChunkSnapshotPriorityActive: deps.humanChunkSnapshotPriorityActive,
    getAiCompetitionContext: getCompetitionContext,
    createTickContext: deps.createTickContext,
    enqueueAiWorkerJob: deps.enqueueAiWorkerJob,
    runtimeMemoryStats: deps.runtimeMemoryStats,
    pushAiTickPerf: deps.pushAiTickPerf,
    onSlowAiTick: deps.onSlowAiTick
  });

  return {
    state: scheduler.state,
    runAiTick: scheduler.runAiTick,
    markAiDefensePriority: scheduler.markAiDefensePriority,
    clearPlayer: (playerId) => {
      scheduler.clearPlayer(playerId);
    },
    getCompetitionContext,
    clearCompetitionContext: () => {
      cachedCompetitionContext = undefined;
    }
  };
};
