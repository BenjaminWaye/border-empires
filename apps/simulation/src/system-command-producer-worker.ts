/**
 * Worker-backed system command producer.
 *
 * Offloads barbarian/truce/upkeep frontier decisions to system-job-worker.ts.
 * Backpressure: skips ticks when human or system backlog is non-empty.
 */

import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { CommandEnvelope } from "@border-empires/sim-protocol";
import type { SimulationRuntime } from "./runtime.js";
import { buildPlannerWorldView } from "./planner-world-view.js";

type QueueDepths = ReturnType<SimulationRuntime["queueDepths"]>;

type WorkerSystemCommandProducerOptions = {
  runtime: Pick<SimulationRuntime, "queueDepths" | "exportState">;
  systemPlayerIds: string[];
  submitCommand: (command: CommandEnvelope) => Promise<void>;
  shouldRun?: () => boolean;
  startingClientSeqByPlayer?: Record<string, number>;
  now?: () => number;
  tickIntervalMs?: number;
  workerScriptPath?: string;
};

const here = dirname(fileURLToPath(import.meta.url));

const resolveWorkerScript = (given?: string): string =>
  given ?? resolve(here, "system-job-worker.js");

const hasAnyBacklog = (queueDepths: QueueDepths): boolean =>
  queueDepths.human_interactive > 0 || queueDepths.human_noninteractive > 0 || queueDepths.system > 0;

export const createWorkerSystemCommandProducer = (options: WorkerSystemCommandProducerOptions) => {
  const now = options.now ?? (() => Date.now());
  const tickIntervalMs = Math.max(25, options.tickIntervalMs ?? 500);
  const shouldRun = options.shouldRun ?? (() => true);

  const nextClientSeqByPlayer = new Map<string, number>(
    options.systemPlayerIds.map((id) => [id, options.startingClientSeqByPlayer?.[id] ?? 1])
  );
  const pendingPlayers = new Set<string>();
  let tickInFlight = false;
  let lastBacklogState = false;

  const worker = new Worker(resolveWorkerScript(options.workerScriptPath));
  const pendingRequests = new Map<string, (command: CommandEnvelope | null) => void>();

  worker.on("message", (msg: unknown) => {
    if (!msg || typeof msg !== "object") return;
    const message = msg as Record<string, unknown>;
    if (message.type === "command") {
      const resolve = pendingRequests.get(message.playerId as string);
      if (resolve) {
        pendingRequests.delete(message.playerId as string);
        resolve(message.command as CommandEnvelope | null);
      }
    }
  });

  worker.on("error", (err) => {
    console.error("[system-job-worker] uncaught error:", err);
    for (const [, resolve] of pendingRequests) resolve(null);
    pendingRequests.clear();
  });

  const requestPlan = (
    playerId: string,
    clientSeq: number,
    issuedAt: number
  ): Promise<CommandEnvelope | null> => {
    return new Promise((resolve) => {
      const worldView = buildPlannerWorldView(options.runtime.exportState(), [playerId]);
      pendingRequests.set(playerId, resolve);
      worker.postMessage({ type: "plan", playerId, clientSeq, issuedAt, sessionPrefix: "system-runtime", worldView });
    });
  };

  const tick = async (): Promise<void> => {
    if (tickInFlight) return;
    if (!shouldRun()) return;

    const queueDepths = options.runtime.queueDepths();
    const hasBacklog = hasAnyBacklog(queueDepths);

    if (hasBacklog && !lastBacklogState) worker.postMessage({ type: "pause" });
    else if (!hasBacklog && lastBacklogState) worker.postMessage({ type: "resume" });
    lastBacklogState = hasBacklog;

    if (hasBacklog) return;

    tickInFlight = true;
    try {
      for (const playerId of options.systemPlayerIds) {
        if (pendingPlayers.has(playerId)) continue;
        const clientSeq = nextClientSeqByPlayer.get(playerId) ?? 1;
        const issuedAt = now();
        pendingPlayers.add(playerId);
        nextClientSeqByPlayer.set(playerId, clientSeq + 1);
        try {
          const command = await requestPlan(playerId, clientSeq, issuedAt);
          if (command) await options.submitCommand(command);
        } catch {
          // swallow
        } finally {
          pendingPlayers.delete(playerId);
        }
        return;
      }
    } finally {
      tickInFlight = false;
    }
  };

  const intervalHandle = setInterval(() => { void tick(); }, tickIntervalMs);

  return {
    tick,
    close(): void {
      clearInterval(intervalHandle);
      worker.postMessage({ type: "shutdown" });
      void worker.terminate();
    }
  };
};
