/**
 * Worker-backed system command producer.
 *
 * Offloads barbarian/truce/upkeep frontier decisions to system-job-worker.ts.
 * Backpressure: skips ticks when human or system backlog is non-empty.
 */

import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { CommandEnvelope, SimulationEvent } from "@border-empires/sim-protocol";
import type { SimulationRuntime } from "./runtime.js";
import { buildPlannerRelevantTileKeys } from "./planner-sync-scope.js";
import type { PlannerPlayerView, PlannerTileView } from "./planner-world-view.js";

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
  runtime: Pick<SimulationRuntime, "queueDepths" | "onEvent" | "exportPlannerWorldView" | "exportPlannerPlayerViews">;
  systemPlayerIds: string[];
  submitCommand: (command: CommandEnvelope) => Promise<void>;
  shouldRun?: () => boolean;
  startingClientSeqByPlayer?: Record<string, number>;
  now?: () => number;
  tickIntervalMs?: number;
  playerSyncIntervalMs?: number;
  workerScriptPath?: string;
  onTick?: (sample: { durationMs: number }) => void;
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
  const tileDeltaSyncDebounceMs = Math.max(20, Math.min(150, Math.floor(tickIntervalMs / 2)));
  const shouldRun = options.shouldRun ?? (() => true);
  const systemPlayerIdSet = new Set(options.systemPlayerIds);
  const plannerPlayersById = new Map<string, PlannerPlayerView>();
  const plannerTilesByKey = new Map<string, PlannerTileView>();
  let relevantTileKeys = new Set<string>();

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

  const initialWorldView = options.runtime.exportPlannerWorldView(options.systemPlayerIds);
  for (const player of initialWorldView.players) plannerPlayersById.set(player.id, player);
  for (const tile of initialWorldView.tiles) {
    plannerTilesByKey.set(`${tile.x},${tile.y}`, tile);
  }
  relevantTileKeys = buildPlannerRelevantTileKeys(initialWorldView);
  worker.postMessage({
    type: "init",
    worldView: initialWorldView
  });

  const pendingPlayerSyncIds = new Set<string>();
  let playerSyncTimeout: ReturnType<typeof setTimeout> | undefined;
  const pendingTileDeltasByKey = new Map<string, SimulationTileDelta>();
  let tileDeltaSyncTimeout: ReturnType<typeof setTimeout> | undefined;

  const syncPlayers = (playerIds: string[]): void => {
    if (playerIds.length === 0) return;
    const players = options.runtime.exportPlannerPlayerViews(playerIds);
    for (const player of players) plannerPlayersById.set(player.id, player);
    relevantTileKeys = buildPlannerRelevantTileKeys({
      players: [...plannerPlayersById.values()],
      tiles: [...plannerTilesByKey.values()],
      ...(initialWorldView.docks ? { docks: initialWorldView.docks } : {})
    });
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
    const tickStartedAt = now();
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
      options.onTick?.({ durationMs: Math.max(0, now() - tickStartedAt) });
      tickInFlight = false;
    }
  };

  const intervalHandle = setInterval(() => {
    void tick();
  }, tickIntervalMs);

  return {
    tick,
    close(): void {
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
