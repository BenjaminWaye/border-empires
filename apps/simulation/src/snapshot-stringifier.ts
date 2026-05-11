import { Worker } from "node:worker_threads";

import { resolveWorkerEntryUrl } from "./resolve-worker-entry.js";

export type SnapshotStringifier = (payload: unknown) => Promise<string>;

const inlineStringifier: SnapshotStringifier = async (payload) => JSON.stringify(payload);

export const createInlineSnapshotStringifier = (): SnapshotStringifier => inlineStringifier;

export type WorkerSnapshotStringifierOptions = {
  workerScriptPath?: string | URL;
  maxOldGenerationSizeMb?: number;
};

export type WorkerMemoryMetrics = {
  // NOTE: `rssBytes` is the *process-wide* RSS as seen from inside the worker
  // thread — workers share the address space, so this isn't per-worker memory.
  // Kept for parity but intentionally not exposed in the per-worker log block.
  rssBytes?: number;
  heapTotalBytes?: number;
  heapUsedBytes?: number;
  externalBytes?: number;
  arrayBuffersBytes?: number;
  respawnCount: number;
  lastExitCode?: number;
  lastExitAt?: number;
};

const resolveWorkerScript = (given?: string | URL): string | URL =>
  given ?? resolveWorkerEntryUrl("./snapshot-stringify-worker.js", import.meta.url);

const DEFAULT_MAX_OLD_GEN_MB = 96;

export const createWorkerSnapshotStringifier = (
  options: WorkerSnapshotStringifierOptions = {}
): SnapshotStringifier & {
  close: () => Promise<void>;
  getWorkerMetrics: () => WorkerMemoryMetrics;
} => {
  const scriptPath = resolveWorkerScript(options.workerScriptPath);
  const maxOldGenerationSizeMb = Math.max(32, options.maxOldGenerationSizeMb ?? DEFAULT_MAX_OLD_GEN_MB);

  type Pending = { resolve: (json: string) => void; reject: (error: Error) => void };
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
      const message = msg as { id?: unknown; json?: unknown; error?: unknown; type?: unknown; memoryUsage?: unknown };
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
      handler.resolve(typeof message.json === "string" ? message.json : "");
    });

    worker.on("error", (err: Error) => {
      console.error("[snapshot-stringify-worker] error:", err);
      for (const handler of pending.values()) handler.reject(err);
      pending.clear();
    });

    worker.on("exit", (code) => {
      metrics.lastExitCode = code;
      metrics.lastExitAt = Date.now();
      if (closed) return;
      if (code !== 0) {
        console.error(
          `[snapshot-stringify-worker] exited code=${code} — respawning (likely heap cap hit at ${maxOldGenerationSizeMb}MB)`
        );
      }
      const drainErr = new Error(`snapshot-stringify-worker exited with code ${code}`);
      for (const handler of pending.values()) handler.reject(drainErr);
      pending.clear();
      metrics.respawnCount += 1;
      spawnWorker();
    });
  };

  spawnWorker();

  const stringify: SnapshotStringifier = (payload) =>
    new Promise<string>((resolve, reject) => {
      if (closed) {
        reject(new Error("snapshot-stringify-worker closed"));
        return;
      }
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      try {
        worker.postMessage({ id, payload });
      } catch (err) {
        pending.delete(id);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });

  return Object.assign(stringify, {
    close: async () => {
      closed = true;
      await worker.terminate();
    },
    getWorkerMetrics: (): WorkerMemoryMetrics => ({ ...metrics })
  });
};
