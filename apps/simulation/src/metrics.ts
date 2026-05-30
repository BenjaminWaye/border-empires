import type { QueueLane } from "./command-lane.js";
import { DURABLE_COMMAND_TYPES, type CommandEnvelope } from "@border-empires/sim-protocol";
import {
  AUTOMATION_NOOP_REASONS,
  AUTOMATION_PREPLAN_PROGRESS_STATES,
  AUTOMATION_PREPLAN_REASONS,
  type AutomationNoopReason,
  type AutomationPreplanProgressState,
  type AutomationPreplanReason
} from "./automation-command-planner.js";
import {
  AUTOMATION_SETTLE_DECISION_REASONS,
  type AutomationSettleDecisionReason
} from "./automation-command-planner-helpers.js";

const LANES: QueueLane[] = ["human_interactive", "human_noninteractive", "system", "ai"];

const quantile = (values: number[], q: number): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * q) - 1));
  return sorted[index] ?? 0;
};

const clampMetric = (value: number): number => (Number.isFinite(value) && value >= 0 ? value : 0);
const formatMetricValue = (value: number): string => (Number.isInteger(value) ? `${value}` : value.toFixed(3));

const appendSample = (target: number[], value: number, limit: number): void => {
  target.push(clampMetric(value));
  if (target.length > limit) target.splice(0, target.length - limit);
};

const appendRecent = <T>(target: T[], value: T, limit: number): void => {
  target.push(value);
  if (target.length > limit) target.splice(0, target.length - limit);
};

type QuantileSample = {
  p50: number;
  p95: number;
  p99: number;
};

type TickSource = "ai" | "system";
type PrepareMetricSource = "prepare" | "spawn";
type DurableCommandType = CommandEnvelope["type"];

// Phases emitted by both the AI worker AND the bridge in ai-command-producer-
// worker.ts. After surfacing the planner_* phases first, the staging soak
// showed planner_total p99 = 4ms while sim_tick_duration_ms.ai p99 = 5,000ms+.
// The 5s is therefore in the BRIDGE (per-player request_plan_round_trip,
// sync_players_*, tile_delta_*, submit_command) not the planner itself.
// We surface all phases so we can localise the remaining cost precisely.
export const AI_PLANNER_PHASES = [
  // Worker-side (inside the planner thread).
  "resolve_player_tiles",
  "planner_choose_settlement",
  "planner_choose_frontier",
  "planner_summarize_frontier",
  "planner_total",
  // Frontier-analysis sub-phases (PR 1 measurement — cost-cap plan).
  "analyze_iter_total",
  "analyze_per_candidate",
  "analyze_neighbor_lookups",
  "analyze_score_calc",
  // Bridge-side (main thread, wrapping each worker round-trip).
  "request_plan_round_trip",
  "sync_players_export",
  // Kept for back-compat with existing dashboards/alerts. Equals
  // replace_players + relevant_set_alloc (its pre-split scope) — does NOT
  // include unseen_scan or export_unseen_tiles, which were always measured
  // separately as "the backfill loop after relevance". Split sub-phases added
  // 2026-05-24 so prod evidence can pinpoint which is causing
  // sim_tick_duration_ms p95 = 7s.
  "sync_players_relevance",
  "sync_players_replace_players",
  "sync_players_relevant_set_alloc",
  "sync_players_unseen_scan",
  "sync_players_export_unseen_tiles",
  "sync_players_post",
  "sync_players_total",
  "tile_delta_merge",
  "tile_delta_post",
  "tile_delta_sync",
  "submit_command"
] as const;
export type AiPlannerPhase = (typeof AI_PLANNER_PHASES)[number];

export type SimulationSnapshotMetricSample = {
  trigger: string;
  playerId: string;
  fullVisibility: number;
  seasonEnded: number;
  tileCount: number;
  snapshotJsonBytes: number;
  tilesJsonBytes: number;
  worldStatusJsonBytes: number;
  cacheEntries: number;
  cacheBytes: number;
  rssMb: number;
  heapUsedMb: number;
};

export type SimulationMetricsSnapshot = {
  simEventLoopMaxMs: number;
  simEventLoopDelayMs: QuantileSample;
  simTickDurationMs: Record<TickSource, QuantileSample>;
  simPreparePlayerLatencyMs: Record<PrepareMetricSource, QuantileSample>;
  simHumanInteractiveBacklogMs: number;
  simAiAutopilotEnabled: number;
  simAiAutopilotPlayerCount: number;
  simAiPlannerBreaches: number;
  simAiBroadFallbackSkipped: Record<string, number>;
  simAiCommandTotalByType: Record<DurableCommandType, number>;
  simAiCommandRecent: string[];
  simAiPreplanTotalByReason: Record<AutomationPreplanReason, number>;
  simAiPreplanRecent: string[];
  simAiPreplanProgressTotalByState: Record<AutomationPreplanProgressState, number>;
  simAiPreplanProgressRecent: string[];
  simAiNoopTotalByReason: Record<AutomationNoopReason, number>;
  simAiNoopRecent: string[];
  simAiNoFrontierRecent: string[];
  simAiSettleDecisionTotalByReason: Record<AutomationSettleDecisionReason, number>;
  simAiSettleDecisionRecent: string[];
  simAiSettleDecisionTopScore: QuantileSample;
  simAiPlannerPhaseMs: Record<AiPlannerPhase, QuantileSample>;
  // Per-runtime-drain histogram. submit_command on the bridge measured 92-319ms
  // p99, which we now know was the drain that runs as a microtask after each
  // submitDurableCommand. This histogram measures the drain directly:
  // durationMs is total wall clock for the drain; jobsPerCall is how many
  // command-runs were processed in that drain (so ms/job ≈ durationMs/jobs).
  // Per-lane breakdown reveals which lane's command-apply work dominates.
  simRuntimeDrainMs: QuantileSample;
  simRuntimeDrainJobsPerCall: QuantileSample;
  simRuntimeDrainMsByLane: Record<QueueLane, QuantileSample>;
  // Per-command-type apply latency. The drain processes 1 job per call,
  // so this is effectively the cost of one apply (apply_attack, apply_settle,
  // etc.). Only command types we've actually seen get an entry — saves the
  // histogram from carrying ~30 zero-valued types on every metrics sample.
  simRuntimeApplyMsByCommandType: Record<string, QuantileSample>;
  // Inner-loop breakdown for COLLECT_VISIBLE, the dominant apply path.
  // Splits the per-call wall clock into yield computation vs tile-delta
  // build, and tracks tiles iterated vs tiles that actually produced yield.
  // Tells us whether the optimisation lever is cheapen-yield, skip-delta,
  // or maintain-collectible-index.
  simCollectVisibleYieldMs: QuantileSample;
  simCollectVisibleDeltaMs: QuantileSample;
  simCollectVisibleTileDeltaBatchEmitMs: QuantileSample;
  simCollectVisibleCollectResultEmitMs: QuantileSample;
  simCollectVisiblePlayerStateUpdateMs: QuantileSample;
  simCollectVisibleTilesConsidered: QuantileSample;
  simCollectVisibleTilesTouched: QuantileSample;
  simCheckpointRssMb: number;
  simCpuPercent: number;
  simHeapUsedMb: number;
  simHeapTotalMb: number;
  simGcPauseMs: QuantileSample;
  simCommandAcceptLatencyMsByLane: Record<QueueLane, QuantileSample>;
  simEventStoreWriteMs: QuantileSample;
  simSnapshotTileCount: QuantileSample;
  simSnapshotJsonBytes: QuantileSample;
  simSnapshotTilesJsonBytes: QuantileSample;
  simSnapshotCacheEntries: number;
  simSnapshotCacheBytes: number;
  simSnapshotRecent: SimulationSnapshotMetricSample[];
};

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
  const simCommandAcceptLatencyMsByLane = new Map<QueueLane, number[]>(LANES.map((lane) => [lane, []]));
  const simEventStoreWriteMs: number[] = [];
  const simGcPauseMs: number[] = [];
  const simSnapshotTileCount: number[] = [];
  const simSnapshotJsonBytes: number[] = [];
  const simSnapshotTilesJsonBytes: number[] = [];
  const simSnapshotRecent: SimulationSnapshotMetricSample[] = [];
  const simAiCommandTotalByType = new Map<DurableCommandType, number>(
    DURABLE_COMMAND_TYPES.map((type) => [type, 0])
  );
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
  const simAiSettleDecisionTotalByReason = new Map<AutomationSettleDecisionReason, number>(
    AUTOMATION_SETTLE_DECISION_REASONS.map((reason) => [reason, 0])
  );
  const simAiSettleDecisionRecent: string[] = [];
  const simAiSettleDecisionTopScore: number[] = [];
  const simAiPlannerPhaseMs = new Map<AiPlannerPhase, number[]>(
    AI_PLANNER_PHASES.map((phase) => [phase, []])
  );
  const simRuntimeDrainMs: number[] = [];
  const simRuntimeDrainJobsPerCall: number[] = [];
  const simRuntimeDrainMsByLane = new Map<QueueLane, number[]>(LANES.map((lane) => [lane, []]));
  const simRuntimeApplyMsByCommandType = new Map<string, number[]>();
  const simCollectVisibleYieldMs: number[] = [];
  const simCollectVisibleDeltaMs: number[] = [];
  const simCollectVisibleTileDeltaBatchEmitMs: number[] = [];
  const simCollectVisibleCollectResultEmitMs: number[] = [];
  const simCollectVisiblePlayerStateUpdateMs: number[] = [];
  const simCollectVisibleTilesConsidered: number[] = [];
  const simCollectVisibleTilesTouched: number[] = [];
  let simEventLoopMaxMs = 0;
  let simHumanInteractiveBacklogMs = 0;
  const simAiBroadFallbackSkipped = new Map<string, number>();
  let simAiAutopilotEnabled = 0;
  let simAiAutopilotPlayerCount = 0;
  let simAiPlannerBreaches = 0;
  let simCheckpointRssMb = 0;
  let simCpuPercent = 0;
  let simHeapUsedMb = 0;
  let simHeapTotalMb = 0;
  let simSnapshotCacheEntries = 0;
  let simSnapshotCacheBytes = 0;

  const quantileSample = (series: number[]): QuantileSample => ({
    p50: quantile(series, 0.5),
    p95: quantile(series, 0.95),
    p99: quantile(series, 0.99)
  });

  const snapshot = (): SimulationMetricsSnapshot => ({
    simEventLoopMaxMs,
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
    simAiAutopilotEnabled,
    simAiAutopilotPlayerCount,
    simAiPlannerBreaches,
    simAiBroadFallbackSkipped: Object.fromEntries(simAiBroadFallbackSkipped),
    simAiCommandTotalByType: Object.fromEntries(
      DURABLE_COMMAND_TYPES.map((type) => [type, simAiCommandTotalByType.get(type) ?? 0])
    ) as Record<DurableCommandType, number>,
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
    simAiSettleDecisionTotalByReason: Object.fromEntries(
      AUTOMATION_SETTLE_DECISION_REASONS.map((reason) => [reason, simAiSettleDecisionTotalByReason.get(reason) ?? 0])
    ) as Record<AutomationSettleDecisionReason, number>,
    simAiSettleDecisionRecent: [...simAiSettleDecisionRecent],
    simAiSettleDecisionTopScore: quantileSample(simAiSettleDecisionTopScore),
    simAiPlannerPhaseMs: Object.fromEntries(
      AI_PLANNER_PHASES.map((phase) => [phase, quantileSample(simAiPlannerPhaseMs.get(phase) ?? [])])
    ) as Record<AiPlannerPhase, QuantileSample>,
    simRuntimeDrainMs: quantileSample(simRuntimeDrainMs),
    simRuntimeDrainJobsPerCall: quantileSample(simRuntimeDrainJobsPerCall),
    simRuntimeDrainMsByLane: Object.fromEntries(
      LANES.map((lane) => [lane, quantileSample(simRuntimeDrainMsByLane.get(lane) ?? [])])
    ) as Record<QueueLane, QuantileSample>,
    simRuntimeApplyMsByCommandType: Object.fromEntries(
      [...simRuntimeApplyMsByCommandType.entries()].map(([type, samples]) => [type, quantileSample(samples)])
    ),
    simCollectVisibleYieldMs: quantileSample(simCollectVisibleYieldMs),
    simCollectVisibleDeltaMs: quantileSample(simCollectVisibleDeltaMs),
    simCollectVisibleTileDeltaBatchEmitMs: quantileSample(simCollectVisibleTileDeltaBatchEmitMs),
    simCollectVisibleCollectResultEmitMs: quantileSample(simCollectVisibleCollectResultEmitMs),
    simCollectVisiblePlayerStateUpdateMs: quantileSample(simCollectVisiblePlayerStateUpdateMs),
    simCollectVisibleTilesConsidered: quantileSample(simCollectVisibleTilesConsidered),
    simCollectVisibleTilesTouched: quantileSample(simCollectVisibleTilesTouched),
    simCheckpointRssMb,
    simCpuPercent,
    simHeapUsedMb,
    simHeapTotalMb,
    simGcPauseMs: quantileSample(simGcPauseMs),
    simCommandAcceptLatencyMsByLane: Object.fromEntries(
      LANES.map((lane) => [lane, quantileSample(simCommandAcceptLatencyMsByLane.get(lane) ?? [])])
    ) as Record<QueueLane, QuantileSample>,
    simEventStoreWriteMs: quantileSample(simEventStoreWriteMs),
    simSnapshotTileCount: quantileSample(simSnapshotTileCount),
    simSnapshotJsonBytes: quantileSample(simSnapshotJsonBytes),
    simSnapshotTilesJsonBytes: quantileSample(simSnapshotTilesJsonBytes),
    simSnapshotCacheEntries,
    simSnapshotCacheBytes,
    simSnapshotRecent: [...simSnapshotRecent]
  });

  return {
    setSimEventLoopMaxMs(value: number): void {
      simEventLoopMaxMs = clampMetric(value);
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
    setSimAiAutopilotState(values: { enabled: boolean; playerCount: number }): void {
      simAiAutopilotEnabled = values.enabled ? 1 : 0;
      simAiAutopilotPlayerCount = clampMetric(values.playerCount);
    },
    incrementSimAiPlannerBreaches(): void {
      simAiPlannerBreaches += 1;
    },
    incrementSimAiBroadFallbackSkipped(playerId: string): void {
      simAiBroadFallbackSkipped.set(playerId, (simAiBroadFallbackSkipped.get(playerId) ?? 0) + 1);
    },
    observeSimAiCommand(commandType: DurableCommandType, playerId: string): void {
      simAiCommandTotalByType.set(commandType, (simAiCommandTotalByType.get(commandType) ?? 0) + 1);
      appendRecent(simAiCommandRecent, `${playerId}:${commandType}`, 20);
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
    observeSimAiSettleDecision(reason: AutomationSettleDecisionReason, playerId: string, topScore: number): void {
      simAiSettleDecisionTotalByReason.set(reason, (simAiSettleDecisionTotalByReason.get(reason) ?? 0) + 1);
      const rounded = Math.round(topScore);
      appendRecent(simAiSettleDecisionRecent, `${playerId}:${reason}:${rounded}`, 12);
      appendSample(simAiSettleDecisionTopScore, topScore, limit);
    },
    observeSimAiPlannerPhaseMs(phase: AiPlannerPhase, value: number): void {
      const target = simAiPlannerPhaseMs.get(phase);
      if (!target) return;
      appendSample(target, value, limit);
    },
    observeSimCollectVisible(sample: {
      yieldMs: number;
      deltaMs: number;
      tileDeltaBatchEmitMs: number;
      collectResultEmitMs: number;
      playerStateUpdateMs: number;
      tilesConsidered: number;
      tilesTouched: number;
    }): void {
      appendSample(simCollectVisibleYieldMs, sample.yieldMs, limit);
      appendSample(simCollectVisibleDeltaMs, sample.deltaMs, limit);
      appendSample(simCollectVisibleTileDeltaBatchEmitMs, sample.tileDeltaBatchEmitMs, limit);
      appendSample(simCollectVisibleCollectResultEmitMs, sample.collectResultEmitMs, limit);
      appendSample(simCollectVisiblePlayerStateUpdateMs, sample.playerStateUpdateMs, limit);
      appendSample(simCollectVisibleTilesConsidered, sample.tilesConsidered, limit);
      appendSample(simCollectVisibleTilesTouched, sample.tilesTouched, limit);
    },
    observeSimRuntimeApply(sample: {
      lane: QueueLane;
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
      processedByLane: Record<QueueLane, number>;
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
    observeSimCommandAcceptLatencyMs(lane: QueueLane, value: number): void {
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
      const sample = snapshot();
      const lines = [
        "# TYPE sim_event_loop_max_ms gauge",
        `sim_event_loop_max_ms ${formatMetricValue(sample.simEventLoopMaxMs)}`,
        "# TYPE sim_event_loop_delay_ms gauge",
        `sim_event_loop_delay_ms{quantile=\"p50\"} ${formatMetricValue(sample.simEventLoopDelayMs.p50)}`,
        `sim_event_loop_delay_ms{quantile=\"p95\"} ${formatMetricValue(sample.simEventLoopDelayMs.p95)}`,
        `sim_event_loop_delay_ms{quantile=\"p99\"} ${formatMetricValue(sample.simEventLoopDelayMs.p99)}`,
        "# TYPE sim_tick_duration_ms gauge",
        `sim_tick_duration_ms{source=\"ai\",quantile=\"p50\"} ${formatMetricValue(sample.simTickDurationMs.ai.p50)}`,
        `sim_tick_duration_ms{source=\"ai\",quantile=\"p95\"} ${formatMetricValue(sample.simTickDurationMs.ai.p95)}`,
        `sim_tick_duration_ms{source=\"ai\",quantile=\"p99\"} ${formatMetricValue(sample.simTickDurationMs.ai.p99)}`,
        `sim_tick_duration_ms{source=\"system\",quantile=\"p50\"} ${formatMetricValue(sample.simTickDurationMs.system.p50)}`,
        `sim_tick_duration_ms{source=\"system\",quantile=\"p95\"} ${formatMetricValue(sample.simTickDurationMs.system.p95)}`,
        `sim_tick_duration_ms{source=\"system\",quantile=\"p99\"} ${formatMetricValue(sample.simTickDurationMs.system.p99)}`,
        "# TYPE sim_prepare_player_latency_ms gauge",
        `sim_prepare_player_latency_ms{source=\"prepare\",quantile=\"p50\"} ${formatMetricValue(sample.simPreparePlayerLatencyMs.prepare.p50)}`,
        `sim_prepare_player_latency_ms{source=\"prepare\",quantile=\"p95\"} ${formatMetricValue(sample.simPreparePlayerLatencyMs.prepare.p95)}`,
        `sim_prepare_player_latency_ms{source=\"prepare\",quantile=\"p99\"} ${formatMetricValue(sample.simPreparePlayerLatencyMs.prepare.p99)}`,
        `sim_prepare_player_latency_ms{source=\"spawn\",quantile=\"p50\"} ${formatMetricValue(sample.simPreparePlayerLatencyMs.spawn.p50)}`,
        `sim_prepare_player_latency_ms{source=\"spawn\",quantile=\"p95\"} ${formatMetricValue(sample.simPreparePlayerLatencyMs.spawn.p95)}`,
        `sim_prepare_player_latency_ms{source=\"spawn\",quantile=\"p99\"} ${formatMetricValue(sample.simPreparePlayerLatencyMs.spawn.p99)}`,
        "# TYPE sim_human_interactive_backlog_ms gauge",
        `sim_human_interactive_backlog_ms ${formatMetricValue(sample.simHumanInteractiveBacklogMs)}`,
        "# TYPE sim_ai_autopilot_enabled gauge",
        `sim_ai_autopilot_enabled ${formatMetricValue(sample.simAiAutopilotEnabled)}`,
        "# TYPE sim_ai_autopilot_player_count gauge",
        `sim_ai_autopilot_player_count ${formatMetricValue(sample.simAiAutopilotPlayerCount)}`,
        "# TYPE sim_ai_planner_breaches counter",
        `sim_ai_planner_breaches ${formatMetricValue(sample.simAiPlannerBreaches)}`,
        "# TYPE sim_ai_broad_fallback_skipped_total counter",
        "# TYPE sim_ai_command_total counter",
        "# TYPE sim_ai_preplan_total counter",
        "# TYPE sim_ai_preplan_progress_total counter",
        "# TYPE sim_ai_noop_total counter",
        "# TYPE sim_ai_settle_decision_total counter",
        "# TYPE sim_ai_settle_decision_top_score gauge",
        `sim_ai_settle_decision_top_score{quantile=\"p50\"} ${formatMetricValue(sample.simAiSettleDecisionTopScore.p50)}`,
        `sim_ai_settle_decision_top_score{quantile=\"p95\"} ${formatMetricValue(sample.simAiSettleDecisionTopScore.p95)}`,
        `sim_ai_settle_decision_top_score{quantile=\"p99\"} ${formatMetricValue(sample.simAiSettleDecisionTopScore.p99)}`,
        "# TYPE sim_checkpoint_rss_mb gauge",
        `sim_checkpoint_rss_mb ${formatMetricValue(sample.simCheckpointRssMb)}`,
        "# TYPE sim_cpu_percent gauge",
        `sim_cpu_percent ${formatMetricValue(sample.simCpuPercent)}`,
        "# TYPE sim_heap_used_mb gauge",
        `sim_heap_used_mb ${formatMetricValue(sample.simHeapUsedMb)}`,
        "# TYPE sim_heap_total_mb gauge",
        `sim_heap_total_mb ${formatMetricValue(sample.simHeapTotalMb)}`,
        "# TYPE sim_gc_pause_ms gauge",
        `sim_gc_pause_ms{quantile=\"p50\"} ${formatMetricValue(sample.simGcPauseMs.p50)}`,
        `sim_gc_pause_ms{quantile=\"p95\"} ${formatMetricValue(sample.simGcPauseMs.p95)}`,
        `sim_gc_pause_ms{quantile=\"p99\"} ${formatMetricValue(sample.simGcPauseMs.p99)}`,
        "# TYPE sim_event_store_write_ms gauge",
        `sim_event_store_write_ms{quantile=\"p50\"} ${formatMetricValue(sample.simEventStoreWriteMs.p50)}`,
        `sim_event_store_write_ms{quantile=\"p95\"} ${formatMetricValue(sample.simEventStoreWriteMs.p95)}`,
        `sim_event_store_write_ms{quantile=\"p99\"} ${formatMetricValue(sample.simEventStoreWriteMs.p99)}`,
        "# TYPE sim_ai_planner_phase_ms gauge",
        "# TYPE sim_runtime_drain_ms gauge",
        `sim_runtime_drain_ms{quantile=\"p50\"} ${formatMetricValue(sample.simRuntimeDrainMs.p50)}`,
        `sim_runtime_drain_ms{quantile=\"p95\"} ${formatMetricValue(sample.simRuntimeDrainMs.p95)}`,
        `sim_runtime_drain_ms{quantile=\"p99\"} ${formatMetricValue(sample.simRuntimeDrainMs.p99)}`,
        "# TYPE sim_runtime_drain_jobs_per_call gauge",
        `sim_runtime_drain_jobs_per_call{quantile=\"p50\"} ${formatMetricValue(sample.simRuntimeDrainJobsPerCall.p50)}`,
        `sim_runtime_drain_jobs_per_call{quantile=\"p95\"} ${formatMetricValue(sample.simRuntimeDrainJobsPerCall.p95)}`,
        `sim_runtime_drain_jobs_per_call{quantile=\"p99\"} ${formatMetricValue(sample.simRuntimeDrainJobsPerCall.p99)}`,
        "# TYPE sim_runtime_drain_ms_by_lane gauge",
        "# TYPE sim_runtime_apply_ms_by_command gauge",
        "# TYPE sim_command_accept_latency_ms gauge",
        "# TYPE sim_snapshot_tile_count gauge",
        `sim_snapshot_tile_count{quantile=\"p50\"} ${formatMetricValue(sample.simSnapshotTileCount.p50)}`,
        `sim_snapshot_tile_count{quantile=\"p95\"} ${formatMetricValue(sample.simSnapshotTileCount.p95)}`,
        `sim_snapshot_tile_count{quantile=\"p99\"} ${formatMetricValue(sample.simSnapshotTileCount.p99)}`,
        "# TYPE sim_snapshot_json_bytes gauge",
        `sim_snapshot_json_bytes{quantile=\"p50\"} ${formatMetricValue(sample.simSnapshotJsonBytes.p50)}`,
        `sim_snapshot_json_bytes{quantile=\"p95\"} ${formatMetricValue(sample.simSnapshotJsonBytes.p95)}`,
        `sim_snapshot_json_bytes{quantile=\"p99\"} ${formatMetricValue(sample.simSnapshotJsonBytes.p99)}`,
        "# TYPE sim_snapshot_tiles_json_bytes gauge",
        `sim_snapshot_tiles_json_bytes{quantile=\"p50\"} ${formatMetricValue(sample.simSnapshotTilesJsonBytes.p50)}`,
        `sim_snapshot_tiles_json_bytes{quantile=\"p95\"} ${formatMetricValue(sample.simSnapshotTilesJsonBytes.p95)}`,
        `sim_snapshot_tiles_json_bytes{quantile=\"p99\"} ${formatMetricValue(sample.simSnapshotTilesJsonBytes.p99)}`,
        "# TYPE sim_snapshot_cache_entries gauge",
        `sim_snapshot_cache_entries ${formatMetricValue(sample.simSnapshotCacheEntries)}`,
        "# TYPE sim_snapshot_cache_bytes gauge",
        `sim_snapshot_cache_bytes ${formatMetricValue(sample.simSnapshotCacheBytes)}`
      ];

      for (const lane of LANES) {
        const laneSample = sample.simCommandAcceptLatencyMsByLane[lane];
        lines.push(`sim_command_accept_latency_ms{lane=\"${lane}\",quantile=\"p50\"} ${formatMetricValue(laneSample.p50)}`);
        lines.push(`sim_command_accept_latency_ms{lane=\"${lane}\",quantile=\"p95\"} ${formatMetricValue(laneSample.p95)}`);
        lines.push(`sim_command_accept_latency_ms{lane=\"${lane}\",quantile=\"p99\"} ${formatMetricValue(laneSample.p99)}`);
        const drainSample = sample.simRuntimeDrainMsByLane[lane];
        lines.push(`sim_runtime_drain_ms_by_lane{lane=\"${lane}\",quantile=\"p50\"} ${formatMetricValue(drainSample.p50)}`);
        lines.push(`sim_runtime_drain_ms_by_lane{lane=\"${lane}\",quantile=\"p95\"} ${formatMetricValue(drainSample.p95)}`);
        lines.push(`sim_runtime_drain_ms_by_lane{lane=\"${lane}\",quantile=\"p99\"} ${formatMetricValue(drainSample.p99)}`);
      }
      for (const phase of AI_PLANNER_PHASES) {
        const phaseSample = sample.simAiPlannerPhaseMs[phase];
        lines.push(`sim_ai_planner_phase_ms{phase=\"${phase}\",quantile=\"p50\"} ${formatMetricValue(phaseSample.p50)}`);
        lines.push(`sim_ai_planner_phase_ms{phase=\"${phase}\",quantile=\"p95\"} ${formatMetricValue(phaseSample.p95)}`);
        lines.push(`sim_ai_planner_phase_ms{phase=\"${phase}\",quantile=\"p99\"} ${formatMetricValue(phaseSample.p99)}`);
      }
      for (const [commandType, commandSample] of Object.entries(sample.simRuntimeApplyMsByCommandType)) {
        lines.push(`sim_runtime_apply_ms_by_command{type=\"${commandType}\",quantile=\"p50\"} ${formatMetricValue(commandSample.p50)}`);
        lines.push(`sim_runtime_apply_ms_by_command{type=\"${commandType}\",quantile=\"p95\"} ${formatMetricValue(commandSample.p95)}`);
        lines.push(`sim_runtime_apply_ms_by_command{type=\"${commandType}\",quantile=\"p99\"} ${formatMetricValue(commandSample.p99)}`);
      }
      for (const commandType of DURABLE_COMMAND_TYPES) {
        lines.push(`sim_ai_command_total{type=\"${commandType}\"} ${formatMetricValue(sample.simAiCommandTotalByType[commandType])}`);
      }
      for (const reason of AUTOMATION_PREPLAN_REASONS) {
        lines.push(`sim_ai_preplan_total{reason=\"${reason}\"} ${formatMetricValue(sample.simAiPreplanTotalByReason[reason])}`);
      }
      for (const state of AUTOMATION_PREPLAN_PROGRESS_STATES) {
        lines.push(`sim_ai_preplan_progress_total{state=\"${state}\"} ${formatMetricValue(sample.simAiPreplanProgressTotalByState[state])}`);
      }
      for (const reason of AUTOMATION_NOOP_REASONS) {
        lines.push(`sim_ai_noop_total{reason=\"${reason}\"} ${formatMetricValue(sample.simAiNoopTotalByReason[reason])}`);
      }
      for (const reason of AUTOMATION_SETTLE_DECISION_REASONS) {
        lines.push(`sim_ai_settle_decision_total{reason=\"${reason}\"} ${formatMetricValue(sample.simAiSettleDecisionTotalByReason[reason])}`);
      }
      for (const [playerId, count] of Object.entries(sample.simAiBroadFallbackSkipped)) {
        lines.push(`sim_ai_broad_fallback_skipped_total{playerId=\"${playerId}\"} ${formatMetricValue(count)}`);
      }

      return lines.join("\n");
    }
  };
};

export type SimulationMetrics = ReturnType<typeof createSimulationMetrics>;
