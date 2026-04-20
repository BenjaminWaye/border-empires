import type { CommandEnvelope, SimulationEvent } from "@border-empires/sim-protocol";

import { SimulationRuntime } from "./runtime.js";

type ScheduledTask = {
  dueAt: number;
  order: number;
  run: () => void;
};

class DeterministicSimulationClock {
  private currentTime: number;
  private nextOrder = 0;
  private readonly tasks: ScheduledTask[] = [];

  constructor(startTime: number) {
    this.currentTime = startTime;
  }

  now(): number {
    return this.currentTime;
  }

  scheduleSoon = (task: () => void): void => {
    this.tasks.push({ dueAt: this.currentTime, order: this.nextOrder++, run: task });
  };

  scheduleAfter = (delayMs: number, task: () => void): void => {
    this.tasks.push({ dueAt: this.currentTime + delayMs, order: this.nextOrder++, run: task });
  };

  runUntilIdle(): void {
    while (this.tasks.length > 0) {
      this.tasks.sort((left, right) => (left.dueAt - right.dueAt) || (left.order - right.order));
      const next = this.tasks.shift();
      if (!next) return;
      this.currentTime = next.dueAt;
      next.run();
    }
  }
}

export const runDeterministicReplay = (
  commands: CommandEnvelope[],
  options: { startTime?: number } = {}
): {
  events: SimulationEvent[];
  finalState: ReturnType<SimulationRuntime["exportState"]>;
} => {
  const clock = new DeterministicSimulationClock(options.startTime ?? 1_000);
  const runtime = new SimulationRuntime({
    now: () => clock.now(),
    scheduleSoon: clock.scheduleSoon,
    scheduleAfter: clock.scheduleAfter
  });
  const events: SimulationEvent[] = [];
  runtime.onEvent((event) => {
    events.push(event);
  });

  for (const command of commands) {
    runtime.submitCommand(command);
    clock.runUntilIdle();
  }

  return {
    events,
    finalState: runtime.exportState()
  };
};
