export type SimulationCommandPriority = "human" | "system" | "ai";

export type SimulationCommandWorkerState<TJob> = {
  humanQueue: TJob[];
  systemQueue: TJob[];
  aiQueue: TJob[];
  draining: boolean;
  lastDequeuedPriority: SimulationCommandPriority | "idle";
  lastDrainAt: number;
  lastDrainElapsedMs: number;
  lastDrainCommands: number;
  lastDrainHumanCommands: number;
  lastDrainSystemCommands: number;
  lastDrainAiCommands: number;
};

type CreateSimulationCommandBusDeps<TJob, TQueuedCommand, TSystemCommand> = {
  now: () => number;
  drainBudgetMs: number;
  drainMaxCommands: number;
  drainHumanQuota: number;
  drainSystemQuota: number;
  drainAiQuota: number;
  queueTask: (fn: () => void) => void;
  executeHumanOrAiJob: (job: TJob) => Promise<void>;
  executeSystemCommand: (command: TSystemCommand) => Promise<void>;
  getJobPriority: (job: TJob) => SimulationCommandPriority;
  getSystemCommand: (job: TJob) => TSystemCommand;
  onError: (message: string, err: unknown) => void;
};

export const createSimulationCommandBus = <TJob, TQueuedCommand, TSystemCommand>(
  deps: CreateSimulationCommandBusDeps<TJob, TQueuedCommand, TSystemCommand>
): {
  state: SimulationCommandWorkerState<TJob>;
  queueDepth: () => number;
  hasQueuedSystemCommand: (predicate: (job: TJob) => boolean) => boolean;
  enqueueJob: (job: TJob) => void;
} => {
  const state: SimulationCommandWorkerState<TJob> = {
    humanQueue: [],
    systemQueue: [],
    aiQueue: [],
    draining: false,
    lastDequeuedPriority: "idle",
    lastDrainAt: 0,
    lastDrainElapsedMs: 0,
    lastDrainCommands: 0,
    lastDrainHumanCommands: 0,
    lastDrainSystemCommands: 0,
    lastDrainAiCommands: 0
  };

  const queueDepth = (): number => state.humanQueue.length + state.systemQueue.length + state.aiQueue.length;

  const dequeueJob = (
    drainedHumanCommands: number,
    drainedSystemCommands: number,
    drainedAiCommands: number
  ): TJob | undefined => {
    const humanPending = state.humanQueue.length > 0;
    const systemPending = state.systemQueue.length > 0;
    const aiPending = state.aiQueue.length > 0;
    if (!humanPending && !systemPending && !aiPending) return undefined;
    if (humanPending && (drainedHumanCommands < deps.drainHumanQuota || (!systemPending && !aiPending))) {
      return state.humanQueue.shift();
    }
    if (systemPending && (drainedSystemCommands < deps.drainSystemQuota || (!humanPending && !aiPending))) {
      return state.systemQueue.shift();
    }
    if (aiPending && (drainedAiCommands < deps.drainAiQuota || !humanPending)) {
      return state.aiQueue.shift();
    }
    if (humanPending) return state.humanQueue.shift();
    if (systemPending) return state.systemQueue.shift();
    return state.aiQueue.shift();
  };

  const drainQueue = async (): Promise<void> => {
    let drainedCommands = 0;
    let drainedHumanCommands = 0;
    let drainedSystemCommands = 0;
    let drainedAiCommands = 0;
    const drainStartedAt = deps.now();
    while (drainedCommands < deps.drainMaxCommands && deps.now() - drainStartedAt < deps.drainBudgetMs) {
      const job = dequeueJob(drainedHumanCommands, drainedSystemCommands, drainedAiCommands);
      if (!job) break;
      const priority = deps.getJobPriority(job);
      state.lastDequeuedPriority = priority;
      try {
        if (priority === "system") {
          await deps.executeSystemCommand(deps.getSystemCommand(job));
        } else {
          await deps.executeHumanOrAiJob(job);
        }
      } catch (err) {
        deps.onError("simulation command failed", err);
      }
      drainedCommands += 1;
      if (priority === "human") drainedHumanCommands += 1;
      else if (priority === "system") drainedSystemCommands += 1;
      else drainedAiCommands += 1;
    }
    state.lastDrainAt = deps.now();
    state.lastDrainElapsedMs = state.lastDrainAt - drainStartedAt;
    state.lastDrainCommands = drainedCommands;
    state.lastDrainHumanCommands = drainedHumanCommands;
    state.lastDrainSystemCommands = drainedSystemCommands;
    state.lastDrainAiCommands = drainedAiCommands;
    if (queueDepth() <= 0) {
      state.draining = false;
      state.lastDequeuedPriority = "idle";
      return;
    }
    deps.queueTask(() => {
      void drainQueue();
    });
  };

  const queueDrain = (): void => {
    if (state.draining) return;
    state.draining = true;
    deps.queueTask(() => {
      void drainQueue();
    });
  };

  const enqueueJob = (job: TJob): void => {
    const priority = deps.getJobPriority(job);
    if (priority === "human") state.humanQueue.push(job);
    else if (priority === "system") state.systemQueue.push(job);
    else state.aiQueue.push(job);
    queueDrain();
  };

  return {
    state,
    queueDepth,
    hasQueuedSystemCommand: (predicate) => state.systemQueue.some(predicate),
    enqueueJob
  };
};
