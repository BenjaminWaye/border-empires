import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parsePrometheus, quantile, safeCollectMetricsSample } from "./rewrite-load-harness-metrics.mjs";

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
