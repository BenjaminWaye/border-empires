/**
 * System job worker thread.
 *
 * Handles barbarian maintenance, truce expiry, ability cooldown ticks,
 * and structure upkeep — all system-player-owned frontier commands.
 * Runs in a Worker so these jobs never block human command acceptance.
 *
 * Message protocol (main → worker):
 *   { type: "init"; worldView: PlannerWorldView }
 *   { type: "sync_players"; players: PlannerPlayerView[] }
 *   { type: "tile_deltas"; tileDeltas: SimulationTileDelta[] }
 *   { type: "vision_union"; keys: string[]; version: number }
 *   { type: "plan"; playerId: string; clientSeq: number; issuedAt: number;
 *     sessionPrefix: "system-runtime" }
 *   { type: "pause" }
 *   { type: "resume" }
 *   { type: "shutdown" }
 *
 * Message protocol (worker → main):
 *   { type: "command"; playerId: string; command: CommandEnvelope | null }
 *   { type: "ready" }
 *
 * This is a thin standalone-entry wrapper: the actual planning logic lives in
 * system-job-worker-core.ts so it can be reused, unchanged, by
 * combined-producer-worker.ts (the merged AI+system worker thread — see P3 in
 * the checkpoint-contention fallback plan). This file remains the default
 * self-spawned worker used by createWorkerSystemCommandProducer when no shared
 * combined worker host is supplied, and by every existing test.
 */

import { parentPort } from "node:worker_threads";
import { createSystemJobWorkerCore } from "./system-job-worker-core.js";

if (!parentPort) throw new Error("system-job-worker must run inside a Worker thread");

const core = createSystemJobWorkerCore((msg) => parentPort!.postMessage(msg));

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
