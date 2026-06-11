/**
 * Tests for Layer 1 — adaptive tick interval backoff/recovery in
 * createWorkerAiCommandProducer.
 *
 * Uses an empty aiPlayerIds list so the tick returns early at the
 * planner loop, keeping the test focused on the finally-block logic.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";

// ─── Minimal mock Worker ─────────────────────────────────────────────────────

class MockWorker extends EventEmitter {
  postMessage(_msg: unknown): void {}
  terminate(): Promise<void> {
    return Promise.resolve();
  }
}

vi.mock("node:worker_threads", () => ({
  Worker: MockWorker
}));

const { createWorkerAiCommandProducer } = await import("./ai-command-producer-worker.js");

// ─── Helpers ─────────────────────────────────────────────────────────────────

const makeRuntime = (humanInteractive = 0) => ({
  queueDepths: () => ({
    human_interactive: humanInteractive,
    human_noninteractive: 0,
    system: 0,
    ai: 0
  }),
  exportPlannerWorldView: () => ({ tiles: [], players: [] }),
  exportPlannerPlayerViews: () => [],
  onEvent: () => () => undefined,
  exportTilesForKeys: async () => []
});

// ─── Tests ───────────────────────────────────────────────────────────────────

afterEach(() => {
  vi.useRealTimers();
});

describe("adaptive tick interval (Layer 1)", () => {
  it("doubles interval when a tick exceeds the 50ms backoff threshold", async () => {
    const runtime = makeRuntime(0);
    const onThrottle = vi.fn();
    const onIntervalChange = vi.fn();

    const now = vi.fn();
    // First call in tick: tickStartedAt → return 0
    // Second call in tick (finally block): tickDurationMs → 100
    now.mockReturnValueOnce(0).mockReturnValueOnce(100);

    const producer = createWorkerAiCommandProducer({
      runtime,
      aiPlayerIds: [], // empty → tick returns early at planner loop
      submitCommand: vi.fn(async () => undefined),
      now,
      onThrottle,
      onIntervalChange,
      workerScriptPath: "unused-by-mock.js"
    });

    await producer.tick();

    expect(onThrottle).toHaveBeenCalledWith("adaptive");
    // Initial tick interval is 250ms; doubled once → 500ms
    expect(onIntervalChange).toHaveBeenCalledWith(500);

    producer.close();
  });

  it("halves interval when a tick is under the 25ms recovery threshold", async () => {
    const runtime = makeRuntime(0);
    const onThrottle = vi.fn();
    const onIntervalChange = vi.fn();

    // First, run a heavy tick to back off to 500ms
    {
      const now = vi.fn();
      now.mockReturnValueOnce(0).mockReturnValueOnce(100); // 100ms > 50ms → backoff

      const producer = createWorkerAiCommandProducer({
        runtime,
        aiPlayerIds: [],
        submitCommand: vi.fn(async () => undefined),
        now,
        onThrottle: vi.fn(),
        onIntervalChange: vi.fn(),
        tickIntervalMs: 250,
        workerScriptPath: "unused-by-mock.js"
      });

      await producer.tick();
      producer.close();
    }

    // Now create a fresh producer and simulate a quiet tick (10ms)
    const now2 = vi.fn();
    now2.mockReturnValueOnce(0).mockReturnValueOnce(10); // 10ms < 25ms → recovery

    const producer2 = createWorkerAiCommandProducer({
      runtime,
      aiPlayerIds: [],
      submitCommand: vi.fn(async () => undefined),
      now: now2,
      onThrottle,
      onIntervalChange,
      tickIntervalMs: 500, // start at 500ms (already backed off)
      workerScriptPath: "unused-by-mock.js"
    });

    await producer2.tick();

    // No throttle — tick was fast enough
    expect(onThrottle).not.toHaveBeenCalled();
    // 500ms → halved → 250ms
    expect(onIntervalChange).toHaveBeenCalledWith(250);

    producer2.close();
  });

  it("does not back off when tick duration is exactly at threshold", async () => {
    const runtime = makeRuntime(0);
    const onThrottle = vi.fn();
    const onIntervalChange = vi.fn();

    const now = vi.fn();
    now.mockReturnValueOnce(0).mockReturnValueOnce(50); // exactly 50ms — NOT > 50

    const producer = createWorkerAiCommandProducer({
      runtime,
      aiPlayerIds: [],
      submitCommand: vi.fn(async () => undefined),
      now,
      onThrottle,
      onIntervalChange,
      tickIntervalMs: 250,
      workerScriptPath: "unused-by-mock.js"
    });

    await producer.tick();

    expect(onThrottle).not.toHaveBeenCalled();
    // Interval should not change
    expect(onIntervalChange).not.toHaveBeenCalled();

    producer.close();
  });

  it("respects the MAX_TICK_MS ceiling (3200ms)", async () => {
    const runtime = makeRuntime(0);
    const onIntervalChange = vi.fn();

    // Start at 3200ms (at ceiling). A slow tick should NOT go above.
    const now = vi.fn();
    now.mockReturnValueOnce(0).mockReturnValueOnce(100); // 100ms > 50ms → backoff

    const producer = createWorkerAiCommandProducer({
      runtime,
      aiPlayerIds: [],
      submitCommand: vi.fn(async () => undefined),
      now,
      onThrottle: vi.fn(),
      onIntervalChange,
      tickIntervalMs: 3200,
      workerScriptPath: "unused-by-mock.js"
    });

    await producer.tick();

    // Interval should remain at 3200 (Math.min(3200, 3200*2) = 3200)
    // But since it didn't change (3200 → 3200), onIntervalChange should NOT fire
    expect(onIntervalChange).not.toHaveBeenCalled();

    producer.close();
  });

  it("respects the MIN_TICK_MS floor (200ms)", async () => {
    const runtime = makeRuntime(0);
    const onIntervalChange = vi.fn();

    // Start at 200ms (at floor). A quiet tick should NOT go below.
    const now = vi.fn();
    now.mockReturnValueOnce(0).mockReturnValueOnce(10); // 10ms < 25ms → recovery attempt

    const producer = createWorkerAiCommandProducer({
      runtime,
      aiPlayerIds: [],
      submitCommand: vi.fn(async () => undefined),
      now,
      onThrottle: vi.fn(),
      onIntervalChange,
      tickIntervalMs: 200,
      workerScriptPath: "unused-by-mock.js"
    });

    await producer.tick();

    // nextTickDelayMs > MIN_TICK_MS is false (200 > 200 is false)
    // So the recovery branch is skipped
    expect(onIntervalChange).not.toHaveBeenCalled();

    producer.close();
  });

  it("fires onTick with the correct duration", async () => {
    const runtime = makeRuntime(0);
    const onTick = vi.fn();

    const now = vi.fn();
    now.mockReturnValueOnce(0).mockReturnValueOnce(42);

    const producer = createWorkerAiCommandProducer({
      runtime,
      aiPlayerIds: [],
      submitCommand: vi.fn(async () => undefined),
      now,
      onTick,
      workerScriptPath: "unused-by-mock.js"
    });

    await producer.tick();

    expect(onTick).toHaveBeenCalledWith({ durationMs: 42 });

    producer.close();
  });
});
