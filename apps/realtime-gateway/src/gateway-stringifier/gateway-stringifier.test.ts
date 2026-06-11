import { describe, expect, it } from "vitest";

import { createGatewayStringifier } from "./gateway-stringifier.js";

describe("createGatewayStringifier", () => {
  it("stringifies a payload in the worker and returns the JSON string", async () => {
    const stringify = createGatewayStringifier();
    try {
      const value = { tile: { x: 1, y: 2 }, owners: ["a", "b"], deep: { nested: { array: [1, 2, 3] } } };
      expect(await stringify(value)).toBe(JSON.stringify(value));
    } finally {
      await stringify.close();
    }
  });

  it("handles concurrent stringify requests independently", async () => {
    const stringify = createGatewayStringifier();
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

  it("handles a payload large enough to exercise cross-thread transfer (~256KB bootstrap size)", async () => {
    const stringify = createGatewayStringifier();
    try {
      const tiles = Array.from({ length: 3_770 }, (_, idx) => ({
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
