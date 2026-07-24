import { describe, expect, it, vi } from "vitest";
import type { Terrain } from "@border-empires/shared";
import { setWorldSeed } from "@border-empires/shared";
import { VisionFootprintTable } from "./vision-footprint-table.js";

// Same seed/coordinate used by client-forest-3d-regression.test.ts to confirm
// this is a real forest tile under the deterministic world generator.
const KNOWN_FOREST_TILE = { x: 24, y: 15 };

// A forest tile per isForestTileAt's definition (GRASS biome + DARK shade)
// depends on the deterministic world seed. Rather than hunting for a real
// forest coordinate, these tests focus on mountain occlusion (fully
// controllable via the injected terrainAt) and verify the forest path only
// through the exported constant contract (radius clamp), independently
// covered by client-forest-3d-regression.test.ts and the isForestTileAt
// definition itself.

const makeTable = (mountains: Set<string>, worldWidth = 200, worldHeight = 200) => {
  let epoch = 0;
  const terrainAt = vi.fn((x: number, y: number): Terrain | undefined => (mountains.has(`${x},${y}`) ? "MOUNTAIN" : "LAND"));
  const table = new VisionFootprintTable(worldWidth, worldHeight, {
    terrainAt,
    getTerrainEpoch: () => epoch
  });
  return {
    table,
    terrainAt,
    bumpEpoch: () => {
      epoch += 1;
    }
  };
};

describe("VisionFootprintTable", () => {
  it("returns the full square footprint when there is no mountain nearby", () => {
    const { table } = makeTable(new Set());
    const offsets = table.getOffsets(50, 50, 3);
    expect(offsets.length).toBe(7 * 7);
  });

  it("shares the same array reference across distinct clean tiles at the same radius (no per-tile allocation)", () => {
    const { table } = makeTable(new Set());
    const a = table.getOffsets(10, 10, 3);
    const b = table.getOffsets(90, 90, 3);
    expect(a).toBe(b);
  });

  it("drops offsets blocked by a mountain, keeping the mountain tile itself visible", () => {
    const { table } = makeTable(new Set(["51,50"]));
    const offsets = table.getOffsets(50, 50, 3);
    const offsetSet = new Set(offsets.map(([dx, dy]) => `${dx},${dy}`));
    expect(offsetSet.has("1,0")).toBe(true); // the mountain itself
    expect(offsetSet.has("2,0")).toBe(false); // behind it
    expect(offsetSet.has("3,0")).toBe(false); // further behind
    expect(offsetSet.has("-1,0")).toBe(true); // unaffected bearing
  });

  it("memoizes an occluded tile's footprint so a second call doesn't rescan", () => {
    const { table, terrainAt } = makeTable(new Set(["51,50"]));
    table.getOffsets(50, 50, 3);
    const callsAfterFirst = terrainAt.mock.calls.length;
    table.getOffsets(50, 50, 3);
    expect(terrainAt.mock.calls.length).toBe(callsAfterFirst);
  });

  it("memoizes a clean tile's negative result so a second call doesn't rescan", () => {
    const { table, terrainAt } = makeTable(new Set());
    table.getOffsets(50, 50, 3);
    const callsAfterFirst = terrainAt.mock.calls.length;
    expect(callsAfterFirst).toBeGreaterThan(0);
    table.getOffsets(50, 50, 3);
    expect(terrainAt.mock.calls.length).toBe(callsAfterFirst);
  });

  it("invalidates memoized footprints when the terrain epoch changes", () => {
    const mountains = new Set(["51,50"]);
    const { table, bumpEpoch } = makeTable(mountains);
    const before = table.getOffsets(50, 50, 3);
    const beforeSet = new Set(before.map(([dx, dy]) => `${dx},${dy}`));
    expect(beforeSet.has("2,0")).toBe(false);

    // Mountain removed; bump epoch as the runtime does on REMOVE_MOUNTAIN.
    mountains.delete("51,50");
    bumpEpoch();

    const after = table.getOffsets(50, 50, 3);
    const afterSet = new Set(after.map(([dx, dy]) => `${dx},${dy}`));
    expect(afterSet.has("2,0")).toBe(true);
  });

  it("does not invalidate when the epoch is unchanged", () => {
    const { table, terrainAt } = makeTable(new Set(["51,50"]));
    table.getOffsets(50, 50, 3);
    const callsAfterFirst = terrainAt.mock.calls.length;
    table.getOffsets(50, 50, 3);
    table.getOffsets(50, 50, 3);
    expect(terrainAt.mock.calls.length).toBe(callsAfterFirst);
  });

  it("shares memoized state for a tile queried via an out-of-range (wrap-equivalent) coordinate", () => {
    // The memo key packs wrapped (x, y), not raw (x, y) — an out-of-range
    // query for the same physical tile must reuse the same cached entry
    // instead of scanning (and potentially disagreeing) again.
    const { table, terrainAt } = makeTable(new Set(["51,50"]), 100, 100);
    table.getOffsets(50, 50, 3);
    const callsAfterFirst = terrainAt.mock.calls.length;
    const wrapped = table.getOffsets(150, 150, 3); // 150 % 100 === 50
    expect(terrainAt.mock.calls.length).toBe(callsAfterFirst);
    const offsetSet = new Set(wrapped.map(([dx, dy]) => `${dx},${dy}`));
    expect(offsetSet.has("2,0")).toBe(false); // still occluded, from the memoized entry
  });

  it("clamps a forest source tile's vision to FOREST_VISION_RANGE regardless of requested radius", () => {
    setWorldSeed(1);
    const { table } = makeTable(new Set());
    const offsets = table.getOffsets(KNOWN_FOREST_TILE.x, KNOWN_FOREST_TILE.y, 6);
    // Radius clamped to 1 -> a 3x3 square (9 offsets), not the requested 13x13.
    expect(offsets.length).toBe(3 * 3);
    const offsetSet = new Set(offsets.map(([dx, dy]) => `${dx},${dy}`));
    expect(offsetSet.has("1,1")).toBe(true);
    expect(offsetSet.has("2,0")).toBe(false);
  });
});
