import type { CommandEnvelope } from "@border-empires/sim-protocol";
import type { QueueLane } from "./command-lane/command-lane.js";
import type { SimulationJob } from "./runtime-types.js";

export type RuntimeJobQueueState = {
  jobsByLane: Record<QueueLane, SimulationJob[]>;
  priorityOrder: readonly QueueLane[];
  backgroundBatchSize: number;
  now: () => number;
  scheduleSoon: (task: () => void) => void;
  scheduleAfter: (delayMs: number, task: () => void) => void;
  getDraining: () => boolean;
  setDraining: (value: boolean) => void;
  getDrainScheduled: () => boolean;
  setDrainScheduled: (value: boolean) => void;
  getImmediateDrainScheduled: () => boolean;
  setImmediateDrainScheduled: (value: boolean) => void;
  onQueueDrain?: (sample: {
    durationMs: number;
    processedJobs: number;
    backgroundJobsProcessed: number;
    yieldedForBackground: boolean;
    processedByLane: Record<QueueLane, number>;
    queueDepthsBefore: Record<QueueLane, number>;
    queueDepthsAfter: Record<QueueLane, number>;
  }) => void;
  onJobApplied?: (sample: { lane: QueueLane; durationMs: number; commandType?: CommandEnvelope["type"] }) => void;
};

export const queueDepths = (state: Pick<RuntimeJobQueueState, "jobsByLane">): Record<QueueLane, number> => ({
  human_interactive: state.jobsByLane.human_interactive.length,
  human_noninteractive: state.jobsByLane.human_noninteractive.length,
  system: state.jobsByLane.system.length,
  ai: state.jobsByLane.ai.length
});

export const queueBacklogMs = (state: Pick<RuntimeJobQueueState, "jobsByLane">, nowMs: number): Record<QueueLane, number> => {
  const backlogFor = (lane: QueueLane): number => {
    const oldest = state.jobsByLane[lane][0];
    if (!oldest) return 0;
    return Math.max(0, nowMs - oldest.enqueuedAt);
  };
  return {
    human_interactive: backlogFor("human_interactive"),
    human_noninteractive: backlogFor("human_noninteractive"),
    system: backlogFor("system"),
    ai: backlogFor("ai")
  };
};

export const enqueueJob = (
  state: RuntimeJobQueueState,
  lane: QueueLane,
  run: () => void,
  commandType?: CommandEnvelope["type"],
  scheduling: "immediate" | "background" = "immediate"
): void => {
  const job: SimulationJob = { lane, run, enqueuedAt: state.now(), scheduling };
  if (commandType !== undefined) job.commandType = commandType;
  state.jobsByLane[lane].push(job);
  scheduleDrain(state, scheduling);
};

export const scheduleDrain = (state: RuntimeJobQueueState, scheduling: "immediate" | "background" = "immediate"): void => {
  if (state.getDraining()) return;
  if (scheduling === "immediate") {
    if (state.getImmediateDrainScheduled()) return;
    state.setImmediateDrainScheduled(true);
    state.scheduleSoon(() => {
      state.setImmediateDrainScheduled(false);
      drainQueues(state);
    });
    return;
  }
  if (state.getDrainScheduled() || state.getImmediateDrainScheduled()) return;
  state.setDrainScheduled(true);
  state.scheduleAfter(0, () => {
    state.setDrainScheduled(false);
    drainQueues(state);
  });
};

export const drainQueues = (state: RuntimeJobQueueState): void => {
  if (state.getDraining()) return;
  state.setDraining(true);
  const drainStartedAt = state.now();
  const queueDepthsBefore = queueDepths(state);
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
    let next = shiftNextJob(state);
    while (next) {
      currentDrainScheduling = next.scheduling ?? "immediate";
      if (currentDrainScheduling === "background") {
        const hasImmediateWork =
          state.jobsByLane.human_interactive.some((job) => (job.scheduling ?? "immediate") === "immediate") ||
          state.jobsByLane.human_noninteractive.some((job) => (job.scheduling ?? "immediate") === "immediate");
        if (hasImmediateWork) {
          state.jobsByLane[next.lane].unshift(next);
          shouldYieldForBackground = true;
          break;
        }
      }
      if ((next.lane === "system" || next.lane === "ai") && backgroundJobsProcessed >= state.backgroundBatchSize) {
        state.jobsByLane[next.lane].unshift(next);
        shouldYieldForBackground = true;
        break;
      }
      const jobStartedAt = state.now();
      next.run();
      if (state.onJobApplied) {
        const jobDurationMs = Math.max(0, state.now() - jobStartedAt);
        state.onJobApplied({
          lane: next.lane,
          durationMs: jobDurationMs,
          ...(next.commandType ? { commandType: next.commandType } : {})
        });
      }
      processedJobs += 1;
      processedByLane[next.lane] += 1;
      if (next.lane === "system" || next.lane === "ai") backgroundJobsProcessed += 1;
      next = shiftNextJob(state);
      if (currentDrainScheduling === "immediate" && next && (next.scheduling ?? "immediate") === "background") {
        state.jobsByLane[next.lane].unshift(next);
        shouldYieldForBackground = true;
        break;
      }
    }
  } finally {
    state.setDraining(false);
    if (processedJobs > 0) {
      state.onQueueDrain?.({
        durationMs: Math.max(0, state.now() - drainStartedAt),
        processedJobs,
        backgroundJobsProcessed,
        yieldedForBackground: shouldYieldForBackground,
        processedByLane,
        queueDepthsBefore,
        queueDepthsAfter: queueDepths(state)
      });
    }
    if (hasQueuedJobs(state)) {
      if (shouldYieldForBackground) {
        state.scheduleAfter(0, () => drainQueues(state));
      } else {
        scheduleDrain(state, nextQueuedScheduling(state));
      }
    }
  }
};

const nextQueuedScheduling = (state: RuntimeJobQueueState): "immediate" | "background" => {
  for (const lane of state.priorityOrder) {
    const next = state.jobsByLane[lane][0];
    if (next) return next.scheduling ?? "immediate";
  }
  return "immediate";
};

const shiftNextJob = (state: RuntimeJobQueueState): SimulationJob | undefined => {
  for (const lane of state.priorityOrder) {
    const next = state.jobsByLane[lane].shift();
    if (next) return next;
  }
  return undefined;
};

const hasQueuedJobs = (state: RuntimeJobQueueState): boolean =>
  state.priorityOrder.some((lane) => state.jobsByLane[lane].length > 0);
