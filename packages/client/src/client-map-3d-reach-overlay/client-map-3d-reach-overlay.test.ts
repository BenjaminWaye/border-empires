import { describe, expect, it } from "vitest";
import { boundaryEdgeStuds, hasAnyEdge, tileQuadCorners } from "./client-map-3d-reach-overlay.js";

const NO_EDGES = { top: false, right: false, bottom: false, left: false };

describe("hasAnyEdge", () => {
  it("is false when no edges are set", () => {
    expect(hasAnyEdge(NO_EDGES)).toBe(false);
  });

  it("is true when any single edge is set", () => {
    expect(hasAnyEdge({ ...NO_EDGES, top: true })).toBe(true);
    expect(hasAnyEdge({ ...NO_EDGES, right: true })).toBe(true);
    expect(hasAnyEdge({ ...NO_EDGES, bottom: true })).toBe(true);
    expect(hasAnyEdge({ ...NO_EDGES, left: true })).toBe(true);
  });
});

describe("tileQuadCorners", () => {
  it("returns the 4 corners of a unit tile centered at (x, z)", () => {
    expect(tileQuadCorners(2.5, 4.5, 1)).toEqual({ x0: 2, x1: 3, z0: 4, z1: 5 });
  });

  it("scales with tile size", () => {
    expect(tileQuadCorners(0, 0, 2)).toEqual({ x0: -1, x1: 1, z0: -1, z1: 1 });
  });
});

describe("boundaryEdgeStuds", () => {
  it("returns no studs when no edges are set", () => {
    expect(boundaryEdgeStuds(0.5, 0.5, 1, NO_EDGES)).toEqual([]);
  });

  it("returns 2 studs for a single active edge (discrete chain, not one continuous segment)", () => {
    const studs = boundaryEdgeStuds(0.5, 0.5, 1, { ...NO_EDGES, top: true });
    expect(studs).toHaveLength(2);
  });

  it("places top-edge studs along z0 with a gap between them", () => {
    const studs = boundaryEdgeStuds(0.5, 0.5, 1, { ...NO_EDGES, top: true });
    // Both studs sit at the same z band (the top edge), and are non-overlapping in x.
    expect(studs[0]!.z0).toBeCloseTo(studs[1]!.z0);
    expect(studs[0]!.x1).toBeLessThan(studs[1]!.x0);
  });

  it("places right-edge studs along x1 with a gap between them, oriented along z", () => {
    const studs = boundaryEdgeStuds(0.5, 0.5, 1, { ...NO_EDGES, right: true });
    expect(studs).toHaveLength(2);
    expect(studs[0]!.x0).toBeCloseTo(studs[1]!.x0);
    expect(studs[0]!.z1).toBeLessThan(studs[1]!.z0);
  });

  it("accumulates studs across multiple active edges (4 edges -> 8 studs)", () => {
    const studs = boundaryEdgeStuds(0.5, 0.5, 1, { top: true, right: true, bottom: true, left: true });
    expect(studs).toHaveLength(8);
  });

  it("keeps every stud's span close to the tile bounds (straddling the boundary line by half a stud's thickness)", () => {
    const studs = boundaryEdgeStuds(0.5, 0.5, 1, { top: true, right: true, bottom: true, left: true });
    for (const stud of studs) {
      expect(stud.x0).toBeGreaterThanOrEqual(-0.1);
      expect(stud.x1).toBeLessThanOrEqual(1.1);
      expect(stud.z0).toBeGreaterThanOrEqual(-0.1);
      expect(stud.z1).toBeLessThanOrEqual(1.1);
    }
  });
});
