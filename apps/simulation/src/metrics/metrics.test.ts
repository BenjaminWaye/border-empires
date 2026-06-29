import { describe, expect, it } from "vitest";

import { createSimulationMetrics } from "./metrics.js";

describe("simulation metrics", () => {
  it("tracks backlog, planner breaches, lane quantiles, and snapshot diagnostics", () => {
    const metrics = createSimulationMetrics();
    metrics.setSimEventLoopMaxMs(18);
    metrics.observeSimEventLoopDelayMs(6);
    metrics.observeSimEventLoopDelayMs(9);
    metrics.observeSimTickDurationMs("ai", 4);
    metrics.observeSimTickDurationMs("ai", 8);
    metrics.observeSimTickDurationMs("system", 11);
    metrics.observeSimPreparePlayerLatencyMs("prepare", 23);
    metrics.observeSimPreparePlayerLatencyMs("prepare", 41);
    metrics.observeSimPreparePlayerLatencyMs("spawn", 19);
    metrics.setSimHumanInteractiveBacklogMs(240);
    metrics.setSimAiAutopilotState({ enabled: true, playerCount: 20 });
    metrics.setSimCheckpointRssMb(321.5);
    metrics.setSimCpuPercent(37.2);
    metrics.setSimHeapUsageMb({ heapUsedMb: 82, heapTotalMb: 140 });
    metrics.observeSimGcPauseMs(3);
    metrics.observeSimGcPauseMs(12);
    metrics.incrementSimAiPlannerBreaches();
    metrics.observeSimAiCommand("SETTLE", "ai-4");
    metrics.observeSimAiCommand("EXPAND", "ai-2");
    metrics.observeSimAiCommand("BUILD_ECONOMIC_STRUCTURE", "ai-9");
    metrics.observeSimAiPreplan("defer_unaffordable_progression", "ai-4");
    metrics.observeSimAiPreplan("choose_domain", "ai-9");
    metrics.observeSimAiPreplanProgress("tech_and_domain_unaffordable", "ai-4");
    metrics.observeSimAiPreplanProgress("domain_affordable", "ai-9");
    metrics.observeSimAiNoop("no_frontier_targets", "ai-4");
    metrics.observeSimAiNoop("insufficient_manpower_for_attack", "ai-2");
    metrics.observeSimAiNoop("planner_error", "ai-9");
    metrics.observeSimAiNoFrontierDetail("source=worker:ai-4:owned=12:owned_frontier=3:frontier=0:hot=0:strategic=0:origins=3:dock_origins=0:scope_keys=24:scope_tiles=22:settle=0:enemy=0:enemy_player=0:barbarian=0:neutral=0:econ=0:scout=0:scaffold=0:waste=2:preplan=tech_unaffordable");
    metrics.observeSimCommandAcceptLatencyMs("human_interactive", 8);
    metrics.observeSimCommandAcceptLatencyMs("human_interactive", 12);
    metrics.observeSimCommandAcceptLatencyMs("human_interactive", 20);
    metrics.observeSimCommandAcceptLatencyMs("ai", 1);
    metrics.observeSimCommandAcceptLatencyMs("system", 2);
    metrics.observeSimEventStoreWriteMs(3);
    metrics.observeSimEventStoreWriteMs(7);
    metrics.observeSimEventStoreWriteMs(11);
    metrics.observeSimAiPlannerPhaseMs("planner_total", 13);
    metrics.observeSimAiPlannerPhaseMs("request_plan_round_trip", 21);
    metrics.observeSimRuntimeDrain({
      durationMs: 31,
      processedJobs: 1,
      processedByLane: { human_interactive: 0, human_noninteractive: 0, system: 0, ai: 1 }
    });
    metrics.observeSimRuntimeApply({
      lane: "ai",
      commandType: "EXPAND",
      durationMs: 17
    });
    metrics.setSimSnapshotCache({ entries: 3, bytes: 4096 });
    metrics.observeSimSnapshotBuild({
      trigger: "gateway_auth_bootstrap",
      playerId: "player-1",
      fullVisibility: 0,
      seasonEnded: 0,
      tileCount: 256,
      snapshotJsonBytes: 2048,
      tilesJsonBytes: 1536,
      worldStatusJsonBytes: 128,
      cacheEntries: 3,
      cacheBytes: 4096,
      rssMb: 512,
      heapUsedMb: 128
    });
    metrics.observeSimSnapshotBuild({
      trigger: "gateway_fog_refresh",
      playerId: "player-1",
      fullVisibility: 1,
      seasonEnded: 0,
      tileCount: 512,
      snapshotJsonBytes: 4096,
      tilesJsonBytes: 3584,
      worldStatusJsonBytes: 192,
      cacheEntries: 3,
      cacheBytes: 4096,
      rssMb: 520,
      heapUsedMb: 132
    });

    const sample = metrics.snapshot();
    expect(sample.simEventLoopMaxMs).toBe(18);
    expect(sample.simEventLoopDelayMs.p95).toBe(9);
    expect(sample.simTickDurationMs.ai.p50).toBe(4);
    expect(sample.simTickDurationMs.system.p95).toBe(11);
    expect(sample.simPreparePlayerLatencyMs.prepare.p95).toBe(41);
    expect(sample.simPreparePlayerLatencyMs.spawn.p95).toBe(19);
    expect(sample.simHumanInteractiveBacklogMs).toBe(240);
    expect(sample.simAiAutopilotEnabled).toBe(1);
    expect(sample.simAiAutopilotPlayerCount).toBe(20);
    expect(sample.simAiPlannerBreaches).toBe(1);
    expect(sample.simAiCommandTotalByType.SETTLE).toBe(1);
    expect(sample.simAiCommandTotalByType.EXPAND).toBe(1);
    expect(sample.simAiCommandTotalByType.BUILD_ECONOMIC_STRUCTURE).toBe(1);
    expect(sample.simAiCommandRecent).toContain("ai-4:SETTLE");
    expect(sample.simAiCommandRecent).toContain("ai-9:BUILD_ECONOMIC_STRUCTURE");
    expect(sample.simAiPreplanTotalByReason.defer_unaffordable_progression).toBe(1);
    expect(sample.simAiPreplanTotalByReason.choose_domain).toBe(1);
    expect(sample.simAiPreplanRecent).toContain("ai-4:defer_unaffordable_progression");
    expect(sample.simAiPreplanRecent).toContain("ai-9:choose_domain");
    expect(sample.simAiPreplanProgressTotalByState.tech_and_domain_unaffordable).toBe(1);
    expect(sample.simAiPreplanProgressTotalByState.domain_affordable).toBe(1);
    expect(sample.simAiPreplanProgressRecent).toContain("ai-4:tech_and_domain_unaffordable");
    expect(sample.simAiNoopTotalByReason.no_frontier_targets).toBe(1);
    expect(sample.simAiNoopTotalByReason.insufficient_manpower_for_attack).toBe(1);
    expect(sample.simAiNoopTotalByReason.planner_error).toBe(1);
    expect(sample.simAiNoopRecent).toContain("ai-4:no_frontier_targets");
    expect(sample.simAiNoopRecent).toContain("ai-9:planner_error");
    expect(sample.simAiNoFrontierRecent).toContain("source=worker:ai-4:owned=12:owned_frontier=3:frontier=0:hot=0:strategic=0:origins=3:dock_origins=0:scope_keys=24:scope_tiles=22:settle=0:enemy=0:enemy_player=0:barbarian=0:neutral=0:econ=0:scout=0:scaffold=0:waste=2:preplan=tech_unaffordable");
    expect(sample.simCheckpointRssMb).toBe(321.5);
    expect(sample.simCpuPercent).toBe(37.2);
    expect(sample.simHeapUsedMb).toBe(82);
    expect(sample.simHeapTotalMb).toBe(140);
    expect(sample.simGcPauseMs.p95).toBe(12);
    expect(sample.simCommandAcceptLatencyMsByLane.human_interactive.p50).toBe(12);
    expect(sample.simEventStoreWriteMs.p95).toBe(11);
    expect(sample.simAiPlannerPhaseMs.planner_total.p95).toBe(13);
    expect(sample.simAiPlannerPhaseMs.request_plan_round_trip.p95).toBe(21);
    expect(sample.simRuntimeDrainMs.p95).toBe(31);
    expect(sample.simRuntimeDrainMsByLane.ai.p95).toBe(31);
    expect(sample.simRuntimeApplyMsByCommandType.EXPAND?.p95).toBe(17);
    expect(metrics.currentAcceptLatencyP95Ms()).toBe(20);
    expect(sample.simSnapshotTileCount.p95).toBe(512);
    expect(sample.simSnapshotJsonBytes.p95).toBe(4096);
    expect(sample.simSnapshotTilesJsonBytes.p95).toBe(3584);
    expect(sample.simSnapshotCacheEntries).toBe(3);
    expect(sample.simSnapshotCacheBytes).toBe(4096);
    expect(sample.simSnapshotRecent.at(-1)?.trigger).toBe("gateway_fog_refresh");

    // New AI time-budget-cap metrics
    metrics.incrementSimAiTickThrottled("adaptive");
    metrics.incrementSimAiTickThrottled("adaptive");
    metrics.incrementSimAiTickThrottled("budget");
    metrics.incrementSimAiTickThrottled("loop_lag");

    metrics.setSimAiCurrentTickIntervalMs(400);
    metrics.setSimAiBudgetUsedMs(150);

    const budgetSample = metrics.snapshot();
    expect(budgetSample.simAiTickThrottledTotal.adaptive).toBe(2);
    expect(budgetSample.simAiTickThrottledTotal.budget).toBe(1);
    expect(budgetSample.simAiTickThrottledTotal.loop_lag).toBe(1);
    expect(budgetSample.simAiCurrentTickIntervalMs).toBe(400);
    expect(budgetSample.simAiBudgetUsedMs).toBe(150);

    const budgetExposition = metrics.renderPrometheus();
    expect(budgetExposition).toContain('sim_ai_tick_throttled_total{reason="adaptive"} 2');
    expect(budgetExposition).toContain('sim_ai_tick_throttled_total{reason="budget"} 1');
    expect(budgetExposition).toContain('sim_ai_tick_throttled_total{reason="loop_lag"} 1');
    expect(budgetExposition).toContain("sim_ai_current_tick_interval_ms 400");
    expect(budgetExposition).toContain("sim_ai_budget_used_ms 150");

    const exposition = metrics.renderPrometheus();
    expect(exposition).toContain("sim_event_loop_max_ms 18");
    expect(exposition).toContain('sim_event_loop_delay_ms{quantile="p95"}');
    expect(exposition).toContain('sim_tick_duration_ms{source="ai",quantile="p95"}');
    expect(exposition).toContain('sim_prepare_player_latency_ms{source="prepare",quantile="p95"}');
    expect(exposition).toContain("sim_ai_autopilot_enabled 1");
    expect(exposition).toContain("sim_ai_autopilot_player_count 20");
    expect(exposition).toContain("sim_cpu_percent 37.200");
    expect(exposition).toContain('sim_gc_pause_ms{quantile="p95"}');
    expect(exposition).toContain('sim_command_accept_latency_ms{lane="human_interactive",quantile="p95"}');
    expect(exposition).toContain('sim_ai_planner_phase_ms{phase="request_plan_round_trip",quantile="p95"} 21');
    expect(exposition).toContain('sim_runtime_drain_ms{quantile="p95"} 31');
    expect(exposition).toContain('sim_runtime_drain_ms_by_lane{lane="ai",quantile="p95"} 31');
    expect(exposition).toContain('sim_runtime_apply_ms_by_command{type="EXPAND",quantile="p95"} 17');
    expect(exposition).toContain('sim_ai_command_total{type="SETTLE"} 1');
    expect(exposition).toContain('sim_ai_command_total{type="BUILD_ECONOMIC_STRUCTURE"} 1');
    expect(exposition).toContain('sim_ai_preplan_total{reason="defer_unaffordable_progression"} 1');
    expect(exposition).toContain('sim_ai_preplan_progress_total{state="tech_and_domain_unaffordable"} 1');
    expect(exposition).toContain('sim_ai_noop_total{reason="no_frontier_targets"} 1');
    expect(exposition).toContain('sim_ai_noop_total{reason="planner_error"} 1');
    expect(exposition).toContain('sim_snapshot_json_bytes{quantile="p95"}');
    expect(exposition).toContain("sim_snapshot_cache_bytes 4096");
  });

  it("exposes replay-cache gauges and counters", () => {
    const metrics = createSimulationMetrics();
    metrics.setReplayCacheStats({ recordedCommandHistorySize: 42, recordedHistoryEvicted: 3, serverEventsSkipped: 1000 });
    const exposition = metrics.renderPrometheus();
    expect(exposition).toContain("sim_replay_recorded_command_history 42");
    expect(exposition).toContain("sim_replay_history_evicted_total 3");
    expect(exposition).toContain("sim_replay_server_events_skipped_total 1000");
  });

  it("tracks utility AI action class totals and emits prometheus lines", () => {
    const metrics = createSimulationMetrics();

    metrics.observeSimAiUtilityDecision("EXPAND", "ai-1");
    metrics.observeSimAiUtilityDecision("EXPAND", "ai-2");
    metrics.observeSimAiUtilityDecision("SETTLE", "ai-1");
    metrics.observeSimAiUtilityDecision("WAIT", "ai-3");

    const exposition = metrics.renderPrometheus();

    // Observed classes
    expect(exposition).toContain('sim_ai_action_class_total{class="EXPAND"} 2');
    expect(exposition).toContain('sim_ai_action_class_total{class="SETTLE"} 1');
    expect(exposition).toContain('sim_ai_action_class_total{class="WAIT"} 1');

    // Unobserved classes must still appear (zero counts allow alert rules to reference them)
    expect(exposition).toContain('sim_ai_action_class_total{class="ATTACK"} 0');
    expect(exposition).toContain('sim_ai_action_class_total{class="BUILD_ECONOMY"} 0');
    expect(exposition).toContain('sim_ai_action_class_total{class="BUILD_DEFENSE"} 0');
    expect(exposition).toContain('sim_ai_action_class_total{class="MUSTER"} 0');
    expect(exposition).toContain('sim_ai_action_class_total{class="CHOOSE_TECH"} 0');
  });
});
