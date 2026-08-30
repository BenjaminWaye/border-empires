import { describe, expect, it } from "vitest";
import { drawLoopMinFrameGapMs } from "./client-runtime-loop-frame-gap.js";

// Regression for resource/town/dock icons visibly lagging/jittering behind
// the WebGL terrain during a pan: the 2D icon-overlay draw() loop used to
// throttle to 24ms/40ms regardless of renderer mode, which was fine when
// panning snapped a whole tile at a time but became visible once
// client-map-input.ts's sub-tile pan started moving the WebGL camera every
// single animation frame. In 3D mode this loop only draws a thin badge/
// marker layer (most of its work is gated off), so it should ride the full
// rAF rate on desktop instead of falling behind the terrain's own cadence.
describe("drawLoopMinFrameGapMs", () => {
  it("gives desktop 3D mode a light ~120fps cap, not zero, so icons stay in lockstep with the WebGL camera without an unbounded loop", () => {
    expect(drawLoopMinFrameGapMs(true, false)).toBe(8);
  });

  it("keeps a lighter (higher-ms) cap for mobile in 3D mode than desktop", () => {
    expect(drawLoopMinFrameGapMs(true, true)).toBe(16);
    expect(drawLoopMinFrameGapMs(true, true)).toBeGreaterThan(drawLoopMinFrameGapMs(true, false));
  });

  it("preserves the original heavier throttle for the full 2D-canvas renderer (desktop)", () => {
    expect(drawLoopMinFrameGapMs(false, false)).toBe(24);
  });

  it("preserves the original heavier throttle for the full 2D-canvas renderer (mobile)", () => {
    expect(drawLoopMinFrameGapMs(false, true)).toBe(40);
  });
});
