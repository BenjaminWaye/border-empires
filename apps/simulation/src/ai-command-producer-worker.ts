/**
 * Worker-backed AI command producer.
 *
 * Drop-in replacement for ai-command-producer.ts that offloads all planning
 * computation to ai-planner-worker.ts so the main simulation event loop is
 * never blocked by AI decision logic.
 *
 * Backpressure rules:
 *  - If human_interactive backlog > 0, the tick is skipped entirely.
 *  - If the persistence queue is degraded, the tick is skipped.
 *  - The worker receives a "pause" message when backlog > 0 so any in-flight
 *    computation is short-circuited; it resumes when the backlog drains.
 */

import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { CommandEnvelope, SimulationEvent } from "@border-empires/sim-protocol";
import type { SimulationRuntime } from "./runtime.js";
import type { AutomationPlannerDiagnostic } from "./automation-command-planner.js";
import { createPlannerRelevantTileKeyIndex } from "./planner-sync-scope.js";
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
    if (tileDelta.resource) next.resource = tileDelta.resource;
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
    if (tileDelta.ownershipState) next.ownershipState = tileDelta.ownershipState;
    else delete next.ownershipState;
  }
  return next;
};

type WorkerAiCommandProducerOptions = {
  runtime: Pick<SimulationRuntime, "queueDepths" | "onEvent" | "exportPlannerWorldView" | "exportPlannerPlayerViews">;
  aiPlayerIds: string[];
  submitCommand: (command: CommandEnvelope) => Promise<void>;
  shouldRun?: () => boolean;
  startingClientSeqByPlayer?: Record<string, number>;
  now?: () => number;
  tickIntervalMs?: number;
  playerSyncIntervalMs?: number;
  periodicPlayerSyncBatchSize?: number;
  workerScriptPath?: string;
  plannerBreachThresholdMs?: number;
  onPlannerTick?: (sample: { durationMs: number; breached: boolean }) => void;
  onTick?: (sample: { durationMs: number }) => void;
  onNoCommand?: (diagnostic: AutomationPlannerDiagnostic) => void;
  onDiagnostic?: (sample: {
    phase:
      | "sync_players_export"
      | "sync_players_relevance"
      | "sync_players_post"
      | "sync_players_total"
      | "tile_delta_merge"
      | "tile_delta_post"
      | "tile_delta_sync"
      | "request_plan_round_trip"
      | "resolve_player_tiles"
      | "planner_choose_settlement"
      | "planner_choose_frontier"
      | "planner_summarize_frontier"
      | "planner_total"
      | "submit_command";
    durationMs: number;
    playerId?: string;
    playerCount?: number;
    tileDeltaCount?: number;
    ownedTileCount?: number;
    frontierTileCount?: number;
  }) => void;
};

const here = dirname(fileURLToPath(import.meta.url));

const resolveWorkerScript = (given?: string): string =>
  given ?? resolve(here, "ai-planner-worker.js");

const hasHumanInteractiveBacklog = (queueDepths: QueueDepths): boolean =>
  queueDepths.human_interactive > 0;

export const createWorkerAiCommandProducer = (options: WorkerAiCommandProducerOptions) => {
  const now = options.now ?? (() => Date.now());
  const tickIntervalMs = Math.max(25, options.tickIntervalMs ?? 250);
  const playerSyncIntervalMs = Math.max(25, options.playerSyncIntervalMs ?? 5_000);
  const periodicPlayerSyncBatchSize = Math.max(1, options.periodicPlayerSyncBatchSize ?? 1);
  const playerSyncDebounceMs = 500;
  const tileDeltaSyncDebounceMs = Math.max(20, Math.min(150, Math.floor(tickIntervalMs / 2)));
  const shouldRun = options.shouldRun ?? (() => true);
  const plannerBreachThresholdMs = Math.max(1, options.plannerBreachThresholdMs ?? 50);
  const aiPlayerIdSet = new Set(options.aiPlayerIds);
  const plannerPlayersById = new Map<string, PlannerPlayerView>();
  const plannerTilesByKey = new Map<string, PlannerTileView>();
  let relevantTileKeys = new Set<string>();
  let nextPeriodicPlayerSyncIndex = 0;

  const nextClientSeqByPlayer = new Map<string, number>(
    options.aiPlayerIds.map((id) => [id, options.startingClientSeqByPlayer?.[id] ?? 1])
  );
  const pendingCommandByPlayer = new Map<string, { commandId: string; startedAt: number }>();

  let tickInFlight = false;
  let nextPlayerIndex = 0;
  let humanBacklogWasNonEmpty = false;

  const worker = new Worker(resolveWorkerScript(options.workerScriptPath));

  // Resolve map: commandId → resolve function for the pending promise
  const pendingRequests = new Map<string, (command: CommandEnvelope | null) => void>();

  worker.on("message", (msg: unknown) => {
    if (!msg || typeof msg !== "object") return;
    const message = msg as Record<string, unknown>;
    if (message.type === "command") {
      const key = message.playerId as string;
      if (!message.command && message.diagnostic) {
        options.onNoCommand?.(message.diagnostic as AutomationPlannerDiagnostic);
      }
      const resolve = pendingRequests.get(key);
      if (resolve) {
        pendingRequests.delete(key);
        resolve(message.command as CommandEnvelope | null);
      }
    } else if (message.type === "diagnostic") {
      const diagnostic = message.diagnostic as {
        phase:
          | "resolve_player_tiles"
          | "planner_choose_settlement"
          | "planner_choose_frontier"
          | "planner_summarize_frontier"
          | "planner_total";
        durationMs: number;
        playerId: string;
        ownedTileCount?: number;
        frontierTileCount?: number;
      };
      options.onDiagnostic?.(diagnostic);
    }
  });

  worker.on("error", (err) => {
    console.error("[ai-planner-worker] uncaught error:", err);
    // Drain pending requests so ticks don't hang
    for (const [, resolve] of pendingRequests) resolve(null);
    pendingRequests.clear();
  });

  const initialWorldView = options.runtime.exportPlannerWorldView(options.aiPlayerIds);
  for (const player of initialWorldView.players) plannerPlayersById.set(player.id, player);
  for (const tile of initialWorldView.tiles) {
    plannerTilesByKey.set(`${tile.x},${tile.y}`, tile);
  }
  const relevantTileKeyIndex = createPlannerRelevantTileKeyIndex(initialWorldView);
  relevantTileKeys = new Set(relevantTileKeyIndex.keys());
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
    const startedAt = now();
    const exportStartedAt = now();
    const players = options.runtime.exportPlannerPlayerViews(playerIds);
    options.onDiagnostic?.({
      phase: "sync_players_export",
      durationMs: Math.max(0, now() - exportStartedAt),
      playerCount: players.length
    });
    for (const player of players) plannerPlayersById.set(player.id, player);
    const relevanceStartedAt = now();
    relevantTileKeyIndex.replacePlayers(players, plannerTilesByKey);
    relevantTileKeys = new Set(relevantTileKeyIndex.keys());
    options.onDiagnostic?.({
      phase: "sync_players_relevance",
      durationMs: Math.max(0, now() - relevanceStartedAt),
      playerCount: players.length
    });
    const postStartedAt = now();
    worker.postMessage({
      type: "sync_players",
      players
    });
    options.onDiagnostic?.({
      phase: "sync_players_post",
      durationMs: Math.max(0, now() - postStartedAt),
      playerCount: players.length
    });
    options.onDiagnostic?.({
      phase: "sync_players_total",
      durationMs: Math.max(0, now() - startedAt),
      playerCount: players.length
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
      if (!aiPlayerIdSet.has(playerId)) continue;
      pendingPlayerSyncIds.add(playerId);
    }
    if (pendingPlayerSyncIds.size === 0 || playerSyncTimeout) return;
    playerSyncTimeout = setTimeout(flushPendingPlayerSync, playerSyncDebounceMs);
  };

  const syncPlayersImmediately = (playerIds: Iterable<string>): void => {
    const nextPlayerIds: string[] = [];
    for (const playerId of playerIds) {
      if (!aiPlayerIdSet.has(playerId)) continue;
      nextPlayerIds.push(playerId);
    }
    if (nextPlayerIds.length === 0) return;
    syncPlayers(nextPlayerIds);
  };

  const flushPendingTileDeltas = (): void => {
    tileDeltaSyncTimeout = undefined;
    if (pendingTileDeltasByKey.size === 0) return;
    const startedAt = now();
    const tileDeltas = [...pendingTileDeltasByKey.values()];
    pendingTileDeltasByKey.clear();
    const postStartedAt = now();
    worker.postMessage({ type: "tile_deltas", tileDeltas });
    options.onDiagnostic?.({
      phase: "tile_delta_post",
      durationMs: Math.max(0, now() - postStartedAt),
      tileDeltaCount: tileDeltas.length
    });
    options.onDiagnostic?.({
      phase: "tile_delta_sync",
      durationMs: Math.max(0, now() - startedAt),
      tileDeltaCount: tileDeltas.length
    });
  };

  const queueTileDeltas = (tileDeltas: readonly SimulationTileDelta[]): void => {
    const mergeStartedAt = now();
    for (const tileDelta of tileDeltas) {
      if (!Number.isFinite(tileDelta.x) || !Number.isFinite(tileDelta.y)) continue;
      const tileKey = `${tileDelta.x},${tileDelta.y}`;
      if (!relevantTileKeys.has(tileKey) && !(typeof tileDelta.ownerId === "string" && aiPlayerIdSet.has(tileDelta.ownerId))) {
        continue;
      }
      pendingTileDeltasByKey.set(tileKey, tileDelta);
      const nextTile = mergePlannerTileDelta(plannerTilesByKey.get(tileKey), tileDelta);
      if (nextTile) plannerTilesByKey.set(tileKey, nextTile);
    }
    options.onDiagnostic?.({
      phase: "tile_delta_merge",
      durationMs: Math.max(0, now() - mergeStartedAt),
      tileDeltaCount: tileDeltas.length
    });
    if (pendingTileDeltasByKey.size === 0 || tileDeltaSyncTimeout) return;
    tileDeltaSyncTimeout = setTimeout(flushPendingTileDeltas, tileDeltaSyncDebounceMs);
  };

  const stopListening = options.runtime.onEvent((event) => {
    if (event.eventType === "TILE_DELTA_BATCH") {
      const tileDeltas = Array.isArray(event.tileDeltas) ? event.tileDeltas : [];
      queueTileDeltas(tileDeltas);
      const changedPlayers = new Set<string>();
      if (aiPlayerIdSet.has(event.playerId)) changedPlayers.add(event.playerId);
      for (const delta of tileDeltas) {
        if (typeof delta.ownerId === "string" && aiPlayerIdSet.has(delta.ownerId)) {
          changedPlayers.add(delta.ownerId);
        }
      }
      queuePlayerSync(changedPlayers);
    } else if (aiPlayerIdSet.has(event.playerId)) {
      queuePlayerSync([event.playerId]);
    }
    const pending = pendingCommandByPlayer.get(event.playerId);
    if (!pending || pending.commandId !== event.commandId) return;
    if (
      event.eventType === "COMMAND_REJECTED" ||
      event.eventType === "COMBAT_RESOLVED" ||
      event.eventType === "TILE_DELTA_BATCH" ||
      event.eventType === "COLLECT_RESULT" ||
      event.eventType === "TECH_UPDATE" ||
      event.eventType === "DOMAIN_UPDATE"
    ) {
      pendingCommandByPlayer.delete(event.playerId);
    }
  });

  const playerSyncInterval = setInterval(() => {
    const playerIds: string[] = [];
    const batchSize = Math.min(periodicPlayerSyncBatchSize, options.aiPlayerIds.length);
    for (let offset = 0; offset < batchSize; offset += 1) {
      const playerId = options.aiPlayerIds[(nextPeriodicPlayerSyncIndex + offset) % options.aiPlayerIds.length];
      if (playerId) playerIds.push(playerId);
    }
    nextPeriodicPlayerSyncIndex = (nextPeriodicPlayerSyncIndex + batchSize) % Math.max(1, options.aiPlayerIds.length);
    syncPlayersImmediately(playerIds);
  }, playerSyncIntervalMs);

  const requestPlan = (
    playerId: string,
    clientSeq: number,
    issuedAt: number
  ): Promise<CommandEnvelope | null> => {
    return new Promise((resolve) => {
      pendingRequests.set(playerId, resolve);
      worker.postMessage({ type: "plan", playerId, clientSeq, issuedAt, sessionPrefix: "ai-runtime" });
    });
  };

  const tick = async (): Promise<void> => {
    if (tickInFlight) return;
    if (!shouldRun()) return;

    const queueDepths = options.runtime.queueDepths();
    const humanBacklogNonEmpty = hasHumanInteractiveBacklog(queueDepths);

    // Sync pause/resume state with worker
    if (humanBacklogNonEmpty && !humanBacklogWasNonEmpty) {
      worker.postMessage({ type: "pause" });
    } else if (!humanBacklogNonEmpty && humanBacklogWasNonEmpty) {
      worker.postMessage({ type: "resume" });
    }
    humanBacklogWasNonEmpty = humanBacklogNonEmpty;

    if (humanBacklogNonEmpty) return;

    tickInFlight = true;
    const tickStartedAt = now();
    try {
      if (options.aiPlayerIds.length === 0) return;

      // Clear timed-out pending commands (90s timeout)
      const cutoff = now() - 90_000;
      for (const [playerId, pending] of pendingCommandByPlayer.entries()) {
        if (pending.startedAt <= cutoff) pendingCommandByPlayer.delete(playerId);
      }

      for (let offset = 0; offset < options.aiPlayerIds.length; offset++) {
        const playerIndex = (nextPlayerIndex + offset) % options.aiPlayerIds.length;
        const playerId = options.aiPlayerIds[playerIndex]!;
        if (pendingCommandByPlayer.has(playerId)) continue;

        const clientSeq = nextClientSeqByPlayer.get(playerId) ?? 1;
        const issuedAt = now();

        try {
          const plannerStartedAt = now();
          const command = await requestPlan(playerId, clientSeq, issuedAt);
          const plannerDurationMs = Math.max(0, now() - plannerStartedAt);
          options.onDiagnostic?.({
            phase: "request_plan_round_trip",
            durationMs: plannerDurationMs,
            playerId
          });
          const breached = plannerDurationMs > plannerBreachThresholdMs;
          options.onPlannerTick?.({ durationMs: plannerDurationMs, breached });
          if (!command) continue;
          pendingCommandByPlayer.set(playerId, { commandId: command.commandId, startedAt: issuedAt });
          nextClientSeqByPlayer.set(playerId, clientSeq + 1);
          nextPlayerIndex = (playerIndex + 1) % options.aiPlayerIds.length;
          const submitStartedAt = now();
          await options.submitCommand(command);
          options.onDiagnostic?.({
            phase: "submit_command",
            durationMs: Math.max(0, now() - submitStartedAt),
            playerId
          });
        } catch {
          pendingCommandByPlayer.delete(playerId);
          // swallow — will retry on next tick
        }
        return; // one player per tick
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
