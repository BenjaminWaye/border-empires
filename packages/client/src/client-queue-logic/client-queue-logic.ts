import { EXPAND_MANPOWER_COST, estimatedAttackManpowerLoss, FRONTIER_CLAIM_COST, requiredMusterForTarget, SETTLE_COST, SETTLE_MANPOWER_COST, WORLD_HEIGHT, WORLD_WIDTH, wrapX, wrapY } from "@border-empires/shared";
import { MUSTER_AUTO_FLAG_THRESHOLD_TILES, MUSTER_TRANSIT_MS_PER_TILE, canAffordCost, frontierClaimDurationMsForTile, settleDurationMsForTile } from "../client-constants.js";
import { attackSyncLog, debugTileLog, debugTileTimeline, tileSyncDebugEnabled, tileMatchesDebugKey } from "../client-debug/client-debug.js";
import {
  devQueueCancelWirePayload,
  devQueueMoveToFrontWirePayload,
  persistDevelopmentQueueForPlayer,
  persistSkippedAutoSettlementTileKeysForPlayer,
  pruneExpiredAutoSettlementQueueVisibleHolds,
  queuedSettlementOrderForTile
} from "../client-development-queue/client-development-queue.js";
import { createNextFrontierCommandIdentity } from "../client-frontier-command/client-frontier-command.js";
import { dropStuckPendingMusterAttack, findClosestMuster, hasFundedMusterWithinRange, isDockCrossingBetween } from "../client-muster-attack-gate/client-muster-attack-gate.js";
import { showVisibleActionWarning, type VisibleActionWarningDeps } from "../client-visible-action-warning.js"; import { pauseWaypointForManpowerIfNeeded } from "./client-waypoint-manpower-pause.js";
import { cancelWaypointOnBarrierBlock, planWaypoint } from "../client-waypoint-planner/client-waypoint-planner.js";
import { localReachIsInReach } from "../client-reach-overlay/client-reach-overlay.js";
import {
  persistWaypointQueueForPlayer,
  syncWaypointQueueToServer,
  waypointCancelWirePayload,
  waypointEnqueueWirePayload
} from "../client-waypoint-planner/client-waypoint-persistence.js";
import type { RealtimeSocket } from "../client-socket-types.js";
import type { ClientState } from "../client-state/client-state.js";
import type { OptimisticStructureKind, Tile, TileCombatBreakdown, TileTimedProgress } from "../client-types.js";

export type DevelopmentSlotSummary = {
  busy: number;
  limit: number;
  available: number;
};

type QueuedDevelopmentAction = ClientState["developmentQueue"][number];
type QueuedBuildPayload = Extract<QueuedDevelopmentAction, { kind: "BUILD" }>["payload"];
type GatewayBuildWirePayload =
  | { type: "BUILD_FORT"; x: number; y: number }
  | { type: "BUILD_OBSERVATORY"; x: number; y: number }
  | { type: "BUILD_SIEGE_OUTPOST"; x: number; y: number }
  | { type: "BUILD_ECONOMIC_STRUCTURE"; x: number; y: number; structureType: string }
  | { type: "REMOVE_STRUCTURE"; x: number; y: number };

const SETTLEMENT_CONFIRM_REFRESH_MS = 4_000;
const SETTLEMENT_CONFIRM_REFRESH_COOLDOWN_MS = 4_000;

const numericEffect = (effects: Record<string, unknown> | undefined, key: string): number => {
  const raw = effects?.[key];
  return typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? raw : 1;
};

export const gatewayBuildWirePayload = (payload: QueuedBuildPayload): GatewayBuildWirePayload => {
  if (payload.type !== "BUILD_STRUCTURE") return payload;
  if (payload.structureType === "FORT") return { type: "BUILD_FORT", x: payload.x, y: payload.y };
  if (payload.structureType === "OBSERVATORY") return { type: "BUILD_OBSERVATORY", x: payload.x, y: payload.y };
  if (payload.structureType === "SIEGE_OUTPOST") return { type: "BUILD_SIEGE_OUTPOST", x: payload.x, y: payload.y };
  return { type: "BUILD_ECONOMIC_STRUCTURE", x: payload.x, y: payload.y, structureType: payload.structureType };
};

export const settlementSpeedMultiplierForState = (
  state: Pick<ClientState, "techIds" | "techCatalog" | "domainIds" | "domainCatalog">
): number => {
  let multiplier = 1;
  for (const techId of state.techIds) {
    const tech = state.techCatalog.find((entry) => entry.id === techId);
    multiplier *= numericEffect(tech?.effects, "settlementSpeedMult");
  }
  for (const domainId of state.domainIds) {
    const domain = state.domainCatalog.find((entry) => entry.id === domainId);
    multiplier *= numericEffect(domain?.effects, "settlementSpeedMult");
  }
  return multiplier;
};

export const settleDurationMsForState = (
  state: Pick<ClientState, "techIds" | "techCatalog" | "domainIds" | "domainCatalog">,
  tile: { x: number; y: number }
): number => Math.max(1, Math.round(settleDurationMsForTile(tile.x, tile.y) / settlementSpeedMultiplierForState(state)));
const SETTLEMENT_CONFIRM_STALE_MS = 15_000;
const ATTACK_PREVIEW_CACHE_TTL_MS = 5_000;
const ATTACK_PREVIEW_PENDING_TIMEOUT_MS = 4_000;

type AttackPreview = NonNullable<ClientState["attackPreview"]>;

const attackPreviewKey = (fromKey: string, toKey: string): string => `${fromKey}->${toKey}`;

const nextAttackPreviewRequestId = (state: ClientState): string => {
  state.attackPreviewRequestSeq += 1;
  return `attack-preview-${state.attackPreviewRequestSeq}`;
};

export const resetAttackPreviewState = (state: ClientState): void => {
  state.attackPreview = undefined;
  state.attackPreviewPendingKey = "";
  state.attackPreviewPendingRequestId = "";
  state.attackPreviewPendingStartedAt = 0;
  state.attackPreviewLatestRequestIdByKey.clear();
};

const freshCachedAttackPreview = (state: ClientState, previewKey: string): AttackPreview | undefined => {
  const preview = state.attackPreviewCacheByKey.get(previewKey);
  if (!preview) return undefined;
  if (Date.now() - preview.receivedAt > ATTACK_PREVIEW_CACHE_TTL_MS) {
    state.attackPreviewCacheByKey.delete(previewKey);
    return undefined;
  }
  return preview;
};

const requestAttackPreview = (
  state: ClientState,
  args: {
    fromKey: string;
    toKey: string;
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
  },
  deps: { ws: RealtimeSocket; onPreviewTimeout?: () => void },
  options: { useCache?: boolean; throttle?: boolean } = {}
): void => {
  const useCache = options.useCache ?? true;
  const throttle = options.throttle ?? true;
  const previewKey = attackPreviewKey(args.fromKey, args.toKey);
  if (useCache) {
    const cached = freshCachedAttackPreview(state, previewKey);
    if (cached) {
      state.attackPreview = cached;
      state.attackPreviewPendingKey = "";
      state.attackPreviewPendingRequestId = "";
      state.attackPreviewPendingStartedAt = 0;
      state.attackPreviewLatestRequestIdByKey.delete(previewKey);
      return;
    }
  }
  if (useCache && state.attackPreviewPendingKey === previewKey) return;
  const nowMs = Date.now();
  if (throttle && nowMs - state.lastAttackPreviewAt < 120) return;
  state.lastAttackPreviewAt = nowMs;
  state.attackPreviewPendingKey = previewKey;
  state.attackPreviewPendingStartedAt = nowMs;
  const requestId = nextAttackPreviewRequestId(state);
  state.attackPreviewPendingRequestId = requestId;
  state.attackPreviewLatestRequestIdByKey.set(previewKey, requestId);
  if (!useCache) {
    state.attackPreviewCacheByKey.delete(previewKey);
    if (state.attackPreview?.fromKey === args.fromKey && state.attackPreview.toKey === args.toKey) state.attackPreview = undefined;
  }
  deps.ws.send(JSON.stringify({ type: "ATTACK_PREVIEW", fromX: args.fromX, fromY: args.fromY, toX: args.toX, toY: args.toY, requestId }));
  globalThis.setTimeout(() => {
    if (state.attackPreviewPendingKey !== previewKey) return;
    if (state.attackPreviewPendingRequestId !== requestId) return;
    if (Date.now() - state.attackPreviewPendingStartedAt < ATTACK_PREVIEW_PENDING_TIMEOUT_MS) return;
    state.attackPreview = {
      fromKey: args.fromKey,
      toKey: args.toKey,
      valid: false,
      reason: "preview unavailable",
      receivedAt: Date.now()
    };
    state.attackPreviewPendingKey = "";
    state.attackPreviewPendingStartedAt = 0;
    deps.onPreviewTimeout?.();
  }, ATTACK_PREVIEW_PENDING_TIMEOUT_MS);
};

const resolvedAttackPreviewForTarget = (
  state: ClientState,
  args: {
    fromKey?: string;
    toKey: string;
    dockFallback: boolean;
  }
): AttackPreview | undefined => {
  const currentPreview = state.attackPreview;
  if (args.fromKey) {
    const previewKey = attackPreviewKey(args.fromKey, args.toKey);
    if (state.attackPreviewPendingKey === previewKey) return undefined;
    const currentMatches = currentPreview && currentPreview.toKey === args.toKey && currentPreview.fromKey === args.fromKey;
    if (currentMatches && Date.now() - currentPreview.receivedAt <= ATTACK_PREVIEW_CACHE_TTL_MS) return currentPreview;
    return freshCachedAttackPreview(state, previewKey);
  }
  if (!args.dockFallback) return undefined;
  const previewKey = attackPreviewKey(args.toKey, args.toKey);
  if (state.attackPreviewPendingKey === previewKey) return undefined;
  const currentMatches = currentPreview && currentPreview.toKey === args.toKey;
  if (currentMatches && Date.now() - currentPreview.receivedAt <= ATTACK_PREVIEW_CACHE_TTL_MS) return currentPreview;
  return freshCachedAttackPreview(state, previewKey);
};

export const developmentSlotLimit = (state: Pick<ClientState, "developmentProcessLimit">): number => Math.max(1, state.developmentProcessLimit);

export const developmentSlotSummary = (
  state: ClientState,
  deps: {
    busyDevelopmentProcessCount: (tiles: Iterable<Tile>, me: string, activeSettlements: number) => number;
  }
): DevelopmentSlotSummary => {
  const busy =
    typeof state.activeDevelopmentProcessCount === "number"
      ? state.activeDevelopmentProcessCount
      : deps.busyDevelopmentProcessCount(state.tiles.values(), state.me, state.settleProgressByTile.size);
  const limit = developmentSlotLimit(state);
  return {
    busy,
    limit,
    available: Math.max(0, limit - busy)
  };
};

export const developmentSlotReason = (summary: DevelopmentSlotSummary): string => `No available development slots (${summary.busy}/${summary.limit} busy)`;

export const clearSettlementProgressByKey = (
  state: ClientState,
  tileKey: string,
  deps: {
    clearOptimisticTileState: (tileKey: string) => void;
  }
): void => {
  if (!tileKey) return;
  state.settleProgressByTile.delete(tileKey);
  deps.clearOptimisticTileState(tileKey);
  if (state.latestSettleTargetKey === tileKey) state.latestSettleTargetKey = "";
};

export const clearSettlementProgressForTile = (
  state: ClientState,
  x: number,
  y: number,
  deps: {
    keyFor: (x: number, y: number) => string;
    clearSettlementProgressByKey: (tileKey: string) => void;
  }
): void => {
  deps.clearSettlementProgressByKey(deps.keyFor(x, y));
};

// queuedDevelopmentActionExists / queueDevelopmentAction (incl. the total
// queue-cap check) live in client-development-queue.ts alongside the other
// developmentQueue persistence/cap logic -- re-exported here since callers
// throughout this module (and its own callers) reach them via this module's
// path.
export { queuedDevelopmentActionExists, queueDevelopmentAction } from "../client-development-queue/client-development-queue.js";

const queuedSettlementShouldWait = (state: ClientState, tileKey: string): boolean => {
  if (!tileKey) return false;
  if (state.settleProgressByTile.has(tileKey)) return true;
  if (state.actionInFlight && state.actionTargetKey === tileKey) return true;
  if (state.capture && `${state.capture.target.x},${state.capture.target.y}` === tileKey) return true;
  const frontierSyncWaitUntil = state.frontierSyncWaitUntilByTarget.get(tileKey) ?? 0;
  return frontierSyncWaitUntil > Date.now();
};

export const syncOptimisticSettlementTile = (
  state: ClientState,
  x: number,
  y: number,
  awaitingServerConfirm: boolean,
  deps: {
    applyOptimisticTileState: (x: number, y: number, update: (tile: Tile) => void) => void;
  }
): void => {
  deps.applyOptimisticTileState(x, y, (tile) => {
    tile.ownerId = state.me;
    tile.ownershipState = awaitingServerConfirm ? "SETTLED" : tile.ownershipState === "SETTLED" ? "SETTLED" : "FRONTIER";
    tile.fogged = false;
    tile.optimisticPending = "settle";
  });
};

export const settlementProgressForTile = (
  state: ClientState,
  x: number,
  y: number,
  deps: {
    keyFor: (x: number, y: number) => string;
    syncOptimisticSettlementTile: (x: number, y: number, awaitingServerConfirm: boolean) => void;
    requestViewRefresh: (radius?: number, force?: boolean) => void;
  }
): TileTimedProgress | undefined => {
  const tileKey = deps.keyFor(x, y);
  const progress = state.settleProgressByTile.get(tileKey);
  if (!progress) return undefined;
  const now = Date.now();
  if (progress.resolvesAt <= now && !progress.awaitingServerConfirm) {
    progress.awaitingServerConfirm = true;
    state.settleProgressByTile.set(tileKey, progress);
    deps.syncOptimisticSettlementTile(x, y, true);
  }
  if (
    progress.awaitingServerConfirm &&
    now - progress.resolvesAt >= SETTLEMENT_CONFIRM_REFRESH_MS &&
    (!progress.confirmRefreshRequestedAt || now - progress.confirmRefreshRequestedAt >= SETTLEMENT_CONFIRM_REFRESH_COOLDOWN_MS)
  ) {
    progress.confirmRefreshRequestedAt = now;
    state.settleProgressByTile.set(tileKey, progress);
    deps.requestViewRefresh(2, true);
  }
  return progress;
};

export const queuedDevelopmentEntryForTile = (state: ClientState, tileKey: string): QueuedDevelopmentAction | undefined =>
  state.developmentQueue.find((entry) => entry.tileKey === tileKey);

export const queuedSettlementIndexForTile = (state: ClientState, tileKey: string): number =>
  queuedSettlementOrderForTile(state.developmentQueue, tileKey);

export const queuedEntryIndexForTile = (state: ClientState, tileKey: string): number =>
  state.developmentQueue.findIndex((entry) => entry.tileKey === tileKey);

export const queuedBuildEntryForTile = (state: ClientState, tileKey: string): Extract<QueuedDevelopmentAction, { kind: "BUILD" }> | undefined => {
  const entry = state.developmentQueue.find((queued) => queued.tileKey === tileKey && queued.kind === "BUILD");
  return entry && entry.kind === "BUILD" ? entry : undefined;
};

export const cancelQueuedSettlement = (
  state: ClientState,
  tileKey: string,
  deps: {
    pushFeed: (message: string, type?: "combat" | "mission" | "error" | "info" | "alliance" | "tech", severity?: "info" | "success" | "warn" | "error") => void;
    renderHud: () => void;
    sendGameMessage?: (payload: unknown) => boolean;
  }
): boolean => {
  const nextQueue = state.developmentQueue.filter((entry) => !(entry.kind === "SETTLE" && entry.tileKey === tileKey));
  if (nextQueue.length === state.developmentQueue.length) return false;
  state.developmentQueue = nextQueue;
  state.autoSettlementQueueVisibleUntilByTile.delete(tileKey);
  if (state.autoSettlementQueue.some((entry) => `${entry.x},${entry.y}` === tileKey)) {
    state.skippedAutoSettlementTileKeys.add(tileKey);
    persistSkippedAutoSettlementTileKeysForPlayer(state.me, state.skippedAutoSettlementTileKeys);
  }
  persistDevelopmentQueueForPlayer(state.me, state.developmentQueue);
  deps.sendGameMessage?.(devQueueCancelWirePayload(tileKey));
  deps.pushFeed(`Queued settlement at ${tileKey} cancelled.`, "combat", "info");
  deps.renderHud();
  return true;
};

export const cancelQueuedBuild = (
  state: ClientState,
  tileKey: string,
  deps: {
    pushFeed: (message: string, type?: "combat" | "mission" | "error" | "info" | "alliance" | "tech", severity?: "info" | "success" | "warn" | "error") => void;
    renderHud: () => void;
    sendGameMessage?: (payload: unknown) => boolean;
  }
): boolean => {
  const entry = queuedBuildEntryForTile(state, tileKey);
  if (!entry) return false;
  const nextQueue = state.developmentQueue.filter((queued) => queued !== entry);
  state.developmentQueue = nextQueue;
  persistDevelopmentQueueForPlayer(state.me, state.developmentQueue);
  deps.sendGameMessage?.(devQueueCancelWirePayload(tileKey));
  deps.pushFeed(`${entry.label} cancelled.`, "combat", "info");
  deps.renderHud();
  return true;
};

export const moveQueuedEntryToFront = (
  state: ClientState,
  tileKey: string,
  deps: {
    pushFeed: (message: string, type?: "combat" | "mission" | "error" | "info" | "alliance" | "tech", severity?: "info" | "success" | "warn" | "error") => void;
    renderHud: () => void;
    sendGameMessage?: (payload: unknown) => boolean;
  }
): boolean => {
  const entry = state.developmentQueue.find((queued) => queued.tileKey === tileKey);
  if (!entry) return false;
  const index = state.developmentQueue.indexOf(entry);
  if (index <= 0) return false;
  const nextQueue = state.developmentQueue.filter((queued) => queued !== entry);
  nextQueue.unshift(entry);
  state.developmentQueue = nextQueue;
  persistDevelopmentQueueForPlayer(state.me, state.developmentQueue);
  deps.sendGameMessage?.(devQueueMoveToFrontWirePayload(tileKey));
  deps.pushFeed(`${entry.label} moved to the front of the queue.`, "combat", "info");
  deps.renderHud();
  return true;
};

export const waypointIndexForTile = (state: ClientState, x: number, y: number): number =>
  state.waypoint.findIndex((entry) => entry.target.x === x && entry.target.y === y);

export const cancelQueuedWaypointEntry = (
  state: ClientState,
  x: number,
  y: number,
  deps: {
    pushFeed: (message: string, type?: "combat" | "mission" | "error" | "info" | "alliance" | "tech", severity?: "info" | "success" | "warn" | "error") => void;
    renderHud: () => void;
    sendGameMessage?: (payload: unknown) => boolean;
  }
): boolean => {
  const index = waypointIndexForTile(state, x, y);
  if (index < 0) return false;
  state.waypoint.splice(index, 1);
  persistWaypointQueueForPlayer(state.me, state.waypoint);
  deps.sendGameMessage?.(waypointCancelWirePayload({ x, y }));
  deps.pushFeed(`Waypoint at (${x}, ${y}) cancelled.`, "info", "info");
  deps.renderHud();
  return true;
};

export const moveWaypointToFront = (
  state: ClientState,
  x: number,
  y: number,
  deps: {
    pushFeed: (message: string, type?: "combat" | "mission" | "error" | "info" | "alliance" | "tech", severity?: "info" | "success" | "warn" | "error") => void;
    renderHud: () => void;
    sendGameMessage?: (payload: unknown) => boolean;
  }
): boolean => {
  const index = waypointIndexForTile(state, x, y);
  if (index <= 0) return false;
  const [entry] = state.waypoint.splice(index, 1);
  if (!entry) return false;
  // The entry being promoted may have been active before (and accumulated
  // lastEnqueuedKey/consecutiveRetries anti-thrash bookkeeping) and the
  // previously-active entry is about to go dormant. Reset both, mirroring
  // restorePersistedWaypointQueueForPlayer's rationale: losing a tick of
  // anti-thrash tolerance across an activity gap is harmless, but carrying
  // a stale retry count forward can cause a premature "Waypoint halted"
  // once this entry (or the demoted one) becomes active again.
  const demoted = state.waypoint[0];
  if (demoted) {
    delete demoted.lastEnqueuedKey;
    demoted.consecutiveRetries = 0;
  }
  delete entry.lastEnqueuedKey;
  entry.consecutiveRetries = 0;
  state.waypoint.unshift(entry);
  persistWaypointQueueForPlayer(state.me, state.waypoint);
  syncWaypointQueueToServer(state, deps.sendGameMessage); // no MOVE_TO_FRONT command server-side; resync order instead
  deps.pushFeed(`Waypoint to (${x}, ${y}) moved to the front of the queue.`, "info", "info");
  deps.renderHud();
  return true;
};

export const actionQueueIndexForTile = (state: ClientState, x: number, y: number): number =>
  state.actionQueue.findIndex((entry) => entry.x === x && entry.y === y);

export const cancelQueuedExpandEntry = (
  state: ClientState,
  x: number,
  y: number,
  deps: {
    keyFor: (x: number, y: number) => string;
    pushFeed: (message: string, type?: "combat" | "mission" | "error" | "info" | "alliance" | "tech", severity?: "info" | "success" | "warn" | "error") => void;
    renderHud: () => void;
  }
): boolean => {
  const index = actionQueueIndexForTile(state, x, y);
  if (index < 0) return false;
  const [entry] = state.actionQueue.splice(index, 1);
  if (!entry) return false;
  const targetKey = deps.keyFor(x, y);
  state.queuedTargetKeys.delete(targetKey);
  // If this hop was auto-enqueued by the active waypoint, clear its
  // lastEnqueuedKey/retry bookkeeping so the next top-up cleanly re-plans
  // instead of miscounting the cancellation as a stalled retry.
  const activeWaypoint = state.waypoint[0];
  if (entry.fromWaypoint && activeWaypoint?.lastEnqueuedKey === targetKey) {
    delete activeWaypoint.lastEnqueuedKey;
    activeWaypoint.consecutiveRetries = 0;
  }
  deps.pushFeed(`Queued frontier action at (${x}, ${y}) cancelled.`, "combat", "info");
  deps.renderHud();
  return true;
};

export const moveActionQueueEntryToFront = (
  state: ClientState,
  x: number,
  y: number,
  deps: {
    pushFeed: (message: string, type?: "combat" | "mission" | "error" | "info" | "alliance" | "tech", severity?: "info" | "success" | "warn" | "error") => void;
    renderHud: () => void;
  }
): boolean => {
  const index = actionQueueIndexForTile(state, x, y);
  if (index <= 0) return false;
  const [entry] = state.actionQueue.splice(index, 1);
  if (!entry) return false;
  state.actionQueue.unshift(entry);
  deps.pushFeed(`Queued frontier action at (${x}, ${y}) moved to the front of the queue.`, "combat", "info");
  deps.renderHud();
  return true;
};

export const cleanupExpiredSettlementProgress = (
  state: ClientState,
  deps: {
    syncOptimisticSettlementTile: (x: number, y: number, awaitingServerConfirm: boolean) => void;
    clearSettlementProgressByKey: (tileKey: string) => void;
    requestViewRefresh: (radius?: number, force?: boolean) => void;
  }
): boolean => {
  const now = Date.now();
  let changed = false;
  let requestedRefresh = false;
  for (const [tileKey, existing] of [...state.settleProgressByTile.entries()]) {
    const progress = { ...existing };
    if (progress.resolvesAt <= now && !progress.awaitingServerConfirm) {
      progress.awaitingServerConfirm = true;
      state.settleProgressByTile.set(tileKey, progress);
      deps.syncOptimisticSettlementTile(progress.target.x, progress.target.y, true);
      changed = true;
    }
    if (
      progress.awaitingServerConfirm &&
      now - progress.resolvesAt >= SETTLEMENT_CONFIRM_REFRESH_MS &&
      (!progress.confirmRefreshRequestedAt || now - progress.confirmRefreshRequestedAt >= SETTLEMENT_CONFIRM_REFRESH_COOLDOWN_MS)
    ) {
      progress.confirmRefreshRequestedAt = now;
      state.settleProgressByTile.set(tileKey, progress);
      requestedRefresh = true;
    }
    if (progress.awaitingServerConfirm && now - progress.resolvesAt >= SETTLEMENT_CONFIRM_STALE_MS) {
      deps.clearSettlementProgressByKey(tileKey);
      changed = true;
      requestedRefresh = true;
    }
  }
  if (requestedRefresh) deps.requestViewRefresh(2, true);
  return changed;
};

export const activeSettlementProgressEntries = (
  state: ClientState,
  deps: { cleanupExpiredSettlementProgress: () => boolean }
): TileTimedProgress[] => {
  deps.cleanupExpiredSettlementProgress();
  return [...state.settleProgressByTile.values()].sort((a, b) => a.resolvesAt - b.resolvesAt);
};

export const primarySettlementProgress = (
  state: ClientState,
  deps: {
    settlementProgressForTile: (x: number, y: number) => TileTimedProgress | undefined;
    activeSettlementProgressEntries: () => TileTimedProgress[];
  }
): TileTimedProgress | undefined => {
  const selected = state.selected ? deps.settlementProgressForTile(state.selected.x, state.selected.y) : undefined;
  if (selected) return selected;
  const latest = state.latestSettleTargetKey ? state.settleProgressByTile.get(state.latestSettleTargetKey) : undefined;
  if (latest) return latest;
  return deps.activeSettlementProgressEntries()[0];
};

export const requestSettlement = (
  state: ClientState,
  x: number,
  y: number,
  deps: VisibleActionWarningDeps & {
    keyFor: (x: number, y: number) => string;
    renderHud: () => void;
    queueDevelopmentAction: (entry: QueuedDevelopmentAction) => boolean;
    developmentSlotSummary: () => DevelopmentSlotSummary;
    developmentSlotReason: (summary: DevelopmentSlotSummary) => string;
    sendGameMessage: (payload: unknown) => boolean;
    syncOptimisticSettlementTile: (x: number, y: number, awaitingServerConfirm: boolean) => void;
    opts?: { allowQueueWhenBusy?: boolean; fromQueue?: boolean; suppressWarnings?: boolean; forceQueue?: boolean };
  }
): boolean => {
  const tileKey = deps.keyFor(x, y);
  const tile = state.tiles.get(tileKey);
  if (!tile || tile.ownerId !== state.me || tile.ownershipState !== "FRONTIER") {
    if (!deps.opts?.suppressWarnings) showVisibleActionWarning(deps, "Settlement blocked", "Cannot settle: tile is not one of your frontier tiles.");
    deps.renderHud();
    return false;
  }
  if (state.manpower < SETTLE_MANPOWER_COST) { if (!deps.opts?.suppressWarnings) showVisibleActionWarning(deps, "Settlement blocked", `Need ${SETTLE_MANPOWER_COST} manpower to settle this tile.`); deps.renderHud(); return false; }
  if (!canAffordCost(state.gold, SETTLE_COST)) { if (!deps.opts?.suppressWarnings) showVisibleActionWarning(deps, "Settlement blocked", `Need ${SETTLE_COST} gold to settle this tile.`); deps.renderHud(); return false; }
  if (queuedSettlementShouldWait(state, tileKey)) {
    if (deps.opts?.allowQueueWhenBusy !== false && !deps.opts?.fromQueue) {
      return deps.queueDevelopmentAction({ kind: "SETTLE", x, y, tileKey, label: `Settlement at (${x}, ${y})` });
    }
    if (!deps.opts?.suppressWarnings) deps.pushFeed("Settlement queued: waiting for combat and tile sync to finish.", "combat", "info");
    deps.renderHud();
    return false;
  }
  const slots = deps.developmentSlotSummary();
  const canQueue = deps.opts?.allowQueueWhenBusy !== false && !deps.opts?.fromQueue;
  // FIFO: if anything is already waiting, this new click goes to the end of the line
  // rather than racing into a slot that opened mid-dispatch. Bulk dispatchers
  // (e.g. settle-connected) pass forceQueue so every tile enters the queue and the
  // dispatcher paces them one slot at a time, instead of firing N SETTLEs at once
  // against a server slot count that hasn't yet caught up with the in-flight sends.
  if (canQueue && (deps.opts?.forceQueue || state.developmentQueue.length > 0)) {
    return deps.queueDevelopmentAction({ kind: "SETTLE", x, y, tileKey, label: `Settlement at (${x}, ${y})` });
  }
  if (slots.available <= 0) {
    if (canQueue) {
      return deps.queueDevelopmentAction({ kind: "SETTLE", x, y, tileKey, label: `Settlement at (${x}, ${y})` });
    }
    if (!deps.opts?.suppressWarnings) showVisibleActionWarning(deps, "Development slots full", deps.developmentSlotReason(slots));
    deps.renderHud();
    return false;
  }
  state.lastDevelopmentAttempt = { kind: "SETTLE", x, y, tileKey, label: `Settlement at (${x}, ${y})` };
  if (!deps.sendGameMessage({ type: "SETTLE", x, y })) {
    state.lastDevelopmentAttempt = undefined;
    return false;
  }
  if (deps.opts?.fromQueue) state.queuedDevelopmentDispatchPending = true;
  const startAt = Date.now();
  const progress = { startAt, resolvesAt: startAt + settleDurationMsForState(state, { x, y }), target: { x, y }, awaitingServerConfirm: false };
  state.gold = Math.max(0, state.gold - SETTLE_COST); state.manpower = Math.max(0, state.manpower - SETTLE_MANPOWER_COST);
  state.settleProgressByTile.set(tileKey, progress);
  state.latestSettleTargetKey = tileKey;
  deps.syncOptimisticSettlementTile(x, y, false);
  state.selected = { x, y };
  resetAttackPreviewState(state);
  deps.renderHud();
  return true;
};
export const sendDevelopmentBuild = (
  state: ClientState,
  payload: QueuedBuildPayload,
  optimistic: () => void,
  opts: {
    x: number;
    y: number;
    label: string;
    optimisticKind: OptimisticStructureKind;
    allowQueueWhenBusy?: boolean;
    fromQueue?: boolean;
    suppressWarnings?: boolean;
  },
  deps: VisibleActionWarningDeps & {
    keyFor: (x: number, y: number) => string;
    queueDevelopmentAction: (entry: QueuedDevelopmentAction) => boolean;
    developmentSlotSummary: () => DevelopmentSlotSummary;
    developmentSlotReason: (summary: DevelopmentSlotSummary) => string;
    renderHud: () => void;
    sendGameMessage: (payload: unknown) => boolean;
  }
): boolean => {
  const summary = deps.developmentSlotSummary();
  const canQueue = opts.allowQueueWhenBusy !== false && !opts.fromQueue;
  // FIFO: if anything is already waiting, this new click goes to the end of the line
  // rather than racing into a slot that opened mid-dispatch.
  if (canQueue && state.developmentQueue.length > 0) {
    return deps.queueDevelopmentAction({
      kind: "BUILD",
      x: opts.x,
      y: opts.y,
      tileKey: deps.keyFor(opts.x, opts.y),
      label: opts.label,
      payload,
      optimisticKind: opts.optimisticKind
    });
  }
  if (summary.available <= 0) {
    if (canQueue) {
      return deps.queueDevelopmentAction({
        kind: "BUILD",
        x: opts.x,
        y: opts.y,
        tileKey: deps.keyFor(opts.x, opts.y),
        label: opts.label,
        payload,
        optimisticKind: opts.optimisticKind
      });
    }
    if (!opts.suppressWarnings) {
      showVisibleActionWarning(deps, "Development slots full", deps.developmentSlotReason(summary));
      deps.renderHud();
    }
    return false;
  }
  state.lastDevelopmentAttempt = {
    kind: "BUILD",
    x: opts.x,
    y: opts.y,
    tileKey: deps.keyFor(opts.x, opts.y),
    label: opts.label,
    payload,
    optimisticKind: opts.optimisticKind
  };
  if (!deps.sendGameMessage(gatewayBuildWirePayload(payload))) {
    state.lastDevelopmentAttempt = undefined;
    return false;
  }
  if (opts.fromQueue) state.queuedDevelopmentDispatchPending = true;
  optimistic();
  deps.renderHud();
  return true;
};
export const processDevelopmentQueue = (
  state: ClientState,
  deps: {
    ws: RealtimeSocket;
    authSessionReady: boolean;
    developmentSlotSummary: () => DevelopmentSlotSummary;
    requestSettlement: (x: number, y: number, opts: { allowQueueWhenBusy: false; fromQueue: true; suppressWarnings: true }) => boolean;
    sendDevelopmentBuild: (
      payload: QueuedBuildPayload,
      optimistic: () => void,
      opts: {
        x: number;
        y: number;
        label: string;
        optimisticKind: OptimisticStructureKind;
        allowQueueWhenBusy: false;
        fromQueue: true;
        suppressWarnings: true;
      }
    ) => boolean;
    applyOptimisticStructureBuild: (x: number, y: number, kind: OptimisticStructureKind) => void;
    applyOptimisticStructureRemoval: (x: number, y: number) => void;
    pushFeed: (message: string, type?: "combat" | "mission" | "error" | "info" | "alliance" | "tech", severity?: "info" | "success" | "warn" | "error") => void;
    renderHud: () => void;
    sendGameMessage?: (payload: unknown) => boolean;
  }
): boolean => {
  if (state.developmentQueue.length === 0 || deps.ws.readyState !== deps.ws.OPEN || !deps.authSessionReady) return false;
  pruneExpiredAutoSettlementQueueVisibleHolds(state);
  if (state.queuedDevelopmentDispatchPending) {
    const nextQueued = state.developmentQueue[0];
    if (nextQueued && tileMatchesDebugKey(nextQueued.x, nextQueued.y, 1, { fallbackTile: state.selected })) {
      debugTileLog("development-queue-blocked", {
        tileKey: nextQueued.tileKey,
        developmentQueueLength: state.developmentQueue.length,
        activeDevelopmentProcessCount: state.activeDevelopmentProcessCount,
        developmentProcessLimit: state.developmentProcessLimit,
        queuedDevelopmentDispatchPending: state.queuedDevelopmentDispatchPending,
        lastDevelopmentAttempt: state.lastDevelopmentAttempt ?? null
      });
    }
    return false;
  }
  let started = false;
  while (state.developmentQueue.length > 0 && deps.developmentSlotSummary().available > 0) {
    const next = state.developmentQueue[0];
    if (!next) return started;
    if (next.kind === "SETTLE" && (state.autoSettlementQueueVisibleUntilByTile.get(next.tileKey) ?? 0) > Date.now()) return false;
    if (next.kind === "SETTLE" && queuedSettlementShouldWait(state, next.tileKey)) return false;
    if (tileMatchesDebugKey(next.x, next.y, 1, { fallbackTile: state.selected })) {
      debugTileLog("development-queue-dispatch", {
        tileKey: next.tileKey,
        kind: next.kind,
        developmentQueueLength: state.developmentQueue.length,
        activeDevelopmentProcessCount: state.activeDevelopmentProcessCount,
        developmentProcessLimit: state.developmentProcessLimit,
        queuedDevelopmentDispatchPending: state.queuedDevelopmentDispatchPending,
        queuedSettlementWait: next.kind === "SETTLE" ? queuedSettlementShouldWait(state, next.tileKey) : false
      });
    }
    const ok =
      next.kind === "SETTLE"
        ? deps.requestSettlement(next.x, next.y, { allowQueueWhenBusy: false, fromQueue: true, suppressWarnings: true })
        : deps.sendDevelopmentBuild(next.payload, () => {
            if (next.payload.type === "REMOVE_STRUCTURE") deps.applyOptimisticStructureRemoval(next.x, next.y);
            else deps.applyOptimisticStructureBuild(next.x, next.y, next.optimisticKind);
          }, {
            x: next.x,
            y: next.y,
            label: next.label,
            optimisticKind: next.optimisticKind,
            allowQueueWhenBusy: false,
            fromQueue: true,
            suppressWarnings: true
          });
    if (ok) {
      if (next.kind === "SETTLE") state.autoSettlementQueueVisibleUntilByTile.delete(next.tileKey);
      state.developmentQueue.shift();
      persistDevelopmentQueueForPlayer(state.me, state.developmentQueue);
      // Dispatched directly -- pull back out of the server-durable mirror (a no-op if never mirrored).
      deps.sendGameMessage?.(devQueueCancelWirePayload(next.tileKey));
      started = true;
    } else {
      if (next.kind === "SETTLE") state.autoSettlementQueueVisibleUntilByTile.delete(next.tileKey);
      state.developmentQueue.shift();
      persistDevelopmentQueueForPlayer(state.me, state.developmentQueue);
      deps.sendGameMessage?.(devQueueCancelWirePayload(next.tileKey));
      deps.pushFeed(`${next.label} could not start and was removed from queue.`, "combat", "warn");
    }
    break;
  }
  if (started || state.developmentQueue.length === 0) deps.renderHud();
  return started;
};

const BARBARIAN_TRACK_RADIUS = 5;

const findNearestBarbarian = (
  cx: number,
  cy: number,
  radius: number,
  state: Pick<ClientState, "tiles">,
  keyFor: (x: number, y: number) => string
): { x: number; y: number } | undefined => {
  for (let r = 0; r <= radius; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = wrapX(cx + dx, WORLD_WIDTH);
        const y = wrapY(cy + dy, WORLD_HEIGHT);
        const tile = state.tiles.get(keyFor(x, y));
        if (tile?.ownerId === "barbarian-1") return { x, y };
      }
    }
  }
  return undefined;
};

// Walk the active waypoint plan one tile forward into the action queue.
// Called when the action queue is empty so manual taps always take
// priority. Re-plans against current state on every call so fog reveals,
// ownership changes, and dock activity feed back into routing.
export const topUpFromWaypoint = (
  state: ClientState,
  keyFor: (x: number, y: number) => string,
  pushFeed: (message: string, type?: "combat" | "mission" | "error" | "info" | "alliance" | "tech", severity?: "info" | "success" | "warn" | "error") => void,
  sendGameMessage?: (payload: unknown) => boolean
): boolean => {
  const waypoint = state.waypoint[0];
  if (!waypoint) return false;
  if (state.actionQueue.length > 0) return false;
  if (state.actionInFlight) return false;

  let target = waypoint.target;
  const targetTile = state.tiles.get(keyFor(target.x, target.y));
  if (targetTile && targetTile.ownerId === state.me) {
    state.waypoint.shift();
    persistWaypointQueueForPlayer(state.me, state.waypoint);
    sendGameMessage?.(waypointCancelWirePayload(target));
    return state.waypoint.length > 0;
  }

  // Barbarian tracking: if the original tile is no longer barbarian-owned,
  // scan for where it moved and retarget.
  if (waypoint.trackBarbarian && targetTile?.ownerId !== "barbarian-1") {
    const moved = findNearestBarbarian(target.x, target.y, BARBARIAN_TRACK_RADIUS, state, keyFor);
    if (moved) {
      const previousTarget = target;
      waypoint.target = moved;
      target = moved;
      // The server mirror is keyed by target coordinates -- swap it too, or
      // the durable entry keeps pointing at the barbarian's old position.
      sendGameMessage?.(waypointCancelWirePayload(previousTarget));
      sendGameMessage?.(waypointEnqueueWirePayload(moved, true));
    }
  }

  const plan = planWaypoint(target, { state, keyFor, isInReach: localReachIsInReach(state.tiles, state.me, keyFor) });
  waypoint.plan = plan;
  if (!plan.reachable) {
    const result = cancelWaypointOnBarrierBlock(state, plan, target, pushFeed);
    if (plan.blockReason === "TARGET_BARRIER") {
      persistWaypointQueueForPlayer(state.me, state.waypoint);
      sendGameMessage?.(waypointCancelWirePayload(target));
    }
    return result;
  }
  const firstStep = plan.steps[0];
  if (!firstStep) return false;
  if (pauseWaypointForManpowerIfNeeded(waypoint, firstStep, state.manpower, pushFeed)) return false;
  const stepKey = keyFor(firstStep.target.x, firstStep.target.y);
  // If the planner re-emits the exact step we just enqueued, ownership has not advanced yet. Two common causes: (a) FRONTIER_RESULT arrives
  // before the TILE_DELTA that flips ownerId, so the next top-up sees a
  // stale neutral tile; (b) the server is actively rejecting (e.g.,
  // EXPAND_TARGET_OWNED). Tolerate a few ticks for (a) before halting
  // on (b) — the next top-up that sees fresh state advances naturally.
  const MAX_CONSECUTIVE_RETRIES = 4;
  if (waypoint.lastEnqueuedKey === stepKey) {
    const retries = (waypoint.consecutiveRetries ?? 0) + 1;
    if (retries > MAX_CONSECUTIVE_RETRIES) {
      waypoint.plan = { ...plan, reachable: false, blockReason: "NO_PATH" };
      pushFeed(
        `Waypoint halted at ${stepKey}. Tap the flag to cancel.`,
        "info",
        "warn"
      );
      return false;
    }
    waypoint.consecutiveRetries = retries;
    return false;
  }
  waypoint.consecutiveRetries = 0;
  const enqueued = enqueueTarget(state, firstStep.target.x, firstStep.target.y, keyFor, { fromWaypoint: true });
  if (enqueued) waypoint.lastEnqueuedKey = stepKey;
  return enqueued;
};

export const enqueueTarget = (
  state: ClientState,
  x: number,
  y: number,
  keyFor: (x: number, y: number) => string,
  options: { fromWaypoint?: boolean } = {}
): boolean => {
  const targetKey = keyFor(x, y);
  const frontierSyncWaitUntil = state.frontierSyncWaitUntilByTarget.get(targetKey) ?? 0;
  if (frontierSyncWaitUntil > Date.now()) return false;
  if (state.queuedTargetKeys.has(targetKey)) {
    const stillQueued = state.actionQueue.some((entry) => keyFor(entry.x, entry.y) === targetKey);
    const currentlyExecuting = state.actionInFlight && state.actionTargetKey === targetKey;
    if (!stillQueued && !currentlyExecuting) state.queuedTargetKeys.delete(targetKey);
  }
  if (state.queuedTargetKeys.has(targetKey)) return false;
  const entry: { x: number; y: number; retries: number; fromWaypoint?: boolean } = { x, y, retries: 0 };
  if (options.fromWaypoint) entry.fromWaypoint = true;
  state.actionQueue.push(entry);
  state.queuedTargetKeys.add(targetKey);
  return true;
};

export const buildFrontierQueue = (
  state: ClientState,
  candidates: string[],
  deps: {
    keyFor: (x: number, y: number) => string;
    parseKey: (key: string) => { x: number; y: number };
    wrapX: (x: number) => number;
    wrapY: (y: number) => number;
    enqueue: (x: number, y: number) => boolean;
  }
): { queued: number; skipped: number; queuedKeys: string[] } => {
  if (candidates.length === 0) return { queued: 0, skipped: 0, queuedKeys: [] };
  const owned = new Set<string>();
  for (const tile of state.tiles.values()) {
    if (tile.ownerId === state.me) owned.add(deps.keyFor(tile.x, tile.y));
  }
  const planned = new Set<string>();
  const remaining = new Set<string>(candidates);
  let queued = 0;

  while (remaining.size > 0) {
    const frontier: string[] = [];
    for (const targetKey of remaining) {
      const { x, y } = deps.parseKey(targetKey);
      const neighbors = [
        deps.keyFor(deps.wrapX(x), deps.wrapY(y - 1)),
        deps.keyFor(deps.wrapX(x + 1), deps.wrapY(y)),
        deps.keyFor(deps.wrapX(x), deps.wrapY(y + 1)),
        deps.keyFor(deps.wrapX(x - 1), deps.wrapY(y)),
        deps.keyFor(deps.wrapX(x - 1), deps.wrapY(y - 1)),
        deps.keyFor(deps.wrapX(x + 1), deps.wrapY(y - 1)),
        deps.keyFor(deps.wrapX(x + 1), deps.wrapY(y + 1)),
        deps.keyFor(deps.wrapX(x - 1), deps.wrapY(y + 1))
      ];
      if (neighbors.some((neighborKey) => owned.has(neighborKey) || planned.has(neighborKey))) frontier.push(targetKey);
    }
    if (frontier.length === 0) break;
    frontier.sort();
    for (const frontierKey of frontier) {
      const { x, y } = deps.parseKey(frontierKey);
      remaining.delete(frontierKey);
      if (deps.enqueue(x, y)) {
        planned.add(frontierKey);
        queued += 1;
      }
    }
  }

  return { queued, skipped: remaining.size, queuedKeys: [...planned] };
};

export const applyPendingSettlementsFromServer = (
  state: ClientState,
  entries: Array<{ x: number; y: number; startedAt: number; resolvesAt: number }> | undefined,
  deps: {
    keyFor: (x: number, y: number) => string;
    syncOptimisticSettlementTile: (x: number, y: number, awaitingServerConfirm: boolean) => void;
    clearOptimisticTileState: (tileKey: string) => void;
    requestViewRefresh: (radius?: number, force?: boolean) => void;
  }
): void => {
  if (!entries) return;
  const now = Date.now();
  const previousProgress = new Map(state.settleProgressByTile);
  let ignoredStaleEntry = false;
  for (const tileKey of state.settleProgressByTile.keys()) deps.clearOptimisticTileState(tileKey);
  state.settleProgressByTile.clear();
  let latestKey = "";
  let latestResolvesAt = -Infinity;
  for (const entry of entries) {
    if (entry.resolvesAt <= now - SETTLEMENT_CONFIRM_STALE_MS) {
      ignoredStaleEntry = true;
      continue;
    }
    const tileKey = deps.keyFor(entry.x, entry.y);
    const awaitingServerConfirm = entry.resolvesAt <= now;
    const nextProgress: TileTimedProgress = {
      startAt: entry.startedAt,
      resolvesAt: entry.resolvesAt,
      target: { x: entry.x, y: entry.y },
      awaitingServerConfirm
    };
    const confirmRefreshRequestedAt = previousProgress.get(tileKey)?.confirmRefreshRequestedAt;
    if (typeof confirmRefreshRequestedAt === "number") nextProgress.confirmRefreshRequestedAt = confirmRefreshRequestedAt;
    state.settleProgressByTile.set(tileKey, nextProgress);
    deps.syncOptimisticSettlementTile(entry.x, entry.y, awaitingServerConfirm);
    if (entry.resolvesAt > latestResolvesAt) {
      latestResolvesAt = entry.resolvesAt;
      latestKey = tileKey;
    }
  }
  state.latestSettleTargetKey = latestKey;
  if (ignoredStaleEntry) deps.requestViewRefresh(2, true);
};

export const queueSpecificTargets = (
  state: ClientState,
  targetKeys: string[],
  deps: {
    parseKey: (key: string) => { x: number; y: number };
    keyFor: (x: number, y: number) => string;
    isTileOwnedByAlly: (tile: Tile) => boolean;
    pickOriginForTarget: (x: number, y: number) => Tile | undefined;
    enqueueTarget: (x: number, y: number) => boolean;
    buildFrontierQueue: (candidates: string[], enqueue: (x: number, y: number) => boolean) => { queued: number; skipped: number; queuedKeys: string[] };
  }
): { queued: number; skipped: number; queuedKeys: string[] } => {
  const neutralTargets: string[] = [];
  const attackTargets: string[] = [];
  for (const targetKey of targetKeys) {
    const tile = state.tiles.get(targetKey);
    if (!tile || tile.terrain !== "LAND" || tile.fogged) continue;
    if (!tile.ownerId) neutralTargets.push(targetKey);
    else if (tile.ownerId !== state.me && !deps.isTileOwnedByAlly(tile)) attackTargets.push(targetKey);
  }

  const neutralResult = deps.buildFrontierQueue(neutralTargets, (x, y) => deps.enqueueTarget(x, y));
  const queuedKeys = [...neutralResult.queuedKeys];
  let queued = neutralResult.queued;
  let skipped = neutralResult.skipped;

  for (const targetKey of attackTargets) {
    const tile = state.tiles.get(targetKey);
    if (!tile) {
      skipped += 1;
      continue;
    }
    const { x, y } = deps.parseKey(targetKey);
    if (!deps.pickOriginForTarget(x, y)) {
      skipped += 1;
      continue;
    }
    if (!deps.enqueueTarget(x, y)) {
      skipped += 1;
      continue;
    }
    queued += 1;
    queuedKeys.push(targetKey);
  }

  return { queued, skipped, queuedKeys };
};

export const attackQueueFailureReason = (
  state: ClientState,
  tile: Tile,
  deps: {
    ownerSpawnShieldActive: (ownerId: string) => boolean;
    pickOriginForTarget: (x: number, y: number) => Tile | undefined;
  }
): string => {
  if (tile.ownerId && tile.ownerId !== state.me && deps.ownerSpawnShieldActive(tile.ownerId)) return "That empire is still under spawn protection.";
  if (state.gold < FRONTIER_CLAIM_COST) return `Need ${FRONTIER_CLAIM_COST} gold.`;
  if (!deps.pickOriginForTarget(tile.x, tile.y)) {
    return tile.dockId ? "No owned linked dock can reach this target." : "Target must border your territory or a linked dock.";
  }
  return "Action could not be queued.";
};

export const dropQueuedTargetKeyIfAbsent = (
  state: ClientState,
  targetKey: string,
  deps: {
    keyFor: (x: number, y: number) => string;
  }
): void => {
  if (!targetKey) return;
  const stillQueued = state.actionQueue.some((entry) => deps.keyFor(entry.x, entry.y) === targetKey);
  if (!stillQueued) state.queuedTargetKeys.delete(targetKey);
};

export const reconcileActionQueue = (
  state: ClientState,
  deps: {
    keyFor: (x: number, y: number) => string;
    pickOriginForTarget: (x: number, y: number, preferBreakthrough?: boolean, allowOptimisticOrigin?: boolean) => Tile | undefined;
    clearOptimisticTileState: (tileKey: string, revert?: boolean) => void;
  }
): void => {
  const nextQueue: ClientState["actionQueue"] = [];
  const nextQueuedKeys = new Set<string>();
  for (const entry of state.actionQueue) {
    const targetKey = deps.keyFor(entry.x, entry.y);
    const tile = state.tiles.get(targetKey);
    if (!tile) continue;
    if (tile.ownerId === state.me) {
      deps.clearOptimisticTileState(targetKey);
      continue;
    }
    const hasConfirmedOrigin = tile.ownerId
      ? Boolean(deps.pickOriginForTarget(tile.x, tile.y))
      : Boolean(deps.pickOriginForTarget(tile.x, tile.y, false, false));
    const hasOptimisticOrigin = tile.ownerId ? hasConfirmedOrigin : Boolean(deps.pickOriginForTarget(tile.x, tile.y, false, true));
    if (!hasConfirmedOrigin && !hasOptimisticOrigin) {
      deps.clearOptimisticTileState(targetKey, true);
      state.autoSettleTargets.delete(targetKey); state.autoBuildTargets.delete(targetKey);
      continue;
    }
    nextQueue.push(entry);
    nextQueuedKeys.add(targetKey);
  }
  state.actionQueue = nextQueue;
  if (state.actionInFlight && state.actionTargetKey) nextQueuedKeys.add(state.actionTargetKey);
  state.queuedTargetKeys = nextQueuedKeys;
};

// TEMPORARY diagnostic instrumentation for a live investigation into pending
// muster attacks that never promote (see PR history around 2026-08-14).
// Unconditional (not gated behind the debug-tile localStorage flags) so it
// shows up in the Settings > Download Diagnostics bundle without any manual
// setup. Throttled per-target to at most one log per 5s (plus one on any
// state change) so the 400-entry ring buffer isn't flooded by the 300ms
// heartbeat this runs on. Remove once the root cause is found.
const musterPromotionDebugLastLoggedAtByTarget = new Map<string, number>();
const musterPromotionDebugLastSignatureByTarget = new Map<string, string>();
const MUSTER_PROMOTION_DEBUG_LOG_INTERVAL_MS = 5_000;

// Backstop so a parked attack can never sit in pendingMusterAttacks forever
// with no feedback. dropStuckPendingMusterAttack (client-muster-attack-gate.ts)
// only fires when a brand-new flag was just requested (entry.musterRequestedAt
// set) — an entry parked against an already-existing flag has no such field,
// so if that flag never becomes usable (cleared, captured away, amount/
// required never converging, or any other reason) it previously had no
// expiry at all. This hard cap is independent of *why* it's stuck — it
// guarantees eventual feedback regardless of which sub-condition is failing.
const MUSTER_PENDING_HARD_TIMEOUT_MS = 5 * 60 * 1000;

// Check all pending muster attacks; promote those whose muster tile has reached
// MUSTER_ATTACK_COST into the real action queue.
export const processPendingMusterAttacks = (
  state: ClientState,
  deps: {
    keyFor: (x: number, y: number) => string;
    isAdjacent: (ax: number, ay: number, bx: number, by: number) => boolean;
    pushFeed: (message: string, type?: "combat" | "mission" | "error" | "info" | "alliance" | "tech", severity?: "info" | "success" | "warn" | "error") => void;
    sendGameMessage?: (payload: unknown) => boolean;
  }
): void => {
  if (state.pendingMusterAttacks.length === 0) return;
  const remaining: typeof state.pendingMusterAttacks = [];
  for (const entry of state.pendingMusterAttacks) {
    const targetKey = deps.keyFor(entry.targetX, entry.targetY);
    const target = state.tiles.get(targetKey);
    // Drop if target is gone or captured.
    if (!target || target.ownerId === state.me || !target.ownerId) continue;

    // Check for any muster closest to the target — a different muster may have
    // filled first, or the player may have placed a new flag closer to the front.
    // Must also actually be adjacent (or a valid dock crossing): processActionQueue
    // rejects a fire attempt from a merely-in-range-but-non-adjacent flag with
    // NOT_ADJACENT, and without this check that rejection just re-parks the
    // entry here forever — bouncing between the two queues with no progress
    // (a HOLD flag never marches into adjacency on its own; only ADVANCE does).
    const closest = findClosestMuster(state, entry.targetX, entry.targetY);
    const closestIsAdjacentOrLinked =
      closest != null &&
      (deps.isAdjacent(closest.tile.x, closest.tile.y, entry.targetX, entry.targetY) ||
        isDockCrossingBetween(state, closest.tile.x, closest.tile.y, entry.targetX, entry.targetY));

    const musterTile = state.tiles.get(entry.musterTileKey);
    const required = requiredMusterForTarget(target);

    // Hard backstop: no matter which sub-condition below is failing, an
    // entry parked for this long has clearly stalled — drop it with visible
    // feedback rather than leaving it silently stuck forever.
    if (entry.queuedAt != null && Date.now() - entry.queuedAt > MUSTER_PENDING_HARD_TIMEOUT_MS) {
      attackSyncLog("pending-muster-attack-hard-timeout", {
        targetKey,
        musterTileKey: entry.musterTileKey,
        queuedAt: entry.queuedAt,
        elapsedMs: Date.now() - entry.queuedAt,
        musterTileAmount: musterTile?.muster?.amount,
        musterTileOwnerId: musterTile?.muster?.ownerId,
        required
      });
      state.queuedTargetKeys.delete(targetKey);
      deps.pushFeed(
        `Attack on (${entry.targetX}, ${entry.targetY}) never staged enough manpower — cancelled after 5 minutes. Try again.`,
        "combat",
        "warn"
      );
      continue;
    }

    const debugPayload = {
      targetKey,
      musterTileKey: entry.musterTileKey,
      musterTileAmount: musterTile?.muster?.amount,
      musterTileOwnerId: musterTile?.muster?.ownerId,
      musterTileUpdatedAt: musterTile?.muster?.updatedAt,
      required,
      closest: closest ? { x: closest.tile.x, y: closest.tile.y, amount: closest.tile.muster?.amount, dist: closest.dist } : undefined,
      closestIsAdjacentOrLinked,
      musterTransitReserved: state.musterTransitByTile.has(entry.musterTileKey),
      alreadyQueued: state.queuedTargetKeys.has(targetKey),
      musterRequestedAt: entry.musterRequestedAt
    };
    const signature = JSON.stringify(debugPayload);
    const lastSignature = musterPromotionDebugLastSignatureByTarget.get(targetKey);
    const lastLoggedAt = musterPromotionDebugLastLoggedAtByTarget.get(targetKey) ?? 0;
    if (signature !== lastSignature || Date.now() - lastLoggedAt >= MUSTER_PROMOTION_DEBUG_LOG_INTERVAL_MS) {
      attackSyncLog("pending-muster-attack-check", debugPayload);
      musterPromotionDebugLastSignatureByTarget.set(targetKey, signature);
      musterPromotionDebugLastLoggedAtByTarget.set(targetKey, Date.now());
    }

    if (!closest || !closestIsAdjacentOrLinked) {
      if (!dropStuckPendingMusterAttack(state, entry, deps.pushFeed)) remaining.push(entry);
      continue;
    }

    // Muster is ready — promote to action queue.
    if (!state.queuedTargetKeys.has(targetKey)) {
      attackSyncLog("pending-muster-attack-promoted", { targetKey, closest: { x: closest.tile.x, y: closest.tile.y, amount: closest.tile.muster?.amount }, required });
      state.actionQueue.push({ x: entry.targetX, y: entry.targetY });
      state.queuedTargetKeys.add(targetKey);
      deps.pushFeed(`Muster ready — launching attack on (${entry.targetX}, ${entry.targetY})`, "combat", "info");
    }
  }
  // Stop the server's fast per-second tick once nothing is left watching
  // for it — the watched-tile mechanism is scoped to whatever's actively
  // driving the Mustering overlay, not a standing subscription.
  if (remaining.length === 0 && state.pendingMusterAttacks.length > 0) {
    deps.sendGameMessage?.({ type: "UNWATCH_MUSTER" });
  }
  state.pendingMusterAttacks = remaining;
};

export const processActionQueue = (
  state: ClientState,
  deps: {
    ws: RealtimeSocket;
    authSessionReady: boolean;
    keyFor: (x: number, y: number) => string;
    isAdjacent: (ax: number, ay: number, bx: number, by: number) => boolean;
    isTileOwnedByAlly: (tile: Tile) => boolean;
    pickOriginForTarget: (x: number, y: number, preferBreakthrough?: boolean, allowOptimisticOrigin?: boolean) => Tile | undefined;
    notifyInsufficientGoldForFrontierAction: (action: "claim" | "attack") => void;
    applyOptimisticTileState: (x: number, y: number, update: (tile: Tile) => void) => void;
    pushFeed: (message: string, type?: "combat" | "mission" | "error" | "info" | "alliance" | "tech", severity?: "info" | "success" | "warn" | "error") => void;
    renderHud: () => void;
    sendSetMuster: (x: number, y: number, mode: "HOLD") => void;
    sendAttack: (fromX: number, fromY: number, toX: number, toY: number, commandId: string, clientSeq: number) => void;
    sendGameMessage?: (payload: unknown) => boolean;
  }
): boolean => {
  if (state.actionInFlight || deps.ws.readyState !== deps.ws.OPEN || !deps.authSessionReady) return false;
  topUpFromWaypoint(state, deps.keyFor, deps.pushFeed, deps.sendGameMessage);
  // ~13.5s of retries (15 * 900ms) before giving up on a confirmed origin
  // and falling back to the optimistic one, so a queued attack can never
  // stall forever with nothing else visibly ahead of it.
  const MAX_CONFIRMED_ORIGIN_WAIT_ATTEMPTS = 15;
  let deferredFrontierSyncTargets = 0;
  while (state.actionQueue.length > 0) {
    const next = state.actionQueue[0];
    if (!next) return false;

    const targetKey = deps.keyFor(next.x, next.y);
    const logActionQueue = (scope: string, payload: Record<string, unknown>): void => {
      if (!tileMatchesDebugKey(next.x, next.y, 1, { fallbackTile: state.selected })) return;
      debugTileLog(scope, payload);
    };
    const logFrontierQueue = (
      scope: string,
      args?: {
        before?: Tile | undefined;
        incoming?: Tile | undefined;
        after?: Tile | undefined;
        extra?: Record<string, unknown>;
      }
    ): void => {
      const timelineArgs = {
        x: next.x,
        y: next.y,
        ...(args?.before ? { before: args.before } : {}),
        ...(args?.incoming ? { incoming: args.incoming } : {}),
        ...(args?.after ? { after: args.after } : {}),
        state,
        keyFor: deps.keyFor,
        ...(args?.extra ? { extra: args.extra } : {})
      };
      debugTileTimeline(scope, timelineArgs);
    };
    const frontierSyncWaitUntil = state.frontierSyncWaitUntilByTarget.get(targetKey) ?? 0;
    if (frontierSyncWaitUntil > Date.now()) {
      logActionQueue("action-queue-wait", {
        targetKey,
        waitMs: Math.max(0, frontierSyncWaitUntil - Date.now()),
        queueLength: state.actionQueue.length
      });
      logFrontierQueue("frontier-queue-wait", {
        before: state.tiles.get(targetKey),
        after: state.tiles.get(targetKey),
        extra: {
          waitMs: Math.max(0, frontierSyncWaitUntil - Date.now()),
          queueLength: state.actionQueue.length
        }
      });
      const blocked = state.actionQueue.shift();
      if (!blocked) return false;
      state.actionQueue.push(blocked);
      deferredFrontierSyncTargets += 1;
      if (deferredFrontierSyncTargets >= state.actionQueue.length) return false;
      continue;
    }
    const to = state.tiles.get(targetKey);
    if (!to) {
      logActionQueue("action-queue-drop-missing-target", {
        targetKey,
        queueLength: state.actionQueue.length
      });
      logFrontierQueue("frontier-queue-drop-missing", {
        extra: {
          queueLength: state.actionQueue.length
        }
      });
      state.actionQueue.shift();
      state.queuedTargetKeys.delete(targetKey);
      state.confirmedOriginWaitAttemptsByTarget.delete(targetKey);
      continue;
    }
    if (to.ownerId && to.ownerId !== state.me && deps.isTileOwnedByAlly(to)) {
      logActionQueue("action-queue-drop-ally-target", {
        targetKey,
        toOwnerId: to.ownerId,
        queueLength: state.actionQueue.length
      });
      logFrontierQueue("frontier-queue-drop-ally", {
        before: to,
        after: to,
        extra: {
          toOwnerId: to.ownerId,
          queueLength: state.actionQueue.length
        }
      });
      state.actionQueue.shift();
      state.queuedTargetKeys.delete(targetKey);
      state.confirmedOriginWaitAttemptsByTarget.delete(targetKey);
      continue;
    }
    if (to.ownerId === state.me) {
      logActionQueue("action-queue-drop-owned-target", {
        targetKey,
        ownerId: to.ownerId,
        ownershipState: to.ownershipState
      });
      logFrontierQueue("frontier-queue-drop-owned", {
        before: to,
        after: to,
        extra: {
          ownerId: to.ownerId,
          ownershipState: to.ownershipState
        }
      });
      state.actionQueue.shift();
      state.queuedTargetKeys.delete(targetKey);
      state.confirmedOriginWaitAttemptsByTarget.delete(targetKey);
      continue;
    }

    const allowOptimisticOrigin = Boolean(to.ownerId);
    let from = deps.pickOriginForTarget(to.x, to.y, false, allowOptimisticOrigin);
    const optimisticFrom = deps.pickOriginForTarget(to.x, to.y, false, true);
    const selectedFrom = state.selected ? state.tiles.get(deps.keyFor(state.selected.x, state.selected.y)) : undefined;
    if (
      !from &&
      selectedFrom &&
      selectedFrom.ownerId === state.me &&
      deps.isAdjacent(selectedFrom.x, selectedFrom.y, to.x, to.y) &&
      selectedFrom.optimisticPending !== "expand"
    ) {
      from = selectedFrom;
    }
    if (!from && optimisticFrom) {
      const confirmedOriginWaitAttempts = (state.confirmedOriginWaitAttemptsByTarget.get(targetKey) ?? 0) + 1;
      if (confirmedOriginWaitAttempts > MAX_CONFIRMED_ORIGIN_WAIT_ATTEMPTS) {
        // The confirmed origin never showed up after repeated waits (e.g. the
        // adjacent tile's own optimistic EXPAND never got acked). Rather than
        // requeue forever with nothing visibly ahead of it, fall back to the
        // optimistic origin so the attack actually dispatches.
        logActionQueue("action-queue-fallback-optimistic-origin", {
          targetKey,
          attempts: confirmedOriginWaitAttempts,
          optimisticFrom: { x: optimisticFrom.x, y: optimisticFrom.y, ownerId: optimisticFrom.ownerId }
        });
        state.confirmedOriginWaitAttemptsByTarget.delete(targetKey);
        from = optimisticFrom;
      } else {
        state.confirmedOriginWaitAttemptsByTarget.set(targetKey, confirmedOriginWaitAttempts);
        const existingWaitUntil = state.frontierSyncWaitUntilByTarget.get(targetKey) ?? 0;
        const waitUntil = Math.max(existingWaitUntil, Date.now() + 900);
        state.frontierSyncWaitUntilByTarget.set(targetKey, waitUntil);
        logActionQueue("action-queue-wait-confirmed-origin", {
          targetKey,
          waitMs: Math.max(0, waitUntil - Date.now()),
          queueLength: state.actionQueue.length,
          attempts: confirmedOriginWaitAttempts,
          optimisticFrom: { x: optimisticFrom.x, y: optimisticFrom.y, ownerId: optimisticFrom.ownerId }
        });
        logFrontierQueue("frontier-queue-wait-confirmed-origin", {
          before: to,
          after: to,
          extra: {
            waitMs: Math.max(0, waitUntil - Date.now()),
            attempts: confirmedOriginWaitAttempts,
            optimisticFrom: { x: optimisticFrom.x, y: optimisticFrom.y, ownerId: optimisticFrom.ownerId }
          }
        });
        const blocked = state.actionQueue.shift();
        if (!blocked) return false;
        state.actionQueue.push(blocked);
        deferredFrontierSyncTargets += 1;
        if (deferredFrontierSyncTargets >= state.actionQueue.length) return false;
        continue;
      }
    }
    if (!from && to.ownerId && to.dockId) {
      logActionQueue("action-queue-drop-no-dock-origin", {
        targetKey,
        toOwnerId: to.ownerId,
        toOwnershipState: to.ownershipState,
        dockId: to.dockId,
      });
      state.actionQueue.shift();
      state.queuedTargetKeys.delete(targetKey);
      state.confirmedOriginWaitAttemptsByTarget.delete(targetKey);
      continue;
    }
    if (!from) {
      logActionQueue("action-queue-drop-no-origin", {
        targetKey,
        toOwnerId: to.ownerId,
        toOwnershipState: to.ownershipState,
        selected: state.selected,
        selectedFromOwnerId: selectedFrom?.ownerId,
        optimisticFrom: optimisticFrom ? { x: optimisticFrom.x, y: optimisticFrom.y, ownerId: optimisticFrom.ownerId } : undefined
      });
      logFrontierQueue("frontier-queue-drop-no-origin", {
        before: to,
        after: to,
        extra: {
          selected: state.selected,
          selectedFromOwnerId: selectedFrom?.ownerId
        }
      });
      state.actionQueue.shift();
      state.queuedTargetKeys.delete(targetKey);
      state.confirmedOriginWaitAttemptsByTarget.delete(targetKey);
      continue;
    }
    const fromKey = deps.keyFor(from.x, from.y);
    const originSyncWaitUntil = state.frontierSyncWaitUntilByTarget.get(fromKey) ?? 0;
    if (originSyncWaitUntil > Date.now()) {
      logActionQueue("action-queue-wait-origin-sync", {
        targetKey,
        originKey: fromKey,
        waitMs: Math.max(0, originSyncWaitUntil - Date.now()),
        queueLength: state.actionQueue.length
      });
      logFrontierQueue("frontier-queue-wait-origin-sync", {
        before: to,
        after: to,
        extra: {
          originKey: fromKey,
          waitMs: Math.max(0, originSyncWaitUntil - Date.now())
        }
      });
      const blocked = state.actionQueue.shift();
      if (!blocked) return false;
      state.actionQueue.push(blocked);
      deferredFrontierSyncTargets += 1;
      if (deferredFrontierSyncTargets >= state.actionQueue.length) return false;
      continue;
    }
    logActionQueue("action-queue-origin", {
      targetKey,
      from: { x: from.x, y: from.y },
      fromOwnerId: from.ownerId,
      fromOwnershipState: from.ownershipState,
      toOwnerId: to.ownerId,
      toOwnershipState: to.ownershipState,
      selected: state.selected,
      selectedFrom: selectedFrom ? { x: selectedFrom.x, y: selectedFrom.y, ownerId: selectedFrom.ownerId, ownershipState: selectedFrom.ownershipState } : undefined
    });
    state.actionQueue.shift();
    state.confirmedOriginWaitAttemptsByTarget.delete(targetKey);

    state.actionCurrent = {
      x: to.x,
      y: to.y,
      retries: next.retries ?? 0,
      actionType: !to.ownerId ? "EXPAND" : "ATTACK"
    };
    const { commandId, clientSeq } = createNextFrontierCommandIdentity(state);
    state.actionCurrent.commandId = commandId;
    state.actionCurrent.clientSeq = clientSeq;
    state.actionInFlight = true;
    state.actionAcceptedAck = false;
    state.combatStartAck = false;
    state.actionAcceptTimeoutHandledAt = 0;
    state.actionStartedAt = Date.now();
    state.actionTargetKey = targetKey;
    state.captureAlert = undefined;
    const optimisticMs = !to.ownerId ? frontierClaimDurationMsForTile(to.x, to.y) : 3_000;
    const existingCapture =
      state.capture && state.capture.target.x === to.x && state.capture.target.y === to.y ? state.capture : undefined;
    // Suppress the big "Capturing Territory..." overlay for EXPANDs on a
    // neutral tile by default — tile paint is enough feedback for queued/
    // chained claims. client-action-flow.ts's click handler flips this
    // back off for the one case that needs the overlay: a plain manual tap
    // that becomes the active capture immediately.
    const silent = !to.ownerId;
    const baseCapture = existingCapture ?? { startAt: Date.now(), resolvesAt: Date.now() + optimisticMs, target: { x: to.x, y: to.y } };
    state.capture = silent ? { ...baseCapture, silent: true } : baseCapture;
    const actionType = !to.ownerId ? "EXPAND" : "ATTACK";
    attackSyncLog("queue-dispatch", {
      actionType,
      target: { x: to.x, y: to.y },
      origin: { x: from.x, y: from.y },
      targetKey,
      toOwnerId: to.ownerId,
      toOwnershipState: to.ownershipState,
      retries: next.retries ?? 0,
      queueLengthAfterShift: state.actionQueue.length,
      wsReadyState: deps.ws.readyState,
      authSessionReady: deps.authSessionReady,
      optimisticMs
    });
    if (!to.ownerId) {
      logFrontierQueue("frontier-queue-started", {
        before: to,
        after: to,
        extra: {
          optimisticMs,
          from: { x: from.x, y: from.y }
        }
      });
    } else {
      logFrontierQueue("frontier-queue-started", {
        before: to,
        after: to,
        extra: {
          optimisticMs,
          from: { x: from.x, y: from.y }
        }
      });
    }
    resetAttackPreviewState(state);
    if (!to.ownerId) {
      // Frontier expand is free (FRONTIER_CLAIM_COST is 0 gold) — only manpower gates it.
      if (state.manpower < EXPAND_MANPOWER_COST) {
        deps.pushFeed(`Need ${EXPAND_MANPOWER_COST} manpower to claim this tile.`, "combat", "error");
        state.capture = undefined;
        state.actionInFlight = false;
        state.actionCurrent = undefined;
        state.actionTargetKey = "";
        state.actionAcceptedAck = false;
        state.combatStartAck = false;
        state.actionAcceptTimeoutHandledAt = 0;
        state.queuedTargetKeys.delete(targetKey);
        deps.renderHud();
        continue;
      }
      deps.ws.send(JSON.stringify({ type: "EXPAND", fromX: from.x, fromY: from.y, toX: to.x, toY: to.y, commandId, clientSeq }));
      attackSyncLog("send", {
        actionType: "EXPAND",
        target: { x: to.x, y: to.y },
        origin: { x: from.x, y: from.y },
        targetKey,
        startedAt: state.actionStartedAt,
        wsReadyState: deps.ws.readyState
      });
      logActionQueue("action-send", {
        type: "EXPAND",
        from: { x: from.x, y: from.y },
        to: { x: to.x, y: to.y },
        toOwnerId: to.ownerId,
        toOwnershipState: to.ownershipState
      });
    } else {
      // Attacking/claiming an owned tile is also free (FRONTIER_CLAIM_COST is 0 gold).
      if (to.ownerId !== "barbarian-1") {
        const closest = findClosestMuster(state, to.x, to.y);
        // A "ready" flag found by findClosestMuster must itself be adjacent (or dock-linked) to fire directly — merely "in range" gets NOT_ADJACENT server-side.
        const closestIsAdjacentOrLinked =
          closest != null &&
          (deps.isAdjacent(closest.tile.x, closest.tile.y, to.x, to.y) ||
            isDockCrossingBetween(state, closest.tile.x, closest.tile.y, to.x, to.y));
        if (!closest || closest.dist >= MUSTER_AUTO_FLAG_THRESHOLD_TILES || !closestIsAdjacentOrLinked) {
          // No flag itself sits adjacent — but the server auto-funds an ATTACK from any owned flag within remote-funding range of the firing tile (see hasFundedMusterWithinRange), same as ADVANCE already relies on. Fire from the normal border origin instead of parking behind a redundant new flag.
          if (hasFundedMusterWithinRange(state, from.x, from.y, requiredMusterForTarget(to))) {
            deps.sendAttack(from.x, from.y, to.x, to.y, commandId, clientSeq);
            deps.pushFeed("Launching attack — funded from a nearby muster flag", "combat", "info");
            deps.renderHud();
            continue;
          }
          // Nothing usable nearby — park the attack and auto-create a flag on the origin tile so troops begin mustering there.
          state.capture = undefined;
          state.actionInFlight = false;
          state.actionCurrent = undefined;
          state.actionTargetKey = "";
          state.actionAcceptedAck = false;
          state.combatStartAck = false;
          state.actionAcceptTimeoutHandledAt = 0;
          state.queuedTargetKeys.delete(targetKey);
          const musterTileKey = deps.keyFor(from.x, from.y);
          const playerHasAnyMuster = [...state.tiles.values()].some((t) => t.muster?.ownerId === state.me);
          const originAlreadyHasMuster = state.tiles.get(musterTileKey)?.muster?.ownerId === state.me;
          if (!originAlreadyHasMuster) {
            deps.sendSetMuster(from.x, from.y, "HOLD");
          }
          const alreadyPending = state.pendingMusterAttacks.some(
            (e) => e.targetX === to.x && e.targetY === to.y
          );
          if (!alreadyPending) {
            state.pendingMusterAttacks.push({ targetX: to.x, targetY: to.y, fromX: from.x, fromY: from.y, musterTileKey, queuedAt: Date.now(), ...(originAlreadyHasMuster ? {} : { musterRequestedAt: Date.now() }) });
            // The server only ticks muster amounts once per ~30s on the
            // regular schedule, but ticks any *watched* flag every 1s
            // (tickWatchedMusterTiles) — scoped per-player, no cost to
            // anyone else. Watching the flag that's now driving the
            // Mustering overlay makes its progress track close to
            // real-time instead of jumping in ~30s steps.
            deps.sendGameMessage?.({ type: "WATCH_MUSTER", x: from.x, y: from.y });
            const feedMsg = !closest || !playerHasAnyMuster
              ? `Staging flag near (${to.x}, ${to.y}) — attack queued`
              : `Closest flag is ${closest.dist} tiles away — staging flag closer to front, attack queued`;
            deps.pushFeed(feedMsg, "combat", "info");
          }
          deps.renderHud();
          continue;
        }
        // Flag found within range already has enough manpower staged
        // (findClosestMuster only returns flags at/above MUSTER_ATTACK_COST)
        // — fire the attack now from that flag instead of re-queuing it.
        deps.sendAttack(closest.tile.x, closest.tile.y, to.x, to.y, commandId, clientSeq);
        deps.pushFeed(
          `Launching attack from flag ${closest.dist} tile${closest.dist === 1 ? "" : "s"} away`,
          "combat",
          "info"
        );
        deps.renderHud();
        continue;
      }
      deps.sendAttack(from.x, from.y, to.x, to.y, commandId, clientSeq);
      attackSyncLog("send", {
        actionType: "ATTACK",
        target: { x: to.x, y: to.y },
        origin: { x: from.x, y: from.y },
        targetKey,
        startedAt: state.actionStartedAt,
        wsReadyState: deps.ws.readyState
      });
      logActionQueue("action-send", {
        type: "ATTACK",
        from: { x: from.x, y: from.y },
        to: { x: to.x, y: to.y },
        toOwnerId: to.ownerId,
        toOwnershipState: to.ownershipState
      });
      deps.pushFeed(`Queued attack (${to.x}, ${to.y}) from (${from.x}, ${from.y})`, "combat", "info");
    }
    state.selected = { x: to.x, y: to.y };
    deps.renderHud();
    return true;
  }
  return false;
};

export const requestAttackPreviewForHover = (
  state: ClientState,
  deps: {
    ws: RealtimeSocket;
    authSessionReady: boolean;
    keyFor: (x: number, y: number) => string;
    pickOriginForTarget: (x: number, y: number) => Tile | undefined;
  }
): void => {
  if (deps.ws.readyState !== deps.ws.OPEN) return;
  if (!deps.authSessionReady) return;
  if (state.actionInFlight || state.capture) return;
  if (!state.hover) return;
  const hoveredTile = state.tiles.get(deps.keyFor(state.hover.x, state.hover.y));
  if (!hoveredTile) return;

  if (state.selected) {
    const from = state.tiles.get(deps.keyFor(state.selected.x, state.selected.y));
    if (from && from.ownerId === state.me && hoveredTile.ownerId && hoveredTile.ownerId !== state.me && !hoveredTile.fogged) {
      requestAttackPreview(
        state,
        {
          fromKey: deps.keyFor(from.x, from.y),
          toKey: deps.keyFor(hoveredTile.x, hoveredTile.y),
          fromX: from.x,
          fromY: from.y,
          toX: hoveredTile.x,
          toY: hoveredTile.y
        },
        deps
      );
      return;
    }
  }

  if (!hoveredTile.ownerId || hoveredTile.ownerId === state.me || hoveredTile.fogged) return;
  const from = deps.pickOriginForTarget(hoveredTile.x, hoveredTile.y);
  if (!from && !hoveredTile.dockId) return;
  if (from && from.ownerId !== state.me) return;
  requestAttackPreview(
    state,
    {
      fromKey: deps.keyFor(from?.x ?? hoveredTile.x, from?.y ?? hoveredTile.y),
      toKey: deps.keyFor(hoveredTile.x, hoveredTile.y),
      fromX: from?.x ?? hoveredTile.x,
      fromY: from?.y ?? hoveredTile.y,
      toX: hoveredTile.x,
      toY: hoveredTile.y
    },
    deps
  );
};

export const requestAttackPreviewForTarget = (
  state: ClientState,
  to: Tile,
  deps: {
    ws: RealtimeSocket;
    authSessionReady: boolean;
    keyFor: (x: number, y: number) => string;
    pickOriginForTarget: (x: number, y: number) => Tile | undefined;
    onPreviewTimeout?: () => void;
  }
): void => {
  if (deps.ws.readyState !== deps.ws.OPEN) return;
  if (!deps.authSessionReady) return;
  if (state.actionInFlight || state.capture) return;
  if (!to.ownerId || to.ownerId === state.me || to.fogged) return;
  const from = deps.pickOriginForTarget(to.x, to.y);
  if (!from && !to.dockId) return;
  if (from && from.ownerId !== state.me) return;
  const fromKey = deps.keyFor(from?.x ?? to.x, from?.y ?? to.y);
  const toKey = deps.keyFor(to.x, to.y);
  requestAttackPreview(
    state,
    {
      fromKey,
      toKey,
      fromX: from?.x ?? to.x,
      fromY: from?.y ?? to.y,
      toX: to.x,
      toY: to.y
    },
    deps,
    { useCache: false, throttle: false }
  );
};

export const attackPreviewDetailForTarget = (
  state: ClientState,
  to: Tile,
  deps: {
    keyFor: (x: number, y: number) => string;
    pickOriginForTarget: (x: number, y: number) => Tile | undefined;
  }
): string | undefined => {
  const from = deps.pickOriginForTarget(to.x, to.y);
  const toKey = deps.keyFor(to.x, to.y);
  const preview = resolvedAttackPreviewForTarget(
    state,
    from
      ? { fromKey: deps.keyFor(from.x, from.y), toKey, dockFallback: Boolean(to.dockId) }
      : { toKey, dockFallback: Boolean(to.dockId) }
  );
  if (!preview) return undefined;
  if (!preview.valid) return preview.reason ? `Attack ${preview.reason}` : undefined;
  if (typeof preview.winChance === "number") return `${Math.round(preview.winChance * 100)}% win chance`;
  return undefined;
};

export const attackPreviewManpowerCostForTarget = (
  state: ClientState,
  to: Tile,
  deps: {
    keyFor: (x: number, y: number) => string;
    pickOriginForTarget: (x: number, y: number) => Tile | undefined;
  }
): string | undefined => {
  const from = deps.pickOriginForTarget(to.x, to.y);
  const toKey = deps.keyFor(to.x, to.y);
  const preview = resolvedAttackPreviewForTarget(
    state,
    from
      ? { fromKey: deps.keyFor(from.x, from.y), toKey, dockFallback: Boolean(to.dockId) }
      : { toKey, dockFallback: Boolean(to.dockId) }
  );
  if (!preview || !preview.valid) return undefined;
  if (
    typeof preview.manpowerMin !== "number" ||
    typeof preview.winChance !== "number" ||
    typeof preview.atkEff !== "number" ||
    typeof preview.defEff !== "number"
  ) {
    return undefined;
  }
  const estimate = estimatedAttackManpowerLoss(preview.manpowerMin, preview.winChance, preview.atkEff, preview.defEff);
  return `est. ${Math.round(estimate)} manpower`;
};

// The full base/infrastructure/battle breakdown for the "verify the math"
// panel next to the Launch Attack button — same source data as
// attackPreviewDetailForTarget's win-chance %, just unformatted so the UI
// can render each tier.
export const attackPreviewBreakdownForTarget = (
  state: ClientState,
  to: Tile,
  deps: {
    keyFor: (x: number, y: number) => string;
    pickOriginForTarget: (x: number, y: number) => Tile | undefined;
  }
): TileCombatBreakdown | undefined => {
  const from = deps.pickOriginForTarget(to.x, to.y);
  const toKey = deps.keyFor(to.x, to.y);
  const preview = resolvedAttackPreviewForTarget(
    state,
    from
      ? { fromKey: deps.keyFor(from.x, from.y), toKey, dockFallback: Boolean(to.dockId) }
      : { toKey, dockFallback: Boolean(to.dockId) }
  );
  if (!preview || !preview.valid || !preview.attacker || !preview.defender || typeof preview.winChance !== "number") return undefined;
  return { winChance: preview.winChance, attacker: preview.attacker, defender: preview.defender };
};

export const attackPreviewPendingForTarget = (
  state: ClientState,
  to: Tile,
  deps: {
    keyFor: (x: number, y: number) => string;
    pickOriginForTarget: (x: number, y: number) => Tile | undefined;
  }
): boolean => {
  const from = deps.pickOriginForTarget(to.x, to.y);
  const toKey = deps.keyFor(to.x, to.y);
  const preview = resolvedAttackPreviewForTarget(
    state,
    from
      ? { fromKey: deps.keyFor(from.x, from.y), toKey, dockFallback: Boolean(to.dockId) }
      : { toKey, dockFallback: Boolean(to.dockId) }
  );
  if (preview) return false;
  if (from) return state.attackPreviewPendingKey === attackPreviewKey(deps.keyFor(from.x, from.y), toKey);
  if (!to.dockId) return false;
  return state.attackPreviewPendingKey === attackPreviewKey(toKey, toKey);
};
