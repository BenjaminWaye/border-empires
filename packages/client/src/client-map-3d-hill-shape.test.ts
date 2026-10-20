import { describe, expect, it } from "vitest";
import { hillBumpsWithCorridorAt, hillNeighborFlagsAt, hillShapeHeight } from "./client-map-3d-hill-shape.js";

const identity = (n: number): number => n;
const heightAt = (isHill: (x: number, y: number) => boolean, wx: number, wy: number, u: number, v: number): number =>
  hillShapeHeight(u, v, hillBumpsWithCorridorAt(wx, wy, hillNeighborFlagsAt(wx, wy, isHill, identity, identity)), wx, wy);

describe("hill plateau joins neighbouring hill tiles", () => {
  it("two side-by-side hills meet at the same raised height along their whole shared edge", () => {
    const pair = (x: number, y: number): boolean => y === 10 && (x === 10 || x === 11);
    for (const v of [-0.2, -0.1, 0, 0.1, 0.2]) {
      const fromWest = heightAt(pair, 10, 10, 0.5, v);
      const fromEast = heightAt(pair, 11, 10, -0.5, v);
      expect(fromWest).toBeCloseTo(fromEast, 9);
      // Previously the plateau sloped to 0 at every tile edge, leaving a
      // crease along the join.
      expect(fromWest).toBeGreaterThan(0.1);
    }
  });

  it("fills the shared corner of a 2x2 block of hills", () => {
    const block = (x: number, y: number): boolean => (x === 10 || x === 11) && (y === 10 || y === 11);
    const corners = [
      heightAt(block, 10, 10, 0.5, 0.5),
      heightAt(block, 11, 10, -0.5, 0.5),
      heightAt(block, 10, 11, 0.5, -0.5),
      heightAt(block, 11, 11, -0.5, -0.5)
    ];
    for (const h of corners) expect(h).toBeCloseTo(corners[0]!, 9);
    expect(corners[0]).toBeGreaterThan(0.1);
  });

  it("still reaches true ground at every edge and corner touching flat land", () => {
    // An L of three hills: the inner corner of the L touches a flat tile at
    // (11, 11), so it must stay at 0 even though both cardinal sides are hills.
    const ell = (x: number, y: number): boolean => (x === 10 && y === 10) || (x === 11 && y === 10) || (x === 10 && y === 11);
    expect(heightAt(ell, 10, 10, 0.5, 0.5)).toBe(0);
    expect(heightAt(ell, 11, 10, -0.5, 0.5)).toBe(0);
    for (const u of [-0.5, -0.25, 0, 0.25, 0.5]) {
      expect(heightAt(ell, 10, 10, u, -0.5)).toBe(0);
      expect(heightAt(ell, 11, 10, u, 0.5)).toBe(0);
    }
  });

  it("keeps a lone hill round: full near the center, flat at its edges", () => {
    const lone = (x: number, y: number): boolean => x === 10 && y === 10;
    expect(heightAt(lone, 10, 10, 0, 0)).toBeGreaterThan(0.1);
    expect(heightAt(lone, 10, 10, 0.5, 0)).toBe(0);
    expect(heightAt(lone, 10, 10, 0.32, 0.32)).toBe(0);
  });
});
