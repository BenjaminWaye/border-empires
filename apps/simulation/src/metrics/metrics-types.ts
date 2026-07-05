import type { QueueLane } from "../command-lane/command-lane.js";
import { DURABLE_COMMAND_TYPES, type CommandEnvelope } from "@border-empires/sim-protocol";
import {
  AUTOMATION_NOOP_REASONS,
  AUTOMATION_PREPLAN_PROGRESS_STATES,
  AUTOMATION_PREPLAN_REASONS,
  type AutomationNoopReason,
  type AutomationPreplanProgressState,
  type AutomationPreplanReason
} from "../ai/automation-command-planner.js";
import {
  AUTOMATION_SETTLE_DECISION_REASONS,
  type AutomationSettleDecisionReason
} from "../ai/automation-command-planner-helpers.js";
import { DECISION_CLASSES, type DecisionClass } from "../ai/utility/decisions.js";
import type { QuantileSample } from "./metrics-format.js";

export { DURABLE_COMMAND_TYPES, DECISION_CLASSES };
export type {
  QueueLane,
  AutomationNoopReason,
  AutomationPreplanProgressState,
  AutomationPreplanReason,
  AutomationSettleDecisionReason,
  DecisionClass,
  QuantileSample
};
export {
  AUTOMATION_NOOP_REASONS,
  AUTOMATION_PREPLAN_PROGRESS_STATES,
  AUTOMATION_PREPLAN_REASONS,
  AUTOMATION_SETTLE_DECISION_REASONS
};

export const LANES: QueueLane[] = ["human_interactive", "human_noninteractive", "system", "ai"];

export type TickSource = "ai" | "system";
export type PrepareMetricSource = "prepare" | "spawn";
export type DurableCommandType = CommandEnvelope["type"];

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
  // Fires once per player per incremental delta application (not full rebuild).
  // durationMs = number of dirty tiles processed (repurposed — timing is
  // subsumed in sync_players_replace_players). A silent counter means the
  // incremental path isn't firing; replace_players p99 staying high confirms.
  "sync_players_incremental_delta",
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

export const AI_TICK_THROTTLE_REASONS = ["adaptive", "budget", "loop_lag", "plan_timeout", "season_ended"] as const;
export type AiTickThrottleReason = (typeof AI_TICK_THROTTLE_REASONS)[number];

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
  simOwnedTilesTotal: number;
  simMaxEmpireTiles: number;
  simEventLoopDelayMs: QuantileSample;
  simTickDurationMs: Record<TickSource, QuantileSample>;
  simPreparePlayerLatencyMs: Record<PrepareMetricSource, QuantileSample>;
  simHumanInteractiveBacklogMs: number;
  simAiQueueBacklogMs: number;
  simSystemQueueBacklogMs: number;
  simHumanNoninteractiveQueueBacklogMs: number;
  /** commandApplyTracker FIFO evictions (counter); >0 means commands are never resolving (see command-apply-tracker.ts). */
  simCommandApplyTrackEvictedTotal: number;
  simAiAutopilotEnabled: number;
  simAiAutopilotPlayerCount: number;
  simAiPlannerBreaches: number;
  simAiDryRunSkippedTotal: number;
  simGlobalStatusBroadcastCoalescedTotal: number;
  simSnapshotPruneFailedTotal: number;
  /** In-flight sqlite-writer-channel messages (gauge). Growing without bound means the writer worker is falling behind. */
  simWriterQueueDepth: number;
  /** Times post() awaited drain because the queue hit its depth cap; 0 means backpressure never engaged. */
  simWriterQueueBackpressureWaitTotal: number;
  /** Times ensureVisionUnionFresh skipped a recompute due to the min-interval throttle; 0 means it never engaged. */
  simBarbVisionUnionRecomputeThrottledTotal: number;
  /** Times the tile-shedding tick skipped emitPlayerStateUpdate for an AI player; 0 means the skip never engaged. */
  simPlayerStateUpdateSkippedAiTotal: number;
  /** Entries in the replay cache embedded in each snapshot (gauge; was 122k pre-#615). */
  simReplayRecordedCommandHistory: number;
  /** Replay-cache hard-cap evictions; >0 means a server commandId prefix is leaking past the denylist. */
  simReplayHistoryEvictedTotal: number;
  /** Server-generated events excluded from replay tracking (counter). */
  simReplayServerEventsSkippedTotal: number;
  simLoginExportPausedDrainTotal: number;
  simAiCommandCapSkippedTotal: number;
  simAiExpandDisabledTotal: number;
  simAiBuildDisabledTotal: number;
  simAiBroadFallbackSkipped: Record<string, number>;
  simAiNarrowAnalyzeCapped: Record<string, number>;
  simAiCommandTotalByType: Record<DurableCommandType, number>;
  simAiCommandRejectedTotalByType: Record<DurableCommandType, number>;
  simAiCommandRecent: string[];
  simAiPreplanTotalByReason: Record<AutomationPreplanReason, number>;
  simAiPreplanRecent: string[];
  simAiPreplanProgressTotalByState: Record<AutomationPreplanProgressState, number>;
  simAiPreplanProgressRecent: string[];
  simAiNoopTotalByReason: Record<AutomationNoopReason, number>;
  simAiNoopRecent: string[];
  simAiNoFrontierRecent: string[];
  simAiTickThrottledTotal: Record<AiTickThrottleReason, number>;
  simAiCurrentTickIntervalMs: number;
  simAiBudgetUsedMs: number;
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
  // Inner-loop breakdown for the runtime apply path.
  // Splits the per-call wall clock into yield computation vs tile-delta
  simCheckpointRssMb: number;
  simCheckpointExportMs: QuantileSample;
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
  // Per-player timestamp of last accepted AI command (ms since epoch, 0 = never).
  // Used to detect frozen AI players: a player with no accepted command for
  // several minutes while autopilot is enabled has stalled.
  simAiLastCommandAcceptedAtMs: Record<string, number>;
  simMusterRemoteAttackTotal: number;
  simMusterRemoteBlockedTotal: number;
  simMusterRemoteBlockedBarbarianTotal: number;
  simSeasonEndSnapshotWarmTotal: number;
  simSeasonEndSnapshotWarmFailedTotal: number;
  /** Full-visibility snapshots built inline (worker pool bypassed to avoid 202k-tile structured-clone block). */
  simFullVisInlineBuildTotal: number;
  simAutoFillTilesTotal: number;
  /** Counter per objective kind acted on (neutral_value / enemy / none). */
  simAiExpansionObjectiveTotalByKind: Record<string, number>;
  /** Counter per utility DecisionClass acted on. */
  simAiUtilityActionClassTotalByClass: Record<DecisionClass, number>;
  simAiUtilityDecisionRecent: string[];
  /** Post-season proto-tile cache hits (same seasonId reused, no re-map). */
  simPostSeasonProtoTileCacheHitTotal: number;
  /** Post-season proto-tile cache misses (first map or new season). */
  simPostSeasonProtoTileCacheMissTotal: number;
};
