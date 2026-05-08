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
import type { CommandEnvelope, SimulationEvent } from "@border-empires/sim-protocol";
import type { SimulationRuntime } from "./runtime.js";
import type { AutomationPlannerDiagnostic } from "./automation-command-planner.js";
import { createAutomationNoopDiagnostic } from "./automation-command-planner.js";
import { createPlannerRelevantTileKeyIndex } from "./planner-sync-scope.js";
import type { PlannerPlayerView, PlannerTileView } from "./planner-world-view.js";
import { resolveWorkerEntryUrl } from "./resolve-worker-entry.js";
import {
  createAiIntentLatchState,
  latchAiIntent,
  probeAiLatchedIntent,
  releaseAiLatchedIntent,
  reservationHeldByOtherAi,
  reserveAiTarget
} from "./ai-intent-latch.js";
import {
  extractOriginTileKey,
  extractTargetTileKey,
  intentKindForCommand,
  wakeWindowMsForCommand
} from "./ai-intent-latch-helpers.js";

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

/**
 * Converts a PlannerTileView back to the SimulationTileDelta wire format so
 * backfilled tiles can be sent to the worker via the existing "tile_deltas"
 * message path.
 */
const toPlannerTileDelta = (tile: PlannerTileView): SimulationTileDelta => ({
  x: tile.x,
  y: tile.y,
  terrain: tile.terrain,
  ...(tile.resource !== undefined ? { resource: tile.resource } : {}),
  ...(tile.dockId !== undefined ? { dockId: tile.dockId } : {}),
  ...(tile.ownerId !== undefined ? { ownerId: tile.ownerId } : {}),
  ...(tile.ownershipState !== undefined ? { ownershipState: tile.ownershipState } : {}),
  ...(tile.town !== undefined ? { townJson: JSON.stringify(tile.town) } : {}),
  ...(tile.fort !== undefined ? { fortJson: JSON.stringify(tile.fort) } : {}),
  ...(tile.observatory !== undefined ? { observatoryJson: JSON.stringify(tile.observatory) } : {}),
  ...(tile.siegeOutpost !== undefined ? { siegeOutpostJson: JSON.stringify(tile.siegeOutpost) } : {}),
  ...(tile.economicStructure !== undefined ? { economicStructureJson: JSON.stringify(tile.economicStructure) } : {})
});

type WorkerAiCommandProducerOptions = {
  runtime: Pick<SimulationRuntime, "queueDepths" | "onEvent" | "exportPlannerWorldView" | "exportPlannerPlayerViews" | "exportTilesForKeys">;
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
  onCommand?: (sample: { playerId: string; commandType: CommandEnvelope["type"] }) => void;
  onDecision?: (diagnostic: AutomationPlannerDiagnostic) => void;
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

const resolveWorkerScript = (given?: string): string | URL =>
  given ?? resolveWorkerEntryUrl("./ai-planner-worker.js", import.meta.url);

const hasHumanInteractiveBacklog = (queueDepths: QueueDepths): boolean =>
  queueDepths.human_interactive > 0;
const COLLECT_VISIBLE_COOLDOWN_MS = 20_000;
const isAutomationPreplanCommand = (type: CommandEnvelope["type"]): boolean =>
  type === "COLLECT_VISIBLE" || type === "CHOOSE_TECH" || type === "CHOOSE_DOMAIN";
const PREPLAN_OUTCOME_TIMEOUT_MS = 5_000;
const TRACKED_PREPLAN_RETENTION_MS = 90_000;
type PreplanOutcome = "applied" | "cooldown_rejected" | "rejected" | "timed_out";
type TrackedPreplanCommand = { playerId: string; trackedAt: number };
type PlannedCommandResult = {
  command: CommandEnvelope | null;
  diagnostic?: AutomationPlannerDiagnostic;
};

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
  const pendingPreplanOutcomeByCommandId = new Map<string, { resolve: (outcome: PreplanOutcome) => void; timeoutHandle: ReturnType<typeof setTimeout> }>();
  const trackedPreplanByCommandId = new Map<string, TrackedPreplanCommand>();
  const collectVisibleCooldownUntilByPlayer = new Map<string, number>();
  const urgentByPlayerId = new Set<string>();
  const intentLatchState = createAiIntentLatchState();
  // Latching is always on for the worker producer — runtime tracks
  // tileCollectionVersion per player and we read it from the synced
  // plannerPlayersById map (already kept fresh via player_sync messages).
  const territoryVersionForPlayer = (playerId: string): number =>
    plannerPlayersById.get(playerId)?.tileCollectionVersion ?? 0;

  let tickInFlight = false;
  let nextPlayerIndex = 0;
  let humanBacklogWasNonEmpty = false;

  const backOffCollectVisible = (playerId: string, eventAt: number): void => {
    collectVisibleCooldownUntilByPlayer.set(playerId, eventAt + COLLECT_VISIBLE_COOLDOWN_MS);
  };

  const resolvePendingPreplanOutcome = (commandId: string, outcome: PreplanOutcome): void => {
    const pending = pendingPreplanOutcomeByCommandId.get(commandId);
    if (!pending) return;
    clearTimeout(pending.timeoutHandle);
    pendingPreplanOutcomeByCommandId.delete(commandId);
    pending.resolve(outcome);
  };

  const worker = new Worker(resolveWorkerScript(options.workerScriptPath));

  const pendingRequests = new Map<string, (result: PlannedCommandResult) => void>();

  worker.on("message", (msg: unknown) => {
    if (!msg || typeof msg !== "object") return;
    const message = msg as Record<string, unknown>;
    if (message.type === "command") {
      const key = message.playerId as string;
      const resolve = pendingRequests.get(key);
      if (resolve) {
        pendingRequests.delete(key);
        resolve({
          command: (message.command as CommandEnvelope | null) ?? null,
          ...(message.diagnostic
            ? { diagnostic: message.diagnostic as AutomationPlannerDiagnostic }
            : {})
        });
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
    } else if (message.type === "error") {
      const key = message.playerId as string;
      console.error("[ai-planner-worker] planner error:", message.message);
      if (typeof key === "string" && key.length > 0) {
        options.onNoCommand?.(createAutomationNoopDiagnostic(key, "ai-runtime", "planner_error"));
      }
      const resolve = pendingRequests.get(key);
      if (resolve) {
        pendingRequests.delete(key);
        resolve({ command: null });
      }
    }
  });

  worker.on("error", (err) => {
    console.error("[ai-planner-worker] uncaught error:", err);
    // Drain pending requests so ticks don't hang
    for (const [, resolve] of pendingRequests) resolve({ command: null });
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
    // Backfill any tiles that have just entered scope but were never sent to the
    // worker. This happens when territory expands: new frontier neighbors become
    // relevant but were never included in the initial worldView slice and have
    // never triggered a TILE_DELTA_BATCH event (neutral tiles that were always
    // neutral don't generate deltas). Without this, the planner can't see those
    // tiles and returns "no_frontier_targets" noop forever.
    const unseenTileKeys: string[] = [];
    for (const tileKey of relevantTileKeys) {
      if (!plannerTilesByKey.has(tileKey)) unseenTileKeys.push(tileKey);
    }
    if (unseenTileKeys.length > 0) {
      const unseenTiles = options.runtime.exportTilesForKeys(unseenTileKeys);
      const backfillDeltas: SimulationTileDelta[] = [];
      for (const tile of unseenTiles) {
        const tileKey = `${tile.x},${tile.y}`;
        plannerTilesByKey.set(tileKey, tile);
        backfillDeltas.push(toPlannerTileDelta(tile));
      }
      if (backfillDeltas.length > 0) {
        worker.postMessage({ type: "tile_deltas", tileDeltas: backfillDeltas });
      }
    }

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

  const syncPlannerStateImmediately = (playerId: string): void => {
    flushPendingTileDeltas();
    syncPlayersImmediately([playerId]);
  };

  const waitForPreplanOutcome = (playerId: string, commandId: string): Promise<PreplanOutcome> =>
    new Promise((resolve) => {
      const timeoutHandle = setTimeout(() => {
        pendingPreplanOutcomeByCommandId.delete(commandId);
        const pendingCommand = pendingCommandByPlayer.get(playerId);
        if (pendingCommand?.commandId === commandId) pendingCommandByPlayer.delete(playerId);
        resolve("timed_out");
      }, PREPLAN_OUTCOME_TIMEOUT_MS);
      pendingPreplanOutcomeByCommandId.set(commandId, { resolve, timeoutHandle });
    });

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
    if (
      event.eventType === "COMBAT_RESOLVED" &&
      event.attackerWon &&
      event.actionType === "ATTACK" &&
      event.combatResult?.defenderOwnerId &&
      aiPlayerIdSet.has(event.combatResult.defenderOwnerId) &&
      !aiPlayerIdSet.has(event.playerId)
    ) {
      urgentByPlayerId.add(event.combatResult.defenderOwnerId);
    }
    const pending = pendingCommandByPlayer.get(event.playerId);
    const pendingMatches = pending?.commandId === event.commandId;
    const trackedPreplan = trackedPreplanByCommandId.get(event.commandId);
    const trackedPreplanMatches = trackedPreplan?.playerId === event.playerId;
    if (!pendingMatches && !trackedPreplanMatches) return;
    if (event.eventType === "COMMAND_REJECTED" && event.code === "COLLECT_COOLDOWN") {
      backOffCollectVisible(event.playerId, now());
    }
    if (event.eventType === "COLLECT_RESULT") {
      backOffCollectVisible(event.playerId, now());
    }
    if (
      event.eventType === "COMMAND_REJECTED" ||
      event.eventType === "COMBAT_RESOLVED" ||
      event.eventType === "TILE_DELTA_BATCH" ||
      event.eventType === "COLLECT_RESULT" ||
      event.eventType === "TECH_UPDATE" ||
      event.eventType === "DOMAIN_UPDATE"
    ) {
      if (pendingMatches) pendingCommandByPlayer.delete(event.playerId);
      if (trackedPreplanMatches) trackedPreplanByCommandId.delete(event.commandId);
      if (
        pendingMatches &&
        (
          event.eventType === "COMMAND_REJECTED" ||
          event.eventType === "COMBAT_RESOLVED" ||
          event.eventType === "TILE_DELTA_BATCH"
        )
      ) {
        // Release on any terminal pending event:
        //  - COMBAT_RESOLVED for ATTACK/EXPAND
        //  - TILE_DELTA_BATCH for SETTLE/BUILD_*
        //  - COMMAND_REJECTED for any failure
        releaseAiLatchedIntent(intentLatchState, event.playerId);
      }
      if (trackedPreplanMatches && event.eventType !== "COMMAND_REJECTED") {
        syncPlannerStateImmediately(event.playerId);
      }
      resolvePendingPreplanOutcome(
        event.commandId,
        event.eventType === "COMMAND_REJECTED"
          ? (event.code === "COLLECT_COOLDOWN" ? "cooldown_rejected" : "rejected")
          : "applied"
      );
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
    issuedAt: number,
    options?: {
      skipPreplan?: boolean;
    }
  ): Promise<PlannedCommandResult> => {
    return new Promise((resolve) => {
      pendingRequests.set(playerId, resolve);
      worker.postMessage({
        type: "plan",
        playerId,
        clientSeq,
        issuedAt,
        sessionPrefix: "ai-runtime",
        ...(options?.skipPreplan ? { skipPreplan: true } : {})
      });
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
      const cutoff = now() - TRACKED_PREPLAN_RETENTION_MS;
      for (const [playerId, pending] of pendingCommandByPlayer.entries()) {
        if (pending.startedAt <= cutoff) pendingCommandByPlayer.delete(playerId);
      }
      for (const [commandId, trackedPreplan] of trackedPreplanByCommandId.entries()) {
        if (trackedPreplan.trackedAt <= cutoff) trackedPreplanByCommandId.delete(commandId);
      }

      const iterationOrder: number[] = [];
      const seenIndices = new Set<number>();
      const urgentSnapshot = [...urgentByPlayerId];
      for (const urgentPlayerId of urgentSnapshot) {
        if (!aiPlayerIdSet.has(urgentPlayerId)) {
          urgentByPlayerId.delete(urgentPlayerId);
          continue;
        }
        const idx = options.aiPlayerIds.indexOf(urgentPlayerId);
        if (idx >= 0 && !seenIndices.has(idx)) {
          iterationOrder.push(idx);
          seenIndices.add(idx);
        }
      }
      for (let offset = 0; offset < options.aiPlayerIds.length; offset++) {
        const playerIndex = (nextPlayerIndex + offset) % options.aiPlayerIds.length;
        if (!seenIndices.has(playerIndex)) {
          iterationOrder.push(playerIndex);
          seenIndices.add(playerIndex);
        }
      }
      for (const playerIndex of iterationOrder) {
        const playerId = options.aiPlayerIds[playerIndex]!;
        if (pendingCommandByPlayer.has(playerId)) continue;
        const playerTerritoryVersion = territoryVersionForPlayer(playerId);
        const probe = probeAiLatchedIntent(intentLatchState, {
          playerId,
          nowMs: now(),
          territoryVersion: playerTerritoryVersion
        });
        if (probe.status === "waiting") continue;

        let clientSeq = nextClientSeqByPlayer.get(playerId) ?? 1;
        let skipPreplan = false;
        let advancedWithoutPending = false;
        let activePreplanCommandId: string | undefined;
        let wasUrgent = false;

        try {
          for (let pass = 0; pass < 2; pass += 1) {
            const issuedAt = now();
            const plannerStartedAt = now();
            const plan = await requestPlan(playerId, clientSeq, issuedAt, { skipPreplan });
            const plannerDurationMs = Math.max(0, now() - plannerStartedAt);
            options.onDiagnostic?.({
              phase: "request_plan_round_trip",
              durationMs: plannerDurationMs,
              playerId
            });
            const breached = plannerDurationMs > plannerBreachThresholdMs;
            options.onPlannerTick?.({ durationMs: plannerDurationMs, breached });
            if (!plan.command) {
              if (plan.diagnostic) {
                options.onDecision?.(plan.diagnostic);
                options.onNoCommand?.(plan.diagnostic);
              }
              if (advancedWithoutPending) {
                nextClientSeqByPlayer.set(playerId, clientSeq);
                nextPlayerIndex = (playerIndex + 1) % options.aiPlayerIds.length;
                return;
              }
              break;
            }
            if (plan.command.type === "COLLECT_VISIBLE") {
              const blockedUntil = collectVisibleCooldownUntilByPlayer.get(playerId) ?? 0;
              if (blockedUntil > issuedAt) {
                skipPreplan = true;
                continue;
              }
            }
            if (plan.diagnostic) {
              options.onDecision?.(plan.diagnostic);
            }
            if (isAutomationPreplanCommand(plan.command.type)) {
              trackedPreplanByCommandId.set(plan.command.commandId, { playerId, trackedAt: issuedAt });
              pendingCommandByPlayer.set(playerId, { commandId: plan.command.commandId, startedAt: issuedAt });
              activePreplanCommandId = plan.command.commandId;
              const submitStartedAt = now();
              await options.submitCommand(plan.command);
              nextClientSeqByPlayer.set(playerId, clientSeq + 1);
              options.onCommand?.({ playerId, commandType: plan.command.type });
              if (plan.command.type === "COLLECT_VISIBLE") {
                backOffCollectVisible(playerId, issuedAt);
              }
              options.onDiagnostic?.({
                phase: "submit_command",
                durationMs: Math.max(0, now() - submitStartedAt),
                playerId
              });
              const preplanOutcome = await waitForPreplanOutcome(playerId, plan.command.commandId);
              activePreplanCommandId = undefined;
              if (preplanOutcome === "timed_out" || preplanOutcome === "rejected") {
                break;
              }
              clientSeq += 1;
              skipPreplan = true;
              advancedWithoutPending = true;
              continue;
            }
            const targetTileKey = extractTargetTileKey(plan.command);
            const intentKind = intentKindForCommand(plan.command.type);
            if (
              intentKind &&
              targetTileKey &&
              reservationHeldByOtherAi(intentLatchState, playerId, targetTileKey, issuedAt)
            ) {
              // Another AI has committed to this tile; defer to let next tick re-plan.
              break;
            }
            pendingCommandByPlayer.set(playerId, { commandId: plan.command.commandId, startedAt: issuedAt });
            nextClientSeqByPlayer.set(playerId, clientSeq + 1);
            nextPlayerIndex = (playerIndex + 1) % options.aiPlayerIds.length;
            wasUrgent = urgentByPlayerId.delete(playerId);
            if (intentKind) {
              const wakeWindowMs = wakeWindowMsForCommand(plan.command.type);
              if (wakeWindowMs > 0) {
                const wakeAt = issuedAt + wakeWindowMs;
                const originTileKey = extractOriginTileKey(plan.command);
                const actionKey = `${plan.command.type}:${targetTileKey ?? originTileKey ?? plan.command.commandId}`;
                latchAiIntent(intentLatchState, {
                  playerId,
                  actionKey,
                  kind: intentKind,
                  startedAt: issuedAt,
                  wakeAt,
                  territoryVersion: playerTerritoryVersion,
                  ...(targetTileKey ? { targetTileKey } : {}),
                  ...(originTileKey ? { originTileKey } : {})
                });
                if (targetTileKey) {
                  reserveAiTarget(
                    intentLatchState,
                    { playerId, actionKey, tileKey: targetTileKey, createdAt: issuedAt, wakeAt },
                    issuedAt
                  );
                }
              }
            }
            const submitStartedAt = now();
            await options.submitCommand(plan.command);
            options.onCommand?.({ playerId, commandType: plan.command.type });
            options.onDiagnostic?.({
              phase: "submit_command",
              durationMs: Math.max(0, now() - submitStartedAt),
              playerId
            });
            return;
          }
        } catch {
          pendingCommandByPlayer.delete(playerId);
          if (activePreplanCommandId) trackedPreplanByCommandId.delete(activePreplanCommandId);
          releaseAiLatchedIntent(intentLatchState, playerId);
          // Restore urgency on failed submit so the defender doesn't lose its
          // priority slot to a transient command-store error.
          if (wasUrgent) urgentByPlayerId.add(playerId);
          // swallow — will retry on next tick
        }
        if (advancedWithoutPending) {
          nextClientSeqByPlayer.set(playerId, clientSeq);
          nextPlayerIndex = (playerIndex + 1) % options.aiPlayerIds.length;
          urgentByPlayerId.delete(playerId);
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
      for (const pending of pendingPreplanOutcomeByCommandId.values()) clearTimeout(pending.timeoutHandle);
      pendingPreplanOutcomeByCommandId.clear();
      trackedPreplanByCommandId.clear();
      flushPendingTileDeltas();
      stopListening();
      worker.postMessage({ type: "shutdown" });
      void worker.terminate();
    }
  };
};
