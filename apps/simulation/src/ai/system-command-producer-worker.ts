/**
 * Worker-backed system command producer.
 *
 * Offloads barbarian/truce/upkeep frontier decisions to system-job-worker.ts.
 * Backpressure: skips ticks when human or system backlog is non-empty.
 */

import { Worker } from "node:worker_threads";
import type { CommandEnvelope, SimulationEvent } from "@border-empires/sim-protocol";
import type { SimulationRuntime } from "../runtime/runtime.js";
import { createPlannerRelevantTileKeyIndex } from "./planner-sync-scope.js";
import type { PlannerPlayerView, PlannerTileView } from "./planner-world-view.js";
import { resolveWorkerEntryUrl } from "../resolve-worker-entry/resolve-worker-entry.js";
import type { WorkerMemoryMetrics } from "../snapshot-stringifier/snapshot-stringifier.js";

type QueueDepths = ReturnType<SimulationRuntime["queueDepths"]>;
type TileDeltaBatchEvent = Extract<SimulationEvent, { eventType: "TILE_DELTA_BATCH" }>;
type SimulationTileDelta = TileDeltaBatchEvent["tileDeltas"][number];

const mergePlannerTileDelta = (
  existing: PlannerTileView | undefined,
  tileDelta: SimulationTileDelta
): PlannerTileView | undefined => {
  const terrain = tileDelta.terrain ?? existing?.terrain;
  if (!terrain) return undefined;
  const next: PlannerTileView = existing ? { ...existing } : { x: tileDelta.x, y: tileDelta.y, terrain };
  if (tileDelta.terrain) next.terrain = tileDelta.terrain;
  if ("resource" in tileDelta) {
    if (tileDelta.resource) next.resource = tileDelta.resource as PlannerTileView["resource"];
    else delete next.resource;
  }
  if ("dockId" in tileDelta) {
    if (tileDelta.dockId) next.dockId = tileDelta.dockId;
    else delete next.dockId;
  }
  if ("ownerId" in tileDelta) {
    if (tileDelta.ownerId) next.ownerId = tileDelta.ownerId;
    else delete next.ownerId;
  }
  if ("ownershipState" in tileDelta) {
    if (tileDelta.ownershipState) next.ownershipState = tileDelta.ownershipState as PlannerTileView["ownershipState"];
    else delete next.ownershipState;
  }
  return next;
};

type WorkerSystemCommandProducerOptions = {
  runtime: Pick<
    SimulationRuntime,
    | "queueDepths"
    | "onEvent"
    | "exportPlannerWorldView"
    | "exportPlannerPlayerViews"
    | "getBarbActivationVisionSignature"
    | "exportBarbActivationVisibleUnion"
  >;
  systemPlayerIds: string[];
  submitCommand: (command: CommandEnvelope) => Promise<void>;
  shouldRun?: () => boolean;
  startingClientSeqByPlayer?: Record<string, number>;
  now?: () => number;
  tickIntervalMs?: number;
  playerSyncIntervalMs?: number;
  periodicPlayerSyncBatchSize?: number;
  workerScriptPath?: string;
  maxOldGenerationSizeMb?: number;
  onTick?: (sample: { durationMs: number }) => void;
  /** Minimum ms between exportBarbActivationVisibleUnion recomputes, regardless
   *  of signature churn. See ensureVisionUnionFresh for why this is needed. */
  visionUnionMinRecomputeIntervalMs?: number;
  /** Fires each time ensureVisionUnionFresh skips a recompute because the
   *  signature changed before the throttle interval elapsed. Zero forever
   *  means the throttle never actually engages under real load. */
  onVisionUnionRecomputeThrottled?: () => void;
};

const resolveWorkerScript = (given?: string): string | URL =>
  given ?? resolveWorkerEntryUrl("./system-job-worker.js", import.meta.url);

const hasAnyBacklog = (queueDepths: QueueDepths): boolean =>
  queueDepths.human_interactive > 0 || queueDepths.human_noninteractive > 0 || queueDepths.system > 0;

export const createWorkerSystemCommandProducer = (options: WorkerSystemCommandProducerOptions) => {
  const now = options.now ?? (() => Date.now());
  const tickIntervalMs = Math.max(25, options.tickIntervalMs ?? 500);
  const playerSyncIntervalMs = Math.max(25, options.playerSyncIntervalMs ?? 5_000);
  const periodicPlayerSyncBatchSize = Math.max(1, options.periodicPlayerSyncBatchSize ?? 1);
  const playerSyncDebounceMs = 500;
  const tileDeltaSyncDebounceMs = Math.max(20, Math.min(150, Math.floor(tickIntervalMs / 2)));
  const shouldRun = options.shouldRun ?? (() => true);
  const systemPlayerIdSet = new Set(options.systemPlayerIds);
  const plannerPlayersById = new Map<string, PlannerPlayerView>();
  const plannerTilesByKey = new Map<string, PlannerTileView>();
  let relevantTileKeys = new Set<string>();
  let nextPeriodicPlayerSyncIndex = 0;

  const nextClientSeqByPlayer = new Map<string, number>(
    options.systemPlayerIds.map((id) => [id, options.startingClientSeqByPlayer?.[id] ?? 1])
  );
  const pendingPlayers = new Set<string>();
  const pendingAddedAtMs = new Map<string, number>();
  // System producer issues one command per player at a time. If neither
  // COMBAT_RESOLVED nor COMMAND_REJECTED fires (e.g. EXPAND to neutral
  // territory succeeds silently), the player stays in pendingPlayers forever.
  // A generous timeout (30 s) clears stuck entries without masking real latency.
  const PENDING_TIMEOUT_MS = 30_000;
  let tickInFlight = false;
  let lastBacklogState = false;

  const SYSTEM_WORKER_MAX_OLD_GEN_MB_DEFAULT = 96;
  const maxOldGenerationSizeMb = Math.max(48, options.maxOldGenerationSizeMb ?? SYSTEM_WORKER_MAX_OLD_GEN_MB_DEFAULT);
  const workerScriptPath = resolveWorkerScript(options.workerScriptPath);

  const pendingRequests = new Map<string, (command: CommandEnvelope | null) => void>();
  let closed = false;
  // Barbarian activation needs the union of non-barb players' fog. The worker
  // can't compute it (it doesn't receive non-barb player views), so we ship
  // the union from here. Signature compare is cheap; the full key array is
  // only allocated + posted when something actually moved.
  let lastSentVisionSignature: string | null = null;
  // The signature includes every non-barb player's tileCollectionVersion, so
  // with ~25 concurrently-mutating empires it changes on essentially every
  // system tick — without a time floor, exportBarbActivationVisibleUnion
  // (an O(barb_tiles * radius^2) scan) recomputes back-to-back every tick.
  // Barb activation doesn't need sub-second freshness, so bound recompute
  // frequency independent of signature churn. Confirmed on staging
  // 2026-07-05: this recompute alone measured 2879ms in a single
  // event_loop_blocked capture with a ~1283-tile barbarian territory.
  const visionUnionMinRecomputeIntervalMs = Math.max(0, options.visionUnionMinRecomputeIntervalMs ?? 3000);
  let lastVisionUnionComputedAtMs = 0;
  const workerMetrics: WorkerMemoryMetrics = { respawnCount: 0 };

  let worker!: Worker;
  let relevantTileKeyIndex!: ReturnType<typeof createPlannerRelevantTileKeyIndex>;

  const spawnWorker = (): void => {
    worker = new Worker(workerScriptPath, {
      resourceLimits: { maxOldGenerationSizeMb }
    });

    worker.on("message", (msg: unknown) => {
      if (!msg || typeof msg !== "object") return;
      const message = msg as Record<string, unknown>;
      if (message.type === "metrics" && message.memoryUsage && typeof message.memoryUsage === "object") {
        const mu = message.memoryUsage as NodeJS.MemoryUsage;
        workerMetrics.rssBytes = mu.rss;
        workerMetrics.heapTotalBytes = mu.heapTotal;
        workerMetrics.heapUsedBytes = mu.heapUsed;
        workerMetrics.externalBytes = mu.external;
        workerMetrics.arrayBuffersBytes = mu.arrayBuffers;
        return;
      }
      if (message.type === "command") {
        const resolve = pendingRequests.get(message.playerId as string);
        if (resolve) {
          pendingRequests.delete(message.playerId as string);
          resolve(message.command as CommandEnvelope | null);
        }
      } else if (message.type === "error") {
        const playerId = message.playerId as string;
        console.error("[system-job-worker] planner error:", message.message);
        const resolve = pendingRequests.get(playerId);
        if (resolve) {
          pendingRequests.delete(playerId);
          resolve(null);
        }
      }
    });

    worker.on("error", (err) => {
      console.error("[system-job-worker] uncaught error:", err);
      for (const [, resolve] of pendingRequests) resolve(null);
      pendingRequests.clear();
    });

    worker.on("exit", (code) => {
      workerMetrics.lastExitCode = code;
      workerMetrics.lastExitAt = Date.now();
      if (closed) return;
      if (code !== 0) {
        console.error(
          `[system-job-worker] exited code=${code} — respawning (likely heap cap hit at ${maxOldGenerationSizeMb}MB)`
        );
      }
      for (const [, resolve] of pendingRequests) resolve(null);
      pendingRequests.clear();
      // The new worker thread starts unpaused. Reset our local backlog-tracking
      // flag so the next tick re-issues pause/resume against the fresh worker;
      // otherwise we'd silently keep planning while the main thread thinks the
      // worker is paused (or vice-versa).
      lastBacklogState = false;
      workerMetrics.respawnCount += 1;
      scheduleRespawn(0);
    });
  };

  // Respawn with retry/backoff. If re-init throws (e.g. exportPlannerWorldView
  // blows up under main-thread memory pressure), retry on a timer instead of
  // letting the unhandled throw propagate from the exit handler and crash the
  // whole process.
  const RESPAWN_RETRY_DELAY_MS = 5_000;
  const scheduleRespawn = (delayMs: number): void => {
    if (closed) return;
    setTimeout(() => {
      if (closed) return;
      try {
        initializeWorkerFromRuntime();
      } catch (err) {
        console.error(
          `[system-job-worker] respawn init failed; retrying in ${RESPAWN_RETRY_DELAY_MS}ms:`,
          err
        );
        scheduleRespawn(RESPAWN_RETRY_DELAY_MS);
      }
    }, delayMs).unref();
  };

  const initializeWorkerFromRuntime = (): void => {
    spawnWorker();
    plannerPlayersById.clear();
    plannerTilesByKey.clear();
    // Force a fresh vision_union push after (re)spawn — the new worker has
    // an empty default and the cached signature must not gate the first send.
    lastSentVisionSignature = null;
    lastVisionUnionComputedAtMs = 0;
    const worldView = options.runtime.exportPlannerWorldView(options.systemPlayerIds);
    for (const player of worldView.players) plannerPlayersById.set(player.id, player);
    for (const tile of worldView.tiles) {
      plannerTilesByKey.set(`${tile.x},${tile.y}`, tile);
    }
    relevantTileKeyIndex = createPlannerRelevantTileKeyIndex(worldView);
    relevantTileKeys = new Set(relevantTileKeyIndex.keys());
    worker.postMessage({
      type: "init",
      worldView
    });
  };

  initializeWorkerFromRuntime();

  const pendingPlayerSyncIds = new Set<string>();
  let playerSyncTimeout: ReturnType<typeof setTimeout> | undefined;
  const pendingTileDeltasByKey = new Map<string, SimulationTileDelta>();
  let tileDeltaSyncTimeout: ReturnType<typeof setTimeout> | undefined;

  const syncPlayers = (playerIds: string[]): void => {
    if (playerIds.length === 0) return;
    const players = options.runtime.exportPlannerPlayerViews(playerIds);
    for (const player of players) plannerPlayersById.set(player.id, player);
    relevantTileKeyIndex.replacePlayers(players, plannerTilesByKey);
    relevantTileKeys = new Set(relevantTileKeyIndex.keys());
    worker.postMessage({
      type: "sync_players",
      players
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

  const syncPlayersImmediately = (playerIds: Iterable<string>): void => {
    const nextPlayerIds: string[] = [];
    for (const playerId of playerIds) {
      if (!systemPlayerIdSet.has(playerId)) continue;
      nextPlayerIds.push(playerId);
    }
    if (nextPlayerIds.length === 0) return;
    syncPlayers(nextPlayerIds);
  };

  const flushPendingTileDeltas = (): void => {
    tileDeltaSyncTimeout = undefined;
    if (pendingTileDeltasByKey.size === 0) return;
    const tileDeltas = [...pendingTileDeltasByKey.values()];
    pendingTileDeltasByKey.clear();
    worker.postMessage({ type: "tile_deltas", tileDeltas });
  };

  const queueTileDeltas = (tileDeltas: readonly SimulationTileDelta[]): void => {
    for (const tileDelta of tileDeltas) {
      if (!Number.isFinite(tileDelta.x) || !Number.isFinite(tileDelta.y)) continue;
      const tileKey = `${tileDelta.x},${tileDelta.y}`;
      if (!relevantTileKeys.has(tileKey) && !(typeof tileDelta.ownerId === "string" && systemPlayerIdSet.has(tileDelta.ownerId))) {
        continue;
      }
      const nextTile = mergePlannerTileDelta(plannerTilesByKey.get(tileKey), tileDelta);
      if (nextTile) plannerTilesByKey.set(tileKey, nextTile);
      pendingTileDeltasByKey.set(tileKey, tileDelta);
    }
    if (pendingTileDeltasByKey.size === 0 || tileDeltaSyncTimeout) return;
    tileDeltaSyncTimeout = setTimeout(flushPendingTileDeltas, tileDeltaSyncDebounceMs);
  };

  const stopListening = options.runtime.onEvent((event) => {
    if (event.eventType === "TILE_DELTA_BATCH") {
      const tileDeltas = Array.isArray(event.tileDeltas) ? event.tileDeltas : [];
      queueTileDeltas(tileDeltas);
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
    // COMBAT_RESOLVED covers ATTACK. COMMAND_REJECTED covers validation failures.
    // TILE_DELTA_BATCH covers successful EXPAND to neutral (no combat fires).
    if (
      event.eventType === "COMMAND_REJECTED" ||
      event.eventType === "COMBAT_RESOLVED" ||
      event.eventType === "TILE_DELTA_BATCH"
    ) {
      pendingPlayers.delete(event.playerId);
      pendingAddedAtMs.delete(event.playerId);
    }
  });

  const playerSyncInterval = setInterval(() => {
    const playerIds: string[] = [];
    const batchSize = Math.min(periodicPlayerSyncBatchSize, options.systemPlayerIds.length);
    for (let offset = 0; offset < batchSize; offset += 1) {
      const playerId = options.systemPlayerIds[(nextPeriodicPlayerSyncIndex + offset) % options.systemPlayerIds.length];
      if (playerId) playerIds.push(playerId);
    }
    nextPeriodicPlayerSyncIndex = (nextPeriodicPlayerSyncIndex + batchSize) % Math.max(1, options.systemPlayerIds.length);
    syncPlayersImmediately(playerIds);
  }, playerSyncIntervalMs);

  const ensureVisionUnionFresh = (): void => {
    const sig = options.runtime.getBarbActivationVisionSignature();
    if (sig === lastSentVisionSignature) return;
    // Signature changed, but don't recompute more often than the floor —
    // leave lastSentVisionSignature untouched so the next tick still sees a
    // mismatch and retries once the interval has elapsed.
    if (now() - lastVisionUnionComputedAtMs < visionUnionMinRecomputeIntervalMs) {
      options.onVisionUnionRecomputeThrottled?.();
      return;
    }
    const { keys, signature } = options.runtime.exportBarbActivationVisibleUnion();
    worker.postMessage({ type: "vision_union", keys, version: signature });
    lastSentVisionSignature = signature;
    lastVisionUnionComputedAtMs = now();
  };

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
    const tickStartedAt = now();
    try {
      // Expire any player that has been pending longer than the timeout.
      // Covers commands that succeed without emitting COMBAT_RESOLVED or COMMAND_REJECTED.
      for (const [playerId, addedAt] of pendingAddedAtMs) {
        if (tickStartedAt - addedAt > PENDING_TIMEOUT_MS) {
          pendingPlayers.delete(playerId);
          pendingAddedAtMs.delete(playerId);
        }
      }
      ensureVisionUnionFresh();
      for (const playerId of options.systemPlayerIds) {
        if (pendingPlayers.has(playerId)) continue;
        const clientSeq = nextClientSeqByPlayer.get(playerId) ?? 1;
        const issuedAt = now();
        try {
          const command = await requestPlan(playerId, clientSeq, issuedAt);
          if (!command) continue;
          pendingPlayers.add(playerId);
          pendingAddedAtMs.set(playerId, now());
          nextClientSeqByPlayer.set(playerId, clientSeq + 1);
          await options.submitCommand(command);
        } catch {
          pendingPlayers.delete(playerId);
          // swallow
        }
        return;
      }
    } finally {
      options.onTick?.({ durationMs: Math.max(0, now() - tickStartedAt) });
      tickInFlight = false;
    }
  };

  const intervalHandle = setInterval(() => {
    void tick();
  }, tickIntervalMs);

  return {
    tick,
    getWorkerMetrics: (): WorkerMemoryMetrics => ({ ...workerMetrics }),
    close(): void {
      closed = true;
      clearInterval(intervalHandle);
      clearInterval(playerSyncInterval);
      if (playerSyncTimeout) clearTimeout(playerSyncTimeout);
      if (tileDeltaSyncTimeout) clearTimeout(tileDeltaSyncTimeout);
      flushPendingTileDeltas();
      stopListening();
      worker.postMessage({ type: "shutdown" });
      void worker.terminate();
    }
  };
};
