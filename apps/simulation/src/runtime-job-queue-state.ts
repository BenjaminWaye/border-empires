import type { RuntimeJobQueueMutableState } from "./runtime-job-queue.js";

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
