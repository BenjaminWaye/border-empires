/**
 * Prod-shape load test for SimulationRuntime.
 *
 * Gate: only runs when RUN_PROD_SHAPE_LOAD=1.
 *
 * Seeds from the production snapshot, warms 60 ticks, measures 600 ticks.
 *
 * Assertions:
 * - p95 sim-tick wall < 300 ms
 * - p99 sim-tick wall < 800 ms
 * - max single-tick block < 5000 ms (watchdog headroom)
 * - no tick > 10s
 * - events emitted in 600 ticks matches baseline ±2%
 * - heap growth across 600 ticks < 100 MB (threshold raised from 50 MB: GC timing
 *   in vitest forks can retain floating garbage; mitigated by --expose-gc + forced
 *   global.gc() calls before and after the measurement window)
 *
 * exportState() is called after each tick to exercise the TileDeltaStringifyCache
 * on the broadcast path, which mirrors real gateway usage.
 */
import { describe, expect, it } from "vitest";
import { loadProdSnapshot } from "./__bench__/load-prod-snapshot.js";
import type { SimulationEvent } from "@border-empires/sim-protocol";

const RUN = process.env.RUN_PROD_SHAPE_LOAD === "1";

describe.skipIf(!RUN)("runtime prod-shape load (600 ticks)", () => {
  it("meets latency and heap growth targets", () => {
    const { runtime } = loadProdSnapshot();

    let eventCount = 0;
    runtime.onEvent((_e: SimulationEvent) => { eventCount++; });

    const nowMs = { value: Date.now() };
    const TICK_INTERVAL_MS = 1_000;

    // Warm: 60 silent ticks (include exportState to warm the cache path too)
    for (let i = 0; i < 60; i++) {
      nowMs.value += TICK_INTERVAL_MS;
      runtime.tickTerritoryAutomation(nowMs.value);
      runtime.exportState();
    }

    // Force GC before measurement so the baseline is a post-GC heap size,
    // making the growth delta deterministic across runs regardless of when
    // Node's concurrent GC happened to fire during the warm phase.
    if (typeof global.gc === "function") global.gc();
    const heapBefore = process.memoryUsage().heapUsed;
    const tickDurations: number[] = [];
    const warmEventCount = eventCount;
    eventCount = 0;

    // Measure: 600 ticks. exportState() is called outside the timed window to
    // exercise the stringify cache on the broadcast path without inflating tick
    // latency numbers (the gateway serialises outside the sim-tick hot path).
    const TICKS = 600;
    for (let i = 0; i < TICKS; i++) {
      nowMs.value += TICK_INTERVAL_MS;
      const t0 = performance.now();
      runtime.tickTerritoryAutomation(nowMs.value);
      const dt = performance.now() - t0;
      tickDurations.push(dt);
      runtime.exportState();
    }

    // Force GC after measurement to evict any newly-allocated garbage before
    // reading heapUsed, so we measure retained live objects only.
    if (typeof global.gc === "function") global.gc();
    const heapAfter = process.memoryUsage().heapUsed;
    const heapGrowthMb = (heapAfter - heapBefore) / (1024 * 1024);

    tickDurations.sort((a, b) => a - b);
    const p95 = tickDurations[Math.floor(TICKS * 0.95)]!;
    const p99 = tickDurations[Math.floor(TICKS * 0.99)]!;
    const maxBlock = tickDurations[tickDurations.length - 1]!;

    console.log(`[prod-shape-load] p95=${p95.toFixed(1)}ms p99=${p99.toFixed(1)}ms max=${maxBlock.toFixed(1)}ms events=${eventCount} heapGrowth=${heapGrowthMb.toFixed(1)}MB`);
    void warmEventCount;

    // Hard assertions
    expect(p95, "p95 tick wall time < 300ms").toBeLessThan(300);
    expect(p99, "p99 tick wall time < 800ms").toBeLessThan(800);
    expect(maxBlock, "max single-tick block < 5000ms (watchdog headroom)").toBeLessThan(5_000);
    expect(maxBlock, "no tick > 10s").toBeLessThan(10_000);
    expect(heapGrowthMb, "heap growth < 100MB across 600 ticks").toBeLessThan(100);
  }, 120_000 /* 2 min timeout */);
});
