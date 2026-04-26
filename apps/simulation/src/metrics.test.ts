import { describe, expect, it } from "vitest";

import { createSimulationMetrics } from "./metrics.js";

describe("simulation metrics", () => {
  it("tracks backlog, planner breaches, and lane quantiles", () => {
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
    metrics.setSimCheckpointRssMb(321.5);
    metrics.setSimCpuPercent(37.2);
    metrics.setSimHeapUsageMb({ heapUsedMb: 82, heapTotalMb: 140 });
    metrics.observeSimGcPauseMs(3);
    metrics.observeSimGcPauseMs(12);
    metrics.incrementSimAiPlannerBreaches();

    metrics.observeSimCommandAcceptLatencyMs("human_interactive", 8);
    metrics.observeSimCommandAcceptLatencyMs("human_interactive", 12);
    metrics.observeSimCommandAcceptLatencyMs("human_interactive", 20);
    metrics.observeSimCommandAcceptLatencyMs("ai", 1);
    metrics.observeSimCommandAcceptLatencyMs("system", 2);
    metrics.observeSimEventStoreWriteMs(3);
    metrics.observeSimEventStoreWriteMs(7);
    metrics.observeSimEventStoreWriteMs(11);

    const sample = metrics.snapshot();
    expect(sample.simEventLoopMaxMs).toBe(18);
    expect(sample.simEventLoopDelayMs.p95).toBe(9);
    expect(sample.simTickDurationMs.ai.p50).toBe(4);
    expect(sample.simTickDurationMs.system.p95).toBe(11);
    expect(sample.simPreparePlayerLatencyMs.prepare.p95).toBe(41);
    expect(sample.simPreparePlayerLatencyMs.spawn.p95).toBe(19);
    expect(sample.simHumanInteractiveBacklogMs).toBe(240);
    expect(sample.simAiPlannerBreaches).toBe(1);
    expect(sample.simCheckpointRssMb).toBe(321.5);
    expect(sample.simCpuPercent).toBe(37.2);
    expect(sample.simHeapUsedMb).toBe(82);
    expect(sample.simHeapTotalMb).toBe(140);
    expect(sample.simGcPauseMs.p95).toBe(12);
    expect(sample.simCommandAcceptLatencyMsByLane.human_interactive.p50).toBe(12);
    expect(sample.simEventStoreWriteMs.p95).toBe(11);
    expect(metrics.currentAcceptLatencyP95Ms()).toBe(20);

    const exposition = metrics.renderPrometheus();
    expect(exposition).toContain("sim_event_loop_max_ms 18");
    expect(exposition).toContain('sim_event_loop_delay_ms{quantile="p95"}');
    expect(exposition).toContain('sim_tick_duration_ms{source="ai",quantile="p95"}');
    expect(exposition).toContain('sim_prepare_player_latency_ms{source="prepare",quantile="p95"}');
    expect(exposition).toContain("sim_cpu_percent 37.200");
    expect(exposition).toContain('sim_gc_pause_ms{quantile="p95"}');
    expect(exposition).toContain('sim_command_accept_latency_ms{lane="human_interactive",quantile="p95"}');
  });
});
