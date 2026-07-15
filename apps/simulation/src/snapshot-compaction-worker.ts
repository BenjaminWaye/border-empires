/**
 * Snapshot-compaction worker thread.
 *
 * Runs compactSnapshotForStorage (the v0→v1 diff-against-worldgen-baseline
 * pass) off the sim's own event loop. That loop iterates the full ~202,500-
 * tile world and yields every 2,000 tiles via setImmediate — cheap in
 * isolation (~100-130ms of real work, see snapshot-compaction.perf.test.ts),
 * but on the sim thread those yields queue behind the AI planner's own
 * setImmediate-scheduled ticks, observed stretching a single checkpoint to
 * 17-22s wall time. A dedicated worker gives compaction its own,
 * uncontended event loop instead.
 *
 * Message protocol (main → worker):
 *   { id: number; sections: SimulationSnapshotSections; baselineTiles: RecoveredTile[] }
 *
 * Message protocol (worker → main):
 *   { id: number; payload: SimulationSnapshotPayload }
 *   { id: number; error: string }
 */

import { parentPort } from "node:worker_threads";

import {
  buildWorldgenBaselineIndex,
  compactSnapshotForStorage,
  type RecoveredTile
} from "./snapshot-compaction/snapshot-compaction.js";
import type { SimulationSnapshotSections } from "./snapshot-store/snapshot-store.js";

if (!parentPort) throw new Error("snapshot-compaction-worker must run inside a Worker thread");
const port = parentPort;

port.on("message", (msg: unknown) => {
  if (!msg || typeof msg !== "object") return;
  const message = msg as { id?: unknown; sections?: unknown; baselineTiles?: unknown };
  if (typeof message.id !== "number") return;
  void (async () => {
    try {
      const sections = message.sections as SimulationSnapshotSections;
      const baselineTiles = message.baselineTiles as RecoveredTile[];
      const baselineIndex = buildWorldgenBaselineIndex(baselineTiles);
      const payload = await compactSnapshotForStorage(sections, baselineIndex);
      port.postMessage({ id: message.id, payload });
    } catch (err) {
      port.postMessage({
        id: message.id,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  })();
});

port.postMessage({ ready: true });

const METRICS_INTERVAL_MS = 5_000;
setInterval(() => {
  port.postMessage({ type: "metrics", memoryUsage: process.memoryUsage() });
}, METRICS_INTERVAL_MS).unref();
