import type { CommandEnvelope } from "@border-empires/sim-protocol";
import { Worker } from "node:worker_threads";

import { resolveWorkerEntryUrl } from "../../../simulation/src/resolve-worker-entry/resolve-worker-entry.js";
import type { GatewayCommandStore, StoredGatewayCommand } from "../command-store/command-store.js";

export type WorkerBackedCommandStoreOptions = {
  sqlitePath: string;
  applySchema?: boolean;
  /** Called on each SQLITE_BUSY retry inside the worker. Wire to gateway_sqlite_retry_total. */
  onRetry?: () => void;
};

type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void };

/**
 * `GatewayCommandStore` backed by `SqliteGatewayCommandStore` running inside
 * a worker thread. `node:sqlite`'s `DatabaseSync` is synchronous, so every
 * call here is proxied to the worker over `postMessage` — the actual query
 * blocks the worker's thread, not the gateway's event loop. See
 * `command-store-worker.ts` for the rationale.
 */
export class WorkerBackedGatewayCommandStore implements GatewayCommandStore {
  private worker!: Worker;
  private readonly pending = new Map<number, Pending>();
  private nextId = 0;
  private closed = false;
  private readyPromise!: Promise<void>;
  private resolveReady!: () => void;
  private rejectReady!: (error: Error) => void;

  constructor(private readonly options: WorkerBackedCommandStoreOptions) {
    this.spawnWorker();
  }

  /** Resolves once the worker has opened the DB and applied the schema (if requested); rejects on failure. */
  waitUntilReady(): Promise<void> {
    return this.readyPromise;
  }

  private spawnWorker(): void {
    this.readyPromise = new Promise((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });
    // Swallow unhandled rejections from a schema failure nobody awaited via waitUntilReady().
    this.readyPromise.catch(() => {});

    const scriptPath = resolveWorkerEntryUrl("./command-store-worker.js", import.meta.url);
    this.worker = new Worker(scriptPath, {
      workerData: { sqlitePath: this.options.sqlitePath, applySchema: this.options.applySchema ?? false }
    });
    this.worker.unref();

    this.worker.on("message", (msg: unknown) => {
      if (!msg || typeof msg !== "object") return;
      const message = msg as { type?: unknown; id?: unknown; ok?: unknown; result?: unknown; error?: unknown };
      if (message.type === "ready") {
        if (typeof message.error === "string") this.rejectReady(new Error(message.error));
        else this.resolveReady();
        return;
      }
      if (message.type === "retry") {
        this.options.onRetry?.();
        return;
      }
      if (typeof message.id !== "number") return;
      const handler = this.pending.get(message.id);
      if (!handler) return;
      this.pending.delete(message.id);
      if (message.ok) handler.resolve(message.result);
      else handler.reject(new Error(typeof message.error === "string" ? message.error : "command store worker error"));
    });

    this.worker.on("error", (err: Error) => {
      console.error("[command-store-worker] error:", err);
      this.rejectReady(err);
      for (const handler of this.pending.values()) handler.reject(err);
      this.pending.clear();
    });

    this.worker.on("exit", (code) => {
      if (this.closed) return;
      const drainErr = new Error(`command-store-worker exited with code ${code}`);
      for (const handler of this.pending.values()) handler.reject(drainErr);
      this.pending.clear();
      console.error(`[command-store-worker] exited code=${code} — respawning`);
      this.spawnWorker();
    });
  }

  private async call<T>(method: string, args: unknown[]): Promise<T> {
    if (this.closed) throw new Error("command-store-worker closed");
    await this.readyPromise;
    return new Promise<T>((resolve, reject) => {
      const id = ++this.nextId;
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
      try {
        this.worker.postMessage({ id, method, args });
      } catch (err) {
        this.pending.delete(id);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  persistQueuedCommand(command: CommandEnvelope, queuedAt: number): Promise<StoredGatewayCommand> {
    return this.call("persistQueuedCommand", [command, queuedAt]);
  }

  markAccepted(commandId: string, acceptedAt: number): Promise<void> {
    return this.call("markAccepted", [commandId, acceptedAt]);
  }

  markRejected(commandId: string, rejectedAt: number, code: string, message: string): Promise<void> {
    return this.call("markRejected", [commandId, rejectedAt, code, message]);
  }

  markResolved(commandId: string, resolvedAt: number): Promise<void> {
    return this.call("markResolved", [commandId, resolvedAt]);
  }

  get(commandId: string): Promise<StoredGatewayCommand | undefined> {
    return this.call("get", [commandId]);
  }

  findByPlayerSeq(playerId: string, clientSeq: number): Promise<StoredGatewayCommand | undefined> {
    return this.call("findByPlayerSeq", [playerId, clientSeq]);
  }

  listUnresolvedForPlayer(playerId: string): Promise<StoredGatewayCommand[]> {
    return this.call("listUnresolvedForPlayer", [playerId]);
  }

  nextClientSeqForPlayer(playerId: string): Promise<number> {
    return this.call("nextClientSeqForPlayer", [playerId]);
  }

  async close(): Promise<void> {
    this.closed = true;
    const drainErr = new Error("command-store-worker closed");
    for (const handler of this.pending.values()) handler.reject(drainErr);
    this.pending.clear();
    await this.worker.terminate();
  }
}
