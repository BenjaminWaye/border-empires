import { describe, expect, it, vi } from "vitest";
import type { Terrain } from "@border-empires/shared";
import { VisionFootprintTable } from "./vision-footprint-table.js";

const makeTable = (
  mountains: Set<string>,
  worldWidth = 200,
  worldHeight = 200,
  forests: Set<string> = new Set()
) => {
  let epoch = 0;
  const terrainAt = vi.fn((x: number, y: number): Terrain | undefined => (mountains.has(`${x},${y}`) ? "MOUNTAIN" : "LAND"));
  const forestAt = vi.fn((x: number, y: number): boolean => forests.has(`${x},${y}`));
  const table = new VisionFootprintTable(worldWidth, worldHeight, {
    terrainAt,
    getTerrainEpoch: () => epoch,
    forestAt
  });
  return {
    table,
    terrainAt,
    forestAt,
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

  it("drops offsets cut short by an unowned forest tile within radius, keeping the forest tile itself and 1 tile past it visible", () => {
    const { table } = makeTable(new Set(), 200, 200, new Set(["51,50"])); // forest 1 tile east
    const offsets = table.getOffsets(50, 50, 4);
    const offsetSet = new Set(offsets.map(([dx, dy]) => `${dx},${dy}`));
    expect(offsetSet.has("1,0")).toBe(true); // the forest tile itself
    expect(offsetSet.has("2,0")).toBe(true); // 1 tile past the forest: still visible
    expect(offsetSet.has("3,0")).toBe(false); // 2 tiles past: occluded
    expect(offsetSet.has("-1,0")).toBe(true); // unrelated bearing, unaffected
  });

  it("does NOT clamp a source tile's own vision when the source tile is itself forest", () => {
    // The source's own terrain never occludes its own vision (see
    // vision-line-of-sight.ts) — standing in a forest doesn't blur your own
    // local sight, so a forest source with no OTHER forest/mountain nearby
    // still gets the full, unclamped square.
    const { table } = makeTable(new Set(), 200, 200, new Set(["50,50"]));
    const offsets = table.getOffsets(50, 50, 4);
    expect(offsets.length).toBe(9 * 9);
  });

  it("forest occlusion never needs invalidation on a mountain-only terrain epoch change", () => {
    // Forest is static terrain; only entries that touched a mountain go in
    // the epoch-scoped tier. A pure forest-driven result must be unaffected
    // (and not rescanned) by an unrelated mountain edit bumping the epoch.
    const { table, forestAt, bumpEpoch } = makeTable(new Set(), 200, 200, new Set(["51,50"]));
    const before = table.getOffsets(50, 50, 4);
    const callsAfterFirst = forestAt.mock.calls.length;

    bumpEpoch(); // simulates an unrelated CREATE_MOUNTAIN elsewhere in the world

    const after = table.getOffsets(50, 50, 4);
    expect(after).toBe(before); // same cached array reference, no rescan
    expect(forestAt.mock.calls.length).toBe(callsAfterFirst);
  });

  it("mountain-touched entries ARE invalidated on epoch change even when forest is also present", () => {
    const mountains = new Set(["49,50"]); // 1 tile west
    const forests = new Set(["51,50"]); // 1 tile east
    const { table, bumpEpoch } = makeTable(mountains, 200, 200, forests);
    const before = table.getOffsets(50, 50, 4);
    const beforeSet = new Set(before.map(([dx, dy]) => `${dx},${dy}`));
    expect(beforeSet.has("-1,0")).toBe(true); // the mountain tile itself
    expect(beforeSet.has("-2,0")).toBe(false); // blocked, behind the mountain

    mountains.delete("49,50");
    bumpEpoch();

    const after = table.getOffsets(50, 50, 4);
    const afterSet = new Set(after.map(([dx, dy]) => `${dx},${dy}`));
    expect(afterSet.has("-2,0")).toBe(true); // mountain gone, now visible
    expect(afterSet.has("2,0")).toBe(true); // forest occlusion still applies (1 tile past)
    expect(afterSet.has("3,0")).toBe(false);
  });
});
