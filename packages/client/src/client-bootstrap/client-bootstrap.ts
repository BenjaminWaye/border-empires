import { createClientAuthFlow } from "../client-auth-flow/client-auth-flow.js";
import { createClientActionFlow } from "../client-action-flow.js";
import {
  drawStartingExpansionArrow as drawStartingExpansionArrowFromModule,
  renderCaptureProgress as renderCaptureProgressFromModule,
  renderShardAlert as renderShardAlertFromModule,
  settlePixelWanderPoint as settlePixelWanderPointFromModule
} from "../client-capture-effects/client-capture-effects.js";
import { bindClientMapInput } from "../client-map-input/client-map-input.js";
import { bindClientNetwork } from "../client-network/client-network.js";
import { renderClientHud, resizeClientViewport } from "../client-hud/client-hud.js";
import { bindClientUiControls } from "../client-ui-controls/client-ui-controls.js";
import { createClientThreeTerrainRenderer } from "../client-map-3d/client-map-3d.js";
import { createBootstrapDownloadHelpers } from "../client-bootstrap-download-helpers/client-bootstrap-download-helpers.js";
import {
  prefersTrue3DRendererMode,
  setTrue3DRendererActive
} from "../client-renderer-mode.js";
import { startClientRuntimeLoop } from "../client-runtime-loop.js";
import { mountRallyInvitePanel, mountRallyNewPanel } from "../client-rally-links/client-rally-links.js";
import { mountGalaxyView } from "../client-galaxy-view/client-galaxy-view.js";

type BootstrapDeps = Record<string, any>;

export const bootstrapClientApp = (deps: BootstrapDeps): void => {
  const {
    state,
    dom,
    miniMapReplayEl,
    ws,
    wsUrl,
    firebaseAuth,
    googleProvider,
    storageSet,
    visibleCollectSummary,
    isMobile,
    rateToneClass,
    formatGoldAmount,
    formatManpowerAmount,
    strategicRibbonHtml,
    openEconomyPanel,
    setActivePanel,
    mobileNavLabelHtml,
    keyFor,
    parseKey,
    selectedTile,
    techFlow,
    domainOwnedHtml,
    techOwnedHtml,
    techCurrentModsHtml,
    bindTechTreeDragScroll,
    alliesHtml,
    activeTrucesHtml,
    allianceRequestsHtml,
    truceRequestsHtml,
    renderSocialInspectCardHtml,
    missionCardsHtml,
    playerNameForOwner,
    wrapX,
    wrapY,
    terrainAt,
    pushFeed,
    pushFeedEntry,
    requestViewRefresh,
    prettyToken,
    resourceIconForKey,
    resourceLabel,
    economicStructureName,
    leaderboardHtml,
    feedHtml,
    renderMobilePanels,
    renderManpowerPanelHtml,
    viewportSize,
    drawMiniMap,
    maybeRefreshForCamera,
    shouldPreserveOptimisticExpandByKey,
    drawTerrainTile,
    drawForestOverlay,
    effectiveOverlayColor,
    overlayVariantIndexAt,
    dockOverlayVariants,
    drawCenteredOverlay,
    builtResourceOverlayForTile,
    resourceOverlayForTile,
    economicStructureOverlayAlpha,
    drawCenteredOverlayWithAlpha,
    resourceOverlayScaleForTile,
    drawResourceCornerMarker,
    drawRoadOverlay,
    fortificationOverlayImageFor,
    resourceColor,
    shardOverlayForTile,
    drawShardFallback,
    drawTownOverlay,
    drawTownMarker,
    drawDockMarker,
    hasCollectableYield,
    structureAccentColor,
    structureOverlayImages,
    shouldDrawOwnershipBorder,
    borderColorForOwner,
    borderLineWidthForOwner,
    originSelection,
    worldToScreen,
    isDockRouteVisibleForPlayer,
    computeDockSeaRoute,
    toroidDelta,
    drawAetherBridgeLane,
    clearOptimisticTileState,
    mergeIncomingTileDetail,
    mergeServerTileWithOptimisticState,
    maybeAnnounceShardSite,
    markDockDiscovered,
    centerOnOwnedTile,
    defensibilityPctFromTE,
    clearPendingCollectVisibleDelta,
    seedProfileSetupFields: seedProfileSetupFieldsFromMain,
    resetStrategicReplayState,
    setWorldSeed,
    clearRenderCaches,
    buildMiniMapBase,
    shardAlertKeyForPayload,
    showShardAlert,
    combatResolutionAlert,
    wasPredictedCombatAlreadyShown,
    showCaptureAlert,
    notifyInsufficientGoldForFrontierAction,
    clearPendingCollectTileDelta,
    revertOptimisticVisibleCollectDelta,
    revertOptimisticTileCollectDelta,
    applyOptimisticVisibleCollect,
    applyOptimisticTileCollect,
    applyOptimisticTileState,
    applyOptimisticStructureBuild,
    applyOptimisticStructureCancel,
    ownerSpawnShieldActive,
    supportedOwnedTownsForTile,
    supportedOwnedDocksForTile,
    townHasSupportStructure,
    growthModifierPercentLabel,
    structureGoldCost,
    structureCostText,
    busyDevelopmentProcessCount,
    populationPerMinuteLabel,
    townNextGrowthEtaLabel,
    tileVisibilityStateAt,
    techPickEl,
    mobileTechPickEl,
    canvas,
    tileActionMenuEl,
    authColorPresetButtons,
    authProfileColorEl,
    authEmailEl,
    authEmailLinkBtn,
    authProfileNameEl,
    authProfileSaveBtn,
    allianceSendBtn,
    mobileAllianceSendBtn,
    allianceTargetEl,
    mobileAllianceTargetEl,
    techChooseBtn,
    mobileTechChooseBtn,
    centerMeBtn,
    centerMeDesktopBtn,
    collectVisibleDesktopBtn,
    collectVisibleMobileBtn,
    captureCancelBtn,
    captureCloseBtn,
    captureTimeEl,
    shardAlertCloseBtn,
    panelCloseBtn,
    panelActionButtons,
    miniMapEl,
    ctx,
    initTerrainTextures
  } = deps;

  let renderHudImpl = (): void => {};
  let requireAuthedSessionImpl = (_message?: string): boolean => false;

  const authFlow = createClientAuthFlow({
    state,
    dom,
    firebaseAuth,
    googleProvider,
    ws,
    wsUrl,
    requireAuthedSession: (message?: string) => requireAuthedSessionImpl(message),
    renderHud: () => renderHudImpl(),
    isMobile
  });

  const { setAuthStatus, syncAuthPanelState, syncAuthOverlay, seedProfileSetupFields, authenticateSocket } = authFlow;
  [mountRallyNewPanel, mountRallyInvitePanel, mountGalaxyView].forEach((mount) => mount({ firebaseAuth, wsUrl }));

  const requireAuthedSession = (message = "Finish sign-in before interacting with the map."): boolean => {
    if (ws.readyState !== ws.OPEN) {
      setAuthStatus(`Game server unavailable at ${wsUrl}.`, "error");
      syncAuthOverlay();
      return false;
    }
    if (state.authSessionReady) return true;
    setAuthStatus(message, "error");
    syncAuthOverlay();
    return false;
  };
  requireAuthedSessionImpl = requireAuthedSession;

  let threeTerrainRenderer:
    | ReturnType<typeof createClientThreeTerrainRenderer>
    | undefined;
  // The true-3D renderer is the default. Pass `?renderer=2d` to fall back
  // to the flat canvas renderer (e.g. for low-end devices or debugging).
  const shouldUseThreeTerrainRenderer = prefersTrue3DRendererMode;
  const ensureThreeTerrainRenderer = (): void => {
    if (!shouldUseThreeTerrainRenderer) return;
    if (!state.authSessionReady) return;
    if (threeTerrainRenderer) return;
    try {
      threeTerrainRenderer = createClientThreeTerrainRenderer({
        state,
        canvas,
        keyFor,
        wrapX,
        wrapY,
        terrainAt,
        effectiveOverlayColor,
        tileVisibilityStateAt,
        settlementProgressForTile: actionFlow.settlementProgressForTile,
        isPlacementValidForTile: actionFlow.isPlacementValidForTile
      });
      setTrue3DRendererActive(true);
    } catch (error) {
      console.error("[renderer-3d-init-failed]", error);
      setTrue3DRendererActive(false);
    }
  };
  if (!shouldUseThreeTerrainRenderer) {
    setTrue3DRendererActive(false);
  }

  const worldTileRawFromPointer = (offsetX: number, offsetY: number): { gx: number; gy: number } =>
    threeTerrainRenderer?.worldTileRawFromPointer(offsetX, offsetY) ?? deps.worldTileRawFromPointerFromModule(state, canvas, offsetX, offsetY);
  const projectedWorldToScreen = (wx: number, wy: number, size: number, halfW: number, halfH: number): { sx: number; sy: number } =>
    threeTerrainRenderer?.worldToScreen(wx, wy) ?? worldToScreen(wx, wy, size, halfW, halfH);

  const computeDragPreview = (): void =>
    deps.computeDragPreviewFromModule({ state, canvas, wrapX, wrapY, keyFor, hasCollectableYield });

  const actionFlow = createClientActionFlow({
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
    isAdjacent: originSelection.isAdjacent,
    pickOriginForTarget: originSelection.pickOriginForTarget,
    setAuthStatus,
    syncAuthOverlay,
    pushFeed,
    renderHud: () => renderHudImpl(),
    requestViewRefresh,
    selectedTile,
    applyOptimisticTileState,
    clearOptimisticTileState,
    applyOptimisticStructureBuild,
    applyOptimisticStructureCancel,
    mergeServerTileWithOptimisticState,
    playerNameForOwner,
    ownerSpawnShieldActive,
    hasCollectableYield,
    worldTileRawFromPointer,
    computeDragPreview,
    showCaptureAlert,
    showCollectVisibleCooldownAlert: deps.showCollectVisibleCooldownAlert,
    notifyInsufficientGoldForFrontierAction,
    isMobile,
    supportedOwnedTownsForTile,
    supportedOwnedDocksForTile,
    townHasSupportStructure,
    prettyToken,
    terrainLabel: deps.terrainLabel,
    displayTownGoldPerMinute: deps.displayTownGoldPerMinute,
    tileHistoryLines: deps.tileHistoryLines,
    growthModifierPercentLabel,
    structureGoldCost,
    structureCostText,
    busyDevelopmentProcessCount,
    wasPredictedCombatAlreadyShown,
    combatResolutionAlert,
    applyOptimisticVisibleCollect,
    applyOptimisticTileCollect,
    economicStructureName,
    populationPerMinuteLabel,
    townNextGrowthEtaLabel,
    tileVisibilityStateAt,
    placementOverlayEl: dom.placementOverlayEl,
    placementLabelEl: dom.placementLabelEl
  });

  const renderCaptureProgress = (): void =>
    renderCaptureProgressFromModule(state, {
      keyFor,
      formatCooldownShort: actionFlow.formatCooldownShort,
      showCaptureAlert,
      pushFeed,
      finalizePredictedCombat: (result) => actionFlow.applyCombatOutcomeMessage(result, { predicted: true }),
      captureCardEl: dom.captureCardEl,
      captureWrapEl: dom.captureWrapEl,
      captureCancelBtn: dom.captureCancelBtn,
      captureCloseBtn: dom.captureCloseBtn,
      captureDownloadDebugBtn: dom.captureDownloadDebugBtn,
      captureBarEl: dom.captureBarEl,
      captureTitleEl: dom.captureTitleEl,
      captureTimeEl: dom.captureTimeEl,
      captureTargetEl: dom.captureTargetEl
    });

  const { downloadDebugBundle, downloadRespawnReportForNotice } = createBootstrapDownloadHelpers({ state, wsUrl });

  const renderShardAlert = (): void =>
    renderShardAlertFromModule(state, {
      shardAlertOverlayEl: dom.shardAlertOverlayEl,
      shardAlertTitleEl: dom.shardAlertTitleEl,
      shardAlertDetailEl: dom.shardAlertDetailEl
    });

  const drawStartingExpansionArrow = (px: number, py: number, size: number, dx: number, dy: number): void =>
    drawStartingExpansionArrowFromModule(ctx, px, py, size, dx, dy);

  const renderHud = (): void => {
    try {
      ensureThreeTerrainRenderer();
      renderClientHud({
        state,
        dom,
      miniMapReplayEl,
      wsUrl,
      firebaseAuth,
      syncAuthOverlay,
      storageSet,
      visibleCollectSummary,
      developmentSlotSummary: actionFlow.developmentSlotSummary,
      isMobile,
      rateToneClass,
      formatGoldAmount,
      formatManpowerAmount,
      strategicRibbonHtml,
      formatCooldownShort: actionFlow.formatCooldownShort,
      openEconomyPanel,
      setActivePanel,
      affordableTechChoicesCount: techFlow.affordableTechChoicesCount,
      mobileNavLabelHtml,
      crystalTargetingTone: actionFlow.crystalTargetingTone,
      crystalTargetingTitle: actionFlow.crystalTargetingTitle,
      clearCrystalTargeting: actionFlow.clearCrystalTargeting,
      keyFor,
      parseKey,
      selectedTile,
      requestTileDetailIfNeeded: actionFlow.requestTileDetailIfNeeded,
      renderTileActionMenu: actionFlow.renderTileActionMenu,
      tileMenuViewForTile: actionFlow.tileMenuViewForTile,
      renderCaptureProgress,
      renderShardAlert,
      renderTechChoiceGrid: techFlow.renderTechChoiceGrid,
      techDetailsUseOverlay: techFlow.techDetailsUseOverlay,
      renderTechDetailPrompt: techFlow.renderTechDetailPrompt,
      renderTechDetailCard: techFlow.renderTechDetailCard,
      renderStructureInfoOverlay: techFlow.renderStructureInfoOverlay,
      renderTechDetailOverlay: techFlow.renderTechDetailOverlay,
      renderDomainDetailOverlay: techFlow.renderDomainDetailOverlay,
      techOwnedHtml,
      effectiveOwnedTechIds: techFlow.effectiveOwnedTechIds,
      isPendingTechUnlock: techFlow.isPendingTechUnlock,
      renderTechChoiceDetails: techFlow.renderTechChoiceDetails,
      techCurrentModsHtml,
      bindTechTreeDragScroll,
      chooseTech: actionFlow.chooseTech,
      chooseDomain: actionFlow.chooseDomain,
      renderDomainProgressCard: techFlow.renderDomainProgressCard,
      renderDomainChoiceGrid: techFlow.renderDomainChoiceGrid,
      domainOwnedHtml,
      renderDomainDetailCard: techFlow.renderDomainDetailCard,
      sendGameMessage: actionFlow.sendGameMessage,
      alliesHtml,
      activeTrucesHtml,
      allianceRequestsHtml,
      truceRequestsHtml,
      renderSocialInspectCardHtml,
      missionCardsHtml,
      playerNameForOwner,
      wrapX,
      wrapY,
      terrainAt,
      pushFeed,
      requestViewRefresh,
      prettyToken,
      resourceIconForKey,
      resourceLabel,
      economicStructureName,
      leaderboardHtml,
      feedHtml,
      renderMobilePanels,
        effectiveTechChoices: techFlow.effectiveTechChoices,
        renderManpowerPanelHtml,
        centerOnOwnedTile,
        downloadRespawnBugReport: downloadRespawnReportForNotice,
        retryBootstrapNow: () => {
          void authenticateSocket(true).catch(() => {});
        }
      });
    } catch (error) {
      console.error("[hud-render-fatal]", error);
      setAuthStatus("The interface hit an unexpected error. Retrying UI render...", "error");
      try { syncAuthOverlay(); } catch (overlayError) { console.error("[hud-render-fatal-overlay]", overlayError); }
    }
  };
  renderHudImpl = renderHud;

  const resize = (): void => {
    ensureThreeTerrainRenderer();
    resizeClientViewport({ dom: { canvas }, viewportSize });
    threeTerrainRenderer?.resize();
  };
  window.addEventListener("resize", resize);
  window.visualViewport?.addEventListener("resize", resize);
  resize();
  authFlow.bindAuthUi();

  bindClientUiControls({
    state,
    hud: dom.hud,
    allianceSendBtn,
    mobileAllianceSendBtn,
    allianceTargetEl,
    mobileAllianceTargetEl,
    techChooseBtn,
    mobileTechChooseBtn,
    techPickEl,
    mobileTechPickEl,
    centerMeBtn,
    centerMeDesktopBtn,
    collectVisibleDesktopBtn,
    collectVisibleMobileBtn,
    captureCancelBtn,
    captureCloseBtn,
    captureDownloadDebugBtn: dom.captureDownloadDebugBtn,
    captureTimeEl,
    placementCancelBtn: dom.placementCancelBtn,
    placementConfirmBtn: dom.placementConfirmBtn,
    shardAlertCloseBtn,
    panelCloseBtn,
    panelActionButtons,
    authColorPresetButtons,
    authProfileColorEl,
    authEmailEl,
    authEmailLinkBtn,
    authProfileNameEl,
    authProfileSaveBtn,
    sendAllianceRequest: actionFlow.sendAllianceRequest,
    chooseTech: actionFlow.chooseTech,
    chooseDomain: actionFlow.chooseDomain,
    renderHud,
    centerOnOwnedTile,
    requestViewRefresh,
    collectVisibleYield: actionFlow.collectVisibleYield,
    cancelOngoingCapture: actionFlow.cancelOngoingCapture,
    confirmBuildingPlacement: actionFlow.confirmBuildingPlacement,
    cancelBuildingPlacement: actionFlow.cancelBuildingPlacement,
    hideShardAlert: deps.hideShardAlert,
    renderShardAlert,
    renderCaptureProgress,
    downloadDebugBundle,
    setActivePanel,
    syncAuthPanelState
  });

  bindClientNetwork({
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
    applyOptimisticTileState,
    requestViewRefresh,
    applyPendingSettlementsFromServer: actionFlow.applyPendingSettlementsFromServer,
    mergeIncomingTileDetail,
    mergeServerTileWithOptimisticState,
    maybeAnnounceShardSite,
    markDockDiscovered,
    centerOnOwnedTile,
    authProfileNameEl,
    authProfileColorEl,
    defensibilityPctFromTE: techFlow.defensibilityPctFromTE,
    clearPendingCollectVisibleDelta,
    seedProfileSetupFields: seedProfileSetupFieldsFromMain ?? seedProfileSetupFields,
    resetStrategicReplayState,
    setWorldSeed,
    clearRenderCaches,
    buildMiniMapBase,
    shardAlertKeyForPayload,
    showShardAlert,
    combatResolutionAlert,
    wasPredictedCombatAlreadyShown,
    showCaptureAlert,
    requestSettlement: actionFlow.requestSettlement,
    dropQueuedTargetKeyIfAbsent: actionFlow.dropQueuedTargetKeyIfAbsent,
    processActionQueue: actionFlow.processActionQueue,
    clearSettlementProgressForTile: actionFlow.clearSettlementProgressForTile,
    terrainAt,
    requestTileDetailIfNeeded: actionFlow.requestTileDetailIfNeeded,
    requestAttackPreviewForTarget: actionFlow.requestAttackPreviewForTarget,
    openSingleTileActionMenu: actionFlow.openSingleTileActionMenu,
    isTileOwnedByAlly: actionFlow.isTileOwnedByAlly,
    hideShardAlert: deps.hideShardAlert,
    explainActionFailure: actionFlow.explainActionFailure,
    notifyInsufficientGoldForFrontierAction,
    clearSettlementProgressByKey: actionFlow.clearSettlementProgressByKey,
    showCollectVisibleCooldownAlert: deps.showCollectVisibleCooldownAlert,
    formatCooldownShort: actionFlow.formatCooldownShort,
    reconcileActionQueue: actionFlow.reconcileActionQueue,
    revertOptimisticVisibleCollectDelta,
    revertOptimisticTileCollectDelta,
    clearPendingCollectTileDelta,
    playerNameForOwner,
    settlementProgressForTile: actionFlow.settlementProgressForTile,
    COLLECT_VISIBLE_COOLDOWN_MS: deps.COLLECT_VISIBLE_COOLDOWN_MS,
    shouldResetFrontierActionStateForError: actionFlow.shouldResetFrontierActionStateForError
  });

  authFlow.bindFirebaseAuth();

  startClientRuntimeLoop(state, {
    canvas,
    ctx,
    initTerrainTextures,
    isMobile,
    keyFor,
    wrapX,
    wrapY,
    parseKey,
    selectedTile,
    aetherWallDirectionTargetTiles: actionFlow.aetherWallDirectionTargetTiles,
    settlementProgressForTile: actionFlow.settlementProgressForTile,
    tileVisibilityStateAt,
    crystalTargetingTone: actionFlow.crystalTargetingTone,
    startingExpansionArrowTargets: originSelection.startingExpansionArrowTargets,
    drawTerrainTile,
    drawForestOverlay,
    effectiveOverlayColor,
    overlayVariantIndexAt,
    // The 3D dock overlay supersedes the SVG dock icons when the true-3D
    // renderer is mounted, so route to an empty variant array to skip
    // the 2D draws (the runtime loop guards on element presence).
    dockOverlayVariants: shouldUseThreeTerrainRenderer ? [] : dockOverlayVariants,
    drawCenteredOverlay,
    builtResourceOverlayForTile,
    resourceOverlayForTile,
    economicStructureOverlayAlpha,
    drawCenteredOverlayWithAlpha,
    resourceOverlayScaleForTile,
    drawResourceCornerMarker,
    drawRoadOverlay,
    fortificationOverlayImageFor,
    resourceColor,
    shardOverlayForTile,
    drawShardFallback,
    // In 3D mode, draw only the town corner badge (gold coin) — the
    // building itself is rendered by the 3D town overlay. In 2D mode,
    // draw the full SVG building + corner badge as before.
    drawTownOverlay: (tile, px, py, size) => {
      if (threeTerrainRenderer) {
        if (tile.town) drawTownMarker(px, py, size);
        return;
      }
      drawTownOverlay(tile, px, py, size);
    },
    drawDockMarker,
    hasCollectableYield,
    structureAccentColor,
    structureOverlayImages,
    constructionRemainingMsForTile: actionFlow.constructionRemainingMsForTile,
    formatCountdownClock: actionFlow.formatCountdownClock,
    drawStartingExpansionArrow,
    drawBarbarianSkullOverlay: deps.drawBarbarianSkullOverlay,
    shouldDrawOwnershipBorder,
    borderColorForOwner,
    isTileOwnedByAlly: actionFlow.isTileOwnedByAlly,
    borderLineWidthForOwner,
    isTownSupportNeighbor: originSelection.isTownSupportNeighbor,
    isTownSupportHighlightableTile: originSelection.isTownSupportHighlightableTile,
    drawIncomingAttackOverlay: deps.drawIncomingAttackOverlay,
    settlePixelWanderPoint: settlePixelWanderPointFromModule,
    worldToScreen: projectedWorldToScreen,
    isDockRouteVisibleForPlayer,
    computeDockSeaRoute,
    toroidDelta,
    drawAetherBridgeLane,
    drawAetherWallSegment: deps.drawAetherWallSegment,
    drawMiniMap,
    maybeRefreshForCamera,
    requestTileDetailIfNeeded: actionFlow.requestTileDetailIfNeeded,
    renderHud,
    renderCaptureProgress,
    renderShardAlert,
    cleanupExpiredSettlementProgress: actionFlow.cleanupExpiredSettlementProgress,
    processDevelopmentQueue: actionFlow.processDevelopmentQueue,
    clearOptimisticTileState,
    dropQueuedTargetKeyIfAbsent: actionFlow.dropQueuedTargetKeyIfAbsent,
    pushFeed,
    showCaptureAlert,
    processActionQueue: actionFlow.processActionQueue,
    shouldPreserveOptimisticExpandByKey,
    requestViewRefresh,
    reconcileActionQueue: actionFlow.reconcileActionQueue,
    sendDeferredAttack: (fromX, fromY, toX, toY, commandId, clientSeq) =>
      ws.send(JSON.stringify({ type: "ATTACK", fromX, fromY, toX, toY, commandId, clientSeq })),
    isPlacementValidForTile: actionFlow.isPlacementValidForTile
  });

  bindClientMapInput(state, {
    canvas,
    miniMapEl,
    tileActionMenuEl,
    wrapX,
    wrapY,
    keyFor,
    worldTileRawFromPointer,
    computeDragPreview,
    requestViewRefresh,
    maybeRefreshForCamera,
    handleTileSelection: actionFlow.handleTileSelection,
    cancelOngoingCapture: actionFlow.cancelOngoingCapture,
    hideTileActionMenu: actionFlow.hideTileActionMenu,
    clearCrystalTargeting: actionFlow.clearCrystalTargeting,
    cancelBuildingPlacement: actionFlow.cancelBuildingPlacement,
    renderMobilePanels,
    queueSpecificTargets: actionFlow.queueSpecificTargets,
    processActionQueue: actionFlow.processActionQueue,
    pushFeed,
    openBulkTileActionMenu: actionFlow.openBulkTileActionMenu,
    isTileOwnedByAlly: actionFlow.isTileOwnedByAlly,
    requestAttackPreviewForHover: actionFlow.requestAttackPreviewForHover,
    requestAttackPreviewForTarget: actionFlow.requestAttackPreviewForTarget,
    interactionFlags: actionFlow.mapInteractionFlags
  });

  // Paint the HUD/auth shell immediately instead of waiting for async auth/socket callbacks.
  renderHud();

  // Debug: force the season-end overlay visible from the browser console.
  // Usage: __debugSeasonEndOverlay()
  (window as unknown as Record<string, unknown>).__debugSeasonEndOverlay = () => {
    const winner: import("../client-types.js").SeasonWinnerView = {
      playerId: "player-1",
      playerName: "Debug Winner",
      crownedAt: Date.now(),
      objectiveId: "TOWN_CONTROL",
      objectiveName: "Debug Win"
    };
    const victory: import("../client-types.js").SeasonVictoryObjectiveView[] = [
      {
        id: "TOWN_CONTROL",
        name: "Town Control",
        description: "Hold 50% of towns.",
        leaderPlayerId: "player-1",
        leaderName: "Debug Winner",
        progressLabel: "20/87 towns",
        thresholdLabel: "Need 87 towns",
        holdDurationSeconds: 86400,
        statusLabel: "Pressure building",
        conditionMet: false,
        selfProgressLabel: "12/87 towns"
      },
      {
        id: "ECONOMIC_HEGEMONY",
        name: "Economic Dominance",
        description: "Reach 500 gold/min income.",
        leaderPlayerId: "player-2",
        leaderName: "Rival",
        progressLabel: "420/min",
        thresholdLabel: "500/min",
        holdDurationSeconds: 86400,
        statusLabel: "Challenging",
        conditionMet: false,
        selfProgressLabel: "180/min"
      }
    ];
    const lbOverall: import("../client-types.js").LeaderboardOverallEntry[] = [
      { id: "p1", rank: 1, name: "Alpha", score: 9450.5, tiles: 87, incomePerMinute: 420, techs: 24 },
      { id: "p2", rank: 2, name: "Beta", score: 8120.3, tiles: 64, incomePerMinute: 380, techs: 21 },
      { id: "p3", rank: 3, name: "Gamma", score: 6700.1, tiles: 55, incomePerMinute: 310, techs: 18 },
      { id: "p4", rank: 4, name: "Delta", score: 5230, tiles: 48, incomePerMinute: 260, techs: 15 },
      { id: "p5", rank: 5, name: "Epsilon", score: 4100, tiles: 42, incomePerMinute: 220, techs: 13 }
    ];
    state.seasonWinner = winner;
    state.seasonEndDismissed = false;
    state.seasonVictory = victory;
    state.leaderboard = {
      overall: lbOverall,
      selfOverall: { id: "player-1", rank: 6, name: "Debug Winner", score: 3200, tiles: 35, incomePerMinute: 180, techs: 10 },
      selfByTiles: undefined,
      selfByIncome: undefined,
      selfByTechs: undefined,
      byTiles: [],
      byIncome: [],
      byTechs: []
    };
    state.playerColors = new Map([
      ["p1", "#e74c3c"],
      ["p2", "#3498db"],
      ["p3", "#2ecc71"],
      ["p4", "#f39c12"],
      ["p5", "#9b59b6"],
      ["player-1", "#1abc9c"]
    ]);
    renderHud();
  };
};
