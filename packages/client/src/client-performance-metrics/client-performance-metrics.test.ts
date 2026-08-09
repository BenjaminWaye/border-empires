import { afterEach, describe, expect, it } from "vitest";
import {
  recordTerrainRebuildSample,
  resetPerformanceMetricsForTests,
  snapshotPerformanceMetrics
} from "./client-performance-metrics.js";

afterEach(() => {
  resetPerformanceMetricsForTests();
});

describe("terrain rebuild instrumentation", () => {
  it("omits terrainRebuild entirely when no sample has been recorded", () => {
    const snapshot = snapshotPerformanceMetrics();
    expect(snapshot.terrainRebuild).toBeUndefined();
  });

  it("reports percentile stats for totalMs and roadNetworkMs, and the latest tile counts", () => {
    recordTerrainRebuildSample({ totalMs: 2, roadNetworkMs: 1, heightfieldMs: 0.5, perTileLoopMs: 0.3, commitMs: 0.2, knownTileCount: 500, visibleTileCount: 80 });
    recordTerrainRebuildSample({ totalMs: 40, roadNetworkMs: 35, heightfieldMs: 2, perTileLoopMs: 2, commitMs: 1, knownTileCount: 12_000, visibleTileCount: 84 });

    const snapshot = snapshotPerformanceMetrics();
    const terrainRebuild = snapshot.terrainRebuild as {
      totalMs: { count: number; min: number; max: number };
      roadNetworkMs: { count: number; min: number; max: number };
      knownTileCount: number;
      visibleTileCount: number;
    };

    expect(terrainRebuild.totalMs.count).toBe(2);
    expect(terrainRebuild.totalMs.min).toBe(2);
    expect(terrainRebuild.totalMs.max).toBe(40);
    expect(terrainRebuild.roadNetworkMs.min).toBe(1);
    expect(terrainRebuild.roadNetworkMs.max).toBe(35);
    // Tile counts reflect the most recent rebuild, not an aggregate — a rebuild's scope is a
    // point-in-time fact (how big the known/visible map was for that call), not something that
    // makes sense to average across the whole capture window.
    expect(terrainRebuild.knownTileCount).toBe(12_000);
    expect(terrainRebuild.visibleTileCount).toBe(84);
  });

  it("caps the sample buffer so a long session doesn't grow it unbounded", () => {
    for (let i = 0; i < 2_000; i += 1) {
      recordTerrainRebuildSample({ totalMs: 1, roadNetworkMs: 0, heightfieldMs: 0, perTileLoopMs: 0, commitMs: 0, knownTileCount: 10, visibleTileCount: 10 });
    }
    const snapshot = snapshotPerformanceMetrics();
    const terrainRebuild = snapshot.terrainRebuild as { totalMs: { count: number } };
    expect(terrainRebuild.totalMs.count).toBeLessThanOrEqual(1_800);
  });
});
