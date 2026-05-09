import { Worker } from "node:worker_threads";

import { resolveWorkerEntryUrl } from "./resolve-worker-entry.js";

export type SnapshotStringifier = (payload: unknown) => Promise<string>;

const inlineStringifier: SnapshotStringifier = async (payload) => JSON.stringify(payload);

export const createInlineSnapshotStringifier = (): SnapshotStringifier => inlineStringifier;

export type WorkerSnapshotStringifierOptions = {
  workerScriptPath?: string | URL;
};

const resolveWorkerScript = (given?: string | URL): string | URL =>
  given ?? resolveWorkerEntryUrl("./snapshot-stringify-worker.js", import.meta.url);

export const createWorkerSnapshotStringifier = (
  options: WorkerSnapshotStringifierOptions = {}
): SnapshotStringifier & { close: () => Promise<void> } => {
  const worker = new Worker(resolveWorkerScript(options.workerScriptPath));
  worker.unref();

  type Pending = { resolve: (json: string) => void; reject: (error: Error) => void };
  const pending = new Map<number, Pending>();
  let nextId = 0;
  let workerError: Error | undefined;

  worker.on("message", (msg: unknown) => {
    if (!msg || typeof msg !== "object") return;
    const message = msg as { id?: unknown; json?: unknown; error?: unknown; ready?: unknown };
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
    workerError = err;
    for (const handler of pending.values()) handler.reject(err);
    pending.clear();
  });

  worker.on("exit", (code) => {
    if (workerError) return;
    if (code !== 0) {
      const err = new Error(`snapshot-stringify-worker exited with code ${code}`);
      workerError = err;
      for (const handler of pending.values()) handler.reject(err);
      pending.clear();
    }
  });

  const stringify: SnapshotStringifier = (payload) =>
    new Promise<string>((resolve, reject) => {
      if (workerError) {
        reject(workerError);
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
      await worker.terminate();
    }
  });
};
