import type { Player } from "@border-empires/shared";

export type AiSchedulerState = {
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
};

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

type AiTickPerfSample = {
  at: number;
  elapsedMs: number;
  aiPlayers: number;
  rssMb: number;
  heapUsedMb: number;
};

type AiCompetitionContext<TCompetitionMetric, TAnalysis> = {
  competitionMetrics: TCompetitionMetric[];
  incomeByPlayerId: Map<string, number>;
  townsTarget: number;
  settledTilesTarget: number;
  analysisByPlayerId: Map<string, TAnalysis>;
};

type AiWorkerJob<TPlayer extends Player, TTickContext> = {
  actor: TPlayer;
  tickContext: TTickContext;
  onComplete: (elapsedMs: number) => void;
};

type AiSchedulerConfig = {
  tickMs: number;
  dispatchIntervalMs: number;
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

type CreateAiSchedulerDeps<TPlayer extends Player, TCompetitionMetric, TAnalysis, TTickContext> = {
  config: AiSchedulerConfig;
  now: () => number;
  getAllPlayers: () => TPlayer[];
  onlineHumanPlayerCount: () => number;
  latestRuntimeVitalsSample: () => RuntimeVitalsSample | undefined;
  pendingAuthVerifications: () => number;
  authPriorityUntil: () => number;
  aiQueueDepth: () => number;
  simulationQueueDepth: () => number;
  humanChunkSnapshotPriorityActive: () => boolean;
  getAiCompetitionContext: (nowMs: number) => AiCompetitionContext<TCompetitionMetric, TAnalysis>;
  createTickContext: (cycleId: number, context: AiCompetitionContext<TCompetitionMetric, TAnalysis>) => TTickContext;
  enqueueAiWorkerJob: (job: AiWorkerJob<TPlayer, TTickContext>) => void;
  runtimeMemoryStats: () => RuntimeMemoryStats;
  pushAiTickPerf: (sample: AiTickPerfSample) => void;
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

export const createAiScheduler = <
  TPlayer extends Player,
  TCompetitionMetric,
  TAnalysis,
  TTickContext
>(
  deps: CreateAiSchedulerDeps<TPlayer, TCompetitionMetric, TAnalysis, TTickContext>
): {
  state: AiSchedulerState;
  runAiTick: () => void;
  markAiDefensePriority: (playerId: string, durationMs?: number) => void;
  clearPlayer: (playerId: string) => void;
} => {
  let roundRobinOffset = 0;
  let cycleCounter = 0;
  const nextDueAtByPlayer = new Map<string, number>();
  const turnsInFlight = new Set<string>();
  const defensePriorityUntilByPlayer = new Map<string, number>();

  const state: AiSchedulerState = {
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

  const markAiDefensePriority = (playerId: string, durationMs = deps.config.defensePriorityMs): void => {
    const player = deps.getAllPlayers().find((candidate) => candidate.id === playerId);
    if (!player?.isAi) return;
    defensePriorityUntilByPlayer.set(playerId, deps.now() + durationMs);
  };

  const hasDefensePriority = (playerId: string, nowMs = deps.now()): boolean => {
    const expiresAt = defensePriorityUntilByPlayer.get(playerId);
    if (!expiresAt) return false;
    if (expiresAt <= nowMs) {
      defensePriorityUntilByPlayer.delete(playerId);
      return false;
    }
    return true;
  };

  const defensePriorityCount = (aiPlayers: readonly TPlayer[], nowMs = deps.now()): number => {
    let count = 0;
    for (const actor of aiPlayers) {
      if (hasDefensePriority(actor.id, nowMs)) count += 1;
    }
    return count;
  };

  const ensureDueAt = (playerId: string, nowMs = deps.now()): number => {
    const dueAt = nextDueAtByPlayer.get(playerId);
    if (dueAt !== undefined) return dueAt;
    nextDueAtByPlayer.set(playerId, nowMs);
    return nowMs;
  };

  const scheduleNextTurn = (playerId: string, nowMs = deps.now()): void => {
    nextDueAtByPlayer.set(playerId, nowMs + deps.config.tickMs);
  };

  const chooseBatchSize = (aiPlayers: readonly TPlayer[]): number => {
    if (aiPlayers.length <= 0) return 0;
    const vitals = deps.latestRuntimeVitalsSample();
    const humanPlayersOnline = deps.onlineHumanPlayerCount() > 0;
    const nowMs = deps.now();
    const urgentAiCount = defensePriorityCount(aiPlayers, nowMs);
    const authPriorityActive = deps.pendingAuthVerifications() > 0 || deps.authPriorityUntil() > deps.now();
    const aiQueueBackpressure = deps.aiQueueDepth() >= deps.config.workerQueueSoftLimit;
    const simulationQueueBackpressure = deps.simulationQueueDepth() >= deps.config.simulationQueueSoftLimit;
    const eventLoopOverloaded = Boolean(
      vitals &&
        (vitals.eventLoopDelayP95Ms >= deps.config.eventLoopP95SoftLimitMs ||
          vitals.eventLoopUtilizationPercent >= deps.config.eventLoopUtilizationSoftLimitPct)
    );

    let batchSize = Math.min(aiPlayers.length, deps.config.tickBatchSize);
    let reason = "base";

    if (humanPlayersOnline) {
      batchSize = Math.min(batchSize, deps.config.humanPriorityBatchSize);
      reason = "human_priority";
      if (urgentAiCount > 0) {
        batchSize = Math.min(
          aiPlayers.length,
          Math.max(batchSize, Math.min(deps.config.humanDefenseBatchSize, urgentAiCount))
        );
        reason = "human_priority+defense_priority";
      }
    }
    if (authPriorityActive) {
      batchSize = Math.min(batchSize, deps.config.authPriorityBatchSize);
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

    state.at = deps.now();
    state.batchSize = Math.max(1, batchSize);
    state.selectedAiPlayers = Math.max(1, batchSize);
    state.totalAiPlayers = aiPlayers.length;
    state.urgentAiPlayers = urgentAiCount;
    state.humanPlayersOnline = humanPlayersOnline;
    state.authPriorityActive = authPriorityActive;
    state.aiQueueBackpressure = aiQueueBackpressure;
    state.simulationQueueBackpressure = simulationQueueBackpressure;
    state.eventLoopOverloaded = eventLoopOverloaded;
    state.reason = reason;

    return Math.max(1, batchSize);
  };

  const runAiTick = (): void => {
    const aiPlayers = deps.getAllPlayers().filter((actor) => actor.isAi);
    if (aiPlayers.length === 0) return;
    if (deps.humanChunkSnapshotPriorityActive()) {
      state.at = deps.now();
      state.batchSize = 0;
      state.selectedAiPlayers = 0;
      state.totalAiPlayers = aiPlayers.length;
      state.urgentAiPlayers = 0;
      state.humanPlayersOnline = deps.onlineHumanPlayerCount() > 0;
      state.authPriorityActive = deps.pendingAuthVerifications() > 0 || deps.authPriorityUntil() > deps.now();
      state.aiQueueBackpressure = deps.aiQueueDepth() >= deps.config.workerQueueSoftLimit;
      state.simulationQueueBackpressure = deps.simulationQueueDepth() >= deps.config.simulationQueueSoftLimit;
      state.eventLoopOverloaded = false;
      state.reason = "human_chunk_snapshot_priority";
      return;
    }

    const nowMs = deps.now();
    const batchSize = Math.min(aiPlayers.length, chooseBatchSize(aiPlayers));
    const urgentAiPlayers = aiPlayers.filter((actor) => hasDefensePriority(actor.id, nowMs));
    const orderedAiPlayers = urgentAiPlayers.length
      ? [
          ...urgentAiPlayers,
          ...aiPlayers.filter((actor) => !urgentAiPlayers.some((urgent) => urgent.id === actor.id))
        ]
      : aiPlayers;
    const eligibleAiPlayers = orderedAiPlayers.filter((actor) => {
      if (turnsInFlight.has(actor.id)) return false;
      if (hasDefensePriority(actor.id, nowMs)) return true;
      return ensureDueAt(actor.id, nowMs) <= nowMs;
    });
    if (eligibleAiPlayers.length === 0) return;

    const selectedAiPlayers =
      batchSize >= eligibleAiPlayers.length
        ? eligibleAiPlayers
        : Array.from({ length: batchSize }, (_, index) => eligibleAiPlayers[(roundRobinOffset + index) % eligibleAiPlayers.length]).filter(
            (actor): actor is TPlayer => Boolean(actor)
          );
    if (selectedAiPlayers.length === 0) return;

    state.at = deps.now();
    state.selectedAiPlayers = selectedAiPlayers.length;
    roundRobinOffset = (roundRobinOffset + batchSize) % eligibleAiPlayers.length;

    const startedAt = deps.now();
    const competitionContext = deps.getAiCompetitionContext(nowMs);
    const tickContext = deps.createTickContext(++cycleCounter, competitionContext);
    const slotMs = Math.max(10, Math.floor(deps.config.dispatchIntervalMs / Math.max(1, selectedAiPlayers.length)));
    let pending = selectedAiPlayers.length;
    let activeElapsedMs = 0;

    selectedAiPlayers.forEach((actor, index) => {
      turnsInFlight.add(actor.id);
      scheduleNextTurn(actor.id, nowMs);
      const delayMs = Math.min(deps.config.dispatchIntervalMs - 1, index * slotMs);
      setTimeout(() => {
        deps.enqueueAiWorkerJob({
          actor,
          tickContext,
          onComplete: (elapsedMs) => {
            turnsInFlight.delete(actor.id);
            activeElapsedMs += elapsedMs;
            pending -= 1;
            if (pending > 0) return;
            const memory = deps.runtimeMemoryStats();
            const elapsedMsTotal = activeElapsedMs;
            const wallElapsedMs = deps.now() - startedAt;
            deps.pushAiTickPerf({
              at: deps.now(),
              elapsedMs: elapsedMsTotal,
              aiPlayers: selectedAiPlayers.length,
              rssMb: memory.rssMb,
              heapUsedMb: memory.heapUsedMb
            });
            if (elapsedMsTotal >= 250) {
              deps.onSlowAiTick({
                elapsedMs: elapsedMsTotal,
                wallElapsedMs,
                aiPlayers: selectedAiPlayers.length,
                totalAiPlayers: aiPlayers.length,
                queueDepth: deps.aiQueueDepth(),
                cycleId: cycleCounter,
                memory
              });
            }
          }
        });
      }, delayMs);
    });
  };

  const clearPlayer = (playerId: string): void => {
    nextDueAtByPlayer.delete(playerId);
    turnsInFlight.delete(playerId);
    defensePriorityUntilByPlayer.delete(playerId);
  };

  return {
    state,
    runAiTick,
    markAiDefensePriority,
    clearPlayer
  };
};
