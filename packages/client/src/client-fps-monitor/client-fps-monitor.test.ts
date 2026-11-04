import { afterEach, describe, expect, it } from "vitest";
import {
  getCurrentFps,
  getSustainedLowFpsDurationMs,
  hasSustainedLowFps,
  holdLowFpsStreakForWarmup,
  LOW_FPS_WARMUP_MS,
  noteFpsMonitorVisibility,
  recordFrame,
  resetFpsMonitorForTests
} from "./client-fps-monitor.js";

afterEach(() => {
  resetFpsMonitorForTests();
});

describe("client fps monitor", () => {
  it("returns undefined before enough samples are collected", () => {
    expect(getCurrentFps()).toBeUndefined();
    recordFrame(0);
    expect(getCurrentFps()).toBeUndefined();
  });

  it("computes fps from the 1s rolling window", () => {
    for (let i = 0; i < 60; i += 1) recordFrame(i * (1000 / 60));
    const fps = getCurrentFps();
    expect(fps).toBeDefined();
    expect(fps!).toBeGreaterThan(55);
    expect(fps!).toBeLessThan(65);
  });

  it("accumulates low-fps streak duration across polls", () => {
    const lowGap = 1000 / 15;
    let t = 0;
    for (let i = 0; i < 15; i += 1) {
      recordFrame(t);
      t += lowGap;
    }
    // Streak start is captured on the first low read; that call itself returns 0.
    expect(getSustainedLowFpsDurationMs(25, t)).toBe(0);

    for (let i = 0; i < 15; i += 1) {
      recordFrame(t);
      t += lowGap;
    }
    expect(getSustainedLowFpsDurationMs(25, t)).toBeGreaterThan(900);
    expect(hasSustainedLowFps(25, 900, t)).toBe(true);
  });

  it("clears the streak when fps recovers above threshold", () => {
    const lowGap = 1000 / 15;
    let t = 0;
    for (let i = 0; i < 15; i += 1) {
      recordFrame(t);
      t += lowGap;
    }
    getSustainedLowFpsDurationMs(25, t);
    for (let i = 0; i < 15; i += 1) {
      recordFrame(t);
      t += lowGap;
    }
    expect(getSustainedLowFpsDurationMs(25, t)).toBeGreaterThan(0);

    resetFpsMonitorForTests();
    const fastGap = 1000 / 60;
    let f = 0;
    for (let i = 0; i < 60; i += 1) {
      recordFrame(f);
      f += fastGap;
    }
    expect(getSustainedLowFpsDurationMs(25, f)).toBe(0);
  });

  const recordFramesAtFps = (fps: number, fromMs: number, toMs: number): number => {
    let t = fromMs;
    for (; t < toMs; t += 1000 / fps) recordFrame(t);
    return t;
  };

  it("ignores the catch-up jank after returning to the foreground or a (re)INIT", () => {
    // Regression: on a flagship phone a resume -> reconnect -> re-INIT produced
    // ~15s of 100ms+ long tasks, which popped "3D is running slow" every time.
    noteFpsMonitorVisibility(true, 0);
    let t = recordFramesAtFps(10, 0, 2_000);
    getSustainedLowFpsDurationMs(25, t);
    t = recordFramesAtFps(10, t, 15_000);
    expect(hasSustainedLowFps(25, 5000, t)).toBe(false);
    holdLowFpsStreakForWarmup(t); // re-INIT after the reconnect restarts the warm-up
    t = recordFramesAtFps(10, t, t + 15_000);
    expect(hasSustainedLowFps(25, 5000, t)).toBe(false);
    // Past the warm-up, steady low fps still counts.
    t = recordFramesAtFps(10, t, t + LOW_FPS_WARMUP_MS);
    getSustainedLowFpsDurationMs(25, t);
    t = recordFramesAtFps(10, t, t + 6_000);
    expect(hasSustainedLowFps(25, 5000, t)).toBe(true);
  });

  it("hiding the page does not start a hold, only coming back does", () => {
    let t = recordFramesAtFps(10, 0, 1_000);
    noteFpsMonitorVisibility(false, t);
    getSustainedLowFpsDurationMs(25, t);
    t = recordFramesAtFps(10, t, t + 6_000);
    expect(hasSustainedLowFps(25, 5000, t)).toBe(true);
  });

  it("a mid-play stall does not suppress the prompt for a slow device", () => {
    // Multi-second stalls (shader compiles, GC) are what a struggling device
    // does; they must not be mistaken for a resume and start a 20s hold.
    let t = recordFramesAtFps(12, 0, 3_000);
    t += 1_500; // main thread frozen, no frames
    t = recordFramesAtFps(12, t, t + 1_000);
    getSustainedLowFpsDurationMs(25, t);
    t = recordFramesAtFps(12, t, t + 6_000);
    expect(hasSustainedLowFps(25, 5000, t)).toBe(true);
  });
});
