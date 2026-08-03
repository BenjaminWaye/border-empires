/**
 * AI planner worker thread.
 * Runs inside a Node.js Worker so planning never blocks the main event loop.
 * The worker keeps planner state in-memory and is
 * updated incrementally via player/tile deltas.
 *
 * Message protocol (main → worker):
 *   { type: "init"; worldView: PlannerWorldView }
 *   { type: "sync_players"; players: PlannerPlayerView[] }
 *   { type: "tile_deltas"; tileDeltas: SimulationTileDelta[] }
 *   { type: "plan"; playerId: string; clientSeq: number; issuedAt: number;
 *     sessionPrefix: "ai-runtime" }
 *   { type: "pause" }
 *   { type: "resume" }
 *   { type: "shutdown" }
 *
 * Message protocol (worker → main):
 *   { type: "command"; playerId: string; command: CommandEnvelope | null;
 *     diagnostic?: AutomationPlannerDiagnostic }
 *   { type: "ready" }
 *
 * This is a thin standalone-entry wrapper: the actual planning logic lives in
 * ai-planner-worker-core.ts so it can be reused, unchanged, by
 * combined-producer-worker.ts (the merged AI+system worker thread — see P3 in
 * the checkpoint-contention fallback plan). This file remains the default
 * self-spawned worker used by createWorkerAiCommandProducer when no shared
 * combined worker host is supplied, and by every existing test.
 */

import { parentPort } from "node:worker_threads";
import { createAiPlannerWorkerCore } from "./ai-planner-worker-core.js";

if (!parentPort) throw new Error("ai-planner-worker must run inside a Worker thread");

const core = createAiPlannerWorkerCore((msg) => parentPort!.postMessage(msg));

parentPort.on("message", (msg: unknown) => {
  if (!msg || typeof msg !== "object") return;
  const message = msg as Record<string, unknown>;
  if (message.type === "shutdown") {
    void core.shutdown().finally(() => {
      process.exit(0);
    });
    return;
  }
  core.handleMessage(msg);
});

parentPort.postMessage({ type: "ready" });

const METRICS_INTERVAL_MS = 5_000;
setInterval(() => {
  parentPort!.postMessage({ type: "metrics", memoryUsage: process.memoryUsage() });
}, METRICS_INTERVAL_MS).unref();
