import { formatMetricValue } from "./metrics-format.js";
import {
  AI_PLANNER_PHASES,
  AI_TICK_THROTTLE_REASONS,
  AUTOMATION_NOOP_REASONS,
  AUTOMATION_PREPLAN_PROGRESS_STATES,
  AUTOMATION_PREPLAN_REASONS,
  AUTOMATION_SETTLE_DECISION_REASONS,
  DECISION_CLASSES,
  DURABLE_COMMAND_TYPES,
  LANES,
  type SimulationMetricsSnapshot
} from "./metrics-types.js";

export const renderPrometheus = (sample: SimulationMetricsSnapshot): string => {
  const lines = [
    "# TYPE sim_event_loop_max_ms gauge",
    `sim_event_loop_max_ms ${formatMetricValue(sample.simEventLoopMaxMs)}`,
    "# TYPE sim_owned_tiles_total gauge",
    `sim_owned_tiles_total ${formatMetricValue(sample.simOwnedTilesTotal)}`,
    "# TYPE sim_max_empire_tiles gauge",
    `sim_max_empire_tiles ${formatMetricValue(sample.simMaxEmpireTiles)}`,
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
    "# TYPE sim_ai_queue_backlog_ms gauge",
    `sim_ai_queue_backlog_ms ${formatMetricValue(sample.simAiQueueBacklogMs)}`,
    "# TYPE sim_system_queue_backlog_ms gauge",
    `sim_system_queue_backlog_ms ${formatMetricValue(sample.simSystemQueueBacklogMs)}`,
    "# TYPE sim_human_noninteractive_queue_backlog_ms gauge",
    `sim_human_noninteractive_queue_backlog_ms ${formatMetricValue(sample.simHumanNoninteractiveQueueBacklogMs)}`,
    "# TYPE sim_command_apply_track_evicted_total counter",
    `sim_command_apply_track_evicted_total ${formatMetricValue(sample.simCommandApplyTrackEvictedTotal)}`,
    "# TYPE sim_ai_autopilot_enabled gauge",
    `sim_ai_autopilot_enabled ${formatMetricValue(sample.simAiAutopilotEnabled)}`,
    "# TYPE sim_ai_autopilot_player_count gauge",
    `sim_ai_autopilot_player_count ${formatMetricValue(sample.simAiAutopilotPlayerCount)}`,
    "# TYPE sim_ai_planner_breaches counter",
    `sim_ai_planner_breaches ${formatMetricValue(sample.simAiPlannerBreaches)}`,
    "# TYPE sim_ai_dry_run_skipped_total counter",
    `sim_ai_dry_run_skipped_total ${formatMetricValue(sample.simAiDryRunSkippedTotal)}`,
    "# TYPE sim_global_status_broadcast_coalesced_total counter",
    `sim_global_status_broadcast_coalesced_total ${formatMetricValue(sample.simGlobalStatusBroadcastCoalescedTotal)}`,
    "# TYPE sim_snapshot_prune_failed_total counter",
    `sim_snapshot_prune_failed_total ${formatMetricValue(sample.simSnapshotPruneFailedTotal)}`,
    "# TYPE sim_persistence_constraint_violation_total counter",
    `sim_persistence_constraint_violation_total ${formatMetricValue(sample.simPersistenceConstraintViolationTotal)}`,
    "# TYPE sim_writer_queue_depth gauge",
    `sim_writer_queue_depth ${formatMetricValue(sample.simWriterQueueDepth)}`,
    "# TYPE sim_writer_queue_backpressure_wait_total counter",
    `sim_writer_queue_backpressure_wait_total ${formatMetricValue(sample.simWriterQueueBackpressureWaitTotal)}`,
    "# TYPE sim_barb_vision_union_recompute_throttled_total counter",
    `sim_barb_vision_union_recompute_throttled_total ${formatMetricValue(sample.simBarbVisionUnionRecomputeThrottledTotal)}`,
    "# TYPE sim_player_state_update_skipped_ai_total counter",
    `sim_player_state_update_skipped_ai_total ${formatMetricValue(sample.simPlayerStateUpdateSkippedAiTotal)}`,
    "# TYPE sim_replay_recorded_command_history gauge",
    `sim_replay_recorded_command_history ${formatMetricValue(sample.simReplayRecordedCommandHistory)}`,
    "# TYPE sim_replay_history_evicted_total counter",
    `sim_replay_history_evicted_total ${formatMetricValue(sample.simReplayHistoryEvictedTotal)}`,
    "# TYPE sim_replay_server_events_skipped_total counter",
    `sim_replay_server_events_skipped_total ${formatMetricValue(sample.simReplayServerEventsSkippedTotal)}`,
    "# TYPE sim_login_export_paused_drain_total counter",
    `sim_login_export_paused_drain_total ${formatMetricValue(sample.simLoginExportPausedDrainTotal)}`,
    "# TYPE sim_ai_command_cap_skipped_total counter",
    `sim_ai_command_cap_skipped_total ${formatMetricValue(sample.simAiCommandCapSkippedTotal)}`,
    "# TYPE sim_ai_expand_disabled_total counter",
    `sim_ai_expand_disabled_total ${formatMetricValue(sample.simAiExpandDisabledTotal)}`,
    "# TYPE sim_ai_build_disabled_total counter",
    `sim_ai_build_disabled_total ${formatMetricValue(sample.simAiBuildDisabledTotal)}`,
    "# TYPE sim_ai_tick_throttled_total counter",
    "# TYPE sim_ai_current_tick_interval_ms gauge",
    `sim_ai_current_tick_interval_ms ${formatMetricValue(sample.simAiCurrentTickIntervalMs)}`,
    "# TYPE sim_ai_budget_used_ms gauge",
    `sim_ai_budget_used_ms ${formatMetricValue(sample.simAiBudgetUsedMs)}`,
    "# TYPE sim_ai_broad_fallback_skipped_total counter",
    "# TYPE sim_ai_narrow_analyze_capped_total counter",
    "# TYPE sim_ai_command_total counter",
    "# TYPE sim_ai_preplan_total counter",
    "# TYPE sim_ai_preplan_progress_total counter",
    "# TYPE sim_ai_noop_total counter",
    "# TYPE sim_ai_settle_decision_total counter",
    "# TYPE sim_ai_settle_decision_top_score gauge",
    `sim_ai_settle_decision_top_score{quantile=\"p50\"} ${formatMetricValue(sample.simAiSettleDecisionTopScore.p50)}`,
    `sim_ai_settle_decision_top_score{quantile=\"p95\"} ${formatMetricValue(sample.simAiSettleDecisionTopScore.p95)}`,
    `sim_ai_settle_decision_top_score{quantile=\"p99\"} ${formatMetricValue(sample.simAiSettleDecisionTopScore.p99)}`,
    "# TYPE sim_checkpoint_export_ms gauge",
    `sim_checkpoint_export_ms{quantile="p50"} ${formatMetricValue(sample.simCheckpointExportMs.p50)}`,
    `sim_checkpoint_export_ms{quantile="p95"} ${formatMetricValue(sample.simCheckpointExportMs.p95)}`,
    `sim_checkpoint_export_ms{quantile="p99"} ${formatMetricValue(sample.simCheckpointExportMs.p99)}`,
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
    `sim_snapshot_cache_bytes ${formatMetricValue(sample.simSnapshotCacheBytes)}`,
    "# TYPE sim_ai_last_command_accepted_at_ms gauge"
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
    lines.push(`sim_ai_command_total{type=\"${commandType}\"} ${formatMetricValue(sample.simAiCommandTotalByType[commandType] ?? 0)}`);
  }
  for (const commandType of DURABLE_COMMAND_TYPES) {
    lines.push(`sim_ai_command_rejected_total{type=\"${commandType}\"} ${formatMetricValue(sample.simAiCommandRejectedTotalByType[commandType] ?? 0)}`);
  }
  for (const [code, count] of Object.entries(sample.simAiCommandRejectedCodeTotal)) {
    lines.push(`sim_ai_command_rejected_code_total{code=\"${code}\"} ${formatMetricValue(count)}`);
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
  for (const reason of AI_TICK_THROTTLE_REASONS) {
    lines.push(`sim_ai_tick_throttled_total{reason=\"${reason}\"} ${formatMetricValue(sample.simAiTickThrottledTotal[reason])}`);
  }
  for (const [playerId, count] of Object.entries(sample.simAiBroadFallbackSkipped)) {
    lines.push(`sim_ai_broad_fallback_skipped_total{playerId=\"${playerId}\"} ${formatMetricValue(count)}`);
  }
  for (const [playerId, count] of Object.entries(sample.simAiNarrowAnalyzeCapped)) {
    lines.push(`sim_ai_narrow_analyze_capped_total{playerId=\"${playerId}\"} ${formatMetricValue(count)}`);
  }
  for (const [playerId, tsMs] of Object.entries(sample.simAiLastCommandAcceptedAtMs)) {
    lines.push(`sim_ai_last_command_accepted_at_ms{player_id=\"${playerId}\"} ${formatMetricValue(tsMs)}`);
  }
  lines.push(
    "# TYPE sim_muster_remote_attack_total counter",
    `sim_muster_remote_attack_total ${formatMetricValue(sample.simMusterRemoteAttackTotal)}`,
    "# TYPE sim_muster_remote_blocked_total counter",
    `sim_muster_remote_blocked_total ${formatMetricValue(sample.simMusterRemoteBlockedTotal)}`,
    "# TYPE sim_muster_remote_blocked_barbarian_total counter",
    `sim_muster_remote_blocked_barbarian_total ${formatMetricValue(sample.simMusterRemoteBlockedBarbarianTotal)}`,
    "# TYPE sim_season_end_snapshot_warm_total counter",
    `sim_season_end_snapshot_warm_total ${formatMetricValue(sample.simSeasonEndSnapshotWarmTotal)}`,
    "# TYPE sim_season_end_snapshot_warm_failed_total counter",
    `sim_season_end_snapshot_warm_failed_total ${formatMetricValue(sample.simSeasonEndSnapshotWarmFailedTotal)}`,
    "# TYPE sim_post_season_proto_tile_cache_hit_total counter",
    `sim_post_season_proto_tile_cache_hit_total ${formatMetricValue(sample.simPostSeasonProtoTileCacheHitTotal)}`,
    "# TYPE sim_post_season_proto_tile_cache_miss_total counter",
    `sim_post_season_proto_tile_cache_miss_total ${formatMetricValue(sample.simPostSeasonProtoTileCacheMissTotal)}`,
    "# TYPE sim_full_vis_inline_build_total counter",
    `sim_full_vis_inline_build_total ${formatMetricValue(sample.simFullVisInlineBuildTotal)}`,
    "# TYPE sim_auto_fill_tiles_total counter",
    `sim_auto_fill_tiles_total ${formatMetricValue(sample.simAutoFillTilesTotal)}`
  );
  lines.push("# TYPE sim_ai_expansion_objective_total counter");
  for (const [kind, count] of Object.entries(sample.simAiExpansionObjectiveTotalByKind)) {
    lines.push(`sim_ai_expansion_objective_total{kind=\"${kind}\"} ${formatMetricValue(count)}`);
  }
  lines.push("# TYPE sim_ai_action_class_total counter");
  for (const cls of DECISION_CLASSES) {
    lines.push(`sim_ai_action_class_total{class=\"${cls}\"} ${formatMetricValue(sample.simAiUtilityActionClassTotalByClass[cls] ?? 0)}`);
  }

  return lines.join("\n");
};
