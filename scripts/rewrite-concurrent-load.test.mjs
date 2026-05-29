import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseConcurrencyLevels, computeCliffLevel } from "./rewrite-concurrent-load.mjs";

const defaultThresholds = {
  acceptedP99Ms: 250,
  gatewayEventLoopMaxMs: 1000,
  simEventLoopMaxMs: 1000
};

describe("parseConcurrencyLevels", () => {
  it("parses a simple comma-separated list", () => {
    assert.deepStrictEqual(parseConcurrencyLevels("5,10,20"), [5, 10, 20]);
  });

  it("handles whitespace around values", () => {
    assert.deepStrictEqual(parseConcurrencyLevels(" 5 , 10 , 20 "), [5, 10, 20]);
  });

  it("handles trailing comma", () => {
    assert.deepStrictEqual(parseConcurrencyLevels("2,4,"), [2, 4]);
  });

  it("handles single value", () => {
    assert.deepStrictEqual(parseConcurrencyLevels("42"), [42]);
  });

  it("rejects non-integer values", () => {
    assert.throws(() => parseConcurrencyLevels("5,abc,10"), /positive integers/);
    assert.throws(() => parseConcurrencyLevels("5.5,10"), /positive integers/);
  });

  it("rejects zero and negative values", () => {
    assert.throws(() => parseConcurrencyLevels("0,10"), /positive integers/);
    assert.throws(() => parseConcurrencyLevels("-1,10"), /positive integers/);
  });

  it("rejects empty string", () => {
    assert.throws(() => parseConcurrencyLevels(""), /must not be empty/);
  });

  it("rejects whitespace-only string", () => {
    assert.throws(() => parseConcurrencyLevels(" , , "), /must not be empty/);
  });
});

describe("computeCliffLevel", () => {
  const makeRecord = (level, overrides = {}) => ({
    level,
    initFailures: 0,
    acceptedP99Ms: null,
    gatewayEventLoopMaxMs: null,
    simEventLoopMaxMs: null,
    ...overrides
  });

  it("returns null when all levels pass", () => {
    const records = [
      makeRecord(5, { acceptedP99Ms: 100, gatewayEventLoopMaxMs: 50, simEventLoopMaxMs: 60 }),
      makeRecord(10, { acceptedP99Ms: 150, gatewayEventLoopMaxMs: 80, simEventLoopMaxMs: 90 }),
      makeRecord(20, { acceptedP99Ms: 200, gatewayEventLoopMaxMs: 200, simEventLoopMaxMs: 200 })
    ];
    assert.strictEqual(computeCliffLevel(records, defaultThresholds), null);
  });

  it("detects cliff from init failures", () => {
    const records = [
      makeRecord(5),
      makeRecord(10, { initFailures: 1 })
    ];
    assert.strictEqual(computeCliffLevel(records, defaultThresholds), 10);
  });

  it("detects cliff from acceptedP99Ms threshold", () => {
    const records = [
      makeRecord(5, { acceptedP99Ms: 100 }),
      makeRecord(10, { acceptedP99Ms: 300 })
    ];
    assert.strictEqual(computeCliffLevel(records, defaultThresholds), 10);
  });

  it("detects cliff from gatewayEventLoopMaxMs threshold", () => {
    const records = [
      makeRecord(5, { gatewayEventLoopMaxMs: 500 }),
      makeRecord(10, { gatewayEventLoopMaxMs: 1200 })
    ];
    assert.strictEqual(computeCliffLevel(records, defaultThresholds), 10);
  });

  it("detects cliff from simEventLoopMaxMs threshold", () => {
    const records = [
      makeRecord(5, { simEventLoopMaxMs: 500 }),
      makeRecord(20, { simEventLoopMaxMs: 1500 })
    ];
    assert.strictEqual(computeCliffLevel(records, defaultThresholds), 20);
  });

  it("returns the lowest failing level", () => {
    const records = [
      makeRecord(5),
      makeRecord(10, { gatewayEventLoopMaxMs: 2000 }),
      makeRecord(20, { acceptedP99Ms: 500 })
    ];
    assert.strictEqual(computeCliffLevel(records, defaultThresholds), 10);
  });

  it("handles null metrics gracefully", () => {
    const records = [
      makeRecord(5, { acceptedP99Ms: null, gatewayEventLoopMaxMs: null, simEventLoopMaxMs: null })
    ];
    assert.strictEqual(computeCliffLevel(records, defaultThresholds), null);
  });

  it("exact boundary: equal to threshold is a fail", () => {
    const records = [
      makeRecord(5, { acceptedP99Ms: 250 })
    ];
    assert.strictEqual(computeCliffLevel(records, defaultThresholds), 5);
  });

  it("empty records returns null", () => {
    assert.strictEqual(computeCliffLevel([], defaultThresholds), null);
  });
});
