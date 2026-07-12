import type { CommandEnvelope } from "@border-empires/sim-protocol";
import type { QueueLane } from "./command-lane/command-lane.js";
import type { SimulationJob } from "./runtime-types.js";

export type RuntimeJobQueueContext = {
  jobsByLane: Record<QueueLane, SimulationJob[]>;
  priorityOrder: readonly QueueLane[];
  backgroundBatchSize: number;
  now: () => number;
  scheduleSoon: (task: () => void) => void;
  scheduleAfter: (delayMs: number, task: () => void) => void;
  queueDepths: () => Record<QueueLane, number>;
  shouldPauseBackground?: (() => boolean) | undefined;
  wrapJobRun?:
    | ((run: () => void, meta: { lane: QueueLane; commandType?: CommandEnvelope["type"]; commandId?: string }) => () => void)
    | undefined;
  onQueueDrain?:
    | ((sample: {
        durationMs: number;
        processedJobs: number;
        backgroundJobsProcessed: number;
        yieldedForBackground: boolean;
        processedByLane: Record<QueueLane, number>;
        queueDepthsBefore: Record<QueueLane, number>;
        queueDepthsAfter: Record<QueueLane, number>;
      }) => void)
    | undefined;
  onJobApplied?:
    | ((sample: {
        lane: QueueLane;
        durationMs: number;
        commandType?: CommandEnvelope["type"];
        commandId?: string;
      }) => void)
    | undefined;
};

export type RuntimeJobQueueMutableState = {
  getDraining: () => boolean;
  setDraining: (value: boolean) => void;
  getDrainScheduled: () => boolean;
  setDrainScheduled: (value: boolean) => void;
  getImmediateDrainScheduled: () => boolean;
  setImmediateDrainScheduled: (value: boolean) => void;
};

const shiftNextJob = (ctx: RuntimeJobQueueContext): SimulationJob | undefined => {
  for (const lane of ctx.priorityOrder) {
    const next = ctx.jobsByLane[lane].shift();
    if (next) return next;
  }
  return undefined;
};

export const hasQueuedJobs = (ctx: RuntimeJobQueueContext): boolean =>
  ctx.priorityOrder.some((lane) => ctx.jobsByLane[lane].length > 0);

export const nextQueuedScheduling = (ctx: RuntimeJobQueueContext): "immediate" | "background" => {
  for (const lane of ctx.priorityOrder) {
    const next = ctx.jobsByLane[lane][0];
    if (next) return next.scheduling ?? "immediate";
  }
  return "immediate";
};

export const enqueueJob = (
  ctx: RuntimeJobQueueContext,
  state: RuntimeJobQueueMutableState,
  lane: QueueLane,
  run: () => void,
  commandType?: CommandEnvelope["type"],
  scheduling: "immediate" | "background" = "immediate",
  commandId?: string
): void => {
  const job: SimulationJob = { lane, run, enqueuedAt: ctx.now(), scheduling };
  if (commandType !== undefined) job.commandType = commandType;
  if (commandId !== undefined) job.commandId = commandId;
  ctx.jobsByLane[lane].push(job);
  scheduleDrain(ctx, state, scheduling);
};

export const scheduleDrain = (
  ctx: RuntimeJobQueueContext,
  state: RuntimeJobQueueMutableState,
  scheduling: "immediate" | "background" = "immediate"
): void => {
  if (state.getDraining()) return;
  if (scheduling === "immediate") {
    if (state.getImmediateDrainScheduled()) return;
    state.setImmediateDrainScheduled(true);
    ctx.scheduleSoon(() => {
      state.setImmediateDrainScheduled(false);
      drainQueues(ctx, state);
    });
    return;
  }
  if (state.getDrainScheduled() || state.getImmediateDrainScheduled()) return;
  state.setDrainScheduled(true);
  ctx.scheduleAfter(0, () => {
    state.setDrainScheduled(false);
    drainQueues(ctx, state);
  });
};

/**
 * Drains queued jobs in lane priority order until either the queue empties
 * or a yield condition is hit: an immediate-lane job arrived while draining
 * background work, the AI planner requested a pause, or the per-drain
 * background batch cap was reached. Yielding reschedules the remainder
 * instead of blocking the event loop for the full backlog.
 */
export const drainQueues = (ctx: RuntimeJobQueueContext, state: RuntimeJobQueueMutableState): void => {
  if (state.getDraining()) return;
  state.setDraining(true);
  const drainStartedAt = ctx.now();
  const queueDepthsBefore = ctx.queueDepths();
  const processedByLane: Record<QueueLane, number> = {
    human_interactive: 0,
    human_noninteractive: 0,
    system: 0,
    ai: 0
  };
  let processedJobs = 0;
  let shouldYieldForBackground = false;
  let backgroundJobsProcessed = 0;
  let currentDrainScheduling: "immediate" | "background" = "immediate";
  try {
    let next = shiftNextJob(ctx);
    while (next) {
      currentDrainScheduling = next.scheduling ?? "immediate";
      if (currentDrainScheduling === "background") {
        const hasImmediateWork =
          ctx.jobsByLane.human_interactive.some((job) => (job.scheduling ?? "immediate") === "immediate") ||
          ctx.jobsByLane.human_noninteractive.some((job) => (job.scheduling ?? "immediate") === "immediate");
        if (hasImmediateWork) {
          ctx.jobsByLane[next.lane].unshift(next);
          shouldYieldForBackground = true;
          break;
        }
      }
      if (next.lane === "ai" && ctx.shouldPauseBackground?.()) {
        ctx.jobsByLane[next.lane].unshift(next);
        shouldYieldForBackground = true;
        break;
      }
      if ((next.lane === "system" || next.lane === "ai") && backgroundJobsProcessed >= ctx.backgroundBatchSize) {
        ctx.jobsByLane[next.lane].unshift(next);
        shouldYieldForBackground = true;
        break;
      }
      const jobStartedAt = ctx.now();
      const jobMeta = {
        lane: next.lane,
        ...(next.commandType ? { commandType: next.commandType } : {}),
        ...(next.commandId ? { commandId: next.commandId } : {})
      };
      (ctx.wrapJobRun ? ctx.wrapJobRun(next.run, jobMeta) : next.run)();
      if (ctx.onJobApplied) {
        const jobDurationMs = Math.max(0, ctx.now() - jobStartedAt);
        ctx.onJobApplied({
          lane: next.lane,
          durationMs: jobDurationMs,
          ...(next.commandType ? { commandType: next.commandType } : {}),
          ...(next.commandId ? { commandId: next.commandId } : {})
        });
      }
      processedJobs += 1;
      processedByLane[next.lane] += 1;
      if (next.lane === "system" || next.lane === "ai") {
        backgroundJobsProcessed += 1;
      }
      next = shiftNextJob(ctx);
      if (currentDrainScheduling === "immediate" && next && (next.scheduling ?? "immediate") === "background") {
        ctx.jobsByLane[next.lane].unshift(next);
        shouldYieldForBackground = true;
        break;
      }
    }
  } finally {
    state.setDraining(false);
    if (processedJobs > 0) {
      ctx.onQueueDrain?.({
        durationMs: Math.max(0, ctx.now() - drainStartedAt),
        processedJobs,
        backgroundJobsProcessed,
        yieldedForBackground: shouldYieldForBackground,
        processedByLane,
        queueDepthsBefore,
        queueDepthsAfter: ctx.queueDepths()
      });
    }
    if (hasQueuedJobs(ctx)) {
      if (shouldYieldForBackground) {
        ctx.scheduleAfter(0, () => drainQueues(ctx, state));
      } else {
        scheduleDrain(ctx, state, nextQueuedScheduling(ctx));
      }
    }
  }
};
