import { parentPort } from "node:worker_threads";

import type {
  SimulationCommandBusWorkerMessage,
  SimulationCommandBusWorkerResponse,
  SimulationDispatchJobMeta
} from "./command-bus-shared.js";

const port = parentPort;

if (!port) {
  throw new Error("simulation command bus worker requires parent port");
}

let configured = false;
let drainBudgetMs = 12;
let drainMaxCommands = 8;
let drainHumanQuota = 6;
let drainSystemQuota = 2;
let drainAiQuota = 2;
let batchInFlight = false;

const humanQueue: SimulationDispatchJobMeta[] = [];
const systemQueue: SimulationDispatchJobMeta[] = [];
const aiQueue: SimulationDispatchJobMeta[] = [];

const queueDepths = (): { human: number; system: number; ai: number } => ({
  human: humanQueue.length,
  system: systemQueue.length,
  ai: aiQueue.length
});

const dequeueJob = (drained: { human: number; system: number; ai: number }): SimulationDispatchJobMeta | undefined => {
  const humanPending = humanQueue.length > 0;
  const systemPending = systemQueue.length > 0;
  const aiPending = aiQueue.length > 0;
  if (!humanPending && !systemPending && !aiPending) return undefined;
  if (humanPending && (drained.human < drainHumanQuota || (!systemPending && !aiPending))) {
    return humanQueue.shift();
  }
  if (systemPending && (drained.system < drainSystemQuota || (!humanPending && !aiPending))) {
    return systemQueue.shift();
  }
  if (aiPending && (drained.ai < drainAiQuota || !humanPending)) {
    return aiQueue.shift();
  }
  if (humanPending) return humanQueue.shift();
  if (systemPending) return systemQueue.shift();
  return aiQueue.shift();
};

const dispatchNextBatch = (): void => {
  if (!configured || batchInFlight) return;
  const startedAt = Date.now();
  const jobs: SimulationDispatchJobMeta[] = [];
  const drained = { human: 0, system: 0, ai: 0 };
  while (jobs.length < drainMaxCommands && Date.now() - startedAt < drainBudgetMs) {
    const job = dequeueJob(drained);
    if (!job) break;
    jobs.push(job);
    if (job.priority === "human") drained.human += 1;
    else if (job.priority === "system") drained.system += 1;
    else drained.ai += 1;
  }
  if (jobs.length <= 0) return;
  batchInFlight = true;
  port.postMessage({
    type: "dispatch_batch",
    jobs,
    queueDepths: queueDepths()
  } satisfies SimulationCommandBusWorkerResponse);
};

port.on("message", (message: SimulationCommandBusWorkerMessage) => {
  if (message.type === "configure") {
    drainBudgetMs = message.drainBudgetMs;
    drainMaxCommands = message.drainMaxCommands;
    drainHumanQuota = message.drainHumanQuota;
    drainSystemQuota = message.drainSystemQuota;
    drainAiQuota = message.drainAiQuota;
    configured = true;
    dispatchNextBatch();
    return;
  }
  if (message.type === "enqueue") {
    const queue =
      message.job.priority === "human" ? humanQueue : message.job.priority === "system" ? systemQueue : aiQueue;
    queue.push(message.job);
    dispatchNextBatch();
    return;
  }
  batchInFlight = false;
  dispatchNextBatch();
});

port.postMessage({ type: "ready" } satisfies SimulationCommandBusWorkerResponse);
