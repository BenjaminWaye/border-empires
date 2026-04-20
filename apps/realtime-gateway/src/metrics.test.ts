import { describe, expect, it } from "vitest";

import { createGatewayMetrics } from "./metrics.js";

describe("gateway metrics", () => {
  it("tracks gauges and latency quantiles", () => {
    const metrics = createGatewayMetrics();
    metrics.setGatewayEventLoopMaxMs(12);
    metrics.setGatewayWsSessions(7);
    metrics.setGatewayBackendConnected(true);

    metrics.observeGatewayCommandSubmitLatencyMs(10);
    metrics.observeGatewayCommandSubmitLatencyMs(20);
    metrics.observeGatewayCommandSubmitLatencyMs(30);

    metrics.observeGatewaySimRpcLatencyMs(5);
    metrics.observeGatewaySimRpcLatencyMs(15);
    metrics.observeGatewaySimRpcLatencyMs(25);

    const sample = metrics.snapshot();
    expect(sample.gatewayEventLoopMaxMs).toBe(12);
    expect(sample.gatewayWsSessions).toBe(7);
    expect(sample.gatewayBackendConnected).toBe(1);
    expect(sample.gatewayCommandSubmitLatencyMs.p50).toBe(20);
    expect(sample.gatewaySimRpcLatencyMs.p95).toBe(25);

    const exposition = metrics.renderPrometheus();
    expect(exposition).toContain("gateway_event_loop_max_ms 12");
    expect(exposition).toContain('gateway_command_submit_latency_ms{quantile="p95"}');
  });
});
