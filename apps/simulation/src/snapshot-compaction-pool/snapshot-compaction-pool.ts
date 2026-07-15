import { Worker } from "node:worker_threads";

import { resolveWorkerEntryUrl } from "../resolve-worker-entry/resolve-worker-entry.js";
import type { RecoveredTile, V1SnapshotPayload } from "../snapshot-compaction/snapshot-compaction.js";
import type { SimulationSnapshotSections } from "../snapshot-store/snapshot-store.js";
import type { WorkerMemoryMetrics } from "../snapshot-stringifier/snapshot-stringifier.js";

export type SnapshotCompactor = (
  sections: SimulationSnapshotSections,
  baselineTiles: readonly RecoveredTile[]
) => Promise<V1SnapshotPayload>;

export type WorkerSnapshotCompactorOptions = {
  workerScriptPath?: string | URL;
  maxOldGenerationSizeMb?: number;
};

const resolveWorkerScript = (given?: string | URL): string | URL =>
  given ?? resolveWorkerEntryUrl("../snapshot-compaction-worker.js", import.meta.url);

const DEFAULT_MAX_OLD_GEN_MB = 96;

/**
 * Same shape as createWorkerSnapshotStringifier (snapshot-stringifier.ts):
 * moves a CPU-bound, full-world-iterating pure function off the sim thread's
 * own event loop so its internal setImmediate yields don't queue behind the
 * AI planner's own tick scheduling on that thread. See snapshot-compaction-
 * worker.ts for the specific contention this addresses.
 */
export const createWorkerSnapshotCompactor = (
  options: WorkerSnapshotCompactorOptions = {}
): SnapshotCompactor & {
  close: () => Promise<void>;
  getWorkerMetrics: () => WorkerMemoryMetrics;
} => {
  const scriptPath = resolveWorkerScript(options.workerScriptPath);
  const maxOldGenerationSizeMb = Math.max(32, options.maxOldGenerationSizeMb ?? DEFAULT_MAX_OLD_GEN_MB);

  type Pending = { resolve: (payload: V1SnapshotPayload) => void; reject: (error: Error) => void };
  const pending = new Map<number, Pending>();
  let nextId = 0;
  let closed = false;
  const metrics: WorkerMemoryMetrics = { respawnCount: 0 };

  let worker!: Worker;

  const spawnWorker = (): void => {
    worker = new Worker(scriptPath, {
      resourceLimits: { maxOldGenerationSizeMb }
    });
    worker.unref();

    worker.on("message", (msg: unknown) => {
      if (!msg || typeof msg !== "object") return;
      const message = msg as { id?: unknown; payload?: unknown; error?: unknown; type?: unknown; memoryUsage?: unknown };
      if (message.type === "metrics" && message.memoryUsage && typeof message.memoryUsage === "object") {
        const mu = message.memoryUsage as NodeJS.MemoryUsage;
        metrics.rssBytes = mu.rss;
        metrics.heapTotalBytes = mu.heapTotal;
        metrics.heapUsedBytes = mu.heapUsed;
        metrics.externalBytes = mu.external;
        metrics.arrayBuffersBytes = mu.arrayBuffers;
        return;
      }
      if (typeof message.id !== "number") return;
      const handler = pending.get(message.id);
      if (!handler) return;
      pending.delete(message.id);
      if (typeof message.error === "string") {
        handler.reject(new Error(message.error));
        return;
      }
      handler.resolve(message.payload as V1SnapshotPayload);
    });

    worker.on("error", (err: Error) => {
      console.error("[snapshot-compaction-worker] error:", err);
      for (const handler of pending.values()) handler.reject(err);
      pending.clear();
    });

    worker.on("exit", (code) => {
      metrics.lastExitCode = code;
      metrics.lastExitAt = Date.now();
      if (closed) return;
      if (code !== 0) {
        console.error(
          `[snapshot-compaction-worker] exited code=${code} — respawning (likely heap cap hit at ${maxOldGenerationSizeMb}MB)`
        );
      }
      const drainErr = new Error(`snapshot-compaction-worker exited with code ${code}`);
      for (const handler of pending.values()) handler.reject(drainErr);
      pending.clear();
      metrics.respawnCount += 1;
      spawnWorker();
    });
  };

  spawnWorker();

  const compact: SnapshotCompactor = (sections, baselineTiles) =>
    new Promise<V1SnapshotPayload>((resolve, reject) => {
      if (closed) {
        reject(new Error("snapshot-compaction-worker closed"));
        return;
      }
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      try {
        worker.postMessage({ id, sections, baselineTiles });
      } catch (err) {
        pending.delete(id);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });

  return Object.assign(compact, {
    close: async () => {
      closed = true;
      await worker.terminate();
    },
    getWorkerMetrics: (): WorkerMemoryMetrics => ({ ...metrics })
  });
};

/**
 * Only spin up a compaction worker for SQLite-backed deployments (in-memory
 * tests stay inline); escape hatch via SIMULATION_SNAPSHOT_COMPACT_INLINE=1.
 * Centralised here (rather than inline at the call site) so it doesn't add
 * to simulation-service.ts, which is already over the repo's file-line cap.
 */
export const createSnapshotCompactorIfEnabled = (options: {
  sqlitePath?: string;
  onError: (err: unknown) => void;
}): ReturnType<typeof createWorkerSnapshotCompactor> | undefined => {
  if (!options.sqlitePath || process.env.SIMULATION_SNAPSHOT_COMPACT_INLINE === "1") return undefined;
  try {
    return createWorkerSnapshotCompactor();
  } catch (err) {
    options.onError(err);
    return undefined;
  }
};
