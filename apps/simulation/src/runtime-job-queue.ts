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
  getConsecutiveInteractiveJobs: () => number;
  setConsecutiveInteractiveJobs: (value: number) => void;
};

/**
 * After this many consecutive `human_interactive` jobs are drained back to
 * back, one queued `human_noninteractive` job is taken instead (if any is
 * queued) before interactive jobs resume. This prevents `human_interactive`
 * traffic from strictly starving the noninteractive lane (WATCH_MUSTER,
 * CHOOSE_TECH, WAYPOINT_*, etc.).
 *
 * The counter lives on `RuntimeJobQueueMutableState` and only ever advances
 * when a job is actually shifted off a lane — never wall-clock or random —
 * so it stays fully deterministic across replay (`deterministic-replay.ts`
 * drains the queue to completion between commands, so only one command is
 * ever in flight; a time-based counter would diverge from a live run).
 */
const FAIRNESS_INTERACTIVE_BURST = 5;

const takeNoninteractiveForFairness = (
  ctx: RuntimeJobQueueContext,
  state: RuntimeJobQueueMutableState
): SimulationJob | undefined => {
  if (state.getConsecutiveInteractiveJobs() < FAIRNESS_INTERACTIVE_BURST) return undefined;
  const next = ctx.jobsByLane.human_noninteractive.shift();
  if (next) state.setConsecutiveInteractiveJobs(0);
  return next;
};

const shiftNextJob = (ctx: RuntimeJobQueueContext, state: RuntimeJobQueueMutableState): SimulationJob | undefined => {
  const fairnessPick = takeNoninteractiveForFairness(ctx, state);
  if (fairnessPick) return fairnessPick;
  for (const lane of ctx.priorityOrder) {
    const next = ctx.jobsByLane[lane].shift();
    if (next) {
      if (lane === "human_interactive") {
        state.setConsecutiveInteractiveJobs(state.getConsecutiveInteractiveJobs() + 1);
      } else if (lane === "human_noninteractive") {
        state.setConsecutiveInteractiveJobs(0);
      }
      return next;
    }
  }
  return undefined;
};

export const hasQueuedJobs = (ctx: RuntimeJobQueueContext): boolean =>
  ctx.priorityOrder.some((lane) => ctx.jobsByLane[lane].length > 0);

/**
 * Reports the scheduling of whichever job `shiftNextJob` would actually pick
 * next, so callers (the drain-completion reschedule path) stay in agreement
 * with the fairness override above instead of always assuming strict
 * priority order.
 */
export const nextQueuedScheduling = (
  ctx: RuntimeJobQueueContext,
  state?: RuntimeJobQueueMutableState
): "immediate" | "background" => {
  if (state && state.getConsecutiveInteractiveJobs() >= FAIRNESS_INTERACTIVE_BURST) {
    const fairnessNext = ctx.jobsByLane.human_noninteractive[0];
    if (fairnessNext) return fairnessNext.scheduling ?? "immediate";
  }
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
    let next = shiftNextJob(ctx, state);
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
      next = shiftNextJob(ctx, state);
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
        scheduleDrain(ctx, state, nextQueuedScheduling(ctx, state));
      }
    }
  }
};
