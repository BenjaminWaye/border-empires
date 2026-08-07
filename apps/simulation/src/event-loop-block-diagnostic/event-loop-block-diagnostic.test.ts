import { describe, expect, it } from "vitest";

import { buildEventLoopBlockedPayload, type EventLoopBlockedParams } from "./event-loop-block-diagnostic.js";

const MB = 1024 * 1024;

const baseParams = (overrides: Partial<EventLoopBlockedParams> = {}): EventLoopBlockedParams => ({
  lagMs: 2_500,
  detectedAtMs: 10_000,
  blockStartedAtMs: 7_500,
  queueDepths: { ai: 250, human_interactive: 0, human_noninteractive: 0, system: 0 },
  memory: { rss: 531 * MB, heapTotal: 67 * MB, heapUsed: 56 * MB, external: 0, arrayBuffers: 0 } as NodeJS.MemoryUsage,
  persistencePendingCount: 12,
  persistenceDegraded: false,
  activePlayerCount: 5,
  mainThreadTasks: [],
  lagDiagRing: [],
  ...overrides
});

describe("buildEventLoopBlockedPayload", () => {
  it("includes the RSS/heap gap alongside the raw memory figures", () => {
    const payload = buildEventLoopBlockedPayload(baseParams());
    expect(payload.rssMb).toBeCloseTo(531, 0);
    expect(payload.heapTotalMb).toBeCloseTo(67, 0);
    expect(payload.rssHeapGapMb).toBeCloseTo(464, 0);
  });

  it("sorts and caps mainThreadTasks to the top 16 by duration/elapsed", () => {
    const mainThreadTasks = Array.from({ length: 20 }, (_, i) => ({
      phase: `task_${i}`,
      startedAtMs: 8_000,
      endedAtMs: 8_000 + i,
      durationMs: i,
      active: false as const
    }));
    const payload = buildEventLoopBlockedPayload(baseParams({ mainThreadTasks }));
    const tasks = payload.mainThreadTasks as typeof mainThreadTasks;
    expect(tasks).toHaveLength(16);
    expect(tasks[0].phase).toBe("task_19");
    expect(tasks[0].durationMs).toBe(19);
  });

  it("attaches only GC pauses that fall within the block window", () => {
    const payload = buildEventLoopBlockedPayload(
      baseParams({
        lagDiagRing: [
          { at: 7_800, level: "warn", event: "gc_pause_detected", durationMs: 250, gcKind: "mark_sweep_compact" },
          { at: 6_000, level: "warn", event: "gc_pause_detected", durationMs: 150, gcKind: "scavenge" },
          { at: 8_100, level: "warn", event: "simulation_ai_worker_slow", durationMs: 80 }
        ]
      })
    );
    expect(payload.gcPausesDuringBlock).toEqual([{ at: 7_800, durationMs: 250, gcKind: "mark_sweep_compact" }]);
  });

  it("does not mutate the input mainThreadTasks array", () => {
    const mainThreadTasks = [
      { phase: "a", startedAtMs: 1, endedAtMs: 2, durationMs: 1, active: false as const },
      { phase: "b", startedAtMs: 1, endedAtMs: 3, durationMs: 2, active: false as const }
    ];
    const original = mainThreadTasks.slice();
    buildEventLoopBlockedPayload(baseParams({ mainThreadTasks }));
    expect(mainThreadTasks).toEqual(original);
  });
});
