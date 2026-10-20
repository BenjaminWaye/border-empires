import { describe, expect, it } from "vitest";
import { smoothSharedHillEdgeNormals } from "./client-map-3d-hills-edge-normals.js";

// Two 2x2-vertex domes (subdiv 1) side by side: tile 0 spans x 0..1, tile 1
// spans x 1..2, so their x = 1 vertices coincide.
const SUBDIV = 1;
const tileVerts = (x0: number): number[] => [x0, 0, 0, x0 + 1, 0, 0, x0, 0, 1, x0 + 1, 0, 1];

describe("smoothSharedHillEdgeNormals", () => {
  it("gives coincident edge vertices of neighbouring domes one shared normal", () => {
    const positions = new Float32Array([...tileVerts(0), ...tileVerts(1)]);
    const tilt = Math.SQRT1_2;
    const normals = new Float32Array([
      0, 1, 0, tilt, tilt, 0, 0, 1, 0, tilt, tilt, 0,
      -tilt, tilt, 0, 0, 1, 0, -tilt, tilt, 0, 0, 1, 0
    ]);
    smoothSharedHillEdgeNormals(positions, normals, 8, SUBDIV);
    // Shared vertices (tile 0's x = 1 pair, tile 1's x = 1 pair) now agree
    // and point straight up, the average of the two one-sided normals.
    for (const vi of [1, 3, 4, 6]) {
      expect(normals[vi * 3]).toBeCloseTo(0, 6);
      expect(normals[vi * 3 + 1]).toBeCloseTo(1, 6);
    }
    // Unshared outer vertices are left alone.
    expect(normals[0 * 3 + 1]).toBe(1);
    expect(normals[5 * 3 + 1]).toBe(1);
  });
});
