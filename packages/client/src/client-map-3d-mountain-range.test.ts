import { describe, expect, it } from "vitest";
import { Scene } from "three";
import { createMountainRange, isRangeTile, mountainRangeSurfaceY, type MountainRangeDeps } from "./client-map-3d-mountain-range.js";

const range = (cells: readonly string[], ground = 0.2): MountainRangeDeps => {
  const set = new Set(cells);
  return {
    isMountainAt: (x, y) => set.has(`${x},${y}`),
    isColdAt: () => false,
    wrapX: (x) => x,
    wrapY: (y) => y,
    cornerYAt: () => ground
  };
};

const PAIR = range(["10,10", "11,10"]);

describe("mountain range surface", () => {
  it("treats only mountains with an orthogonal mountain neighbour as range tiles", () => {
    expect(isRangeTile(10, 10, PAIR)).toBe(true);
    expect(isRangeTile(11, 10, PAIR)).toBe(true);
    const lone = range(["10,10", "11,11"]); // diagonal only
    expect(isRangeTile(10, 10, lone)).toBe(false);
    expect(isRangeTile(12, 10, PAIR)).toBe(false);
  });

  it("joins neighbouring tiles without a seam: their shared edge has one height either side", () => {
    for (const z of [10.25, 10.5, 10.75]) {
      expect(mountainRangeSurfaceY(10.9999, z, PAIR)).toBeCloseTo(mountainRangeSurfaceY(11.0001, z, PAIR), 2);
    }
  });

  it("peaks inside each tile, dips between them, and spills just past the mountain tiles before meeting the ground", () => {
    const peakA = mountainRangeSurfaceY(10.5, 10.5, PAIR);
    const saddle = mountainRangeSurfaceY(11, 10.5, PAIR);
    expect(peakA).toBeGreaterThan(0.2 + 0.5);
    expect(saddle).toBeGreaterThan(0.2);
    expect(saddle).toBeLessThan(peakA);
    // A footprint a little past the tile edge, not a square wall...
    expect(mountainRangeSurfaceY(10.5, 9.95, PAIR)).toBeGreaterThan(0.2);
    // ...that is gone well before the next tile's centre.
    expect(mountainRangeSurfaceY(10.5, 9.1, PAIR)).toBeLessThan(0.2);
    expect(mountainRangeSurfaceY(13.5, 10.5, PAIR)).toBe(-Infinity);
  });

  it("cuts a gully toward a river mountain's exit corner", () => {
    const plain = mountainRangeSurfaceY(10.75, 10.75, PAIR);
    const gullied = mountainRangeSurfaceY(10.75, 10.75, { ...PAIR, riverFaceAt: (x, y) => (x === 10 && y === 10 ? { dirX: 0.7, dirY: 0.7 } : null) });
    expect(gullied).toBeLessThan(plain - 0.1);
  });

  it("builds one mesh for the range and its feet", () => {
    const scene = new Scene();
    const r = createMountainRange(scene, PAIR);
    r.addTile(0.5, 0.5, 10, 10);
    r.addTile(1.5, 0.5, 11, 10);
    r.commit();
    expect(r.tileCount()).toBe(2);
    const vertices = r.mesh()!.geometry.getAttribute("position").count;
    expect(vertices).toBeGreaterThan(2 * 16 * 3);
    // At most the range tiles and the two rings of tiles round them, 32 facets each.
    expect(vertices).toBeLessThanOrEqual(30 * 32 * 3);
    r.clear();
    r.commit();
    expect(r.mesh()).toBeNull();
    r.dispose();
  });
  it("reuses a tile's facets between passes, but rebuilds them when the mountains around it change", () => {
    const cells = new Set(["10,10", "11,10"]);
    const deps: MountainRangeDeps = { ...PAIR, isMountainAt: (x, y) => cells.has(`${x},${y}`) };
    const scene = new Scene();
    const r = createMountainRange(scene, deps);
    const pass = (): number => {
      r.clear();
      for (const key of cells) {
        const [x, y] = key.split(",").map(Number) as [number, number];
        r.addTile(x + 0.5, y + 0.5, x, y);
      }
      r.commit();
      return r.mesh()!.geometry.getAttribute("position").count;
    };
    const first = pass();
    expect(pass()).toBe(first);
    cells.add("12,10");
    expect(pass()).toBeGreaterThan(first);
    r.dispose();
  });
});
