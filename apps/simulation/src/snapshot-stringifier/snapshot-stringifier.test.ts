import { describe, expect, it, vi } from "vitest";

import {
  createChunkedSnapshotStringifier,
  createHybridSnapshotStringifier,
  createInlineSnapshotStringifier,
  createWorkerSnapshotStringifier,
  type SnapshotStringifier
} from "./snapshot-stringifier.js";

describe("createChunkedSnapshotStringifier", () => {
  it("round-trips: JSON.parse(chunked) deep-equals the original payload", async () => {
    const stringify = createChunkedSnapshotStringifier();
    const tiles = Array.from({ length: 5_000 }, (_, i) => ({
      x: i % 200,
      y: Math.floor(i / 200),
      terrain: "GRASS",
      ownerId: i % 7 === 0 ? `player-${i % 13}` : null
    }));
    const payload = { initialState: { tiles, activeLocks: [] }, commandEvents: [] };
    const json = await stringify(payload);
    expect(JSON.parse(json)).toEqual(payload);
  });

  it("produces output identical to JSON.stringify for a representative payload", async () => {
    const stringify = createChunkedSnapshotStringifier();
    const tiles = Array.from({ length: 5_000 }, (_, i) => ({
      x: i % 200,
      y: Math.floor(i / 200),
      terrain: "PLAINS",
      ownerId: null
    }));
    const payload = { initialState: { tiles, activeLocks: [] }, commandEvents: [] };
    expect(await stringify(payload)).toBe(JSON.stringify(payload));
  });

  it("produces output identical to JSON.stringify for an empty payload", async () => {
    const stringify = createChunkedSnapshotStringifier();
    const payload = { initialState: { tiles: [], activeLocks: [] }, commandEvents: [] };
    expect(await stringify(payload)).toBe(JSON.stringify(payload));
  });

  it("produces output identical to JSON.stringify for a single-element array payload", async () => {
    const stringify = createChunkedSnapshotStringifier();
    const payload = {
      initialState: { tiles: [{ x: 0, y: 0, terrain: "GRASS", ownerId: null }], activeLocks: [] },
      commandEvents: []
    };
    expect(await stringify(payload)).toBe(JSON.stringify(payload));
  });

  it("does not chunk (or yield) a realistic checkpoint-sized payload", async () => {
    const onYield = vi.fn();
    const stringify = createChunkedSnapshotStringifier({ onYield });
    // Real compacted checkpoint payloads measured ~5,147 elements on staging;
    // this must stay well under CHUNK_THRESHOLD so it never yields — see the
    // constant's comment for why yielding here is actively harmful under AI
    // planner contention on the sim thread.
    const tiles = Array.from({ length: 5_000 }, (_, i) => ({ x: i, y: 0 }));
    const payload = { initialState: { tiles, activeLocks: [] }, commandEvents: [] };
    await stringify(payload);
    expect(onYield.mock.calls.length).toBe(0);
  });

  it("invokes onYield more than once for a genuinely huge payload", async () => {
    const onYield = vi.fn();
    const stringify = createChunkedSnapshotStringifier({ onYield });
    // Only payloads far beyond any realistic compacted checkpoint (the
    // ~18MB uncompacted fallback case, when no worldgen baseline resolves)
    // should still chunk at all.
    const tiles = Array.from({ length: 250_000 }, (_, i) => ({ x: i, y: 0 }));
    const payload = { initialState: { tiles, activeLocks: [] }, commandEvents: [] };
    await stringify(payload);
    expect(onYield.mock.calls.length).toBeGreaterThan(1);
  });

  it("handles a v1-shaped tileOverlay payload", async () => {
    const stringify = createChunkedSnapshotStringifier();
    const tileOverlay = Array.from({ length: 3_000 }, (_, i) => ({ x: i, y: 0, ownerId: null }));
    const payload = {
      formatVersion: 1,
      tileOverlay,
      activeLocks: [],
      commandEvents: []
    };
    expect(await stringify(payload)).toBe(JSON.stringify(payload));
  });

  it("omits top-level object keys whose value serializes to undefined", async () => {
    const stringify = createChunkedSnapshotStringifier();
    const payload = { a: 1, b: undefined, c: "keep", d: () => 0, e: Symbol("x") };
    const expected = JSON.stringify(payload);
    expect(await stringify(payload)).toBe(expected);
    // Sanity: those keys really are dropped.
    expect(JSON.parse(expected)).toEqual({ a: 1, c: "keep" });
  });

  it("renders undefined/function/symbol holes in a large array as null", async () => {
    const stringify = createChunkedSnapshotStringifier();
    const arr: unknown[] = Array.from({ length: 600 }, (_, i) => i);
    arr[10] = undefined;
    arr[20] = () => 0;
    arr[30] = Symbol("x");
    const payload = { values: arr };
    const expected = JSON.stringify(payload);
    expect(await stringify(payload)).toBe(expected);
    expect((JSON.parse(expected) as { values: unknown[] }).values[10]).toBeNull();
  });

  it("round-trips a large array of objects with undefined-valued properties", async () => {
    const stringify = createChunkedSnapshotStringifier();
    const tiles = Array.from({ length: 5_000 }, (_, i) => ({
      x: i,
      y: 0,
      ownerId: i % 3 === 0 ? undefined : `player-${i % 5}`,
      town: i % 4 === 0 ? undefined : null
    }));
    const payload = { initialState: { tiles, activeLocks: [] }, commandEvents: [] };
    const json = await stringify(payload);
    expect(json).toBe(JSON.stringify(payload));
    expect(JSON.parse(json)).toEqual(JSON.parse(JSON.stringify(payload)));
  });
});

describe("createInlineSnapshotStringifier", () => {
  it("returns the same JSON.stringify output as the built-in", async () => {
    const stringify = createInlineSnapshotStringifier();
    const value = { a: 1, b: ["x", "y"], c: { d: null } };
    expect(await stringify(value)).toBe(JSON.stringify(value));
  });
});

describe("createWorkerSnapshotStringifier", () => {
  it("stringifies payloads in a worker thread and returns the JSON string", async () => {
    const stringify = createWorkerSnapshotStringifier();
    try {
      const value = { tile: { x: 1, y: 2 }, owners: ["a", "b"], deep: { nested: { array: [1, 2, 3] } } };
      const result = await stringify(value);
      expect(result).toBe(JSON.stringify(value));
    } finally {
      await stringify.close();
    }
  });

  it("serializes concurrent stringify requests independently", async () => {
    const stringify = createWorkerSnapshotStringifier();
    try {
      const payloads = Array.from({ length: 8 }, (_, idx) => ({ idx, payload: `value-${idx}` }));
      const results = await Promise.all(payloads.map((p) => stringify(p)));
      results.forEach((json, idx) => {
        expect(json).toBe(JSON.stringify(payloads[idx]));
      });
    } finally {
      await stringify.close();
    }
  });

  it("handles a payload large enough to exercise the cross-thread transfer", async () => {
    const stringify = createWorkerSnapshotStringifier();
    try {
      const tiles = Array.from({ length: 5_000 }, (_, idx) => ({
        x: idx % 200,
        y: Math.floor(idx / 200),
        terrain: "GRASS",
        ownerId: idx % 7 === 0 ? `player-${idx % 13}` : null
      }));
      const result = await stringify({ tiles });
      expect(result).toBe(JSON.stringify({ tiles }));
    } finally {
      await stringify.close();
    }
  });
});

describe("createHybridSnapshotStringifier", () => {
  const trackingWorker = (): SnapshotStringifier & { calls: number } => {
    const worker = (async (payload: unknown) => {
      worker.calls += 1;
      return JSON.stringify(payload);
    }) as SnapshotStringifier & { calls: number };
    worker.calls = 0;
    return worker;
  };

  it("stringifies small payloads inline, never calling the worker", async () => {
    const worker = trackingWorker();
    const stringify = createHybridSnapshotStringifier({ worker, inlineThreshold: 100 });
    const payload = { tileOverlay: Array.from({ length: 50 }, (_, i) => ({ x: i, y: i })) };
    const result = await stringify(payload);
    expect(result).toBe(JSON.stringify(payload));
    expect(worker.calls).toBe(0);
  });

  it("routes payloads at/above the threshold to the worker", async () => {
    const worker = trackingWorker();
    const stringify = createHybridSnapshotStringifier({ worker, inlineThreshold: 100 });
    const payload = { tileOverlay: Array.from({ length: 150 }, (_, i) => ({ x: i, y: i })) };
    const result = await stringify(payload);
    expect(result).toBe(JSON.stringify(payload));
    expect(worker.calls).toBe(1);
  });

  it("checks every top-level array, not just the first key", async () => {
    const worker = trackingWorker();
    const stringify = createHybridSnapshotStringifier({ worker, inlineThreshold: 100 });
    // commandEvents is small; tileOverlay (checked second, but must still count) is large.
    const payload = {
      commandEvents: [1, 2, 3],
      tileOverlay: Array.from({ length: 200 }, (_, i) => i)
    };
    await stringify(payload);
    expect(worker.calls).toBe(1);
  });

  it("stringifies non-array, non-object payloads inline", async () => {
    const worker = trackingWorker();
    const stringify = createHybridSnapshotStringifier({ worker, inlineThreshold: 100 });
    expect(await stringify(null)).toBe(JSON.stringify(null));
    expect(await stringify("scalar")).toBe(JSON.stringify("scalar"));
    expect(worker.calls).toBe(0);
  });

  it("defaults the threshold high enough that a realistic compacted checkpoint stays inline", async () => {
    const worker = trackingWorker();
    const stringify = createHybridSnapshotStringifier({ worker });
    const tileOverlay = Array.from({ length: 5_147 }, (_, i) => ({ x: i % 450, y: Math.floor(i / 450), ownerId: `p-${i}` }));
    await stringify({ tileOverlay });
    expect(worker.calls).toBe(0);
  });

  it("still routes a genuinely huge (uncompacted-fallback-scale) payload to the worker by default", async () => {
    const worker = trackingWorker();
    const stringify = createHybridSnapshotStringifier({ worker });
    const tiles = Array.from({ length: 202_500 }, (_, i) => ({ x: i % 450, y: Math.floor(i / 450) }));
    await stringify({ tiles });
    expect(worker.calls).toBe(1);
  });

  it("exposes close/getWorkerMetrics from the wrapped worker when present", async () => {
    const realWorker = createWorkerSnapshotStringifier();
    const stringify = createHybridSnapshotStringifier({ worker: realWorker, inlineThreshold: 1 });
    expect(typeof stringify.close).toBe("function");
    expect(typeof stringify.getWorkerMetrics).toBe("function");
    await stringify.close?.();
  });
});
