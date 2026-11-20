import { describe, expect, it } from "vitest";
import type { Terrain } from "@border-empires/shared";
import { VisibilityCoverageCache } from "./visibility-coverage-raster.js";
import { VisionFootprintTable } from "./vision-footprint-table.js";

// Regression: removing a vision footprint recomputed its cells from the live
// terrain. A mountain raised or removed in range between the add and the
// remove made the remove subtract different cells: some tiles stayed visible
// for good, others left view while still seen. The raster now remembers the
// cells each contribution added (visibility-footprint-ledger.ts).
const world = () => {
  const terrain = new Map<string, Terrain>();
  let epoch = 0;
  const table = new VisionFootprintTable(200, 200, {
    terrainAt: (x, y) => terrain.get(`${x},${y}`) ?? "LAND",
    getTerrainEpoch: () => epoch,
    forestAt: () => false
  });
  const edges: Array<{ key: string; entered: boolean }> = [];
  const cache = new VisibilityCoverageCache(200, 200, table, undefined, (_viewer, key, entered) => edges.push({ key, entered }));
  const setTerrain = (x: number, y: number, value: Terrain): void => {
    terrain.set(`${x},${y}`, value);
    epoch += 1;
  };
  return { cache, edges, setTerrain };
};

const balanced = (edges: Array<{ key: string; entered: boolean }>): boolean => {
  const open = new Map<string, number>();
  for (const edge of edges) open.set(edge.key, (open.get(edge.key) ?? 0) + (edge.entered ? 1 : -1));
  return [...open.values()].every((count) => count === 0);
};

describe("vision footprint removal after a terrain change", () => {
  it("a mountain removed between add and remove leaves nothing behind and fires no false edges", () => {
    const { cache, edges, setTerrain } = world();
    setTerrain(52, 50, "MOUNTAIN");
    cache.addFootprint("p1", 50, 50, 4);
    const seenBehind = cache.isVisible("p1", "54,50");
    setTerrain(52, 50, "LAND");
    cache.removeFootprint("p1", 50, 50, 4);
    expect(cache.visibleKeysForViewer("p1").size).toBe(0);
    expect(balanced(edges)).toBe(true);
    expect(edges.filter((edge) => edge.key === "54,50" && !edge.entered)).toHaveLength(seenBehind ? 1 : 0);
    expect(cache.footprintLedgerSize()).toBe(0);
  });

  it("a mountain raised between add and remove releases every cell the add covered", () => {
    const { cache, edges, setTerrain } = world();
    cache.addFootprint("p1", 50, 50, 4);
    setTerrain(52, 50, "MOUNTAIN");
    cache.removeFootprint("p1", 50, 50, 4);
    expect(cache.visibleKeysForViewer("p1").size).toBe(0);
    expect(balanced(edges)).toBe(true);
  });

  it("two adds of the same source across a terrain change are each removed with their own cells", () => {
    const { cache, edges, setTerrain } = world();
    cache.addFootprint("p1", 50, 50, 4);
    setTerrain(52, 50, "MOUNTAIN");
    cache.addFootprint("p1", 50, 50, 4);
    setTerrain(52, 50, "LAND");
    cache.removeFootprint("p1", 50, 50, 4);
    cache.removeFootprint("p1", 50, 50, 4);
    expect(cache.visibleKeysForViewer("p1").size).toBe(0);
    expect(balanced(edges)).toBe(true);
    expect(cache.footprintLedgerSize()).toBe(0);
  });
});
