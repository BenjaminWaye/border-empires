import { describe, expect, it } from "vitest";

import { createGatewayMetrics } from "./metrics.js";

describe("gateway metrics", () => {
  it("tracks gauges and latency quantiles", () => {
    const metrics = createGatewayMetrics();
    metrics.setGatewayEventLoopMaxMs(12);
    metrics.observeGatewayEventLoopDelayMs(8);
    metrics.observeGatewayEventLoopDelayMs(16);
    metrics.setGatewayWsSessions(7);
    metrics.setGatewayBackendConnected(true);
    metrics.setGatewayCpuPercent(42.5);
    metrics.setGatewayMemoryUsageMb({ rssMb: 180, heapUsedMb: 62, heapTotalMb: 104 });
    metrics.observeGatewayGcPauseMs(2);
    metrics.observeGatewayGcPauseMs(9);
    metrics.observeGatewayInputToStateUpdateLatencyMs(14);
    metrics.observeGatewayInputToStateUpdateLatencyMs(30);

    metrics.observeGatewayCommandSubmitLatencyMs(10);
    metrics.observeGatewayCommandSubmitLatencyMs(20);
    metrics.observeGatewayCommandSubmitLatencyMs(30);

    metrics.observeGatewaySimRpcLatencyMs(5);
    metrics.observeGatewaySimRpcLatencyMs(15);
    metrics.observeGatewaySimRpcLatencyMs(25);

    const sample = metrics.snapshot();
    expect(sample.gatewayEventLoopMaxMs).toBe(12);
    expect(sample.gatewayEventLoopDelayMs.p50).toBe(8);
    expect(sample.gatewayWsSessions).toBe(7);
    expect(sample.gatewayBackendConnected).toBe(1);
    expect(sample.gatewayCpuPercent).toBe(42.5);
    expect(sample.gatewayRssMb).toBe(180);
    expect(sample.gatewayHeapUsedMb).toBe(62);
    expect(sample.gatewayHeapTotalMb).toBe(104);
    expect(sample.gatewayGcPauseMs.p95).toBe(9);
    expect(sample.gatewayInputToStateUpdateLatencyMs.p95).toBe(30);
    expect(sample.gatewayCommandSubmitLatencyMs.p50).toBe(20);
    expect(sample.gatewaySimRpcLatencyMs.p95).toBe(25);

    const exposition = metrics.renderPrometheus();
    expect(exposition).toContain("gateway_event_loop_max_ms 12");
    expect(exposition).toContain('gateway_event_loop_delay_ms{quantile="p95"}');
    expect(exposition).toContain("gateway_cpu_percent 42.500");
    expect(exposition).toContain('gateway_gc_pause_ms{quantile="p95"}');
    expect(exposition).toContain('gateway_input_to_state_update_latency_ms{quantile="p95"}');
    expect(exposition).toContain('gateway_command_submit_latency_ms{quantile="p95"}');
  });
});
