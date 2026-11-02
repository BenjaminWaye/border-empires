// Development-queue dispatch: Garrison (SETTLE) and structure builds, either
// sent straight away or held in the dev queue until a slot -- or, for a
// garrison, manpower -- frees up. Extracted from client-queue-logic.ts
// (oversized), which re-exports everything here.
import { SETTLE_COST, SETTLE_MANPOWER_COST } from "@border-empires/shared";
import { canAffordCost, settleDurationMsForTile } from "../client-constants.js";
import { debugTileLog, tileMatchesDebugKey } from "../client-debug/client-debug.js";
import {
  devQueueCancelWirePayload,
  persistDevelopmentQueueForPlayer,
  pruneExpiredAutoSettlementQueueVisibleHolds
} from "../client-development-queue/client-development-queue.js";
import { showVisibleActionWarning, type VisibleActionWarningDeps } from "../client-visible-action-warning.js";
import { resetAttackPreviewState } from "./client-attack-preview-logic.js";
import type { RealtimeSocket } from "../client-socket-types.js";
import type { ClientState } from "../client-state/client-state.js";
import type { OptimisticStructureKind } from "../client-types.js";

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
  | { type: "BUILD_SIEGE_BATTERY"; x: number; y: number }
  | { type: "BUILD_ECONOMIC_STRUCTURE"; x: number; y: number; structureType: string }
  | { type: "REMOVE_STRUCTURE"; x: number; y: number };


const numericEffect = (effects: Record<string, unknown> | undefined, key: string): number => {
  const raw = effects?.[key];
  return typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? raw : 1;
};

export const gatewayBuildWirePayload = (payload: QueuedBuildPayload): GatewayBuildWirePayload => {
  if (payload.type !== "BUILD_STRUCTURE") return payload;
  if (payload.structureType === "FORT") return { type: "BUILD_FORT", x: payload.x, y: payload.y };
  if (payload.structureType === "OBSERVATORY") return { type: "BUILD_OBSERVATORY", x: payload.x, y: payload.y };
  if (payload.structureType === "SIEGE_BATTERY") return { type: "BUILD_SIEGE_BATTERY", x: payload.x, y: payload.y };
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

const queuedSettlementShouldWait = (state: ClientState, tileKey: string): boolean => {
  if (!tileKey) return false;
  if (state.settleProgressByTile.has(tileKey)) return true;
  if (state.actionInFlight && state.actionTargetKey === tileKey) return true;
  if (state.capture && `${state.capture.target.x},${state.capture.target.y}` === tileKey) return true;
  const frontierSyncWaitUntil = state.frontierSyncWaitUntilByTarget.get(tileKey) ?? 0;
  return frontierSyncWaitUntil > Date.now();
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
    if (!deps.opts?.suppressWarnings) showVisibleActionWarning(deps, "Garrison blocked", "Cannot garrison: tile is not one of your frontier tiles.");
    deps.renderHud();
    return false;
  }
  if (state.manpower < SETTLE_MANPOWER_COST) { if (!deps.opts?.suppressWarnings) showVisibleActionWarning(deps, "Garrison blocked", `Need ${SETTLE_MANPOWER_COST} manpower to garrison this tile.`); deps.renderHud(); return false; }
  if (!canAffordCost(state.gold, SETTLE_COST)) { if (!deps.opts?.suppressWarnings) showVisibleActionWarning(deps, "Garrison blocked", `Need ${SETTLE_COST} coin to garrison this tile.`); deps.renderHud(); return false; }
  if (queuedSettlementShouldWait(state, tileKey)) {
    if (deps.opts?.allowQueueWhenBusy !== false && !deps.opts?.fromQueue) {
      return deps.queueDevelopmentAction({ kind: "SETTLE", x, y, tileKey, label: `Garrison at (${x}, ${y})` });
    }
    if (!deps.opts?.suppressWarnings) deps.pushFeed("Garrison queued: waiting for combat and tile sync to finish.", "combat", "info");
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
    return deps.queueDevelopmentAction({ kind: "SETTLE", x, y, tileKey, label: `Garrison at (${x}, ${y})` });
  }
  if (slots.available <= 0) {
    if (canQueue) {
      return deps.queueDevelopmentAction({ kind: "SETTLE", x, y, tileKey, label: `Garrison at (${x}, ${y})` });
    }
    if (!deps.opts?.suppressWarnings) showVisibleActionWarning(deps, "Development slots full", deps.developmentSlotReason(slots));
    deps.renderHud();
    return false;
  }
  state.lastDevelopmentAttempt = { kind: "SETTLE", x, y, tileKey, label: `Garrison at (${x}, ${y})` };
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
    }
    break;
  }
  if (started || state.developmentQueue.length === 0) deps.renderHud();
  return started;
};
