/**
 * Snapshot build worker thread.
 *
 * Receives a playerId + structured-cloned runtimeState and builds the full
 * PlayerSubscriptionSnapshot off the simulation event loop, keeping the sim
 * thread free to answer gRPC pings and accept commands during the 1–3 s build.
 *
 * Message protocol (main → worker):
 *   { id: number; playerId: string; runtimeState: unknown; options: unknown }
 *
 * Message protocol (worker → main):
 *   { id: number; snapshot: PlayerSubscriptionSnapshot }
 *   { id: number; error: string }
 *   { type: "metrics"; memoryUsage: NodeJS.MemoryUsage }
 */

import { parentPort } from "node:worker_threads";
import { buildPlayerSubscriptionSnapshot } from "./player-snapshot/player-snapshot.js";
import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";

if (!parentPort) throw new Error("snapshot-build-worker must run inside a Worker thread");

parentPort.on("message", (msg: unknown) => {
  if (!msg || typeof msg !== "object") return;
  const job = msg as { id?: unknown; playerId?: unknown; runtimeState?: unknown; options?: unknown };
  if (typeof job.id !== "number" || typeof job.playerId !== "string") return;
  try {
    // buildPlayerSubscriptionSnapshot is the sync version — no yields needed
    // since this runs on its own thread, not the simulation event loop.
    // Options are structured-cloned from the sim thread; sharedFullVisibilityTiles
    // (pre-computed global enrichment) is passed when fullVisibility is true to
    // avoid repeating the O(202k-tile) enrichment in each worker.
    const snapshot = buildPlayerSubscriptionSnapshot(
      job.playerId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      job.runtimeState as any,
      undefined,
      job.options as Parameters<typeof buildPlayerSubscriptionSnapshot>[3]
    ) as PlayerSubscriptionSnapshot;
    parentPort!.postMessage({ id: job.id, snapshot });
  } catch (err) {
    parentPort!.postMessage({ id: job.id, error: err instanceof Error ? err.message : String(err) });
  }
});

parentPort.postMessage({ ready: true });

const METRICS_INTERVAL_MS = 5_000;
setInterval(() => {
  parentPort!.postMessage({ type: "metrics", memoryUsage: process.memoryUsage() });
}, METRICS_INTERVAL_MS).unref();
