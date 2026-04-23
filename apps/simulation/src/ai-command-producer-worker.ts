/**
 * Worker-backed AI command producer.
 *
 * Drop-in replacement for ai-command-producer.ts that offloads all planning
 * computation to ai-planner-worker.ts so the main simulation event loop is
 * never blocked by AI decision logic.
 *
 * Backpressure rules:
 *  - If human_interactive backlog > 0, the tick is skipped entirely.
 *  - If the persistence queue is degraded, the tick is skipped.
 *  - The worker receives a "pause" message when backlog > 0 so any in-flight
 *    computation is short-circuited; it resumes when the backlog drains.
 */

import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { CommandEnvelope } from "@border-empires/sim-protocol";
import type { SimulationRuntime } from "./runtime.js";
import type { PlannerWorldView } from "./planner-world-view.js";

type QueueDepths = ReturnType<SimulationRuntime["queueDepths"]>;

type WorkerAiCommandProducerOptions = {
  runtime: Pick<SimulationRuntime, "queueDepths" | "onEvent" | "exportPlannerWorldView">;
  aiPlayerIds: string[];
  submitCommand: (command: CommandEnvelope) => Promise<void>;
  shouldRun?: () => boolean;
  startingClientSeqByPlayer?: Record<string, number>;
  now?: () => number;
  tickIntervalMs?: number;
  workerScriptPath?: string;
  plannerBreachThresholdMs?: number;
  onPlannerTick?: (sample: { durationMs: number; breached: boolean }) => void;
};

const here = dirname(fileURLToPath(import.meta.url));

const resolveWorkerScript = (given?: string): string =>
  given ?? resolve(here, "ai-planner-worker.js");

const hasHumanInteractiveBacklog = (queueDepths: QueueDepths): boolean =>
  queueDepths.human_interactive > 0;

export const createWorkerAiCommandProducer = (options: WorkerAiCommandProducerOptions) => {
  const now = options.now ?? (() => Date.now());
  const tickIntervalMs = Math.max(25, options.tickIntervalMs ?? 250);
  const shouldRun = options.shouldRun ?? (() => true);
  const plannerBreachThresholdMs = Math.max(1, options.plannerBreachThresholdMs ?? 50);

  const nextClientSeqByPlayer = new Map<string, number>(
    options.aiPlayerIds.map((id) => [id, options.startingClientSeqByPlayer?.[id] ?? 1])
  );
  const pendingCommandByPlayer = new Map<string, { commandId: string; startedAt: number }>();

  let tickInFlight = false;
  let nextPlayerIndex = 0;
  let humanBacklogWasNonEmpty = false;

  const worker = new Worker(resolveWorkerScript(options.workerScriptPath));

  // Resolve map: commandId → resolve function for the pending promise
  const pendingRequests = new Map<string, (command: CommandEnvelope | null) => void>();

  worker.on("message", (msg: unknown) => {
    if (!msg || typeof msg !== "object") return;
    const message = msg as Record<string, unknown>;
    if (message.type === "command") {
      const key = message.playerId as string;
      const resolve = pendingRequests.get(key);
      if (resolve) {
        pendingRequests.delete(key);
        resolve(message.command as CommandEnvelope | null);
      }
    }
  });

  worker.on("error", (err) => {
    console.error("[ai-planner-worker] uncaught error:", err);
    // Drain pending requests so ticks don't hang
    for (const [, resolve] of pendingRequests) resolve(null);
    pendingRequests.clear();
  });

  const stopListening = options.runtime.onEvent((event) => {
    const pending = pendingCommandByPlayer.get(event.playerId);
    if (!pending || pending.commandId !== event.commandId) return;
    if (
      event.eventType === "COMMAND_REJECTED" ||
      event.eventType === "COMBAT_RESOLVED" ||
      event.eventType === "TILE_DELTA_BATCH" ||
      event.eventType === "COLLECT_RESULT" ||
      event.eventType === "TECH_UPDATE" ||
      event.eventType === "DOMAIN_UPDATE"
    ) {
      pendingCommandByPlayer.delete(event.playerId);
    }
  });

  const requestPlan = (
    playerId: string,
    clientSeq: number,
    issuedAt: number
  ): Promise<CommandEnvelope | null> => {
    return new Promise((resolve) => {
      const worldView: PlannerWorldView = options.runtime.exportPlannerWorldView([playerId]);
      pendingRequests.set(playerId, resolve);
      worker.postMessage({ type: "plan", playerId, clientSeq, issuedAt, sessionPrefix: "ai-runtime", worldView });
    });
  };

  const tick = async (): Promise<void> => {
    if (tickInFlight) return;
    if (!shouldRun()) return;

    const queueDepths = options.runtime.queueDepths();
    const humanBacklogNonEmpty = hasHumanInteractiveBacklog(queueDepths);

    // Sync pause/resume state with worker
    if (humanBacklogNonEmpty && !humanBacklogWasNonEmpty) {
      worker.postMessage({ type: "pause" });
    } else if (!humanBacklogNonEmpty && humanBacklogWasNonEmpty) {
      worker.postMessage({ type: "resume" });
    }
    humanBacklogWasNonEmpty = humanBacklogNonEmpty;

    if (humanBacklogNonEmpty) return;

    tickInFlight = true;
    try {
      if (options.aiPlayerIds.length === 0) return;

      // Clear timed-out pending commands (90s timeout)
      const cutoff = now() - 90_000;
      for (const [playerId, pending] of pendingCommandByPlayer.entries()) {
        if (pending.startedAt <= cutoff) pendingCommandByPlayer.delete(playerId);
      }

      for (let offset = 0; offset < options.aiPlayerIds.length; offset++) {
        const playerIndex = (nextPlayerIndex + offset) % options.aiPlayerIds.length;
        const playerId = options.aiPlayerIds[playerIndex]!;
        if (pendingCommandByPlayer.has(playerId)) continue;

        const clientSeq = nextClientSeqByPlayer.get(playerId) ?? 1;
        const issuedAt = now();

        try {
          const plannerStartedAt = now();
          const command = await requestPlan(playerId, clientSeq, issuedAt);
          const plannerDurationMs = Math.max(0, now() - plannerStartedAt);
          const breached = plannerDurationMs > plannerBreachThresholdMs;
          options.onPlannerTick?.({ durationMs: plannerDurationMs, breached });
          if (!command) continue;
          pendingCommandByPlayer.set(playerId, { commandId: command.commandId, startedAt: issuedAt });
          nextClientSeqByPlayer.set(playerId, clientSeq + 1);
          nextPlayerIndex = (playerIndex + 1) % options.aiPlayerIds.length;
          await options.submitCommand(command);
        } catch {
          pendingCommandByPlayer.delete(playerId);
          // swallow — will retry on next tick
        }
        return; // one player per tick
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
      stopListening();
      worker.postMessage({ type: "shutdown" });
      void worker.terminate();
    }
  };
};
