/**
 * Worker-backed system command producer.
 *
 * Offloads barbarian/truce/upkeep frontier decisions to system-job-worker.ts.
 * Backpressure: skips ticks when human or system backlog is non-empty.
 */

import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { CommandEnvelope } from "@border-empires/sim-protocol";
import type { SimulationRuntime } from "./runtime.js";

type QueueDepths = ReturnType<SimulationRuntime["queueDepths"]>;

type WorkerSystemCommandProducerOptions = {
  runtime: Pick<SimulationRuntime, "queueDepths" | "onEvent" | "exportPlannerWorldView" | "exportPlannerPlayerViews">;
  systemPlayerIds: string[];
  submitCommand: (command: CommandEnvelope) => Promise<void>;
  shouldRun?: () => boolean;
  startingClientSeqByPlayer?: Record<string, number>;
  now?: () => number;
  tickIntervalMs?: number;
  playerSyncIntervalMs?: number;
  workerScriptPath?: string;
};

const here = dirname(fileURLToPath(import.meta.url));

const resolveWorkerScript = (given?: string): string =>
  given ?? resolve(here, "system-job-worker.js");

const hasAnyBacklog = (queueDepths: QueueDepths): boolean =>
  queueDepths.human_interactive > 0 || queueDepths.human_noninteractive > 0 || queueDepths.system > 0;

export const createWorkerSystemCommandProducer = (options: WorkerSystemCommandProducerOptions) => {
  const now = options.now ?? (() => Date.now());
  const tickIntervalMs = Math.max(25, options.tickIntervalMs ?? 500);
  const playerSyncIntervalMs = Math.max(tickIntervalMs, options.playerSyncIntervalMs ?? 5_000);
  const playerSyncDebounceMs = 500;
  const shouldRun = options.shouldRun ?? (() => true);
  const systemPlayerIdSet = new Set(options.systemPlayerIds);

  const nextClientSeqByPlayer = new Map<string, number>(
    options.systemPlayerIds.map((id) => [id, options.startingClientSeqByPlayer?.[id] ?? 1])
  );
  const pendingPlayers = new Set<string>();
  let tickInFlight = false;
  let lastBacklogState = false;

  const worker = new Worker(resolveWorkerScript(options.workerScriptPath));
  const pendingRequests = new Map<string, (command: CommandEnvelope | null) => void>();

  worker.on("message", (msg: unknown) => {
    if (!msg || typeof msg !== "object") return;
    const message = msg as Record<string, unknown>;
    if (message.type === "command") {
      const resolve = pendingRequests.get(message.playerId as string);
      if (resolve) {
        pendingRequests.delete(message.playerId as string);
        resolve(message.command as CommandEnvelope | null);
      }
    }
  });

  worker.on("error", (err) => {
    console.error("[system-job-worker] uncaught error:", err);
    for (const [, resolve] of pendingRequests) resolve(null);
    pendingRequests.clear();
  });

  worker.postMessage({
    type: "init",
    worldView: options.runtime.exportPlannerWorldView(options.systemPlayerIds)
  });

  const pendingPlayerSyncIds = new Set<string>();
  let playerSyncTimeout: ReturnType<typeof setTimeout> | undefined;

  const syncPlayers = (playerIds: string[]): void => {
    if (playerIds.length === 0) return;
    worker.postMessage({
      type: "sync_players",
      players: options.runtime.exportPlannerPlayerViews(playerIds)
    });
  };

  const flushPendingPlayerSync = (): void => {
    playerSyncTimeout = undefined;
    if (pendingPlayerSyncIds.size === 0) return;
    const playerIds = [...pendingPlayerSyncIds];
    pendingPlayerSyncIds.clear();
    syncPlayers(playerIds);
  };

  const queuePlayerSync = (playerIds: Iterable<string>): void => {
    for (const playerId of playerIds) {
      if (!systemPlayerIdSet.has(playerId)) continue;
      pendingPlayerSyncIds.add(playerId);
    }
    if (pendingPlayerSyncIds.size === 0 || playerSyncTimeout) return;
    playerSyncTimeout = setTimeout(flushPendingPlayerSync, playerSyncDebounceMs);
  };

  const stopListening = options.runtime.onEvent((event) => {
    if (event.eventType === "TILE_DELTA_BATCH") {
      const tileDeltas = Array.isArray(event.tileDeltas) ? event.tileDeltas : [];
      worker.postMessage({ type: "tile_deltas", tileDeltas });
      const changedPlayers = new Set<string>();
      if (systemPlayerIdSet.has(event.playerId)) changedPlayers.add(event.playerId);
      for (const delta of tileDeltas) {
        if (typeof delta.ownerId === "string" && systemPlayerIdSet.has(delta.ownerId)) {
          changedPlayers.add(delta.ownerId);
        }
      }
      queuePlayerSync(changedPlayers);
    } else if (systemPlayerIdSet.has(event.playerId)) {
      queuePlayerSync([event.playerId]);
    }
    if (!pendingPlayers.has(event.playerId)) return;
    if (event.eventType === "COMMAND_REJECTED" || event.eventType === "COMBAT_RESOLVED") {
      pendingPlayers.delete(event.playerId);
    }
  });

  const playerSyncInterval = setInterval(() => {
    queuePlayerSync(options.systemPlayerIds);
  }, playerSyncIntervalMs);

  const requestPlan = (
    playerId: string,
    clientSeq: number,
    issuedAt: number
  ): Promise<CommandEnvelope | null> => {
    return new Promise((resolve) => {
      pendingRequests.set(playerId, resolve);
      worker.postMessage({ type: "plan", playerId, clientSeq, issuedAt, sessionPrefix: "system-runtime" });
    });
  };

  const tick = async (): Promise<void> => {
    if (tickInFlight) return;
    if (!shouldRun()) return;

    const queueDepths = options.runtime.queueDepths();
    const hasBacklog = hasAnyBacklog(queueDepths);

    if (hasBacklog && !lastBacklogState) worker.postMessage({ type: "pause" });
    else if (!hasBacklog && lastBacklogState) worker.postMessage({ type: "resume" });
    lastBacklogState = hasBacklog;

    if (hasBacklog) return;

    tickInFlight = true;
    try {
      for (const playerId of options.systemPlayerIds) {
        if (pendingPlayers.has(playerId)) continue;
        const clientSeq = nextClientSeqByPlayer.get(playerId) ?? 1;
        const issuedAt = now();
        try {
          const command = await requestPlan(playerId, clientSeq, issuedAt);
          if (!command) continue;
          pendingPlayers.add(playerId);
          nextClientSeqByPlayer.set(playerId, clientSeq + 1);
          await options.submitCommand(command);
        } catch {
          pendingPlayers.delete(playerId);
          // swallow
        }
        return;
      }
    } finally {
      tickInFlight = false;
    }
  };

  const intervalHandle = setInterval(() => { void tick(); }, tickIntervalMs);

  return {
    tick,
    close(): void {
      clearInterval(intervalHandle);
      clearInterval(playerSyncInterval);
      if (playerSyncTimeout) clearTimeout(playerSyncTimeout);
      stopListening();
      worker.postMessage({ type: "shutdown" });
      void worker.terminate();
    }
  };
};
