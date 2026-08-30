import { devQueueTierForIndex, devQueueTierRelativeIndex, EXPAND_MANPOWER_COST, FRONTIER_CLAIM_COST, rushBuyPriceGold, SETTLE_MANPOWER_COST, wireStepsForPlan, type BuildableStructureType, type FrontierDecayKind, type SlotResource } from "@border-empires/shared";
import { constructionCountdownLineForTile as constructionCountdownLineForTileFromModule } from "./client-construction-countdown/client-construction-countdown.js";
import { handleConverterTileAction } from "./client-converter-actions.js";
import { canAffordCost } from "./client-constants.js";
import { authoritativeIsInReach, resolveMyReach } from "./client-reach-authoritative/client-reach-authoritative.js";
import { playerDisplayNameForOwnerFromState } from "./client-owner-name/client-owner-name.js";
import { connectedEnemyRegionKeys, connectedOwnedFrontierKeys } from "./client-connected-region/client-connected-region.js";
import { readyOwnedObservatoryCooldownRemainingMs } from "./client-observatory-cooldown/client-observatory-cooldown.js";
import { ownObservatoryRange } from "./client-observatory-rules/client-observatory-rules.js";
import {
  activeTruceWithPlayerFromState,
  explainActionFailureFromServer
} from "./client-player-actions.js";
import { createPlayerActionShortcuts } from "./client-player-action-shortcuts/client-player-action-shortcuts.js";
import { createNextFrontierCommandIdentity } from "./client-frontier-command/client-frontier-command.js";
import { clearMusterTransitForTarget } from "./client-muster-transit/client-muster-transit.js";
import { armMusterMarchTargeting, handleMusterMarchTargetClick } from "./client-muster-march-targeting.js";
import { recordClientDebugEvent } from "./client-debug/client-debug.js";
import { blockUnsupportedRewriteMessage } from "./client-send-message-guard/client-send-message-guard.js";
import { showVisibleActionWarning } from "./client-visible-action-warning.js";
import {
  activeSettlementProgressEntries as activeSettlementProgressEntriesFromModule,
  applyPendingSettlementsFromServer as applyPendingSettlementsFromServerFromModule,
  attackPreviewBreakdownForTarget as attackPreviewBreakdownForTargetFromModule,
  attackPreviewDetailForTarget as attackPreviewDetailForTargetFromModule,
  attackPreviewManpowerCostForTarget as attackPreviewManpowerCostForTargetFromModule,
  attackPreviewPendingForTarget as attackPreviewPendingForTargetFromModule,
  attackQueueFailureReason as attackQueueFailureReasonFromModule,
  buildFrontierQueue as buildFrontierQueueFromModule,
  cancelQueuedSettlement as cancelQueuedSettlementFromModule,
  cancelQueuedBuild as cancelQueuedBuildFromModule,
  moveQueuedEntryToFront as moveQueuedEntryToFrontFromModule,
  waypointIndexForTile as waypointIndexForTileFromModule,
  cancelQueuedWaypointEntry as cancelQueuedWaypointEntryFromModule,
  moveWaypointToFront as moveWaypointToFrontFromModule,
  actionQueueIndexForTile as actionQueueIndexForTileFromModule,
  cancelQueuedExpandEntry as cancelQueuedExpandEntryFromModule,
  moveActionQueueEntryToFront as moveActionQueueEntryToFrontFromModule,
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
  queuedDevelopmentActionExists,
  queueSpecificTargets as queueSpecificTargetsFromModule,
  queuedDevelopmentEntryForTile as queuedDevelopmentEntryForTileFromModule,
  queuedBuildEntryForTile as queuedBuildEntryForTileFromModule,
  queuedSettlementIndexForTile as queuedSettlementIndexForTileFromModule,
  queuedEntryIndexForTile as queuedEntryIndexForTileFromModule,
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
import { cancelQueuedAutoSettle as cancelQueuedAutoSettleFromModule } from "./client-queue-logic/client-cancel-queued-auto-settle.js";
import { structureDisplayLabel as structureDisplayLabelFromModule } from "./client-structure-display-label/client-structure-display-label.js";
import { queueSettleForExpandingTile as queueSettleForExpandingTileFromModule } from "./client-settle-land-queue/client-settle-land-queue.js";
import {
  dispatchGenericBuild as dispatchGenericBuildFromModule,
  triggerBuildForStructureType as triggerBuildForStructureTypeFromModule,
  type BuildDispatchDeps
} from "./client-structure-build-trigger/client-structure-build-trigger.js";
import { dispatchPaced } from "./client-paced-bulk-dispatch/client-paced-bulk-dispatch.js";
import { announceDiscoveryTip } from "./client-discovery-tips/client-discovery-tip-overlay.js";
import { pushDiscoveryTipFeedEntry } from "./client-alerts/client-alerts.js";
import {
  buildFortOnSelected as buildFortOnSelectedFromModule,
  buildSiegeOutpostOnSelected as buildSiegeOutpostOnSelectedFromModule,
  cancelOngoingCapture as cancelOngoingCaptureFromModule,
  collectSelectedShard as collectSelectedShardFromModule,
  collectSelectedYield as collectSelectedYieldFromModule,
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
  structureTypeForTileAction as structureTypeForTileActionFromModule,
  tileActionIsBuilding as tileActionIsBuildingFromModule,
  tileActionIsCrystal as tileActionIsCrystalFromModule,
  unmappedBuildActionWarning as unmappedBuildActionWarningFromModule
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
  tileMenuViewForTile as tileMenuViewForTileFromModule,
  tileProductionRequirementLabel as tileProductionRequirementLabelFromModule
} from "./client-tile-menu-view/client-tile-menu-view.js";
import { quickforgeRushBuyContextForState } from "./client-tile-menu-view/client-tile-menu-quickforge-rush-buy.js";
import { constructionRemainingMsForTile } from "./client-construction-remaining-ms/client-construction-remaining-ms.js";
import {
  queuedBuildProgressForTile as queuedBuildProgressForTileFromModule,
  queuedSettlementProgressForTile as queuedSettlementProgressForTileFromModule,
  queuedWaypointProgressForTile as queuedWaypointProgressForTileFromModule,
  queuedExpandProgressForTile as queuedExpandProgressForTileFromModule,
  queuedAutoSettleNextForTile as queuedAutoSettleNextForTileFromModule
} from "./client-tile-menu-queue-progress/client-tile-menu-queue-progress.js";
import { tileWithVisibleShardSite } from "./client-shard-rain-pings/client-shard-rain-pings.js";
import { neutralTileClickOutcome } from "./client-tile-interaction/client-tile-interaction.js";
import { handleWaypointAction } from "./client-waypoint-action-handlers.js";
import { planWaypoint } from "./client-waypoint-planner/client-waypoint-planner.js";
import { persistWaypointQueueForPlayer, waypointEnqueueWirePayload } from "./client-waypoint-planner/client-waypoint-persistence.js";
import { openUnexploredTileActionMenu } from "./client-unexplored-tile-menu/client-unexplored-tile-menu.js";
import { revealWholeMapInTrue3DMode } from "./client-renderer-mode.js";
import type { RealtimeSocket } from "./client-socket-types.js";
import type { ClientState } from "./client-state/client-state.js";
import type {
  ActiveTruceView,
  CrystalTargetingAbility,
  OptimisticStructureKind,
  Tile,
  TileActionDef,
  TileCombatBreakdown,
  TileMenuProgressView,
  TileMenuTab,
  TileMenuView,
  TileOverviewLine,
  TileTimedProgress,
  TileVisibilityState
} from "./client-types.js";
import { debugTileLog, tileMatchesDebugKey, tileSyncDebugEnabled, verboseTileDebugEnabled } from "./client-debug/client-debug.js";
import { createMusterWatchGuard } from "./client-muster-watch/client-muster-watch.js";

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

// True only for a tile the player's own in-flight EXPAND capture is about to
// hand them ownership of — never for an ATTACK capture (target is already
// enemy-owned territory, not a pending acquisition) or a muster-fed attack.
const isPendingExpansionTarget = (state: Pick<ClientState, "capture">, x: number, y: number): boolean =>
  Boolean(state.capture && state.capture.actionType === "EXPAND" && state.capture.target.x === x && state.capture.target.y === y);

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
    "CHOOSE_TECH",
    "CHOOSE_DOMAIN",
    "SET_CONVERTER_STRUCTURE_ENABLED",
    "SET_CONVERTER_STRUCTURE_MODE",
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
    processPendingMusterAttacksFromModule(state, { keyFor, isAdjacent, pushFeed, sendGameMessage });

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

  const structureDisplayLabel = (structureType: BuildableStructureType): string =>
    structureDisplayLabelFromModule(structureType, state);

  const buildDispatchDeps = (): BuildDispatchDeps => ({ sendDevelopmentBuild, applyOptimisticStructureBuild, structureDisplayLabel });

  const dispatchGenericBuild = (structureType: BuildableStructureType, tile: Tile): void =>
    dispatchGenericBuildFromModule(structureType, tile, buildDispatchDeps());

  const triggerBuildForStructureType = (structureType: BuildableStructureType, tile: Tile): void =>
    triggerBuildForStructureTypeFromModule(structureType, tile, state, { ...buildDispatchDeps(), renderPlacementOverlay, renderHud });

  // Owned-tile build entry point: settles-then-builds automatically on a
  // FRONTIER tile (mirroring the Relay Beacon frontier chain) or builds
  // immediately on a SETTLED tile. A second build click on a tile with a
  // settle-then-build already queued is blocked rather than overwritten.
  const handleBuildAction = (actionId: string, structureType: BuildableStructureType, selected: Tile): void => {
    const targetKey = keyFor(selected.x, selected.y);
    const isActiveCaptureTarget = isPendingExpansionTarget(state, selected.x, selected.y);
    if (selected.ownerId !== state.me && !isActiveCaptureTarget) { hideTileActionMenu(); return; }
    if (selected.ownershipState === "SETTLED") {
      hideTileActionMenu();
      triggerBuildForStructureType(structureType, selected);
      return;
    }
    if (state.autoBuildTargets.has(targetKey)) {
      showVisibleActionWarning({ pushFeed, showCaptureAlert }, "Build already queued", "A build is already queued for this tile.");
      hideTileActionMenu();
      return;
    }
    state.autoSettleTargets.add(targetKey); state.autoBuildTargets.set(targetKey, structureType);
    sendGameMessage({ type: "CLAIM_CONTINUATION_SET", x: selected.x, y: selected.y, structureType }); // server-durable continuation, see runtime-claim-continuation-command-handlers.ts
    pushFeed(
      isActiveCaptureTarget
        ? `Queued settle + build ${structureDisplayLabel(structureType)} at (${selected.x}, ${selected.y}) — starts once the expansion completes.`
        : `Settling (${selected.x}, ${selected.y}) — settle + build ${structureDisplayLabel(structureType)}.`,
      "info",
      "info"
    );
    // processAutoSettleTargets fires requestSettlement itself once owned (tick loop).
    if (!isActiveCaptureTarget) requestSettlement(selected.x, selected.y);
    hideTileActionMenu();
  };

  // Once a tile queued via handleBuildAction lands SETTLED, clear its bookkeeping.
  // The BUILD is not sent from here -- CLAIM_CONTINUATION_SET's server-side tail
  // fires it (sending it here too raced that: BUILD_INVALID "tile already has structure"). FOUNDRY/WATERWORKS need player-picked placement, so still fire here.
  const processAutoBuildTargets = (): void => {
    if (state.autoBuildTargets.size === 0) return;
    for (const [targetKey, structureType] of [...state.autoBuildTargets]) {
      const tile = state.tiles.get(targetKey);
      if (!tile) continue;
      if (tile.ownerId === state.me && tile.ownershipState === "SETTLED" && !tile.optimisticPending) {
        state.autoBuildTargets.delete(targetKey);
        if (structureType === "FOUNDRY" || structureType === "WATERWORKS") triggerBuildForStructureType(structureType, tile);
      }
    }
  };

  // Runtime loop's periodic tick: once a waypoint target is owned, settle it if queued.
  const processAutoSettleTargets = (): void => {
    if (state.autoSettleTargets.size === 0) return;
    const reach = resolveMyReach(state);
    for (const targetKey of [...state.autoSettleTargets]) {
      const tile = state.tiles.get(targetKey);
      if (!tile) continue;
      // A settle already dispatched (or waiting in the development queue) for
      // this tile keeps it FRONTIER until the server confirms, and the optimistic
      // marker can be cleared by an intervening tile update. Firing again here
      // sends a second SETTLE and the server rejects it with
      // "tile is already settling" -- drop the auto-settle entry instead, the
      // matching autoBuildTargets entry still runs once the tile lands SETTLED.
      if (state.settleProgressByTile.has(targetKey) || queuedDevelopmentActionExists(state, targetKey, "SETTLE")) {
        state.autoSettleTargets.delete(targetKey);
        continue;
      }
      if (tile.ownerId === state.me && tile.ownershipState === "FRONTIER" && !tile.optimisticPending) {
        // The tile can drift out of reach between the click that queued this
        // (e.g. a Relay Beacon chain, or a build queued ahead of ownership
        // landing) and the tick where ownership actually arrives -- the server
        // would reject the SETTLE as OUT_OF_REACH anyway, so drop the queued
        // settle (and any dependent build) instead of sending a doomed command.
        if (!reach.has(targetKey)) {
          state.autoSettleTargets.delete(targetKey);
          state.autoBuildTargets.delete(targetKey);
          continue;
        }
        state.autoSettleTargets.delete(targetKey);
        requestSettlement(tile.x, tile.y);
      }
    }
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
      renderHud,
      sendGameMessage
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
        ws.send(JSON.stringify({ type: "ATTACK", fromX, fromY, toX, toY, commandId, clientSeq })),
      sendGameMessage
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
        frontierDecayKind?: FrontierDecayKind | null;
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
      if (typeof c.frontierDecayAt === "number") incoming.frontierDecayAt = c.frontierDecayAt; else if ("frontierDecayAt" in c && !c.frontierDecayAt) delete incoming.frontierDecayAt;
      if (c.frontierDecayKind) incoming.frontierDecayKind = c.frontierDecayKind; else if ("frontierDecayKind" in c && !c.frontierDecayKind) delete incoming.frontierDecayKind;
      const merged = mergeServerTileWithOptimisticState(incoming);
      if (!merged.optimisticPending) clearOptimisticTileState(tileKey);
      state.tiles.set(tileKey, merged);
      // Keyed off the SERVER's stamp, so the contested-border exemption never fires a false warning.
      if (merged.frontierDecayKind === "OUT_OF_REACH" && merged.ownerId === state.me && state.discoveryTipQueue) announceDiscoveryTip(state.discoveryTipQueue, "OUT_OF_REACH_EXPAND", state.authEmail, renderHud, (def) => pushDiscoveryTipFeedEntry(state, def));
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
      // Can land outside reach (e.g. a Relay Beacon dying mid-capture); mirror
      // processAutoSettleTargets and drop the doomed settle instead of sending it.
      if (settledTile && settledTile.ownerId === state.me && settledTile.ownershipState === "FRONTIER") {
        if (!resolveMyReach(state).has(targetKey)) state.autoBuildTargets.delete(targetKey);
        else if (requestSettlement(settledTile.x, settledTile.y)) {
          handedOffToSettle = true;
          pushFeed(`Auto-settle started at (${settledTile.x}, ${settledTile.y}).`, "combat", "info");
        }
      }
      state.autoSettleTargets.delete(targetKey);
    }
    if (!handedOffToSettle) state.autoBuildTargets.delete(targetKey);
    state.capture = undefined;
    // Only this attack's flag entry — other flags may still be marching.
    if (target) clearMusterTransitForTarget(state, target.x, target.y);
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

  const attackPreviewManpowerCostForTarget = (to: Tile): string | undefined =>
    attackPreviewManpowerCostForTargetFromModule(state, to, { keyFor, pickOriginForTarget });

  const attackPreviewBreakdownForTarget = (to: Tile): TileCombatBreakdown | undefined =>
    attackPreviewBreakdownForTargetFromModule(state, to, { keyFor, pickOriginForTarget });

  const buildFortOnSelected = (): void => buildFortOnSelectedFromModule(state, { keyFor, pushFeed, showCaptureAlert, renderHud, sendGameMessage });
  const settleSelected = (): void => settleSelectedFromModule(state, { keyFor, pushFeed, showCaptureAlert, renderHud, requestSettlement });
  const buildSiegeOutpostOnSelected = (): void => buildSiegeOutpostOnSelectedFromModule(state, { keyFor, pushFeed, showCaptureAlert, renderHud, sendGameMessage });
  const uncaptureSelected = (): void => uncaptureSelectedFromModule(state, { keyFor, pushFeed, showCaptureAlert, renderHud, sendGameMessage });
  const cancelOngoingCapture = (): void => cancelOngoingCaptureFromModule(state, sendGameMessage);
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

  const musterWatchGuard = createMusterWatchGuard();
  const sendUnwatchMusterIfWatching = (): void => {
    if (musterWatchGuard.shouldSendUnwatch()) sendGameMessage({ type: "UNWATCH_MUSTER" });
  };

  const hideTileActionMenu = (): void => {
    sendUnwatchMusterIfWatching();
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
    queueDevelopmentActionFromModule(state, entry, { pushFeed, renderHud, sendGameMessage });

  const syncOptimisticSettlementTile = (x: number, y: number, awaitingServerConfirm: boolean): void =>
    syncOptimisticSettlementTileFromModule(state, x, y, awaitingServerConfirm, { applyOptimisticTileState });

  const settlementProgressForTile = (x: number, y: number): TileTimedProgress | undefined =>
    settlementProgressForTileFromModule(state, x, y, { keyFor, syncOptimisticSettlementTile, requestViewRefresh });

  const queuedDevelopmentEntryForTile = (tileKey: string): QueuedDevelopmentAction | undefined =>
    queuedDevelopmentEntryForTileFromModule(state, tileKey);

  const queuedSettlementIndexForTile = (tileKey: string): number =>
    devQueueTierRelativeIndex(queuedSettlementIndexForTileFromModule(state, tileKey));

  const queuedEntryIndexForTile = (tileKey: string): number => queuedEntryIndexForTileFromModule(state, tileKey);

  const devQueueStateForTile = (tileKey: string): "planned" | "queued" =>
    devQueueTierForIndex(queuedEntryIndexForTileFromModule(state, tileKey));

  const queuedBuildEntryForTile = (tileKey: string) => queuedBuildEntryForTileFromModule(state, tileKey);

  const cancelQueuedSettlement = (tileKey: string): boolean => cancelQueuedSettlementFromModule(state, tileKey, { pushFeed, renderHud, sendGameMessage });

  const cancelQueuedBuild = (tileKey: string): boolean => cancelQueuedBuildFromModule(state, tileKey, { pushFeed, renderHud, sendGameMessage });

  const moveQueuedEntryToFront = (tileKey: string): boolean => moveQueuedEntryToFrontFromModule(state, tileKey, { pushFeed, renderHud, sendGameMessage });

  const cancelQueuedWaypointEntry = (x: number, y: number): boolean => cancelQueuedWaypointEntryFromModule(state, x, y, { pushFeed, renderHud, sendGameMessage });

  const moveWaypointToFront = (x: number, y: number): boolean => moveWaypointToFrontFromModule(state, x, y, { pushFeed, renderHud, sendGameMessage });

  const cancelQueuedExpandEntry = (x: number, y: number): boolean => cancelQueuedExpandEntryFromModule(state, x, y, { keyFor, pushFeed, renderHud });

  const moveActionQueueEntryToFront = (x: number, y: number): boolean => moveActionQueueEntryToFrontFromModule(state, x, y, { pushFeed, renderHud });

  const cleanupExpiredSettlementProgress = (): boolean =>
    cleanupExpiredSettlementProgressFromModule(state, { syncOptimisticSettlementTile, clearSettlementProgressByKey, requestViewRefresh });

  const activeSettlementProgressEntries = (): TileTimedProgress[] =>
    activeSettlementProgressEntriesFromModule(state, { cleanupExpiredSettlementProgress });

  const primarySettlementProgress = (): TileTimedProgress | undefined =>
    primarySettlementProgressFromModule(state, { settlementProgressForTile, activeSettlementProgressEntries });

  const constructionCountdownLineForTile = (tile: Tile): string =>
    constructionCountdownLineForTileFromModule(tile, formatCountdownClock, deps.economicStructureName);

  const buildDetailTextForAction = (actionId: string, tile: Tile, supportedTown?: Tile): string | undefined =>
    buildDetailTextForActionFromModule(actionId, tile, supportedTown);

  const tileProductionRequirementLabel = (tile: Tile): string | undefined => tileProductionRequirementLabelFromModule(tile, prettyToken);

  const constructionProgressForTile = (tile: Tile): TileMenuProgressView | undefined =>
    constructionProgressForTileFromModule(tile, formatCountdownClock, quickforgeRushBuyContextForState(state));

  const queuedSettlementProgressForTile = (tile: Tile): TileMenuProgressView | undefined =>
    queuedSettlementProgressForTileFromModule(tile, {
      keyFor,
      queuedDevelopmentEntryForTile,
      queuedSettlementIndexForTile,
      queuedEntryIndexForTile,
      devQueueStateForTile
    });

  const queuedBuildProgressForTile = (tile: Tile): TileMenuProgressView | undefined =>
    queuedBuildProgressForTileFromModule(tile, {
      keyFor,
      queuedDevelopmentEntryForTile,
      queuedEntryIndexForTile,
      devQueueStateForTile
    });

  const queuedWaypointProgressForTile = (tile: Tile): TileMenuProgressView | undefined =>
    queuedWaypointProgressForTileFromModule(tile, {
      waypointIndexForTile: (x, y) => waypointIndexForTileFromModule(state, x, y),
      waypointCount: () => state.waypoint.length
    });

  const queuedExpandProgressForTile = (tile: Tile): TileMenuProgressView | undefined =>
    queuedExpandProgressForTileFromModule(tile, {
      actionQueueIndexForTile: (x, y) => actionQueueIndexForTileFromModule(state, x, y),
      actionQueueLength: () => state.actionQueue.length
    });

  const queuedAutoSettleNextForTile = (tile: Tile): TileMenuProgressView["queuedNext"] =>
    queuedAutoSettleNextForTileFromModule(tile, {
      keyFor,
      hasAutoSettleTarget: (tileKey) => state.autoSettleTargets.has(tileKey),
      autoBuildStructureLabelForTile: (tileKey) => {
        const structureType = state.autoBuildTargets.get(tileKey);
        return structureType ? structureDisplayLabel(structureType) : undefined;
      }
    });

  const cancelQueuedAutoSettle = (tileKey: string): boolean => cancelQueuedAutoSettleFromModule(state, tileKey, { pushFeed, renderHud });

  // Pure getter used during render; the seed/clear lifecycle below decides
  // when an entry exists, so the menu view itself never mutates state.
  const townPartialLoadingStartedAt = (tileKey: string): number =>
    state.tileTownPartialSince.get(tileKey) ?? Date.now();

  // §14.2: state.dormantStructures only ever describes the logged-in
  // player's own structures (PLAYER_UPDATE is a private per-player message),
  // so a foreign tile never gets a dormancy lookup.
  const dormantResourcesForTile = (
    tile: Tile,
    field: "fort" | "observatory" | "siegeOutpost" | "economicStructure"
  ): SlotResource[] | undefined => {
    if (tile.ownerId !== state.me) return undefined;
    const key = `${tile.x},${tile.y}:${field}`;
    return state.dormantStructures.find((entry) => entry.key === key)?.resources;
  };

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
      hostileObservatoryProtectingTile,
      constructionCountdownLineForTile,
      tileHistoryLines,
      isTileOwnedByAlly,
      townPartialLoadingStartedAt,
      dormantResourcesForTile,
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

  const captureProgressForTile = (tile: Tile): TileMenuProgressView | undefined => {
    if (!state.capture || state.capture.target.x !== tile.x || state.capture.target.y !== tile.y) {
      return undefined;
    }
    const nowMs = Date.now();
    const remainingMs = Math.max(0, state.capture.resolvesAt - nowMs);
    const totalMs = Math.max(1, state.capture.resolvesAt - state.capture.startAt);
    return {
      title: "Frontier expansion in progress",
      detail: "This tile is being claimed and will become your frontier when the expansion completes.",
      remainingLabel: formatCountdownClock(remainingMs),
      progress: Math.max(0, Math.min(1, (nowMs - state.capture.startAt) / totalMs)),
      note: "This tile will become frontier territory.",
      cancelLabel: "Cancel expansion",
      cancelActionId: "cancel_capture" as const,
      rushBuyLabel: `⏩ 💰${rushBuyPriceGold(remainingMs, totalMs, EXPAND_MANPOWER_COST)}`,
      rushBuyActionId: "rush_buy" as const
    };
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
        const remainingMs = Math.max(0, progress.resolvesAt - Date.now());
        const totalMs = Math.max(1, progress.resolvesAt - progress.startAt);
        return {
          title: "Settlement in progress",
          detail: progress.awaitingServerConfirm
            ? "Settlement timer finished locally. Waiting for server confirmation."
            : "Settling unlocks defense and activates town and resource production.",
          remainingLabel: progress.awaitingServerConfirm ? "Syncing..." : formatCountdownClock(remainingMs),
          progress: progress.awaitingServerConfirm
            ? 1
            : Math.max(0, Math.min(1, (Date.now() - progress.startAt) / totalMs)),
          note: progress.awaitingServerConfirm
            ? "Keeping the tile settled client-side until the server responds."
            : "This tile is actively settling.",
          // §6.3 rush-buy: hidden once the timer's already elapsed locally
          // (awaitingServerConfirm) — nothing left to pay to speed up.
          ...(progress.awaitingServerConfirm
            ? {}
            : {
                cancelLabel: "Cancel settlement",
                cancelActionId: "cancel_settle" as const,
                rushBuyLabel: `⏩ 💰${rushBuyPriceGold(remainingMs, totalMs, SETTLE_MANPOWER_COST)}`,
                rushBuyActionId: "rush_buy" as const
              })
        };
      },
      captureProgressForTile,
      queuedSettlementProgressForTile,
      queuedBuildProgressForTile,
      queuedExpandProgressForTile,
      queuedWaypointProgressForTile,
      queuedAutoSettleNextForTile,
      constructionProgressForTile,
      menuOverviewForTile,
      prettyToken,
      playerNameForOwner: (ownerId?: string | null) => playerDisplayNameForOwnerFromState(state, ownerId),
      terrainLabel,
      isTileOwnedByAlly,
      combatBreakdownForTile: attackPreviewBreakdownForTarget,
      state,
      pendingOwnershipTile: isPendingExpansionTarget(state, menuTile.x, menuTile.y)
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
    attackPreviewManpowerCostForTarget,
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
    cancelQueuedAutoSettle,
    moveQueuedEntryToFront,
    cancelQueuedWaypointEntry,
    moveWaypointToFront,
    cancelQueuedExpandEntry,
    moveActionQueueEntryToFront,
    cancelOngoingCapture,
    sendGameMessage,
    applyOptimisticStructureCancel,
    clearSettlementProgressByKey,
    renderHud,
    requestAttackPreviewForTarget,
    keyFor,
    isTileOwnedByAlly,
    pickOriginForTarget
  });

  const renderTileActionMenu = (view: TileMenuView, clientX: number, clientY: number): void =>
    renderTileActionMenuFromModule(state, view, clientX, clientY, tileActionMenuUiDeps());

  const openSingleTileActionMenu = (tile: Tile, clientX: number, clientY: number, options?: { requestAttackPreview?: boolean; openTab?: TileMenuTab }): void => {
    if (tile.muster?.ownerId === state.me) {
      musterWatchGuard.noteWatchSent();
      sendGameMessage({ type: "WATCH_MUSTER", x: tile.x, y: tile.y });
    } else {
      sendUnwatchMusterIfWatching();
    }
    openSingleTileActionMenuFromModule(state, tile, clientX, clientY, tileActionMenuUiDeps(), options);
  };

  const openBulkTileActionMenu = (targetKeys: string[], clientX: number, clientY: number): void =>
    openBulkTileActionMenuFromModule(state, targetKeys, clientX, clientY, tileActionMenuUiDeps());

  const handleTileAction = (actionId: string, _targetKeyOverride?: string, _originKeyOverride?: string): void => {
    const singleTargetKey = state.tileActionMenu.mode === "single" ? state.tileActionMenu.currentTileKey : "";
    const selectedKey = singleTargetKey || (state.selected ? keyFor(state.selected.x, state.selected.y) : "");
    const selected = state.tiles.get(selectedKey);
    // Waypoint actions need only coordinates, so unexplored targets (absent from state.tiles) still work.
    const selectedCoords = selected ?? (singleTargetKey ? parseKey(singleTargetKey) : state.selected);
    const bulkKeys = state.tileActionMenu.mode === "bulk" ? state.tileActionMenu.bulkKeys : [];
    const fromBulk = bulkKeys.length > 0;
    const targets = fromBulk ? bulkKeys : selectedCoords ? [keyFor(selectedCoords.x, selectedCoords.y)] : [];
    if (targets.length === 0) {
      hideTileActionMenu();
      return;
    }

    if (handleWaypointAction({ state, selected: selectedCoords, actionId, keyFor, pushFeed, renderHud, hideTileActionMenu, showCaptureAlert, processActionQueue, sendGameMessage })) return;

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
          // Tile is neutral but already mid-EXPAND (active capture, or still
          // waiting its turn in the action queue) -- a second EXPAND here
          // would just be rejected as a duplicate/locked target. Queue the
          // settle instead: processAutoSettleTargets (tick loop) fires it
          // automatically the moment this tile lands FRONTIER-owned.
          const alreadyExpanding = isPendingExpansionTarget(state, selected.x, selected.y) || actionQueueIndexForTileFromModule(state, selected.x, selected.y) >= 0;
          if (alreadyExpanding) {
            queueSettleForExpandingTileFromModule(state, selected.x, selected.y, k, {
              pushFeed,
              showVisibleActionWarning: (title, message) => showVisibleActionWarning({ pushFeed, showCaptureAlert }, title, message),
              renderHud
            });
            hideTileActionMenu();
            return;
          }
          const adjacentOrigin = pickOriginForTarget(selected.x, selected.y, false) ?? pickOriginForTarget(selected.x, selected.y, false, true);
          if (adjacentOrigin) {
            const out = queueSpecificTargets([k]);
            if (out.queued > 0) {
              processActionQueue();
            } else {
              showVisibleActionWarning({ pushFeed, showCaptureAlert }, "Frontier claim blocked", "Cannot claim this tile yet. It must touch your territory and you need enough gold.");
            }
          } else {
            // Not adjacent yet, but still inside reach (that's the only way
            // this row is visible at all -- see the targetInReach gate on
            // "settle_land" in client-tile-action-logic.ts). Walk there
            // first via the exact same waypoint mechanism "Add Waypoint"
            // used to offer as a separate button for this case -- one
            // action that does the right thing regardless of distance,
            // instead of forcing the player to notice two different buttons.
            handleWaypointAction({
              state,
              selected,
              actionId: "expand_here",
              keyFor,
              pushFeed,
              renderHud,
              hideTileActionMenu,
              showCaptureAlert,
              processActionQueue,
              sendGameMessage
            });
            return;
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
      // Bulk box-selection can cover up to 2500 tiles (client-drag-selection.ts) -- fire
      // these as one synchronous burst of COLLECT_TILE messages and the gateway's
      // per-player rate limiter will just reject most of them. Pace it client-side instead.
      const ownedTiles = targets.map((k) => state.tiles.get(k)).filter((t): t is Tile => t !== undefined && t.ownerId === state.me);
      dispatchPaced(ownedTiles, (t) => sendGameMessage({ type: "COLLECT_TILE", x: t.x, y: t.y }));
      pushFeed(`Collecting from ${ownedTiles.length} selected tiles.`, "info", "info");
      hideTileActionMenu();
      return;
    }
    if (!selected) {
      hideTileActionMenu();
      return;
    }
    if (actionId === "collect_yield") collectSelectedYield();
    if (actionId === "collect_shard") collectSelectedShard();
    if (actionId === "grow_settlement_to_town" || actionId === "grow_town_to_city" || actionId === "grow_city_to_great_city" || actionId === "grow_great_city_to_monumental_city") sendGameMessage({ type: "UPGRADE_TOWN_TIER", x: selected.x, y: selected.y });
    const genericStructureType = structureTypeForTileActionFromModule(actionId as TileActionDef["id"]);
    if (genericStructureType) { handleBuildAction(actionId, genericStructureType, selected); return; }
    const unmappedBuildWarning = unmappedBuildActionWarningFromModule(actionId as TileActionDef["id"]);
    if (unmappedBuildWarning) { pushFeed(unmappedBuildWarning, "info", "error"); hideTileActionMenu(); return; }
    if (actionId === "upgrade_umbrite_synthesizer" || actionId === "upgrade_titanium_works" || actionId === "upgrade_crystal_synthesizer" || actionId === "enable_converter_structure" || actionId === "disable_converter_structure" || actionId === "set_converter_structure_mode") {
      handleConverterTileAction({ selected, sendGameMessage, sendDevelopmentBuild, optimisticStructureBuildForAction })(actionId);
    }
    if (actionId === "build_relay_beacon_frontier") {
      if (selected && !selected.ownerId) {
        const plan = planWaypoint(
          { x: selected.x, y: selected.y },
          { state, keyFor, isInReach: authoritativeIsInReach(state, keyFor) }
        );
        if (!plan.reachable) {
          showVisibleActionWarning({ pushFeed, showCaptureAlert }, "Relay Beacon unreachable", "No expansion path to that tile.");
        } else {
          const targetKey = keyFor(selected.x, selected.y);
          // Drive the frontier over via the same waypoint mechanism as
          // "Expand Here" — it advances one owned-adjacent hop at a time so
          // the claimed chain always stays connected. Once ownership is
          // reached, auto-settle then auto-build pick up the baton.
          const planId = `plan-${state.me}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; const plannedAt = Date.now(); state.waypoint.push({ target: { x: selected.x, y: selected.y }, plan, planId, plannedAt });
          persistWaypointQueueForPlayer(state.me, state.waypoint);
          sendGameMessage(waypointEnqueueWirePayload({ x: selected.x, y: selected.y }, undefined, { planId, plannedAt, steps: wireStepsForPlan(plan.steps) }));
          state.autoSettleTargets.add(targetKey); state.autoBuildTargets.set(targetKey, "RELAY_BEACON");
          sendGameMessage({ type: "CLAIM_CONTINUATION_SET", x: selected.x, y: selected.y, structureType: "RELAY_BEACON" }); // server-durable continuation, see handleBuildAction above
          processActionQueue();
        }
      }
      hideTileActionMenu();
      return;
    }
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
    if (actionId === "muster_hold" || actionId === "muster_advance") { sendGameMessage({ type: "SET_MUSTER", x: selected.x, y: selected.y, mode: actionId === "muster_hold" ? "HOLD" : "ADVANCE" }); if (state.discoveryTipQueue) announceDiscoveryTip(state.discoveryTipQueue, "FIRST_MUSTER", state.authEmail, renderHud, (def) => pushDiscoveryTipFeedEntry(state, def)); }
    if (actionId === "muster_march") armMusterMarchTargeting(state, selected.x, selected.y, { pushFeed, sendGameMessage }); else if (actionId === "muster_march_cancel") sendGameMessage({ type: "SET_MUSTER", x: selected.x, y: selected.y, mode: "HOLD" });
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
        : actionId === "retort_recast_titanium"
          ? "TITANIUM"
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
    if (actionId === "imperial_exchange_levy") beginCrystalTargeting("imperial_exchange_levy");
    if (actionId === "aegis_lock") {
      if (sendGameMessage({ type: "AEGIS_LOCK", fromX: selected.x, fromY: selected.y })) {
        state.aegisLockFxQueue.push({ x: selected.x, y: selected.y, queuedAt: Date.now() });
      }
    }
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
    if (state.musterMarchTargeting.active) { handleMusterMarchTargetClick(state, wx, wy, vis, { pushFeed, sendGameMessage }); renderHud(); return; }
    if (state.buildingPlacement.active) { state.buildingPlacement.x = wx; state.buildingPlacement.y = wy; state.selected = { x: wx, y: wy }; renderHud(); return; }
    // True when (x,y) falls inside the local player's fixed-border reach --
    // see client-reach-overlay.ts's MOCK-DATA SEAM comment for why this is a
    // client-local approximation of the server's authoritative reach, not
    // fog/vision-gated (a tile can be in reach long before it's ever been
    // seen). Used below to decide whether an adjacent-neutral click should
    // still auto-queue a bare EXPAND, or instead open the tile menu so the
    // richer "Build Relay Beacon" (expand+settle+build) choice -- which only
    // ever appears inside that menu -- actually has a chance to be seen.
    const isTargetInLocalReach = (x: number, y: number): boolean =>
      resolveMyReach(state).has(keyFor(x, y));
    // Shared with the "visible" neutral-adjacent click path below: claims an
    // adjacent-reachable tile immediately instead of opening a menu. Lifted
    // out so fogged/unexplored tiles adjacent to owned territory can also
    // start a frontier expand directly, rather than only ever showing a
    // description popup (or, for unexplored tiles, nothing at all) just
    // because their true terrain/ownership isn't confirmed yet -- the queue
    // already tolerates a claim against a stale/wrong guess via
    // frontierSyncWaitUntilByTarget, the same as any other rejected attempt.
    const queueAdjacentExpandClaim = (x: number, y: number): void => {
      const isAlreadyQueued = actionQueueIndexForTileFromModule(state, x, y) >= 0;
      const isActiveCapture = Boolean(state.capture && state.capture.target.x === x && state.capture.target.y === y);
      if (isAlreadyQueued || isActiveCapture) {
        const activeTile = state.tiles.get(keyFor(x, y));
        if (activeTile) openSingleTileActionMenu(activeTile, clientX, clientY, isActiveCapture ? { openTab: "buildings" } : undefined);
        requestAttackPreviewForHover();
        renderHud();
        return;
      }
      if (!canAffordCost(state.gold, FRONTIER_CLAIM_COST)) {
        notifyInsufficientGoldForFrontierAction("claim");
        requestAttackPreviewForHover();
        renderHud();
        return;
      }
      if (enqueueTarget(x, y)) {
        processActionQueue();
        if (state.capture && state.capture.target.x === x && state.capture.target.y === y) {
          state.capture.silent = false;
        }
      }
      requestAttackPreviewForHover();
      renderHud();
    };
    if (vis === "unexplored") {
      const frontierOrigin = pickOriginForTarget(wx, wy, false) ?? pickOriginForTarget(wx, wy, false, true);
      if (frontierOrigin) {
        state.selected = { x: wx, y: wy };
        resetAttackPreviewState(state);
        queueAdjacentExpandClaim(wx, wy);
        return;
      }
      openUnexploredTileActionMenu(state, wx, wy, clientX, clientY, { keyFor, pickOriginForTarget, renderTileActionMenu, resetAttackPreviewState });
      renderHud();
      return;
    }
    if (vis === "fogged") {
      state.selected = { x: wx, y: wy };
      resetAttackPreviewState(state);
      const isLand = clicked?.terrain === "LAND";
      const isNeutral = !clicked?.ownerId;
      const frontierOrigin = isLand && isNeutral ? (pickOriginForTarget(wx, wy, false) ?? pickOriginForTarget(wx, wy, false, true)) : undefined;
      if (frontierOrigin) {
        queueAdjacentExpandClaim(wx, wy);
        return;
      }
      if (clicked) openSingleTileActionMenu(clicked, clientX, clientY);
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
    // Enable via localStorage.setItem("tile-sync-debug", "1") in the
    // browser console, then click a tile -- prints what the click decided.
    if (tileSyncDebugEnabled()) {
      console.log("[tile-click]", {
        x: to.x,
        y: to.y,
        ownerId: to.ownerId ?? null,
        terrain: to.terrain,
        fogged: Boolean(to.fogged),
        hasFrontierOrigin: Boolean(frontierOrigin),
        targetInReach: isTargetInLocalReach(to.x, to.y),
        clickOutcome
      });
    }
    if (clickOutcome === "queue-adjacent-neutral") {
      // Re-clicking a tile that's already sitting in the action queue
      // behind the active capture, or a tile that's ALREADY the active
      // capture, must open its progress/cancel/rush-buy/jump-to-front
      // detail, not re-run the afford/enqueue gate below — gold for an
      // active claim was already spent (a since-drained wallet must never
      // block re-viewing it), and enqueueTarget silently no-ops on an
      // already-queued target, which would otherwise leave the click with
      // no menu and no feedback. (queueAdjacentExpandClaim handles this.)
      queueAdjacentExpandClaim(to.x, to.y);
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
    reconcileActionQueue, processPendingMusterAttacks,
    requestSettlement,
    sendDevelopmentBuild,
    processAutoSettleTargets,
    processAutoBuildTargets,
    processDevelopmentQueue,
    processActionQueue,
    applyCombatOutcomeMessage,
    requestAttackPreviewForHover,
    requestAttackPreviewForTarget,
    attackPreviewDetailForTarget,
    attackPreviewPendingForTarget,
    attackPreviewManpowerCostForTarget,
    buildFortOnSelected,
    settleSelected,
    buildSiegeOutpostOnSelected,
    uncaptureSelected,
    cancelOngoingCapture,
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
