import { describe, expect, it } from "vitest";
import { appendWater, riverMouthFade, type ChannelPathPoint, type WaterBuffers } from "./client-map-3d-rivers-channel.js";
import { trimCrowdedEnd } from "./client-map-3d-river-edge-water.js";

// What a river looks like where it crosses the coast: no line across it.
const strip = (point: Omit<ChannelPathPoint, "x" | "z">): { alphas: number[]; halfWidth: number } => {
  const buffers: WaterBuffers = { positions: [], colors: [], indices: [] };
  appendWater(buffers, [{ x: 0, z: 0, ...point }, { x: 1, z: 0, ...point }], () => 0);
  // First row: five columns across, edge to edge.
  const alphas = [0, 1, 2, 3, 4].map((k) => buffers.colors[k * 4 + 3]!);
  return { alphas, halfWidth: Math.abs(buffers.positions[2]! - buffers.positions[14]!) / 2 };
};

describe("river mouth across the coast", () => {
  it("keeps the plume solid until it is clear of the coast, then fades smoothly", () => {
    // Fading from the coast itself let the darker sea show through from
    // exactly the coast edge on: a line across the river there.
    for (const m of [0, 0.05, 0.15, 0.3]) expect(riverMouthFade(m)).toBe(1);
    expect(riverMouthFade(1)).toBe(0);
    let last = 1;
    for (let m = 0.3; m <= 1; m += 0.05) {
      const f = riverMouthFade(m);
      expect(f).toBeLessThanOrEqual(last);
      expect(last - f).toBeLessThan(0.15);
      last = f;
    }
  });

  it("firms up the water's soft edge, and widens it under the banks, by the time it reaches the coast", () => {
    // Past the coast the edge lies over the sea, not the muddy bank: soft,
    // each showed through differently and drew a line across the river.
    const inland = strip({ halfWidth: 0.18 });
    const atCoast = strip({ halfWidth: 0.18, descent: 1 });
    expect(inland.alphas[0]).toBeLessThan(0.5);
    expect(atCoast.alphas[0]).toBe(1);
    expect(atCoast.alphas[4]).toBe(1);
    expect(atCoast.halfWidth).toBeGreaterThan(inland.halfWidth * 1.2);
  });

  it("drops centreline samples crowding the mouth corner", () => {
    // A sample just short of the corner bent the line sharply there, and
    // the water's rows crossed, folding a triangle into a dark tick.
    const line = [{ x: 0.6, z: 0 }, { x: 0.3, z: 0.02 }, { x: 0.07, z: 0.04 }, { x: 0, z: 0 }].map((p) => ({ ...p, halfWidth: 0.2 }));
    expect(trimCrowdedEnd(line).map((p) => p.x)).toEqual([0.6, 0.3, 0]);
    expect(trimCrowdedEnd(line.slice(2)).map((p) => p.x)).toEqual([0.07, 0]); // never below two points
  });
});
