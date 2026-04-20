import { describe, expect, it } from "vitest";

import { createSimulationMetrics } from "./metrics.js";

describe("simulation metrics", () => {
  it("tracks backlog, planner breaches, and lane quantiles", () => {
    const metrics = createSimulationMetrics();
    metrics.setSimEventLoopMaxMs(18);
    metrics.setSimHumanInteractiveBacklogMs(240);
    metrics.setSimCheckpointRssMb(321.5);
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
    expect(sample.simHumanInteractiveBacklogMs).toBe(240);
    expect(sample.simAiPlannerBreaches).toBe(1);
    expect(sample.simCheckpointRssMb).toBe(321.5);
    expect(sample.simCommandAcceptLatencyMsByLane.human_interactive.p50).toBe(12);
    expect(sample.simEventStoreWriteMs.p95).toBe(11);
    expect(metrics.currentAcceptLatencyP95Ms()).toBe(20);

    const exposition = metrics.renderPrometheus();
    expect(exposition).toContain("sim_event_loop_max_ms 18");
    expect(exposition).toContain('sim_command_accept_latency_ms{lane="human_interactive",quantile="p95"}');
  });
});
