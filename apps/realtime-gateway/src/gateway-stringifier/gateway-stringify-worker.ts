/**
 * Gateway-stringify worker thread.
 *
 * Offloads JSON.stringify of the bootstrap init message off the gateway main
 * event loop. The init message embeds the full player snapshot (~256KB) and
 * blocks the main loop for 100–250ms when stringified inline, which stacks
 * under simultaneous auth bootstraps and causes p95 gRPC ack latency to spike
 * above the 2500ms client timeout.
 *
 * Message protocol (main → worker):
 *   { id: number; payload: unknown }
 *
 * Message protocol (worker → main):
 *   { id: number; json: string }
 *   { id: number; error: string }
 *   { type: "metrics"; memoryUsage: NodeJS.MemoryUsage }
 */

import { parentPort } from "node:worker_threads";

if (!parentPort) throw new Error("gateway-stringify-worker must run inside a Worker thread");

parentPort.on("message", (msg: unknown) => {
  if (!msg || typeof msg !== "object") return;
  const message = msg as { id?: unknown; payload?: unknown };
  if (typeof message.id !== "number") return;
  try {
    const json = JSON.stringify(message.payload);
    parentPort!.postMessage({ id: message.id, json });
  } catch (err) {
    parentPort!.postMessage({
      id: message.id,
      error: err instanceof Error ? err.message : String(err)
    });
  }
});

parentPort.postMessage({ ready: true });

const METRICS_INTERVAL_MS = 5_000;
setInterval(() => {
  parentPort!.postMessage({ type: "metrics", memoryUsage: process.memoryUsage() });
}, METRICS_INTERVAL_MS).unref();
