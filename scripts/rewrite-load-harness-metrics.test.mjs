import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isEventLoopMetricsStable,
  maxMetricSample,
  parsePrometheus,
  quantile,
  safeCollectMetricsSample
} from "./rewrite-load-harness-metrics.mjs";

describe("parsePrometheus", () => {
  it("parses simple metric lines", () => {
    const text = "gateway_event_loop_max_ms 12.5\nsim_checkpoint_rss_mb 128\n";
    assert.deepStrictEqual(parsePrometheus(text), {
      gateway_event_loop_max_ms: 12.5,
      sim_checkpoint_rss_mb: 128
    });
  });

  it("ignores comments and blank lines", () => {
    const text = "# HELP foo bar\n\n# TYPE foo gauge\nfoo 1\n";
    assert.deepStrictEqual(parsePrometheus(text), { foo: 1 });
  });

  it("skips lines with non-numeric values", () => {
    const text = "foo not-a-number\nbar 2\n";
    assert.deepStrictEqual(parsePrometheus(text), { bar: 2 });
  });
});

describe("quantile", () => {
  it("returns null for empty input", () => {
    assert.strictEqual(quantile([], 0.95), null);
  });

  it("computes p95 over a sorted set", () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1);
    assert.strictEqual(quantile(values, 0.95), 95);
  });
});

describe("maxMetricSample", () => {
  it("returns null for no samples", () => {
    assert.strictEqual(maxMetricSample([], "simulation", "sim_event_loop_max_ms"), null);
  });

  // Regression: result files kept only Math.max(...values) with no timestamp,
  // so a gate-failing spike like the 2026-08-24 nightly (simEventLoopMaxMs: 193)
  // gave no way to tell when it happened relative to warmup/soak/checkpointing.
  it("returns the sample's timestamp alongside the peak value", () => {
    const samples = [
      { at: 100, simulation: { sim_event_loop_max_ms: 20 } },
      { at: 200, simulation: { sim_event_loop_max_ms: 193 } },
      { at: 300, simulation: { sim_event_loop_max_ms: 40 } }
    ];
    assert.deepStrictEqual(maxMetricSample(samples, "simulation", "sim_event_loop_max_ms"), { at: 200, value: 193 });
  });

  it("treats a missing metric key on a sample as 0", () => {
    const samples = [{ at: 100, simulation: {} }, { at: 200, simulation: { sim_event_loop_max_ms: 5 } }];
    assert.deepStrictEqual(maxMetricSample(samples, "simulation", "sim_event_loop_max_ms"), { at: 200, value: 5 });
  });
});

describe("isEventLoopMetricsStable", () => {
  const limits = { gatewayEventLoopGateLimitMs: 500, simEventLoopGateLimitMs: 150 };

  it("is stable when all three metrics are under their limits", () => {
    const sample = {
      gateway: { gateway_event_loop_max_ms: 5 },
      simulation: { sim_event_loop_max_ms: 10, 'sim_event_loop_delay_ms{quantile="p99"}': 12 }
    };
    assert.strictEqual(isEventLoopMetricsStable(sample, limits).stable, true);
  });

  // Regression: the 2026-09-03/04 nightly gate failures traced to a
  // one-time cold-start replay spike still sitting in the sim's rolling
  // p99 window (~51s) for tens of seconds after sim_event_loop_max_ms (a
  // short-window gauge) had already reset and looked stable. Warmup used
  // to check only the gauge, so it declared "stable" while the metric the
  // actual gate reads (the p99 quantile) was still elevated.
  it("is NOT stable when only the p99 quantile is still elevated after a cold-start spike, even if the instant max gauge already reset", () => {
    const sample = {
      gateway: { gateway_event_loop_max_ms: 5 },
      simulation: { sim_event_loop_max_ms: 10, 'sim_event_loop_delay_ms{quantile="p99"}': 354 }
    };
    const result = isEventLoopMetricsStable(sample, limits);
    assert.strictEqual(result.stable, false);
    assert.strictEqual(result.simEventLoopP99Ms, 354);
  });

  it("is not stable when the gateway event loop max is over its limit", () => {
    const sample = {
      gateway: { gateway_event_loop_max_ms: 600 },
      simulation: { sim_event_loop_max_ms: 10, 'sim_event_loop_delay_ms{quantile="p99"}': 12 }
    };
    assert.strictEqual(isEventLoopMetricsStable(sample, limits).stable, false);
  });

  it("treats missing metric keys as 0 (stable)", () => {
    const sample = { gateway: {}, simulation: {} };
    assert.strictEqual(isEventLoopMetricsStable(sample, limits).stable, true);
  });
});

describe("safeCollectMetricsSample", () => {
  it("pushes the resolved sample onto samples and returns true", async () => {
    const samples = [];
    const errors = [];
    const ok = await safeCollectMetricsSample(async () => ({ at: 1, gateway: {}, simulation: {} }), samples, errors, "test");
    assert.strictEqual(ok, true);
    assert.strictEqual(samples.length, 1);
    assert.strictEqual(errors.length, 0);
  });

  // Regression test: this is the exact failure mode from the 2026-07-14
  // nightly run. The simulation process died mid-soak, so the final
  // post-soak metrics scrape rejected with ECONNREFUSED. Before this fix,
  // that rejection was unhandled at the top level of
  // rewrite-load-harness.mjs and crashed the whole harness process before
  // it could write docs/load-results/<date>.json, discarding every batch
  // and sample collected during the run.
  it("never throws when the read function rejects, and records the error instead", async () => {
    const samples = [{ at: 0, gateway: {}, simulation: {} }];
    const errors = [];
    const rejection = new Error("connect ECONNREFUSED 127.0.0.1:50052");

    const ok = await safeCollectMetricsSample(async () => {
      throw rejection;
    }, samples, errors, "final metrics collection failed");

    assert.strictEqual(ok, false);
    // The sample list is untouched — no partial/garbage entry was added.
    assert.strictEqual(samples.length, 1);
    assert.strictEqual(errors.length, 1);
    assert.match(errors[0].message, /^final metrics collection failed: connect ECONNREFUSED/);
    assert.strictEqual(typeof errors[0].at, "number");
  });

  it("truncates overly long error messages to 400 chars", async () => {
    const errors = [];
    const longMessage = "x".repeat(1000);
    await safeCollectMetricsSample(async () => {
      throw new Error(longMessage);
    }, [], errors, "label");
    assert.ok(errors[0].message.length <= "label: ".length + 400);
  });
});
