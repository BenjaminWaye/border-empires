import { describe, expect, it, vi } from "vitest";
import type { QueueLane } from "./command-lane/command-lane.js";
import {
  drainQueues,
  enqueueJob,
  hasQueuedJobs,
  nextQueuedScheduling,
  scheduleDrain,
  type RuntimeJobQueueContext,
  type RuntimeJobQueueMutableState
} from "./runtime-job-queue.js";
import type { SimulationJob } from "./runtime-types.js";

const priorityOrder: QueueLane[] = ["human_interactive", "human_noninteractive", "system", "ai"];

const emptyJobsByLane = (): Record<QueueLane, SimulationJob[]> => ({
  human_interactive: [],
  human_noninteractive: [],
  system: [],
  ai: []
});

/**
 * Builds a fake ctx/state pair backed by plain in-memory arrays and a
 * controllable clock. Scheduled callbacks are captured instead of run so
 * tests can assert on scheduling decisions without executing them, unless a
 * test opts into `runScheduled: true` to actually drain follow-up work.
 */
const createHarness = (
  overrides: Partial<RuntimeJobQueueContext> = {},
  options: { runScheduled?: boolean; backgroundBatchSize?: number } = {}
) => {
  let nowMs = 0;
  const jobsByLane = emptyJobsByLane();
  const soonTasks: Array<() => void> = [];
  const afterTasks: Array<{ delayMs: number; task: () => void }> = [];

  const ctx: RuntimeJobQueueContext = {
    jobsByLane,
    priorityOrder,
    backgroundBatchSize: options.backgroundBatchSize ?? 10,
    now: () => nowMs,
    scheduleSoon: (task) => {
      soonTasks.push(task);
      if (options.runScheduled) task();
    },
    scheduleAfter: (delayMs, task) => {
      afterTasks.push({ delayMs, task });
      if (options.runScheduled) task();
    },
    queueDepths: () => ({
      human_interactive: jobsByLane.human_interactive.length,
      human_noninteractive: jobsByLane.human_noninteractive.length,
      system: jobsByLane.system.length,
      ai: jobsByLane.ai.length
    }),
    ...overrides
  };

  let draining = false;
  let drainScheduled = false;
  let immediateDrainScheduled = false;
  const state: RuntimeJobQueueMutableState = {
    getDraining: () => draining,
    setDraining: (value) => {
      draining = value;
    },
    getDrainScheduled: () => drainScheduled,
    setDrainScheduled: (value) => {
      drainScheduled = value;
    },
    getImmediateDrainScheduled: () => immediateDrainScheduled,
    setImmediateDrainScheduled: (value) => {
      immediateDrainScheduled = value;
    }
  };

  return { ctx, state, jobsByLane, soonTasks, afterTasks, setNow: (value: number) => (nowMs = value) };
};

describe("runtime-job-queue", () => {
  describe("hasQueuedJobs / nextQueuedScheduling", () => {
    it("reports empty queues as having no jobs", () => {
      const { ctx } = createHarness();
      expect(hasQueuedJobs(ctx)).toBe(false);
      expect(nextQueuedScheduling(ctx)).toBe("immediate");
    });

    it("finds queued jobs across any lane and reports the scheduling of the highest-priority one", () => {
      const { ctx, jobsByLane } = createHarness();
      jobsByLane.ai.push({ lane: "ai", run: () => {}, enqueuedAt: 0, scheduling: "background" });
      expect(hasQueuedJobs(ctx)).toBe(true);
      expect(nextQueuedScheduling(ctx)).toBe("background");

      jobsByLane.human_interactive.push({ lane: "human_interactive", run: () => {}, enqueuedAt: 0, scheduling: "immediate" });
      expect(nextQueuedScheduling(ctx)).toBe("immediate");
    });

    it("defaults missing scheduling to immediate", () => {
      const { ctx, jobsByLane } = createHarness();
      jobsByLane.system.push({ lane: "system", run: () => {}, enqueuedAt: 0 });
      expect(nextQueuedScheduling(ctx)).toBe("immediate");
    });
  });

  describe("enqueueJob", () => {
    it("appends a job to its lane, stamping enqueuedAt from ctx.now()", () => {
      const { ctx, state, jobsByLane, setNow } = createHarness();
      setNow(1_234);
      enqueueJob(ctx, state, "system", () => {});
      expect(jobsByLane.system).toHaveLength(1);
      expect(jobsByLane.system[0]?.enqueuedAt).toBe(1_234);
      expect(jobsByLane.system[0]?.scheduling).toBe("immediate");
    });

    it("attaches commandType and commandId only when provided", () => {
      const { ctx, state, jobsByLane } = createHarness();
      enqueueJob(ctx, state, "ai", () => {}, "COLLECT_TILE", "background", "cmd-1");
      expect(jobsByLane.ai[0]?.commandType).toBe("COLLECT_TILE");
      expect(jobsByLane.ai[0]?.commandId).toBe("cmd-1");
      expect(jobsByLane.ai[0]?.scheduling).toBe("background");

      enqueueJob(ctx, state, "ai", () => {});
      expect(jobsByLane.ai[1]).not.toHaveProperty("commandType");
      expect(jobsByLane.ai[1]).not.toHaveProperty("commandId");
    });

    it("schedules a drain after enqueueing", () => {
      const { ctx, state, soonTasks } = createHarness();
      enqueueJob(ctx, state, "human_interactive", () => {});
      expect(soonTasks).toHaveLength(1);
    });
  });

  describe("scheduleDrain", () => {
    it("does nothing while already draining", () => {
      const { ctx, state, soonTasks, afterTasks } = createHarness();
      state.setDraining(true);
      scheduleDrain(ctx, state, "immediate");
      scheduleDrain(ctx, state, "background");
      expect(soonTasks).toHaveLength(0);
      expect(afterTasks).toHaveLength(0);
    });

    it("coalesces repeated immediate schedule requests into one scheduleSoon call", () => {
      const { ctx, state, soonTasks } = createHarness();
      scheduleDrain(ctx, state, "immediate");
      scheduleDrain(ctx, state, "immediate");
      expect(soonTasks).toHaveLength(1);
    });

    it("coalesces repeated background schedule requests into one scheduleAfter call", () => {
      const { ctx, state, afterTasks } = createHarness();
      scheduleDrain(ctx, state, "background");
      scheduleDrain(ctx, state, "background");
      expect(afterTasks).toHaveLength(1);
      expect(afterTasks[0]?.delayMs).toBe(0);
    });

    it("skips a background schedule when an immediate drain is already scheduled", () => {
      const { ctx, state, soonTasks, afterTasks } = createHarness();
      scheduleDrain(ctx, state, "immediate");
      scheduleDrain(ctx, state, "background");
      expect(soonTasks).toHaveLength(1);
      expect(afterTasks).toHaveLength(0);
    });
  });

  describe("drainQueues", () => {
    it("processes jobs in lane priority order regardless of enqueue order", () => {
      const order: QueueLane[] = [];
      const { ctx, state, jobsByLane } = createHarness();
      jobsByLane.ai.push({ lane: "ai", run: () => order.push("ai"), enqueuedAt: 0, scheduling: "immediate" });
      jobsByLane.system.push({ lane: "system", run: () => order.push("system"), enqueuedAt: 0, scheduling: "immediate" });
      jobsByLane.human_interactive.push({ lane: "human_interactive", run: () => order.push("human_interactive"), enqueuedAt: 0, scheduling: "immediate" });

      drainQueues(ctx, state);

      expect(order).toEqual(["human_interactive", "system", "ai"]);
      expect(hasQueuedJobs(ctx)).toBe(false);
    });

    it("re-entrancy guard: does nothing if already draining", () => {
      const run = vi.fn();
      const { ctx, state, jobsByLane } = createHarness();
      jobsByLane.system.push({ lane: "system", run, enqueuedAt: 0, scheduling: "immediate" });
      state.setDraining(true);

      drainQueues(ctx, state);

      expect(run).not.toHaveBeenCalled();
    });

    it("clears the draining flag even when a job throws", () => {
      const { ctx, state, jobsByLane } = createHarness();
      jobsByLane.system.push({
        lane: "system",
        run: () => {
          throw new Error("boom");
        },
        enqueuedAt: 0,
        scheduling: "immediate"
      });

      expect(() => drainQueues(ctx, state)).toThrow("boom");
      expect(state.getDraining()).toBe(false);
    });

    it("processes a human job that arrives mid-drain, then yields before falling back to the remaining background work", () => {
      const order: string[] = [];
      const { ctx, state, jobsByLane } = createHarness();
      jobsByLane.ai.push({
        lane: "ai",
        run: () => {
          order.push("ai-background");
          // Simulate a human command arriving mid-drain.
          jobsByLane.human_interactive.push({ lane: "human_interactive", run: () => order.push("human"), enqueuedAt: 0, scheduling: "immediate" });
        },
        enqueuedAt: 0,
        scheduling: "background"
      });
      jobsByLane.ai.push({ lane: "ai", run: () => order.push("ai-background-2"), enqueuedAt: 0, scheduling: "background" });

      drainQueues(ctx, state);

      // shiftNextJob always prefers human lanes, so the newly-arrived human job
      // is picked up and run before the remaining ai job — but since we're
      // transitioning from an immediate job back to queued background work,
      // the drain yields instead of continuing straight into ai-background-2.
      expect(order).toEqual(["ai-background", "human"]);
      expect(jobsByLane.human_interactive).toHaveLength(0);
      expect(jobsByLane.ai).toHaveLength(1);
    });

    it("defers a background-scheduled job that is queued ahead of an immediate job in the same lane", () => {
      const run = vi.fn();
      const immediateRun = vi.fn();
      const { ctx, state, jobsByLane } = createHarness();
      jobsByLane.human_noninteractive.push({ lane: "human_noninteractive", run, enqueuedAt: 0, scheduling: "background" });
      jobsByLane.human_noninteractive.push({ lane: "human_noninteractive", run: immediateRun, enqueuedAt: 0, scheduling: "immediate" });

      drainQueues(ctx, state);

      // The background job at the front of the lane is put back rather than
      // run ahead of the immediate job queued behind it, and the whole drain
      // yields — this is a broad yield, not a same-lane reorder.
      expect(run).not.toHaveBeenCalled();
      expect(immediateRun).not.toHaveBeenCalled();
      expect(jobsByLane.human_noninteractive.map((j) => j.run)).toEqual([run, immediateRun]);
    });

    it("stops background draining when shouldPauseBackground returns true for the ai lane", () => {
      const run = vi.fn();
      const { ctx, state, jobsByLane } = createHarness({ shouldPauseBackground: () => true });
      jobsByLane.ai.push({ lane: "ai", run, enqueuedAt: 0, scheduling: "background" });

      drainQueues(ctx, state);

      expect(run).not.toHaveBeenCalled();
      expect(jobsByLane.ai).toHaveLength(1);
    });

    it("does not pause system-lane jobs via shouldPauseBackground (only checked for ai)", () => {
      const run = vi.fn();
      const { ctx, state, jobsByLane } = createHarness({ shouldPauseBackground: () => true });
      jobsByLane.system.push({ lane: "system", run, enqueuedAt: 0, scheduling: "background" });

      drainQueues(ctx, state);

      expect(run).toHaveBeenCalledTimes(1);
    });

    it("caps background (system/ai) jobs processed per drain at backgroundBatchSize", () => {
      const processed: string[] = [];
      const { ctx, state, jobsByLane } = createHarness({}, { backgroundBatchSize: 2 });
      for (let i = 0; i < 5; i += 1) {
        jobsByLane.system.push({ lane: "system", run: () => processed.push(`s${i}`), enqueuedAt: 0, scheduling: "background" });
      }

      drainQueues(ctx, state);

      expect(processed).toEqual(["s0", "s1"]);
      expect(jobsByLane.system).toHaveLength(3);
    });

    it("does not cap human lanes even when scheduled as background", () => {
      const processed: string[] = [];
      const { ctx, state, jobsByLane } = createHarness({}, { backgroundBatchSize: 1 });
      for (let i = 0; i < 5; i += 1) {
        jobsByLane.human_noninteractive.push({ lane: "human_noninteractive", run: () => processed.push(`h${i}`), enqueuedAt: 0, scheduling: "background" });
      }

      drainQueues(ctx, state);

      expect(processed).toEqual(["h0", "h1", "h2", "h3", "h4"]);
    });

    it("yields when transitioning from an immediate job back to queued background work", () => {
      const order: string[] = [];
      const { ctx, state, jobsByLane } = createHarness();
      jobsByLane.human_interactive.push({ lane: "human_interactive", run: () => order.push("human"), enqueuedAt: 0, scheduling: "immediate" });
      jobsByLane.ai.push({ lane: "ai", run: () => order.push("ai"), enqueuedAt: 0, scheduling: "background" });

      drainQueues(ctx, state);

      expect(order).toEqual(["human"]);
      expect(jobsByLane.ai).toHaveLength(1);
    });

    it("wraps job execution with wrapJobRun, passing lane/commandType/commandId metadata", () => {
      const calls: unknown[] = [];
      const wrapJobRun = vi.fn((run: () => void, meta: unknown) => {
        calls.push(meta);
        return run;
      });
      const { ctx, state, jobsByLane } = createHarness({ wrapJobRun });
      jobsByLane.system.push({ lane: "system", run: vi.fn(), enqueuedAt: 0, scheduling: "immediate", commandType: "COLLECT_TILE", commandId: "cmd-9" });

      drainQueues(ctx, state);

      expect(wrapJobRun).toHaveBeenCalledTimes(1);
      expect(calls[0]).toEqual({ lane: "system", commandType: "COLLECT_TILE", commandId: "cmd-9" });
    });

    it("runs the job directly when wrapJobRun is not provided", () => {
      const run = vi.fn();
      const { ctx, state, jobsByLane } = createHarness();
      jobsByLane.system.push({ lane: "system", run, enqueuedAt: 0, scheduling: "immediate" });

      drainQueues(ctx, state);

      expect(run).toHaveBeenCalledTimes(1);
    });

    it("reports onJobApplied per job and onQueueDrain once per drain with lane counts", () => {
      const onJobApplied = vi.fn();
      const onQueueDrain = vi.fn();
      const { ctx, state, jobsByLane, setNow } = createHarness({ onJobApplied, onQueueDrain });
      setNow(100);
      jobsByLane.human_interactive.push({ lane: "human_interactive", run: () => {}, enqueuedAt: 0, scheduling: "immediate", commandId: "a" });
      jobsByLane.system.push({ lane: "system", run: () => {}, enqueuedAt: 0, scheduling: "immediate" });

      drainQueues(ctx, state);

      expect(onJobApplied).toHaveBeenCalledTimes(2);
      expect(onJobApplied).toHaveBeenNthCalledWith(1, expect.objectContaining({ lane: "human_interactive", commandId: "a" }));
      expect(onQueueDrain).toHaveBeenCalledTimes(1);
      const sample = onQueueDrain.mock.calls[0]?.[0];
      expect(sample.processedJobs).toBe(2);
      expect(sample.processedByLane).toEqual({ human_interactive: 1, human_noninteractive: 0, system: 1, ai: 0 });
      expect(sample.queueDepthsBefore).toEqual({ human_interactive: 1, human_noninteractive: 0, system: 1, ai: 0 });
      expect(sample.queueDepthsAfter).toEqual({ human_interactive: 0, human_noninteractive: 0, system: 0, ai: 0 });
    });

    it("does not call onQueueDrain when no jobs were processed", () => {
      const onQueueDrain = vi.fn();
      const { ctx, state } = createHarness({ onQueueDrain });

      drainQueues(ctx, state);

      expect(onQueueDrain).not.toHaveBeenCalled();
    });

    it("reschedules a background drain via scheduleAfter(0, ...) when it yielded for background work", () => {
      const { ctx, state, jobsByLane, afterTasks } = createHarness();
      jobsByLane.ai.push({
        lane: "ai",
        run: () => {
          jobsByLane.human_interactive.push({ lane: "human_interactive", run: () => {}, enqueuedAt: 0, scheduling: "immediate" });
        },
        enqueuedAt: 0,
        scheduling: "background"
      });
      jobsByLane.ai.push({ lane: "ai", run: () => {}, enqueuedAt: 0, scheduling: "background" });

      drainQueues(ctx, state);

      expect(afterTasks).toHaveLength(1);
      expect(afterTasks[0]?.delayMs).toBe(0);
    });

    it("hitting the background batch cap always yields via scheduleAfter, never scheduleDrain", () => {
      const { ctx, state, jobsByLane, soonTasks, afterTasks } = createHarness({}, { backgroundBatchSize: 1 });
      jobsByLane.system.push({ lane: "system", run: () => {}, enqueuedAt: 0, scheduling: "background" });
      jobsByLane.system.push({ lane: "system", run: () => {}, enqueuedAt: 0, scheduling: "background" });

      drainQueues(ctx, state);

      expect(jobsByLane.system).toHaveLength(1);
      expect(soonTasks).toHaveLength(0);
      expect(afterTasks).toHaveLength(1);
    });

    it("reschedules via scheduleDrain (not scheduleAfter) when a job throws mid-drain, leaving queued work behind", () => {
      // No break condition in the loop was hit (shouldYieldForBackground stays
      // false), so the finally block's "not yielded" branch runs scheduleDrain
      // directly instead of the yield path's scheduleAfter(0, ...).
      const { ctx, state, jobsByLane, soonTasks, afterTasks } = createHarness();
      jobsByLane.system.push({
        lane: "system",
        run: () => {
          throw new Error("boom");
        },
        enqueuedAt: 0,
        scheduling: "immediate"
      });
      jobsByLane.system.push({ lane: "system", run: () => {}, enqueuedAt: 0, scheduling: "immediate" });

      expect(() => drainQueues(ctx, state)).toThrow("boom");

      expect(jobsByLane.system).toHaveLength(1);
      expect(state.getDraining()).toBe(false);
      expect(soonTasks).toHaveLength(1);
      expect(afterTasks).toHaveLength(0);
    });

    it("drains an entire mixed backlog to completion when scheduled callbacks are actually run", () => {
      const order: string[] = [];
      const { ctx, state, jobsByLane } = createHarness({}, { runScheduled: true, backgroundBatchSize: 1 });
      jobsByLane.ai.push({ lane: "ai", run: () => order.push("ai-1"), enqueuedAt: 0, scheduling: "background" });
      jobsByLane.ai.push({ lane: "ai", run: () => order.push("ai-2"), enqueuedAt: 0, scheduling: "background" });
      jobsByLane.human_interactive.push({ lane: "human_interactive", run: () => order.push("human"), enqueuedAt: 0, scheduling: "immediate" });

      drainQueues(ctx, state);

      expect(order).toEqual(["human", "ai-1", "ai-2"]);
      expect(hasQueuedJobs(ctx)).toBe(false);
    });
  });
});
