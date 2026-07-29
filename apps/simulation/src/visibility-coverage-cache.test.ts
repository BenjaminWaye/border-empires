import { describe, expect, it } from "vitest";
import type { Terrain } from "@border-empires/shared";
import { VisibilityCoverageCache } from "./visibility-coverage-cache.js";
import { VisionFootprintTable } from "./vision-footprint-table.js";

describe("VisibilityCoverageCache", () => {
  it("makes a footprint visible after add and invisible after remove", () => {
    const cache = new VisibilityCoverageCache(200, 200);
    expect(cache.isVisible("viewer-1", "10,10")).toBe(false);
    cache.addFootprint("viewer-1", 10, 10, 1);
    expect(cache.isVisible("viewer-1", "10,10")).toBe(true);
    expect(cache.isVisible("viewer-1", "9,10")).toBe(true);
    expect(cache.isVisible("viewer-1", "8,10")).toBe(false);
    cache.removeFootprint("viewer-1", 10, 10, 1);
    expect(cache.isVisible("viewer-1", "10,10")).toBe(false);
  });

  it("keeps a cell visible while any overlapping footprint still covers it (refcounting)", () => {
    const cache = new VisibilityCoverageCache(200, 200);
    // Two adjacent tiles both dilate over (10,10) with radius 1.
    cache.addFootprint("viewer-1", 10, 10, 1);
    cache.addFootprint("viewer-1", 11, 10, 1);
    expect(cache.isVisible("viewer-1", "10,10")).toBe(true);
    // Losing the first tile must NOT hide the cell — the second still covers it.
    cache.removeFootprint("viewer-1", 10, 10, 1);
    expect(cache.isVisible("viewer-1", "10,10")).toBe(true);
    // Losing the second tile finally removes the last contributor.
    cache.removeFootprint("viewer-1", 11, 10, 1);
    expect(cache.isVisible("viewer-1", "10,10")).toBe(false);
  });

  it("wraps toroidally at world edges", () => {
    const cache = new VisibilityCoverageCache(10, 10);
    cache.addFootprint("viewer-1", 0, 0, 1);
    expect(cache.isVisible("viewer-1", "9,9")).toBe(true);
    expect(cache.isVisible("viewer-1", "1,1")).toBe(true);
  });

  it("keeps viewers independent", () => {
    const cache = new VisibilityCoverageCache(200, 200);
    cache.addFootprint("viewer-1", 10, 10, 1);
    expect(cache.isVisible("viewer-1", "10,10")).toBe(true);
    expect(cache.isVisible("viewer-2", "10,10")).toBe(false);
  });

  it("bulk add/remove of a source contribution matches per-tile add/remove", () => {
    const cache = new VisibilityCoverageCache(200, 200);
    const territory = ["10,10", "11,10", "12,11"];
    cache.addSourceContribution("viewer-1", territory, 2);
    for (const tileKey of territory) {
      const [x, y] = tileKey.split(",").map(Number);
      expect(cache.isVisible("viewer-1", `${x},${y}`)).toBe(true);
    }
    // A cell only within range of (10,10) should be visible; far cell should not.
    expect(cache.isVisible("viewer-1", "50,50")).toBe(false);

    cache.removeSourceContribution("viewer-1", territory, 2);
    expect(cache.visibleKeysForViewer("viewer-1").size).toBe(0);
  });

  it("removeFootprint on an unknown viewer is a no-op", () => {
    const cache = new VisibilityCoverageCache(200, 200);
    expect(() => cache.removeFootprint("nobody", 5, 5, 1)).not.toThrow();
  });

  it("with no footprint table injected, behaves exactly as before terrain occlusion (backward compatible default)", () => {
    const cache = new VisibilityCoverageCache(200, 200);
    cache.addFootprint("viewer-1", 10, 10, 3);
    expect(cache.isVisible("viewer-1", "13,10")).toBe(true);
  });

  it("applies an injected footprint table's mountain occlusion to the hot add/removeFootprint path", () => {
    const terrainAt = (x: number, y: number): Terrain | undefined => (x === 11 && y === 10 ? "MOUNTAIN" : "LAND");
    const footprintTable = new VisionFootprintTable(200, 200, { terrainAt, getTerrainEpoch: () => 0 });
    const cache = new VisibilityCoverageCache(200, 200, footprintTable);
    cache.addFootprint("viewer-1", 10, 10, 3);
    expect(cache.isVisible("viewer-1", "11,10")).toBe(true); // mountain tile itself visible
    expect(cache.isVisible("viewer-1", "12,10")).toBe(false); // behind mountain, occluded
    expect(cache.isVisible("viewer-1", "13,10")).toBe(false); // further behind, occluded
    expect(cache.isVisible("viewer-1", "10,13")).toBe(true); // unrelated bearing, unaffected

    cache.removeFootprint("viewer-1", 10, 10, 3);
    expect(cache.isVisible("viewer-1", "11,10")).toBe(false);
  });
});
