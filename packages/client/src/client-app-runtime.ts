import {
  ECONOMIC_STRUCTURE_BUILD_MS,
  FORT_BUILD_MS,
  FORT_DEFENSE_MULT,
  FRONTIER_CLAIM_COST,
  FRONTIER_CLAIM_MS,
  LIGHT_OUTPOST_ATTACK_MULT,
  LIGHT_OUTPOST_BUILD_MS,
  OBSERVATORY_BUILD_MS,
  SETTLE_COST,
  SETTLE_MS,
  SIEGE_OUTPOST_ATTACK_MULT,
  SIEGE_OUTPOST_BUILD_MS,
  WOODEN_FORT_BUILD_MS,
  WOODEN_FORT_DEFENSE_MULT,
  defensivenessMultiplier,
  grassShadeAt,
  setWorldSeed,
  terrainAt
} from "@border-empires/shared";
import {
  COLLECT_VISIBLE_COOLDOWN_MS,
  GUIDE_AUTO_OPEN_STORAGE_KEY,
  GUIDE_STORAGE_KEY,
  canAffordCost,
  formatGoldAmount,
  frontierClaimCostLabelForTile,
  frontierClaimDurationMsForTile,
  guideSteps
} from "./client-constants.js";
import { exposedSidesForTile, renderDefensibilityPanelHtml } from "./client-defensibility-html.js";
import { bootstrapClientApp } from "./client-bootstrap.js";
import { createClientCollectSupport } from "./client-app-runtime-collect-support.js";
import { createClientRuntimeDisplaySupport } from "./client-app-runtime-display-support.js";
import {
  buildMiniMapBase as buildMiniMapBaseFromModule,
  computeDockSeaRoute as computeDockSeaRouteFromModule,
  isDockRouteVisibleForPlayer as isDockRouteVisibleForPlayerFromModule,
  markDockDiscovered as markDockDiscoveredFromModule
} from "./client-dock-routes.js";
import {
  computeDragPreview as computeDragPreviewFromModule,
  worldTileRawFromPointer as worldTileRawFromPointerFromModule
} from "./client-drag-selection.js";
import type { EconomyFocusKey } from "./client-economy-model.js";
import { renderEconomyPanelHtml } from "./client-economy-html.js";
import { createClientAppRuntimeDom } from "./client-app-runtime-dom.js";
import { createClientFirebaseSetup, createClientSocketSetup } from "./client-app-runtime-env.js";
import { createClientRuntimeFlowSupport } from "./client-app-runtime-flow-support.js";
import { createClientViewSupport } from "./client-app-runtime-view-support.js";
import { formatCooldownShort, formatManpowerAmount, FULL_MAP_CHUNK_RADIUS, keyForTile, parseTileKey, prettyToken, rateToneClass, wrapTileX, wrapTileY } from "./client-app-runtime-utils.js";
import { createClientMapFacade } from "./client-map-facade.js";
import { createClientMapMath } from "./client-map-math.js";
import { shouldHideCaptureOverlayAfterTimer, shouldPreserveOptimisticExpand } from "./client-frontier-overlay.js";
import { shouldFinalizePredictedCombat, wasPredictedCombatAlreadyShown } from "./client-predicted-combat.js";
import { showClientHoldBuildMenu } from "./client-ui-controls.js";
import { busyDevelopmentProcessCount } from "./client-development-queue.js";
import {
  hostileObservatoryProtectingTile as hostileObservatoryProtectingTileFromModule,
  isTileOwnedByAlly as isTileOwnedByAllyFromModule
} from "./client-tile-action-support.js";
import { renderManpowerPanelHtml, renderSocialInspectCardHtml } from "./client-side-panel-html.js";
import { formatRoughMinutes, populationPerMinuteLabel, townNextGrowthEtaLabel, townNextPopulationMilestone } from "./client-town-growth.js";
import { startClientRuntimeLoop } from "./client-runtime-loop.js";
import { activeTrucesHtml, allianceRequestsHtml, alliesHtml, feedHtml, leaderboardHtml, missionCardsHtml, strategicRibbonHtml, truceRequestsHtml } from "./client-panel-html.js";
import {
  economicStructureBenefitText,
  economicStructureBuildMs,
  economicStructureName,
  formatUpkeepSummary,
  formatYieldSummary,
  resourceColor,
  resourceIconForKey,
  resourceLabel,
  storedYieldSummary,
  strategicResourceKeyForTile,
  tileProductionHtml,
  tileUpkeepHtml
} from "./client-map-display.js";
import { drawMiniMap as drawMiniMapIntoCanvas } from "./client-minimap.js";
import { resolveOwnerColor } from "./client-owner-colors.js";
import {
  borderColorForOwner as borderColorForOwnerFromModule,
  borderLineWidthForOwner as borderLineWidthForOwnerFromModule,
  builtResourceOverlayForTile,
  dockOverlayVariants,
  drawAetherBridgeLane as drawAetherBridgeLaneOnCanvas,
  drawBarbarianSkullOverlay as drawBarbarianSkullOverlayOnCanvas,
  drawCenteredOverlay as drawCenteredOverlayOnCanvas,
  drawCenteredOverlayWithAlpha as drawCenteredOverlayWithAlphaOnCanvas,
  drawExposedTileBorder as drawExposedTileBorderOnCanvas,
  drawForestOverlay as drawForestOverlayOnCanvas,
  drawIncomingAttackOverlay as drawIncomingAttackOverlayOnCanvas,
  drawOwnershipSignature as drawOwnershipSignatureOnCanvas,
  drawResourceCornerMarker as drawResourceCornerMarkerOnCanvas,
  drawShardFallback as drawShardFallbackOnCanvas,
  drawTerrainTile as drawTerrainTileOnCanvas,
  drawTownOverlay as drawTownOverlayOnCanvas,
  economicStructureOverlayAlpha,
  effectiveOverlayColor as effectiveOverlayColorFromModule,
  initTerrainTextures,
  overlayVariantIndexAt,
  resourceOverlayForTile,
  resourceOverlayScaleForTile,
  shardOverlayForTile,
  shouldDrawOwnershipBorder as shouldDrawOwnershipBorderFromModule,
  structureAccentColor as structureAccentColorFromModule,
  structureOverlayImages
} from "./client-map-render.js";
import { createInitialState, storageSet } from "./client-state.js";
import { domainOwnedHtml, techCurrentModsHtml, techOwnedHtml } from "./client-tech-html.js";
import type {
  ActiveAetherBridgeView,
  ActiveTruceView,
  AllianceRequest,
  CrystalTargetingAbility,
  DockPair,
  DomainInfo,
  EmpireVisualStyle,
  LeaderboardMetricEntry,
  LeaderboardOverallEntry,
  MissionState,
  OptimisticStructureKind,
  SeasonVictoryObjectiveView,
  SeasonWinnerView,
  StrategicReplayEvent,
  TechInfo,
  Tile,
  TileActionDef,
  TileMenuProgressView,
  TileMenuTab,
  TileMenuView,
  TileOverviewLine,
  TileTimedProgress,
  TruceRequest
} from "./client-types.js";

const state = createInitialState();
const { dom, miniMapReplayEl } = createClientAppRuntimeDom(state);
const { firebaseAuth, googleProvider } = createClientFirebaseSetup();
const { ws, wsUrl } = createClientSocketSetup(state);

dom.miniMapBase.width = dom.miniMapEl.width;
dom.miniMapBase.height = dom.miniMapEl.height;
const miniMapBaseCtx = dom.miniMapBase.getContext("2d");
if (!miniMapBaseCtx) throw new Error("missing minimap base context");

const key = keyForTile, parseKey = parseTileKey, wrapX = wrapTileX, wrapY = wrapTileY;
const isTileOwnedByAlly = (tile: Tile): boolean => isTileOwnedByAllyFromModule(tile, state);
const hostileObservatoryProtectingTile = (tile: Tile): Tile | undefined =>
  hostileObservatoryProtectingTileFromModule(state, tile);
const {
  clearRenderCaches,
  tileVisibilityStateAt,
  ownerSpawnShieldActive,
  playerNameForOwner,
  effectiveOverlayColor,
  borderColorForOwner,
  shouldDrawOwnershipBorder,
  borderLineWidthForOwner,
  structureAccentColor,
  drawAetherBridgeLane,
  drawAetherWallSegment,
  drawTerrainTile,
  drawForestOverlay,
  drawBarbarianSkullOverlay,
  drawIncomingAttackOverlay,
  drawTownOverlay,
  drawCenteredOverlay,
  drawCenteredOverlayWithAlpha,
  drawResourceCornerMarker,
  drawRoadOverlay,
  fortificationOverlayImageFor,
  drawExposedTileBorder,
  drawShardFallback,
  computeDockSeaRoute,
  markDockDiscovered,
  isDockRouteVisibleForPlayer,
  buildMiniMapBase,
  resetStrategicReplayState,
  drawMiniMap
} = createClientMapFacade({
  state,
  ctx: dom.ctx,
  canvas: dom.canvas,
  miniMapEl: dom.miniMapEl,
  miniMapCtx: dom.miniMapCtx,
  miniMapBase: dom.miniMapBase,
  miniMapBaseCtx,
  keyFor: key,
  parseKey,
  terrainAt,
  wrapX,
  wrapY,
  resourceColor,
  hasCollectableYield: (tile) => hasCollectableYield(tile)
});
const { ownedSpecialSiteCount, wrappedTileDistance, toroidDelta, worldToScreen, manhattanToroid } = createClientMapMath({ state });

const {
  hasCollectableYield,
  visibleCollectSummary,
  clearPendingCollectVisibleDelta,
  clearPendingCollectTileDelta,
  revertOptimisticVisibleCollectDelta,
  revertOptimisticTileCollectDelta,
  applyOptimisticVisibleCollect,
  applyOptimisticTileCollect
} = createClientCollectSupport({
  state,
  tileVisibilityStateAt,
  keyFor: key
});

const {
  pushFeed,
  pushFeedEntry,
  maybeAnnounceShardSite,
  shardAlertKeyForPayload,
  showShardAlert,
  hideShardAlert,
  showCaptureAlert,
  notifyInsufficientGoldForFrontierAction,
  showCollectVisibleCooldownAlert,
  centerOnOwnedTile,
  requestViewRefresh,
  maybeRefreshForCamera,
  isMobile,
  mobileNavLabelHtml,
  viewportSize,
  renderMobilePanels,
  setActivePanel,
  bindTechTreeDragScroll
} = createClientViewSupport({
  state,
  dom,
  ws,
  fullMapChunkRadius: FULL_MAP_CHUNK_RADIUS,
  formatCooldownShort
});

const openEconomyPanel = (focus: EconomyFocusKey = "ALL"): void => {
  state.economyFocus = focus;
  setActivePanel("economy");
};
const { structureGoldCost, structureCostText, structureInfoForKey, structureInfoButtonHtml, terrainLabel } =
  createClientRuntimeDisplaySupport({
    state,
    formatCooldownShort,
    prettyToken
  });
const {
  optimistic,
  originSelection,
  inspectionFlow,
  techFlow
} = createClientRuntimeFlowSupport({
  state,
  keyFor: key,
  dom,
  wrapX,
  wrapY,
  terrainAt,
  tileVisibilityStateAt,
  prettyToken,
  playerNameForOwner,
  terrainLabel,
  resourceLabel,
  viewportSize,
  isMobile,
  formatCooldownShort,
  structureInfoForKey,
  structureInfoButtonHtml
});
const {
  selectedTile,
  applyOptimisticTileState,
  clearOptimisticTileState,
  applyOptimisticStructureBuild,
  applyOptimisticStructureRemoval,
  applyOptimisticStructureCancel,
  shouldPreserveOptimisticExpandByKey,
  mergeServerTileWithOptimisticState,
  mergeIncomingTileDetail
} = optimistic;
const {
  isTownSupportNeighbor,
  isTownSupportHighlightableTile,
  supportedOwnedTownsForTile,
  townHasSupportStructure,
  supportedOwnedDocksForTile,
  hoverTile,
  isAdjacent,
  isAdjacentCardinal,
  dockDestinationsFor,
  pickDockOriginForTarget,
  pickOriginForTarget,
  startingExpansionArrowTargets
} = originSelection;
const {
  tileHistoryLines,
  displayTownGoldPerMinute,
  growthModifierPercentLabel,
  combatResolutionAlert
} = inspectionFlow;
const {
  effectiveOwnedTechIds,
  effectiveTechChoices,
  isPendingTechUnlock,
  renderTechChoiceGrid,
  renderTechDetailPrompt,
  renderTechDetailCard,
  renderStructureInfoOverlay,
  techDetailsUseOverlay,
  renderDomainChoiceGrid,
  renderDomainProgressCard,
  renderTechDetailOverlay,
  renderDomainDetailCard,
  renderTechChoiceDetails,
  affordableTechChoicesCount
} = techFlow;

// HUD and auth flow are wired below after socket setup.
bootstrapClientApp({
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
  keyFor: key,
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
  hasCollectableYield,
  structureAccentColor,
  structureOverlayImages,
  shouldDrawOwnershipBorder,
  borderColorForOwner,
  borderLineWidthForOwner,
  drawExposedTileBorder,
  originSelection,
  worldToScreen,
  isDockRouteVisibleForPlayer,
  computeDockSeaRoute,
  toroidDelta,
  drawAetherBridgeLane,
  drawAetherWallSegment,
  clearOptimisticTileState,
  mergeIncomingTileDetail,
  mergeServerTileWithOptimisticState,
  maybeAnnounceShardSite,
  markDockDiscovered,
  centerOnOwnedTile,
  clearPendingCollectVisibleDelta,
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
  applyOptimisticStructureRemoval,
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
  techPickEl: dom.techPickEl,
  mobileTechPickEl: dom.mobileTechPickEl,
  canvas: dom.canvas,
  holdBuildMenuEl: dom.holdBuildMenuEl,
  tileActionMenuEl: dom.tileActionMenuEl,
  authColorPresetButtons: dom.authColorPresetButtons,
  authProfileColorEl: dom.authProfileColorEl,
  authEmailEl: dom.authEmailEl,
  authEmailLinkBtn: dom.authEmailLinkBtn,
  authProfileNameEl: dom.authProfileNameEl,
  authProfileSaveBtn: dom.authProfileSaveBtn,
  allianceSendBtn: dom.allianceSendBtn,
  mobileAllianceSendBtn: dom.mobileAllianceSendBtn,
  allianceBreakBtn: dom.allianceBreakBtn,
  mobileAllianceBreakBtn: dom.mobileAllianceBreakBtn,
  allianceTargetEl: dom.allianceTargetEl,
  mobileAllianceTargetEl: dom.mobileAllianceTargetEl,
  allianceBreakIdEl: dom.allianceBreakIdEl,
  mobileAllianceBreakIdEl: dom.mobileAllianceBreakIdEl,
  techChooseBtn: dom.techChooseBtn,
  mobileTechChooseBtn: dom.mobileTechChooseBtn,
  centerMeBtn: dom.centerMeBtn,
  centerMeDesktopBtn: dom.centerMeDesktopBtn,
  collectVisibleDesktopBtn: dom.collectVisibleDesktopBtn,
  collectVisibleMobileBtn: dom.collectVisibleMobileBtn,
  captureCancelBtn: dom.captureCancelBtn,
  captureCloseBtn: dom.captureCloseBtn,
  captureTimeEl: dom.captureTimeEl,
  shardAlertCloseBtn: dom.shardAlertCloseBtn,
  panelCloseBtn: dom.panelCloseBtn,
  panelActionButtons: dom.panelActionButtons,
  miniMapEl: dom.miniMapEl,
  ctx: dom.ctx,
  initTerrainTextures,
  worldTileRawFromPointerFromModule,
  computeDragPreviewFromModule,
  terrainLabel,
  displayTownGoldPerMinute,
  tileHistoryLines,
  hideShardAlert,
  showCollectVisibleCooldownAlert,
  drawBarbarianSkullOverlay,
  drawIncomingAttackOverlay,
  COLLECT_VISIBLE_COOLDOWN_MS
});
