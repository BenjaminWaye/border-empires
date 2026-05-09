/**
 * Snapshot-stringify worker thread.
 *
 * Runs JSON.stringify of the simulation snapshot payload off the main event
 * loop. The payload (full RecoveredSimulationState + queued command events)
 * has been observed at ~18MB on staging, which blocks the main loop for
 * many seconds when stringified inline. The main thread sends the payload
 * via structured clone (~5x faster than JSON.stringify on the same shape)
 * and the worker returns the JSON string for the SQLite write.
 *
 * Message protocol (main → worker):
 *   { id: number; payload: unknown }
 *
 * Message protocol (worker → main):
 *   { id: number; json: string }
 *   { id: number; error: string }
 */

import { parentPort } from "node:worker_threads";

if (!parentPort) throw new Error("snapshot-stringify-worker must run inside a Worker thread");

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
