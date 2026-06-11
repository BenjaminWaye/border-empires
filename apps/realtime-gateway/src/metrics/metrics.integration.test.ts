import { describe, expect, it } from "vitest";

import { createGatewayMetrics } from "./metrics.js";

describe("gateway metrics integration", () => {
  it("computes p95 for a known latency series", () => {
    const metrics = createGatewayMetrics();
    for (let i = 1; i <= 100; i += 1) {
      metrics.observeGatewayCommandSubmitLatencyMs(i);
    }

    const sample = metrics.snapshot();
    expect(sample.gatewayCommandSubmitLatencyMs.p50).toBe(50);
    expect(sample.gatewayCommandSubmitLatencyMs.p95).toBe(95);
    expect(sample.gatewayCommandSubmitLatencyMs.p99).toBe(99);
  });
});
