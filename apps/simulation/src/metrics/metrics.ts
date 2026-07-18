import { DURABLE_COMMAND_TYPES } from "@border-empires/sim-protocol";
import {
  AUTOMATION_NOOP_REASONS,
  AUTOMATION_PREPLAN_PROGRESS_STATES,
  AUTOMATION_PREPLAN_REASONS,
  type AutomationNoopReason,
  type AutomationPreplanProgressState,
  type AutomationPreplanReason
} from "../ai/automation-command-planner.js";
import { appendRecent, appendSample, clampMetric, quantile, quantileSample } from "./metrics-format.js";
import { createAiExperimentCounters } from "./metrics-experiment-counters.js";
import { createOwnershipChangeAlertMetrics } from "./metrics-ownership-change-alert.js";
import { createAiPlayerStateMetrics } from "./metrics-ai-player-state.js";
import { renderPrometheus } from "./metrics-prometheus.js";
import {
  AI_PLANNER_PHASES,
  AI_TICK_THROTTLE_REASONS,
  DECISION_CLASSES,
  LANES,
  type AiPlannerPhase,
  type AiTickThrottleReason,
  type DecisionClass,
  type DurableCommandType,
  type PrepareMetricSource,
  type SimulationSnapshotMetricSample,
  type TickSource
} from "./metrics-types.js";

export { AI_PLANNER_PHASES };
export type { AiPlannerPhase, AiTickThrottleReason };
export type { SimulationMetricsSnapshot, SimulationSnapshotMetricSample } from "./metrics-types.js";

export const createSimulationMetrics = (sampleLimit = 512) => {
  const limit = Math.max(8, sampleLimit);
  const recentLimit = Math.max(8, Math.min(24, Math.floor(limit / 4)));
  const simEventLoopDelayMs: number[] = [];
  const simTickDurationMs = new Map<TickSource, number[]>([
    ["ai", []],
    ["system", []]
  ]);
  const simPreparePlayerLatencyMs = new Map<PrepareMetricSource, number[]>([
    ["prepare", []],
    ["spawn", []]
  ]);
  const simCommandAcceptLatencyMsByLane = new Map(LANES.map((lane) => [lane, [] as number[]]));
  const simEventStoreWriteMs: number[] = [];
  const simGcPauseMs: number[] = [];
  const simSnapshotTileCount: number[] = [];
  const simSnapshotJsonBytes: number[] = [];
  const simSnapshotTilesJsonBytes: number[] = [];
  const simSnapshotRecent: SimulationSnapshotMetricSample[] = [];
  const simAiCommandTotalByType = new Map<DurableCommandType, number>(
    DURABLE_COMMAND_TYPES.map((type: DurableCommandType) => [type, 0])
  );
  const simAiCommandRejectedTotalByType = new Map<DurableCommandType, number>(
    DURABLE_COMMAND_TYPES.map((type: DurableCommandType) => [type, 0])
  );
  // Bounded: codes come from a fixed set of rejectCommand(..., code, ...) call sites, not user input.
  const simAiCommandRejectedCodeTotal = new Map<string, number>();
  const simAiCommandRecent: string[] = [];
  const simAiPreplanTotalByReason = new Map<AutomationPreplanReason, number>(
    AUTOMATION_PREPLAN_REASONS.map((reason) => [reason, 0])
  );
  const simAiPreplanRecent: string[] = [];
  const simAiPreplanProgressTotalByState = new Map<AutomationPreplanProgressState, number>(
    AUTOMATION_PREPLAN_PROGRESS_STATES.map((state) => [state, 0])
  );
  const simAiPreplanProgressRecent: string[] = [];
  const simAiNoopTotalByReason = new Map<AutomationNoopReason, number>(
    AUTOMATION_NOOP_REASONS.map((reason) => [reason, 0])
  );
  const simAiNoopRecent: string[] = [];
  const simAiNoFrontierRecent: string[] = [];
  const simAiPlannerPhaseMs = new Map<AiPlannerPhase, number[]>(
    AI_PLANNER_PHASES.map((phase) => [phase, []])
  );
  const simRuntimeDrainMs: number[] = [];
  const simRuntimeDrainJobsPerCall: number[] = [];
  const simRuntimeDrainMsByLane = new Map(LANES.map((lane) => [lane, [] as number[]]));
  const simRuntimeApplyMsByCommandType = new Map<string, number[]>();
  let simEventLoopMaxMs = 0;
  let simHumanInteractiveBacklogMs = 0;
  let simAiQueueBacklogMs = 0;
  let simSystemQueueBacklogMs = 0;
  let simHumanNoninteractiveQueueBacklogMs = 0;
  let simCommandApplyTrackEvictedTotal = 0;
  // Empire-size gauges: total owned tiles, and the single largest empire's tile count (drives
  // per-player O(territory) planner sync cost — the key scale signal to correlate against event-loop lag).
  let simOwnedTilesTotal = 0;
  let simMaxEmpireTiles = 0;
  const simAiBroadFallbackSkipped = new Map<string, number>();
  const simAiNarrowAnalyzeCapped = new Map<string, number>();
  const simAiTickThrottledTotal = new Map<AiTickThrottleReason, number>(
    AI_TICK_THROTTLE_REASONS.map((reason) => [reason, 0])
  );
  let simAiCurrentTickIntervalMs = 0;
  let simAiBudgetUsedMs = 0;
  let simAiAutopilotEnabled = 0;
  let simAiAutopilotPlayerCount = 0;
  let simAiPlannerBreaches = 0;
  const aiExperimentCounters = createAiExperimentCounters();
  const ownershipChangeAlertMetrics = createOwnershipChangeAlertMetrics();
  const aiPlayerStateMetrics = createAiPlayerStateMetrics();
  let simGlobalStatusBroadcastCoalescedTotal = 0;
  let simSnapshotPruneFailedTotal = 0;
  let simPersistenceConstraintViolationTotal = 0;
  let simWriterQueueDepth = 0;
  let simWriterQueueBackpressureWaitTotal = 0;
  let simBarbVisionUnionRecomputeThrottledTotal = 0;
  let simPlayerStateUpdateSkippedAiTotal = 0;
  let simReplayRecordedCommandHistory = 0;
  let simReplayHistoryEvictedTotal = 0;
  let simReplayServerEventsSkippedTotal = 0;
  let simLoginExportPausedDrainTotal = 0;
  let simMusterRemoteAttackTotal = 0;
  let simMusterRemoteBlockedTotal = 0;
  let simMusterRemoteBlockedBarbarianTotal = 0;
  let simSeasonEndSnapshotWarmTotal = 0;
  let simSeasonEndSnapshotWarmFailedTotal = 0;
  let simPostSeasonProtoTileCacheHitTotal = 0;
  let simPostSeasonProtoTileCacheMissTotal = 0;
  let simFullVisInlineBuildTotal = 0;
  let simAutoFillTilesTotal = 0;
  let simAuthRecoveryRespawnTotal = 0;
  let simAuthRecoveryRespawnGuardedTotal = 0;
  const simCheckpointExportMs: number[] = [];
  let simCheckpointRssMb = 0;
  let simCpuPercent = 0;
  let simHeapUsedMb = 0;
  let simHeapTotalMb = 0;
  let simSnapshotCacheEntries = 0;
  let simSnapshotCacheBytes = 0;
  // Per-player epoch-ms timestamp of last accepted AI command (0 = never).
  const simAiLastCommandAcceptedAtMs = new Map<string, number>();
  const simAiExpansionObjectiveTotalByKind = new Map<string, number>();
  const simAiUtilityActionClassTotalByClass = new Map<DecisionClass, number>(
    DECISION_CLASSES.map((cls) => [cls, 0])
  );
  const simAiUtilityDecisionRecent: string[] = [];

  const snapshot = () => ({
    simEventLoopMaxMs,
    simOwnedTilesTotal,
    simMaxEmpireTiles,
    simEventLoopDelayMs: quantileSample(simEventLoopDelayMs),
    simTickDurationMs: {
      ai: quantileSample(simTickDurationMs.get("ai") ?? []),
      system: quantileSample(simTickDurationMs.get("system") ?? [])
    },
    simPreparePlayerLatencyMs: {
      prepare: quantileSample(simPreparePlayerLatencyMs.get("prepare") ?? []),
      spawn: quantileSample(simPreparePlayerLatencyMs.get("spawn") ?? [])
    },
    simHumanInteractiveBacklogMs,
    simAiQueueBacklogMs,
    simSystemQueueBacklogMs,
    simHumanNoninteractiveQueueBacklogMs,
    simCommandApplyTrackEvictedTotal,
    simAiAutopilotEnabled,
    simAiAutopilotPlayerCount,
    simAiPlannerBreaches,
    ...aiExperimentCounters.snapshot(),
    ...aiPlayerStateMetrics.snapshot(),
    simGlobalStatusBroadcastCoalescedTotal,
    simSnapshotPruneFailedTotal,
    simPersistenceConstraintViolationTotal,
    simWriterQueueDepth,
    simWriterQueueBackpressureWaitTotal,
    simBarbVisionUnionRecomputeThrottledTotal,
    simPlayerStateUpdateSkippedAiTotal,
    simReplayRecordedCommandHistory,
    simReplayHistoryEvictedTotal,
    simReplayServerEventsSkippedTotal,
    simLoginExportPausedDrainTotal,
    simAiBroadFallbackSkipped: Object.fromEntries(simAiBroadFallbackSkipped),
    simAiNarrowAnalyzeCapped: Object.fromEntries(simAiNarrowAnalyzeCapped),
    simAiCommandTotalByType: Object.fromEntries(
      DURABLE_COMMAND_TYPES.map((type: DurableCommandType) => [type, simAiCommandTotalByType.get(type) ?? 0])
    ) as Record<DurableCommandType, number>,
    simAiCommandRejectedTotalByType: Object.fromEntries(
      DURABLE_COMMAND_TYPES.map((type: DurableCommandType) => [type, simAiCommandRejectedTotalByType.get(type) ?? 0])
    ) as Record<DurableCommandType, number>,
    simAiCommandRejectedCodeTotal: Object.fromEntries(simAiCommandRejectedCodeTotal),
    simAiCommandRecent: [...simAiCommandRecent],
    simAiPreplanTotalByReason: Object.fromEntries(
      AUTOMATION_PREPLAN_REASONS.map((reason) => [reason, simAiPreplanTotalByReason.get(reason) ?? 0])
    ) as Record<AutomationPreplanReason, number>,
    simAiPreplanRecent: [...simAiPreplanRecent],
    simAiPreplanProgressTotalByState: Object.fromEntries(
      AUTOMATION_PREPLAN_PROGRESS_STATES.map((state) => [state, simAiPreplanProgressTotalByState.get(state) ?? 0])
    ) as Record<AutomationPreplanProgressState, number>,
    simAiPreplanProgressRecent: [...simAiPreplanProgressRecent],
    simAiNoopTotalByReason: Object.fromEntries(
      AUTOMATION_NOOP_REASONS.map((reason) => [reason, simAiNoopTotalByReason.get(reason) ?? 0])
    ) as Record<AutomationNoopReason, number>,
    simAiNoopRecent: [...simAiNoopRecent],
    simAiNoFrontierRecent: [...simAiNoFrontierRecent],
    simAiTickThrottledTotal: Object.fromEntries(simAiTickThrottledTotal) as Record<AiTickThrottleReason, number>,
    simAiCurrentTickIntervalMs,
    simAiBudgetUsedMs,
    simAiPlannerPhaseMs: Object.fromEntries(
      AI_PLANNER_PHASES.map((phase) => [phase, quantileSample(simAiPlannerPhaseMs.get(phase) ?? [])])
    ) as Record<AiPlannerPhase, ReturnType<typeof quantileSample>>,
    simRuntimeDrainMs: quantileSample(simRuntimeDrainMs),
    simRuntimeDrainJobsPerCall: quantileSample(simRuntimeDrainJobsPerCall),
    simRuntimeDrainMsByLane: Object.fromEntries(
      LANES.map((lane) => [lane, quantileSample(simRuntimeDrainMsByLane.get(lane) ?? [])])
    ) as Record<typeof LANES[number], ReturnType<typeof quantileSample>>,
    simRuntimeApplyMsByCommandType: Object.fromEntries(
      [...simRuntimeApplyMsByCommandType.entries()].map(([type, samples]) => [type, quantileSample(samples)])
    ),
    simCheckpointRssMb,
    simCheckpointExportMs: quantileSample(simCheckpointExportMs),
    simCpuPercent,
    simHeapUsedMb,
    simHeapTotalMb,
    simGcPauseMs: quantileSample(simGcPauseMs),
    simCommandAcceptLatencyMsByLane: Object.fromEntries(
      LANES.map((lane) => [lane, quantileSample(simCommandAcceptLatencyMsByLane.get(lane) ?? [])])
    ) as Record<typeof LANES[number], ReturnType<typeof quantileSample>>,
    simEventStoreWriteMs: quantileSample(simEventStoreWriteMs),
    simSnapshotTileCount: quantileSample(simSnapshotTileCount),
    simSnapshotJsonBytes: quantileSample(simSnapshotJsonBytes),
    simSnapshotTilesJsonBytes: quantileSample(simSnapshotTilesJsonBytes),
    simSnapshotCacheEntries,
    simSnapshotCacheBytes,
    simSnapshotRecent: [...simSnapshotRecent],
    simAiLastCommandAcceptedAtMs: Object.fromEntries(simAiLastCommandAcceptedAtMs),
    simMusterRemoteAttackTotal,
    simMusterRemoteBlockedTotal,
    simMusterRemoteBlockedBarbarianTotal,
    ...ownershipChangeAlertMetrics.snapshot(),
    simSeasonEndSnapshotWarmTotal,
    simSeasonEndSnapshotWarmFailedTotal,
    simPostSeasonProtoTileCacheHitTotal,
    simPostSeasonProtoTileCacheMissTotal,
    simFullVisInlineBuildTotal,
    simAutoFillTilesTotal,
    simAuthRecoveryRespawnTotal,
    simAuthRecoveryRespawnGuardedTotal,
    simAiExpansionObjectiveTotalByKind: Object.fromEntries(simAiExpansionObjectiveTotalByKind),
    simAiUtilityActionClassTotalByClass: Object.fromEntries(
      DECISION_CLASSES.map((cls) => [cls, simAiUtilityActionClassTotalByClass.get(cls) ?? 0])
    ) as Record<DecisionClass, number>,
    simAiUtilityDecisionRecent: [...simAiUtilityDecisionRecent]
  });

  return {
    setSimEventLoopMaxMs(value: number): void {
      simEventLoopMaxMs = clampMetric(value);
    },
    setSimOwnedTilesTotal(value: number): void {
      simOwnedTilesTotal = clampMetric(value);
    },
    setSimMaxEmpireTiles(value: number): void {
      simMaxEmpireTiles = clampMetric(value);
    },
    observeSimEventLoopDelayMs(value: number): void {
      appendSample(simEventLoopDelayMs, value, limit);
    },
    observeSimTickDurationMs(source: TickSource, value: number): void {
      const target = simTickDurationMs.get(source);
      if (!target) return;
      appendSample(target, value, limit);
    },
    observeSimPreparePlayerLatencyMs(source: PrepareMetricSource, value: number): void {
      const target = simPreparePlayerLatencyMs.get(source);
      if (!target) return;
      appendSample(target, value, limit);
    },
    setSimHumanInteractiveBacklogMs(value: number): void {
      simHumanInteractiveBacklogMs = clampMetric(value);
    },
    setSimBackgroundQueueBacklogMs(values: { ai: number; system: number; humanNoninteractive: number }): void {
      simAiQueueBacklogMs = clampMetric(values.ai);
      simSystemQueueBacklogMs = clampMetric(values.system);
      simHumanNoninteractiveQueueBacklogMs = clampMetric(values.humanNoninteractive);
    },
    setSimCommandApplyTrackEvictedTotal(value: number): void {
      simCommandApplyTrackEvictedTotal = clampMetric(value);
    },
    setSimAiAutopilotState(values: { enabled: boolean; playerCount: number }): void {
      simAiAutopilotEnabled = values.enabled ? 1 : 0;
      simAiAutopilotPlayerCount = clampMetric(values.playerCount);
    },
    incrementSimAiPlannerBreaches(): void {
      simAiPlannerBreaches += 1;
    },
    incrementSimAiDryRunSkipped: aiExperimentCounters.incrementSimAiDryRunSkipped,
    incrementSimAiCommandCapSkipped: aiExperimentCounters.incrementSimAiCommandCapSkipped,
    incrementSimAiExpandDisabled: aiExperimentCounters.incrementSimAiExpandDisabled,
    incrementSimAiBuildDisabled: aiExperimentCounters.incrementSimAiBuildDisabled,
    setSimAiPlayerState: aiPlayerStateMetrics.setSimAiPlayerState,
    incrementSimAiExpand: aiPlayerStateMetrics.incrementSimAiExpand,
    incrementSimGlobalStatusBroadcastCoalesced(): void {
      simGlobalStatusBroadcastCoalescedTotal += 1;
    },
    incrementSimSnapshotPruneFailed(): void {
      simSnapshotPruneFailedTotal += 1;
    },
    incrementSimPersistenceConstraintViolation(): void {
      simPersistenceConstraintViolationTotal += 1;
    },
    // Live gauge of in-flight writer-channel messages; set on every post()/ack so a growing queue is
    // visible before a heap incident. See SqliteWriterChannel — pending has no depth cap, so this is
    // the only signal the queue is backing up, not just individual writes being slow.
    setSimWriterQueueDepth(value: number): void {
      simWriterQueueDepth = clampMetric(value);
    },
    // Fires each time post() had to await drain because the queue hit its
    // cap — zero forever means backpressure never engages under normal load.
    incrementSimWriterQueueBackpressureWait(): void {
      simWriterQueueBackpressureWaitTotal += 1;
    },
    // Fires each time ensureVisionUnionFresh skips a recompute because the
    // signature changed before the min-interval floor elapsed — zero forever
    // means the throttle never actually engages under real load.
    incrementSimBarbVisionUnionRecomputeThrottled(): void {
      simBarbVisionUnionRecomputeThrottledTotal += 1;
    },
    // Fires each time the tile-shedding tick skips emitPlayerStateUpdate for
    // an AI player — zero forever means the skip never engages.
    incrementSimPlayerStateUpdateSkippedAi(): void {
      simPlayerStateUpdateSkippedAiTotal += 1;
    },
    setReplayCacheStats(stats: {
      recordedCommandHistorySize: number;
      recordedHistoryEvicted: number;
      serverEventsSkipped: number;
    }): void {
      simReplayRecordedCommandHistory = clampMetric(stats.recordedCommandHistorySize);
      simReplayHistoryEvictedTotal = clampMetric(stats.recordedHistoryEvicted);
      simReplayServerEventsSkippedTotal = clampMetric(stats.serverEventsSkipped);
    },
    incrementSimLoginExportPausedDrain(): void {
      simLoginExportPausedDrainTotal += 1;
    },
    incrementSimMusterRemoteAttack(): void {
      simMusterRemoteAttackTotal += 1;
    },
    incrementSimMusterRemoteBlocked(): void {
      simMusterRemoteBlockedTotal += 1;
    },
    incrementSimMusterRemoteBlockedBarbarian(): void {
      simMusterRemoteBlockedBarbarianTotal += 1;
    },
    incrementSimOwnershipChangeAlertSkippedSettlementTier: ownershipChangeAlertMetrics.incrementSimOwnershipChangeAlertSkippedSettlementTier,
    incrementSimSeasonEndSnapshotWarm(): void {
      simSeasonEndSnapshotWarmTotal += 1;
    },
    incrementSimSeasonEndSnapshotWarmFailed(): void {
      simSeasonEndSnapshotWarmFailedTotal += 1;
    },
    incrementSimPostSeasonProtoTileCacheHit(): void {
      simPostSeasonProtoTileCacheHitTotal += 1;
    },
    incrementSimPostSeasonProtoTileCacheMiss(): void {
      simPostSeasonProtoTileCacheMissTotal += 1;
    },
    incrementSimFullVisInlineBuild(): void {
      simFullVisInlineBuildTotal += 1;
    },
    incrementSimAutoFillTiles(count: number): void {
      simAutoFillTilesTotal += count;
    },
    // Fires whenever ensurePlayerHasSpawnTerritory actually places a fresh
    // auth_recovery spawn (i.e. the player read zero territory tiles at
    // subscribe/login time and the world-sanity guard did not suppress it).
    // Every occurrence overwrites the player's prior empire location, so a
    // nonzero rate here is worth alerting on.
    incrementSimAuthRecoveryRespawn(): void {
      simAuthRecoveryRespawnTotal += 1;
    },
    // Fires when the auth_recovery respawn path would have fired but was
    // suppressed because the world-sanity guard could not confirm territory
    // data was actually loaded (ctx.tiles was empty) — see
    // ensurePlayerHasSpawnTerritory in runtime-respawn-helpers.ts.
    incrementSimAuthRecoveryRespawnGuarded(): void {
      simAuthRecoveryRespawnGuardedTotal += 1;
    },
    incrementSimAiBroadFallbackSkipped(playerId: string): void {
      simAiBroadFallbackSkipped.set(playerId, (simAiBroadFallbackSkipped.get(playerId) ?? 0) + 1);
    },
    incrementSimAiNarrowAnalyzeCapped(playerId: string): void {
      simAiNarrowAnalyzeCapped.set(playerId, (simAiNarrowAnalyzeCapped.get(playerId) ?? 0) + 1);
    },
    incrementSimAiTickThrottled(reason: AiTickThrottleReason): void {
      simAiTickThrottledTotal.set(reason, (simAiTickThrottledTotal.get(reason) ?? 0) + 1);
    },
    setSimAiCurrentTickIntervalMs(value: number): void {
      simAiCurrentTickIntervalMs = clampMetric(value);
    },
    setSimAiBudgetUsedMs(value: number): void {
      simAiBudgetUsedMs = clampMetric(value);
    },
    observeSimAiCommand(commandType: DurableCommandType, playerId: string): void {
      simAiCommandTotalByType.set(commandType, (simAiCommandTotalByType.get(commandType) ?? 0) + 1);
      appendRecent(simAiCommandRecent, `${playerId}:${commandType}`, 20);
      simAiLastCommandAcceptedAtMs.set(playerId, Date.now());
    },
    observeSimAiCommandRejected(commandType: DurableCommandType, rejectionCode: string): void {
      simAiCommandRejectedTotalByType.set(commandType, (simAiCommandRejectedTotalByType.get(commandType) ?? 0) + 1);
      simAiCommandRejectedCodeTotal.set(rejectionCode, (simAiCommandRejectedCodeTotal.get(rejectionCode) ?? 0) + 1);
    },
    observeSimAiExpansionObjective(kind: "neutral_value" | "enemy" | "none"): void {
      simAiExpansionObjectiveTotalByKind.set(kind, (simAiExpansionObjectiveTotalByKind.get(kind) ?? 0) + 1);
    },
    observeSimAiUtilityDecision(cls: DecisionClass, playerId: string): void {
      simAiUtilityActionClassTotalByClass.set(cls, (simAiUtilityActionClassTotalByClass.get(cls) ?? 0) + 1);
      appendRecent(simAiUtilityDecisionRecent, `${playerId}:${cls}`, 24);
    },
    observeSimAiPreplan(reason: AutomationPreplanReason, playerId: string): void {
      simAiPreplanTotalByReason.set(reason, (simAiPreplanTotalByReason.get(reason) ?? 0) + 1);
      appendRecent(simAiPreplanRecent, `${playerId}:${reason}`, 20);
    },
    observeSimAiPreplanProgress(state: AutomationPreplanProgressState, playerId: string): void {
      simAiPreplanProgressTotalByState.set(state, (simAiPreplanProgressTotalByState.get(state) ?? 0) + 1);
      appendRecent(simAiPreplanProgressRecent, `${playerId}:${state}`, 20);
    },
    observeSimAiNoop(reason: AutomationNoopReason, playerId: string): void {
      simAiNoopTotalByReason.set(reason, (simAiNoopTotalByReason.get(reason) ?? 0) + 1);
      appendRecent(simAiNoopRecent, `${playerId}:${reason}`, 12);
    },
    observeSimAiNoFrontierDetail(detail: string): void {
      appendRecent(simAiNoFrontierRecent, detail, 12);
    },
    observeSimAiPlannerPhaseMs(phase: AiPlannerPhase, value: number): void {
      const target = simAiPlannerPhaseMs.get(phase);
      if (!target) return;
      appendSample(target, value, limit);
    },
    observeSimRuntimeApply(sample: {
      lane: typeof LANES[number];
      durationMs: number;
      commandType?: string;
    }): void {
      if (!sample.commandType) return;
      let series = simRuntimeApplyMsByCommandType.get(sample.commandType);
      if (!series) {
        series = [];
        simRuntimeApplyMsByCommandType.set(sample.commandType, series);
      }
      appendSample(series, sample.durationMs, limit);
    },
    observeSimRuntimeDrain(sample: {
      durationMs: number;
      processedJobs: number;
      processedByLane: Record<typeof LANES[number], number>;
    }): void {
      appendSample(simRuntimeDrainMs, sample.durationMs, limit);
      appendSample(simRuntimeDrainJobsPerCall, sample.processedJobs, limit);
      if (sample.processedJobs <= 0) return;
      // Attribute drain time proportionally per lane based on jobs processed.
      // Per-lane wall-clock isn't directly measured (drain runs jobs across
      // lanes in priority order), but proportional split is good enough to
      // tell us which lane's apply path dominates.
      for (const lane of LANES) {
        const laneJobs = sample.processedByLane[lane];
        if (!laneJobs || laneJobs <= 0) continue;
        const target = simRuntimeDrainMsByLane.get(lane);
        if (!target) continue;
        const laneDurationMs = (sample.durationMs * laneJobs) / sample.processedJobs;
        appendSample(target, laneDurationMs, limit);
      }
    },
    observeSimCheckpointExportMs(value: number): void {
      appendSample(simCheckpointExportMs, value, limit);
    },
    setSimCheckpointRssMb(value: number): void {
      simCheckpointRssMb = clampMetric(value);
    },
    setSimCpuPercent(value: number): void {
      simCpuPercent = clampMetric(value);
    },
    setSimHeapUsageMb(values: { heapUsedMb: number; heapTotalMb: number }): void {
      simHeapUsedMb = clampMetric(values.heapUsedMb);
      simHeapTotalMb = clampMetric(values.heapTotalMb);
    },
    observeSimGcPauseMs(value: number): void {
      appendSample(simGcPauseMs, value, limit);
    },
    observeSimCommandAcceptLatencyMs(lane: typeof LANES[number], value: number): void {
      const target = simCommandAcceptLatencyMsByLane.get(lane);
      if (!target) return;
      appendSample(target, value, limit);
    },
    observeSimEventStoreWriteMs(value: number): void {
      appendSample(simEventStoreWriteMs, value, limit);
    },
    observeSimSnapshotBuild(sample: SimulationSnapshotMetricSample): void {
      appendSample(simSnapshotTileCount, sample.tileCount, limit);
      appendSample(simSnapshotJsonBytes, sample.snapshotJsonBytes, limit);
      appendSample(simSnapshotTilesJsonBytes, sample.tilesJsonBytes, limit);
      appendRecent(simSnapshotRecent, { ...sample }, recentLimit);
    },
    setSimSnapshotCache(values: { entries: number; bytes: number }): void {
      simSnapshotCacheEntries = clampMetric(values.entries);
      simSnapshotCacheBytes = clampMetric(values.bytes);
    },
    currentAcceptLatencyP95Ms(): number {
      const humanInteractive = simCommandAcceptLatencyMsByLane.get("human_interactive") ?? [];
      return quantile(humanInteractive, 0.95);
    },
    snapshot,
    renderPrometheus(): string {
      return renderPrometheus(snapshot());
    }
  };
};

export type SimulationMetrics = ReturnType<typeof createSimulationMetrics>;
