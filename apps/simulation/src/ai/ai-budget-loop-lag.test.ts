/**
 * Tests for Layer 2 (budget tracker) and Layer 3 (loop-lag observer)
 * integration via the shouldRun hook in createWorkerAiCommandProducer.
 *
 * Verifies that when shouldRun returns false, the tick is skipped
 * and the producer does not attempt to submit commands or interact
 * with the worker.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";

// ─── Minimal mock Worker ─────────────────────────────────────────────────────

class MockWorker extends EventEmitter {
  readonly posted: unknown[] = [];
  postMessage(msg: unknown): void {
    this.posted.push(msg);
  }
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

// ─── Loop-lag threshold logic (extracted for direct testing) ─────────────────

/**
 * Extracted logic from simulation-service.ts aiShouldRun Layer 3.
 * Returns true when the tick should be skipped due to event-loop lag.
 */
const shouldSkipForLoopLag = (gapMs: number, baseIntervalMs: number): boolean =>
  gapMs > baseIntervalMs + 20 && gapMs < baseIntervalMs * 1.5;

// ─── Tests ───────────────────────────────────────────────────────────────────

afterEach(() => {
  vi.useRealTimers();
});

describe("shouldRun budget/loop-lag integration (Layer 2 + 3)", () => {
  it("skips the tick entirely when shouldRun returns false", async () => {
    const runtime = makeRuntime(0);
    const submitCommand = vi.fn(async () => undefined);
    const shouldRun = vi.fn(() => false);

    const producer = createWorkerAiCommandProducer({
      runtime,
      aiPlayerIds: ["ai-1"], // non-empty so tick enters the planner loop
      submitCommand,
      shouldRun,
      workerScriptPath: "unused-by-mock.js"
    });

    await producer.tick();

    // shouldRun was checked at the top of tick()
    expect(shouldRun).toHaveBeenCalled();
    // submitCommand must NOT have been called — the tick was skipped
    expect(submitCommand).not.toHaveBeenCalled();

    producer.close();
  });

  it("proceeds with the tick when shouldRun returns true", async () => {
    const runtime = makeRuntime(0);
    const onTick = vi.fn();
    const shouldRun = vi.fn(() => true);

    // Use empty aiPlayerIds so the tick returns early at the planner loop
    // but still exercises the full try/finally path (onTick, adaptive logic).
    const producer = createWorkerAiCommandProducer({
      runtime,
      aiPlayerIds: [],
      submitCommand: vi.fn(async () => undefined),
      shouldRun,
      onTick,
      workerScriptPath: "unused-by-mock.js"
    });

    await producer.tick();
    expect(shouldRun).toHaveBeenCalled();
    // onTick fires from the finally block — confirms the tick body executed
    expect(onTick).toHaveBeenCalled();

    producer.close();
  });

  it("onThrottle for 'adaptive' is independent of shouldRun-based throttling", async () => {
    // The adaptive throttle fires from the finally block when tick > 50ms.
    // It should NOT fire when shouldRun blocks the tick entirely.
    const runtime = makeRuntime(0);
    const onThrottle = vi.fn();
    const onTick = vi.fn();
    const shouldRun = vi.fn(() => false);

    const producer = createWorkerAiCommandProducer({
      runtime,
      aiPlayerIds: [],
      submitCommand: vi.fn(async () => undefined),
      shouldRun,
      onThrottle,
      onTick,
      workerScriptPath: "unused-by-mock.js"
    });

    await producer.tick();

    // shouldRun returned false → tick was skipped before entering the try block.
    // onThrottle (adaptive) only fires from the finally block after tick work.
    expect(shouldRun).toHaveBeenCalled();
    expect(onThrottle).not.toHaveBeenCalled();
    expect(onTick).not.toHaveBeenCalled();

    producer.close();
  });
});

describe("loop-lag threshold logic (Layer 3)", () => {
  const BASE = 250;

  it("flags loop lag when gap is slightly above base + 20ms", () => {
    expect(shouldSkipForLoopLag(271, BASE)).toBe(true);  // 250 + 21
    expect(shouldSkipForLoopLag(280, BASE)).toBe(true);
    expect(shouldSkipForLoopLag(370, BASE)).toBe(true);  // just below 1.5x
  });

  it("does NOT flag loop lag when gap is at or below base + 20ms", () => {
    expect(shouldSkipForLoopLag(270, BASE)).toBe(false); // exactly base + 20
    expect(shouldSkipForLoopLag(250, BASE)).toBe(false);
    expect(shouldSkipForLoopLag(100, BASE)).toBe(false);
  });

  it("does NOT flag loop lag when adaptive backoff is active (gap >= base * 1.5)", () => {
    // When the adaptive tick has backed off to 400ms or more,
    // the larger gap is expected — not loop lag.
    expect(shouldSkipForLoopLag(375, BASE)).toBe(false); // exactly 1.5x = 375
    expect(shouldSkipForLoopLag(500, BASE)).toBe(false);
    expect(shouldSkipForLoopLag(1000, BASE)).toBe(false);
  });

  it("works with non-default base interval", () => {
    const FAST_BASE = 200;
    expect(shouldSkipForLoopLag(225, FAST_BASE)).toBe(true);  // 200 + 25
    expect(shouldSkipForLoopLag(221, FAST_BASE)).toBe(true);  // 200 + 21
    expect(shouldSkipForLoopLag(220, FAST_BASE)).toBe(false); // exactly base + 20
    expect(shouldSkipForLoopLag(300, FAST_BASE)).toBe(false); // 1.5x exactly = 300
  });

  it("returns false for zero gap (first call)", () => {
    expect(shouldSkipForLoopLag(0, BASE)).toBe(false);
  });
});
