import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseConcurrencyLevels,
  computeCliffLevel,
  parseMuster,
  collectSettleCandidates,
  collectMusterHoldCandidates,
  collectMusterAdvanceCandidates,
  pickCandidatePayload
} from "./rewrite-concurrent-load.mjs";

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

  it("detects cliff from simWriterQueueDepthMaxDepth when threshold is set", () => {
    const records = [
      makeRecord(5, { simWriterQueueDepthMaxDepth: 50 }),
      makeRecord(10, { simWriterQueueDepthMaxDepth: 420 })
    ];
    const thresholds = { ...defaultThresholds, simWriterQueueDepthMaxDepth: 400 };
    assert.strictEqual(computeCliffLevel(records, thresholds), 10);
  });

  it("ignores simWriterQueueDepthMaxDepth when no threshold is configured", () => {
    const records = [
      makeRecord(5, { simWriterQueueDepthMaxDepth: 9999 })
    ];
    assert.strictEqual(computeCliffLevel(records, defaultThresholds), null);
  });

  it("detects cliff from a single action type exceeding the per-type SLA", () => {
    const records = [
      makeRecord(5, {
        byActionType: {
          EXPAND: { maxMs: 200 },
          ATTACK: { maxMs: 300 },
          SETTLE: { maxMs: 250 },
          SET_MUSTER: { maxMs: 100 }
        }
      }),
      makeRecord(10, {
        byActionType: {
          EXPAND: { maxMs: 200 },
          ATTACK: { maxMs: 300 },
          SETTLE: { maxMs: 1400 }, // SETTLE alone blows the SLA — pooled stats could hide this
          SET_MUSTER: { maxMs: 100 }
        }
      })
    ];
    const thresholds = { ...defaultThresholds, acceptedMaxMsByType: 1000 };
    assert.strictEqual(computeCliffLevel(records, thresholds), 10);
  });

  it("ignores byActionType when no per-type SLA is configured", () => {
    const records = [
      makeRecord(5, { byActionType: { SETTLE: { maxMs: 99999 } } })
    ];
    assert.strictEqual(computeCliffLevel(records, defaultThresholds), null);
  });
});

describe("parseMuster", () => {
  it("parses a valid muster JSON blob", () => {
    assert.deepStrictEqual(parseMuster('{"mode":"HOLD","troops":40}'), { mode: "HOLD", troops: 40 });
  });

  it("returns undefined for missing/empty/invalid input", () => {
    assert.strictEqual(parseMuster(undefined), undefined);
    assert.strictEqual(parseMuster(""), undefined);
    assert.strictEqual(parseMuster("not json"), undefined);
    assert.strictEqual(parseMuster("{}"), undefined); // no `mode` field
  });
});

describe("action candidate generators", () => {
  const emptySet = () => new Set();

  it("collectSettleCandidates finds owned FRONTIER LAND tiles without a town", () => {
    const tiles = new Map([
      ["0,0", { x: 0, y: 0, ownerId: "p1", terrain: "LAND", ownershipState: "FRONTIER" }],
      ["1,0", { x: 1, y: 0, ownerId: "p1", terrain: "LAND", ownershipState: "FRONTIER", hasTown: true }],
      ["2,0", { x: 2, y: 0, ownerId: "p1", terrain: "LAND", ownershipState: "FRONTIER", townPopulationTier: "TOWN" }],
      ["3,0", { x: 3, y: 0, ownerId: "other", terrain: "LAND", ownershipState: "FRONTIER" }],
      // Owned and town-free but not a frontier tile — SETTLE_INVALID territory,
      // per handleSettleCommand's ownershipState !== "FRONTIER" check.
      ["4,0", { x: 4, y: 0, ownerId: "p1", terrain: "LAND", ownershipState: "SETTLED" }]
    ]);
    const candidates = collectSettleCandidates(tiles, "p1", emptySet(), emptySet());
    assert.deepStrictEqual(candidates, [{ type: "SETTLE", x: 0, y: 0 }]);
  });

  it("collectMusterHoldCandidates finds owned tiles with no muster flag", () => {
    const tiles = new Map([
      ["0,0", { x: 0, y: 0, ownerId: "p1", terrain: "LAND" }],
      ["1,0", { x: 1, y: 0, ownerId: "p1", terrain: "LAND", muster: { mode: "HOLD" } }]
    ]);
    const candidates = collectMusterHoldCandidates(tiles, "p1", emptySet(), emptySet());
    assert.deepStrictEqual(candidates, [{ type: "SET_MUSTER", x: 0, y: 0, mode: "HOLD" }]);
  });

  it("collectMusterAdvanceCandidates only fires on HOLD flags with enough mustered manpower", () => {
    const tiles = new Map([
      ["0,0", { x: 0, y: 0, ownerId: "p1", terrain: "LAND" }],
      ["1,0", { x: 1, y: 0, ownerId: "p1", terrain: "LAND", muster: { mode: "HOLD", amount: 60 } }],
      ["2,0", { x: 2, y: 0, ownerId: "p1", terrain: "LAND", muster: { mode: "ADVANCE", amount: 60 } }],
      // HOLD but not enough accrued yet — not ready, would just get INSUFFICIENT_MUSTER.
      ["3,0", { x: 3, y: 0, ownerId: "p1", terrain: "LAND", muster: { mode: "HOLD", amount: 15 } }]
    ]);
    const candidates = collectMusterAdvanceCandidates(tiles, "p1", emptySet(), emptySet());
    assert.deepStrictEqual(candidates, [{ type: "SET_MUSTER", x: 1, y: 0, mode: "ADVANCE" }]);
  });

  it("pickCandidatePayload falls back to whatever exists when nothing is weighted", () => {
    const tiles = new Map([
      ["0,0", { x: 0, y: 0, ownerId: "p1", terrain: "LAND", hasTown: true, muster: { mode: "ADVANCE" } }]
    ]);
    // Nothing eligible for EXPAND/ATTACK (no neighbors at all), SETTLE (already
    // has a town), or MUSTER_HOLD/MUSTER_ADVANCE (already ADVANCE) — undefined.
    assert.strictEqual(pickCandidatePayload(tiles, "p1", emptySet(), emptySet()), undefined);
  });

  it("pickCandidatePayload returns a SETTLE candidate when it's the only eligible pool", () => {
    // No neighbors -> no EXPAND/ATTACK; muster already ADVANCE -> excludes both
    // MUSTER_HOLD (already has a flag) and MUSTER_ADVANCE (needs mode HOLD) —
    // SETTLE is the only pool left, so this is deterministic, not a weighted pick.
    const tiles = new Map([
      ["0,0", { x: 0, y: 0, ownerId: "p1", terrain: "LAND", ownershipState: "FRONTIER", muster: { mode: "ADVANCE" } }]
    ]);
    const candidate = pickCandidatePayload(tiles, "p1", emptySet(), emptySet());
    assert.deepStrictEqual(candidate, { type: "SETTLE", x: 0, y: 0 });
  });
});
