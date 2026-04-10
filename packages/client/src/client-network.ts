import { COMBAT_LOCK_MS } from "@border-empires/shared";
import type { ClientState } from "./client-state.js";
import { revealEmpireStatsFeedText } from "./client-empire-intel.js";
import { applyTechUpdateToState } from "./client-tech-update-state.js";
import { attackSyncLog, debugTileLog, debugTileTimeline, tileMatchesDebugKey, tileSyncDebugEnabled, verboseTileDebugEnabled } from "./client-debug.js";
import { clearSettlementProgressByKey as clearSettlementProgressByKeyFromModule, queueDevelopmentAction as queueDevelopmentActionFromModule } from "./client-queue-logic.js";

type NetworkDeps = Record<string, any> & {
  state: ClientState;
  ws: WebSocket;
  wsUrl: string;
  firebaseAuth?: any;
};

export const bindClientNetwork = (deps: NetworkDeps): void => {
  const {
    state,
    ws,
    wsUrl,
    firebaseAuth,
    keyFor,
    renderHud,
    setAuthStatus,
    syncAuthOverlay,
    authenticateSocket,
    pushFeed,
    pushFeedEntry,
    clearOptimisticTileState,
    requestViewRefresh,
    applyPendingSettlementsFromServer,
    mergeIncomingTileDetail,
    mergeServerTileWithOptimisticState,
    maybeAnnounceShardSite,
    markDockDiscovered,
    centerOnOwnedTile,
    authProfileNameEl,
    authProfileColorEl,
    defensibilityPctFromTE,
    clearPendingCollectVisibleDelta,
    seedProfileSetupFields,
    resetStrategicReplayState,
    setWorldSeed,
    clearRenderCaches,
    buildMiniMapBase,
    shardAlertKeyForPayload,
    showShardAlert,
    combatResolutionAlert,
    wasPredictedCombatAlreadyShown,
    showCaptureAlert,
    requestSettlement,
    dropQueuedTargetKeyIfAbsent,
    processActionQueue,
    clearSettlementProgressForTile,
    terrainAt,
    requestAttackPreviewForTarget,
    openSingleTileActionMenu,
    isTileOwnedByAlly,
    hideShardAlert,
    explainActionFailure,
    notifyInsufficientGoldForFrontierAction,
    clearSettlementProgressByKey,
    showCollectVisibleCooldownAlert,
    formatCooldownShort,
    reconcileActionQueue,
    revertOptimisticVisibleCollectDelta,
    revertOptimisticTileCollectDelta,
    clearPendingCollectTileDelta,
    playerNameForOwner
  } = deps;
  const logTileSync = (event: string, payload: Record<string, unknown>): void => {
    if (!tileSyncDebugEnabled()) return;
    console.info(`[tile-sync] ${event}`, payload);
  };
  const shouldResetFrontierActionStateForError =
    typeof deps.shouldResetFrontierActionStateForError === "function"
      ? deps.shouldResetFrontierActionStateForError
      : (errorCode: string): boolean => {
          if (!errorCode) return true;
          switch (errorCode) {
            case "SETTLE_INVALID":
            case "FORT_BUILD_INVALID":
            case "OBSERVATORY_BUILD_INVALID":
            case "SIEGE_OUTPOST_BUILD_INVALID":
            case "ECONOMIC_STRUCTURE_BUILD_INVALID":
            case "STRUCTURE_CANCEL_INVALID":
            case "TOWN_UNFED":
              return false;
            default:
              return true;
          }
        };
  const appendFeedEntry =
    typeof pushFeedEntry === "function"
      ? pushFeedEntry
      : (entry: { text: string; type?: string; severity?: string }) =>
          pushFeed(entry.text, (entry.type as any) ?? "info", (entry.severity as any) ?? "info");

  const maybeRequestTileDetail = (tile: any): void => {
    if (typeof deps.requestTileDetailIfNeeded !== "function") return;
    if (!tile || tile.fogged || tile.detailLevel === "full") return;
    if (
      tile.ownerId === state.me ||
      tile.resource ||
      tile.dockId ||
      tile.town ||
      tile.fort ||
      tile.observatory ||
      tile.siegeOutpost ||
      tile.economicStructure
    ) {
      deps.requestTileDetailIfNeeded(tile);
    }
  };

  const logDebugTileState = (scope: string, tile: any, extra?: Record<string, unknown>): void => {
    if (!tile || !tileMatchesDebugKey(tile.x, tile.y, 1, { fallbackTile: state.selected })) return;
    debugTileLog(scope, {
      x: tile.x,
      y: tile.y,
      detailLevel: tile.detailLevel,
      ownerId: tile.ownerId,
      ownershipState: tile.ownershipState,
      resource: tile.resource,
      economicStructure: tile.economicStructure
        ? {
            type: tile.economicStructure.type,
            status: tile.economicStructure.status
          }
        : undefined,
      town: tile.town
        ? {
            hasMarket: tile.town.hasMarket,
            hasGranary: tile.town.hasGranary,
            hasBank: tile.town.hasBank,
            populationTier: tile.town.populationTier
          }
        : undefined,
      ...(extra ?? {})
    });
  };

  const logFrontierTimeline = (
    scope: string,
    x: number,
    y: number,
    args: {
      before?: any;
      incoming?: any;
      after?: any;
      extra?: Record<string, unknown>;
      throttleKey?: string;
      minIntervalMs?: number;
    }
  ): void => {
    const timelineArgs = {
      x,
      y,
      before: args.before,
      incoming: args.incoming,
      after: args.after,
      state,
      keyFor,
      ...(args.extra ? { extra: args.extra } : {}),
      ...(args.throttleKey ? { throttleKey: args.throttleKey } : {}),
      ...(typeof args.minIntervalMs === "number" ? { minIntervalMs: args.minIntervalMs } : {})
    };
    debugTileTimeline(scope, timelineArgs);
  };

  let reconnectReloadTimer: number | undefined;
  let authReconnectTimer: number | undefined;
  let deferredBootstrapRefreshTimer: number | undefined;

  const clearSettlementProgressSafely = (tileKey: string): void => {
    if (!tileKey) return;
    if (typeof clearSettlementProgressByKey === "function") {
      clearSettlementProgressByKey(tileKey);
      return;
    }
    clearSettlementProgressByKeyFromModule(state, tileKey, { clearOptimisticTileState: (key) => clearOptimisticTileState(key, true) });
  };

  const clearOptimisticTileStateSafely = (tileKey: string, revert = false): void => {
    if (!tileKey || typeof clearOptimisticTileState !== "function") return;
    clearOptimisticTileState(tileKey, revert);
  };

  const showCaptureAlertSafely = (
    title: string,
    detail: string,
    tone: "info" | "success" | "warn" | "error",
    manpowerLoss?: number
  ): void => {
    if (typeof showCaptureAlert !== "function") return;
    showCaptureAlert(title, detail, tone, manpowerLoss);
  };

  const pushFeedSafely = (
    message: string,
    type?: "combat" | "mission" | "error" | "info" | "alliance" | "tech",
    severity?: "info" | "success" | "warn" | "error"
  ): void => {
    if (typeof pushFeed !== "function") return;
    pushFeed(message, type, severity);
  };

  const explainActionFailureSafely = (
    code: string,
    message: string,
    opts?: {
      cooldownRemainingMs?: number;
      formatCooldownShort?: (ms: number) => string;
    }
  ): string =>
    typeof explainActionFailure === "function" ? explainActionFailure(code, message, opts) : message || "Action failed";

  const requestViewRefreshSafely = (radius?: number, force?: boolean): void => {
    if (typeof requestViewRefresh !== "function") return;
    requestViewRefresh(radius, force);
  };

  const reconcileActionQueueSafely = (): void => {
    if (typeof reconcileActionQueue !== "function") return;
    reconcileActionQueue();
  };

  const processActionQueueSafely = (): void => {
    if (typeof processActionQueue !== "function") return;
    processActionQueue();
  };

  const maybeRecoverBusyDevelopmentAttempt = (errorCode: string, errorMessage: string, errorTileKey: string): boolean => {
    if (!errorMessage.includes("development slots are busy")) return false;
    if (errorCode !== "SETTLE_INVALID" && !errorCode.endsWith("_BUILD_INVALID") && errorCode !== "STRUCTURE_REMOVE_INVALID") return false;
    const attempt = state.lastDevelopmentAttempt;
    if (!attempt || attempt.tileKey !== errorTileKey) return false;
    const tile = state.tiles.get(errorTileKey);
    const matchesOptimisticState =
      attempt.kind === "SETTLE"
        ? state.settleProgressByTile.has(errorTileKey)
        : tile?.optimisticPending === (attempt.payload.type === "REMOVE_STRUCTURE" ? "structure_remove" : "structure_build");
    if (!matchesOptimisticState) return false;
    clearOptimisticTileState(errorTileKey, true);
    if (attempt.kind === "SETTLE") clearSettlementProgressSafely(errorTileKey);
    state.queuedDevelopmentDispatchPending = false;
    state.lastDevelopmentAttempt = undefined;
    return queueDevelopmentActionFromModule(state, attempt, {
      pushFeed: typeof pushFeed === "function" ? pushFeed : () => {},
      renderHud: typeof renderHud === "function" ? renderHud : () => {}
    });
  };

  const maybeRecoverTransientSettlementAttempt = (errorCode: string, errorMessage: string, errorTileKey: string): boolean => {
    if (errorCode !== "SETTLE_INVALID" || !errorTileKey) return false;
    const attempt = state.lastDevelopmentAttempt;
    if (!attempt || attempt.kind !== "SETTLE" || attempt.tileKey !== errorTileKey) return false;
    const transientOwnershipFailure =
      errorMessage === "tile must be owned" &&
      ((state.actionInFlight && state.actionTargetKey === errorTileKey) ||
        (state.capture && keyFor(state.capture.target.x, state.capture.target.y) === errorTileKey));
    if (!transientOwnershipFailure && errorMessage !== "tile is locked in combat" && errorMessage !== "tile already settling") return false;
    clearOptimisticTileStateSafely(errorTileKey, true);
    clearSettlementProgressSafely(errorTileKey);
    state.queuedDevelopmentDispatchPending = false;
    state.lastDevelopmentAttempt = undefined;
    return queueDevelopmentActionFromModule(state, attempt, {
      pushFeed: typeof pushFeed === "function" ? pushFeed : () => {},
      renderHud: typeof renderHud === "function" ? renderHud : () => {}
    });
  };

  const clearQueuedDevelopmentDispatchPending = (): void => {
    state.queuedDevelopmentDispatchPending = false;
  };

  const clearReconnectReloadTimer = (): void => {
    if (reconnectReloadTimer !== undefined) {
      window.clearTimeout(reconnectReloadTimer);
      reconnectReloadTimer = undefined;
    }
  };

  const clearAuthReconnectTimer = (): void => {
    if (authReconnectTimer !== undefined) {
      window.clearTimeout(authReconnectTimer);
      authReconnectTimer = undefined;
    }
  };

  const clearDeferredBootstrapRefreshTimer = (): void => {
    if (deferredBootstrapRefreshTimer !== undefined) {
      window.clearTimeout(deferredBootstrapRefreshTimer);
      deferredBootstrapRefreshTimer = undefined;
    }
  };

  const scheduleAuthReconnect = (message: string, forceRefresh = false): void => {
    clearAuthReconnectTimer();
    state.authBusy = true;
    state.authRetrying = true;
    setAuthStatus(message);
    syncAuthOverlay();
    renderHud();
    authReconnectTimer = window.setTimeout(() => {
      authReconnectTimer = undefined;
      if (!firebaseAuth?.currentUser || ws.readyState !== ws.OPEN || state.authSessionReady) return;
      void authenticateSocket(forceRefresh).catch((error: unknown) => {
        state.authBusy = false;
        state.authRetrying = false;
        setAuthStatus(error instanceof Error ? error.message : "Could not reconnect to the game server.", "error");
        syncAuthOverlay();
        renderHud();
      });
    }, 2000);
  };

  const scheduleReconnectReload = (): void => {
    if (!state.hasEverInitialized) return;
    if (reconnectReloadTimer !== undefined) return;
    reconnectReloadTimer = window.setTimeout(() => {
      reconnectReloadTimer = undefined;
      if (state.connection === "initialized" || state.connection === "connected") return;
      window.location.reload();
    }, 4000);
  };

  const applyLoginPhase = (title: string, detail: string): void => {
    state.authBusy = true;
    state.authBusyTitle = title;
    state.authBusyDetail = detail;
    setAuthStatus(detail);
    syncAuthOverlay();
  };

  const applyCombatOutcomeMessage = (msg: Record<string, unknown>, opts?: { predicted?: boolean }): void => {
    const target = msg.target as { x: number; y: number } | undefined;
    const targetBefore = (() => (target ? state.tiles.get(keyFor(target.x, target.y)) : undefined))();
    const originBefore = (() => {
      const origin = msg.origin as { x: number; y: number } | undefined;
      return origin ? state.tiles.get(keyFor(origin.x, origin.y)) : undefined;
    })();
    const changes =
      (msg.changes as Array<{ x: number; y: number; ownerId?: string; ownershipState?: "FRONTIER" | "SETTLED" | "BARBARIAN"; breachShockUntil?: number }>) ??
      [];
    const resolvedCaptureTargetKey = state.capture ? keyFor(state.capture.target.x, state.capture.target.y) : "";
    for (const change of changes) {
      const tileKey = keyFor(change.x, change.y);
      state.incomingAttacksByTile.delete(tileKey);
      const existing = state.tiles.get(tileKey);
      const incoming: any = {
        ...(existing ?? { x: change.x, y: change.y, terrain: terrainAt(change.x, change.y), fogged: false }),
        x: change.x,
        y: change.y,
        fogged: false
      };
      if (change.ownerId) incoming.ownerId = change.ownerId;
      else delete incoming.ownerId;
      if (change.ownershipState) incoming.ownershipState = change.ownershipState;
      else if (!change.ownerId) delete incoming.ownershipState;
      if (typeof change.breachShockUntil === "number") incoming.breachShockUntil = change.breachShockUntil;
      else if ("breachShockUntil" in change && !change.breachShockUntil) delete incoming.breachShockUntil;
      const merged = mergeServerTileWithOptimisticState(incoming);
      if (!merged.optimisticPending) clearOptimisticTileState(tileKey);
      state.tiles.set(tileKey, merged);
      if (merged.ownerId === state.me && (merged.ownershipState === "FRONTIER" || merged.ownershipState === "SETTLED")) {
        state.frontierSyncWaitUntilByTarget.delete(tileKey);
        state.actionQueue = state.actionQueue.filter((entry) => keyFor(entry.x, entry.y) !== tileKey);
        state.queuedTargetKeys.delete(tileKey);
      }
    }
    const resultAlert = combatResolutionAlert(msg, {
      targetTileBefore: targetBefore,
      originTileBefore: originBefore
    });
    const resultTargetKey = target ? keyFor(target.x, target.y) : "";
    const predictedAlreadyShown = Boolean(
      (state.pendingCombatReveal &&
        state.pendingCombatReveal.targetKey === resultTargetKey &&
        state.pendingCombatReveal.revealed &&
        state.pendingCombatReveal.title === resultAlert.title &&
        state.pendingCombatReveal.detail === resultAlert.detail) ||
        (resultTargetKey && wasPredictedCombatAlreadyShown(state.revealedPredictedCombatByKey, resultTargetKey, resultAlert.title, resultAlert.detail))
    );
    if (!predictedAlreadyShown) {
      appendFeedEntry({
        title: resultAlert.title,
        text: resultAlert.detail,
        type: "combat",
        severity: resultAlert.tone === "success" ? "success" : "warn",
        at: Date.now(),
        ...(typeof resultAlert.focusX === "number" && typeof resultAlert.focusY === "number"
          ? { focusX: resultAlert.focusX, focusY: resultAlert.focusY, actionLabel: resultAlert.actionLabel ?? "Center" }
          : {})
      });
      showCaptureAlert(resultAlert.title, resultAlert.detail, resultAlert.tone, resultAlert.manpowerLoss);
    }
    if (resultTargetKey) {
      if (opts?.predicted) state.revealedPredictedCombatByKey.set(resultTargetKey, { title: resultAlert.title, detail: resultAlert.detail });
      else state.revealedPredictedCombatByKey.delete(resultTargetKey);
    }
    if (state.pendingCombatReveal && state.pendingCombatReveal.targetKey === resultTargetKey) state.pendingCombatReveal = undefined;
    const resolvedCurrentKey = state.actionCurrent ? keyFor(state.actionCurrent.x, state.actionCurrent.y) : "";
    const targetKey = resolvedCaptureTargetKey || state.actionTargetKey;
    let handedOffToSettle = false;
    if (targetKey && state.autoSettleTargets.has(targetKey)) {
      const settledTile = state.tiles.get(targetKey);
      if (settledTile && settledTile.ownerId === state.me && settledTile.ownershipState === "FRONTIER") {
        if (requestSettlement(settledTile.x, settledTile.y)) {
          handedOffToSettle = true;
          pushFeed(`Auto-settle started at (${settledTile.x}, ${settledTile.y}).`, "combat", "info");
        }
      }
      state.autoSettleTargets.delete(targetKey);
    }
    state.capture = undefined;
    if (!handedOffToSettle) {
      state.actionInFlight = false;
      state.actionAcceptedAck = false;
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
      if (change.ownerId === state.me && change.ownershipState === "SETTLED") {
        clearSettlementProgressForTile(change.x, change.y);
      }
    }
    state.attackPreview = undefined;
    state.attackPreviewPendingKey = "";
    renderHud();
  };

  const applyChunkTiles = (tiles: any[]): void => {
    const firstChunkArriving = state.firstChunkAt === 0;
    state.chunkFullCount += 1;
    if (state.firstChunkAt === 0) state.firstChunkAt = Date.now();
    let sawOwnedTile = false;
    let resolvedQueuedFrontierCapture = false;
    let detailRequests = 0;
    for (const tile of tiles) {
      const tileKey = keyFor(tile.x, tile.y);
      const existing = state.tiles.get(tileKey);
      const normalizedTile =
        "ownerId" in tile
          ? tile
          : {
              ...tile,
              ownerId: undefined,
              ownershipState: undefined,
              capital: undefined
            };
      const mergedTile = mergeServerTileWithOptimisticState(mergeIncomingTileDetail(existing, normalizedTile));
      state.tiles.set(keyFor(mergedTile.x, mergedTile.y), mergedTile);
      logFrontierTimeline("frontier-chunk-apply", mergedTile.x, mergedTile.y, {
        before: existing,
        incoming: normalizedTile,
        after: mergedTile,
        extra: {
          source: "CHUNK",
          existingEconomicStructure: existing?.economicStructure?.type
        }
      });
      logDebugTileState("chunk-merge", mergedTile, {
        source: "CHUNK",
        existingEconomicStructure: existing?.economicStructure?.type
      });
      if (
        existing?.ownerId !== mergedTile.ownerId ||
        existing?.ownershipState !== mergedTile.ownershipState ||
        tileKey === state.actionTargetKey ||
        state.settleProgressByTile.has(tileKey)
      ) {
        logTileSync("chunk_tile_applied", {
          tileKey,
          existingOwnerId: existing?.ownerId,
          existingOwnershipState: existing?.ownershipState,
          incomingOwnerId: normalizedTile.ownerId,
          incomingOwnershipState: normalizedTile.ownershipState,
          resolvedOwnerId: mergedTile.ownerId,
          resolvedOwnershipState: mergedTile.ownershipState,
          optimisticPending: mergedTile.optimisticPending
        });
      }
      state.frontierSyncWaitUntilByTarget.delete(keyFor(mergedTile.x, mergedTile.y));
      if (mergedTile.ownerId === state.me && (mergedTile.ownershipState === "FRONTIER" || mergedTile.ownershipState === "SETTLED")) {
        state.actionQueue = state.actionQueue.filter((entry) => keyFor(entry.x, entry.y) !== tileKey);
        state.queuedTargetKeys.delete(tileKey);
        resolvedQueuedFrontierCapture = true;
        logFrontierTimeline("frontier-queue-resolved-by-chunk", mergedTile.x, mergedTile.y, {
          before: existing,
          after: mergedTile,
          extra: {
            source: "CHUNK"
          }
        });
      }
      maybeAnnounceShardSite(existing, mergedTile);
      if (!mergedTile.optimisticPending) clearOptimisticTileState(keyFor(mergedTile.x, mergedTile.y));
      markDockDiscovered(mergedTile);
      if (!mergedTile.fogged) state.discoveredTiles.add(keyFor(mergedTile.x, mergedTile.y));
      if (mergedTile.ownerId === state.me) sawOwnedTile = true;
        if (detailRequests < 4) {
          const tileKey = keyFor(mergedTile.x, mergedTile.y);
          const before = state.tileDetailRequestedAt.get(tileKey) ?? 0;
          maybeRequestTileDetail(mergedTile);
          const after = state.tileDetailRequestedAt.get(tileKey) ?? 0;
          if (after > before) detailRequests += 1;
        }
      }
    if (sawOwnedTile) state.hasOwnedTileInCache = true;
    else if (!state.hasOwnedTileInCache) centerOnOwnedTile();
    if (resolvedQueuedFrontierCapture && !state.actionInFlight && !state.capture && state.actionQueue.length > 0) {
      processActionQueue();
    }
    if (
      firstChunkArriving &&
      !state.fogDisabled &&
      state.lastSubRadius < 2 &&
      !state.actionInFlight &&
      !state.capture &&
      state.actionQueue.length === 0
    ) {
      clearDeferredBootstrapRefreshTimer();
      deferredBootstrapRefreshTimer = window.setTimeout(() => {
        deferredBootstrapRefreshTimer = undefined;
        if (ws.readyState !== ws.OPEN || !state.authSessionReady) return;
        if (state.actionInFlight || state.capture || state.actionQueue.length > 0) return;
        requestViewRefresh(2, true);
      }, 400);
    }
    renderHud();
  };

  ws.addEventListener("open", () => {
    attackSyncLog("ws-open", {
      readyState: ws.readyState,
      authReady: state.authReady,
      authSessionReady: state.authSessionReady
    });
    state.connection = "connected";
    if (!state.mapLoadStartedAt) state.mapLoadStartedAt = Date.now();
    clearReconnectReloadTimer();
    clearAuthReconnectTimer();
    if (state.authReady && !state.authSessionReady) {
      applyLoginPhase("Securing session", `Realtime connection open. Sending Google session for ${state.authUserLabel || "your empire"}...`);
    }
    renderHud();
    void authenticateSocket();
  });

  ws.addEventListener("close", () => {
    clearDeferredBootstrapRefreshTimer();
    const currentActionKey = state.actionCurrent ? keyFor(state.actionCurrent.x, state.actionCurrent.y) : "";
    attackSyncLog("ws-close", {
      currentActionKey,
      currentAction: state.actionCurrent,
      actionStartedAt: state.actionStartedAt,
      actionAcceptedAck: state.actionAcceptedAck,
      combatStartAck: state.combatStartAck,
      capture: state.capture
        ? {
            target: state.capture.target,
            resolvesAt: state.capture.resolvesAt
          }
        : undefined
    });
    state.connection = "disconnected";
    state.actionInFlight = false;
    state.actionAcceptedAck = false;
    state.combatStartAck = false;
    state.actionStartedAt = 0;
    state.actionTargetKey = "";
    state.actionCurrent = undefined;
    state.lastChunkSnapshotGeneration = 0;
    if (currentActionKey) clearOptimisticTileState(currentActionKey, true);
    pushFeed("Connection lost. Retrying...", "error", "warn");
    if (state.authReady && !state.authSessionReady) {
      applyLoginPhase("Securing session", `Realtime connection dropped. Reconnecting to ${wsUrl}...`);
    }
    clearAuthReconnectTimer();
    scheduleReconnectReload();
    renderHud();
  });

  ws.addEventListener("error", () => {
    const currentActionKey = state.actionCurrent ? keyFor(state.actionCurrent.x, state.actionCurrent.y) : "";
    attackSyncLog("ws-error", {
      currentActionKey,
      currentAction: state.actionCurrent,
      actionStartedAt: state.actionStartedAt,
      actionAcceptedAck: state.actionAcceptedAck,
      combatStartAck: state.combatStartAck,
      capture: state.capture
        ? {
            target: state.capture.target,
            resolvesAt: state.capture.resolvesAt
          }
        : undefined
    });
    state.connection = "disconnected";
    state.actionInFlight = false;
    state.actionAcceptedAck = false;
    state.combatStartAck = false;
    state.actionStartedAt = 0;
    state.actionTargetKey = "";
    state.actionCurrent = undefined;
    state.lastChunkSnapshotGeneration = 0;
    if (currentActionKey) clearOptimisticTileState(currentActionKey, true);
    pushFeed("Server unreachable. Retrying...", "error", "warn");
    if (state.authReady && !state.authSessionReady) {
      applyLoginPhase(
        "Securing session",
        `Google account connected, but the realtime game connection to ${wsUrl} has not opened yet. The server may still be starting or overloaded.`
      );
    }
    clearAuthReconnectTimer();
    scheduleReconnectReload();
    renderHud();
  });

  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data as string) as Record<string, unknown>;
    const shouldApplyChunkGeneration = (generation: unknown): boolean => {
      if (typeof generation !== "number" || !Number.isFinite(generation)) return true;
      if (generation < state.lastChunkSnapshotGeneration) {
        attackSyncLog("chunk-generation-ignored", {
          incomingGeneration: generation,
          lastChunkSnapshotGeneration: state.lastChunkSnapshotGeneration
        });
        return false;
      }
      if (generation > state.lastChunkSnapshotGeneration) {
        attackSyncLog("chunk-generation-advance", {
          previousGeneration: state.lastChunkSnapshotGeneration,
          nextGeneration: generation
        });
        state.lastChunkSnapshotGeneration = generation;
      }
      return true;
    };
    if (msg.type === "ACTION_ACCEPTED" || msg.type === "COMBAT_START" || msg.type === "COMBAT_RESULT" || msg.type === "ERROR") {
      const currentTarget = state.actionCurrent ? { x: state.actionCurrent.x, y: state.actionCurrent.y } : undefined;
      attackSyncLog("message", {
        type: msg.type,
        currentTarget,
        currentActionKey: state.actionTargetKey,
        actionAcceptedAck: state.actionAcceptedAck,
        combatStartAck: state.combatStartAck,
        startedAgoMs: state.actionStartedAt ? Date.now() - state.actionStartedAt : undefined,
        msgTarget:
          typeof msg.target === "object" && msg.target !== null && "x" in msg.target && "y" in msg.target
            ? msg.target
            : undefined,
        code: typeof msg.code === "string" ? msg.code : undefined,
        message: typeof msg.message === "string" ? msg.message : undefined
      });
    }
    if (msg.type === "LOGIN_PHASE") {
      if (!state.authSessionReady) {
        applyLoginPhase(
          typeof msg.title === "string" ? msg.title : "Connecting your empire...",
          typeof msg.detail === "string" ? msg.detail : "Waiting for the game server to finish preparing your session."
        );
        renderHud();
      }
      return;
    }
    if (msg.type === "INIT") {
      clearDeferredBootstrapRefreshTimer();
      state.connection = "initialized";
      state.authSessionReady = true;
      state.hasEverInitialized = true;
      state.authBusy = false;
      state.authRetrying = false;
      state.authBusyTitle = "";
      state.authBusyDetail = "";
      clearAuthReconnectTimer();
      state.mapLoadStartedAt = Date.now();
      state.firstChunkAt = 0;
      state.chunkFullCount = 0;
      state.hasOwnedTileInCache = false;
      state.lastSubAt = 0;
      state.lastSubCx = Number.NaN;
      state.lastSubCy = Number.NaN;
      state.lastSubRadius = -1;
      state.lastChunkSnapshotGeneration = 0;
      state.fogDisabled = Boolean(((msg.config as { fogDisabled?: boolean } | undefined) ?? {}).fogDisabled);
      const player = msg.player as Record<string, unknown>;
      state.me = player.id as string;
      state.meName = player.name as string;
      state.playerNames.set(state.me, state.meName);
      state.profileSetupRequired = Boolean(player.profileNeedsSetup);
      setAuthStatus(`Signed in as ${state.authUserLabel || (player.name as string)}.`);
      state.gold = (player.gold as number | undefined) ?? (player.points as number);
      state.level = player.level as number;
      state.mods = (player.mods as typeof state.mods) ?? state.mods;
      state.modBreakdown = (player.modBreakdown as typeof state.modBreakdown | undefined) ?? state.modBreakdown;
      state.incomePerMinute = (player.incomePerMinute as number) ?? state.incomePerMinute;
      state.strategicResources =
        (player.strategicResources as typeof state.strategicResources | undefined) ?? state.strategicResources;
      state.strategicProductionPerMinute =
        (player.strategicProductionPerMinute as typeof state.strategicProductionPerMinute | undefined) ?? state.strategicProductionPerMinute;
      state.economyBreakdown = (player.economyBreakdown as typeof state.economyBreakdown | undefined) ?? state.economyBreakdown;
      state.upkeepPerMinute = (player.upkeepPerMinute as typeof state.upkeepPerMinute | undefined) ?? state.upkeepPerMinute;
      state.upkeepLastTick = (player.upkeepLastTick as typeof state.upkeepLastTick | undefined) ?? state.upkeepLastTick;
      state.stamina = player.stamina as number;
      state.manpower = (player.manpower as number | undefined) ?? state.manpower;
      state.manpowerCap = (player.manpowerCap as number | undefined) ?? state.manpowerCap;
      state.manpowerRegenPerMinute = (player.manpowerRegenPerMinute as number | undefined) ?? state.manpowerRegenPerMinute;
      state.territoryT = (player.T as number) ?? state.territoryT;
      state.exposureE = (player.E as number) ?? state.exposureE;
      state.settledT = (player.Ts as number) ?? state.settledT;
      state.settledE = (player.Es as number) ?? state.settledE;
      const initDefensibility = defensibilityPctFromTE(
        (player.Ts as number | undefined) ?? (player.T as number | undefined),
        (player.Es as number | undefined) ?? (player.E as number | undefined)
      );
      state.defensibilityPct = initDefensibility;
      state.defensibilityAnimDir = 0;
      state.defensibilityAnimUntil = 0;
      state.availableTechPicks = (player.availableTechPicks as number) ?? 0;
      state.developmentProcessLimit = (player.developmentProcessLimit as number | undefined) ?? state.developmentProcessLimit;
      if (typeof player.activeDevelopmentProcessCount === "number") clearQueuedDevelopmentDispatchPending();
      state.activeDevelopmentProcessCount =
        (player.activeDevelopmentProcessCount as number | undefined) ?? state.activeDevelopmentProcessCount;
      logTileSync("development_player_update", {
        activeDevelopmentProcessCount: state.activeDevelopmentProcessCount,
        developmentProcessLimit: state.developmentProcessLimit,
        pendingSettlements: (player.pendingSettlements as Array<{ x: number; y: number; startedAt: number; resolvesAt: number }> | undefined) ?? [],
        developmentQueueLength: state.developmentQueue.length,
        queuedDevelopmentDispatchPending: state.queuedDevelopmentDispatchPending,
        settleProgressCount: state.settleProgressByTile.size
      });
      state.techRootId = player.techRootId as string | undefined;
      state.techIds = (player.techIds as string[]) ?? [];
      state.currentResearch = (player.currentResearch as typeof state.currentResearch | undefined) ?? undefined;
      state.pendingTechUnlockId = "";
      state.domainIds = (player.domainIds as string[]) ?? [];
      state.revealCapacity = (player.revealCapacity as number) ?? state.revealCapacity;
      state.activeRevealTargets = (player.activeRevealTargets as string[]) ?? state.activeRevealTargets;
      state.abilityCooldowns = (player.abilityCooldowns as typeof state.abilityCooldowns | undefined) ?? state.abilityCooldowns;
      state.revealedEmpireStatsByPlayer.clear();
      state.manpowerBreakdown = (player.manpowerBreakdown as typeof state.manpowerBreakdown | undefined) ?? state.manpowerBreakdown;
      applyPendingSettlementsFromServer(
        (player.pendingSettlements as Array<{ x: number; y: number; startedAt: number; resolvesAt: number }> | undefined) ?? []
      );
      state.allies = (player.allies as string[]) ?? [];
      state.outgoingAllianceRequests = (msg.outgoingAllianceRequests as any[] | undefined) ?? [];
      const myTileColor = player.tileColor as string | undefined;
      if (myTileColor) {
        state.playerColors.set(state.me, myTileColor);
        authProfileColorEl.value = myTileColor;
      }
      const myVisualStyle = player.visualStyle as any;
      if (myVisualStyle) state.playerVisualStyles.set(state.me, myVisualStyle);
      seedProfileSetupFields((player.name as string) || state.authUserLabel, myTileColor ?? authProfileColorEl.value);
      for (const style of ((msg.playerStyles as any[]) ?? [])) {
        if (style.name) state.playerNames.set(style.id, style.name);
        if (style.tileColor) state.playerColors.set(style.id, style.tileColor);
        if (style.visualStyle) state.playerVisualStyles.set(style.id, style.visualStyle);
        if (typeof style.shieldUntil === "number") state.playerShieldUntil.set(style.id, style.shieldUntil);
      }
      const homeTile = player.homeTile as { x: number; y: number } | undefined;
      if (homeTile) {
        state.homeTile = homeTile;
        state.camX = homeTile.x;
        state.camY = homeTile.y;
        state.selected = homeTile;
      }
      requestViewRefresh(1, true);
      state.techChoices = (msg.techChoices as string[]) ?? [];
      state.techCatalog = (msg.techCatalog as any[]) ?? [];
      state.domainChoices = (msg.domainChoices as string[]) ?? [];
      state.domainCatalog = (msg.domainCatalog as any[]) ?? [];
      if (!state.domainUiSelectedId && state.domainChoices.length > 0) state.domainUiSelectedId = state.domainChoices[0]!;
      state.missions = (msg.missions as any[]) ?? [];
      state.leaderboard = (msg.leaderboard as typeof state.leaderboard) ?? state.leaderboard;
      state.seasonVictory = (msg.seasonVictory as any[] | undefined) ?? state.seasonVictory;
      state.seasonWinner = (msg.seasonWinner as any | undefined) ?? state.seasonWinner;
      if (state.profileSetupRequired) setAuthStatus("Choose a display name and nation color to begin.");
      state.incomingAllianceRequests = (msg.allianceRequests as any[]) ?? [];
      state.activeTruces = (msg.activeTruces as any[]) ?? [];
      state.incomingTruceRequests = (msg.truceRequests as any[]) ?? [];
      state.activeAetherBridges = (msg.activeAetherBridges as any[]) ?? [];
      state.activeAetherWalls = (msg.activeAetherWalls as any[]) ?? [];
      state.strategicReplayEvents = (player.strategicReplayEvents as any[] | undefined) ?? [];
      resetStrategicReplayState();
      const config = (msg.config as { season?: { seasonId: string; worldSeed?: number }; fogDisabled?: boolean } | undefined) ?? {};
      const season = config.season;
      state.fogDisabled = Boolean(config.fogDisabled);
      if (typeof season?.worldSeed === "number") {
        setWorldSeed(season.worldSeed);
        clearRenderCaches();
        buildMiniMapBase();
      }
      const mapMeta = (msg.mapMeta as { dockCount?: number; dockPairCount?: number; clusterCount?: number; townCount?: number; dockPairs?: any[] } | undefined) ?? {};
      const shardRainNotice =
        (msg.shardRainNotice as
          | { phase?: "upcoming" | "started"; startsAt?: number; expiresAt?: number; siteCount?: number }
          | undefined) ?? undefined;
      const offlineActivity =
        (msg.offlineActivity as
          | Array<{ title?: string; detail?: string; type?: string; severity?: string; at?: number; tileKey?: string; actionLabel?: string }>
          | undefined) ?? [];
      state.discoveredTiles.clear();
      state.discoveredDockTiles.clear();
      state.dockPairs = mapMeta.dockPairs ?? [];
      state.dockRouteCache.clear();
      pushFeed(`Spawned. ${season?.seasonId ? `Season ${season.seasonId}.` : ""} Your tile is centered.`, "info", "success");
      if (config.fogDisabled) pushFeed("Fog of war is disabled for this server session.", "info", "warn");
      if (typeof mapMeta.dockCount === "number") {
        pushFeed(
          `Map features: ${mapMeta.dockCount} docks (${mapMeta.dockPairCount ?? Math.floor(mapMeta.dockCount / 2)} pairs), ${mapMeta.clusterCount ?? 0} clusters.`,
          "info",
          "info"
        );
        if (typeof mapMeta.townCount === "number") pushFeed(`Towns on world: ${mapMeta.townCount}.`, "info", "info");
      }
      if (offlineActivity.length > 0) {
        for (let index = offlineActivity.length - 1; index >= 0; index -= 1) {
          const entry = offlineActivity[index]!;
          const tileKey = typeof entry.tileKey === "string" ? entry.tileKey : undefined;
          const parsedFocus = tileKey ? (() => {
            const [xText, yText] = tileKey.split(",");
            const x = Number(xText);
            const y = Number(yText);
            return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : undefined;
          })() : undefined;
          appendFeedEntry({
            title: typeof entry.title === "string" ? entry.title : undefined,
            text: typeof entry.detail === "string" ? entry.detail : "Activity update",
            type: entry.type === "combat" || entry.type === "mission" || entry.type === "error" || entry.type === "info" || entry.type === "alliance" || entry.type === "tech" ? entry.type : "info",
            severity:
              entry.severity === "info" || entry.severity === "success" || entry.severity === "warn" || entry.severity === "error"
                ? entry.severity
                : "info",
            at: typeof entry.at === "number" ? entry.at : Date.now(),
            ...(parsedFocus ? { focusX: parsedFocus.x, focusY: parsedFocus.y, actionLabel: typeof entry.actionLabel === "string" ? entry.actionLabel : "Center" } : {})
          });
        }
        showCaptureAlert(
          "While you were away",
          offlineActivity.length === 1 && typeof offlineActivity[0]?.detail === "string"
            ? offlineActivity[0].detail
            : `${offlineActivity.length} empire updates happened while you were away.`,
          "warn"
        );
      }
      if (shardRainNotice?.phase === "upcoming" && typeof shardRainNotice.startsAt === "number") {
        showShardAlert({
          key: shardAlertKeyForPayload("upcoming", shardRainNotice.startsAt),
          phase: "upcoming",
          startsAt: shardRainNotice.startsAt
        });
      } else if (
        shardRainNotice?.phase === "started" &&
        typeof shardRainNotice.startsAt === "number" &&
        typeof shardRainNotice.expiresAt === "number"
      ) {
        showShardAlert({
          key: shardAlertKeyForPayload("started", shardRainNotice.startsAt),
          phase: "started",
          startsAt: shardRainNotice.startsAt,
          expiresAt: shardRainNotice.expiresAt,
          siteCount: Number(shardRainNotice.siteCount ?? 0)
        });
      }
      syncAuthOverlay();
      renderHud();
      return;
    }

    if (msg.type === "CHUNK_FULL") {
      if (!shouldApplyChunkGeneration(msg.generation)) return;
      applyChunkTiles(msg.tilesMaskedByFog as any[]);
      return;
    }

    if (msg.type === "CHUNK_BATCH") {
      if (!shouldApplyChunkGeneration(msg.generation)) return;
      const chunks = (msg.chunks as Array<{ cx: number; cy: number; tilesMaskedByFog: any[] }>) ?? [];
      for (const chunk of chunks) applyChunkTiles(chunk.tilesMaskedByFog);
      return;
    }

    if (msg.type === "PLAYER_UPDATE") {
      const prevGold = state.gold;
      const prevDefensibility = state.defensibilityPct;
      const prevStrategic = { ...state.strategicResources };
      state.gold = (msg.gold as number | undefined) ?? (msg.points as number);
      if (typeof msg.name === "string") {
        state.meName = msg.name;
        authProfileNameEl.value = msg.name;
      }
      state.level = msg.level as number;
      state.mods = (msg.mods as typeof state.mods) ?? state.mods;
      state.modBreakdown = (msg.modBreakdown as typeof state.modBreakdown | undefined) ?? state.modBreakdown;
      state.incomePerMinute = (msg.incomePerMinute as number) ?? state.incomePerMinute;
      state.strategicResources = (msg.strategicResources as typeof state.strategicResources | undefined) ?? state.strategicResources;
      state.strategicProductionPerMinute =
        (msg.strategicProductionPerMinute as typeof state.strategicProductionPerMinute | undefined) ?? state.strategicProductionPerMinute;
      state.economyBreakdown = (msg.economyBreakdown as typeof state.economyBreakdown | undefined) ?? state.economyBreakdown;
      state.manpower = (msg.manpower as number | undefined) ?? state.manpower;
      state.manpowerCap = (msg.manpowerCap as number | undefined) ?? state.manpowerCap;
      state.manpowerRegenPerMinute = (msg.manpowerRegenPerMinute as number | undefined) ?? state.manpowerRegenPerMinute;
      state.upkeepPerMinute = (msg.upkeepPerMinute as typeof state.upkeepPerMinute | undefined) ?? state.upkeepPerMinute;
      state.upkeepLastTick = (msg.upkeepLastTick as typeof state.upkeepLastTick | undefined) ?? state.upkeepLastTick;
      state.manpowerBreakdown = (msg.manpowerBreakdown as typeof state.manpowerBreakdown | undefined) ?? state.manpowerBreakdown;
      if ("pendingSettlements" in msg) {
        applyPendingSettlementsFromServer(
          msg.pendingSettlements as Array<{ x: number; y: number; startedAt: number; resolvesAt: number }> | undefined
        );
      }
      state.incomingAllianceRequests = (msg.incomingAllianceRequests as any[] | undefined) ?? state.incomingAllianceRequests;
      state.outgoingAllianceRequests = (msg.outgoingAllianceRequests as any[] | undefined) ?? state.outgoingAllianceRequests;
      clearPendingCollectVisibleDelta();
      if (state.upkeepLastTick.foodCoverage < 0.999 && !state.foodCoverageWarned) {
        pushFeed(
          `Town support underfed: FOOD upkeep coverage ${(state.upkeepLastTick.foodCoverage * 100).toFixed(0)}%. Unfed towns stop producing gold.`,
          "info",
          "warn"
        );
        state.foodCoverageWarned = true;
      } else if (state.upkeepLastTick.foodCoverage >= 0.999 && state.foodCoverageWarned) {
        pushFeed("FOOD upkeep recovered. Town income back to normal.", "info", "success");
        state.foodCoverageWarned = false;
      }
      if (state.gold > prevGold) {
        state.goldAnimUntil = Date.now() + 350;
        state.goldAnimDir = 1;
      } else if (state.gold < prevGold) {
        state.goldAnimUntil = Date.now() + 350;
        state.goldAnimDir = -1;
      } else {
        state.goldAnimDir = 0;
      }
      for (const resource of ["FOOD", "IRON", "CRYSTAL", "SUPPLY", "SHARD", "OIL"] as const) {
        const prev = prevStrategic[resource] ?? 0;
        const next = state.strategicResources[resource] ?? 0;
        if (next > prev) {
          state.strategicAnim[resource].until = Date.now() + 350;
          state.strategicAnim[resource].dir = 1;
        } else if (next < prev) {
          state.strategicAnim[resource].until = Date.now() + 350;
          state.strategicAnim[resource].dir = -1;
        } else if (Date.now() >= state.strategicAnim[resource].until) {
          state.strategicAnim[resource].dir = 0;
        }
      }
      state.stamina = msg.stamina as number;
      if (typeof (msg.T as number | undefined) === "number") state.territoryT = msg.T as number;
      if (typeof (msg.E as number | undefined) === "number") state.exposureE = msg.E as number;
      if (typeof (msg.Ts as number | undefined) === "number") state.settledT = msg.Ts as number;
      if (typeof (msg.Es as number | undefined) === "number") state.settledE = msg.Es as number;
      state.defensibilityPct = defensibilityPctFromTE(state.settledT, state.settledE);
      if (state.defensibilityPct > prevDefensibility + 0.05) {
        state.defensibilityAnimUntil = Date.now() + 550;
        state.defensibilityAnimDir = 1;
      } else if (state.defensibilityPct < prevDefensibility - 0.05) {
        state.defensibilityAnimUntil = Date.now() + 550;
        state.defensibilityAnimDir = -1;
      } else if (Date.now() >= state.defensibilityAnimUntil) {
        state.defensibilityAnimDir = 0;
      }
      state.availableTechPicks = (msg.availableTechPicks as number) ?? state.availableTechPicks;
      state.developmentProcessLimit = (msg.developmentProcessLimit as number | undefined) ?? state.developmentProcessLimit;
      if (typeof msg.activeDevelopmentProcessCount === "number") clearQueuedDevelopmentDispatchPending();
      state.activeDevelopmentProcessCount =
        (msg.activeDevelopmentProcessCount as number | undefined) ?? state.activeDevelopmentProcessCount;
      state.techChoices = (msg.techChoices as string[]) ?? state.techChoices;
      state.techCatalog = (msg.techCatalog as any[]) ?? state.techCatalog;
      state.currentResearch = (msg.currentResearch as typeof state.currentResearch | undefined) ?? undefined;
      if (typeof msg.profileNeedsSetup === "boolean") state.profileSetupRequired = msg.profileNeedsSetup;
      state.domainIds = (msg.domainIds as string[]) ?? state.domainIds;
      state.domainChoices = (msg.domainChoices as string[]) ?? state.domainChoices;
      state.domainCatalog = (msg.domainCatalog as any[]) ?? state.domainCatalog;
      if (
        state.pendingDomainUnlockId &&
        (state.domainIds.includes(state.pendingDomainUnlockId) || !state.domainChoices.includes(state.pendingDomainUnlockId))
      ) {
        state.pendingDomainUnlockId = "";
      }
      state.revealCapacity = (msg.revealCapacity as number) ?? state.revealCapacity;
      state.activeRevealTargets = (msg.activeRevealTargets as string[]) ?? state.activeRevealTargets;
      state.abilityCooldowns = (msg.abilityCooldowns as typeof state.abilityCooldowns | undefined) ?? state.abilityCooldowns;
      state.missions = (msg.missions as any[]) ?? state.missions;
      state.leaderboard = (msg.leaderboard as typeof state.leaderboard) ?? state.leaderboard;
      state.seasonVictory = (msg.seasonVictory as any[] | undefined) ?? state.seasonVictory;
      state.seasonWinner = (msg.seasonWinner as any | undefined) ?? state.seasonWinner;
      const myTileColor = msg.tileColor as string | undefined;
      if (myTileColor) {
        state.playerColors.set(state.me, myTileColor);
        authProfileColorEl.value = myTileColor;
      }
      const myVisualStyle = msg.visualStyle as any;
      if (myVisualStyle) state.playerVisualStyles.set(state.me, myVisualStyle);
      syncAuthOverlay();
      renderHud();
      return;
    }

    if (msg.type === "GLOBAL_STATUS_UPDATE") {
      state.leaderboard = (msg.leaderboard as typeof state.leaderboard) ?? state.leaderboard;
      state.seasonVictory = (msg.seasonVictory as any[] | undefined) ?? state.seasonVictory;
      state.seasonWinner = (msg.seasonWinner as any | undefined) ?? state.seasonWinner;
      renderHud();
      return;
    }

    if (msg.type === "ACTION_ACCEPTED") {
      const target = msg.target as { x: number; y: number };
      const targetKey = keyFor(target.x, target.y);
      attackSyncLog("action-accepted", {
        actionType: msg.actionType,
        target,
        origin: msg.origin,
        resolvesAt: msg.resolvesAt,
        startedAgoMs: state.actionStartedAt ? Date.now() - state.actionStartedAt : undefined,
        currentAction: state.actionCurrent
      });
      state.actionAcceptedAck = true;
      state.actionInFlight = true;
      state.actionTargetKey = targetKey;
      renderHud();
      return;
    }

    if (msg.type === "COMBAT_RESULT") {
      const resultReceivedAt = Date.now();
      const timing = msg.timing as { acceptedAt?: number; resolvesAt?: number; resultSentAt?: number } | undefined;
      if (
        msg.attackType === "EXPAND" &&
        typeof timing?.acceptedAt === "number" &&
        typeof timing?.resolvesAt === "number" &&
        typeof timing?.resultSentAt === "number"
      ) {
        console.info("[neutral-expand-timing]", {
          target: msg.target,
          acceptedAt: timing.acceptedAt,
          resolvesAt: timing.resolvesAt,
          resultSentAt: timing.resultSentAt,
          resultReceivedAt,
          timerDelayMs: timing.resultSentAt - timing.resolvesAt,
          deliveryDelayMs: resultReceivedAt - timing.resultSentAt,
          totalElapsedMs: resultReceivedAt - timing.acceptedAt
        });
      }
      attackSyncLog("combat-result", {
        attackType: msg.attackType,
        target: msg.target,
        origin: msg.origin,
        attackerWon: msg.attackerWon,
        startedAgoMs: state.actionStartedAt ? resultReceivedAt - state.actionStartedAt : undefined,
        actionAcceptedAck: state.actionAcceptedAck,
        hadCombatStartAck: state.combatStartAck
      });
      applyCombatOutcomeMessage(msg as Record<string, unknown>);
      return;
    }

    if (msg.type === "COMBAT_START") {
      const target = msg.target as { x: number; y: number };
      const resolvesAt = msg.resolvesAt as number;
      attackSyncLog("combat-start", {
        target,
        origin: msg.origin,
        resolvesAt,
        predictedResult: Boolean(msg.predictedResult),
        startedAgoMs: state.actionStartedAt ? Date.now() - state.actionStartedAt : undefined,
        currentAction: state.actionCurrent
      });
      state.actionAcceptedAck = true;
      state.combatStartAck = true;
      const existingCapture =
        state.capture && state.capture.target.x === target.x && state.capture.target.y === target.y ? state.capture : undefined;
      const startAt = existingCapture?.startAt ?? Date.now();
      const resolvesAtForCapture = existingCapture ? Math.min(existingCapture.resolvesAt, resolvesAt) : resolvesAt;
      state.capture = { startAt, resolvesAt: resolvesAtForCapture, target };
      const predictedResult = msg.predictedResult as Record<string, unknown> | undefined;
      if (predictedResult) {
        const predictedAlert = combatResolutionAlert(predictedResult, {
          targetTileBefore: state.tiles.get(keyFor(target.x, target.y)),
          originTileBefore: (() => {
            const origin = predictedResult.origin as { x: number; y: number } | undefined;
            return origin ? state.tiles.get(keyFor(origin.x, origin.y)) : undefined;
          })()
        });
        state.pendingCombatReveal = {
          targetKey: keyFor(target.x, target.y),
          title: predictedAlert.title,
          detail: predictedAlert.detail,
          tone: predictedAlert.tone,
          ...(typeof predictedAlert.manpowerLoss === "number" ? { manpowerLoss: predictedAlert.manpowerLoss } : {}),
          result: predictedResult,
          revealed: false
        };
      } else if (state.pendingCombatReveal?.targetKey === keyFor(target.x, target.y)) {
        state.pendingCombatReveal = undefined;
      }
      state.actionInFlight = true;
      if (!state.actionStartedAt) state.actionStartedAt = startAt;
      state.actionTargetKey = keyFor(target.x, target.y);
      renderHud();
      return;
    }

    if (msg.type === "ATTACK_ALERT") {
      const attackerName = (msg.attackerName as string | undefined) || (msg.attackerId as string | undefined) || "Unknown attacker";
      const x = Number(msg.x ?? -1);
      const y = Number(msg.y ?? -1);
      const resolvesAt = Number(msg.resolvesAt ?? Date.now() + 3000);
      const fromX = typeof msg.fromX === "number" ? Number(msg.fromX) : undefined;
      const fromY = typeof msg.fromY === "number" ? Number(msg.fromY) : undefined;
      if (x >= 0 && y >= 0) {
        state.incomingAttacksByTile.set(keyFor(x, y), { attackerName, resolvesAt });
      }
      state.unreadAttackAlerts += 1;
      pushFeed(
        `Under attack: ${attackerName} is striking (${x}, ${y})${fromX !== undefined && fromY !== undefined ? ` from (${fromX}, ${fromY})` : ""}.`,
        "combat",
        "error"
      );
      renderHud();
      return;
    }

    if (msg.type === "COMBAT_CANCELLED") {
      const cancelledCurrentKey = state.actionCurrent ? keyFor(state.actionCurrent.x, state.actionCurrent.y) : "";
      state.capture = undefined;
      if (state.pendingCombatReveal?.targetKey === cancelledCurrentKey) state.pendingCombatReveal = undefined;
      state.actionInFlight = false;
      state.actionAcceptedAck = false;
      state.combatStartAck = false;
      state.actionStartedAt = 0;
      state.actionTargetKey = "";
      state.actionCurrent = undefined;
      if (cancelledCurrentKey) state.queuedTargetKeys.delete(cancelledCurrentKey);
      if (cancelledCurrentKey) clearOptimisticTileState(cancelledCurrentKey, true);
      state.autoSettleTargets.clear();
      pushFeed(`Capture cancelled (${(msg.count as number | undefined) ?? 1})`, "combat", "warn");
      renderHud();
      return;
    }

    if (msg.type === "FOG_UPDATE") {
      state.fogDisabled = Boolean(msg.fogDisabled);
      pushFeed(`Fog of war ${state.fogDisabled ? "disabled" : "enabled"}.`, "info", "info");
      requestViewRefresh(2, true);
      renderHud();
      return;
    }

    if (msg.type === "TILE_DELTA") {
      const updates = (msg.updates as any[]) ?? [];
      let resolvedQueuedFrontierCapture = false;
      let detailRequests = 0;
      for (const update of updates) {
        const normalizedUpdate =
          "ownerId" in update
            ? update
            : {
                ...update,
                ownerId: undefined,
                ownershipState: undefined,
                capital: undefined
              };
        const updateKey = keyFor(update.x, update.y);
        state.incomingAttacksByTile.delete(updateKey);
        state.pendingCollectVisibleKeys.delete(keyFor(update.x, update.y));
        const existing = state.tiles.get(keyFor(update.x, update.y));
        const merged: any = existing ?? { x: normalizedUpdate.x, y: normalizedUpdate.y, terrain: normalizedUpdate.terrain ?? "LAND" };
        if (normalizedUpdate.terrain) merged.terrain = normalizedUpdate.terrain;
        if ("detailLevel" in normalizedUpdate) merged.detailLevel = normalizedUpdate.detailLevel;
        if (normalizedUpdate.fogged !== undefined) merged.fogged = normalizedUpdate.fogged;
        if (normalizedUpdate.resource !== undefined) merged.resource = normalizedUpdate.resource;
        if ("ownerId" in normalizedUpdate) {
          if (normalizedUpdate.ownerId) merged.ownerId = normalizedUpdate.ownerId;
          else delete merged.ownerId;
        }
        if ("ownershipState" in normalizedUpdate) {
          if (normalizedUpdate.ownershipState) merged.ownershipState = normalizedUpdate.ownershipState;
          else delete merged.ownershipState;
        }
        if ("capital" in normalizedUpdate) {
          if (normalizedUpdate.capital) merged.capital = normalizedUpdate.capital;
          else delete merged.capital;
        }
        if ("breachShockUntil" in normalizedUpdate) {
          if (typeof normalizedUpdate.breachShockUntil === "number") merged.breachShockUntil = normalizedUpdate.breachShockUntil;
          else delete merged.breachShockUntil;
        }
        if ("ownerId" in normalizedUpdate && !normalizedUpdate.ownerId) delete merged.ownershipState;
        if (normalizedUpdate.clusterId !== undefined) merged.clusterId = normalizedUpdate.clusterId;
        if (normalizedUpdate.clusterType !== undefined) merged.clusterType = normalizedUpdate.clusterType;
        if (normalizedUpdate.regionType !== undefined) merged.regionType = normalizedUpdate.regionType;
        if (normalizedUpdate.dockId !== undefined) merged.dockId = normalizedUpdate.dockId;
        if ("dock" in normalizedUpdate) {
          if (normalizedUpdate.dock) merged.dock = normalizedUpdate.dock;
          else delete merged.dock;
        }
        if ("shardSite" in normalizedUpdate) {
          if (normalizedUpdate.shardSite) merged.shardSite = normalizedUpdate.shardSite;
          else delete merged.shardSite;
        }
        if (normalizedUpdate.town !== undefined) merged.town = normalizedUpdate.town;
        if ("town" in normalizedUpdate && !normalizedUpdate.town) delete merged.town;
        if ("fort" in normalizedUpdate) {
          if (normalizedUpdate.fort) merged.fort = normalizedUpdate.fort;
          else delete merged.fort;
        }
        if ("observatory" in normalizedUpdate) {
          if (normalizedUpdate.observatory) merged.observatory = normalizedUpdate.observatory;
          else delete merged.observatory;
        }
        if ("economicStructure" in normalizedUpdate) {
          if (normalizedUpdate.economicStructure) merged.economicStructure = normalizedUpdate.economicStructure;
          else delete merged.economicStructure;
        }
        if ("siegeOutpost" in normalizedUpdate) {
          if (normalizedUpdate.siegeOutpost) merged.siegeOutpost = normalizedUpdate.siegeOutpost;
          else delete merged.siegeOutpost;
        }
        if ("sabotage" in normalizedUpdate) {
          if (normalizedUpdate.sabotage) merged.sabotage = normalizedUpdate.sabotage;
          else delete merged.sabotage;
        }
        if ("yield" in normalizedUpdate) {
          if (normalizedUpdate.yield) merged.yield = normalizedUpdate.yield;
          else delete merged.yield;
        }
        if ("yieldRate" in normalizedUpdate) {
          if (normalizedUpdate.yieldRate) merged.yieldRate = normalizedUpdate.yieldRate;
          else delete merged.yieldRate;
        }
        if ("yieldCap" in normalizedUpdate) {
          if (normalizedUpdate.yieldCap) merged.yieldCap = normalizedUpdate.yieldCap;
          else delete merged.yieldCap;
        }
        if ("upkeepEntries" in normalizedUpdate) {
          if (normalizedUpdate.upkeepEntries) merged.upkeepEntries = normalizedUpdate.upkeepEntries;
          else delete merged.upkeepEntries;
        }
        if ("history" in normalizedUpdate) {
          if (normalizedUpdate.history) merged.history = normalizedUpdate.history;
          else delete merged.history;
        }
        if (tileMatchesDebugKey(normalizedUpdate.x, normalizedUpdate.y, 0, { fallbackTile: state.selected }) && verboseTileDebugEnabled()) {
          debugTileLog("tile-delta-fort-field", {
            x: normalizedUpdate.x,
            y: normalizedUpdate.y,
            detailLevel: normalizedUpdate.detailLevel ?? existing?.detailLevel ?? null,
            hasFortField: "fort" in normalizedUpdate,
            incomingFort: "fort" in normalizedUpdate ? normalizedUpdate.fort ?? null : "__omitted__",
            existingFort: existing?.fort
              ? {
                  ownerId: existing.fort.ownerId,
                  status: existing.fort.status,
                  disabledUntil: existing.fort.disabledUntil ?? null,
                  completesAt: existing.fort.completesAt ?? null
                }
              : null,
            mergedFort: merged.fort
              ? {
                  ownerId: merged.fort.ownerId,
                  status: merged.fort.status,
                  disabledUntil: merged.fort.disabledUntil ?? null,
                  completesAt: merged.fort.completesAt ?? null
                }
              : null
          });
        }
        const resolved = mergeServerTileWithOptimisticState(mergeIncomingTileDetail(existing, merged));
        state.tiles.set(updateKey, resolved);
        logFrontierTimeline("frontier-delta-apply", resolved.x, resolved.y, {
          before: existing,
          incoming: normalizedUpdate,
          after: resolved,
          extra: {
            source: "TILE_DELTA",
            updateHasEconomicStructure: "economicStructure" in normalizedUpdate
          }
        });
        logDebugTileState("tile-delta", resolved, {
          source: "TILE_DELTA",
          updateHasEconomicStructure: "economicStructure" in normalizedUpdate,
          updateEconomicStructure: normalizedUpdate.economicStructure?.type,
          existingEconomicStructure: existing?.economicStructure?.type
        });
        if (
          existing?.ownerId !== resolved.ownerId ||
          existing?.ownershipState !== resolved.ownershipState ||
          updateKey === state.actionTargetKey ||
          state.settleProgressByTile.has(updateKey)
        ) {
          logTileSync("tile_delta_applied", {
            tileKey: updateKey,
            existingOwnerId: existing?.ownerId,
            existingOwnershipState: existing?.ownershipState,
            updateOwnerId: "ownerId" in normalizedUpdate ? normalizedUpdate.ownerId ?? null : "__omitted__",
            updateOwnershipState: "ownershipState" in normalizedUpdate ? normalizedUpdate.ownershipState ?? null : "__omitted__",
            resolvedOwnerId: resolved.ownerId,
            resolvedOwnershipState: resolved.ownershipState,
            optimisticPending: resolved.optimisticPending
          });
        }
        if (resolved.ownerId === state.me && (resolved.ownershipState === "FRONTIER" || resolved.ownershipState === "SETTLED")) {
          state.frontierSyncWaitUntilByTarget.delete(updateKey);
          state.actionQueue = state.actionQueue.filter((entry) => keyFor(entry.x, entry.y) !== updateKey);
          state.queuedTargetKeys.delete(updateKey);
          logFrontierTimeline("frontier-queue-resolved-by-delta", resolved.x, resolved.y, {
            before: existing,
            after: resolved,
            extra: {
              source: "TILE_DELTA"
            }
          });
        }
        maybeAnnounceShardSite(existing, resolved);
        if (!resolved.optimisticPending) clearOptimisticTileState(updateKey);
        markDockDiscovered(resolved);
        if (!resolved.fogged) state.discoveredTiles.add(updateKey);
        if (detailRequests < 4) {
          const before = state.tileDetailRequestedAt.get(updateKey) ?? 0;
          maybeRequestTileDetail(resolved);
          const after = state.tileDetailRequestedAt.get(updateKey) ?? 0;
          if (after > before) detailRequests += 1;
        }
        if (
          deps.settlementProgressForTile(update.x, update.y) &&
          (resolved.ownerId !== state.me || (resolved.ownershipState !== "FRONTIER" && resolved.ownershipState !== "SETTLED"))
        ) {
          clearSettlementProgressForTile(update.x, update.y);
        } else if (resolved.ownerId === state.me && resolved.ownershipState === "SETTLED") {
          clearSettlementProgressForTile(update.x, update.y);
        }
        if (
          !resolvedQueuedFrontierCapture &&
          updateKey === state.actionTargetKey &&
          state.actionInFlight &&
          resolved.ownerId === state.me &&
          resolved.ownershipState === "FRONTIER"
        ) {
          resolvedQueuedFrontierCapture = true;
        }
      }
      if (resolvedQueuedFrontierCapture) {
        const resolvedCurrentKey = state.actionCurrent ? keyFor(state.actionCurrent.x, state.actionCurrent.y) : "";
        state.capture = undefined;
        if (state.pendingCombatReveal?.targetKey === state.actionTargetKey) state.pendingCombatReveal = undefined;
        state.actionInFlight = false;
        state.actionAcceptedAck = false;
        state.combatStartAck = false;
        state.actionStartedAt = 0;
        if (state.actionTargetKey) dropQueuedTargetKeyIfAbsent(state.actionTargetKey);
        if (state.actionTargetKey) clearOptimisticTileState(state.actionTargetKey);
        if (resolvedCurrentKey) dropQueuedTargetKeyIfAbsent(resolvedCurrentKey);
        if (resolvedCurrentKey) clearOptimisticTileState(resolvedCurrentKey);
        state.actionTargetKey = "";
        state.actionCurrent = undefined;
        processActionQueue();
        renderHud();
      }
      return;
    }

    if (msg.type === "TECH_UPDATE") {
      console.info("[tech] TECH_UPDATE received", {
        status: msg.status,
        techRootId: msg.techRootId,
        ownedTechs: (msg.techIds as string[])?.length ?? 0,
        nextChoices: (msg.nextChoices as string[])?.length ?? 0
      });
      applyTechUpdateToState(state, {
        status: msg.status as "started" | "completed" | undefined,
        techRootId: msg.techRootId as string | undefined,
        currentResearch: (msg.currentResearch as typeof state.currentResearch | undefined) ?? undefined,
        techIds: (msg.techIds as string[]) ?? [],
        nextChoices: (msg.nextChoices as string[]) ?? [],
        availableTechPicks: (msg.availableTechPicks as number) ?? state.availableTechPicks,
        developmentProcessLimit: (msg.developmentProcessLimit as number | undefined) ?? state.developmentProcessLimit,
        activeDevelopmentProcessCount:
          (msg.activeDevelopmentProcessCount as number | undefined) ?? state.activeDevelopmentProcessCount,
        mods: (msg.mods as typeof state.mods) ?? state.mods,
        modBreakdown: (msg.modBreakdown as typeof state.modBreakdown | undefined) ?? state.modBreakdown,
        incomePerMinute: (msg.incomePerMinute as number) ?? state.incomePerMinute,
        missions: (msg.missions as any[]) ?? state.missions,
        techCatalog: (msg.techCatalog as any[]) ?? state.techCatalog,
        domainIds: (msg.domainIds as string[]) ?? state.domainIds,
        domainChoices: (msg.domainChoices as string[]) ?? state.domainChoices,
        domainCatalog: (msg.domainCatalog as any[]) ?? state.domainCatalog,
        revealCapacity: (msg.revealCapacity as number) ?? state.revealCapacity,
        activeRevealTargets: (msg.activeRevealTargets as string[]) ?? state.activeRevealTargets
      }, pushFeed);
      if (typeof msg.activeDevelopmentProcessCount === "number") clearQueuedDevelopmentDispatchPending();
      renderHud();
      return;
    }

    if (msg.type === "DOMAIN_UPDATE") {
      state.pendingDomainUnlockId = "";
      state.developmentProcessLimit = (msg.developmentProcessLimit as number | undefined) ?? state.developmentProcessLimit;
      if (typeof msg.activeDevelopmentProcessCount === "number") clearQueuedDevelopmentDispatchPending();
      state.activeDevelopmentProcessCount =
        (msg.activeDevelopmentProcessCount as number | undefined) ?? state.activeDevelopmentProcessCount;
      state.domainIds = (msg.domainIds as string[]) ?? state.domainIds;
      state.domainChoices = (msg.domainChoices as string[]) ?? state.domainChoices;
      state.domainCatalog = (msg.domainCatalog as any[]) ?? state.domainCatalog;
      state.revealCapacity = (msg.revealCapacity as number) ?? state.revealCapacity;
      state.activeRevealTargets = (msg.activeRevealTargets as string[]) ?? state.activeRevealTargets;
      state.mods = (msg.mods as typeof state.mods) ?? state.mods;
      state.modBreakdown = (msg.modBreakdown as typeof state.modBreakdown | undefined) ?? state.modBreakdown;
      state.incomePerMinute = (msg.incomePerMinute as number) ?? state.incomePerMinute;
      state.missions = (msg.missions as any[]) ?? state.missions;
      pushFeed(`Domain chosen: ${state.domainIds[state.domainIds.length - 1] ?? "unknown"}`, "tech", "success");
      renderHud();
      return;
    }

    if (msg.type === "REVEAL_EMPIRE_UPDATE") {
      state.activeRevealTargets = (msg.activeTargets as string[]) ?? state.activeRevealTargets;
      state.revealCapacity = (msg.revealCapacity as number) ?? state.revealCapacity;
      renderHud();
      return;
    }

    if (msg.type === "REVEAL_EMPIRE_STATS_RESULT") {
      const stats = (msg.stats as any) ?? undefined;
      if (stats?.playerId) {
        state.revealedEmpireStatsByPlayer.set(stats.playerId, stats);
        pushFeed(revealEmpireStatsFeedText(stats), "combat", "success");
      }
      renderHud();
      return;
    }

    if (msg.type === "ALLIANCE_REQUEST_INCOMING") {
      const request = (msg.request as any) ?? undefined;
      if (request && !state.incomingAllianceRequests.some((existing: any) => existing.id === request.id)) {
        const fromName = msg.fromName as string | undefined;
        if (fromName) request.fromName = fromName;
        state.incomingAllianceRequests.push(request);
      }
      pushFeed(`Incoming alliance request${request?.fromName ? ` from ${request.fromName}` : ""}`, "alliance", "info");
      renderHud();
      return;
    }

    if (msg.type === "ALLIANCE_REQUESTED") {
      const request = msg.request as any;
      if (request && !state.outgoingAllianceRequests.some((existing: any) => existing.id === request.id)) {
        state.outgoingAllianceRequests.push(request);
      }
      const targetName =
        (msg.targetName as string | undefined) ??
        request?.toName ??
        (request ? playerNameForOwner(request.toPlayerId) : undefined);
      pushFeed(`Alliance request sent${targetName ? ` to ${targetName}` : ""}`, "alliance", "success");
      renderHud();
      return;
    }

    if (msg.type === "ALLIANCE_UPDATE") {
      state.allies = (msg.allies as string[]) ?? [];
      state.incomingAllianceRequests = (msg.incomingAllianceRequests as any[] | undefined) ?? state.incomingAllianceRequests;
      state.outgoingAllianceRequests = (msg.outgoingAllianceRequests as any[] | undefined) ?? state.outgoingAllianceRequests;
      pushFeed(`Alliances updated (${state.allies.length})`, "alliance", "info");
      renderHud();
      return;
    }

    if (msg.type === "TRUCE_REQUEST_INCOMING") {
      const request = (msg.request as any) ?? undefined;
      if (request) {
        const fromName = msg.fromName as string | undefined;
        if (fromName) request.fromName = fromName;
        state.incomingTruceRequests = [...state.incomingTruceRequests.filter((entry: any) => entry.id !== request.id), request];
      }
      pushFeed(`Incoming truce offer${request?.fromName ? ` from ${request.fromName}` : ""}.`, "alliance", "info");
      renderHud();
      return;
    }

    if (msg.type === "TRUCE_REQUESTED") {
      const request = msg.request as any;
      const targetName = (msg.targetName as string | undefined) ?? request?.toName ?? (request ? playerNameForOwner(request.toPlayerId) : undefined);
      pushFeed(`Truce offered${targetName ? ` to ${targetName}` : ""}.`, "alliance", "success");
      renderHud();
      return;
    }

    if (msg.type === "TRUCE_UPDATE") {
      state.activeTruces = (msg.activeTruces as any[]) ?? state.activeTruces;
      state.incomingTruceRequests = (msg.incomingTruceRequests as any[]) ?? state.incomingTruceRequests;
      const announcement = msg.announcement as string | undefined;
      if (announcement) pushFeed(announcement, "alliance", "warn");
      renderHud();
      return;
    }

    if (msg.type === "AETHER_BRIDGE_UPDATE") {
      state.activeAetherBridges = (msg.bridges as any[]) ?? state.activeAetherBridges;
      renderHud();
      return;
    }

    if (msg.type === "AETHER_WALL_UPDATE") {
      state.activeAetherWalls = (msg.walls as any[]) ?? state.activeAetherWalls;
      renderHud();
      return;
    }

    if (msg.type === "STRATEGIC_REPLAY_EVENT") {
      const event = (msg.event as any) ?? undefined;
      if (event) {
        state.strategicReplayEvents.push(event);
        if (!state.replayActive) resetStrategicReplayState();
        else if (!state.replayPlaying && state.replayIndex >= Math.max(0, state.strategicReplayEvents.length - 2)) {
          resetStrategicReplayState();
        }
      }
      renderHud();
      return;
    }

    if (msg.type === "SEASON_VICTORY_UPDATE") {
      state.seasonVictory = (msg.objectives as any[]) ?? state.seasonVictory;
      state.seasonWinner = (msg.seasonWinner as any | undefined) ?? state.seasonWinner;
      const announcement = msg.announcement as string | undefined;
      if (announcement) pushFeed(announcement, "info", "warn");
      renderHud();
      return;
    }

    if (msg.type === "SEASON_WINNER_CROWNED") {
      state.seasonWinner = (msg.winner as any | undefined) ?? state.seasonWinner;
      state.seasonVictory = (msg.objectives as any[] | undefined) ?? state.seasonVictory;
      state.leaderboard = (msg.leaderboard as typeof state.leaderboard | undefined) ?? state.leaderboard;
      if (state.seasonWinner) {
        pushFeed(`${state.seasonWinner.playerName} was crowned season winner via ${state.seasonWinner.objectiveName}.`, "info", "warn");
        state.activePanel = "leaderboard";
      }
      renderHud();
      return;
    }

    if (msg.type === "ERROR") {
      if ((msg.code as string | undefined)?.startsWith("COLLECT")) {
        state.pendingCollectVisibleKeys.clear();
        revertOptimisticVisibleCollectDelta();
        const collectTileKey = typeof msg.x === "number" && typeof msg.y === "number" ? keyFor(Number(msg.x), Number(msg.y)) : "";
        if (collectTileKey) revertOptimisticTileCollectDelta(collectTileKey);
      }
      const failedTargetKey = state.actionTargetKey;
      const failedTargetTile = failedTargetKey ? state.tiles.get(failedTargetKey) : undefined;
      console.error("[server-error]", {
        code: msg.code,
        message: msg.message,
        actionInFlight: state.actionInFlight,
        actionTargetKey: failedTargetKey,
        actionTargetTile: failedTargetTile
          ? {
              x: failedTargetTile.x,
              y: failedTargetTile.y,
              ownerId: failedTargetTile.ownerId,
              ownershipState: failedTargetTile.ownershipState,
              optimisticPending: failedTargetTile.optimisticPending,
              detailLevel: failedTargetTile.detailLevel
            }
          : undefined,
        actionCurrent: state.actionCurrent,
        queuedActions: state.actionQueue.length,
        selected: state.selected,
        hover: state.hover
      });
      const errorCode = String(msg.code ?? "");
      const errorMessage = String(msg.message ?? "unknown failure");
      if (errorCode.startsWith("TECH_") && state.pendingTechUnlockId) {
        state.pendingTechUnlockId = "";
        state.currentResearch = undefined;
      }
      if (errorCode.startsWith("DOMAIN_") && state.pendingDomainUnlockId) {
        state.pendingDomainUnlockId = "";
      }
      const errorTileKey = typeof msg.x === "number" && typeof msg.y === "number" ? keyFor(Number(msg.x), Number(msg.y)) : state.latestSettleTargetKey;
      if (errorMessage.includes("development slots are busy")) {
        logTileSync("development_slot_busy_error", {
          code: errorCode,
          message: errorMessage,
          errorTileKey,
          activeDevelopmentProcessCount: state.activeDevelopmentProcessCount,
          developmentProcessLimit: state.developmentProcessLimit,
          developmentQueueLength: state.developmentQueue.length,
          queuedDevelopmentDispatchPending: state.queuedDevelopmentDispatchPending,
          lastDevelopmentAttempt: state.lastDevelopmentAttempt ?? null,
          settleProgressKeys: [...state.settleProgressByTile.keys()]
        });
      }
      if (typeof msg.x === "number" && typeof msg.y === "number") {
        logFrontierTimeline("frontier-error", Number(msg.x), Number(msg.y), {
          before: state.tiles.get(errorTileKey),
          after: state.tiles.get(errorTileKey),
          extra: {
            code: errorCode,
            message: errorMessage
          }
        });
      }
      if (errorCode === "AUTH_FAIL" || errorCode === "NO_AUTH" || errorCode === "AUTH_UNAVAILABLE" || errorCode === "SERVER_STARTING") {
        state.authSessionReady = false;
        if ((errorCode === "AUTH_UNAVAILABLE" || errorCode === "SERVER_STARTING") && firebaseAuth?.currentUser) {
          state.authBusyTitle = "Securing session";
          state.authBusyDetail =
            errorCode === "SERVER_STARTING"
              ? "The game server is still starting. Retrying sign-in shortly..."
              : "Google account connected, but the authentication service did not answer in time. Retrying...";
          scheduleAuthReconnect(
            errorCode === "SERVER_STARTING"
              ? "Game server is still starting. Retrying sign-in..."
              : "Google account connected. Waiting for the game server to finish authorizing..."
          );
          return;
        }
        if (errorCode === "AUTH_FAIL" && firebaseAuth?.currentUser && !state.authRetrying) {
          state.authBusy = true;
          state.authRetrying = true;
          state.authBusyTitle = "Securing session";
          state.authBusyDetail = "Refreshing your Firebase session after a server auth failure.";
          setAuthStatus("Refreshing Firebase session...");
          syncAuthOverlay();
          void authenticateSocket(true)
            .catch(() => {
              state.authBusy = false;
              state.authRetrying = false;
              state.authBusyTitle = "";
              state.authBusyDetail = "";
              setAuthStatus(errorMessage, "error");
              syncAuthOverlay();
            });
          renderHud();
          return;
        }
        state.authBusy = false;
        state.authRetrying = false;
        state.authBusyTitle = "";
        state.authBusyDetail = "";
        setAuthStatus(errorMessage, "error");
        syncAuthOverlay();
      }
      const isStructureActionError =
        errorCode === "FORT_BUILD_INVALID" ||
        errorCode === "OBSERVATORY_BUILD_INVALID" ||
        errorCode === "SIEGE_OUTPOST_BUILD_INVALID" ||
        errorCode === "ECONOMIC_STRUCTURE_BUILD_INVALID" ||
        errorCode === "STRUCTURE_REMOVE_INVALID" ||
        errorCode === "STRUCTURE_CANCEL_INVALID";
      if (maybeRecoverBusyDevelopmentAttempt(errorCode, errorMessage, errorTileKey)) return;
      if (maybeRecoverTransientSettlementAttempt(errorCode, errorMessage, errorTileKey)) return;
      if (errorCode === "INSUFFICIENT_GOLD" && failedTargetKey) {
        notifyInsufficientGoldForFrontierAction(errorMessage === "insufficient gold for frontier claim" ? "claim" : "attack");
      } else if (errorCode === "SETTLE_INVALID") {
        clearOptimisticTileStateSafely(errorTileKey, true);
        clearSettlementProgressSafely(errorTileKey);
        state.queuedDevelopmentDispatchPending = false;
        showCaptureAlertSafely("Action failed", errorMessage, "warn");
        if (state.lastDevelopmentAttempt?.tileKey === errorTileKey) state.lastDevelopmentAttempt = undefined;
      } else if (isStructureActionError && errorTileKey) {
        clearOptimisticTileStateSafely(errorTileKey, true);
        state.queuedDevelopmentDispatchPending = false;
        showCaptureAlertSafely(errorCode === "STRUCTURE_REMOVE_INVALID" ? "Removal failed" : "Construction failed", errorMessage, "warn");
        if (state.lastDevelopmentAttempt?.tileKey === errorTileKey) state.lastDevelopmentAttempt = undefined;
      } else if (errorCode === "TOWN_UNFED") {
        showCaptureAlertSafely("Town unfed", errorMessage, "warn");
      }
      if (errorCode === "COLLECT_EMPTY") {
        pushFeedSafely(`Nothing to collect on this tile yet: ${errorMessage}.`, "info", "warn");
      } else if (errorCode === "COLLECT_COOLDOWN") {
        if (state.collectVisibleCooldownUntil <= Date.now()) state.collectVisibleCooldownUntil = Date.now() + deps.COLLECT_VISIBLE_COOLDOWN_MS;
        showCollectVisibleCooldownAlert();
        pushFeedSafely(`Collect visible cooling down for ${formatCooldownShort(state.collectVisibleCooldownUntil - Date.now())}.`, "info", "warn");
      } else if (errorCode === "TOWN_UNFED") {
        pushFeedSafely(errorMessage, "info", "warn");
      } else {
        const failureExplanationOptions = {
          ...(typeof msg.cooldownRemainingMs === "number" ? { cooldownRemainingMs: msg.cooldownRemainingMs } : {}),
          formatCooldownShort
        };
        pushFeedSafely(
          explainActionFailureSafely(errorCode, errorMessage, failureExplanationOptions),
          "error",
          "error"
        );
      }
      const frontierActionError =
        errorCode === "ACTION_INVALID" ||
        errorCode === "ATTACK_TARGET_INVALID" ||
        errorCode === "NOT_ADJACENT" ||
        errorCode === "NOT_OWNER" ||
        errorCode === "ATTACK_COOLDOWN" ||
        errorCode === "EXPAND_TARGET_OWNED" ||
        errorCode === "LOCKED";
      const failedCurrentKey = state.actionCurrent ? keyFor(state.actionCurrent.x, state.actionCurrent.y) : "";
      const shouldResetFrontierAction = shouldResetFrontierActionStateForError(errorCode);
      if (shouldResetFrontierAction) {
        if (failedTargetKey) {
          const failedTile = state.tiles.get(failedTargetKey);
          if (failedTile) {
            logFrontierTimeline("frontier-reset-after-error", failedTile.x, failedTile.y, {
              before: failedTile,
              after: failedTile,
              extra: {
                code: errorCode,
                message: errorMessage,
                failedCurrentKey
              }
            });
          }
        }
        state.capture = undefined;
        if (state.pendingCombatReveal?.targetKey === failedCurrentKey) state.pendingCombatReveal = undefined;
        state.actionInFlight = false;
        state.actionAcceptedAck = false;
        state.combatStartAck = false;
        state.actionStartedAt = 0;
        state.actionTargetKey = "";
        state.actionCurrent = undefined;
        if (errorCode === "ATTACK_COOLDOWN") {
          if (failedCurrentKey) state.frontierSyncWaitUntilByTarget.set(failedCurrentKey, Date.now() + COMBAT_LOCK_MS);
          if (failedTargetKey) state.frontierSyncWaitUntilByTarget.set(failedTargetKey, Date.now() + COMBAT_LOCK_MS);
        }
        if (errorCode === "LOCKED") {
          if (failedCurrentKey) state.frontierSyncWaitUntilByTarget.set(failedCurrentKey, Date.now() + 12_000);
          if (failedTargetKey) state.frontierSyncWaitUntilByTarget.set(failedTargetKey, Date.now() + 12_000);
        }
        if (failedCurrentKey) dropQueuedTargetKeyIfAbsent(failedCurrentKey);
        if (failedCurrentKey) clearOptimisticTileStateSafely(failedCurrentKey, true);
        if (failedTargetKey) clearOptimisticTileStateSafely(failedTargetKey, true);
        if (failedTargetKey) state.autoSettleTargets.delete(failedTargetKey);
      } else if (failedTargetKey) {
        clearOptimisticTileStateSafely(failedTargetKey, true);
      }
      state.attackPreviewPendingKey = "";
      if (frontierActionError || !shouldResetFrontierAction) {
        state.lastSubAt = 0;
        requestViewRefreshSafely(2, true);
      }
      reconcileActionQueueSafely();
      processActionQueueSafely();
      renderHud();
      return;
    }

    if (msg.type === "ATTACK_PREVIEW_RESULT") {
      const from = msg.from as { x: number; y: number };
      const to = msg.to as { x: number; y: number };
      const preview: {
        fromKey: string;
        toKey: string;
        valid: boolean;
        reason?: string;
        winChance?: number;
        breakthroughWinChance?: number;
        atkEff?: number;
        defEff?: number;
        defenseEffPct?: number;
        receivedAt: number;
      } = {
        fromKey: keyFor(from.x, from.y),
        toKey: keyFor(to.x, to.y),
        valid: Boolean(msg.valid),
        receivedAt: Date.now()
      };
      const reason = msg.reason as string | undefined;
      const winChance = msg.winChance as number | undefined;
      const breakthroughWinChance = msg.breakthroughWinChance as number | undefined;
      const atkEff = msg.atkEff as number | undefined;
      const defEff = msg.defEff as number | undefined;
      const defMult = msg.defMult as number | undefined;
      if (reason) preview.reason = reason;
      if (typeof winChance === "number") preview.winChance = winChance;
      if (typeof breakthroughWinChance === "number") preview.breakthroughWinChance = breakthroughWinChance;
      if (typeof atkEff === "number") preview.atkEff = atkEff;
      if (typeof defEff === "number") preview.defEff = defEff;
      if (typeof defMult === "number") preview.defenseEffPct = Math.max(0, Math.min(100, defMult * 100));
      state.attackPreview = preview;
      state.attackPreviewCacheByKey.set(`${preview.fromKey}->${preview.toKey}`, preview);
      state.attackPreviewPendingKey = "";
      if (state.tileActionMenu.visible && state.tileActionMenu.mode === "single" && state.tileActionMenu.currentTileKey) {
        const selectedTile = state.tiles.get(state.tileActionMenu.currentTileKey);
        if (selectedTile && selectedTile.ownerId && selectedTile.ownerId !== state.me && !isTileOwnedByAlly(selectedTile)) {
          openSingleTileActionMenu(selectedTile, state.tileActionMenu.x, state.tileActionMenu.y);
        }
      }
      renderHud();
      return;
    }

    if (msg.type === "PLAYER_STYLE") {
      const playerId = msg.playerId as string;
      const color = msg.tileColor as string | undefined;
      const visualStyle = msg.visualStyle as any;
      const shieldUntil = msg.shieldUntil as number | undefined;
      if (playerId && color) {
        state.playerColors.set(playerId, color);
        if (playerId === state.me) authProfileColorEl.value = color;
      }
      if (playerId && visualStyle) state.playerVisualStyles.set(playerId, visualStyle);
      if (playerId && typeof shieldUntil === "number") state.playerShieldUntil.set(playerId, shieldUntil);
      return;
    }

    if (msg.type === "COLLECT_RESULT") {
      state.pendingCollectVisibleKeys.clear();
      if ((msg.mode as string | undefined) === "visible") clearPendingCollectVisibleDelta();
      if ((msg.mode as string | undefined) === "tile" && typeof msg.x === "number" && typeof msg.y === "number") {
        clearPendingCollectTileDelta(keyFor(Number(msg.x), Number(msg.y)));
      }
      const gold = Number(msg.gold ?? 0);
      const strategic = (msg.strategic as Record<string, number> | undefined) ?? {};
      const strategicParts = Object.entries(strategic)
        .filter(([, value]) => Number(value) > 0)
        .map(([resource, value]) => `${Number(value).toFixed(1)} ${resource}`);
      const bits: string[] = [];
      if (gold > 0) bits.push(`${gold.toFixed(1)} gold`);
      bits.push(...strategicParts);
      pushFeed(bits.length > 0 ? `Collected ${bits.join(", ")}.` : "No collectable yield.", "info", bits.length > 0 ? "success" : "warn");
      renderHud();
      return;
    }

    if (msg.type === "SEASON_ROLLOVER" || msg.type === "WORLD_REGENERATED") {
      clearDeferredBootstrapRefreshTimer();
      const season = msg.season as { worldSeed?: number } | undefined;
      if (typeof season?.worldSeed === "number") {
        setWorldSeed(season.worldSeed);
        clearRenderCaches();
        buildMiniMapBase();
      }
      if (msg.type === "SEASON_ROLLOVER") {
        state.seasonWinner = undefined;
        state.seasonVictory = [];
      }
      state.tiles.clear();
      state.mapLoadStartedAt = Date.now();
      state.firstChunkAt = 0;
      state.chunkFullCount = 0;
      state.lastChunkSnapshotGeneration = 0;
      state.hasOwnedTileInCache = false;
      state.dockRouteCache.clear();
      pushFeed(
        msg.type === "SEASON_ROLLOVER" ? "Season rolled over. World and progression reset." : "World regenerated by admin. Fresh map loaded.",
        "info",
        "warn"
      );
      requestViewRefresh(1, true);
      renderHud();
      return;
    }

    if (msg.type === "SHARD_RAIN_EVENT") {
      if ((msg.phase as string | undefined) === "upcoming" && typeof (msg.startsAt as number | undefined) === "number") {
        showShardAlert({
          key: shardAlertKeyForPayload("upcoming", msg.startsAt as number),
          phase: "upcoming",
          startsAt: msg.startsAt as number
        });
      }
      if (
        (msg.phase as string | undefined) === "started" &&
        typeof (msg.startsAt as number | undefined) === "number" &&
        typeof (msg.expiresAt as number | undefined) === "number"
      ) {
        state.shardRainFxUntil = Date.now() + 8_000;
        showShardAlert({
          key: shardAlertKeyForPayload("started", msg.startsAt as number),
          phase: "started",
          startsAt: msg.startsAt as number,
          expiresAt: msg.expiresAt as number,
          siteCount: Number(msg.siteCount ?? 0)
        });
      }
      renderHud();
    }
  });
};
