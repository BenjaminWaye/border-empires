import { describe, expect, it } from "vitest";
import { RENDER_ORDER } from "../client-map-3d-render-order.js";
import { appendBank } from "./client-map-3d-river-bank-strip.js";
import { BANK_WIDTH, riverWaterHalfWidth, type WaterBuffers } from "./client-map-3d-rivers-channel.js";

const GROUND = 0.2;
const run = [0, 1, 2].map((z) => ({ x: 0, z, halfWidth: 0.15 }));
const both = run.map(() => ({ left: true, right: true }));

describe("river bank strip over the territory colour (option A)", () => {
  it("draws between the ownership fill and the water", () => {
    expect(RENDER_ORDER.ownershipFrontier).toBeLessThan(RENDER_ORDER.riverBank);
    expect(RENDER_ORDER.riverBank).toBeLessThan(RENDER_ORDER.riverWater);
  });

  it("covers each bank from just inside the water's edge to the top of the bank, dark at the waterline, fading out", () => {
    // Regression: the ownership fill painted the carved bank flat owner
    // colour right up to the water, so the river read as a strip on top.
    const buffers: WaterBuffers = { positions: [], colors: [], indices: [] };
    appendBank(buffers, run, both, () => GROUND);
    expect(buffers.positions.length / 3).toBe(2 * 3 * 3); // 2 sides x 3 samples x 3 columns
    const xs = buffers.positions.filter((_, i) => i % 3 === 0).map(Math.abs);
    const ys = buffers.positions.filter((_, i) => i % 3 === 1);
    const alphas = buffers.colors.filter((_, i) => i % 4 === 3);
    expect(Math.min(...xs)).toBeLessThan(riverWaterHalfWidth(0.15));
    expect(Math.max(...xs)).toBeCloseTo(0.15 + BANK_WIDTH, 6);
    // Inner column sits down on the carved bank; outer column on the ground.
    expect(ys[0]!).toBeLessThan(GROUND - 0.05);
    expect(ys[2]!).toBeCloseTo(GROUND + 0.006, 6);
    expect(alphas[0]!).toBeGreaterThan(0.7);
    expect(alphas[2]!).toBe(0);
  });

  it("leaves a side out where that side's tile isn't drawable, and never covers the mouth plume", () => {
    const buffers: WaterBuffers = { positions: [], colors: [], indices: [] };
    appendBank(buffers, run, run.map(() => ({ left: true, right: false })), () => GROUND);
    const alphas = buffers.colors.filter((_, i) => i % 4 === 3);
    expect(alphas.slice(0, 9).some((a) => a > 0)).toBe(true); // left (-1) side first
    expect(alphas.slice(9).every((a) => a === 0)).toBe(true);
    const plumeOnly: WaterBuffers = { positions: [], colors: [], indices: [] };
    appendBank(plumeOnly, run.map((p) => ({ ...p, mouth: 0.5 })), both, () => GROUND);
    expect(plumeOnly.positions).toHaveLength(0);
  });
});
