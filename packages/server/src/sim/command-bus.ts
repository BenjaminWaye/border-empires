import { Worker } from "node:worker_threads";

import { resolveServerWorkerEntryUrl, resolveServerWorkerOptions } from "../server-worker-entry.js";
import type {
  SimulationCommandBusWorkerMessage,
  SimulationCommandBusWorkerResponse,
  SimulationDispatchJobMeta
} from "./command-bus-shared.js";

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

type CreateSimulationCommandBusDeps<TJob, TSystemCommand> = {
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

type LocalDrainStats = {
  commands: number;
  human: number;
  system: number;
  ai: number;
};

const postWorkerMessage = (worker: Worker, message: SimulationCommandBusWorkerMessage): boolean => {
  try {
    worker.postMessage(message);
    return true;
  } catch {
    return false;
  }
};

export const createSimulationCommandBus = <TJob, TQueuedCommand, TSystemCommand>(
  deps: CreateSimulationCommandBusDeps<TJob, TSystemCommand>
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

  let worker: Worker | undefined;
  let workerReady = false;
  let workerEnabled = false;
  let workerBatchInFlight = false;
  let nextJobId = 0;
  const jobById = new Map<number, TJob>();

  const queueDepth = (): number => state.humanQueue.length + state.systemQueue.length + state.aiQueue.length;

  const updateDrainStats = (
    startedAt: number,
    priority: SimulationCommandPriority | "idle",
    stats: LocalDrainStats
  ): void => {
    state.lastDequeuedPriority = priority;
    state.lastDrainAt = deps.now();
    state.lastDrainElapsedMs = state.lastDrainAt - startedAt;
    state.lastDrainCommands = stats.commands;
    state.lastDrainHumanCommands = stats.human;
    state.lastDrainSystemCommands = stats.system;
    state.lastDrainAiCommands = stats.ai;
    state.draining = workerBatchInFlight || queueDepth() > 0;
    if (!state.draining) {
      state.lastDequeuedPriority = "idle";
    }
  };

  const removeQueuedJob = (job: TJob, priority: SimulationCommandPriority): void => {
    const queue = priority === "human" ? state.humanQueue : priority === "system" ? state.systemQueue : state.aiQueue;
    const index = queue.indexOf(job);
    if (index >= 0) {
      queue.splice(index, 1);
    }
  };

  const dequeueLocalJob = (stats: LocalDrainStats): { job: TJob; priority: SimulationCommandPriority } | undefined => {
    const humanPending = state.humanQueue.length > 0;
    const systemPending = state.systemQueue.length > 0;
    const aiPending = state.aiQueue.length > 0;
    if (!humanPending && !systemPending && !aiPending) return undefined;
    if (humanPending && (stats.human < deps.drainHumanQuota || (!systemPending && !aiPending))) {
      return { job: state.humanQueue.shift()!, priority: "human" };
    }
    if (systemPending && (stats.system < deps.drainSystemQuota || (!humanPending && !aiPending))) {
      return { job: state.systemQueue.shift()!, priority: "system" };
    }
    if (aiPending && (stats.ai < deps.drainAiQuota || !humanPending)) {
      return { job: state.aiQueue.shift()!, priority: "ai" };
    }
    if (humanPending) return { job: state.humanQueue.shift()!, priority: "human" };
    if (systemPending) return { job: state.systemQueue.shift()!, priority: "system" };
    return { job: state.aiQueue.shift()!, priority: "ai" };
  };

  const executeDequeuedJob = async (job: TJob, priority: SimulationCommandPriority): Promise<void> => {
    try {
      if (priority === "system") {
        await deps.executeSystemCommand(deps.getSystemCommand(job));
      } else {
        await deps.executeHumanOrAiJob(job);
      }
    } catch (err) {
      deps.onError("simulation command failed", err);
    }
  };

  const drainQueueLocal = async (): Promise<void> => {
    if (workerEnabled) return;
    const startedAt = deps.now();
    const stats: LocalDrainStats = {
      commands: 0,
      human: 0,
      system: 0,
      ai: 0
    };
    let lastPriority: SimulationCommandPriority | "idle" = "idle";
    while (stats.commands < deps.drainMaxCommands && deps.now() - startedAt < deps.drainBudgetMs) {
      const dequeued = dequeueLocalJob(stats);
      if (!dequeued) break;
      lastPriority = dequeued.priority;
      await executeDequeuedJob(dequeued.job, dequeued.priority);
      stats.commands += 1;
      if (dequeued.priority === "human") stats.human += 1;
      else if (dequeued.priority === "system") stats.system += 1;
      else stats.ai += 1;
    }
    updateDrainStats(startedAt, lastPriority, stats);
    if (queueDepth() <= 0) {
      maybeEnableWorker();
      return;
    }
    deps.queueTask(() => {
      void drainQueueLocal();
    });
  };

  const queueLocalDrain = (): void => {
    if (workerEnabled || state.draining) return;
    state.draining = true;
    deps.queueTask(() => {
      void drainQueueLocal();
    });
  };

  const maybeEnableWorker = (): void => {
    if (workerEnabled || !workerReady || queueDepth() > 0 || state.draining) return;
    workerEnabled = true;
  };

  const disableWorker = (message: string, err?: unknown): void => {
    if (!workerEnabled && !worker) return;
    workerReady = false;
    workerEnabled = false;
    workerBatchInFlight = false;
    if (worker) {
      try {
        void worker.terminate();
      } catch {}
      worker = undefined;
    }
    if (err !== undefined) {
      deps.onError(message, err);
    }
    if (queueDepth() > 0) {
      queueLocalDrain();
    } else {
      state.draining = false;
      state.lastDequeuedPriority = "idle";
    }
  };

  const handleWorkerBatch = async (metas: SimulationDispatchJobMeta[]): Promise<void> => {
    const startedAt = deps.now();
    const stats: LocalDrainStats = {
      commands: 0,
      human: 0,
      system: 0,
      ai: 0
    };
    let lastPriority: SimulationCommandPriority | "idle" = "idle";
    for (const meta of metas) {
      const job = jobById.get(meta.jobId);
      jobById.delete(meta.jobId);
      if (!job) continue;
      removeQueuedJob(job, meta.priority);
      lastPriority = meta.priority;
      await executeDequeuedJob(job, meta.priority);
      stats.commands += 1;
      if (meta.priority === "human") stats.human += 1;
      else if (meta.priority === "system") stats.system += 1;
      else stats.ai += 1;
    }
    workerBatchInFlight = false;
    updateDrainStats(startedAt, lastPriority, stats);
    if (worker && workerEnabled && !postWorkerMessage(worker, { type: "batch_complete" })) {
      disableWorker("simulation command bus worker completion failed");
      return;
    }
    if (!workerEnabled && queueDepth() > 0) {
      queueLocalDrain();
    }
  };

  const startWorker = (): void => {
    try {
      const created = new Worker(resolveServerWorkerEntryUrl("commandBus"), resolveServerWorkerOptions());
      created.on("message", (message: SimulationCommandBusWorkerResponse) => {
        if (message.type === "ready") {
          workerReady = true;
          if (
            !postWorkerMessage(created, {
              type: "configure",
              drainBudgetMs: deps.drainBudgetMs,
              drainMaxCommands: deps.drainMaxCommands,
              drainHumanQuota: deps.drainHumanQuota,
              drainSystemQuota: deps.drainSystemQuota,
              drainAiQuota: deps.drainAiQuota
            })
          ) {
            disableWorker("simulation command bus worker configure failed");
            return;
          }
          maybeEnableWorker();
          return;
        }
        workerBatchInFlight = true;
        void handleWorkerBatch(message.jobs).catch((err) => {
          disableWorker("simulation command bus worker batch failed", err);
        });
      });
      created.on("error", (err) => {
        disableWorker("simulation command bus worker crashed", err);
      });
      created.on("exit", (code) => {
        if (code !== 0) {
          disableWorker(`simulation command bus worker exited with code ${code}`);
        } else {
          workerEnabled = false;
          worker = undefined;
        }
      });
      worker = created;
    } catch (err) {
      disableWorker("failed to start simulation command bus worker", err);
    }
  };

  startWorker();

  const enqueueJob = (job: TJob): void => {
    const priority = deps.getJobPriority(job);
    if (priority === "human") state.humanQueue.push(job);
    else if (priority === "system") state.systemQueue.push(job);
    else state.aiQueue.push(job);

    if (!workerEnabled || !worker) {
      queueLocalDrain();
      return;
    }

    const jobId = ++nextJobId;
    jobById.set(jobId, job);
    state.draining = true;
    if (
      !postWorkerMessage(worker, {
        type: "enqueue",
        job: {
          jobId,
          priority
        }
      })
    ) {
      const queued = jobById.get(jobId);
      jobById.delete(jobId);
      if (queued) {
        removeQueuedJob(queued, priority);
        if (priority === "human") state.humanQueue.push(queued);
        else if (priority === "system") state.systemQueue.push(queued);
        else state.aiQueue.push(queued);
      }
      disableWorker("simulation command bus worker enqueue failed");
    }
  };

  return {
    state,
    queueDepth,
    hasQueuedSystemCommand: (predicate) => state.systemQueue.some(predicate),
    enqueueJob
  };
};
