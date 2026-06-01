import { Worker } from "node:worker_threads";

import { resolveWorkerEntryUrl } from "../../simulation/src/resolve-worker-entry.js";

export type GatewayStringifier = (payload: unknown) => Promise<string>;

export type GatewayStringifierMemoryMetrics = {
  rssBytes?: number;
  heapTotalBytes?: number;
  heapUsedBytes?: number;
  externalBytes?: number;
  arrayBuffersBytes?: number;
  respawnCount: number;
  lastExitCode?: number;
  lastExitAt?: number;
};

const DEFAULT_MAX_OLD_GEN_MB = 96;

export const createGatewayStringifier = (
  maxOldGenerationSizeMb = DEFAULT_MAX_OLD_GEN_MB
): GatewayStringifier & {
  close: () => Promise<void>;
  getWorkerMetrics: () => GatewayStringifierMemoryMetrics;
} => {
  const scriptPath = resolveWorkerEntryUrl("./gateway-stringify-worker.js", import.meta.url);
  const maxOldGenMb = Math.max(32, maxOldGenerationSizeMb);

  type Pending = { resolve: (json: string) => void; reject: (error: Error) => void };
  const pending = new Map<number, Pending>();
  let nextId = 0;
  let closed = false;
  const metrics: GatewayStringifierMemoryMetrics = { respawnCount: 0 };

  let worker!: Worker;

  const spawnWorker = (): void => {
    worker = new Worker(scriptPath, {
      resourceLimits: { maxOldGenerationSizeMb: maxOldGenMb }
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
      console.error("[gateway-stringify-worker] error:", err);
      for (const handler of pending.values()) handler.reject(err);
      pending.clear();
    });

    worker.on("exit", (code) => {
      metrics.lastExitCode = code;
      metrics.lastExitAt = Date.now();
      if (closed) return;
      if (code !== 0) {
        console.error(
          `[gateway-stringify-worker] exited code=${code} — respawning (likely heap cap hit at ${maxOldGenMb}MB)`
        );
      }
      const drainErr = new Error(`gateway-stringify-worker exited with code ${code}`);
      for (const handler of pending.values()) handler.reject(drainErr);
      pending.clear();
      metrics.respawnCount += 1;
      spawnWorker();
    });
  };

  spawnWorker();

  const stringify: GatewayStringifier = (payload) =>
    new Promise<string>((resolve, reject) => {
      if (closed) {
        reject(new Error("gateway-stringify-worker closed"));
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
      // Reject in-flight requests before terminating — otherwise those
      // promises never settle (exit handler skips rejection when closed=true).
      const drainErr = new Error("gateway-stringify-worker closed");
      for (const handler of pending.values()) handler.reject(drainErr);
      pending.clear();
      await worker.terminate();
    },
    getWorkerMetrics: (): GatewayStringifierMemoryMetrics => ({ ...metrics })
  });
};
