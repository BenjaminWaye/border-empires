import { describe, expect, it } from "vitest";
import { terrainWindowContainsPoint } from "../client-map-3d-terrain-window/client-map-3d-terrain-window.js";
import {
  createRebuildThrottle,
  rebuildIntervalMs,
  REBUILD_MAX_INTERVAL_MS,
  REBUILD_MIN_INTERVAL_MS
} from "./client-map-3d-rebuild-throttle.js";

describe("rebuildIntervalMs", () => {
  it("keeps the 48ms floor for cheap rebuilds", () => {
    expect(rebuildIntervalMs(0)).toBe(REBUILD_MIN_INTERVAL_MS);
    expect(rebuildIntervalMs(10)).toBe(REBUILD_MIN_INTERVAL_MS);
    expect(rebuildIntervalMs(Number.NaN)).toBe(REBUILD_MIN_INTERVAL_MS);
  });

  it("scales with an expensive rebuild's cost, capped at a second", () => {
    expect(rebuildIntervalMs(100)).toBe(300);
    expect(rebuildIntervalMs(300)).toBe(900);
    expect(rebuildIntervalMs(5_000)).toBe(REBUILD_MAX_INTERVAL_MS);
  });
});

describe("createRebuildThrottle", () => {
  it("lets the first rebuild through immediately", () => {
    expect(createRebuildThrottle().ready(0)).toBe(true);
  });

  // Regression: a staging trace of a zoomed-out pan showed a ~300ms rebuild
  // re-running every ~0.45s behind a fixed 48ms floor -- 49% of the main
  // thread. The floor must hold an expensive rebuild off for 2x its cost.
  it("holds the main thread to about a third rebuilding during continuous camera motion", () => {
    const throttle = createRebuildThrottle();
    let busyMs = 0;
    let lastStart = Number.NEGATIVE_INFINITY;
    for (let nowMs = 0; nowMs < 12_000; nowMs += 16) {
      if (nowMs < lastStart + 300 || !throttle.ready(nowMs)) continue; // main thread busy, or floor closed
      throttle.record(nowMs, nowMs + 300);
      lastStart = nowMs;
      busyMs += 300;
    }
    expect(busyMs / 12_000).toBeLessThan(0.36);
    expect(busyMs / 12_000).toBeGreaterThan(0.3);
  });

  it("keeps the short floor when a camera jump leaves the terrain window", () => {
    const throttle = createRebuildThrottle();
    const built = { camX: 448, camY: 30, halfW: 10, halfH: 10 };
    const cameraOutsideTerrain = (x: number): boolean => !terrainWindowContainsPoint(built, x, 30, 450, 450);

    throttle.record(0, 300);
    expect(throttle.ready(310, cameraOutsideTerrain(2))).toBe(false); // small pan across the seam
    expect(throttle.ready(310, cameraOutsideTerrain(80))).toBe(true); // jump beyond the built tiles
  });

  it("reopens as soon as cheap rebuilds are back", () => {
    const throttle = createRebuildThrottle();
    throttle.record(0, 300);
    expect(throttle.ready(600)).toBe(false);
    expect(throttle.ready(900)).toBe(true);
    throttle.record(900, 910);
    expect(throttle.ready(948)).toBe(true);
  });
});
