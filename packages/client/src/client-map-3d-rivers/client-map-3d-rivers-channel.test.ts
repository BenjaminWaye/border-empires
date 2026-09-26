import { describe, expect, it } from "vitest";
import {
  appendChannel,
  CHANNEL_VERTS_PER_SECTION,
  chaikinSmooth,
  heightfieldSurfaceY,
  type ChannelBuffers,
  type ChannelPathPoint
} from "./client-map-3d-rivers-channel.js";

const p = (x: number, z: number, halfWidth = 0.1): ChannelPathPoint => ({ x, z, halfWidth });
const empty = (): ChannelBuffers => ({ positions: [], colors: [], indices: [] });

describe("v9 river channel mesh", () => {
  it("rounds the edge staircase's right angles but keeps both endpoints", () => {
    const smoothed = chaikinSmooth([p(0, 0), p(1, 0), p(1, 1)]);
    expect(smoothed[0]).toEqual(p(0, 0));
    expect(smoothed[smoothed.length - 1]).toEqual(p(1, 1));
    expect(smoothed.some((q) => q.x === 1 && q.z === 0)).toBe(false); // the sharp corner is cut
  });

  it("drapes on the heightfield's own triangles (split along the (1,0)-(0,1) diagonal)", () => {
    const corners: Record<string, number> = { "10,20": 0, "11,20": 0.2, "10,21": 0.4, "11,21": 1 };
    const cornerYAt = (x: number, z: number): number => corners[`${x},${z}`] ?? 0;
    expect(heightfieldSurfaceY(0, 0, 10, 20, cornerYAt)).toBeCloseTo(0);
    expect(heightfieldSurfaceY(0.99, 0.99, 10, 20, cornerYAt)).toBeCloseTo(1, 1);
    // Midpoint of the shared diagonal is the average of its two ends, from either triangle.
    expect(heightfieldSurfaceY(0.5, 0.5, 10, 20, cornerYAt)).toBeCloseTo(0.3);
  });

  it("builds full cross-sections whose outer edges fade out and whose water sits above the surface", () => {
    const buffers = empty();
    appendChannel(buffers, [p(0, 0), p(1, 0), p(2, 0)], () => 0.05);
    expect(buffers.positions.length / 3).toBe(3 * CHANNEL_VERTS_PER_SECTION);
    expect(buffers.colors[3]).toBe(0); // first vertex = outer edge, alpha 0
    for (let i = 1; i < buffers.positions.length; i += 3) expect(buffers.positions[i]!).toBeGreaterThan(0.05);
  });

  it("does not fold the inner bank over itself on a tight bend", () => {
    // Regression: the bank reaches ~0.4 from the centreline; on a bend of
    // radius 0.3 the inner side crossed the bend's centre, flipping triangles
    // into dark scratches. Every vertex must stay on its own side of the centre.
    const R = 0.3;
    const arc = Array.from({ length: 13 }, (_, i) => {
      const t = (i / 12) * Math.PI;
      return p(Math.cos(t) * R, Math.sin(t) * R);
    });
    const buffers = empty();
    appendChannel(buffers, arc, () => 0);
    for (let s = 1; s < arc.length - 1; s += 1) {
      const centre = arc[s]!;
      for (let k = 0; k < CHANNEL_VERTS_PER_SECTION; k += 1) {
        const v = (s * CHANNEL_VERTS_PER_SECTION + k) * 3;
        const dot = buffers.positions[v]! * centre.x + buffers.positions[v + 2]! * centre.z;
        expect(dot).toBeGreaterThan(0);
      }
    }
  });
});
