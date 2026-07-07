import { Worker } from "node:worker_threads";
import { resolveWorkerEntryUrl } from "../resolve-worker-entry/resolve-worker-entry.js";
import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";

export type SnapshotBuilderOptions = {
  workerCount?: number;
  workerScriptPath?: string | URL;
  maxOldGenerationSizeMb?: number;
  // Wraps the postMessage send — Node's structured-clone of `runtimeState`
  // happens synchronously inside that call on the sim main thread, and scales
  // with the player's visible-tile count. Named so an event_loop_blocked
  // incident can attribute the stall instead of an empty mainThreadTasks.
  trackSync?: <T>(phase: string, details: Record<string, string | number | boolean | null> | undefined, task: () => T) => T;
};

// Subset of BuildOptions that can be structured-cloned across the worker
// boundary. Excludes worldStatusRuntimeState (worker uses runtimeState as fallback).
export type WorkerBuildOptions = {
  includeWorldStatus?: boolean;
  fullVisibility?: boolean;
  sharedFullVisibilityTiles?: PlayerSubscriptionSnapshot["tiles"];
  seasonState?: PlayerSubscriptionSnapshot["season"];
  respawnNotice?: unknown;
  nonCompetitivePlayerIds?: ReadonlySet<string>;
};

export type WorkerMemoryMetrics = {
  rssBytes?: number;
  heapTotalBytes?: number;
  heapUsedBytes?: number;
  respawnCount: number;
  lastExitCode?: number;
};

const DEFAULT_WORKER_COUNT = 2;
const DEFAULT_MAX_OLD_GEN_MB = 256;

export const createSnapshotBuilder = (options: SnapshotBuilderOptions = {}) => {
  const workerCount = Math.max(1, options.workerCount ?? DEFAULT_WORKER_COUNT);
  const maxOldGenerationSizeMb = Math.max(64, options.maxOldGenerationSizeMb ?? DEFAULT_MAX_OLD_GEN_MB);
  const scriptPath =
    options.workerScriptPath ?? resolveWorkerEntryUrl("../snapshot-build-worker.js", import.meta.url);
  const trackSync = options.trackSync ?? (<T>(_phase: string, _details: unknown, task: () => T): T => task());

  type Pending = { resolve: (snap: PlayerSubscriptionSnapshot) => void; reject: (err: Error) => void };
  const pending = new Map<number, Pending>();
  let nextId = 0;
  let closed = false;
  let roundRobin = 0;
  const workers: Worker[] = [];
  const perWorkerMetrics: WorkerMemoryMetrics[] = [];

  const attachWorker = (slot: number): void => {
    const w = new Worker(scriptPath, { resourceLimits: { maxOldGenerationSizeMb } });
    w.unref();
    workers[slot] = w;
    perWorkerMetrics[slot] = { respawnCount: (perWorkerMetrics[slot]?.respawnCount ?? 0) };

    w.on("message", (msg: unknown) => {
      if (!msg || typeof msg !== "object") return;
      const m = msg as { id?: unknown; snapshot?: unknown; error?: unknown; type?: unknown; memoryUsage?: unknown };
      if (m.type === "metrics" && m.memoryUsage && typeof m.memoryUsage === "object") {
        const mu = m.memoryUsage as NodeJS.MemoryUsage;
        const met = perWorkerMetrics[slot];
        if (met) { met.rssBytes = mu.rss; met.heapTotalBytes = mu.heapTotal; met.heapUsedBytes = mu.heapUsed; }
        return;
      }
      if (typeof m.id !== "number") return;
      const handler = pending.get(m.id);
      if (!handler) return;
      pending.delete(m.id);
      if (typeof m.error === "string") { handler.reject(new Error(m.error)); return; }
      handler.resolve(m.snapshot as PlayerSubscriptionSnapshot);
    });

    w.on("error", (err: Error) => {
      console.error(`[snapshot-build-worker:${slot}] error:`, err);
    });

    w.on("exit", (code) => {
      const met = perWorkerMetrics[slot];
      if (met) { met.lastExitCode = code; met.respawnCount += 1; }
      if (closed) return;
      if (code !== 0) {
        console.error(`[snapshot-build-worker:${slot}] exited code=${code} — respawning`);
      }
      // Reject pending jobs that were dispatched to this worker slot.
      // We can't tell which pending IDs went to which slot, so we
      // conservatively reject all — the gateway will retry the login.
      const drainErr = new Error(`snapshot-build-worker:${slot} exited (code ${code})`);
      for (const handler of pending.values()) handler.reject(drainErr);
      pending.clear();
      attachWorker(slot);
    });
  };

  for (let i = 0; i < workerCount; i++) attachWorker(i);

  return {
    build(playerId: string, runtimeState: unknown, opts: WorkerBuildOptions): Promise<PlayerSubscriptionSnapshot> {
      return new Promise((resolve, reject) => {
        if (closed) { reject(new Error("snapshot-builder closed")); return; }
        const id = ++nextId;
        pending.set(id, { resolve, reject });
        const slot = roundRobin % workerCount;
        roundRobin = (roundRobin + 1) % workerCount;
        const w = workers[slot];
        if (!w) { pending.delete(id); reject(new Error("no snapshot-build worker available")); return; }
        try {
          trackSync("snapshot_build_worker_postmessage_clone", { playerId, workerSlot: slot }, () =>
            w.postMessage({ id, playerId, runtimeState, options: opts })
          );
        } catch (err) {
          pending.delete(id);
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      });
    },

    getMetrics(): WorkerMemoryMetrics[] {
      return perWorkerMetrics.map((m) => ({ ...m }));
    },

    async close(): Promise<void> {
      closed = true;
      await Promise.allSettled(workers.map((w) => w.terminate()));
      workers.length = 0;
    }
  };
};
