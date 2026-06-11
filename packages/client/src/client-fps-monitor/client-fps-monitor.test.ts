import { afterEach, describe, expect, it } from "vitest";
import {
  getCurrentFps,
  getSustainedLowFpsDurationMs,
  hasSustainedLowFps,
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
});
