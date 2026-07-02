import { Worker } from "node:worker_threads";

import { resolveWorkerEntryUrl } from "../resolve-worker-entry/resolve-worker-entry.js";

export type SnapshotStringifier = (payload: unknown) => Promise<string>;

const inlineStringifier: SnapshotStringifier = async (payload) => JSON.stringify(payload);

export const createInlineSnapshotStringifier = (): SnapshotStringifier => inlineStringifier;

/** Minimum array length that triggers chunked serialisation with EL yields. */
const CHUNK_THRESHOLD = 500;

/** Number of array elements stringified per synchronous slice before a yield. */
const CHUNK_SIZE = 2_000;

/** Yield to the event loop via setImmediate. */
const yieldToEventLoop = (): Promise<void> => new Promise<void>((resolve) => setImmediate(resolve));

/**
 * Stringify a plain array in slices, yielding between batches.
 * Each element is stringified with JSON.stringify individually (handles nested
 * objects correctly). The caller controls whether a yield callback fires.
 */
const stringifyArrayChunked = async (
  arr: unknown[],
  onYield?: () => void
): Promise<string> => {
  if (arr.length === 0) return "[]";
  if (arr.length < CHUNK_THRESHOLD) return JSON.stringify(arr);

  const parts: string[] = [];
  for (let i = 0; i < arr.length; i += CHUNK_SIZE) {
    const slice = arr.slice(i, i + CHUNK_SIZE);
    // JSON.stringify renders array elements that serialize to `undefined`
    // (undefined / function / symbol) as `null`. Replicate that, otherwise a
    // hole produces a literal empty string and corrupt JSON like `[,1]` that
    // the recovery path can't parse on restart.
    parts.push(
      slice
        .map((el) => {
          const elJson = JSON.stringify(el);
          return elJson === undefined ? "null" : elJson;
        })
        .join(",")
    );
    if (i + CHUNK_SIZE < arr.length) {
      onYield?.();
      await yieldToEventLoop();
    }
  }
  return "[" + parts.join(",") + "]";
};

/**
 * Build JSON for an object whose values are either scalars or arrays.
 * Large arrays (>= CHUNK_THRESHOLD) are serialised in chunks; everything
 * else falls through to JSON.stringify.
 *
 * `undefined` / function / symbol values are handled exactly as JSON.stringify
 * does (keys omitted; array holes rendered as `null`). The caller must still
 * ensure no circular refs (same contract as JSON.stringify).
 */
const stringifyObjectChunked = async (
  obj: Record<string, unknown>,
  onYield?: () => void
): Promise<string> => {
  const keys = Object.keys(obj);
  const kvParts: string[] = [];
  for (const key of keys) {
    const value = obj[key];
    const keyJson = JSON.stringify(key) + ":";
    if (Array.isArray(value) && value.length >= CHUNK_THRESHOLD) {
      const arrJson = await stringifyArrayChunked(value, onYield);
      kvParts.push(keyJson + arrJson);
    } else if (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      // One level deeper: check for large arrays inside (e.g. initialState.tiles)
      const nested = value as Record<string, unknown>;
      const nestedKeys = Object.keys(nested);
      const hasLargeArray = nestedKeys.some(
        (k) => Array.isArray(nested[k]) && (nested[k] as unknown[]).length >= CHUNK_THRESHOLD
      );
      if (hasLargeArray) {
        // A plain object always serializes (never `undefined`), so no omit guard.
        kvParts.push(keyJson + (await stringifyObjectChunked(nested, onYield)));
      } else {
        const valueJson = JSON.stringify(value);
        if (valueJson !== undefined) kvParts.push(keyJson + valueJson);
      }
    } else {
      // JSON.stringify OMITS object keys whose value serializes to `undefined`
      // (undefined / function / symbol). Match that — emitting `"key":undefined`
      // would be invalid JSON.
      const valueJson = JSON.stringify(value);
      if (valueJson !== undefined) kvParts.push(keyJson + valueJson);
    }
  }
  return "{" + kvParts.join(",") + "}";
};

export type ChunkedSnapshotStringifierOptions = {
  /** Callback fired every time a yield occurs. Useful for testing. */
  onYield?: () => void;
};

/**
 * A drop-in replacement for the inline JSON.stringify that avoids blocking
 * the event loop for more than a few milliseconds at a time. Large arrays
 * inside the snapshot payload (tiles / tileOverlay / commandEvents) are
 * serialised in slices of CHUNK_SIZE elements with a setImmediate yield
 * between batches.
 *
 * Output is byte-for-byte identical to JSON.stringify for any JSON-safe value
 * that is either a plain object or an array (the only shapes the snapshot
 * stores produce).
 */
export const createChunkedSnapshotStringifier = (
  options: ChunkedSnapshotStringifierOptions = {}
): SnapshotStringifier => {
  const { onYield } = options;
  return async (payload: unknown): Promise<string> => {
    if (Array.isArray(payload)) {
      return stringifyArrayChunked(payload, onYield);
    }
    if (payload !== null && typeof payload === "object") {
      return stringifyObjectChunked(payload as Record<string, unknown>, onYield);
    }
    // Scalar / null / undefined — unlikely for snapshots but handle gracefully.
    return JSON.stringify(payload);
  };
};

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
  given ?? resolveWorkerEntryUrl("../snapshot-stringify-worker.js", import.meta.url);

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
