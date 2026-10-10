// River heads open out of a small spring pool instead of a flat cut-off
// (docs/river-mountains-plan.md, PR B): the channel bulges at its first
// sample (the trench carves a round bowl there) and the water and the wet
// bank close round it with a rounded cap.
import { describe, expect, it } from "vitest";
import { appendBank } from "./client-map-3d-river-bank-strip.js";
import {
  appendWater,
  channelCenterline,
  MAX_CHANNEL_HALF_WIDTH,
  renderedChannelHalfWidth,
  riverWaterHalfWidth,
  SPRING_HALF_WIDTH,
  type ChannelPathPoint,
  type WaterBuffers
} from "./client-map-3d-rivers-channel.js";

const path: ChannelPathPoint[] = [0, 1, 2, 3].map((z) => ({ x: 0, z, halfWidth: 0.1 }));
const empty = (): WaterBuffers => ({ positions: [], colors: [], indices: [] });
const both = (n: number) => Array.from({ length: n }, () => ({ left: true, right: true }));

describe("river spring pool", () => {
  it("bulges the channel at a river's head and narrows back to the stream", () => {
    const line = channelCenterline(path, 0, true);
    expect(line[0]!.source).toBe(true);
    expect(line[0]!.halfWidth).toBeCloseTo(SPRING_HALF_WIDTH);
    expect(SPRING_HALF_WIDTH).toBeLessThanOrEqual(MAX_CHANNEL_HALF_WIDTH);
    expect(line[0]!.halfWidth).toBeGreaterThan(2 * renderedChannelHalfWidth(0.1) * 0.35);
    // A tile downstream it is back to the plain (tapered) stream.
    const downstream = line.find((p) => p.z >= 1)!;
    expect(downstream.halfWidth).toBeLessThan(SPRING_HALF_WIDTH / 2);
    expect(line.filter((p) => p.source)).toHaveLength(1);
  });

  it("leaves runs that don't start at the head alone", () => {
    const line = channelCenterline(path, 0, false);
    expect(line.some((p) => p.source)).toBe(false);
    expect(line[0]!.halfWidth).toBeCloseTo(renderedChannelHalfWidth(0.1));
  });

  it("rounds the water off behind the head instead of ending it flat", () => {
    const line = channelCenterline(path, 0, true);
    const capped = empty();
    appendWater(capped, line, () => 0.1, both(line.length));
    const plain = empty();
    appendWater(plain, channelCenterline(path, 0, false), () => 0.1, both(line.length));
    expect(capped.positions.length).toBeGreaterThan(plain.positions.length);
    // The cap reaches upstream of the head, to the pool's water radius.
    const zs = capped.positions.filter((_, i) => i % 3 === 2);
    // (The first stretch wobbles slightly, so the cap's axis is not exactly z.)
    expect(Math.min(...zs)).toBeLessThan(-0.95 * riverWaterHalfWidth(SPRING_HALF_WIDTH));
    expect(Math.min(...zs)).toBeGreaterThan(-1.01 * riverWaterHalfWidth(SPRING_HALF_WIDTH));
    expect(capped.colors.length / 4).toBe(capped.positions.length / 3);
  });

  it("skips the cap at a fog edge, where only one half of the water draws", () => {
    const line = channelCenterline(path, 0, true);
    const sides = both(line.length).map((s, i) => (i === 0 ? { left: true, right: false } : s));
    const buffers = empty();
    appendWater(buffers, line, () => 0.1, sides);
    const zs = buffers.positions.filter((_, i) => i % 3 === 2);
    expect(Math.min(...zs)).toBeGreaterThan(-0.05);
  });

  it("closes the wet bank round the pool", () => {
    const line = channelCenterline(path, 0, true);
    const capped = empty();
    appendBank(capped, line, both(line.length), () => 0.2);
    const zs = capped.positions.filter((_, i) => i % 3 === 2);
    expect(Math.min(...zs)).toBeLessThan(-SPRING_HALF_WIDTH);
    const plain = empty();
    appendBank(plain, channelCenterline(path, 0, false), both(line.length), () => 0.2);
    expect(Math.min(...plain.positions.filter((_, i) => i % 3 === 2))).toBeGreaterThan(-0.05);
  });
});
