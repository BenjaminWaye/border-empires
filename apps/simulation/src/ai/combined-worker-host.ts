/**
 * Main-thread host for the single shared AI+system worker (P3 of the
 * checkpoint-contention fallback plan — see project memory "Checkpoint
 * contention P2/P3 fallback plans", and combined-producer-worker.ts for the
 * worker-side half of this).
 *
 * Exactly ONE of these should exist per simulation process when the merged
 * worker path is enabled: it owns the single `Worker` instance (spawn,
 * error/exit handling, retry-with-backoff respawn), and hands each producer
 * (createWorkerAiCommandProducer / createWorkerSystemCommandProducer) a
 * `CombinedWorkerChannel` — a thin, channel-tagged view onto that one
 * worker — so callers can't tell the difference from owning a dedicated
 * worker, except that `close()` on the channel does NOT terminate the shared
 * worker (only this host's own `close()` does, once both producers are done
 * with it).
 *
 * Each producer keeps its OWN independent state (pending requests, pause
 * flags, tile/player caches) — this host only demuxes messages by the
 * `channel: "ai" | "system"` tag and centralizes the worker lifecycle that
 * used to be duplicated (identically) in both producer files.
 */

import type { Worker } from "node:worker_threads";
import { Worker as NodeWorker } from "node:worker_threads";
import { resolveWorkerEntryUrl } from "../resolve-worker-entry/resolve-worker-entry.js";
import type { WorkerMemoryMetrics } from "../snapshot-stringifier/snapshot-stringifier.js";

export type WorkerChannelName = "ai" | "system";

export type CombinedWorkerChannel = {
  postMessage(msg: Record<string, unknown>): void;
  onMessage(listener: (msg: Record<string, unknown>) => void): () => void;
  /** Fires when the shared worker errors. Mirrors the old per-producer
   *  `worker.on("error")` handler — drain in-flight requests here. */
  onError(listener: (err: Error) => void): () => void;
  /** Fires when the shared worker exits (before any respawn attempt).
   *  Mirrors the old per-producer `worker.on("exit")` handler minus the
   *  respawn scheduling itself, which this host now owns centrally —
   *  drain in-flight requests and reset any local pause/backlog flags here. */
  onExit(listener: (code: number) => void): () => void;
  /**
   * Fires once a (re)spawned worker is live — including immediately upon
   * registration if the worker is already up, so producers can register
   * this once during their own initialization and treat it uniformly as
   * "(re)send my init message now". If the listener throws (e.g. the
   * runtime's world-view export blows up under memory pressure), the host
   * retries the respawn on a backoff timer instead of propagating — same
   * safety net the old per-producer scheduleRespawn() provided.
   */
  onRespawn(listener: () => void): () => void;
  getWorkerMetrics(): WorkerMemoryMetrics;
};

export type CombinedWorkerHostOptions = {
  workerScriptPath?: string | URL;
  maxOldGenerationSizeMb?: number;
  workerFactory?: (path: string | URL, opts: { resourceLimits: { maxOldGenerationSizeMb: number } }) => Worker;
  /** Backoff before retrying a failed (re)spawn. Injectable so tests can
   *  exercise the retry path without a multi-second real-time wait. */
  respawnRetryDelayMs?: number;
};

const resolveWorkerScript = (given?: string | URL): string | URL =>
  given ?? resolveWorkerEntryUrl("./combined-producer-worker.js", import.meta.url);

// Previously each producer ran in its own process with its own cap
// (192MB for AI, 96MB for system). They now share one V8 heap, so the
// combined default is the sum — preserving the same total planning-heap
// budget the two separate workers had before the merge.
const AI_WORKER_MAX_OLD_GEN_MB_DEFAULT = 192;
const SYSTEM_WORKER_MAX_OLD_GEN_MB_DEFAULT = 96;
const COMBINED_WORKER_MAX_OLD_GEN_MB_DEFAULT =
  AI_WORKER_MAX_OLD_GEN_MB_DEFAULT + SYSTEM_WORKER_MAX_OLD_GEN_MB_DEFAULT;

const RESPAWN_RETRY_DELAY_MS_DEFAULT = 5_000;

const CHANNEL_NAMES = ["ai", "system"] as const;

export const createCombinedWorkerHost = (options: CombinedWorkerHostOptions = {}) => {
  const workerScriptPath = resolveWorkerScript(options.workerScriptPath);
  const maxOldGenerationSizeMb = Math.max(64, options.maxOldGenerationSizeMb ?? COMBINED_WORKER_MAX_OLD_GEN_MB_DEFAULT);
  const respawnRetryDelayMs = options.respawnRetryDelayMs ?? RESPAWN_RETRY_DELAY_MS_DEFAULT;

  let worker!: Worker;
  let closed = false;
  // True once the current worker instance has been fully wired up — lets
  // onRespawn() replay "the worker is ready" to a listener that registers
  // after the fact (e.g. a producer created slightly after host startup).
  let workerLive = false;
  const workerMetrics: WorkerMemoryMetrics = { respawnCount: 0 };

  const messageListeners: Record<WorkerChannelName, Set<(msg: Record<string, unknown>) => void>> = {
    ai: new Set(),
    system: new Set()
  };
  const errorListeners: Record<WorkerChannelName, Set<(err: Error) => void>> = {
    ai: new Set(),
    system: new Set()
  };
  const exitListeners: Record<WorkerChannelName, Set<(code: number) => void>> = {
    ai: new Set(),
    system: new Set()
  };
  const respawnListeners: Record<WorkerChannelName, Set<() => void>> = {
    ai: new Set(),
    system: new Set()
  };

  const invokeRespawnListener = (name: WorkerChannelName, listener: () => void): void => {
    try {
      listener();
    } catch (err) {
      console.error(
        `[combined-worker-host] onRespawn listener (${name}) threw; scheduling another respawn:`,
        err
      );
      workerLive = false;
      scheduleRespawn(respawnRetryDelayMs);
    }
  };

  const notifyRespawn = (): void => {
    workerLive = true;
    for (const name of CHANNEL_NAMES) {
      for (const listener of respawnListeners[name]) {
        if (!workerLive) return; // a prior listener's failure already re-triggered a respawn
        invokeRespawnListener(name, listener);
      }
    }
  };

  const spawnWorker = (): void => {
    // Retire any predecessor before replacing the reference. On the normal
    // exit-driven respawn the old worker is already dead and this is a no-op,
    // but a respawn triggered by an onRespawn listener throwing (see
    // invokeRespawnListener) leaves the previous worker ALIVE — without this
    // we'd orphan a running OS thread and end up with two, which is exactly
    // the contention P3 exists to remove. Detach listeners first so the
    // outgoing worker's own "exit" can't queue a second competing respawn.
    const previous = worker as Worker | undefined;
    if (previous) {
      previous.removeAllListeners();
      void Promise.resolve(previous.terminate()).catch(() => undefined);
    }
    const factory = options.workerFactory ?? ((path, opts) => new NodeWorker(path, opts));
    worker = factory(workerScriptPath, { resourceLimits: { maxOldGenerationSizeMb } });

    worker.on("message", (msg: unknown) => {
      if (!msg || typeof msg !== "object") return;
      const message = msg as Record<string, unknown>;
      const channel = message.channel;
      if (channel !== "ai" && channel !== "system") return;
      const { channel: _channel, ...rest } = message;
      for (const listener of messageListeners[channel]) listener(rest);
    });

    worker.on("error", (err) => {
      console.error("[combined-worker-host] uncaught error:", err);
      for (const name of CHANNEL_NAMES) {
        for (const listener of errorListeners[name]) listener(err);
      }
    });

    worker.on("exit", (code) => {
      workerMetrics.lastExitCode = code;
      workerMetrics.lastExitAt = Date.now();
      workerLive = false;
      if (closed) return;
      if (code !== 0) {
        console.error(
          `[combined-worker-host] exited code=${code} — respawning (likely heap cap hit at ${maxOldGenerationSizeMb}MB)`
        );
      }
      for (const name of CHANNEL_NAMES) {
        for (const listener of exitListeners[name]) listener(code);
      }
      workerMetrics.respawnCount += 1;
      scheduleRespawn(0);
    });

    notifyRespawn();
  };

  const scheduleRespawn = (delayMs: number): void => {
    if (closed) return;
    setTimeout(() => {
      if (closed) return;
      try {
        spawnWorker();
      } catch (err) {
        console.error(`[combined-worker-host] respawn failed; retrying in ${respawnRetryDelayMs}ms:`, err);
        scheduleRespawn(respawnRetryDelayMs);
      }
    }, delayMs).unref();
  };

  spawnWorker();

  const channel = (name: WorkerChannelName): CombinedWorkerChannel => ({
    postMessage: (msg) => worker.postMessage({ ...msg, channel: name }),
    onMessage: (listener) => {
      messageListeners[name].add(listener);
      return () => messageListeners[name].delete(listener);
    },
    onError: (listener) => {
      errorListeners[name].add(listener);
      return () => errorListeners[name].delete(listener);
    },
    onExit: (listener) => {
      exitListeners[name].add(listener);
      return () => exitListeners[name].delete(listener);
    },
    onRespawn: (listener) => {
      respawnListeners[name].add(listener);
      if (workerLive) invokeRespawnListener(name, listener);
      return () => respawnListeners[name].delete(listener);
    },
    getWorkerMetrics: () => ({ ...workerMetrics })
  });

  return {
    channel,
    /**
     * Terminates the shared worker. Call only once both the AI and system
     * producers have released it (e.g. after both producer.close() calls) —
     * this brings down the OS thread both channels depend on.
     */
    close(): void {
      if (closed) return;
      closed = true;
      worker.postMessage({ type: "shutdown" }); // unscoped — no `channel` key, see combined-producer-worker.ts
      void worker.terminate();
    }
  };
};

export type CombinedWorkerHost = ReturnType<typeof createCombinedWorkerHost>;
