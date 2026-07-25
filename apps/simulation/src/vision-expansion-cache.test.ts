import { describe, expect, it } from "vitest";
import type { Terrain } from "@border-empires/shared";
import { VisionExpansionCache } from "./vision-expansion-cache.js";
import { VisionFootprintTable } from "./vision-footprint-table.js";

describe("VisionExpansionCache", () => {
  it("with no footprint table injected, dilates a plain square (backward compatible default)", () => {
    // vision=4 (× VISION_RADIUS=1) constructs a radius-4 footprint so this
    // test can exercise multi-tile dilation independent of the base radius.
    const cache = new VisionExpansionCache(200, 200);
    const keys = cache.getOrCompute("player-1", ["10,10"], 4, 0, 1);
    expect(keys.has("13,10")).toBe(true);
  });

  it("returns the same cached Set on a repeat call with an unchanged signature", () => {
    const cache = new VisionExpansionCache(200, 200);
    const first = cache.getOrCompute("player-1", ["10,10"], 1, 0, 1);
    const second = cache.getOrCompute("player-1", ["10,10"], 1, 0, 1);
    expect(second).toBe(first);
  });

  it("applies an injected footprint table's mountain occlusion when expanding territory", () => {
    // vision=4 gives enough radius for a tile behind the mountain (dx=2) to
    // differ from an unrelated-bearing tile (dy=3) — both need room beyond
    // VISION_RADIUS=1 to exercise occlusion meaningfully.
    const terrainAt = (x: number, y: number): Terrain | undefined => (x === 11 && y === 10 ? "MOUNTAIN" : "LAND");
    const footprintTable = new VisionFootprintTable(200, 200, { terrainAt, getTerrainEpoch: () => 0 });
    const cache = new VisionExpansionCache(200, 200, footprintTable);
    const keys = cache.getOrCompute("player-1", ["10,10"], 4, 0, 1);
    expect(keys.has("11,10")).toBe(true); // mountain tile itself visible
    expect(keys.has("12,10")).toBe(false); // behind mountain, occluded
    expect(keys.has("10,13")).toBe(true); // unrelated bearing, unaffected
  });

  it("recomputes when the tileCollectionVersion signature changes", () => {
    const cache = new VisionExpansionCache(200, 200);
    const first = cache.getOrCompute("player-1", ["10,10"], 4, 0, 1);
    const second = cache.getOrCompute("player-1", ["20,20"], 4, 0, 2);
    expect(second).not.toBe(first);
    expect(second.has("23,20")).toBe(true);
    expect(second.has("13,10")).toBe(false);
  });
});
