import { describe, expect, it } from "vitest";

import { createInlineSnapshotStringifier, createWorkerSnapshotStringifier } from "./snapshot-stringifier.js";

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
