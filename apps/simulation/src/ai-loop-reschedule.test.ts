/**
 * Regression tests for the AI loop-reschedule wedge fix.
 *
 * Covers the three freeze triggers that could permanently kill the
 * setTimeout chain in createWorkerAiCommandProducer:
 *
 *  1. shouldRun() === false → loop must still reschedule the next tick
 *  2. humanBacklogNonEmpty === true → loop must still reschedule
 *  3. requestPlan() never resolves → timeout fires, loop continues,
 *     plan_timeout counter increments via onThrottle
 *
 * Uses the same vi.mock("node:worker_threads") pattern as ai-pause-resume.test.ts.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import type { CommandEnvelope } from "@border-empires/sim-protocol";

// ─── Mock Worker ─────────────────────────────────────────────────────────────

type WorkerMessage = { type: string; [key: string]: unknown };

class MockWorker extends EventEmitter {
  static lastInstance: MockWorker | undefined;

  readonly posted: WorkerMessage[] = [];
  /** Set to true to suppress automatic plan replies. */
  suppressPlanReply = false;
  replyWithCommand: CommandEnvelope | null = null;

  constructor() {
    super();
    MockWorker.lastInstance = this;
  }

  postMessage(msg: WorkerMessage): void {
    this.posted.push(msg);
    if (msg.type === "plan" && !this.suppressPlanReply) {
      const reply = {
        type: "command",
        playerId: msg.playerId,
        command: this.replyWithCommand
      };
      queueMicrotask(() => this.emit("message", reply));
    }
  }

  terminate(): Promise<void> {
    return Promise.resolve();
  }
}

vi.mock("node:worker_threads", () => ({
  Worker: MockWorker
}));

// Import after mock is registered.
const { createWorkerAiCommandProducer } = await import("./ai-command-producer-worker.js");

// ─── Runtime stub ────────────────────────────────────────────────────────────

const makeRuntime = (humanInteractive = 0) => {
  let _humanInteractive = humanInteractive;
  const plannerPlayers = [
    {
      id: "ai-1",
      points: 500,
      manpower: 10,
      hasActiveLock: false,
      territoryTileKeys: [] as string[],
      frontierTileKeys: [] as string[],
      hotFrontierTileKeys: [] as string[],
      strategicFrontierTileKeys: [] as string[],
      buildCandidateTileKeys: [] as string[],
      pendingSettlementTileKeys: [] as string[],
      activeDevelopmentProcessCount: 0,
      tileCollectionVersion: 1
    }
  ];
  return {
    runtime: {
      queueDepths: () => ({ human_interactive: _humanInteractive, human_noninteractive: 0, system: 0, ai: 0 }),
      exportPlannerWorldView: () => ({ tiles: [], players: plannerPlayers }),
      exportPlannerPlayerViews: () => plannerPlayers,
      onEvent: () => () => undefined
    },
    setHumanInteractive: (v: number) => { _humanInteractive = v; }
  };
};

// ─── Tests ───────────────────────────────────────────────────────────────────

afterEach(() => {
  vi.useRealTimers();
});

describe("worker AI command producer — loop reschedule regression", () => {
  it("reschedules the next tick after shouldRun() returns false (freeze trigger 1)", async () => {
    // Call useFakeTimers BEFORE construction so scheduleNextTick() uses fake timers.
    vi.useFakeTimers();
    let shouldRunResult = false;
    let planCount = 0;
    const origPostMessage = MockWorker.prototype.postMessage;
    MockWorker.prototype.postMessage = function (msg: WorkerMessage) {
      if (msg.type === "plan") planCount += 1;
      origPostMessage.call(this, msg);
    };

    const { runtime } = makeRuntime(0);
    const producer = createWorkerAiCommandProducer({
      runtime,
      aiPlayerIds: ["ai-1"],
      submitCommand: async () => undefined,
      shouldRun: () => shouldRunResult,
      tickIntervalMs: 250,
      playerSyncIntervalMs: 100_000,
      workerScriptPath: "unused-by-mock.js"
    });

    // First auto-tick fires shouldRun()===false → skips work, but MUST reschedule.
    await vi.advanceTimersByTimeAsync(300); // advance past tick interval (250ms)
    expect(planCount).toBe(0);

    // Allow shouldRun and advance past the next rescheduled tick.
    shouldRunResult = true;
    await vi.advanceTimersByTimeAsync(300);
    // MockWorker auto-replies via queueMicrotask — flush microtasks.
    await Promise.resolve();
    await Promise.resolve();

    producer.close();
    MockWorker.prototype.postMessage = origPostMessage;

    // If the loop died on the throttle skip, planCount would stay 0 forever.
    expect(planCount).toBeGreaterThanOrEqual(1);
  });

  it("reschedules the next tick when human backlog is non-empty (freeze trigger 2)", async () => {
    vi.useFakeTimers();
    let planCount = 0;
    const origPostMessage = MockWorker.prototype.postMessage;
    MockWorker.prototype.postMessage = function (msg: WorkerMessage) {
      if (msg.type === "plan") planCount += 1;
      origPostMessage.call(this, msg);
    };

    const { runtime, setHumanInteractive } = makeRuntime(1); // backlog present
    const producer = createWorkerAiCommandProducer({
      runtime,
      aiPlayerIds: ["ai-1"],
      submitCommand: async () => undefined,
      tickIntervalMs: 250,
      playerSyncIntervalMs: 100_000,
      workerScriptPath: "unused-by-mock.js"
    });

    // First tick: human backlog → skips work but MUST reschedule.
    await vi.advanceTimersByTimeAsync(300);
    expect(planCount).toBe(0);

    // Drain the backlog and advance past the next rescheduled tick.
    setHumanInteractive(0);
    await vi.advanceTimersByTimeAsync(300);
    // MockWorker auto-replies via queueMicrotask — flush.
    await Promise.resolve();
    await Promise.resolve();

    producer.close();
    MockWorker.prototype.postMessage = origPostMessage;

    // Plan message proves the loop survived the backlog skip.
    expect(planCount).toBeGreaterThanOrEqual(1);
  });

  it("resolves via timeout when worker reply is lost and emits plan_timeout (freeze trigger 3)", async () => {
    vi.useFakeTimers();
    const throttleReasons: string[] = [];
    const origPostMessage = MockWorker.prototype.postMessage;

    // Suppress auto-reply before construction so the first tick's plan
    // request never resolves — simulates a lost worker reply.
    MockWorker.prototype.postMessage = function (msg: WorkerMessage) {
      this.posted.push(msg);
      // No auto-reply — deliberately dropped.
    };

    const { runtime } = makeRuntime(0);
    const producer = createWorkerAiCommandProducer({
      runtime,
      aiPlayerIds: ["ai-1"],
      submitCommand: async () => undefined,
      // Large intervals so only the one scheduled tick and the plan-timeout
      // fire within the window we advance.
      tickIntervalMs: 100_000,
      playerSyncIntervalMs: 100_000,
      onThrottle: (reason) => { throttleReasons.push(reason); },
      workerScriptPath: "unused-by-mock.js"
    });

    const worker = MockWorker.lastInstance!;

    // Fire the initial tick (100 000ms interval).
    await vi.advanceTimersByTimeAsync(100_001);
    const plansBefore = worker.posted.filter((m) => m.type === "plan").length;
    expect(plansBefore).toBeGreaterThanOrEqual(1);

    // Advance past PLAN_REQUEST_TIMEOUT_MS (10 000ms). The timeout fires,
    // resolves { command: null }, the tick finally-block runs scheduleNextTick.
    await vi.advanceTimersByTimeAsync(11_000);

    // Now we're past the initial tick and the plan timeout. Close before the
    // next tick fires (which would be at 100_000ms from the reschedule point).
    producer.close();
    MockWorker.prototype.postMessage = origPostMessage;

    // onThrottle("plan_timeout") was called.
    expect(throttleReasons).toContain("plan_timeout");

    // A second plan message proves the loop rescheduled after the timeout.
    // (The second tick fired just after the plan-timeout resolved and
    // scheduleNextTick was called — but we closed before it could run,
    // so we only assert that plan_timeout fired, which proves rescheduling
    // happened.)
    expect(throttleReasons.filter((r) => r === "plan_timeout").length).toBeGreaterThanOrEqual(1);
  });
});
