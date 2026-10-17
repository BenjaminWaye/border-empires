import type { CommandEnvelope } from "@border-empires/sim-protocol";

import type { QueueLane } from "./command-lane/command-lane.js";
import { enqueueJob, type RuntimeJobQueueContext, type RuntimeJobQueueMutableState } from "./runtime-job-queue.js";
import { computeQueueBacklogMs, computeQueueDepths } from "./runtime-queue-metrics.js";
import type { SimulationJob } from "./runtime-types.js";

/**
 * Backing store for RuntimeJobQueueMutableState, extracted out of
 * SimulationRuntime (runtime.ts, already over the 500-line cap) so the
 * queue-draining flags and fairness counter have one small owner instead of
 * four private fields plus a getter/setter object living inline in the
 * already-oversized class body.
 */
export class RuntimeJobQueueState implements RuntimeJobQueueMutableState {
  private draining = false;
  private drainScheduled = false;
  private immediateDrainScheduled = false;
  private consecutiveInteractiveJobs = 0;

  getDraining = (): boolean => this.draining;
  setDraining = (value: boolean): void => {
    this.draining = value;
  };
  getDrainScheduled = (): boolean => this.drainScheduled;
  setDrainScheduled = (value: boolean): void => {
    this.drainScheduled = value;
  };
  getImmediateDrainScheduled = (): boolean => this.immediateDrainScheduled;
  setImmediateDrainScheduled = (value: boolean): void => {
    this.immediateDrainScheduled = value;
  };
  getConsecutiveInteractiveJobs = (): number => this.consecutiveInteractiveJobs;
  setConsecutiveInteractiveJobs = (value: number): void => {
    this.consecutiveInteractiveJobs = value;
  };
}

export type RuntimeJobQueueOptions = Pick<
  RuntimeJobQueueContext,
  "backgroundBatchSize" | "now" | "scheduleSoon" | "scheduleAfter" | "shouldPauseBackground" | "wrapJobRun" | "onQueueDrain" | "onJobApplied"
>;

const PRIORITY_ORDER: readonly QueueLane[] = ["human_interactive", "human_noninteractive", "system", "ai"];

/**
 * The simulation's prioritized job lanes and their drain scheduling (see
 * runtime-job-queue.ts for the drain policy). SimulationRuntime owns one and
 * enqueues every command and background job through it.
 */
export class RuntimeJobQueue {
  private readonly jobsByLane: Record<QueueLane, SimulationJob[]> = {
    human_interactive: [],
    human_noninteractive: [],
    system: [],
    ai: []
  };
  private readonly state = new RuntimeJobQueueState();
  private readonly ctx: RuntimeJobQueueContext;

  constructor(options: RuntimeJobQueueOptions) {
    this.ctx = {
      ...options,
      jobsByLane: this.jobsByLane,
      priorityOrder: PRIORITY_ORDER,
      queueDepths: () => this.depths()
    };
  }

  enqueue(
    lane: QueueLane,
    run: () => void,
    commandType?: CommandEnvelope["type"],
    scheduling: "immediate" | "background" = "immediate",
    commandId?: string
  ): void {
    enqueueJob(this.ctx, this.state, lane, run, commandType, scheduling, commandId);
  }

  depths(): Record<QueueLane, number> {
    return computeQueueDepths(this.jobsByLane);
  }

  backlogMs(nowMs: number): Record<QueueLane, number> {
    return computeQueueBacklogMs(this.jobsByLane, nowMs);
  }
}
