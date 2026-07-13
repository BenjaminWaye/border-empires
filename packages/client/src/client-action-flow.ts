import { FRONTIER_CLAIM_COST } from "@border-empires/shared";
import { canAffordCost } from "./client-constants.js";
import { connectedEnemyRegionKeys, connectedOwnedFrontierKeys } from "./client-connected-region/client-connected-region.js";
import { readyOwnedObservatoryCooldownRemainingMs } from "./client-observatory-cooldown/client-observatory-cooldown.js";
import { ownObservatoryRange } from "./client-observatory-rules/client-observatory-rules.js";
import {
  activeTruceWithPlayerFromState,
  explainActionFailureFromServer
} from "./client-player-actions.js";
import { createPlayerActionShortcuts } from "./client-player-action-shortcuts/client-player-action-shortcuts.js";
import { createNextFrontierCommandIdentity } from "./client-frontier-command/client-frontier-command.js";
import { recordClientDebugEvent } from "./client-debug/client-debug.js";
import { blockUnsupportedRewriteMessage } from "./client-send-message-guard/client-send-message-guard.js";
import { showVisibleActionWarning } from "./client-visible-action-warning.js";
import {
  activeSettlementProgressEntries as activeSettlementProgressEntriesFromModule,
  applyPendingSettlementsFromServer as applyPendingSettlementsFromServerFromModule,
  attackPreviewDetailForTarget as attackPreviewDetailForTargetFromModule,
  attackPreviewPendingForTarget as attackPreviewPendingForTargetFromModule,
  attackQueueFailureReason as attackQueueFailureReasonFromModule,
  buildFrontierQueue as buildFrontierQueueFromModule,
  cancelQueuedSettlement as cancelQueuedSettlementFromModule,
  cancelQueuedBuild as cancelQueuedBuildFromModule,
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
  processPendingMusterAttacks as processPendingMusterAttacksFromModule,
  queueDevelopmentAction as queueDevelopmentActionFromModule,
  queueSpecificTargets as queueSpecificTargetsFromModule,
  queuedDevelopmentEntryForTile as queuedDevelopmentEntryForTileFromModule,
  queuedBuildEntryForTile as queuedBuildEntryForTileFromModule,
  queuedSettlementIndexForTile as queuedSettlementIndexForTileFromModule,
  reconcileActionQueue as reconcileActionQueueFromModule,
  requestAttackPreviewForHover as requestAttackPreviewForHoverFromModule,
  requestAttackPreviewForTarget as requestAttackPreviewForTargetFromModule,
  requestSettlement as requestSettlementFromModule,
  resetAttackPreviewState,
  sendDevelopmentBuild as sendDevelopmentBuildFromModule,
  settlementProgressForTile as settlementProgressForTileFromModule,
  syncOptimisticSettlementTile as syncOptimisticSettlementTileFromModule,
  type DevelopmentSlotSummary
} from "./client-queue-logic/client-queue-logic.js";
import {
  buildFortOnSelected as buildFortOnSelectedFromModule,
  buildSiegeOutpostOnSelected as buildSiegeOutpostOnSelectedFromModule,
  cancelOngoingCapture as cancelOngoingCaptureFromModule,
  collectSelectedShard as collectSelectedShardFromModule,
  collectSelectedYield as collectSelectedYieldFromModule,
  collectVisibleYield as collectVisibleYieldFromModule,
  hideTileActionMenu as hideTileActionMenuFromModule,
  settleSelected as settleSelectedFromModule,
  uncaptureSelected as uncaptureSelectedFromModule
} from "./client-selected-actions/client-selected-actions.js";
import {
  aetherWallDirectionTargetTiles as aetherWallDirectionTargetTilesFromModule,
  beginCrystalTargeting as beginCrystalTargetingFromModule,
  canPlaceAetherWallFromOrigin as canPlaceAetherWallFromOriginFromModule,
  clearCrystalTargeting as clearCrystalTargetingFromModule,
  computeCrystalTargets as computeCrystalTargetsFromModule,
  crystalTargetingTitle as crystalTargetingTitleFromModule,
  crystalTargetingTone as crystalTargetingToneFromModule,
  executeCrystalTargeting as executeCrystalTargetingFromModule,
  hasAetherBridgeCapability as hasAetherBridgeCapabilityFromModule,
  hasAetherWallCapability as hasAetherWallCapabilityFromModule,
  hasOwnedLandWithinClientRange as hasOwnedLandWithinClientRangeFromModule,
  hasRevealCapability as hasRevealCapabilityFromModule,
  hasSiphonCapability as hasSiphonCapabilityFromModule,
  hasTerrainShapingCapability as hasTerrainShapingCapabilityFromModule,
  isOwnedBorderTile as isOwnedBorderTileFromModule,
  lineStepsBetween as lineStepsBetweenFromModule,
  menuActionsForSingleTile as menuActionsForSingleTileFromModule,
  validAetherWallDirectionsForTile as validAetherWallDirectionsForTileFromModule,
  tileActionAvailability as tileActionAvailabilityFromModule,
  tileActionAvailabilityWithDevelopmentSlot as tileActionAvailabilityWithDevelopmentSlotFromModule
} from "./client-tile-action-logic/client-tile-action-logic.js";
import {
  chebyshevDistanceClient as chebyshevDistanceClientFromModule,
  hideTechLockedTileAction as hideTechLockedTileActionFromModule,
  hostileObservatoryProtectingTile as hostileObservatoryProtectingTileFromModule,
  isTileOwnedByAlly as isTileOwnedByAllyFromModule,
  requiredTechForTileAction as requiredTechForTileActionFromModule,
  shouldOptimisticallyBuildOnSelectedTile as shouldOptimisticallyBuildOnSelectedTileFromModule,
  splitTileActionsIntoTabs as splitTileActionsIntoTabsFromModule,
  tileActionIsBuilding as tileActionIsBuildingFromModule,
  tileActionIsCrystal as tileActionIsCrystalFromModule
} from "./client-tile-action-support/client-tile-action-support.js";
import {
  settledDefenseNearFortDomainModifiers,
  tileAreaEffectModifiersForTile as tileAreaEffectModifiersForTileFromModule
} from "./client-structure-effects/client-structure-effects.js";
import { createBuildingPlacementFlow } from "./client-building-placement/client-building-placement.js";
import { openBulkTileActionMenu as openBulkTileActionMenuFromModule, openSingleTileActionMenu as openSingleTileActionMenuFromModule, renderTileActionMenu as renderTileActionMenuFromModule } from "./client-tile-action-menu-ui/client-tile-action-menu-ui.js";
import {
  buildDetailTextForAction as buildDetailTextForActionFromModule,
  constructionProgressForTile as constructionProgressForTileFromModule,
  menuOverviewForTile as menuOverviewForTileFromModule,
  ownTownEconomyFieldsPartial,
  queuedBuildProgressForTile as queuedBuildProgressForTileFromModule,
  queuedSettlementProgressForTile as queuedSettlementProgressForTileFromModule,
  tileMenuViewForTile as tileMenuViewForTileFromModule,
  tileProductionRequirementLabel as tileProductionRequirementLabelFromModule
} from "./client-tile-menu-view/client-tile-menu-view.js";
import { tileWithVisibleShardSite } from "./client-shard-rain-pings/client-shard-rain-pings.js";
import { neutralTileClickOutcome } from "./client-tile-interaction/client-tile-interaction.js";
import { handleWaypointAction } from "./client-waypoint-action-handlers.js";
import { revealWholeMapInTrue3DMode } from "./client-renderer-mode.js";
import type { RealtimeSocket } from "./client-socket-types.js";
import type { ClientState } from "./client-state/client-state.js";
import type {
  ActiveTruceView,
  CrystalTargetingAbility,
  OptimisticStructureKind,
  Tile,
  TileActionDef,
  TileMenuProgressView,
  TileMenuView,
  TileOverviewLine,
  TileTimedProgress,
  TileVisibilityState
} from "./client-types.js";
import { debugTileLog, tileMatchesDebugKey, verboseTileDebugEnabled } from "./client-debug/client-debug.js";

type ActionFlowDeps = Record<string, any> & {
  state: ClientState;
  ws: RealtimeSocket;
  wsUrl: string;
  canvas: HTMLCanvasElement;
  techPickEl: HTMLSelectElement;
  mobileTechPickEl: HTMLSelectElement;
  tileActionMenuEl: HTMLDivElement;
  placementOverlayEl: HTMLDivElement;
  placementLabelEl: HTMLDivElement;
};
type TileDetailRequestOptions = {
  force?: boolean;
};

export const shouldSendTileDetailRequest = (tile: Tile | undefined, me: string, options: TileDetailRequestOptions = {}): tile is Tile => {
  if (!tile || tile.fogged) return false;
  if (options.force) return true;
  return tile.detailLevel !== "full" || ownTownEconomyFieldsPartial(tile, me);
};

export const shouldRefreshTileDetailOnPress = (tile: Tile | undefined, visibility: TileVisibilityState): tile is Tile =>
  Boolean(tile && visibility === "visible" && !tile.fogged);

export const createClientActionFlow = (deps: ActionFlowDeps) => {
  const {
    state,
    ws,
    wsUrl,
    canvas,
    techPickEl,
    mobileTechPickEl,
    tileActionMenuEl,
    keyFor,
    parseKey,
    wrapX,
    wrapY,
    terrainAt,
    viewportSize,
    isAdjacent,
    pickOriginForTarget,
    setAuthStatus,
    syncAuthOverlay,
    pushFeed,
    renderHud,
    requestViewRefresh,
    selectedTile,
    applyOptimisticTileState,
    clearOptimisticTileState,
    applyOptimisticStructureBuild,
    applyOptimisticStructureRemoval,
    applyOptimisticStructureCancel,
    mergeServerTileWithOptimisticState,
    hideTileActionMenu: hideTileActionMenuFromDeps,
    playerNameForOwner,
    ownerSpawnShieldActive,
    hasCollectableYield,
    worldTileRawFromPointer,
    computeDragPreview,
    showCaptureAlert,
    showCollectVisibleCooldownAlert,
    notifyInsufficientGoldForFrontierAction,
    isMobile,
    supportedOwnedTownsForTile,
    supportedOwnedDocksForTile,
    townHasSupportStructure,
    prettyToken,
    terrainLabel,
    displayTownGoldPerMinute,
    tileHistoryLines,
    growthModifierPercentLabel,
    structureGoldCost,
    structureCostText
  } = deps;

  const requireAuthedSession = (
    message = state.authRetrying
      ? "Server is reconnecting. Please wait a moment."
      : "Finish sign-in before interacting with the map."
  ): boolean => {
    if (state.authReady && state.authSessionReady) return true;
    if (!state.authReady && ws.readyState === ws.OPEN && state.authSessionReady) return true;
    if (!state.authReady) {
      setAuthStatus(message, "error");
      syncAuthOverlay();
      return false;
    }
    if (state.authSessionReady) return true;
    setAuthStatus(message, "error");
    syncAuthOverlay();
    return false;
  };

  const rewriteEnvelopeTypes = new Set([
    "ATTACK",
    "EXPAND",
    "SETTLE",
    "CANCEL_CAPTURE",
    "UNCAPTURE_TILE",
    "COLLECT_TILE",
    "COLLECT_VISIBLE",
    "CHOOSE_TECH",
    "CHOOSE_DOMAIN",
    "OVERLOAD_SYNTHESIZER",
    "SET_CONVERTER_STRUCTURE_ENABLED",
    "REVEAL_EMPIRE",
    "REVEAL_EMPIRE_STATS",
    "AETHER_LANCE",
    "CAST_AETHER_BRIDGE",
    "CAST_AETHER_WALL",
    "SIPHON_TILE",
    "PURGE_SIPHON",
    "CREATE_MOUNTAIN",
    "REMOVE_MOUNTAIN",
    "AIRPORT_BOMBARD",
    "COLLECT_SHARD"
  ]);

  const sendGameMessage = (payload: unknown, message?: string): boolean => {
    if (!requireAuthedSession(message)) {
      return false;
    }
    if (
      blockUnsupportedRewriteMessage(payload, {
        state,
        pushFeed,
        showCaptureAlert
      })
    ) {
      return false;
    }
    const maybeRewritePayload =
      payload && typeof payload === "object"
        ? (payload as { type?: unknown; commandId?: unknown; clientSeq?: unknown; disabled?: unknown })
        : undefined;
    if (
      maybeRewritePayload &&
      typeof maybeRewritePayload.type === "string" &&
      rewriteEnvelopeTypes.has(maybeRewritePayload.type) &&
      (typeof maybeRewritePayload.commandId !== "string" || !maybeRewritePayload.commandId || typeof maybeRewritePayload.clientSeq !== "number")
    ) {
      const { commandId, clientSeq } = createNextFrontierCommandIdentity(state);
      maybeRewritePayload.commandId = commandId;
      maybeRewritePayload.clientSeq = clientSeq;
    }
    if (
      typeof window !== "undefined" &&
      (window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1" ||
        window.location.hostname === "0.0.0.0" ||
        window.localStorage.getItem("tile-sync-debug") === "1")
    ) {
      const typedPayload = payload as {
        type?: string;
        x?: number;
        y?: number;
        fromX?: number;
        fromY?: number;
        toX?: number;
        toY?: number;
        commandId?: string;
        clientSeq?: number;
      };
      if (
        typedPayload.type === "SETTLE" ||
        typedPayload.type === "EXPAND" ||
        typedPayload.type === "ATTACK" ||
        typedPayload.type === "REQUEST_TILE_DETAIL"
      ) {
        console.info("[tile-sync] client_send", typedPayload);
      }
    }
    if (maybeRewritePayload?.type === "SET_FOG_DISABLED") {
      recordClientDebugEvent("info", "fog-reveal", "ws-send", {
        disabled: maybeRewritePayload.disabled === true,
        authSessionReady: state.authSessionReady,
        connection: state.connection,
        fogDisabled: state.fogDisabled,
        eligible: state.mapRevealEligible
      });
      console.info("[fog-reveal] ws-send", {
        disabled: maybeRewritePayload.disabled === true,
        authSessionReady: state.authSessionReady,
        connection: state.connection,
        fogDisabled: state.fogDisabled,
        eligible: state.mapRevealEligible
      });
    }
    ws.send(JSON.stringify(payload));
    return true;
  };

  const requestTileDetailIfNeeded = (tile: Tile | undefined, options: TileDetailRequestOptions = {}): void => {
    // Detail-level=full means the gateway already enriched this tile once.
    // Skip unless the most recent payload dropped owner-economy fields (which
    // the partial gate detects), in which case a fresh REQUEST_TILE_DETAIL
    // is the recovery path.
    if (!shouldSendTileDetailRequest(tile, state.me, options)) return;
    if (ws.readyState !== ws.OPEN || !state.authSessionReady) return;
    const tileKey = keyFor(tile.x, tile.y);
    const now = Date.now();
    const lastRequestedAt = state.tileDetailRequestedAt.get(tileKey) ?? 0;
    const lastReceivedAt = state.tileDetailReceivedAt.get(tileKey) ?? 0;
    // Recovery path: when shouldSendTileDetailRequest fired because an owned
    // town is missing economy fields (Production/Support/Upkeep), the prior
    // full-detail response is by definition stale — bypass the 60s freshness
    // gate so the recovery REQUEST_TILE_DETAIL actually reaches the gateway.
    // The in-flight dedupe + 1.5s throttle still suppress runaway re-sends.
    const isOwnedTownRecovery = ownTownEconomyFieldsPartial(tile, state.me);
    if (!options.force) {
      // Skip if a fresh full-detail response landed within the last 60s — town
      // economy fields don't change fast enough to justify another round-trip,
      // and the gateway path is expensive under load. Skipped for the owned-
      // town recovery path above.
      if (!isOwnedTownRecovery && now - lastReceivedAt < 60_000) return;
      // Skip if a request is already in flight (sent but no response yet).
      // 15s cap protects against a dropped response stranding the tile forever.
      if (lastRequestedAt > lastReceivedAt && now - lastRequestedAt < 15_000) return;
      // Fallback throttle preserves the prior 1.5s send-rate ceiling.
      if (now - lastRequestedAt < 1500) return;
    }
    ws.send(JSON.stringify({ type: "REQUEST_TILE_DETAIL", x: tile.x, y: tile.y }));
    state.tileDetailRequestedAt.set(tileKey, now);
  };

  const { sendAllianceRequest, sendTruceRequest, breakAlliance, breakTruce, chooseTech, chooseDomain } =
    createPlayerActionShortcuts({ state, techPickEl, mobileTechPickEl, ws, wsUrl, setAuthStatus, syncAuthOverlay, pushFeed, renderHud, sendGameMessage });
  const activeTruceWithPlayer = (playerId?: string | null): ActiveTruceView | undefined =>
    activeTruceWithPlayerFromState(state, playerId);
  const hasOutgoingPendingTruce = (): boolean => state.outgoingTruceRequests.some((request) => request.expiresAt > Date.now());
  const pendingTruceWithPlayer = (playerId?: string | null): "incoming" | "outgoing" | undefined => {
    if (!playerId) return undefined;
    if (state.outgoingTruceRequests.some((request) => request.toPlayerId === playerId && request.expiresAt > Date.now())) return "outgoing";
    if (state.incomingTruceRequests.some((request) => request.fromPlayerId === playerId && request.expiresAt > Date.now())) return "incoming";
    return undefined;
  };

  const explainActionFailure = (
    code: string,
    message: string,
    opts?: { cooldownRemainingMs?: number; formatCooldownShort?: (ms: number) => string }
  ): string => explainActionFailureFromServer(code, message, opts);

  const enqueueTarget = (x: number, y: number): boolean => enqueueTargetFromModule(state, x, y, keyFor);

  const buildFrontierQueue = (
    candidates: string[],
    enqueue: (x: number, y: number) => boolean
  ): { queued: number; skipped: number; queuedKeys: string[] } =>
    buildFrontierQueueFromModule(state, candidates, { keyFor, parseKey, wrapX, wrapY, enqueue });

  const queueDragSelection = (): { queued: number; skipped: number } =>
    buildFrontierQueue([...state.dragPreviewKeys], (x, y) => enqueueTarget(x, y));

  const applyPendingSettlementsFromServer = (
    entries: Array<{ x: number; y: number; startedAt: number; resolvesAt: number }> | undefined
  ): void =>
    applyPendingSettlementsFromServerFromModule(state, entries, {
      keyFor,
      syncOptimisticSettlementTile,
      clearOptimisticTileState,
      requestViewRefresh
    });

  const queueSpecificTargets = (
    targetKeys: string[]
  ): { queued: number; skipped: number; queuedKeys: string[] } =>
    queueSpecificTargetsFromModule(state, targetKeys, {
      parseKey,
      keyFor,
      isTileOwnedByAlly,
      pickOriginForTarget,
      enqueueTarget,
      buildFrontierQueue
    });

  const attackQueueFailureReason = (tile: Tile): string =>
    attackQueueFailureReasonFromModule(state, tile, { ownerSpawnShieldActive, pickOriginForTarget });

  const dropQueuedTargetKeyIfAbsent = (targetKey: string): void =>
    dropQueuedTargetKeyIfAbsentFromModule(state, targetKey, { keyFor });

  const processPendingMusterAttacks = (): void =>
    processPendingMusterAttacksFromModule(state, { keyFor, pushFeed });

  const reconcileActionQueue = (): void => {
    reconcileActionQueueFromModule(state, { keyFor, pickOriginForTarget, clearOptimisticTileState });
    processPendingMusterAttacks();
  };

  const developmentSlotSummary = (): DevelopmentSlotSummary => developmentSlotSummaryFromModule(state, { busyDevelopmentProcessCount: deps.busyDevelopmentProcessCount });

  const developmentSlotReason = (summary = developmentSlotSummary()): string => developmentSlotReasonFromModule(summary);

  const requestSettlement = (
    x: number,
    y: number,
    opts?: { allowQueueWhenBusy?: boolean; fromQueue?: boolean; suppressWarnings?: boolean; forceQueue?: boolean }
  ): boolean =>
    requestSettlementFromModule(state, x, y, {
      keyFor,
      pushFeed,
      renderHud,
      queueDevelopmentAction,
      developmentSlotSummary,
      developmentSlotReason,
      showCaptureAlert, sendGameMessage,
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
      keyFor,
      queueDevelopmentAction,
      developmentSlotSummary,
      developmentSlotReason,
      pushFeed, showCaptureAlert,
      renderHud,
      sendGameMessage
    });

  const optimisticStructureBuildForAction = (actionId: TileActionDef["id"], tile: Tile, kind: OptimisticStructureKind) => (): void => {
    if (!shouldOptimisticallyBuildOnSelectedTile(actionId, tile)) return;
    applyOptimisticStructureBuild(tile.x, tile.y, kind);
  };

  const processDevelopmentQueue = (): boolean =>
    processDevelopmentQueueFromModule(state, {
      ws,
      authSessionReady: state.authSessionReady,
      developmentSlotSummary,
      requestSettlement: (x, y, opts) => requestSettlement(x, y, opts),
      sendDevelopmentBuild: (payload, optimistic, opts) => sendDevelopmentBuild(payload, optimistic, opts),
      applyOptimisticStructureBuild,
      applyOptimisticStructureRemoval,
      pushFeed,
      renderHud
    });

  const processActionQueue = (): boolean =>
    processActionQueueFromModule(state, {
      ws,
      authSessionReady: state.authSessionReady,
      keyFor,
      isAdjacent,
      isTileOwnedByAlly,
      pickOriginForTarget,
      notifyInsufficientGoldForFrontierAction,
      applyOptimisticTileState,
      pushFeed,
      renderHud,
      sendSetMuster: (x, y, mode) => sendGameMessage({ type: "SET_MUSTER", x, y, mode }),
      sendAttack: (fromX, fromY, toX, toY, commandId, clientSeq) =>
        ws.send(JSON.stringify({ type: "ATTACK", fromX, fromY, toX, toY, commandId, clientSeq }))
    });

  const combatResolutionAlert = (
    msg: Record<string, unknown>,
    context?: { targetTileBefore: Tile | undefined; originTileBefore: Tile | undefined }
  ): { title: string; detail: string; tone: "success" | "warn"; manpowerLoss?: number } =>
    deps.combatResolutionAlert(msg, context);

  const applyCombatOutcomeMessage = (msg: Record<string, unknown>, opts?: { predicted?: boolean }): void => {
    const target = msg.target as { x: number; y: number } | undefined;
    const targetBefore = (() => (target ? state.tiles.get(keyFor(target.x, target.y)) : undefined))();
    const originBefore = (() => {
      const origin = msg.origin as { x: number; y: number } | undefined;
      return origin ? state.tiles.get(keyFor(origin.x, origin.y)) : undefined;
    })();
    const changes =
      (msg.changes as Array<{
        x: number;
        y: number;
        ownerId?: string;
        ownershipState?: "FRONTIER" | "SETTLED" | "BARBARIAN";
        breachShockUntil?: number;
        frontierDecayAt?: number | null;
        frontierDecayKind?: "NATURAL" | "ENCIRCLEMENT" | null;
      }>) ??
      [];
    const resolvedCaptureTargetKey = state.capture ? keyFor(state.capture.target.x, state.capture.target.y) : "";
    for (const c of changes) {
      const tileKey = keyFor(c.x, c.y);
      state.incomingAttacksByTile.delete(tileKey);
      const existing = state.tiles.get(tileKey);
      const incoming: Tile = {
        ...(existing ?? { x: c.x, y: c.y, terrain: terrainAt(c.x, c.y), fogged: false }),
        x: c.x,
        y: c.y,
        fogged: false
      };
      if (c.ownerId) incoming.ownerId = c.ownerId;
      else delete incoming.ownerId;
      if (c.ownershipState) incoming.ownershipState = c.ownershipState;
      else if (!c.ownerId) delete incoming.ownershipState;
      if (typeof c.breachShockUntil === "number") incoming.breachShockUntil = c.breachShockUntil;
      else if ("breachShockUntil" in c && !c.breachShockUntil) delete incoming.breachShockUntil;
      if (typeof c.frontierDecayAt === "number") incoming.frontierDecayAt = c.frontierDecayAt;
      else if ("frontierDecayAt" in c && !c.frontierDecayAt) delete incoming.frontierDecayAt;
      if (c.frontierDecayKind === "NATURAL" || c.frontierDecayKind === "ENCIRCLEMENT") incoming.frontierDecayKind = c.frontierDecayKind;
      else if ("frontierDecayKind" in c && !c.frontierDecayKind) delete incoming.frontierDecayKind;
      const merged = mergeServerTileWithOptimisticState(incoming);
      if (!merged.optimisticPending) clearOptimisticTileState(tileKey);
      state.tiles.set(tileKey, merged);
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
        (resultTargetKey &&
          deps.wasPredictedCombatAlreadyShown(state.revealedPredictedCombatByKey, resultTargetKey, resultAlert.title, resultAlert.detail))
    );
    if (!predictedAlreadyShown) {
      pushFeed(resultAlert.detail, "combat", resultAlert.tone === "success" ? "success" : "warn");
      if (!state.capture?.fromMusterAdvance) showCaptureAlert(resultAlert.title, resultAlert.detail, resultAlert.tone, resultAlert.manpowerLoss);
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
    state.musterTransit = undefined;
    state.activeMusterSource = undefined;
    state.deferredAttack = undefined;
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
    resetAttackPreviewState(state);
    renderHud();
  };

  const requestAttackPreviewForHover = (): void =>
    requestAttackPreviewForHoverFromModule(state, {
      ws,
      authSessionReady: state.authSessionReady,
      keyFor,
      pickOriginForTarget
    });

  const requestAttackPreviewForTarget = (to: Tile): void =>
    requestAttackPreviewForTargetFromModule(state, to, {
      ws,
      authSessionReady: state.authSessionReady,
      keyFor,
      pickOriginForTarget,
      onPreviewTimeout: () => {
        if (!state.tileActionMenu.visible || state.tileActionMenu.mode !== "single") return;
        if (state.tileActionMenu.currentTileKey !== keyFor(to.x, to.y)) return;
        openSingleTileActionMenu(to, state.tileActionMenu.x, state.tileActionMenu.y, { requestAttackPreview: false });
      }
    });

  const attackPreviewDetailForTarget = (to: Tile): string | undefined =>
    attackPreviewDetailForTargetFromModule(state, to, { keyFor, pickOriginForTarget });

  const attackPreviewPendingForTarget = (to: Tile): boolean =>
    attackPreviewPendingForTargetFromModule(state, to, { keyFor, pickOriginForTarget });

  const buildFortOnSelected = (): void => buildFortOnSelectedFromModule(state, { keyFor, pushFeed, showCaptureAlert, renderHud, sendGameMessage });
  const settleSelected = (): void => settleSelectedFromModule(state, { keyFor, pushFeed, showCaptureAlert, renderHud, requestSettlement });
  const buildSiegeOutpostOnSelected = (): void => buildSiegeOutpostOnSelectedFromModule(state, { keyFor, pushFeed, showCaptureAlert, renderHud, sendGameMessage });
  const uncaptureSelected = (): void => uncaptureSelectedFromModule(state, { keyFor, pushFeed, showCaptureAlert, renderHud, sendGameMessage });
  const cancelOngoingCapture = (): void => cancelOngoingCaptureFromModule(state, sendGameMessage);
  const collectVisibleYield = (): void =>
    collectVisibleYieldFromModule(state, {
      formatCooldownShort,
      showCollectVisibleCooldownAlert,
      pushFeed,
      renderHud,
      applyOptimisticVisibleCollect: deps.applyOptimisticVisibleCollect,
      sendGameMessage
    });
  const collectSelectedYield = (): void =>
    collectSelectedYieldFromModule(state, {
      keyFor,
      pushFeed,
      showCaptureAlert,
      renderHud,
      applyOptimisticTileCollect: deps.applyOptimisticTileCollect,
      sendGameMessage
    });
  const collectSelectedShard = (): void =>
    collectSelectedShardFromModule(state, { keyFor, renderHud, sendGameMessage });

  const hideTileActionMenu = (): void => {
    sendGameMessage({ type: "UNWATCH_MUSTER" });
    if (typeof hideTileActionMenuFromDeps === "function") {
      hideTileActionMenuFromDeps();
      return;
    }
    hideTileActionMenuFromModule(state, tileActionMenuEl);
  };

  const tileActionIsCrystal = (id: TileActionDef["id"]): boolean => tileActionIsCrystalFromModule(id);
  const tileActionIsBuilding = (id: TileActionDef["id"]): boolean => tileActionIsBuildingFromModule(id);
  const requiredTechForTileAction = (actionId: TileActionDef["id"]): string | undefined => requiredTechForTileActionFromModule(actionId);
  const hideTechLockedTileAction = (action: TileActionDef): boolean => hideTechLockedTileActionFromModule(action, state);
  const shouldOptimisticallyBuildOnSelectedTile = (actionId: TileActionDef["id"], tile: Tile): boolean =>
    shouldOptimisticallyBuildOnSelectedTileFromModule(actionId, tile);
  const splitTileActionsIntoTabs = (actions: TileActionDef[]): Pick<TileMenuView, "actions" | "buildings" | "crystal"> =>
    splitTileActionsIntoTabsFromModule(actions, state);
  const isTileOwnedByAlly = (tile: Tile): boolean => isTileOwnedByAllyFromModule(tile, state);
  const chebyshevDistanceClient = (ax: number, ay: number, bx: number, by: number): number =>
    chebyshevDistanceClientFromModule(ax, ay, bx, by);
  const hostileObservatoryProtectingTile = (tile: Tile): Tile | undefined => hostileObservatoryProtectingTileFromModule(state, tile);

  const shouldResetFrontierActionStateForError = (errorCode: string): boolean => {
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

  const abilityCooldownRemainingMs = (abilityId: keyof ClientState["abilityCooldowns"]): number => {
    const selectedTile = state.selected ? state.tiles.get(keyFor(state.selected.x, state.selected.y)) : undefined;
    if (selectedTile && (abilityId === "siphon" || abilityId === "create_mountain" || abilityId === "remove_mountain")) {
      return readyOwnedObservatoryCooldownRemainingMs(state.tiles.values(), state.me, selectedTile, Date.now(), ownObservatoryRange(state));
    }
    return Math.max(0, (state.abilityCooldowns[abilityId] ?? 0) - Date.now());
  };

  const formatCooldownShort = (ms: number): string => {
    const totalSeconds = Math.ceil(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  };

  const formatCountdownClock = (ms: number): string => {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  };

  const clearSettlementProgressByKey = (tileKey: string): void =>
    clearSettlementProgressByKeyFromModule(state, tileKey, { clearOptimisticTileState });

  const clearSettlementProgressForTile = (x: number, y: number): void =>
    clearSettlementProgressForTileFromModule(state, x, y, { keyFor, clearSettlementProgressByKey });

  type QueuedDevelopmentAction = ClientState["developmentQueue"][number];

  const queueDevelopmentAction = (entry: QueuedDevelopmentAction): boolean =>
    queueDevelopmentActionFromModule(state, entry, { pushFeed, renderHud });

  const syncOptimisticSettlementTile = (x: number, y: number, awaitingServerConfirm: boolean): void =>
    syncOptimisticSettlementTileFromModule(state, x, y, awaitingServerConfirm, { applyOptimisticTileState });

  const settlementProgressForTile = (x: number, y: number): TileTimedProgress | undefined =>
    settlementProgressForTileFromModule(state, x, y, { keyFor, syncOptimisticSettlementTile, requestViewRefresh });

  const queuedDevelopmentEntryForTile = (tileKey: string): QueuedDevelopmentAction | undefined =>
    queuedDevelopmentEntryForTileFromModule(state, tileKey);

  const queuedSettlementIndexForTile = (tileKey: string): number => queuedSettlementIndexForTileFromModule(state, tileKey);

  const queuedBuildEntryForTile = (tileKey: string) => queuedBuildEntryForTileFromModule(state, tileKey);

  const cancelQueuedSettlement = (tileKey: string): boolean => cancelQueuedSettlementFromModule(state, tileKey, { pushFeed, renderHud });

  const cancelQueuedBuild = (tileKey: string): boolean => cancelQueuedBuildFromModule(state, tileKey, { pushFeed, renderHud });

  const cleanupExpiredSettlementProgress = (): boolean =>
    cleanupExpiredSettlementProgressFromModule(state, { syncOptimisticSettlementTile, clearSettlementProgressByKey, requestViewRefresh });

  const activeSettlementProgressEntries = (): TileTimedProgress[] =>
    activeSettlementProgressEntriesFromModule(state, { cleanupExpiredSettlementProgress });

  const primarySettlementProgress = (): TileTimedProgress | undefined =>
    primarySettlementProgressFromModule(state, { settlementProgressForTile, activeSettlementProgressEntries });

  const constructionCountdownLineForTile = (tile: Tile): string => {
    if (tile.fort?.status === "under_construction" && typeof tile.fort.completesAt === "number") {
      return `Fortifying... ${formatCountdownClock(tile.fort.completesAt - Date.now())}`;
    }
    if (tile.fort?.status === "removing" && typeof tile.fort.completesAt === "number") {
      return `Removing Fort... ${formatCountdownClock(tile.fort.completesAt - Date.now())}`;
    }
    if (tile.observatory?.status === "under_construction" && typeof tile.observatory.completesAt === "number") {
      return `Building Observatory... ${formatCountdownClock(tile.observatory.completesAt - Date.now())}`;
    }
    if (tile.observatory?.status === "removing" && typeof tile.observatory.completesAt === "number") {
      return `Removing Observatory... ${formatCountdownClock(tile.observatory.completesAt - Date.now())}`;
    }
    if (tile.siegeOutpost?.status === "under_construction" && typeof tile.siegeOutpost.completesAt === "number") {
      return `Building Siege Camp... ${formatCountdownClock(tile.siegeOutpost.completesAt - Date.now())}`;
    }
    if (tile.siegeOutpost?.status === "removing" && typeof tile.siegeOutpost.completesAt === "number") {
      return `Removing Siege Outpost... ${formatCountdownClock(tile.siegeOutpost.completesAt - Date.now())}`;
    }
    if (tile.economicStructure?.status === "under_construction" && typeof tile.economicStructure.completesAt === "number") {
      return `Building ${deps.economicStructureName(tile.economicStructure.type)}... ${formatCountdownClock(tile.economicStructure.completesAt - Date.now())}`;
    }
    if (tile.economicStructure?.status === "removing" && typeof tile.economicStructure.completesAt === "number") {
      return `Removing ${deps.economicStructureName(tile.economicStructure.type)}... ${formatCountdownClock(tile.economicStructure.completesAt - Date.now())}`;
    }
    return "";
  };

  const constructionRemainingMsForTile = (tile: Tile): number | undefined => {
    const completesAt =
      tile.fort?.status === "under_construction" || tile.fort?.status === "removing"
        ? tile.fort.completesAt
        : tile.observatory?.status === "under_construction" || tile.observatory?.status === "removing"
          ? tile.observatory.completesAt
          : tile.siegeOutpost?.status === "under_construction" || tile.siegeOutpost?.status === "removing"
            ? tile.siegeOutpost.completesAt
            : tile.economicStructure?.status === "under_construction" || tile.economicStructure?.status === "removing"
              ? tile.economicStructure.completesAt
              : undefined;
    return typeof completesAt === "number" ? Math.max(0, completesAt - Date.now()) : undefined;
  };

  const buildDetailTextForAction = (actionId: string, tile: Tile, supportedTown?: Tile): string | undefined =>
    buildDetailTextForActionFromModule(actionId, tile, supportedTown);

  const tileProductionRequirementLabel = (tile: Tile): string | undefined => tileProductionRequirementLabelFromModule(tile, prettyToken);

  const constructionProgressForTile = (tile: Tile): TileMenuProgressView | undefined =>
    constructionProgressForTileFromModule(tile, formatCountdownClock);

  const queuedSettlementProgressForTile = (tile: Tile): TileMenuProgressView | undefined =>
    queuedSettlementProgressForTileFromModule(tile, {
      keyFor,
      queuedDevelopmentEntryForTile,
      queuedSettlementIndexForTile
    });

  const queuedBuildProgressForTile = (tile: Tile): TileMenuProgressView | undefined =>
    queuedBuildProgressForTileFromModule(tile, {
      keyFor,
      queuedDevelopmentEntryForTile
    });

  // Pure getter used during render; the seed/clear lifecycle below decides
  // when an entry exists, so the menu view itself never mutates state.
  const townPartialLoadingStartedAt = (tileKey: string): number =>
    state.tileTownPartialSince.get(tileKey) ?? Date.now();

  const menuOverviewForTile = (tile: Tile): TileOverviewLine[] => {
    if (tile.ownerId === state.me && tile.ownershipState === "SETTLED" && tile.town) {
      const tileKey = `${tile.x},${tile.y}`;
      if (ownTownEconomyFieldsPartial(tile, state.me)) {
        if (!state.tileTownPartialSince.has(tileKey)) state.tileTownPartialSince.set(tileKey, Date.now());
      } else {
        state.tileTownPartialSince.delete(tileKey);
      }
    }
    return menuOverviewForTileFromModule(tile, {
      state,
      prettyToken,
      terrainLabel,
      displayTownGoldPerMinute,
      populationPerMinuteLabel: deps.populationPerMinuteLabel,
      townNextGrowthEtaLabel: deps.townNextGrowthEtaLabel,
      supportedOwnedTownsForTile,
      connectedDockCountForTile: (dockTile: Tile) =>
        dockTile.dockId
          ? state.dockPairs.filter(
              (pair) =>
                (pair.ax === dockTile.x && pair.ay === dockTile.y) ||
                (pair.bx === dockTile.x && pair.by === dockTile.y)
            ).length
          : 0,
      currentManpower: state.manpower,
      currentManpowerCap: state.manpowerCap,
      hostileObservatoryProtectingTile,
      constructionCountdownLineForTile,
      tileHistoryLines,
      isTileOwnedByAlly,
      townPartialLoadingStartedAt,
      areaEffectModifiersForTile: (targetTile: Tile) => {
        const settledDefenseModifiers =
          targetTile.ownerId === state.me ? settledDefenseNearFortDomainModifiers(state.domainCatalog, state.domainIds) : [];
        if (tileMatchesDebugKey(targetTile.x, targetTile.y, 1, { fallbackTile: state.selected }) && verboseTileDebugEnabled()) {
          debugTileLog("stone-curtain-domain-state", {
            target: {
              x: targetTile.x,
              y: targetTile.y,
              ownerId: targetTile.ownerId,
              ownershipState: targetTile.ownershipState,
              detailLevel: targetTile.detailLevel
            },
            me: state.me,
            domainIds: [...state.domainIds],
            matchingDomains: state.domainCatalog
              .filter((domain) => state.domainIds.includes(domain.id) && typeof domain.effects?.settledDefenseNearFortMult === "number")
              .map((domain) => ({
                id: domain.id,
                name: domain.name,
                settledDefenseNearFortMult: domain.effects?.settledDefenseNearFortMult ?? null
              })),
            settledDefenseModifiers
          });
        }
        return tileAreaEffectModifiersForTileFromModule(targetTile, state.tiles.values(), settledDefenseModifiers);
      }
    });
  };

  const tileMenuViewForTile = (tile: Tile): TileMenuView => {
    const visibleTile = tileWithVisibleShardSite(tile, state.shardRainPingsByTile);
    const menuTile = visibleTile ?? tile;
    requestTileDetailIfNeeded(menuTile);
    const view = tileMenuViewForTileFromModule(menuTile, {
      menuActionsForSingleTile,
      splitTileActionsIntoTabs,
      settlementProgressForTile: (x, y) => {
        const progress = settlementProgressForTile(x, y);
        if (!progress) return undefined;
        return {
          title: "Settlement in progress",
          detail: progress.awaitingServerConfirm
            ? "Settlement timer finished locally. Waiting for server confirmation."
            : "Settling unlocks defense and activates town and resource production.",
          remainingLabel: progress.awaitingServerConfirm ? "Syncing..." : formatCountdownClock(Math.max(0, progress.resolvesAt - Date.now())),
          progress: progress.awaitingServerConfirm
            ? 1
            : Math.max(0, Math.min(1, (Date.now() - progress.startAt) / Math.max(1, progress.resolvesAt - progress.startAt))),
          note: progress.awaitingServerConfirm
            ? "Keeping the tile settled client-side until the server responds."
            : "This tile is actively settling."
        };
      },
      queuedSettlementProgressForTile,
      queuedBuildProgressForTile,
      constructionProgressForTile,
      menuOverviewForTile,
      prettyToken,
      playerNameForOwner,
      terrainLabel,
      isTileOwnedByAlly,
      state
    });
    if (tileMatchesDebugKey(tile.x, tile.y, 1, { fallbackTile: state.selected })) {
      if (verboseTileDebugEnabled()) {
        debugTileLog("tile-menu-view", {
          x: tile.x,
          y: tile.y,
          detailLevel: tile.detailLevel,
          ownerId: tile.ownerId,
          ownershipState: tile.ownershipState,
          resource: tile.resource,
          fort: tile.fort
            ? {
                ownerId: tile.fort.ownerId,
                status: tile.fort.status,
                disabledUntil: tile.fort.disabledUntil ?? null,
                completesAt: tile.fort.completesAt ?? null
              }
            : null,
          economicStructure: tile.economicStructure?.type,
          buildings: view.buildings.map((building) => ({
            id: building.id,
            disabled: building.disabled,
            disabledReason: building.disabledReason
          })),
          overviewLineCount: view.overviewLines.length
        });
      }
    }
    return view;
  };

  const tileActionLogicDeps = () => ({
    keyFor,
    parseKey,
    wrapX,
    wrapY,
    terrainAt,
    chebyshevDistanceClient,
    isTileOwnedByAlly,
    hostileObservatoryProtectingTile,
    abilityCooldownRemainingMs,
    formatCooldownShort,
    pushFeed,
    hideTileActionMenu,
    selectedTile,
    renderHud,
    requireAuthedSession,
    ws,
    attackPreviewDetailForTarget,
    attackPreviewPendingForTarget,
    pickOriginForTarget,
    buildDetailTextForAction,
    developmentSlotSummary,
    developmentSlotReason,
    structureGoldCost,
    structureCostText,
    supportedOwnedTownsForTile,
    supportedOwnedDocksForTile,
    townHasSupportStructure,
    activeTruceWithPlayer,
    pendingTruceWithPlayer,
    ownerSpawnShieldActive,
    connectedOwnedFrontierKeysFor: (tile: Tile) => connectedOwnedFrontierKeys(state, tile, { keyFor, wrapX, wrapY })
  });

  const hasRevealCapability = (): boolean => hasRevealCapabilityFromModule(state);
  const hasAetherBridgeCapability = (): boolean => hasAetherBridgeCapabilityFromModule(state);
  const hasAetherWallCapability = (): boolean => hasAetherWallCapabilityFromModule(state);
  const hasSiphonCapability = (): boolean => hasSiphonCapabilityFromModule(state);
  const hasTerrainShapingCapability = (): boolean => hasTerrainShapingCapabilityFromModule(state);

  const hasOwnedLandWithinClientRange = (x: number, y: number, range: number): boolean =>
    hasOwnedLandWithinClientRangeFromModule(state, x, y, range, tileActionLogicDeps());

  const crystalTargetingTitle = (ability: CrystalTargetingAbility): string => crystalTargetingTitleFromModule(ability);
  const crystalTargetingTone = (ability: CrystalTargetingAbility): "amber" | "cyan" | "red" => crystalTargetingToneFromModule(ability);
  const clearCrystalTargeting = (): void => clearCrystalTargetingFromModule(state);

  const lineStepsBetween = (ax: number, ay: number, bx: number, by: number): Array<{ x: number; y: number }> =>
    lineStepsBetweenFromModule(ax, ay, bx, by, tileActionLogicDeps());

  const computeCrystalTargets = (ability: CrystalTargetingAbility): { validTargets: Set<string>; originByTarget: Map<string, string> } =>
    computeCrystalTargetsFromModule(state, ability, tileActionLogicDeps());

  const beginCrystalTargeting = (ability: CrystalTargetingAbility): void =>
    beginCrystalTargetingFromModule(state, ability, tileActionLogicDeps());

  const executeCrystalTargeting = (tile: Tile): boolean =>
    executeCrystalTargetingFromModule(state, tile, tileActionLogicDeps());

  const tileActionAvailability = (
    enabled: boolean,
    reason: string,
    cost?: string
  ): Pick<TileActionDef, "disabled" | "disabledReason" | "cost"> => tileActionAvailabilityFromModule(enabled, reason, cost);

  const tileActionAvailabilityWithDevelopmentSlot = (
    enabledWithoutSlot: boolean,
    baseReason: string,
    cost?: string,
    summary = developmentSlotSummary()
  ): Pick<TileActionDef, "disabled" | "disabledReason" | "cost"> =>
    tileActionAvailabilityWithDevelopmentSlotFromModule(enabledWithoutSlot, baseReason, cost, summary, tileActionLogicDeps());

  const isOwnedBorderTile = (x: number, y: number): boolean => isOwnedBorderTileFromModule(state, x, y, tileActionLogicDeps());
  const validAetherWallDirectionsForTile = (tile: Tile): Array<ClientState["aetherWallTargeting"]["direction"]> =>
    validAetherWallDirectionsForTileFromModule(state, tile, tileActionLogicDeps());
  const aetherWallDirectionTargetTiles = (
    tile: Tile
  ): Array<{ x: number; y: number; direction: ClientState["aetherWallTargeting"]["direction"]; dx: number; dy: number }> =>
    aetherWallDirectionTargetTilesFromModule(state, tile, tileActionLogicDeps());

  type AetherWallLength = ClientState["aetherWallTargeting"]["length"];

  const preferredAetherWallLength = (
    x: number,
    y: number,
    direction: ClientState["aetherWallTargeting"]["direction"]
  ): AetherWallLength | undefined => {
    const candidateLengths: readonly AetherWallLength[] = [3, 2, 1];
    for (const length of candidateLengths) {
      if (canPlaceAetherWallFromOriginFromModule(state, x, y, direction, length, tileActionLogicDeps())) return length;
    }
    return undefined;
  };

  const menuActionsForSingleTile = (tile: Tile): TileActionDef[] =>
    menuActionsForSingleTileFromModule(state, tile, tileActionLogicDeps());

  const tileActionMenuUiDeps = () => ({
    tileActionMenuEl,
    viewportSize,
    isMobile,
    hideTileActionMenu,
    tileMenuViewForTile,
    handleTileAction,
    cancelQueuedSettlement,
    cancelQueuedBuild,
    sendGameMessage,
    applyOptimisticStructureCancel,
    renderHud,
    requestAttackPreviewForTarget,
    keyFor,
    isTileOwnedByAlly,
    pickOriginForTarget
  });

  const renderTileActionMenu = (view: TileMenuView, clientX: number, clientY: number): void =>
    renderTileActionMenuFromModule(state, view, clientX, clientY, tileActionMenuUiDeps());

  const openSingleTileActionMenu = (tile: Tile, clientX: number, clientY: number, options?: { requestAttackPreview?: boolean }): void => {
    if (tile.muster?.ownerId === state.me) {
      sendGameMessage({ type: "WATCH_MUSTER", x: tile.x, y: tile.y });
    } else {
      sendGameMessage({ type: "UNWATCH_MUSTER" });
    }
    openSingleTileActionMenuFromModule(state, tile, clientX, clientY, tileActionMenuUiDeps(), options);
  };

  const openBulkTileActionMenu = (targetKeys: string[], clientX: number, clientY: number): void =>
    openBulkTileActionMenuFromModule(state, targetKeys, clientX, clientY, tileActionMenuUiDeps());

  const handleTileAction = (actionId: string, _targetKeyOverride?: string, _originKeyOverride?: string): void => {
    const singleTargetKey = state.tileActionMenu.mode === "single" ? state.tileActionMenu.currentTileKey : "";
    const selected = singleTargetKey
      ? state.tiles.get(singleTargetKey)
      : state.selected
        ? state.tiles.get(keyFor(state.selected.x, state.selected.y))
        : undefined;
    const bulkKeys = state.tileActionMenu.mode === "bulk" ? state.tileActionMenu.bulkKeys : [];
    const fromBulk = bulkKeys.length > 0;
    const targets = fromBulk ? bulkKeys : selected ? [keyFor(selected.x, selected.y)] : [];
    if (targets.length === 0) {
      hideTileActionMenu();
      return;
    }

    if (handleWaypointAction({ state, selected, actionId, keyFor, pushFeed, renderHud, hideTileActionMenu, showCaptureAlert, processActionQueue })) return;

    if (actionId === "settle_connected_frontier" && selected) {
      const origSelected = { x: selected.x, y: selected.y };
      const keys = connectedOwnedFrontierKeys(state, selected, { keyFor, wrapX, wrapY });
      let queued = 0;
      let skipped = 0;
      for (const k of keys) {
        const t = state.tiles.get(k);
        if (!t) { skipped += 1; continue; }
        // forceQueue so every tile enters the development queue; the dispatcher
        // then paces them one slot at a time. Sending each directly would fire all
        // N SETTLEs synchronously against a server slot count that hasn't caught up,
        // so the overflow comes back as "development slots are busy".
        if (requestSettlement(t.x, t.y, { forceQueue: true, suppressWarnings: true })) queued += 1; else skipped += 1;
      }
      if (queued > 0) processDevelopmentQueue();
      state.selected = origSelected;
      if (queued <= 0) showCaptureAlert("Settlement blocked", "No settlements queued. Check gold and development slots.", "warn");
      pushFeed(
        queued > 0
          ? `Queued ${queued} settlements across connected frontier${skipped > 0 ? ` (${skipped} skipped)` : ""}.`
          : "No settlements queued — check gold / slots.",
        "combat",
        queued > 0 ? "info" : "warn"
      );
      hideTileActionMenu();
      return;
    }
    if (actionId === "settle_land") {
      if (fromBulk) {
        const neutralTargets = targets.filter((k) => {
          const t = state.tiles.get(k);
          return t && t.terrain === "LAND" && !t.ownerId;
        });
        const out = queueSpecificTargets(neutralTargets);
        if (out.queued > 0) processActionQueue();
        if (out.queued <= 0) showVisibleActionWarning({ pushFeed, showCaptureAlert }, "Frontier claim blocked", "No frontier claims queued. Targets must touch your territory and you need enough gold."); else pushFeed(
          out.queued > 0
            ? `Queued ${out.queued} frontier captures${out.skipped > 0 ? ` (${out.skipped} unreachable)` : ""}.`
            : "No frontier claims queued. Targets must touch your territory and you need enough gold.",
          "combat",
          out.queued > 0 ? "info" : "warn"
        );
      } else if (selected) {
        const k = keyFor(selected.x, selected.y);
        if (!selected.ownerId) {
          const out = queueSpecificTargets([k]);
          if (out.queued > 0) {
            processActionQueue();
            pushFeed(`Queued frontier capture at (${selected.x}, ${selected.y}).`, "combat", "info");
          } else {
            showVisibleActionWarning({ pushFeed, showCaptureAlert }, "Frontier claim blocked", "Cannot claim this tile yet. It must touch your territory and you need enough gold.");
          }
        } else if (selected.ownerId === state.me && selected.ownershipState === "FRONTIER") {
          requestSettlement(selected.x, selected.y);
        }
        state.autoSettleTargets.delete(k);
      }
      hideTileActionMenu();
      return;
    }
    if (actionId === "launch_attack") {
      const enemyTargets = targets.filter((k) => {
        const t = state.tiles.get(k);
        return t && t.terrain === "LAND" && t.ownerId && t.ownerId !== state.me && !isTileOwnedByAlly(t);
      });
      const out = queueSpecificTargets(enemyTargets);
      if (out.queued > 0) processActionQueue();
      if (out.queued > 0) {
        pushFeed(`Queued ${out.queued} attacks${out.skipped > 0 ? ` (${out.skipped} unreachable)` : ""}.`, "combat", "warn");
      } else {
        const singleTile = !fromBulk && selected ? selected : undefined;
        const failureMessage = singleTile
          ? attackQueueFailureReason(singleTile)
          : "Cannot launch attack for one or more selected tiles.";
        showCaptureAlert("Attack failed", failureMessage, "warn");
        pushFeed(failureMessage, "combat", "error");
      }
      hideTileActionMenu();
      return;
    }
    if (actionId === "attack_connected_region") {
      const connectedTargets = !fromBulk && selected
        ? connectedEnemyRegionKeys(state, selected, { keyFor, wrapX, wrapY }).filter((k) => {
            const t = state.tiles.get(k);
            return t && t.terrain === "LAND" && t.ownerId && t.ownerId !== state.me && !isTileOwnedByAlly(t);
          })
        : [];
      const out = queueSpecificTargets(connectedTargets);
      if (out.queued > 0) processActionQueue();
      if (out.queued > 0) {
        pushFeed(
          `Queued ${out.queued} attacks across the connected region${out.skipped > 0 ? ` (${out.skipped} unreachable)` : ""}.`,
          "combat",
          "warn"
        );
      } else {
        const failureMessage = selected
          ? attackQueueFailureReason(selected)
          : "Cannot attack this connected region right now.";
        showCaptureAlert("Connected region attack failed", failureMessage, "warn");
        pushFeed(failureMessage, "combat", "error");
      }
      hideTileActionMenu();
      return;
    }
    if (actionId === "collect_yield" && fromBulk) {
      let n = 0;
      for (const k of targets) {
        const t = state.tiles.get(k);
        if (!t || t.ownerId !== state.me) continue;
        sendGameMessage({ type: "COLLECT_TILE", x: t.x, y: t.y });
        n += 1;
      }
      pushFeed(`Collecting from ${n} selected tiles.`, "info", "info");
      hideTileActionMenu();
      return;
    }
    if (!selected) {
      hideTileActionMenu();
      return;
    }
    const fortVariantLabel =
      selected.fort?.variant === "FORT"
        ? state.techIds.includes("fortified-walls")
          ? "Iron Bastion"
          : "Fort"
        : selected.fort?.variant === "IRON_BASTION"
        ? state.techIds.includes("steelworking")
          ? "Thunder Bastion"
          : "Iron Bastion"
        : selected.fort?.variant === "THUNDER_BASTION"
          ? "Thunder Bastion"
          : state.techIds.includes("steelworking")
            ? "Thunder Bastion"
            : state.techIds.includes("fortified-walls")
              ? "Iron Bastion"
              : "Fort";
    const siegeVariantLabel =
      selected.siegeOutpost?.variant === "SIEGE_OUTPOST"
        ? state.techIds.includes("siegecraft")
          ? "Siege Tower"
          : "Siege Outpost"
        : selected.siegeOutpost?.variant === "SIEGE_TOWER"
        ? state.techIds.includes("standing-army")
          ? "Dread Tower"
          : "Siege Tower"
        : selected.siegeOutpost?.variant === "DREAD_TOWER"
          ? "Dread Tower"
          : state.techIds.includes("standing-army")
            ? "Dread Tower"
            : state.techIds.includes("siegecraft")
              ? "Siege Tower"
              : "Siege Outpost";
    if (actionId === "collect_yield") collectSelectedYield();
    if (actionId === "collect_shard") collectSelectedShard();
    if (actionId === "grow_town_to_city" || actionId === "grow_city_to_great_city" || actionId === "grow_great_city_to_monumental_city") sendGameMessage({ type: "UPGRADE_TOWN_TIER", x: selected.x, y: selected.y });
    if (actionId === "build_fortification")
      sendDevelopmentBuild({ type: "BUILD_STRUCTURE", x: selected.x, y: selected.y, structureType: "FORT" }, () => applyOptimisticStructureBuild(selected.x, selected.y, "FORT"), {
        x: selected.x,
        y: selected.y,
        label: `${fortVariantLabel} at (${selected.x}, ${selected.y})`,
        optimisticKind: "FORT"
      });
    if (actionId === "build_wooden_fort")
      sendDevelopmentBuild(
        { type: "BUILD_STRUCTURE", x: selected.x, y: selected.y, structureType: "WOODEN_FORT" },
        () => applyOptimisticStructureBuild(selected.x, selected.y, "WOODEN_FORT"),
        { x: selected.x, y: selected.y, label: `Wooden Fort at (${selected.x}, ${selected.y})`, optimisticKind: "WOODEN_FORT" }
      );
    if (actionId === "build_observatory")
      sendDevelopmentBuild({ type: "BUILD_STRUCTURE", x: selected.x, y: selected.y, structureType: "OBSERVATORY" }, () => applyOptimisticStructureBuild(selected.x, selected.y, "OBSERVATORY"), {
        x: selected.x,
        y: selected.y,
        label: `Observatory at (${selected.x}, ${selected.y})`,
        optimisticKind: "OBSERVATORY"
      });
    if (actionId === "build_farmstead")
      sendDevelopmentBuild(
        { type: "BUILD_STRUCTURE", x: selected.x, y: selected.y, structureType: "FARMSTEAD" },
        () => applyOptimisticStructureBuild(selected.x, selected.y, "FARMSTEAD"),
        { x: selected.x, y: selected.y, label: `Farmstead at (${selected.x}, ${selected.y})`, optimisticKind: "FARMSTEAD" }
      );
    if (actionId === "build_waterworks") {
      state.buildingPlacement = { active: true, structureType: "WATERWORKS", x: selected.x, y: selected.y };
      hideTileActionMenu();
      renderPlacementOverlay();
      renderHud();
      return;
    }
    if (actionId === "build_camp")
      sendDevelopmentBuild({ type: "BUILD_STRUCTURE", x: selected.x, y: selected.y, structureType: "CAMP" }, () => applyOptimisticStructureBuild(selected.x, selected.y, "CAMP"), {
        x: selected.x,
        y: selected.y,
        label: `Camp at (${selected.x}, ${selected.y})`,
        optimisticKind: "CAMP"
      });
    if (actionId === "build_mine")
      sendDevelopmentBuild({ type: "BUILD_STRUCTURE", x: selected.x, y: selected.y, structureType: "MINE" }, () => applyOptimisticStructureBuild(selected.x, selected.y, "MINE"), {
        x: selected.x,
        y: selected.y,
        label: `Mine at (${selected.x}, ${selected.y})`,
        optimisticKind: "MINE"
      });
    if (actionId === "build_market")
      sendDevelopmentBuild({ type: "BUILD_STRUCTURE", x: selected.x, y: selected.y, structureType: "MARKET" }, optimisticStructureBuildForAction(actionId, selected, "MARKET"), {
        x: selected.x,
        y: selected.y,
        label: `Market at (${selected.x}, ${selected.y})`,
        optimisticKind: "MARKET"
      });
    if (actionId === "build_granary")
      sendDevelopmentBuild({ type: "BUILD_STRUCTURE", x: selected.x, y: selected.y, structureType: "GRANARY" }, optimisticStructureBuildForAction(actionId, selected, "GRANARY"), {
        x: selected.x,
        y: selected.y,
        label: `Granary at (${selected.x}, ${selected.y})`,
        optimisticKind: "GRANARY"
      });
    if (actionId === "build_census_hall")
      sendDevelopmentBuild({ type: "BUILD_STRUCTURE", x: selected.x, y: selected.y, structureType: "CENSUS_HALL" }, optimisticStructureBuildForAction(actionId, selected, "CENSUS_HALL"), {
        x: selected.x,
        y: selected.y,
        label: `Census Hall at (${selected.x}, ${selected.y})`,
        optimisticKind: "CENSUS_HALL"
      });
    if (actionId === "build_bank")
      sendDevelopmentBuild({ type: "BUILD_STRUCTURE", x: selected.x, y: selected.y, structureType: "BANK" }, optimisticStructureBuildForAction(actionId, selected, "BANK"), {
        x: selected.x,
        y: selected.y,
        label: `Bank at (${selected.x}, ${selected.y})`,
        optimisticKind: "BANK"
      });
    if (actionId === "build_clearing_house")
      sendDevelopmentBuild({ type: "BUILD_STRUCTURE", x: selected.x, y: selected.y, structureType: "CLEARING_HOUSE" }, optimisticStructureBuildForAction(actionId, selected, "CLEARING_HOUSE"), {
        x: selected.x,
        y: selected.y,
        label: `Clearing House at (${selected.x}, ${selected.y})`,
        optimisticKind: "CLEARING_HOUSE"
      });
    if (actionId === "build_airport")
      sendDevelopmentBuild({ type: "BUILD_STRUCTURE", x: selected.x, y: selected.y, structureType: "AIRPORT" }, () => applyOptimisticStructureBuild(selected.x, selected.y, "AIRPORT"), {
        x: selected.x,
        y: selected.y,
        label: `Airport at (${selected.x}, ${selected.y})`,
        optimisticKind: "AIRPORT"
      });
    if (actionId === "build_aether_tower")
      sendDevelopmentBuild({ type: "BUILD_STRUCTURE", x: selected.x, y: selected.y, structureType: "AETHER_TOWER" }, () => applyOptimisticStructureBuild(selected.x, selected.y, "AETHER_TOWER"), {
        x: selected.x,
        y: selected.y,
        label: `Aether Tower at (${selected.x}, ${selected.y})`,
        optimisticKind: "AETHER_TOWER"
      });
    if (actionId === "build_caravanary")
      sendDevelopmentBuild({ type: "BUILD_STRUCTURE", x: selected.x, y: selected.y, structureType: "CARAVANARY" }, optimisticStructureBuildForAction(actionId, selected, "CARAVANARY"), {
        x: selected.x,
        y: selected.y,
        label: `Caravanary at (${selected.x}, ${selected.y})`,
        optimisticKind: "CARAVANARY"
      });
    if (actionId === "build_fur_synthesizer")
      sendDevelopmentBuild({ type: "BUILD_STRUCTURE", x: selected.x, y: selected.y, structureType: "FUR_SYNTHESIZER" }, optimisticStructureBuildForAction(actionId, selected, "FUR_SYNTHESIZER"), {
        x: selected.x,
        y: selected.y,
        label: `Fur Synthesizer at (${selected.x}, ${selected.y})`,
        optimisticKind: "FUR_SYNTHESIZER"
      });
    if (actionId === "upgrade_fur_synthesizer")
      sendDevelopmentBuild(
        { type: "BUILD_STRUCTURE", x: selected.x, y: selected.y, structureType: "ADVANCED_FUR_SYNTHESIZER" },
        optimisticStructureBuildForAction(actionId, selected, "ADVANCED_FUR_SYNTHESIZER"),
        { x: selected.x, y: selected.y, label: `Advanced Fur Synthesizer at (${selected.x}, ${selected.y})`, optimisticKind: "ADVANCED_FUR_SYNTHESIZER" }
      );
    if (actionId === "build_ironworks")
      sendDevelopmentBuild({ type: "BUILD_STRUCTURE", x: selected.x, y: selected.y, structureType: "IRONWORKS" }, optimisticStructureBuildForAction(actionId, selected, "IRONWORKS"), {
        x: selected.x,
        y: selected.y,
        label: `Ironworks at (${selected.x}, ${selected.y})`,
        optimisticKind: "IRONWORKS"
      });
    if (actionId === "upgrade_ironworks")
      sendDevelopmentBuild(
        { type: "BUILD_STRUCTURE", x: selected.x, y: selected.y, structureType: "ADVANCED_IRONWORKS" },
        optimisticStructureBuildForAction(actionId, selected, "ADVANCED_IRONWORKS"),
        { x: selected.x, y: selected.y, label: `Advanced Ironworks at (${selected.x}, ${selected.y})`, optimisticKind: "ADVANCED_IRONWORKS" }
      );
    if (actionId === "build_crystal_synthesizer")
      sendDevelopmentBuild(
        { type: "BUILD_STRUCTURE", x: selected.x, y: selected.y, structureType: "CRYSTAL_SYNTHESIZER" },
        optimisticStructureBuildForAction(actionId, selected, "CRYSTAL_SYNTHESIZER"),
        { x: selected.x, y: selected.y, label: `Aether Condenser at (${selected.x}, ${selected.y})`, optimisticKind: "CRYSTAL_SYNTHESIZER" }
      );
    if (actionId === "upgrade_crystal_synthesizer")
      sendDevelopmentBuild(
        { type: "BUILD_STRUCTURE", x: selected.x, y: selected.y, structureType: "ADVANCED_CRYSTAL_SYNTHESIZER" },
        optimisticStructureBuildForAction(actionId, selected, "ADVANCED_CRYSTAL_SYNTHESIZER"),
        { x: selected.x, y: selected.y, label: `Advanced Aether Condenser at (${selected.x}, ${selected.y})`, optimisticKind: "ADVANCED_CRYSTAL_SYNTHESIZER" }
      );
    if (actionId === "build_foundry") {
      state.buildingPlacement = { active: true, structureType: "FOUNDRY", x: selected.x, y: selected.y };
      hideTileActionMenu();
      renderPlacementOverlay();
      renderHud();
      return;
    }
    if (actionId === "build_garrison_hall")
      sendDevelopmentBuild({ type: "BUILD_STRUCTURE", x: selected.x, y: selected.y, structureType: "GARRISON_HALL" }, () => applyOptimisticStructureBuild(selected.x, selected.y, "GARRISON_HALL"), {
        x: selected.x,
        y: selected.y,
        label: `Garrison Hall at (${selected.x}, ${selected.y})`,
        optimisticKind: "GARRISON_HALL"
      });
    if (actionId === "build_customs_house")
      sendDevelopmentBuild({ type: "BUILD_STRUCTURE", x: selected.x, y: selected.y, structureType: "CUSTOMS_HOUSE" }, () => applyOptimisticStructureBuild(selected.x, selected.y, "CUSTOMS_HOUSE"), {
        x: selected.x,
        y: selected.y,
        label: `Harbor Exchange at (${selected.x}, ${selected.y})`,
        optimisticKind: "CUSTOMS_HOUSE"
      });
    if (actionId === "build_rail_depot")
      sendDevelopmentBuild({ type: "BUILD_STRUCTURE", x: selected.x, y: selected.y, structureType: "RAIL_DEPOT" }, optimisticStructureBuildForAction(actionId, selected, "RAIL_DEPOT"), {
        x: selected.x,
        y: selected.y,
        label: `Rail Depot at (${selected.x}, ${selected.y})`,
        optimisticKind: "RAIL_DEPOT"
      });
    if (actionId === "build_exchange_house")
      sendDevelopmentBuild({ type: "BUILD_STRUCTURE", x: selected.x, y: selected.y, structureType: "EXCHANGE_HOUSE" }, optimisticStructureBuildForAction(actionId, selected, "EXCHANGE_HOUSE"), {
        x: selected.x,
        y: selected.y,
        label: `Exchange House at (${selected.x}, ${selected.y})`,
        optimisticKind: "EXCHANGE_HOUSE"
      });
    if (actionId === "build_imperial_exchange_part")
      sendDevelopmentBuild({ type: "BUILD_STRUCTURE", x: selected.x, y: selected.y, structureType: "IMPERIAL_EXCHANGE_PART" }, optimisticStructureBuildForAction(actionId, selected, "IMPERIAL_EXCHANGE_PART"), {
        x: selected.x,
        y: selected.y,
        label: `Imperial Exchange Part at (${selected.x}, ${selected.y})`,
        optimisticKind: "IMPERIAL_EXCHANGE_PART"
      });
    if (actionId === "build_world_engine_part")
      sendDevelopmentBuild({ type: "BUILD_STRUCTURE", x: selected.x, y: selected.y, structureType: "WORLD_ENGINE_PART" }, optimisticStructureBuildForAction(actionId, selected, "WORLD_ENGINE_PART"), {
        x: selected.x,
        y: selected.y,
        label: `Worldbreaker Cannon Part at (${selected.x}, ${selected.y})`,
        optimisticKind: "WORLD_ENGINE_PART"
      });
    if (actionId === "build_aegis_dome_part")
      sendDevelopmentBuild({ type: "BUILD_STRUCTURE", x: selected.x, y: selected.y, structureType: "AEGIS_DOME_PART" }, optimisticStructureBuildForAction(actionId, selected, "AEGIS_DOME_PART"), {
        x: selected.x,
        y: selected.y,
        label: `Aegis Dome Part at (${selected.x}, ${selected.y})`,
        optimisticKind: "AEGIS_DOME_PART"
      });
    if (actionId === "build_astral_dock_part")
      sendDevelopmentBuild({ type: "BUILD_STRUCTURE", x: selected.x, y: selected.y, structureType: "ASTRAL_DOCK_PART" }, optimisticStructureBuildForAction(actionId, selected, "ASTRAL_DOCK_PART"), {
        x: selected.x,
        y: selected.y,
        label: `Astral Dock Part at (${selected.x}, ${selected.y})`,
        optimisticKind: "ASTRAL_DOCK_PART"
      });
    if (actionId === "build_imperial_exchange")
      sendDevelopmentBuild({ type: "BUILD_STRUCTURE", x: selected.x, y: selected.y, structureType: "IMPERIAL_EXCHANGE" }, () => applyOptimisticStructureBuild(selected.x, selected.y, "IMPERIAL_EXCHANGE"), {
        x: selected.x,
        y: selected.y,
        label: `Imperial Exchange at (${selected.x}, ${selected.y})`,
        optimisticKind: "IMPERIAL_EXCHANGE"
      });
    if (actionId === "build_world_engine")
      sendDevelopmentBuild({ type: "BUILD_STRUCTURE", x: selected.x, y: selected.y, structureType: "WORLD_ENGINE" }, () => applyOptimisticStructureBuild(selected.x, selected.y, "WORLD_ENGINE"), {
        x: selected.x,
        y: selected.y,
        label: `Worldbreaker Cannon at (${selected.x}, ${selected.y})`,
        optimisticKind: "WORLD_ENGINE"
      });
    if (actionId === "build_aegis_dome")
      sendDevelopmentBuild({ type: "BUILD_STRUCTURE", x: selected.x, y: selected.y, structureType: "AEGIS_DOME" }, () => applyOptimisticStructureBuild(selected.x, selected.y, "AEGIS_DOME"), {
        x: selected.x,
        y: selected.y,
        label: `Aegis Dome at (${selected.x}, ${selected.y})`,
        optimisticKind: "AEGIS_DOME"
      });
    if (actionId === "build_astral_dock")
      sendDevelopmentBuild({ type: "BUILD_STRUCTURE", x: selected.x, y: selected.y, structureType: "ASTRAL_DOCK" }, () => applyOptimisticStructureBuild(selected.x, selected.y, "ASTRAL_DOCK"), {
        x: selected.x,
        y: selected.y,
        label: `Astral Dock at (${selected.x}, ${selected.y})`,
        optimisticKind: "ASTRAL_DOCK"
      });
    if (actionId === "build_governors_office")
      sendDevelopmentBuild(
        { type: "BUILD_STRUCTURE", x: selected.x, y: selected.y, structureType: "GOVERNORS_OFFICE" },
        () => applyOptimisticStructureBuild(selected.x, selected.y, "GOVERNORS_OFFICE"),
        { x: selected.x, y: selected.y, label: `Ministry Hall at (${selected.x}, ${selected.y})`, optimisticKind: "GOVERNORS_OFFICE" }
      );
    if (actionId === "build_radar_system")
      sendDevelopmentBuild({ type: "BUILD_STRUCTURE", x: selected.x, y: selected.y, structureType: "RADAR_SYSTEM" }, () => applyOptimisticStructureBuild(selected.x, selected.y, "RADAR_SYSTEM"), {
        x: selected.x,
        y: selected.y,
        label: `Radar System at (${selected.x}, ${selected.y})`,
        optimisticKind: "RADAR_SYSTEM"
      });
    if (actionId === "build_siege_camp")
      sendDevelopmentBuild({ type: "BUILD_STRUCTURE", x: selected.x, y: selected.y, structureType: "SIEGE_OUTPOST" }, () => applyOptimisticStructureBuild(selected.x, selected.y, "SIEGE_OUTPOST"), {
        x: selected.x,
        y: selected.y,
        label: `${siegeVariantLabel} at (${selected.x}, ${selected.y})`,
        optimisticKind: "SIEGE_OUTPOST"
      });
    if (actionId === "build_light_outpost")
      sendDevelopmentBuild(
        { type: "BUILD_STRUCTURE", x: selected.x, y: selected.y, structureType: "LIGHT_OUTPOST" },
        () => applyOptimisticStructureBuild(selected.x, selected.y, "LIGHT_OUTPOST"),
        { x: selected.x, y: selected.y, label: `Light Outpost at (${selected.x}, ${selected.y})`, optimisticKind: "LIGHT_OUTPOST" }
      );
    if (actionId === "remove_structure") {
      const optimisticKind =
        selected.fort
          ? "FORT"
          : selected.observatory
            ? "OBSERVATORY"
            : selected.siegeOutpost
              ? "SIEGE_OUTPOST"
              : selected.economicStructure?.type;
      const structureLabel =
        selected.fort
          ? "Fort"
          : selected.observatory
            ? "Observatory"
            : selected.siegeOutpost
              ? "Siege Outpost"
              : selected.economicStructure
                ? deps.economicStructureName(selected.economicStructure.type)
                : undefined;
      if (optimisticKind && structureLabel) {
        sendDevelopmentBuild({ type: "REMOVE_STRUCTURE", x: selected.x, y: selected.y }, () => applyOptimisticStructureRemoval(selected.x, selected.y), {
          x: selected.x,
          y: selected.y,
          label: `Remove ${structureLabel} at (${selected.x}, ${selected.y})`,
          optimisticKind
        });
      }
    }
    if (actionId === "overload_fur_synthesizer") sendGameMessage({ type: "OVERLOAD_SYNTHESIZER", x: selected.x, y: selected.y });
    if (actionId === "overload_ironworks") sendGameMessage({ type: "OVERLOAD_SYNTHESIZER", x: selected.x, y: selected.y });
    if (actionId === "overload_crystal_synthesizer") sendGameMessage({ type: "OVERLOAD_SYNTHESIZER", x: selected.x, y: selected.y });
    if (actionId === "enable_converter_structure") sendGameMessage({ type: "SET_CONVERTER_STRUCTURE_ENABLED", x: selected.x, y: selected.y, enabled: true });
    if (actionId === "disable_converter_structure") sendGameMessage({ type: "SET_CONVERTER_STRUCTURE_ENABLED", x: selected.x, y: selected.y, enabled: false });
    if (actionId === "muster_hold") sendGameMessage({ type: "SET_MUSTER", x: selected.x, y: selected.y, mode: "HOLD" });
    if (actionId === "muster_advance") sendGameMessage({ type: "SET_MUSTER", x: selected.x, y: selected.y, mode: "ADVANCE" });
    if (actionId === "muster_clear") sendGameMessage({ type: "CLEAR_MUSTER", x: selected.x, y: selected.y });
    if (actionId === "create_mountain") sendGameMessage({ type: "CREATE_MOUNTAIN", x: selected.x, y: selected.y });
    if (actionId === "remove_mountain") sendGameMessage({ type: "REMOVE_MOUNTAIN", x: selected.x, y: selected.y });
    if (actionId === "abandon_territory") sendGameMessage({ type: "UNCAPTURE_TILE", x: selected.x, y: selected.y });
    if (actionId === "offer_truce_12h" && selected.ownerId && selected.ownerId !== state.me && !selected.ownerId.startsWith("barbarian")) {
      const pendingTruce = pendingTruceWithPlayer(selected.ownerId);
      if (pendingTruce || hasOutgoingPendingTruce()) {
        pushFeed(
          pendingTruce === "incoming"
            ? "That empire already sent you a truce offer."
            : "You already have a pending truce offer.",
          "alliance",
          "warn"
        );
        return;
      }
      const targetName = playerNameForOwner(selected.ownerId);
      if (targetName) sendTruceRequest(targetName, 12);
    }
    if (actionId === "offer_truce_24h" && selected.ownerId && selected.ownerId !== state.me && !selected.ownerId.startsWith("barbarian")) {
      const pendingTruce = pendingTruceWithPlayer(selected.ownerId);
      if (pendingTruce || hasOutgoingPendingTruce()) {
        pushFeed(
          pendingTruce === "incoming"
            ? "That empire already sent you a truce offer."
            : "You already have a pending truce offer.",
          "alliance",
          "warn"
        );
        return;
      }
      const targetName = playerNameForOwner(selected.ownerId);
      if (targetName) sendTruceRequest(targetName, 24);
    }
    if (actionId === "break_truce" && selected.ownerId && selected.ownerId !== state.me && !selected.ownerId.startsWith("barbarian")) {
      breakTruce(selected.ownerId);
    }
    if (actionId === "reveal_empire" && selected.ownerId && selected.ownerId !== state.me && selected.ownerId !== "barbarian") {
      if (sendGameMessage({ type: "REVEAL_EMPIRE", targetPlayerId: selected.ownerId })) {
        state.revealEmpireFxQueue.push({ x: selected.x, y: selected.y, queuedAt: Date.now() });
      }
    }
    if (actionId === "survey_sweep") {
      if (sendGameMessage({ type: "SURVEY_SWEEP", x: selected.x, y: selected.y })) {
        state.surveySweepFxQueue.push({ x: selected.x, y: selected.y, queuedAt: Date.now() });
      }
    }
    if (actionId === "aether_lance") {
      if (sendGameMessage({ type: "AETHER_LANCE", x: selected.x, y: selected.y })) {
        state.aetherLanceFxQueue.push({ x: selected.x, y: selected.y, queuedAt: Date.now() });
      }
    }
    const retortTargetResource =
      actionId === "retort_recast_food"
        ? "FARM"
        : actionId === "retort_recast_supply"
          ? "WOOD"
          : actionId === "retort_recast_iron"
            ? "IRON"
            : actionId === "retort_recast_crystal"
              ? "GEMS"
              : undefined;
    if (retortTargetResource) {
      if (sendGameMessage({ type: "RETORT_RECAST", x: selected.x, y: selected.y, targetResource: retortTargetResource })) {
        state.retortRecastFxQueue.push({ x: selected.x, y: selected.y, targetResource: retortTargetResource, queuedAt: Date.now() });
      }
    }
    if (actionId === "reveal_empire_stats" && selected.ownerId && selected.ownerId !== state.me && selected.ownerId !== "barbarian") {
      if (sendGameMessage({ type: "REVEAL_EMPIRE_STATS", targetPlayerId: selected.ownerId })) {
        state.revealEmpireStatsFxQueue.push({ x: selected.x, y: selected.y, queuedAt: Date.now() });
      }
    }
    if (actionId === "aether_wall") {
      const selectedDirections = validAetherWallDirectionsForTile(selected);
      if (selectedDirections.length === 1) {
        const direction = selectedDirections[0]!;
        const length = preferredAetherWallLength(selected.x, selected.y, direction);
        if (length !== undefined) sendGameMessage({ type: "CAST_AETHER_WALL", x: selected.x, y: selected.y, direction, length });
        else pushFeed("Aether Wall cannot extend from that selected tile.", "combat", "warn");
      } else if (selectedDirections.length > 1) {
        beginCrystalTargeting("aether_wall");
      } else {
        pushFeed("Select one of your settled border tiles before casting Aether Wall.", "combat", "warn");
      }
    }
    if (actionId === "aether_bridge") beginCrystalTargeting("aether_bridge");
    if (actionId === "aether_emp") beginCrystalTargeting("aether_emp");
    if (actionId === "imperial_exchange_levy_food") {
      if (sendGameMessage({ type: "IMPERIAL_EXCHANGE_LEVY", fromX: selected.x, fromY: selected.y, resource: "FOOD" })) {
        state.imperialExchangeLevyFxQueue.push({ x: selected.x, y: selected.y, queuedAt: Date.now() });
      }
    }
    if (actionId === "imperial_exchange_levy_iron") {
      if (sendGameMessage({ type: "IMPERIAL_EXCHANGE_LEVY", fromX: selected.x, fromY: selected.y, resource: "IRON" })) {
        state.imperialExchangeLevyFxQueue.push({ x: selected.x, y: selected.y, queuedAt: Date.now() });
      }
    }
    if (actionId === "imperial_exchange_levy_crystal") {
      if (sendGameMessage({ type: "IMPERIAL_EXCHANGE_LEVY", fromX: selected.x, fromY: selected.y, resource: "CRYSTAL" })) {
        state.imperialExchangeLevyFxQueue.push({ x: selected.x, y: selected.y, queuedAt: Date.now() });
      }
    }
    if (actionId === "imperial_exchange_levy_supply") {
      if (sendGameMessage({ type: "IMPERIAL_EXCHANGE_LEVY", fromX: selected.x, fromY: selected.y, resource: "SUPPLY" })) {
        state.imperialExchangeLevyFxQueue.push({ x: selected.x, y: selected.y, queuedAt: Date.now() });
      }
    }
    if (actionId === "aegis_lock") {
      if (sendGameMessage({ type: "AEGIS_LOCK", fromX: selected.x, fromY: selected.y })) {
        state.aegisLockFxQueue.push({ x: selected.x, y: selected.y, queuedAt: Date.now() });
      }
    }
    if (actionId === "city_overclock") sendGameMessage({ type: "CITY_OVERCLOCK", x: selected.x, y: selected.y });
    if (actionId === "astral_dock_launch") {
      if (sendGameMessage({ type: "ASTRAL_DOCK_LAUNCH", fromX: selected.x, fromY: selected.y })) {
        state.astralDockLaunchFxQueue.push({ x: selected.x, y: selected.y, queuedAt: Date.now() });
      }
    }
    if (actionId === "siphon_tile") beginCrystalTargeting("siphon");
    if (actionId === "world_engine_strike") beginCrystalTargeting("world_engine_strike");
    if (actionId === "airport_bombard") beginCrystalTargeting("airport_bombard");
    hideTileActionMenu();
  };

  const { isPlacementValidForTile, cancelBuildingPlacement, confirmBuildingPlacement, renderPlacementOverlay, removePlacementOverlay } =
    createBuildingPlacementFlow(state, {
      keyFor, pushFeed, renderHud, sendDevelopmentBuild, applyOptimisticStructureBuild,
      placementOverlayEl: deps.placementOverlayEl,
      placementLabelEl: deps.placementLabelEl
    });

  const mapInteractionFlags = {
    suppressNextClick: false
  };

  const handleTileSelection = (wx: number, wy: number, clientX: number, clientY: number): void => {
    if (mapInteractionFlags.suppressNextClick) {
      mapInteractionFlags.suppressNextClick = false;
      return;
    }
    hideTileActionMenu();

    const clicked = state.tiles.get(keyFor(wx, wy));
    const vis = deps.tileVisibilityStateAt(wx, wy, clicked);
    if (state.aetherWallTargeting.active) {
      const selectedOrigin = state.selected ? state.tiles.get(keyFor(state.selected.x, state.selected.y)) : undefined;
      if (selectedOrigin) {
        const clickedDirection = aetherWallDirectionTargetTiles(selectedOrigin).find((target) => target.x === wx && target.y === wy);
        if (clickedDirection) {
          const length = preferredAetherWallLength(selectedOrigin.x, selectedOrigin.y, clickedDirection.direction);
          if (length !== undefined) {
            state.aetherWallTargeting.direction = clickedDirection.direction;
            state.aetherWallTargeting.length = length;
            sendGameMessage({
              type: "CAST_AETHER_WALL",
              x: selectedOrigin.x,
              y: selectedOrigin.y,
              direction: clickedDirection.direction,
              length
            });
            clearCrystalTargeting();
          }
          renderHud();
          return;
        }
      }
      if (vis === "unexplored") {
        renderHud();
        return;
      }
      if (clicked) {
        const clickedKey = keyFor(wx, wy);
        if (!state.aetherWallTargeting.validOrigins.has(clickedKey)) {
          if (vis === "visible") pushFeed("Aether Wall origin must be one of your visible settled border tiles.", "combat", "warn");
          renderHud();
          return;
        }
        state.selected = { x: wx, y: wy };
        const validDirections = validAetherWallDirectionsForTile(clicked);
        if (validDirections.length === 1) {
          const direction = validDirections[0]!;
          const length = preferredAetherWallLength(clicked.x, clicked.y, direction);
          if (length !== undefined) {
            state.aetherWallTargeting.direction = direction;
            state.aetherWallTargeting.length = length;
            sendGameMessage({ type: "CAST_AETHER_WALL", x: clicked.x, y: clicked.y, direction, length });
            clearCrystalTargeting();
          }
          renderHud();
          return;
        }
        if (validDirections.length > 0 && !validDirections.includes(state.aetherWallTargeting.direction)) {
          state.aetherWallTargeting.direction = validDirections[0]!;
        }
        const preferredLength = preferredAetherWallLength(clicked.x, clicked.y, state.aetherWallTargeting.direction);
        if (preferredLength !== undefined) state.aetherWallTargeting.length = preferredLength;
      }
      renderHud();
      return;
    }
    if (state.crystalTargeting.active) {
      if (vis === "unexplored") {
        renderHud();
        return;
      }
      if (clicked) state.selected = { x: wx, y: wy };
      if (clicked && executeCrystalTargeting(clicked)) {
        renderHud();
        return;
      }
      if (clicked && vis === "visible") {
        pushFeed(`${crystalTargetingTitle(state.crystalTargeting.ability)} can only target highlighted tiles.`, "combat", "warn");
      }
      renderHud();
      return;
    }
    if (state.buildingPlacement.active) {
      state.buildingPlacement.x = wx;
      state.buildingPlacement.y = wy;
      state.selected = { x: wx, y: wy };
      renderHud();
      return;
    }
    if (vis === "unexplored") {
      state.selected = undefined;
      renderHud();
      return;
    }
    if (vis === "fogged") {
      state.selected = { x: wx, y: wy };
      resetAttackPreviewState(state);
      renderHud();
      return;
    }
    if (!clicked) {
      state.selected = { x: wx, y: wy };
      resetAttackPreviewState(state);
      if (revealWholeMapInTrue3DMode) {
        const placeholder: Tile = { x: wx, y: wy, terrain: terrainAt(wx, wy), fogged: false };
        openSingleTileActionMenu(placeholder, clientX, clientY);
        requestViewRefresh(2, true);
      }
      renderHud();
      return;
    }

    const to = clicked;
    if (shouldRefreshTileDetailOnPress(to, vis)) requestTileDetailIfNeeded(to, { force: true });
    state.selected = { x: wx, y: wy };
    const frontierOrigin = pickOriginForTarget(to.x, to.y, false) ?? pickOriginForTarget(to.x, to.y, false, true);
    const clickOutcome = neutralTileClickOutcome({
      isLand: to.terrain === "LAND",
      isFogged: Boolean(to.fogged),
      hasFrontierOrigin: Boolean(frontierOrigin),
      isNeutral: !to.ownerId
    });
    if (clickOutcome === "queue-adjacent-neutral") {
      if (!canAffordCost(state.gold, FRONTIER_CLAIM_COST)) {
        notifyInsufficientGoldForFrontierAction("claim");
        requestAttackPreviewForHover();
        renderHud();
        return;
      }
      if (enqueueTarget(to.x, to.y)) {
        processActionQueue();
        pushFeed(`Queued frontier capture (${to.x}, ${to.y}).`, "combat", "info");
      }
      requestAttackPreviewForHover();
      renderHud();
      return;
    }
    if (to.terrain === "LAND" && !to.fogged) {
      openSingleTileActionMenu(to, clientX, clientY);
      requestAttackPreviewForHover();
      renderHud();
      return;
    }
    openSingleTileActionMenu(to, clientX, clientY);
    requestAttackPreviewForHover();
    renderHud();
  };

  return {
    requireAuthedSession,
    sendGameMessage,
    requestTileDetailIfNeeded,
    sendAllianceRequest,
    sendTruceRequest,
    breakAlliance,
    breakTruce,
    activeTruceWithPlayer,
    chooseTech,
    chooseDomain,
    explainActionFailure,
    enqueueTarget,
    buildFrontierQueue,
    queueDragSelection,
    applyPendingSettlementsFromServer,
    queueSpecificTargets,
    attackQueueFailureReason,
    dropQueuedTargetKeyIfAbsent,
    reconcileActionQueue,
    requestSettlement,
    sendDevelopmentBuild,
    processDevelopmentQueue,
    processActionQueue,
    applyCombatOutcomeMessage,
    requestAttackPreviewForHover,
    requestAttackPreviewForTarget,
    attackPreviewDetailForTarget,
    attackPreviewPendingForTarget,
    buildFortOnSelected,
    settleSelected,
    buildSiegeOutpostOnSelected,
    uncaptureSelected,
    cancelOngoingCapture,
    collectVisibleYield,
    collectSelectedYield,
    collectSelectedShard,
    hideTileActionMenu,
    tileActionIsCrystal,
    tileActionIsBuilding,
    requiredTechForTileAction,
    hideTechLockedTileAction,
    splitTileActionsIntoTabs,
    isTileOwnedByAlly,
    chebyshevDistanceClient,
    hostileObservatoryProtectingTile,
    developmentSlotSummary,
    developmentSlotReason,
    shouldResetFrontierActionStateForError,
    abilityCooldownRemainingMs,
    formatCooldownShort,
    formatCountdownClock,
    clearSettlementProgressByKey,
    clearSettlementProgressForTile,
    queueDevelopmentAction,
    syncOptimisticSettlementTile,
    settlementProgressForTile,
    queuedDevelopmentEntryForTile,
    queuedSettlementIndexForTile,
    cancelQueuedSettlement,
    cleanupExpiredSettlementProgress,
    activeSettlementProgressEntries,
    primarySettlementProgress,
    constructionCountdownLineForTile,
    constructionRemainingMsForTile,
    buildDetailTextForAction,
    tileProductionRequirementLabel,
    constructionProgressForTile,
    queuedSettlementProgressForTile,
    menuOverviewForTile,
    tileMenuViewForTile,
    tileActionLogicDeps,
    hasRevealCapability,
    hasAetherBridgeCapability,
    hasAetherWallCapability,
    hasSiphonCapability,
    hasTerrainShapingCapability,
    hasOwnedLandWithinClientRange,
    crystalTargetingTitle,
    crystalTargetingTone,
    clearCrystalTargeting,
    lineStepsBetween,
    computeCrystalTargets,
    beginCrystalTargeting,
    executeCrystalTargeting,
    tileActionAvailability,
    tileActionAvailabilityWithDevelopmentSlot,
    isOwnedBorderTile,
    validAetherWallDirectionsForTile,
    aetherWallDirectionTargetTiles,
    menuActionsForSingleTile,
    tileActionMenuUiDeps,
    renderTileActionMenu,
    openSingleTileActionMenu,
    openBulkTileActionMenu,
    handleTileAction,
    mapInteractionFlags,
    handleTileSelection,
    worldTileRawFromPointer,
    computeDragPreview,
    confirmBuildingPlacement,
    cancelBuildingPlacement,
    isPlacementValidForTile,
    renderPlacementOverlay,
    removePlacementOverlay
  };
};
