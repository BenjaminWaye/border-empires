import { describe, expect, it } from "vitest";
import { buildIslandRegistry, islandGeometryFor } from "./island-registry.js";
import { tilesFromRows } from "./island-names.test-helpers.js";

describe("buildIslandRegistry", () => {
  it("keeps islands with at least 9 LAND tiles and ignores smaller islets", () => {
    const tiles = tilesFromRows([
      "LLL.....L.",
      "LLL.....L.",
      "LLL.......",
      ".........."
    ]);
    const registry = buildIslandRegistry(tiles, 10, 4);
    expect(registry.islands.map((island) => island.id)).toEqual(["0,0"]);
    expect(registry.islandAt(1, 1)?.id).toBe("0,0");
    expect(registry.islandAt(8, 0)).toBeUndefined();
    expect(registry.islandAt(5, 2)).toBeUndefined();
  });

  it("does not split an island at a mountain ridge, but counts only LAND toward the size floor", () => {
    const tiles = tilesFromRows([
      "LLMLL.",
      "LLMLL.",
      "LLMLL.",
      "......"
    ]);
    const registry = buildIslandRegistry(tiles, 6, 4);
    expect(registry.islands).toHaveLength(1);
    expect(registry.islands[0]!.landTilesAtBuild).toBe(12);
    expect(registry.islandAt(4, 2)?.id).toBe(registry.islandAt(0, 0)?.id);
  });

  it("joins an island across the world's east-west wrap", () => {
    const tiles = tilesFromRows([
      "LL....LL",
      "LL....LL",
      "LL....LL",
      "........"
    ]);
    const registry = buildIslandRegistry(tiles, 8, 4);
    expect(registry.islands).toHaveLength(1);
    // Label centre sits on the seam, not in the empty middle of the map.
    const { x } = registry.islands[0]!.geometry;
    expect(x < 1 || x > 6.5).toBe(true);
  });
});

describe("islandGeometryFor", () => {
  it("lays a long east-west island's label horizontally and measures its extent", () => {
    const points = Array.from({ length: 12 }, (_, x) => [{ x, y: 0 }, { x, y: 1 }]).flat();
    const geometry = islandGeometryFor(points, 100, 100);
    expect(geometry.angle).toBeCloseTo(0, 5);
    expect(geometry.span).toBeCloseTo(12, 5);
    expect(geometry.thickness).toBeCloseTo(2, 5);
    expect(geometry.x).toBeCloseTo(5.5, 5);
  });

  it("keeps the angle readable (never upside down) for a diagonal island", () => {
    const points = Array.from({ length: 10 }, (_, i) => ({ x: i, y: 9 - i }));
    const geometry = islandGeometryFor(points, 100, 100);
    expect(geometry.angle).toBeGreaterThan(-Math.PI / 2);
    expect(geometry.angle).toBeLessThanOrEqual(Math.PI / 2);
    expect(Math.abs(geometry.angle)).toBeCloseTo(Math.PI / 4, 5);
  });

  it("snaps a crescent's centre onto land", () => {
    const points = [
      ...Array.from({ length: 9 }, (_, x) => ({ x, y: 0 })),
      { x: 0, y: 1 }, { x: 0, y: 2 }, { x: 0, y: 3 }, { x: 0, y: 4 },
      { x: 8, y: 1 }, { x: 8, y: 2 }, { x: 8, y: 3 }, { x: 8, y: 4 }
    ];
    const geometry = islandGeometryFor(points, 100, 100);
    expect(points.some((p) => p.x === geometry.x && p.y === geometry.y)).toBe(true);
  });
});
