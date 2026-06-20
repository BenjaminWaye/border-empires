import { Worker } from "node:worker_threads";
import type { CommandEnvelope, SimulationEvent } from "@border-empires/sim-protocol";
import type { SimulationRuntime } from "../runtime/runtime.js";
import type { AutomationPlannerDiagnostic } from "./automation-command-planner.js";
import { createAutomationNoopDiagnostic } from "./automation-command-planner.js";
import { createPlannerRelevantTileKeyIndex, DEFAULT_PLANNER_SYNC_RADIUS } from "./planner-sync-scope.js";
import type { PlannerPlayerView, PlannerTileView } from "./planner-world-view.js";
import { resolveWorkerEntryUrl } from "../resolve-worker-entry/resolve-worker-entry.js";
import type { WorkerMemoryMetrics } from "../snapshot-stringifier/snapshot-stringifier.js";

export type { WorkerMemoryMetrics } from "../snapshot-stringifier/snapshot-stringifier.js";
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
import {
  ATTACK_STALEMATE_WINDOW_MS,
  createAttackStalemateTracker
} from "./ai-attack-stalemate.js";
import {
  clearDevelopmentReservation,
  reserveDevelopmentSlot,
  reservedDevelopmentSlotCount,
  type DevelopmentSlotReservation
} from "./ai-development-slot-reservations.js";

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
  minCommandIntervalMs?: number;
  playerSyncIntervalMs?: number;
  periodicPlayerSyncBatchSize?: number;
  workerScriptPath?: string;
  /** Injectable factory for tests — defaults to `new Worker(path, opts)`. */
  workerFactory?: (path: string | URL, opts: { resourceLimits: { maxOldGenerationSizeMb: number } }) => Worker;
  maxOldGenerationSizeMb?: number;
  plannerBreachThresholdMs?: number;
  onPlannerTick?: (sample: { durationMs: number; breached: boolean }) => void;
  onTick?: (sample: { durationMs: number }) => void;
  onThrottle?: (reason: "adaptive" | "plan_timeout") => void;
  onIntervalChange?: (intervalMs: number) => void;
  // Fires when a single ai tick exceeds slowTickThresholdMs. The histograms
  // capture per-call stats but the rare 5s ai tick p99 hasn't been explained
  // by any single phase. This callback captures the tick-level context so we
  // can see which combination of work made up an outlier tick.
  onSlowTick?: (sample: {
    durationMs: number;
    planRequestCount: number;
    submitCount: number;
    preplanWaitMs: number;
    queueDepthAiAtStart: number;
    pendingPlayerSyncAtStart: boolean;
    pendingTileDeltasAtStart: number;
    iterationOrderLength: number;
    lastPlayerId?: string;
    lastCommandType?: string;
  }) => void;
  onCommand?: (sample: { playerId: string; commandType: CommandEnvelope["type"] }) => void;
  onRejectedCommand?: (sample: { playerId: string; commandType: CommandEnvelope["type"] }) => void;
  onDecision?: (diagnostic: AutomationPlannerDiagnostic) => void;
  onNoCommand?: (diagnostic: AutomationPlannerDiagnostic) => void;
  /** Diagnostic experiment flags — staging investigation only. */
  experimentDryRun?: boolean;
  experimentMaxCommandsPerTick?: number;
  experimentDisableExpand?: boolean;
  experimentDisableBuild?: boolean;
  onExperimentFilter?: (reason: "dry_run" | "command_cap" | "expand_disabled" | "build_disabled") => void;
  onDiagnostic?: (sample: {
    phase:
      | "sync_players_export"
      | "sync_players_relevance"
      | "sync_players_replace_players"
      | "sync_players_incremental_delta"
      | "sync_players_relevant_set_alloc"
      | "sync_players_unseen_scan"
      | "sync_players_export_unseen_tiles"
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
    relevantKeyCount?: number;
    unseenCount?: number;
  }) => void;
};

const resolveWorkerScript = (given?: string): string | URL =>
  given ?? resolveWorkerEntryUrl("./ai-planner-worker.js", import.meta.url);

const hasHumanInteractiveBacklog = (queueDepths: QueueDepths): boolean =>
  queueDepths.human_interactive > 0;
// Tick duration that triggers the onSlowTick context emit. Steady-state ticks
// are p50=2ms / p95=5ms; p99=5000ms+ is a rare outlier we want to capture.
// 1s threshold catches the outliers without flooding logs with normal ticks.
const AI_TICK_SLOW_THRESHOLD_MS = 1_000;
const MIN_TICK_MS = 200;
const MAX_TICK_MS = 3_200; // 16x backoff ceiling
const ADAPTIVE_BACKOFF_THRESHOLD_MS = 50;
const ADAPTIVE_RECOVER_THRESHOLD_MS = 25;
const isAutomationPreplanCommand = (type: CommandEnvelope["type"]): boolean =>
  type === "CHOOSE_TECH" || type === "CHOOSE_DOMAIN";
const PREPLAN_OUTCOME_TIMEOUT_MS = 5_000;
// If the planner worker doesn't reply within this window the pending request is
// resolved as { command: null } so a dropped reply can never wedge the tick loop.
const PLAN_REQUEST_TIMEOUT_MS = 10_000;
const TRACKED_PREPLAN_RETENTION_MS = 90_000;
type PreplanOutcome = "applied" | "rejected" | "timed_out";
type TrackedPreplanCommand = { playerId: string; trackedAt: number };
type PlannedCommandResult = {
  command: CommandEnvelope | null;
  diagnostic?: AutomationPlannerDiagnostic;
};

const isExpandAction = (type: CommandEnvelope["type"]): boolean => type === "EXPAND" || type === "ATTACK";
const isBuildAction = (type: CommandEnvelope["type"]): boolean =>
  type === "SETTLE" ||
  type === "BUILD_FORT" ||
  type === "BUILD_OBSERVATORY" ||
  type === "BUILD_SIEGE_OUTPOST" ||
  type === "BUILD_ECONOMIC_STRUCTURE" ||
  type === "CANCEL_FORT_BUILD" ||
  type === "CANCEL_STRUCTURE_BUILD" ||
  type === "CANCEL_SIEGE_OUTPOST_BUILD";

export const createWorkerAiCommandProducer = (options: WorkerAiCommandProducerOptions) => {
  const now = options.now ?? (() => Date.now());
  const initialTickMs = Math.max(25, options.tickIntervalMs ?? 250);
  const minCommandIntervalMs = Math.max(0, options.minCommandIntervalMs ?? 0);
  let nextTickDelayMs = initialTickMs;
  const playerSyncIntervalMs = Math.max(25, options.playerSyncIntervalMs ?? 5_000);
  const periodicPlayerSyncBatchSize = Math.max(1, options.periodicPlayerSyncBatchSize ?? 1);
  const playerSyncDebounceMs = 500;
  const tileDeltaSyncDebounceMs = Math.max(20, Math.min(150, Math.floor(initialTickMs / 2)));
  const shouldRun = options.shouldRun ?? (() => true);
  const plannerBreachThresholdMs = Math.max(1, options.plannerBreachThresholdMs ?? 50);
  const aiPlayerIdSet = new Set(options.aiPlayerIds);
  const plannerPlayersById = new Map<string, PlannerPlayerView>();
  const plannerTilesByKey = new Map<string, PlannerTileView>();
  // Live reference to the index's internal Set — no copy needed.
  // replacePlayers mutates the underlying Set in place, so this stays current.
  let relevantTileKeys: ReadonlySet<string> = new Set<string>();
  let nextPeriodicPlayerSyncIndex = 0;

  const nextClientSeqByPlayer = new Map<string, number>(
    options.aiPlayerIds.map((id) => [id, options.startingClientSeqByPlayer?.[id] ?? 1])
  );
  const lastCommandAtByPlayer = new Map<string, number>();
  const pendingCommandByPlayer = new Map<string, { commandId: string; commandType: CommandEnvelope["type"]; startedAt: number }>();
  const pendingPreplanOutcomeByCommandId = new Map<string, { resolve: (outcome: PreplanOutcome) => void; timeoutHandle: ReturnType<typeof setTimeout> }>();
  const trackedPreplanByCommandId = new Map<string, TrackedPreplanCommand>();
  const developmentReservationsByPlayer = new Map<string, DevelopmentSlotReservation[]>();
  // Tracks the last time a HEARTBEAT collect fired for each AI (NOT organic
  // collects). The preplan uses this to gate the 60s heartbeat — if we
  // shared this with organic collects (collect_for_unaffordable_progression,
  // collect_for_active_lock, collect_for_economic_recovery), then any AI
  // already firing organic collects every 20–40s would keep resetting the
  const urgentByPlayerId = new Set<string>();
  const intentLatchState = createAiIntentLatchState();
  const attackStalemate = createAttackStalemateTracker();
  // Latching is always on for the worker producer — runtime tracks
  // tileCollectionVersion per player and we read it from the synced
  // plannerPlayersById map (already kept fresh via player_sync messages).
  const territoryVersionForPlayer = (playerId: string): number =>
    plannerPlayersById.get(playerId)?.tileCollectionVersion ?? 0;

  let tickInFlight = false;
  let nextPlayerIndex = 0;
  let humanBacklogWasNonEmpty = false;

  const resolvePendingPreplanOutcome = (commandId: string, outcome: PreplanOutcome): void => {
    const pending = pendingPreplanOutcomeByCommandId.get(commandId);
    if (!pending) return;
    clearTimeout(pending.timeoutHandle);
    pendingPreplanOutcomeByCommandId.delete(commandId);
    pending.resolve(outcome);
  };

  const AI_WORKER_MAX_OLD_GEN_MB_DEFAULT = 192;
  const maxOldGenerationSizeMb = Math.max(64, options.maxOldGenerationSizeMb ?? AI_WORKER_MAX_OLD_GEN_MB_DEFAULT);
  const workerScriptPath = resolveWorkerScript(options.workerScriptPath);

  const pendingRequests = new Map<string, (result: PlannedCommandResult) => void>();
  let closed = false;
  const workerMetrics: WorkerMemoryMetrics = { respawnCount: 0 };

  let worker!: Worker;
  let relevantTileKeyIndex!: ReturnType<typeof createPlannerRelevantTileKeyIndex>;

  const spawnWorker = (): void => {
    const factory = options.workerFactory ?? ((path, opts) => new Worker(path, opts));
    worker = factory(workerScriptPath, {
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

    worker.on("exit", (code) => {
      workerMetrics.lastExitCode = code;
      workerMetrics.lastExitAt = Date.now();
      if (closed) return;
      if (code !== 0) {
        console.error(
          `[ai-planner-worker] exited code=${code} — respawning (likely heap cap hit at ${maxOldGenerationSizeMb}MB)`
        );
      }
      for (const [, resolve] of pendingRequests) resolve({ command: null });
      pendingRequests.clear();
      // The new worker thread starts unpaused. Reset our local backlog-tracking
      // flag so the next tick re-issues pause/resume against the fresh worker;
      // otherwise we'd silently keep planning while the main thread thinks the
      // worker is paused (or vice-versa).
      humanBacklogWasNonEmpty = false;
      workerMetrics.respawnCount += 1;
      scheduleRespawn(0);
    });
  };

  // Respawn with retry/backoff. If re-init throws (e.g. exportPlannerWorldView
  // blows up under main-thread memory pressure), retry on a timer instead of
  // letting the unhandled throw propagate from the exit handler and crash the
  // whole process. Capped retry delay so we don't busy-loop.
  const RESPAWN_RETRY_DELAY_MS = 5_000;
  const scheduleRespawn = (delayMs: number): void => {
    if (closed) return;
    setTimeout(() => {
      if (closed) return;
      try {
        initializeWorkerFromRuntime();
      } catch (err) {
        console.error(
          `[ai-planner-worker] respawn init failed; retrying in ${RESPAWN_RETRY_DELAY_MS}ms:`,
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
    const worldView = options.runtime.exportPlannerWorldView(options.aiPlayerIds);
    for (const player of worldView.players) plannerPlayersById.set(player.id, player);
    for (const tile of worldView.tiles) {
      plannerTilesByKey.set(`${tile.x},${tile.y}`, tile);
    }
    relevantTileKeyIndex = createPlannerRelevantTileKeyIndex(worldView, DEFAULT_PLANNER_SYNC_RADIUS, {
      onPlayerIncrementalDelta: (playerId, dirtyTileCount) => {
        options.onDiagnostic?.({
          phase: "sync_players_incremental_delta",
          durationMs: dirtyTileCount, // dirty-tile count, not wall-clock time
          playerId
        });
      }
    });
    relevantTileKeys = relevantTileKeyIndex.keys();
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
    const startedAt = now();
    const exportStartedAt = now();
    const players = options.runtime.exportPlannerPlayerViews(playerIds);
    options.onDiagnostic?.({
      phase: "sync_players_export",
      durationMs: Math.max(0, now() - exportStartedAt),
      playerCount: players.length
    });
    for (const player of players) plannerPlayersById.set(player.id, player);
    const replacePlayersStartedAt = now();
    // replacePlayers returns only the keys that are newly relevant to the
    // rebuilt players. We scope the unseen-tile backfill scan to these keys
    // instead of scanning all relevantTileKeys (was O(global_100k), now
    // O(newly_relevant) ≈ 0 at steady state, small on territory expansion).
    const newlyRelevantKeys = relevantTileKeyIndex.replacePlayers(players, plannerTilesByKey);
    const replacePlayersDurationMs = Math.max(0, now() - replacePlayersStartedAt);
    // relevantTileKeys is a live reference to the index's internal Set —
    // no copy needed; it reflects the update replacePlayers just made.
    const relevantKeyCount = relevantTileKeys.size;
    options.onDiagnostic?.({
      phase: "sync_players_replace_players",
      durationMs: replacePlayersDurationMs,
      playerCount: players.length,
      relevantKeyCount
    });
    // relevant_set_alloc is now 0ms (no copy); keep the diagnostic at 0 for
    // dashboards that already watch it.
    options.onDiagnostic?.({
      phase: "sync_players_relevant_set_alloc",
      durationMs: 0,
      playerCount: players.length,
      relevantKeyCount
    });
    // Legacy aggregate: replace + alloc (alloc is now 0).
    options.onDiagnostic?.({
      phase: "sync_players_relevance",
      durationMs: replacePlayersDurationMs,
      playerCount: players.length,
      relevantKeyCount
    });
    // Backfill tiles that just entered scope but were never sent to the worker.
    // Only scan keys newly relevant to the rebuilt players — neutral tiles at
    // the frontier edge that have never generated a TILE_DELTA_BATCH event.
    // In steady state (no territory change) newlyRelevantKeys is empty → 0ms.
    const unseenScanStartedAt = now();
    const unseenTileKeys: string[] = [];
    for (const tileKey of newlyRelevantKeys) {
      if (!plannerTilesByKey.has(tileKey)) unseenTileKeys.push(tileKey);
    }
    const unseenScanDurationMs = Math.max(0, now() - unseenScanStartedAt);
    options.onDiagnostic?.({
      phase: "sync_players_unseen_scan",
      durationMs: unseenScanDurationMs,
      playerCount: players.length,
      relevantKeyCount,
      unseenCount: unseenTileKeys.length
    });
    if (unseenTileKeys.length > 0) {
      const exportUnseenStartedAt = now();
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
      options.onDiagnostic?.({
        phase: "sync_players_export_unseen_tiles",
        durationMs: Math.max(0, now() - exportUnseenStartedAt),
        playerCount: players.length,
        unseenCount: unseenTileKeys.length
      });
    }

    const postStartedAt = now();
    // When topology is unchanged, omit the large tile-key arrays from the
    // postMessage payload. The worker merges with its cached player state,
    // saving ~140KB of structured-clone per sync → reduces sync_players_post
    // from 80ms p99 to <5ms for the common (no ownership-change) case.
    const playersForPost = players.map((p) => {
      if ((p.topologyDirtyTileKeys?.length ?? 0) === 0) {
        const { territoryTileKeys: _t, frontierTileKeys: _f, hotFrontierTileKeys: _h,
          strategicFrontierTileKeys: _s, buildCandidateTileKeys: _b,
          pendingSettlementTileKeys: _p, ...compact } = p;
        return compact;
      }
      return p;
    });
    worker.postMessage({
      type: "sync_players",
      players: playersForPost
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
    if (event.eventType === "COMMAND_REJECTED") {
      clearDevelopmentReservation(developmentReservationsByPlayer, event.playerId, event.commandId);
    }
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
      event.actionType === "ATTACK"
    ) {
      // Tile actually flipped — any AI's stalemate state for this target is
      // stale (either the target broke open OR it's a different owner's
      // problem now). TILE_DELTA_BATCH is an unsafe signal for this because
      // runtime.ts:4610 puts `ownerId` on every delta even on non-transition
      // updates (yield ticks, building placements), which would defeat the
      // stalemate counter by resetting it constantly.
      attackStalemate.clearTarget(`${event.targetX},${event.targetY}`);
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
    if (
      event.eventType === "COMMAND_REJECTED" ||
      event.eventType === "COMBAT_RESOLVED" ||
      event.eventType === "TILE_DELTA_BATCH" ||
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
      if (pendingMatches && event.eventType === "COMMAND_REJECTED" && pending) {
        options.onRejectedCommand?.({ playerId: event.playerId, commandType: pending.commandType });
      }
      if (trackedPreplanMatches && event.eventType !== "COMMAND_REJECTED") {
        syncPlannerStateImmediately(event.playerId);
      }
      resolvePendingPreplanOutcome(
        event.commandId,
        event.eventType === "COMMAND_REJECTED" ? "rejected" : "applied"
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
    requestOptions?: {
      skipPreplan?: boolean;
      reservedDevelopmentSlots?: number;
    }
  ): Promise<PlannedCommandResult> => {
    return new Promise((resolve) => {
      // Guard: if a prior request for this player is still pending (shouldn't
      // happen in normal flow but defensive), resolve it as null before overwriting.
      const existingResolve = pendingRequests.get(playerId);
      if (existingResolve) {
        pendingRequests.delete(playerId);
        existingResolve({ command: null });
      }
      pendingRequests.set(playerId, resolve);

      // Safety net: if the worker reply is ever lost (worker alive but message
      // dropped), resolve after PLAN_REQUEST_TIMEOUT_MS so the tick finally-
      // block runs and the loop reschedules. Without this, a single lost reply
      // would wedge the chain indefinitely.
      const timeoutHandle = setTimeout(() => {
        const stillPending = pendingRequests.get(playerId);
        if (stillPending === resolve) {
          pendingRequests.delete(playerId);
          options.onThrottle?.("plan_timeout");
          console.warn(`[ai-planner-worker] plan request timed out for player=${playerId} after ${PLAN_REQUEST_TIMEOUT_MS}ms`);
          resolve({ command: null });
        }
      }, PLAN_REQUEST_TIMEOUT_MS);
      // Don't let the timeout keep the process alive if everything else is done.
      if (typeof timeoutHandle === "object" && "unref" in timeoutHandle) {
        (timeoutHandle as { unref(): void }).unref();
      }

      const stalemateTargets = attackStalemate.stalemateTargetsForPlayer(playerId);
      worker.postMessage({
        type: "plan",
        playerId,
        clientSeq,
        issuedAt,
        sessionPrefix: "ai-runtime",
        ...(requestOptions?.skipPreplan ? { skipPreplan: true } : {}),
        ...(requestOptions?.reservedDevelopmentSlots ? { reservedDevelopmentSlots: requestOptions.reservedDevelopmentSlots } : {}),
        ...(stalemateTargets.length > 0 ? { attackStalemateTargetTileKeys: stalemateTargets } : {})
      });
    });
  };

  const tick = async (): Promise<void> => {
    // Reentrancy guard: the in-flight tick owns the reschedule via its own
    // finally block (guaranteed by the outer try below), so returning here
    // is safe — we will NOT double-schedule.
    if (tickInFlight) return;
    if (closed) return;

    // Every path below this point (throttle skip, backlog skip, real work)
    // reaches the outer finally and calls scheduleNextTick(). This is the
    // critical invariant: no early-return before the try means the
    // setTimeout chain can never die from a transient guard.
    let didWork = false;
    let tickStartedAt = 0;
    let planRequestCount = 0;
    let submitCount = 0;
    let preplanWaitMs = 0;
    let lastPlayerId: string | undefined;
    let lastCommandType: string | undefined;
    let queueDepthAiAtStart = 0;
    let pendingPlayerSyncAtStart = false;
    let pendingTileDeltasAtStart = 0;
    let iterationOrderLength = 0;

    try {
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

      // --- Work phase begins. Set tickInFlight so the reentrancy guard above
      // knows a real tick is active (and won't double-schedule).
      didWork = true;
      tickInFlight = true;
      tickStartedAt = now();
      // Slow-tick capture: most ticks return in <5ms but rare ticks hit 5s+.
      // Per-call histograms show every phase under 200ms, so the outlier must
      // be a combination — capture context per tick and emit when threshold
      // is crossed.
      queueDepthAiAtStart = queueDepths.ai;
      pendingPlayerSyncAtStart = pendingPlayerSyncIds.size > 0;
      pendingTileDeltasAtStart = pendingTileDeltasByKey.size;

      if (options.aiPlayerIds.length === 0) return;

      // Clear timed-out pending commands (90s timeout)
      const cutoff = now() - TRACKED_PREPLAN_RETENTION_MS;
      for (const [playerId, pending] of pendingCommandByPlayer.entries()) {
        if (pending.startedAt <= cutoff) pendingCommandByPlayer.delete(playerId);
      }
      for (const [commandId, trackedPreplan] of trackedPreplanByCommandId.entries()) {
        if (trackedPreplan.trackedAt <= cutoff) trackedPreplanByCommandId.delete(commandId);
      }
      attackStalemate.expireOlderThan(now() - ATTACK_STALEMATE_WINDOW_MS);

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
      iterationOrderLength = iterationOrder.length;
      for (const playerIndex of iterationOrder) {
        const playerId = options.aiPlayerIds[playerIndex]!;
        if (pendingCommandByPlayer.has(playerId)) continue;
        const lastCommandAt = lastCommandAtByPlayer.get(playerId);
        if (
          minCommandIntervalMs > 0 &&
          lastCommandAt !== undefined &&
          now() - lastCommandAt < minCommandIntervalMs
        ) {
          continue;
        }
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
            planRequestCount += 1;
            lastPlayerId = playerId;
            const reservedDevelopmentSlots = reservedDevelopmentSlotCount(developmentReservationsByPlayer, playerId, issuedAt);
            const plan = await requestPlan(playerId, clientSeq, issuedAt, {
              skipPreplan,
              ...(reservedDevelopmentSlots > 0 ? { reservedDevelopmentSlots } : {})
            });
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
              nextClientSeqByPlayer.set(playerId, clientSeq);
              nextPlayerIndex = (playerIndex + 1) % options.aiPlayerIds.length;
              urgentByPlayerId.delete(playerId);
              break;
            }
            if (plan.diagnostic) {
              options.onDecision?.(plan.diagnostic);
            }
            if (isAutomationPreplanCommand(plan.command.type)) {
              trackedPreplanByCommandId.set(plan.command.commandId, { playerId, trackedAt: issuedAt });
              pendingCommandByPlayer.set(playerId, { commandId: plan.command.commandId, commandType: plan.command.type, startedAt: issuedAt });
              activePreplanCommandId = plan.command.commandId;
              // Register the preplan-outcome resolver BEFORE submitting so the
              // runtime event listener can signal the outcome without a race.
              const maxCmds = options.experimentMaxCommandsPerTick ?? 0;
              if (maxCmds > 0 && submitCount >= maxCmds) {
                options.onExperimentFilter?.("command_cap");
                break;
              }
              if (options.experimentDryRun) {
                // Skip the actual submit AND the preplan-outcome wait (no event will fire to resolve it).
                options.onExperimentFilter?.("dry_run");
                break;
              }
              const preplanWaitStartedAt = now();
              const outcomePromise = waitForPreplanOutcome(playerId, plan.command.commandId);
              const submitStartedAt = now();
              submitCount += 1;
              lastCommandType = plan.command.type;
              await options.submitCommand(plan.command);
              lastCommandAtByPlayer.set(playerId, issuedAt);
              nextClientSeqByPlayer.set(playerId, clientSeq + 1);
              options.onCommand?.({ playerId, commandType: plan.command.type });
              options.onDiagnostic?.({
                phase: "submit_command",
                durationMs: Math.max(0, now() - submitStartedAt),
                playerId
              });
              const preplanOutcome = await outcomePromise;
              preplanWaitMs += Math.max(0, now() - preplanWaitStartedAt);
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
            pendingCommandByPlayer.set(playerId, { commandId: plan.command.commandId, commandType: plan.command.type, startedAt: issuedAt });
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
            const cmdType = plan.command.type;
            if (options.experimentDisableExpand && isExpandAction(cmdType)) {
              options.onExperimentFilter?.("expand_disabled");
              break;
            }
            if (options.experimentDisableBuild && isBuildAction(cmdType)) {
              options.onExperimentFilter?.("build_disabled");
              break;
            }
            const maxCmdsRegular = options.experimentMaxCommandsPerTick ?? 0;
            if (maxCmdsRegular > 0 && submitCount >= maxCmdsRegular) {
              options.onExperimentFilter?.("command_cap");
              break;
            }
            const submitStartedAt = now();
            submitCount += 1;
            lastCommandType = cmdType;
            if (options.experimentDryRun) {
              options.onExperimentFilter?.("dry_run");
            } else {
              await options.submitCommand(plan.command);
              reserveDevelopmentSlot(developmentReservationsByPlayer, plan.command, issuedAt);
            }
            lastCommandAtByPlayer.set(playerId, issuedAt);
            options.onCommand?.({ playerId, commandType: cmdType });
            if (cmdType === "ATTACK" && targetTileKey) {
              attackStalemate.recordAttempt(playerId, targetTileKey, issuedAt);
            }
            options.onDiagnostic?.({
              phase: "submit_command",
              durationMs: Math.max(0, now() - submitStartedAt),
              playerId
            });
            return;
          }
        } catch {
          pendingCommandByPlayer.delete(playerId);
          if (activePreplanCommandId) {
            trackedPreplanByCommandId.delete(activePreplanCommandId);
            // The outcome resolver is now registered BEFORE submitCommand, so
            // a thrown submit leaves a pending entry with a 5s timer attached.
            // Resolve it immediately as "rejected" to clear the entry + timer
            // (otherwise the still-awaited outcomePromise blocks the pass
            // until the 5s timeout, which we just diagnosed as the AI tick
            // p99 wall).
            resolvePendingPreplanOutcome(activePreplanCommandId, "rejected");
          }
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
      if (didWork) {
        const tickDurationMs = Math.max(0, now() - tickStartedAt);
        options.onTick?.({ durationMs: tickDurationMs });
        if (options.onSlowTick && tickDurationMs >= AI_TICK_SLOW_THRESHOLD_MS) {
          options.onSlowTick({
            durationMs: tickDurationMs,
            planRequestCount,
            submitCount,
            preplanWaitMs,
            queueDepthAiAtStart,
            pendingPlayerSyncAtStart,
            pendingTileDeltasAtStart,
            iterationOrderLength,
            ...(lastPlayerId ? { lastPlayerId } : {}),
            ...(lastCommandType ? { lastCommandType } : {})
          });
        }
        tickInFlight = false;
        // Adaptive tick interval (Layer 1): back off when AI work is heavy,
        // recover when it's light. Never drop below MIN or above MAX.
        const prevDelayMs = nextTickDelayMs;
        if (tickDurationMs > ADAPTIVE_BACKOFF_THRESHOLD_MS) {
          nextTickDelayMs = Math.min(MAX_TICK_MS, nextTickDelayMs * 2);
          options.onThrottle?.("adaptive");
        } else if (tickDurationMs < ADAPTIVE_RECOVER_THRESHOLD_MS && nextTickDelayMs > MIN_TICK_MS) {
          nextTickDelayMs = Math.max(MIN_TICK_MS, Math.floor(nextTickDelayMs / 2));
        }
        if (nextTickDelayMs !== prevDelayMs) {
          options.onIntervalChange?.(nextTickDelayMs);
        }
      }
      // Always reschedule the next tick (unless closed). This outer finally
      // runs on every exit — throttle skips, backlog skips, and real work.
      // The reentrancy guard (tickInFlight) early-returns before this try, so
      // there is exactly one outstanding scheduleNextTick per live tick cycle.
      scheduleNextTick();
    }
  };

  let nextTickTimeout: ReturnType<typeof setTimeout> | undefined;

  const scheduleNextTick = (): void => {
    if (closed) return;
    nextTickTimeout = setTimeout(() => {
      void tick();
    }, nextTickDelayMs);
  };

  scheduleNextTick();

  return {
    tick,
    getWorkerMetrics: (): WorkerMemoryMetrics => ({ ...workerMetrics }),
    close(): void {
      closed = true;
      if (nextTickTimeout) clearTimeout(nextTickTimeout);
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
