import { describe, expect, it, vi } from "vitest";
import {
  createUnitMotionGate,
  MAX_COUNTED_FRAME_MS,
  SLOW_SUSTAIN_MS,
  WARMUP_MS
} from "./client-map-3d-unit-motion-gate.js";

// Feeds evenly spaced frames from `fromMs` for `durationMs`; returns the end clock.
const runFrames = (gate: ReturnType<typeof createUnitMotionGate>, fromMs: number, durationMs: number, frameMs: number): number => {
  let t = fromMs;
  while (t < fromMs + durationMs) {
    t += frameMs;
    gate.recordFrame(t);
  }
  return t;
};

describe("createUnitMotionGate", () => {
  it("animates on a device that holds 60fps", () => {
    const gate = createUnitMotionGate({ prefersReducedMotion: () => false });
    runFrames(gate, 0, WARMUP_MS + 20_000, 16.7);
    expect(gate.shouldAnimate()).toBe(true);
  });

  it("latches still once frames stay slow past the sustain window, and reports it once", () => {
    const onSlowDeviceLatched = vi.fn();
    const gate = createUnitMotionGate({ prefersReducedMotion: () => false, onSlowDeviceLatched });
    const afterWarmup = runFrames(gate, 0, WARMUP_MS, 16.7);
    const slowStart = runFrames(gate, afterWarmup, 1_000, 40);
    expect(gate.shouldAnimate()).toBe(true);
    const latched = runFrames(gate, slowStart, SLOW_SUSTAIN_MS + 500, 40);
    expect(gate.shouldAnimate()).toBe(false);
    // Frames speed back up (the units standing still is what freed the time):
    // stays latched, so it doesn't flap.
    runFrames(gate, latched, 10_000, 16.7);
    expect(gate.shouldAnimate()).toBe(false);
    expect(onSlowDeviceLatched).toHaveBeenCalledTimes(1);
  });

  it("ignores slow frames during startup warmup", () => {
    const gate = createUnitMotionGate({ prefersReducedMotion: () => false });
    runFrames(gate, 0, WARMUP_MS - 100, 60);
    runFrames(gate, WARMUP_MS, 2_000, 16.7);
    expect(gate.shouldAnimate()).toBe(true);
  });

  it("ignores long gaps like a backgrounded tab instead of reading them as slow frames", () => {
    const gate = createUnitMotionGate({ prefersReducedMotion: () => false });
    let t = runFrames(gate, 0, WARMUP_MS, 16.7);
    for (let i = 0; i < 40; i += 1) {
      t += MAX_COUNTED_FRAME_MS + 500;
      gate.recordFrame(t);
    }
    expect(gate.shouldAnimate()).toBe(true);
  });

  it("does not latch on a brief slow patch shorter than the sustain window", () => {
    const gate = createUnitMotionGate({ prefersReducedMotion: () => false });
    let t = runFrames(gate, 0, WARMUP_MS, 16.7);
    t = runFrames(gate, t, SLOW_SUSTAIN_MS / 2, 40);
    runFrames(gate, t, 5_000, 16.7);
    expect(gate.shouldAnimate()).toBe(true);
  });

  it("stands still while the OS asks for reduced motion, and follows the setting live", () => {
    const reduced = { value: true };
    const gate = createUnitMotionGate({ prefersReducedMotion: () => reduced.value });
    expect(gate.shouldAnimate()).toBe(false);
    reduced.value = false;
    expect(gate.shouldAnimate()).toBe(true);
  });
});
