import { describe, expect, it, vi } from "vitest";

import {
  createChunkedSnapshotStringifier,
  createInlineSnapshotStringifier,
  createWorkerSnapshotStringifier
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

  it("invokes onYield more than once for a large payload", async () => {
    const onYield = vi.fn();
    const stringify = createChunkedSnapshotStringifier({ onYield });
    // 5000 tiles > CHUNK_THRESHOLD(500); CHUNK_SIZE(2000) → 3 slices → 2 yields
    const tiles = Array.from({ length: 5_000 }, (_, i) => ({ x: i, y: 0 }));
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
