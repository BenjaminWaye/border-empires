import { describe, expect, it } from "vitest";
import { MAX_CACHED_BREACH_LAYOUTS, cachedIncursionBreachLayout, incursionBreachLayoutCacheStats } from "./client-incursion-breach-layout-cache.js";
import { incursionBreachLayout, type BreachNeighbourKind } from "./client-incursion-breach-layout.js";

const around =
  (overrides: Record<string, BreachNeighbourKind>) =>
  (dx: number, dy: number): BreachNeighbourKind =>
    overrides[`${dx},${dy}`] ?? (dx === 0 && dy === 0 ? "pocket" : "mine");

describe("cachedIncursionBreachLayout", () => {
  it("reuses the spikes layout for the same tile and neighbourhood, and matches the uncached one", () => {
    const kinds = around({ "1,0": "pocket" });
    const first = cachedIncursionBreachLayout("spikes", kinds, 31, 47);
    expect(cachedIncursionBreachLayout("spikes", kinds, 31, 47)).toBe(first);
    expect(first).toEqual(incursionBreachLayout("spikes", kinds, 31, 47));
  });

  it("recomputes when a neighbour changes hands or the tile is elsewhere", () => {
    const first = cachedIncursionBreachLayout("spikes", around({}), 5, 6);
    expect(cachedIncursionBreachLayout("spikes", around({ "0,-1": "other" }), 5, 6)).not.toBe(first);
    expect(cachedIncursionBreachLayout("spikes", around({}), 6, 6)).not.toBe(first);
  });

  it("does not cache the other styles", () => {
    const kinds = around({});
    expect(cachedIncursionBreachLayout("ember", kinds, 1, 1)).not.toBe(cachedIncursionBreachLayout("ember", kinds, 1, 1));
  });

  it("never holds more than its bound", () => {
    const kinds = around({});
    const before = incursionBreachLayoutCacheStats().clears;
    for (let i = 0; i <= MAX_CACHED_BREACH_LAYOUTS; i += 1) cachedIncursionBreachLayout("spikes", kinds, i, 1000);
    const stats = incursionBreachLayoutCacheStats();
    expect(stats.size).toBeLessThanOrEqual(MAX_CACHED_BREACH_LAYOUTS);
    expect(stats.clears).toBeGreaterThan(before);
  });
});
