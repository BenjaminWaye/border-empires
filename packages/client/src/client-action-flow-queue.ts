import {
  activeSettlementProgressEntries as activeSettlementProgressEntriesFromModule,
  applyPendingSettlementsFromServer as applyPendingSettlementsFromServerFromModule,
  attackPreviewDetailForTarget as attackPreviewDetailForTargetFromModule,
  attackQueueFailureReason as attackQueueFailureReasonFromModule,
  buildFrontierQueue as buildFrontierQueueFromModule,
  cancelQueuedBuild as cancelQueuedBuildFromModule,
  cancelQueuedSettlement as cancelQueuedSettlementFromModule,
  cleanupExpiredSettlementProgress as cleanupExpiredSettlementProgressFromModule,
  clearSettlementProgressByKey as clearSettlementProgressByKeyFromModule,
  clearSettlementProgressForTile as clearSettlementProgressForTileFromModule,
  developmentSlotReason as developmentSlotReasonFromModule,
  developmentSlotSummary as developmentSlotSummaryFromModule,
  dropQueuedTargetKeyIfAbsent as dropQueuedTargetKeyIfAbsentFromModule,
  enqueueTarget as enqueueTargetFromModule,
  primarySettlementProgress as primarySettlementProgressFromModule,
  processActionQueue as processActionQueueFromModule,
  processDevelopmentQueue as processDevelopmentQueueFromModule,
  queueDevelopmentAction as queueDevelopmentActionFromModule,
  queueSpecificTargets as queueSpecificTargetsFromModule,
  queuedBuildEntryForTile as queuedBuildEntryForTileFromModule,
  queuedDevelopmentEntryForTile as queuedDevelopmentEntryForTileFromModule,
  queuedSettlementIndexForTile as queuedSettlementIndexForTileFromModule,
  reconcileActionQueue as reconcileActionQueueFromModule,
  requestAttackPreviewForHover as requestAttackPreviewForHoverFromModule,
  requestAttackPreviewForTarget as requestAttackPreviewForTargetFromModule,
  requestSettlement as requestSettlementFromModule,
  sendDevelopmentBuild as sendDevelopmentBuildFromModule,
  settlementProgressForTile as settlementProgressForTileFromModule,
  syncOptimisticSettlementTile as syncOptimisticSettlementTileFromModule,
  type DevelopmentSlotSummary
} from "./client-queue-logic.js";
import type { ClientState } from "./client-state.js";
import type { OptimisticStructureKind, Tile, TileTimedProgress } from "./client-types.js";

type ActionFlowQueueContext = Record<string, any> & {
  state: ClientState;
  ws: WebSocket;
};

export const createClientActionFlowQueue = (ctx: ActionFlowQueueContext) => {
  const { state, ws } = ctx;

  type QueuedDevelopmentAction = ClientState["developmentQueue"][number];

  const enqueueTarget = (x: number, y: number, mode: "normal" | "breakthrough" = "normal"): boolean =>
    enqueueTargetFromModule(state, x, y, ctx.keyFor, mode);

  const buildFrontierQueue = (
    candidates: string[],
    enqueue: (x: number, y: number) => boolean
  ): { queued: number; skipped: number; queuedKeys: string[] } =>
    buildFrontierQueueFromModule(state, candidates, {
      keyFor: ctx.keyFor,
      parseKey: ctx.parseKey,
      wrapX: ctx.wrapX,
      wrapY: ctx.wrapY,
      enqueue
    });

  const queueDragSelection = (): { queued: number; skipped: number } =>
    buildFrontierQueue([...state.dragPreviewKeys], (x, y) => enqueueTarget(x, y));

  const queueDevelopmentAction = (entry: QueuedDevelopmentAction): boolean =>
    queueDevelopmentActionFromModule(state, entry, { pushFeed: ctx.pushFeed, renderHud: ctx.renderHud });

  const developmentSlotSummary = (): DevelopmentSlotSummary =>
    developmentSlotSummaryFromModule(state, { busyDevelopmentProcessCount: ctx.busyDevelopmentProcessCount });

  const developmentSlotReason = (summary = developmentSlotSummary()): string => developmentSlotReasonFromModule(summary);

  const syncOptimisticSettlementTile = (x: number, y: number, awaitingServerConfirm: boolean): void =>
    syncOptimisticSettlementTileFromModule(state, x, y, awaitingServerConfirm, {
      applyOptimisticTileState: ctx.applyOptimisticTileState
    });

  const clearSettlementProgressByKey = (tileKey: string): void =>
    clearSettlementProgressByKeyFromModule(state, tileKey, { clearOptimisticTileState: ctx.clearOptimisticTileState });

  const clearSettlementProgressForTile = (x: number, y: number): void =>
    clearSettlementProgressForTileFromModule(state, x, y, {
      keyFor: ctx.keyFor,
      clearSettlementProgressByKey
    });

  const settlementProgressForTile = (x: number, y: number): TileTimedProgress | undefined =>
    settlementProgressForTileFromModule(state, x, y, {
      keyFor: ctx.keyFor,
      syncOptimisticSettlementTile,
      requestViewRefresh: ctx.requestViewRefresh
    });

  const queuedDevelopmentEntryForTile = (tileKey: string): QueuedDevelopmentAction | undefined =>
    queuedDevelopmentEntryForTileFromModule(state, tileKey);

  const queuedSettlementIndexForTile = (tileKey: string): number => queuedSettlementIndexForTileFromModule(state, tileKey);

  const queuedBuildEntryForTile = (tileKey: string) => queuedBuildEntryForTileFromModule(state, tileKey);

  const cancelQueuedSettlement = (tileKey: string): boolean =>
    cancelQueuedSettlementFromModule(state, tileKey, { pushFeed: ctx.pushFeed, renderHud: ctx.renderHud });

  const cancelQueuedBuild = (tileKey: string): boolean =>
    cancelQueuedBuildFromModule(state, tileKey, { pushFeed: ctx.pushFeed, renderHud: ctx.renderHud });

  const cleanupExpiredSettlementProgress = (): boolean =>
    cleanupExpiredSettlementProgressFromModule(state, {
      syncOptimisticSettlementTile,
      clearSettlementProgressByKey,
      requestViewRefresh: ctx.requestViewRefresh
    });

  const activeSettlementProgressEntries = (): TileTimedProgress[] =>
    activeSettlementProgressEntriesFromModule(state, { cleanupExpiredSettlementProgress });

  const primarySettlementProgress = (): TileTimedProgress | undefined =>
    primarySettlementProgressFromModule(state, { settlementProgressForTile, activeSettlementProgressEntries });

  const requestSettlement = (
    x: number,
    y: number,
    opts?: { allowQueueWhenBusy?: boolean; fromQueue?: boolean; suppressWarnings?: boolean }
  ): boolean =>
    requestSettlementFromModule(state, x, y, {
      keyFor: ctx.keyFor,
      pushFeed: ctx.pushFeed,
      renderHud: ctx.renderHud,
      queueDevelopmentAction,
      developmentSlotSummary,
      developmentSlotReason,
      sendGameMessage: ctx.sendGameMessage,
      syncOptimisticSettlementTile,
      ...(opts ? { opts } : {})
    });

  const sendDevelopmentBuild = (
    payload: ClientState["developmentQueue"][number] extends infer T ? T extends { kind: "BUILD"; payload: infer P } ? P : never : never,
    optimistic: () => void,
    opts: {
      x: number;
      y: number;
      label: string;
      optimisticKind: OptimisticStructureKind;
      allowQueueWhenBusy?: boolean;
      fromQueue?: boolean;
      suppressWarnings?: boolean;
    }
  ): boolean =>
    sendDevelopmentBuildFromModule(state, payload, optimistic, opts, {
      keyFor: ctx.keyFor,
      queueDevelopmentAction,
      developmentSlotSummary,
      developmentSlotReason,
      pushFeed: ctx.pushFeed,
      renderHud: ctx.renderHud,
      sendGameMessage: ctx.sendGameMessage
    });

  const processDevelopmentQueue = (): boolean =>
    processDevelopmentQueueFromModule(state, {
      ws,
      authSessionReady: state.authSessionReady,
      developmentSlotSummary,
      requestSettlement: (x: number, y: number, opts?: Record<string, unknown>) => requestSettlement(x, y, opts),
      sendDevelopmentBuild: (payload: unknown, optimistic: () => void, opts: Record<string, unknown>) =>
        sendDevelopmentBuild(payload as never, optimistic, opts as never),
      applyOptimisticStructureBuild: ctx.applyOptimisticStructureBuild,
      applyOptimisticStructureRemoval: ctx.applyOptimisticStructureRemoval,
      pushFeed: ctx.pushFeed,
      renderHud: ctx.renderHud
    });

  const attackQueueFailureReason = (tile: Tile, mode: "normal" | "breakthrough"): string =>
    attackQueueFailureReasonFromModule(state, tile, mode, {
      ownerSpawnShieldActive: ctx.ownerSpawnShieldActive,
      hasBreakthroughCapability: () => Boolean(ctx.hasBreakthroughCapability?.()),
      pickOriginForTarget: ctx.pickOriginForTarget
    });

  const dropQueuedTargetKeyIfAbsent = (targetKey: string): void =>
    dropQueuedTargetKeyIfAbsentFromModule(state, targetKey, { keyFor: ctx.keyFor });

  const reconcileActionQueue = (): void =>
    reconcileActionQueueFromModule(state, {
      keyFor: ctx.keyFor,
      pickOriginForTarget: ctx.pickOriginForTarget,
      clearOptimisticTileState: ctx.clearOptimisticTileState
    });

  const processActionQueue = (): boolean =>
    processActionQueueFromModule(state, {
      ws,
      authSessionReady: state.authSessionReady,
      keyFor: ctx.keyFor,
      isAdjacent: ctx.isAdjacent,
      pickOriginForTarget: ctx.pickOriginForTarget,
      notifyInsufficientGoldForFrontierAction: ctx.notifyInsufficientGoldForFrontierAction,
      applyOptimisticTileState: ctx.applyOptimisticTileState,
      pushFeed: ctx.pushFeed,
      renderHud: ctx.renderHud
    });

  const applyPendingSettlementsFromServer = (
    entries: Array<{ x: number; y: number; startedAt: number; resolvesAt: number }> | undefined
  ): void =>
    applyPendingSettlementsFromServerFromModule(state, entries, {
      keyFor: ctx.keyFor,
      syncOptimisticSettlementTile,
      clearOptimisticTileState: ctx.clearOptimisticTileState,
      requestViewRefresh: ctx.requestViewRefresh
    });

  const queueSpecificTargets = (
    targetKeys: string[],
    mode: "normal" | "breakthrough"
  ): { queued: number; skipped: number; queuedKeys: string[] } =>
    queueSpecificTargetsFromModule(state, targetKeys, mode, {
      parseKey: ctx.parseKey,
      keyFor: ctx.keyFor,
      isTileOwnedByAlly: (tile: Tile) => Boolean(ctx.isTileOwnedByAlly?.(tile)),
      pickOriginForTarget: ctx.pickOriginForTarget,
      enqueueTarget,
      buildFrontierQueue
    });

  const requestAttackPreviewForHover = (): void =>
    requestAttackPreviewForHoverFromModule(state, {
      ws,
      authSessionReady: state.authSessionReady,
      keyFor: ctx.keyFor
    });

  const requestAttackPreviewForTarget = (to: Tile): void =>
    requestAttackPreviewForTargetFromModule(state, to, {
      ws,
      authSessionReady: state.authSessionReady,
      keyFor: ctx.keyFor,
      pickOriginForTarget: ctx.pickOriginForTarget
    });

  const attackPreviewDetailForTarget = (to: Tile, mode: "normal" | "breakthrough" = "normal"): string | undefined =>
    attackPreviewDetailForTargetFromModule(state, to, { keyFor: ctx.keyFor, pickOriginForTarget: ctx.pickOriginForTarget }, mode);

  const applyCombatOutcomeMessage = (msg: Record<string, unknown>, opts?: { predicted?: boolean }): void => {
    const target = msg.target as { x: number; y: number } | undefined;
    const targetBefore = target ? state.tiles.get(ctx.keyFor(target.x, target.y)) : undefined;
    const origin = msg.origin as { x: number; y: number } | undefined;
    const originBefore = origin ? state.tiles.get(ctx.keyFor(origin.x, origin.y)) : undefined;
    const changes =
      (msg.changes as Array<{ x: number; y: number; ownerId?: string; ownershipState?: "FRONTIER" | "SETTLED" | "BARBARIAN"; breachShockUntil?: number }>) ?? [];
    const resolvedCaptureTargetKey = state.capture ? ctx.keyFor(state.capture.target.x, state.capture.target.y) : "";
    for (const c of changes) {
      const tileKey = ctx.keyFor(c.x, c.y);
      state.incomingAttacksByTile.delete(tileKey);
      const existing = state.tiles.get(tileKey);
      const incoming: Tile = { ...(existing ?? { x: c.x, y: c.y, terrain: ctx.terrainAt(c.x, c.y), fogged: false }), x: c.x, y: c.y, fogged: false };
      if (c.ownerId) incoming.ownerId = c.ownerId;
      else delete incoming.ownerId;
      if (c.ownershipState) incoming.ownershipState = c.ownershipState;
      else if (!c.ownerId) delete incoming.ownershipState;
      if (typeof c.breachShockUntil === "number") incoming.breachShockUntil = c.breachShockUntil;
      else if ("breachShockUntil" in c && !c.breachShockUntil) delete incoming.breachShockUntil;
      const merged = ctx.mergeServerTileWithOptimisticState(incoming);
      if (!merged.optimisticPending) ctx.clearOptimisticTileState(tileKey);
      state.tiles.set(tileKey, merged);
    }
    const resultAlert = ctx.combatResolutionAlert(msg, { targetTileBefore: targetBefore, originTileBefore: originBefore });
    const resultTargetKey = target ? ctx.keyFor(target.x, target.y) : "";
    const predictedAlreadyShown = Boolean(
      (state.pendingCombatReveal &&
        state.pendingCombatReveal.targetKey === resultTargetKey &&
        state.pendingCombatReveal.revealed &&
        state.pendingCombatReveal.title === resultAlert.title &&
        state.pendingCombatReveal.detail === resultAlert.detail) ||
        (resultTargetKey &&
          ctx.wasPredictedCombatAlreadyShown(state.revealedPredictedCombatByKey, resultTargetKey, resultAlert.title, resultAlert.detail))
    );
    if (!predictedAlreadyShown) {
      ctx.pushFeed(resultAlert.detail, "combat", resultAlert.tone === "success" ? "success" : "warn");
      ctx.showCaptureAlert(resultAlert.title, resultAlert.detail, resultAlert.tone, resultAlert.manpowerLoss);
    }
    if (resultTargetKey) {
      if (opts?.predicted) state.revealedPredictedCombatByKey.set(resultTargetKey, { title: resultAlert.title, detail: resultAlert.detail });
      else state.revealedPredictedCombatByKey.delete(resultTargetKey);
    }
    if (state.pendingCombatReveal && state.pendingCombatReveal.targetKey === resultTargetKey) state.pendingCombatReveal = undefined;
    const resolvedCurrentKey = state.actionCurrent ? ctx.keyFor(state.actionCurrent.x, state.actionCurrent.y) : "";
    const targetKey = resolvedCaptureTargetKey || state.actionTargetKey;
    let handedOffToSettle = false;
    if (targetKey && state.autoSettleTargets.has(targetKey)) {
      const settledTile = state.tiles.get(targetKey);
      if (settledTile && settledTile.ownerId === state.me && settledTile.ownershipState === "FRONTIER" && requestSettlement(settledTile.x, settledTile.y)) {
        handedOffToSettle = true;
        ctx.pushFeed(`Auto-settle started at (${settledTile.x}, ${settledTile.y}).`, "combat", "info");
      }
      state.autoSettleTargets.delete(targetKey);
    }
    state.capture = undefined;
    if (!handedOffToSettle) {
      state.actionInFlight = false;
      state.combatStartAck = false;
      state.actionStartedAt = 0;
      if (targetKey) dropQueuedTargetKeyIfAbsent(targetKey);
      if (resolvedCurrentKey) dropQueuedTargetKeyIfAbsent(resolvedCurrentKey);
      const startedNext = processActionQueue();
      if (!startedNext) {
        state.actionTargetKey = "";
        state.actionCurrent = undefined;
      }
    }
    for (const change of changes) {
      if (change.ownerId === state.me && change.ownershipState === "SETTLED") clearSettlementProgressForTile(change.x, change.y);
    }
    state.attackPreview = undefined;
    state.attackPreviewPendingKey = "";
    ctx.renderHud();
  };

  return {
    enqueueTarget,
    buildFrontierQueue,
    queueDragSelection,
    queueDevelopmentAction,
    developmentSlotSummary,
    developmentSlotReason,
    syncOptimisticSettlementTile,
    clearSettlementProgressByKey,
    clearSettlementProgressForTile,
    settlementProgressForTile,
    queuedDevelopmentEntryForTile,
    queuedSettlementIndexForTile,
    queuedBuildEntryForTile,
    cancelQueuedSettlement,
    cancelQueuedBuild,
    cleanupExpiredSettlementProgress,
    activeSettlementProgressEntries,
    primarySettlementProgress,
    requestSettlement,
    sendDevelopmentBuild,
    processDevelopmentQueue,
    attackQueueFailureReason,
    dropQueuedTargetKeyIfAbsent,
    reconcileActionQueue,
    processActionQueue,
    applyPendingSettlementsFromServer,
    queueSpecificTargets,
    requestAttackPreviewForHover,
    requestAttackPreviewForTarget,
    attackPreviewDetailForTarget,
    applyCombatOutcomeMessage
  };
};
