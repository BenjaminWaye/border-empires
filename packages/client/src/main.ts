import "./style.css";
import { getApps, initializeApp, type FirebaseOptions } from "firebase/app";
import { GoogleAuthProvider, getAuth } from "firebase/auth";
import {
  CHUNK_SIZE,
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
  WORLD_HEIGHT,
  WORLD_WIDTH,
  defensivenessMultiplier,
  grassShadeAt,
  landBiomeAt,
  setWorldSeed,
  structureBuildGoldCost,
  structureCostDefinition,
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
  guideSteps,
  isForestTile
} from "./client-constants.js";
import { initClientDom } from "./client-dom.js";
import { exposedSidesForTile, renderDefensibilityPanelHtml } from "./client-defensibility-html.js";
import {
  combatResolutionAlert as combatResolutionAlertFromModule,
  hideShardAlert as hideShardAlertFromModule,
  maybeAnnounceShardSite as maybeAnnounceShardSiteFromModule,
  notifyInsufficientGoldForFrontierAction as notifyInsufficientGoldForFrontierActionFromModule,
  pushFeed as pushFeedFromModule,
  shardAlertKeyForPayload as shardAlertKeyForPayloadFromModule,
  showCaptureAlert as showCaptureAlertFromModule,
  showCollectVisibleCooldownAlert as showCollectVisibleCooldownAlertFromModule,
  showShardAlert as showShardAlertFromModule
} from "./client-alerts.js";
import {
  createClientAuthFlow
} from "./client-auth-flow.js";
import {
  drawStartingExpansionArrow as drawStartingExpansionArrowFromModule,
  renderCaptureProgress as renderCaptureProgressFromModule,
  renderShardAlert as renderShardAlertFromModule,
  settlePixelSeed as settlePixelSeedFromModule,
  settlePixelWanderPoint as settlePixelWanderPointFromModule,
  settlePixelWaypoint as settlePixelWaypointFromModule,
  triangularWave as triangularWaveFromModule
} from "./client-capture-effects.js";
import { shardRainAlertDetail, type ClientShardRainAlert } from "./client-shard-alert.js";
import {
  applyOptimisticTileCollect as applyOptimisticTileCollectFromModule,
  applyOptimisticVisibleCollect as applyOptimisticVisibleCollectFromModule,
  clearPendingCollectTileDelta as clearPendingCollectTileDeltaFromModule,
  clearPendingCollectVisibleDelta as clearPendingCollectVisibleDeltaFromModule,
  hasCollectableYield as hasCollectableYieldFromModule,
  revertOptimisticTileCollectDelta as revertOptimisticTileCollectDeltaFromModule,
  revertOptimisticVisibleCollectDelta as revertOptimisticVisibleCollectDeltaFromModule,
  visibleCollectSummary as visibleCollectSummaryFromModule
} from "./client-collect-optimism.js";
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
import { renderEconomyPanelHtml, type EconomyFocusKey } from "./client-economy-html.js";
import { bindClientNetwork } from "./client-network.js";
import { shouldHideCaptureOverlayAfterTimer, shouldPreserveOptimisticExpand } from "./client-frontier-overlay.js";
import { shouldFinalizePredictedCombat, wasPredictedCombatAlreadyShown } from "./client-predicted-combat.js";
import {
  firstCaptureGuidanceTarget as firstCaptureGuidanceTargetFromModule,
  inspectionHtmlForTile as inspectionHtmlForTileFromModule,
  passiveTileGuidanceHtml as passiveTileGuidanceHtmlFromModule,
  tileHistoryLines as tileHistoryLinesFromModule
} from "./client-hover-html.js";
import { renderClientHud, resizeClientViewport } from "./client-hud.js";
import { bindClientUiControls, showClientHoldBuildMenu } from "./client-ui-controls.js";
import { busyDevelopmentProcessCount } from "./client-development-queue.js";
import { bindClientMapInput } from "./client-map-input.js";
import {
  bindTechTreeDragScroll as bindTechTreeDragScrollFromModule,
  isMobile as isMobileFromModule,
  mobileNavLabelHtml as mobileNavLabelHtmlFromModule,
  panelTitle as panelTitleFromModule,
  renderMobilePanels as renderMobilePanelsFromModule,
  setActivePanel as setActivePanelFromModule,
  viewportSize as viewportSizeFromModule
} from "./client-panel-nav.js";
import {
  activeTruceWithPlayerFromState,
  breakAllianceFromUi,
  breakTruceFromUi,
  chooseTechFromUi,
  explainActionFailureFromServer,
  sendAllianceRequestFromUi,
  sendTruceRequestFromUi
} from "./client-player-actions.js";
import {
  activeSettlementProgressEntries as activeSettlementProgressEntriesFromModule,
  applyPendingSettlementsFromServer as applyPendingSettlementsFromServerFromModule,
  attackPreviewDetailForTarget as attackPreviewDetailForTargetFromModule,
  attackQueueFailureReason as attackQueueFailureReasonFromModule,
  buildFrontierQueue as buildFrontierQueueFromModule,
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
import {
  buildFortOnSelected as buildFortOnSelectedFromModule,
  buildSiegeOutpostOnSelected as buildSiegeOutpostOnSelectedFromModule,
  cancelOngoingCapture as cancelOngoingCaptureFromModule,
  collectSelectedShard as collectSelectedShardFromModule,
  collectSelectedYield as collectSelectedYieldFromModule,
  collectVisibleYield as collectVisibleYieldFromModule,
  hideHoldBuildMenu as hideHoldBuildMenuFromModule,
  hideTileActionMenu as hideTileActionMenuFromModule,
  settleSelected as settleSelectedFromModule,
  uncaptureSelected as uncaptureSelectedFromModule
} from "./client-selected-actions.js";
import { townHasSupportStructureType } from "./client-support-structures.js";
import {
  beginCrystalTargeting as beginCrystalTargetingFromModule,
  clearCrystalTargeting as clearCrystalTargetingFromModule,
  computeCrystalTargets as computeCrystalTargetsFromModule,
  crystalTargetingTitle as crystalTargetingTitleFromModule,
  crystalTargetingTone as crystalTargetingToneFromModule,
  executeCrystalTargeting as executeCrystalTargetingFromModule,
  hasAetherBridgeCapability as hasAetherBridgeCapabilityFromModule,
  hasBreakthroughCapability as hasBreakthroughCapabilityFromModule,
  hasOwnedLandWithinClientRange as hasOwnedLandWithinClientRangeFromModule,
  hasRevealCapability as hasRevealCapabilityFromModule,
  hasSiphonCapability as hasSiphonCapabilityFromModule,
  hasTerrainShapingCapability as hasTerrainShapingCapabilityFromModule,
  isOwnedBorderTile as isOwnedBorderTileFromModule,
  lineStepsBetween as lineStepsBetweenFromModule,
  menuActionsForSingleTile as menuActionsForSingleTileFromModule,
  tileActionAvailability as tileActionAvailabilityFromModule,
  tileActionAvailabilityWithDevelopmentSlot as tileActionAvailabilityWithDevelopmentSlotFromModule
} from "./client-tile-action-logic.js";
import {
  chebyshevDistanceClient as chebyshevDistanceClientFromModule,
  hideTechLockedTileAction as hideTechLockedTileActionFromModule,
  hostileObservatoryProtectingTile as hostileObservatoryProtectingTileFromModule,
  isTileOwnedByAlly as isTileOwnedByAllyFromModule,
  requiredTechForTileAction as requiredTechForTileActionFromModule,
  splitTileActionsIntoTabs as splitTileActionsIntoTabsFromModule,
  tileActionIsBuilding as tileActionIsBuildingFromModule,
  tileActionIsCrystal as tileActionIsCrystalFromModule
} from "./client-tile-action-support.js";
import {
  openBulkTileActionMenu as openBulkTileActionMenuFromModule,
  openSingleTileActionMenu as openSingleTileActionMenuFromModule,
  renderTileActionMenu as renderTileActionMenuFromModule
} from "./client-tile-action-menu-ui.js";
import {
  buildDetailTextForAction as buildDetailTextForActionFromModule,
  constructionProgressForTile as constructionProgressForTileFromModule,
  menuOverviewForTile as menuOverviewForTileFromModule,
  queuedSettlementProgressForTile as queuedSettlementProgressForTileFromModule,
  tileMenuViewForTile as tileMenuViewForTileFromModule,
  tileProductionRequirementLabel as tileProductionRequirementLabelFromModule
} from "./client-tile-menu-view.js";
import { neutralTileClickOutcome } from "./client-tile-interaction.js";
import { renderManpowerPanelHtml, renderSocialInspectCardHtml } from "./client-side-panel-html.js";
import {
  formatRoughMinutes,
  populationPerMinuteLabel,
  townNextGrowthEtaLabel,
  townNextPopulationMilestone
} from "./client-town-growth.js";
import { startClientRuntimeLoop } from "./client-runtime-loop.js";
import {
  activeTrucesHtml,
  allianceRequestsHtml,
  alliesHtml,
  feedHtml,
  leaderboardHtml,
  missionCardsHtml,
  strategicRibbonHtml,
  truceRequestsHtml
} from "./client-panel-html.js";
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
  structureInfoButtonHtml as structureInfoButtonHtmlFromModule,
  structureInfoForKey as structureInfoForKeyFromModule,
  tileProductionHtml,
  tileUpkeepHtml,
  type StructureInfoKey
} from "./client-map-display.js";
import { drawMiniMap as drawMiniMapIntoCanvas } from "./client-minimap.js";
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
import { createInitialState, storageSet, type ClientState } from "./client-state.js";
import {
  currentDomainChoiceTier,
  domainOwnedHtml,
  formatTechBenefitSummary,
  ownedDomainByTier,
  renderDomainChoiceGridHtml,
  renderDomainDetailCardHtml,
  renderDomainProgressCardHtml,
  renderTechChoiceDetailsHtml,
  renderTechDetailCardHtml,
  techCurrentModsHtml,
  techOwnedHtml
} from "./client-tech-html.js";
import { renderCompactTechChoiceGridHtml, renderExpandedTechChoiceTreeHtml } from "./client-tech-tree-html.js";
import {
  renderDomainChoiceGrid as renderDomainChoiceGridFromModule,
  renderDomainDetailCard as renderDomainDetailCardFromModule,
  renderDomainProgressCard as renderDomainProgressCardFromModule,
  renderStructureInfoOverlay as renderStructureInfoOverlayFromModule,
  renderTechChoiceGrid as renderTechChoiceGridFromModule,
  renderTechDetailCard as renderTechDetailCardFromModule,
  renderTechDetailModal as renderTechDetailModalFromModule,
  renderTechDetailPrompt as renderTechDetailPromptFromModule,
  selectedTechInfo as selectedTechInfoFromModule
} from "./client-tech-detail-ui.js";
import type {
  ActiveAetherBridgeView,
  ActiveTruceView,
  AllianceRequest,
  CrystalTargetingAbility,
  DockPair,
  DomainInfo,
  EmpireVisualStyle,
  FeedEntry,
  FeedSeverity,
  FeedType,
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
  TileVisibilityState,
  TileTimedProgress,
  TruceRequest
} from "./client-types.js";
import {
  centerOnOwnedTile as centerOnOwnedTileFromModule,
  maybeRefreshForCamera as maybeRefreshForCameraFromModule,
  requestViewRefresh as requestViewRefreshFromModule
} from "./client-view-refresh.js";

const formatManpowerAmount = (value: number): string => Math.round(value).toString();

const {
  allianceBreakBtn,
  allianceBreakIdEl,
  alliancePlayerInspectEl,
  allianceRequestsEl,
  allianceSendBtn,
  allianceTargetEl,
  alliesListEl,
  authColorPresetButtons,
  authBusyCopyEl,
  authBusyModalEl,
  authBusyTitleEl,
  authDisplayNameEl,
  authEmailEl,
  authEmailLinkBtn,
  authEmailResetBtn,
  authEmailSentAddressEl,
  authGoogleBtn,
  authLoginBtn,
  authOverlayEl,
  authPanelEl,
  authPasswordEl,
  authProfileColorEl,
  authProfileNameEl,
  authProfileSaveBtn,
  authRegisterBtn,
  authStatusEl,
  canvas,
  captureBarEl,
  captureCancelBtn,
  captureCloseBtn,
  captureCardEl,
  captureTargetEl,
  captureTimeEl,
  captureTitleEl,
  captureWrapEl,
  centerMeBtn,
  centerMeDesktopBtn,
  collectVisibleDesktopBtn,
  collectVisibleDesktopMetaEl,
  collectVisibleMobileBtn,
  collectVisibleMobileMetaEl,
  ctx,
  feedEl,
  guideOverlayEl,
  holdBuildMenuEl,
  hoverEl,
  hud,
  leaderboardEl,
  mapLoadingMetaEl,
  mapLoadingOverlayEl,
  mapLoadingRowEl,
  mapLoadingSpinnerEl,
  mapLoadingTitleEl,
  miniMapBase,
  miniMapCtx,
  miniMapEl,
  miniMapLabelEl,
  miniMapWrapEl,
  missionsEl,
  mobileAllianceBreakBtn,
  mobileAllianceBreakIdEl,
  mobileAlliancePlayerInspectEl,
  mobileAllianceRequestsEl,
  mobileAllianceSendBtn,
  mobileAllianceTargetEl,
  mobileAlliesListEl,
  mobileCoreEl,
  mobileCoreHelpEl,
  mobilePanelDefensibilityEl,
  mobileFeedEl,
  mobileLeaderboardEl,
  mobilePanelCoreEl,
  mobilePanelEconomyEl,
  mobilePanelManpowerEl,
  mobilePanelIntelEl,
  mobilePanelDomainsEl,
  mobilePanelMissionsEl,
  mobilePanelSocialEl,
  mobilePanelTechEl,
  mobileSheetEl,
  mobileSheetHeadEl,
  mobileTechChoiceDetailsEl,
  mobileTechChoicesGridEl,
  mobileTechChooseBtn,
  mobileTechCurrentModsEl,
  mobileTechDetailCardEl,
  mobileTechOwnedEl,
  mobileTechPickEl,
  mobileTechPointsEl,
  mobileTechTreeExpandToggleEl,
  panelActionButtons,
  panelAllianceEl,
  panelCloseBtn,
  panelDomainsEl,
  panelDomainsContentEl,
  panelDefensibilityEl,
  panelEconomyEl,
  panelManpowerEl,
  panelFeedEl,
  panelLeaderboardEl,
  panelMissionsEl,
  panelTechEl,
  panelTitleEl,
  selectedEl,
  shardAlertCardEl,
  shardAlertCloseBtn,
  shardAlertDetailEl,
  shardAlertOverlayEl,
  shardAlertTitleEl,
  sidePanelBodyEl,
  sidePanelEl,
  statsChipsEl,
  structureInfoOverlayEl,
  techDetailOverlayEl,
  targetingOverlayEl,
  techChoiceDetailsEl,
  techChoicesGridEl,
  techChooseBtn,
  techCurrentModsEl,
  techDetailCardEl,
  techOwnedEl,
  techPickEl,
  techPointsEl,
  techTreeExpandToggleEl,
  tileActionMenuEl
} = initClientDom();

const state = createInitialState();
const miniMapReplayEl = document.createElement("div");
miniMapReplayEl.id = "mini-map-replay";
miniMapWrapEl.appendChild(miniMapReplayEl);

const toggleExpandedModKey = (modKey: "attack" | "defense" | "income" | "vision"): void => {
  state.expandedModKey = state.expandedModKey === modKey ? null : modKey;
  techCurrentModsEl.innerHTML = techCurrentModsHtml(state.mods, state.expandedModKey, state.modBreakdown);
  mobileTechCurrentModsEl.innerHTML = techCurrentModsHtml(state.mods, state.expandedModKey, state.modBreakdown);
};

const handleTechModChipClick = (ev: Event): void => {
  const target = ev.target;
  if (!(target instanceof HTMLElement)) return;
  const button = target.closest<HTMLElement>("[data-mod-chip]");
  if (!button) return;
  const modKey = button.dataset.modChip;
  if (modKey === "attack" || modKey === "defense" || modKey === "income" || modKey === "vision") {
    toggleExpandedModKey(modKey);
  }
};

techCurrentModsEl.addEventListener("click", handleTechModChipClick);
mobileTechCurrentModsEl.addEventListener("click", handleTechModChipClick);

const firebaseConfig = (() => {
  const apiKey = (import.meta.env.VITE_FIREBASE_API_KEY as string | undefined) ?? "AIzaSyCJP6fuxWLAHykFOTWDyxnkaNVnVAlNX8g";
  const authDomain = (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined) ?? "border-empires.firebaseapp.com";
  const projectId = (import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined) ?? "border-empires";
  const appId = (import.meta.env.VITE_FIREBASE_APP_ID as string | undefined) ?? "1:979056688511:web:d0af9a130d6eabacf36e4a";
  if (!apiKey || !authDomain || !projectId || !appId) return undefined;
  const config: FirebaseOptions = { apiKey, authDomain, projectId, appId };
  const storageBucket = (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined) ?? "border-empires.firebasestorage.app";
  const messagingSenderId = (import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined) ?? "979056688511";
  const measurementId = (import.meta.env.VITE_FIREBASE_MEASUREMENT_ID as string | undefined) ?? "G-8FH65YL4QD";
  if (storageBucket) config.storageBucket = storageBucket;
  if (messagingSenderId) config.messagingSenderId = messagingSenderId;
  if (measurementId) config.measurementId = measurementId;
  return config;
})();

const firebaseApp = firebaseConfig ? (getApps()[0] ?? initializeApp(firebaseConfig)) : undefined;
const firebaseAuth = firebaseApp ? getAuth(firebaseApp) : undefined;
const googleProvider = firebaseAuth ? new GoogleAuthProvider() : undefined;
miniMapBase.width = miniMapEl.width;
miniMapBase.height = miniMapEl.height;
const miniMapBaseCtx = miniMapBase.getContext("2d");
if (!miniMapBaseCtx) throw new Error("missing minimap base context");
let miniMapBaseReady = false;
let miniMapLastDrawCamX = Number.NaN;
let miniMapLastDrawCamY = Number.NaN;
let miniMapLastDrawZoom = Number.NaN;
let miniMapLastReplayIndex = Number.NaN;
let miniMapLastDrawAt = 0;
const TERRAIN_COLOR_CACHE_LIMIT = 120_000;
const terrainColorCache = new Map<string, string>();
const terrainColorCacheOrder: string[] = [];
const clearRenderCaches = (): void => {
  terrainColorCache.clear();
  terrainColorCacheOrder.length = 0;
  state.dockRouteCache.clear();
  miniMapBaseReady = false;
  miniMapLastDrawCamX = Number.NaN;
  miniMapLastDrawCamY = Number.NaN;
  miniMapLastDrawZoom = Number.NaN;
  miniMapLastReplayIndex = Number.NaN;
};

const key = (x: number, y: number): string => `${x},${y}`;
const parseKey = (k: string): { x: number; y: number } => {
  const [xs, ys] = k.split(",");
  return { x: Number(xs), y: Number(ys) };
};
type BuildableStructureId = "FORT" | "OBSERVATORY" | "SIEGE_OUTPOST" | NonNullable<Tile["economicStructure"]>["type"];
const ownedStructureCount = (structureType: BuildableStructureId): number => {
  let count = 0;
  for (const tile of state.tiles.values()) {
    if (tile.ownerId !== state.me) continue;
    if (structureType === "FORT" && tile.fort) count += 1;
    else if (structureType === "OBSERVATORY" && tile.observatory) count += 1;
    else if (structureType === "SIEGE_OUTPOST" && tile.siegeOutpost) count += 1;
    else if (tile.economicStructure?.type === structureType) count += 1;
  }
  return count;
};
const structureGoldCost = (structureType: BuildableStructureId): number => structureBuildGoldCost(structureType, ownedStructureCount(structureType));
const structureCostText = (structureType: BuildableStructureId, resourceOverride?: string): string => {
  const def = structureCostDefinition(structureType);
  const goldCost = structureGoldCost(structureType);
  if (resourceOverride) return `${goldCost} gold + ${resourceOverride}`;
  if (def.resourceCost) return `${goldCost} gold + ${def.resourceCost.amount} ${def.resourceCost.resource}`;
  return `${goldCost} gold`;
};
const wrapX = (x: number): number => (x + WORLD_WIDTH) % WORLD_WIDTH;
const wrapY = (y: number): number => (y + WORLD_HEIGHT) % WORLD_HEIGHT;
const FULL_MAP_CHUNK_RADIUS = Math.max(Math.ceil(WORLD_WIDTH / CHUNK_SIZE / 2), Math.ceil(WORLD_HEIGHT / CHUNK_SIZE / 2));
const tileVisibilityStateAt = (x: number, y: number, tile?: Tile): TileVisibilityState => {
  if (state.fogDisabled) return "visible";
  const k = key(x, y);
  if (!state.discoveredTiles.has(k)) return "unexplored";
  if (!tile || tile.fogged) return "fogged";
  return "visible";
};
const worldIndex = (x: number, y: number): number => y * WORLD_WIDTH + x;
const hashString = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};
const ownerColor = (ownerId: string): string => {
  if (ownerId === "barbarian") return "#2f3842";
  const h = hashString(ownerId) % 360;
  return `hsl(${h} 70% 48%)`;
};
const effectiveColor = (ownerId: string): string => state.playerColors.get(ownerId) ?? ownerColor(ownerId);
const visualStyleForOwner = (ownerId: string): EmpireVisualStyle | undefined => state.playerVisualStyles.get(ownerId);
const shieldUntilForOwner = (ownerId: string): number => state.playerShieldUntil.get(ownerId) ?? 0;
const ownerSpawnShieldActive = (ownerId: string): boolean => shieldUntilForOwner(ownerId) > Date.now();
const playerNameForOwner = (ownerId?: string | null): string | undefined => {
  if (!ownerId) return undefined;
  if (ownerId === state.me) return state.meName || "you";
  if (ownerId === "barbarian") return "Barbarians";
  return state.playerNames.get(ownerId);
};
const effectiveOverlayColor = (ownerId: string): string =>
  effectiveOverlayColorFromModule(ownerId, { ownerColor, visualStyleForOwner });
const borderColorForOwner = (ownerId: string, stateName?: Tile["ownershipState"]): string =>
  borderColorForOwnerFromModule(ownerId, stateName, visualStyleForOwner);
const shouldDrawOwnershipBorder = (tile: Tile): boolean => shouldDrawOwnershipBorderFromModule(tile, visualStyleForOwner);
const borderLineWidthForOwner = (ownerId: string, stateName?: Tile["ownershipState"]): number =>
  borderLineWidthForOwnerFromModule(ownerId, stateName, visualStyleForOwner);
const structureAccentColor = (ownerId: string, fallback: string): string =>
  structureAccentColorFromModule(ownerId, fallback, visualStyleForOwner);
const structureInfoForKey = (type: StructureInfoKey) =>
  structureInfoForKeyFromModule(type, { formatCooldownShort, prettyToken });
const structureInfoButtonHtml = (type: StructureInfoKey, label?: string): string =>
  structureInfoButtonHtmlFromModule(type, { formatCooldownShort, prettyToken }, label);
const drawAetherBridgeLane = (
  renderCtx: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  nowMs: number,
  options?: { compact?: boolean }
): void => drawAetherBridgeLaneOnCanvas(renderCtx, fromX, fromY, toX, toY, nowMs, options);
const drawTerrainTile = (wx: number, wy: number, terrain: Tile["terrain"], px: number, py: number, size: number): void =>
  drawTerrainTileOnCanvas(ctx, { wx, wy, terrain, px, py, size, wrapX, wrapY, cachedTerrainColorAt });
const drawForestOverlay = (wx: number, wy: number, px: number, py: number, size: number): void =>
  drawForestOverlayOnCanvas(ctx, wx, wy, px, py, size);
const drawBarbarianSkullOverlay = (px: number, py: number, size: number): void =>
  drawBarbarianSkullOverlayOnCanvas(ctx, px, py, size);
const drawIncomingAttackOverlay = (wx: number, wy: number, px: number, py: number, size: number, resolvesAt: number): void =>
  drawIncomingAttackOverlayOnCanvas(ctx, wx, wy, px, py, size, resolvesAt);
const drawTownOverlay = (tile: Tile, px: number, py: number, size: number): void =>
  drawTownOverlayOnCanvas(ctx, tile, px, py, size);
const drawCenteredOverlay = (overlay: HTMLImageElement | undefined, px: number, py: number, size: number, scale = 1.08): void =>
  drawCenteredOverlayOnCanvas(ctx, overlay, px, py, size, scale);
const drawCenteredOverlayWithAlpha = (
  overlay: HTMLImageElement | undefined,
  px: number,
  py: number,
  size: number,
  scale = 1.08,
  alpha = 1
): void => drawCenteredOverlayWithAlphaOnCanvas(ctx, overlay, px, py, size, scale, alpha);
const drawResourceCornerMarker = (tile: Tile, px: number, py: number, size: number): void =>
  drawResourceCornerMarkerOnCanvas(ctx, tile, px, py, size, resourceColor);
const drawExposedTileBorder = (tile: Tile, px: number, py: number, size: number): void =>
  drawExposedTileBorderOnCanvas(ctx, tile, px, py, size, { tiles: state.tiles, keyFor: key, wrapX, wrapY });
const drawShardFallback = (_tile: Tile, px: number, py: number, size: number): void => drawShardFallbackOnCanvas(ctx, px, py, size);
const drawOwnershipSignature = (ownerId: string, px: number, py: number, size: number): void =>
  drawOwnershipSignatureOnCanvas(ctx, ownerId, px, py, size, visualStyleForOwner);
const economicStructureIcon = (type: Tile["economicStructure"] extends infer T ? T extends { type: infer U } ? U : never : never): string => {
  if (type === "FARMSTEAD") return "▥";
  if (type === "CAMP") return "⛺";
  if (type === "MINE") return "⛏";
  if (type === "GRANARY") return "◫";
  return "▣";
};
const tileHistoryLines = (tile: Tile): string[] => tileHistoryLinesFromModule(tile, { me: state.me, playerNameForOwner });
const ownedSpecialSiteCount = (): number => {
  let count = 0;
  for (const tile of state.tiles.values()) {
    if (tile.ownerId !== state.me) continue;
    if (tile.town || tile.dockId || tile.resource) count += 1;
  }
  return count;
};

const wrappedTileDistance = (x: number, y: number, focus: { x: number; y: number }): number => {
  const dx = Math.min(Math.abs(x - focus.x), WORLD_WIDTH - Math.abs(x - focus.x));
  const dy = Math.min(Math.abs(y - focus.y), WORLD_HEIGHT - Math.abs(y - focus.y));
  return dx + dy;
};

const firstCaptureGuidanceTarget = (): { tile: Tile; label: string } | undefined =>
  firstCaptureGuidanceTargetFromModule({
    authSessionReady: state.authSessionReady,
    tiles: state.tiles.values(),
    me: state.me,
    homeTile: state.homeTile,
    selected: state.selected,
    camX: state.camX,
    camY: state.camY,
    isTileOwnedByAlly,
    pickOriginForTarget,
    prettyToken
  });

const displayTownGoldPerMinute = (tile: Tile): number => {
  if (!tile.town) return 0;
  return tile.town.goldPerMinute;
};

const inspectionHtmlForTile = (tile: Tile): string =>
  inspectionHtmlForTileFromModule(tile, {
    playerNameForOwner,
    prettyToken,
    terrainLabel,
    populationPerMinuteLabel,
    hostileObservatoryProtectingTile
  });

const passiveTileGuidanceHtml = (): string => passiveTileGuidanceHtmlFromModule({ captureGuidance: firstCaptureGuidanceTarget() });

const growthModifierPercentLabel = (label: "Recently captured" | "Nearby war" | "Long time peace"): string => {
  if (label === "Long time peace") return "+100% pop growth";
  return "-100% pop growth";
};

const hasCollectableYield = (t: Tile | undefined): boolean => hasCollectableYieldFromModule(t);

const visibleCollectSummary = (): { tileCount: number; gold: number; resourceKinds: number } =>
  visibleCollectSummaryFromModule({ tiles: state.tiles.values(), me: state.me, tileVisibilityStateAt });

const clearPendingCollectVisibleDelta = (): void => clearPendingCollectVisibleDeltaFromModule(state);

const clearPendingCollectTileDelta = (tileKey?: string): void => clearPendingCollectTileDeltaFromModule(state, tileKey);

const revertOptimisticVisibleCollectDelta = (): void => revertOptimisticVisibleCollectDeltaFromModule(state);

const revertOptimisticTileCollectDelta = (tileKey: string): void => revertOptimisticTileCollectDeltaFromModule(state, tileKey);

const applyOptimisticVisibleCollect = (): number =>
  applyOptimisticVisibleCollectFromModule({
    state,
    tilesIterable: state.tiles.values(),
    tileVisibilityStateAt,
    keyFor: key
  });

const applyOptimisticTileCollect = (tile: Tile): boolean => applyOptimisticTileCollectFromModule({ state, keyFor: key }, tile);
const isCoastalLand = (x: number, y: number): boolean => {
  if (terrainAt(x, y) !== "LAND") return false;
  const n = [
    terrainAt(wrapX(x), wrapY(y - 1)),
    terrainAt(wrapX(x + 1), wrapY(y)),
    terrainAt(wrapX(x), wrapY(y + 1)),
    terrainAt(wrapX(x - 1), wrapY(y))
  ];
  return n.includes("SEA");
};
const isCoastalSea = (x: number, y: number): boolean => {
  if (terrainAt(x, y) !== "SEA") return false;
  const n = [
    terrainAt(wrapX(x), wrapY(y - 1)),
    terrainAt(wrapX(x + 1), wrapY(y)),
    terrainAt(wrapX(x), wrapY(y + 1)),
    terrainAt(wrapX(x - 1), wrapY(y))
  ];
  return n.includes("LAND");
};
const tileNoise = (x: number, y: number, seed: number): number => {
  const h = hashString(`${wrapX(x)}:${wrapY(y)}:${seed}`);
  return (h % 10_000) / 10_000;
};
const smoothstep = (t: number): number => t * t * (3 - 2 * t);
const groupedNoise = (x: number, y: number, cell: number, seed: number): number => {
  const gx = Math.floor(x / cell);
  const gy = Math.floor(y / cell);
  const tx = (x % cell) / cell;
  const ty = (y % cell) / cell;
  const sx = smoothstep(tx);
  const sy = smoothstep(ty);
  const n00 = tileNoise(gx, gy, seed);
  const n10 = tileNoise(gx + 1, gy, seed);
  const n01 = tileNoise(gx, gy + 1, seed);
  const n11 = tileNoise(gx + 1, gy + 1, seed);
  const ix0 = n00 + (n10 - n00) * sx;
  const ix1 = n01 + (n11 - n01) * sx;
  return ix0 + (ix1 - ix0) * sy;
};
const landTone = (x: number, y: number): string => {
  const biome = landBiomeAt(x, y);
  if (biome === "COASTAL_SAND") return "#c8b27c";
  if (biome === "SAND") {
    const v = groupedNoise(x, y, 32, 907);
    return v < 0.5 ? "#bfa36e" : "#c9b07a";
  }
  const shade = grassShadeAt(x, y);
  return shade === "DARK" ? "#3f8a5c" : "#4d976a";
};
const terrainColorAt = (x: number, y: number, terrain: Tile["terrain"]): string => {
  if (terrain === "SEA") return isCoastalSea(x, y) ? "#1f6ea0" : "#0b3d91";
  if (terrain === "MOUNTAIN") return "#8b8d92";
  return landTone(x, y);
};
const cachedTerrainColorAt = (x: number, y: number, terrain: Tile["terrain"]): string => {
  const k = `${x},${y},${terrain}`;
  const hit = terrainColorCache.get(k);
  if (hit) return hit;
  const c = terrainColorAt(x, y, terrain);
  terrainColorCache.set(k, c);
  terrainColorCacheOrder.push(k);
  if (terrainColorCacheOrder.length > TERRAIN_COLOR_CACHE_LIMIT) {
    const drop = terrainColorCacheOrder.shift();
    if (drop) terrainColorCache.delete(drop);
  }
  return c;
};


const openEconomyPanel = (focus: EconomyFocusKey = "ALL"): void => {
  state.economyFocus = focus;
  setActivePanel("economy");
};

const rateToneClass = (rate: number): string => {
  if (rate > 0.001) return "positive";
  if (rate < -0.001) return "negative";
  return "neutral";
};
const prettyToken = (value: string): string =>
  value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
const combatResolutionAlert = (
  msg: Record<string, unknown>,
  context?: { targetTileBefore: Tile | undefined; originTileBefore: Tile | undefined }
): { title: string; detail: string; tone: "success" | "warn"; manpowerLoss?: number } =>
  combatResolutionAlertFromModule(msg, context, {
    playerNameForOwner,
    prettyToken,
    resourceLabel,
    terrainLabel,
    terrainAt,
    tiles: state.tiles,
    keyFor: key
  });
const terrainLabel = (x: number, y: number, terrain: Tile["terrain"]): string => {
  if (terrain !== "LAND") return terrain;
  const biome = landBiomeAt(x, y);
  if (biome === "GRASS") return isForestTile(x, y) ? "FOREST" : "GRASS";
  return "SAND";
};
const toroidDelta = (from: number, to: number, dim: number): number => {
  let d = to - from;
  if (d > dim / 2) d -= dim;
  if (d < -dim / 2) d += dim;
  return d;
};
const worldToScreen = (wx: number, wy: number, size: number, halfW: number, halfH: number): { sx: number; sy: number } => {
  const dx = toroidDelta(state.camX, wx, WORLD_WIDTH);
  const dy = toroidDelta(state.camY, wy, WORLD_HEIGHT);
  return {
    sx: (dx + halfW + 0.5) * size,
    sy: (dy + halfH + 0.5) * size
  };
};

const manhattanToroid = (ax: number, ay: number, bx: number, by: number): number => {
  const dx = Math.min(Math.abs(ax - bx), WORLD_WIDTH - Math.abs(ax - bx));
  const dy = Math.min(Math.abs(ay - by), WORLD_HEIGHT - Math.abs(ay - by));
  return dx + dy;
};
const computeDockSeaRoute = (ax: number, ay: number, bx: number, by: number): Array<{ x: number; y: number }> =>
  computeDockSeaRouteFromModule(ax, ay, bx, by, { dockRouteCache: state.dockRouteCache, worldIndex, wrapX, wrapY });

const markDockDiscovered = (tile: Tile): void =>
  markDockDiscoveredFromModule(tile, { discoveredDockTiles: state.discoveredDockTiles, keyFor: key });

const isDockRouteVisibleForPlayer = (pair: DockPair): boolean =>
  isDockRouteVisibleForPlayerFromModule(pair, {
    fogDisabled: state.fogDisabled,
    selected: state.selected,
    discoveredDockTiles: state.discoveredDockTiles,
    keyFor: key
  });

const buildMiniMapBase = (): void => {
  buildMiniMapBaseFromModule({ miniMapBase, miniMapBaseCtx, cachedTerrainColorAt });
  miniMapBaseReady = true;
  miniMapLastDrawCamX = Number.NaN;
};

const resetStrategicReplayState = (): void => {
  state.replayIndex = Math.max(0, state.strategicReplayEvents.length - 1);
  state.replayAppliedIndex = 0;
  state.replayOwnershipByTile.clear();
  if (state.strategicReplayEvents.length > 0) rebuildStrategicReplayState(state.replayIndex);
};

function rebuildStrategicReplayState(targetIndex: number): void {
  const clamped = Math.max(0, Math.min(targetIndex, Math.max(0, state.strategicReplayEvents.length - 1)));
  state.replayOwnershipByTile.clear();
  for (let index = 0; index <= clamped; index += 1) {
    const event = state.strategicReplayEvents[index];
    if (!event || event.type !== "OWNERSHIP" || event.x === undefined || event.y === undefined) continue;
    const replayKey = key(event.x, event.y);
    if (event.ownerId) {
      const replayTile: { ownerId?: string; ownershipState?: "FRONTIER" | "SETTLED" | "BARBARIAN" } = { ownerId: event.ownerId };
      if (event.ownershipState) replayTile.ownershipState = event.ownershipState;
      state.replayOwnershipByTile.set(replayKey, replayTile);
    } else {
      state.replayOwnershipByTile.delete(replayKey);
    }
  }
  state.replayAppliedIndex = clamped;
  state.replayIndex = clamped;
}

const replayBookmarkEvents = (): StrategicReplayEvent[] => state.strategicReplayEvents.filter((event) => event.isBookmark);

const replayCurrentEvent = (): StrategicReplayEvent | undefined => state.strategicReplayEvents[state.replayIndex];

const advanceStrategicReplay = (nowMs: number): void => {
  if (!state.replayActive || !state.replayPlaying || state.strategicReplayEvents.length < 2) {
    state.replayLastTickAt = nowMs;
    return;
  }
  if (!state.replayLastTickAt) state.replayLastTickAt = nowMs;
  const deltaSeconds = Math.max(0, (nowMs - state.replayLastTickAt) / 1000);
  state.replayLastTickAt = nowMs;
  const nextIndex = Math.min(state.strategicReplayEvents.length - 1, state.replayIndex + Math.max(1, Math.round(deltaSeconds * state.replaySpeed)));
  if (nextIndex === state.replayIndex) return;
  if (nextIndex >= state.strategicReplayEvents.length - 1) state.replayPlaying = false;
  rebuildStrategicReplayState(nextIndex);
};

const drawMiniMap = (): void => {
  const nowMs = performance.now();
  advanceStrategicReplay(nowMs);
  const changed = drawMiniMapIntoCanvas({
    nowMs,
    state,
    canvas,
    miniMapEl,
    miniMapCtx,
    miniMapBase,
    miniMapBaseReady,
    miniMapLast: {
      camX: miniMapLastDrawCamX,
      camY: miniMapLastDrawCamY,
      zoom: miniMapLastDrawZoom,
      replayIndex: miniMapLastReplayIndex,
      drawAt: miniMapLastDrawAt
    },
    parseKey,
    keyFor: key,
    tileVisibilityStateAt,
    effectiveOverlayColor,
    isDockRouteVisibleForPlayer,
    hasCollectableYield,
    replayCurrentEvent
  });
  if (!changed) return;
  miniMapLastDrawCamX = state.camX;
  miniMapLastDrawCamY = state.camY;
  miniMapLastDrawZoom = state.zoom;
  miniMapLastReplayIndex = state.replayActive ? state.replayIndex : Number.NaN;
  miniMapLastDrawAt = nowMs;
};

const pushFeed = (msg: string, type: FeedType = "info", severity: FeedSeverity = "info"): void =>
  pushFeedFromModule(state, msg, type, severity);

const maybeAnnounceShardSite = (previous: Tile | undefined, next: Tile): void => maybeAnnounceShardSiteFromModule(previous, next);

const shardAlertKeyForPayload = (phase: "upcoming" | "started", startsAt: number): string =>
  shardAlertKeyForPayloadFromModule(phase, startsAt);

const showShardAlert = (alert: ClientShardRainAlert): void => showShardAlertFromModule(state, alert);

const hideShardAlert = (): void => hideShardAlertFromModule(state);

const showCaptureAlert = (
  title: string,
  detail: string,
  tone: "success" | "error" | "warn" = "error",
  manpowerLoss?: number
): void => showCaptureAlertFromModule(state, title, detail, tone, manpowerLoss);

const notifyInsufficientGoldForFrontierAction = (action: "claim" | "attack"): void =>
  notifyInsufficientGoldForFrontierActionFromModule(state, action);

const showCollectVisibleCooldownAlert = (): void => showCollectVisibleCooldownAlertFromModule(state, formatCooldownShort);

const centerOnOwnedTile = (): void => centerOnOwnedTileFromModule(state);

const requestViewRefresh = (radius = 2, force = false): void =>
  requestViewRefreshFromModule(state, { ws, fullMapChunkRadius: FULL_MAP_CHUNK_RADIUS, radius, force });

const maybeRefreshForCamera = (force = false): void =>
  maybeRefreshForCameraFromModule(state, { ws, requestViewRefresh, force });

const isMobile = (): boolean => isMobileFromModule();

const panelTitle = (panel: NonNullable<typeof state.activePanel>): string => panelTitleFromModule(panel);

const mobileNavLabelHtml = (panel: typeof state.mobilePanel, opts?: { techReady?: boolean; attackAlertUnread?: boolean }): string =>
  mobileNavLabelHtmlFromModule(panel, opts);

const viewportSize = (): { width: number; height: number } => viewportSizeFromModule();

const setActivePanel = (panel: typeof state.activePanel): void => setActivePanelFromModule(state, panel, { renderMobilePanels });

const renderMobilePanels = (): void =>
  renderMobilePanelsFromModule(state, {
    hud,
    panelActionButtons,
    sidePanelBodyEl,
    sidePanelEl,
    panelTitleEl,
    mobileSheetEl,
    mobileCoreEl,
    mobilePanelCoreEl,
    mobilePanelMissionsEl,
    mobilePanelTechEl,
    mobilePanelDomainsEl,
    mobilePanelSocialEl,
    mobilePanelDefensibilityEl,
    mobilePanelEconomyEl,
    mobilePanelManpowerEl,
    mobilePanelIntelEl,
    mobileSheetHeadEl
  });

const bindTechTreeDragScroll = (): void => bindTechTreeDragScrollFromModule(state, hud);

const selectedTile = (): Tile | undefined => {
  if (!state.selected) return undefined;
  const existing = state.tiles.get(key(state.selected.x, state.selected.y));
  if (existing) return existing;
  const visibility = tileVisibilityStateAt(state.selected.x, state.selected.y);
  if (visibility === "unexplored") return undefined;
  return {
    x: state.selected.x,
    y: state.selected.y,
    terrain: terrainAt(state.selected.x, state.selected.y),
    fogged: visibility !== "visible"
  };
};

const applyOptimisticTileState = (
  x: number,
  y: number,
  mutate: (tile: Tile) => void
): void => {
  const tileKey = key(x, y);
  if (!state.optimisticTileSnapshots.has(tileKey)) {
    const existing = state.tiles.get(tileKey);
    state.optimisticTileSnapshots.set(tileKey, existing ? { ...existing } : undefined);
  }
  const current =
    state.tiles.get(tileKey) ??
    ({
      x,
      y,
      terrain: terrainAt(x, y),
      fogged: false
    } satisfies Tile);
  const next = { ...current };
  mutate(next);
  state.tiles.set(tileKey, next);
  if (!next.fogged) state.discoveredTiles.add(tileKey);
};

const clearOptimisticTileState = (tileKey: string, revert = false): void => {
  if (!state.optimisticTileSnapshots.has(tileKey)) return;
  const previous = state.optimisticTileSnapshots.get(tileKey);
  state.optimisticTileSnapshots.delete(tileKey);
  if (!revert) {
    const current = state.tiles.get(tileKey);
    if (current?.optimisticPending) {
      const next = { ...current };
      delete next.optimisticPending;
      state.tiles.set(tileKey, next);
    }
    return;
  }
  if (previous) {
    state.tiles.set(tileKey, previous);
    if (!previous.fogged) state.discoveredTiles.add(tileKey);
    else state.discoveredTiles.delete(tileKey);
  } else {
    state.tiles.delete(tileKey);
    state.discoveredTiles.delete(tileKey);
  }
};

const tileHasStructureKind = (tile: Tile, kind: OptimisticStructureKind): boolean => {
  if (kind === "FORT") return Boolean(tile.fort);
  if (kind === "OBSERVATORY") return Boolean(tile.observatory);
  if (kind === "SIEGE_OUTPOST") return Boolean(tile.siegeOutpost);
  return tile.economicStructure?.type === kind;
};

const tileHasUnderConstructionStructureKind = (tile: Tile, kind: OptimisticStructureKind): boolean => {
  if (kind === "FORT") return tile.fort?.status === "under_construction";
  if (kind === "OBSERVATORY") return tile.observatory?.status === "under_construction";
  if (kind === "SIEGE_OUTPOST") return tile.siegeOutpost?.status === "under_construction";
  return tile.economicStructure?.type === kind && tile.economicStructure?.status === "under_construction";
};

const applyOptimisticStructureBuild = (x: number, y: number, kind: OptimisticStructureKind): void => {
  const completesAt =
    Date.now() +
    (kind === "FORT"
      ? FORT_BUILD_MS
      : kind === "OBSERVATORY"
        ? OBSERVATORY_BUILD_MS
        : kind === "SIEGE_OUTPOST"
          ? SIEGE_OUTPOST_BUILD_MS
          : economicStructureBuildMs(kind));
  applyOptimisticTileState(x, y, (tile) => {
    tile.optimisticPending = "structure_build";
    if (kind === "FORT") {
      delete tile.economicStructure;
      tile.fort = { ownerId: state.me, status: "under_construction", completesAt };
      return;
    }
    if (kind === "OBSERVATORY") {
      tile.observatory = { ownerId: state.me, status: "under_construction", completesAt };
      return;
    }
    if (kind === "SIEGE_OUTPOST") {
      delete tile.economicStructure;
      tile.siegeOutpost = { ownerId: state.me, status: "under_construction", completesAt };
      return;
    }
    tile.economicStructure = { ownerId: state.me, type: kind, status: "under_construction", completesAt };
  });
};

const applyOptimisticStructureCancel = (x: number, y: number): void => {
  applyOptimisticTileState(x, y, (tile) => {
    tile.optimisticPending = "structure_cancel";
    delete tile.fort;
    delete tile.observatory;
    delete tile.siegeOutpost;
    delete tile.economicStructure;
  });
};

const shouldPreserveOptimisticExpandByKey = (tileKey: string): boolean =>
  shouldPreserveOptimisticExpand(tileKey ? state.tiles.get(tileKey) : undefined, state.me);

const mergeServerTileWithOptimisticState = (incoming: Tile): Tile => {
  const tileKey = key(incoming.x, incoming.y);
  const existing = state.tiles.get(tileKey);
  const settlementProgress = state.settleProgressByTile.get(tileKey);
  if (settlementProgress && (existing?.ownerId === state.me || incoming.ownerId === state.me)) {
    return {
      ...incoming,
      ownerId: state.me,
      ownershipState: settlementProgress.awaitingServerConfirm ? "SETTLED" : existing?.ownershipState === "SETTLED" ? "SETTLED" : "FRONTIER",
      fogged: false,
      optimisticPending: "settle"
    };
  }
  if (!existing?.optimisticPending || existing.ownerId !== state.me) return incoming;
  if (existing.optimisticPending === "expand") {
    if (incoming.ownerId === state.me && incoming.ownershipState === "FRONTIER") return incoming;
    const merged: Tile = {
      ...incoming,
      ownerId: existing.ownerId,
      fogged: false,
      optimisticPending: existing.optimisticPending
    };
    if (existing.ownershipState) merged.ownershipState = existing.ownershipState;
    return merged;
  }
  if (existing.optimisticPending === "settle") {
    if (incoming.ownerId === state.me && incoming.ownershipState === "SETTLED") return incoming;
    return {
      ...incoming,
      ownerId: existing.ownerId,
      ownershipState: "SETTLED",
      fogged: false,
      optimisticPending: existing.optimisticPending
    };
  }
  if (existing.optimisticPending === "structure_build") {
    const optimisticKind =
      existing.fort?.status === "under_construction"
        ? "FORT"
        : existing.observatory?.status === "under_construction"
          ? "OBSERVATORY"
          : existing.siegeOutpost?.status === "under_construction"
            ? "SIEGE_OUTPOST"
            : existing.economicStructure?.status === "under_construction"
              ? existing.economicStructure.type
              : undefined;
    if (!optimisticKind) return incoming;
    if (tileHasStructureKind(incoming, optimisticKind)) return incoming;
    const merged: Tile = {
      ...incoming,
      optimisticPending: existing.optimisticPending
    };
    if (existing.fort) merged.fort = existing.fort;
    if (existing.observatory) merged.observatory = existing.observatory;
    if (existing.siegeOutpost) merged.siegeOutpost = existing.siegeOutpost;
    if (existing.economicStructure) merged.economicStructure = existing.economicStructure;
    return merged;
  }
  if (existing.optimisticPending === "structure_cancel") {
    const previous = state.optimisticTileSnapshots.get(tileKey);
    const cancelledKind =
      previous?.fort?.status === "under_construction"
        ? "FORT"
        : previous?.observatory?.status === "under_construction"
          ? "OBSERVATORY"
          : previous?.siegeOutpost?.status === "under_construction"
            ? "SIEGE_OUTPOST"
            : previous?.economicStructure?.status === "under_construction"
              ? previous.economicStructure.type
              : undefined;
    if (!cancelledKind) return incoming;
    if (!tileHasUnderConstructionStructureKind(incoming, cancelledKind)) return incoming;
    const merged: Tile = {
      ...incoming,
      optimisticPending: existing.optimisticPending
    };
    delete merged.fort;
    delete merged.observatory;
    delete merged.siegeOutpost;
    delete merged.economicStructure;
    return merged;
  }
  return incoming;
};

const mergeIncomingTileDetail = (existing: Tile | undefined, incoming: Tile): Tile => {
  if (!existing || existing.detailLevel !== "full" || incoming.detailLevel === "full") return incoming;
  const merged: Tile = {
    ...existing,
    ...incoming,
    detailLevel: "full"
  };
  if (!("town" in incoming) && existing.town) merged.town = existing.town;
  if (!("yield" in incoming) && existing.yield) merged.yield = existing.yield;
  if (!("yieldRate" in incoming) && existing.yieldRate) merged.yieldRate = existing.yieldRate;
  if (!("yieldCap" in incoming) && existing.yieldCap) merged.yieldCap = existing.yieldCap;
  if (!("history" in incoming) && existing.history) merged.history = existing.history;
  return merged;
};

const mapInteractionFlags = {
  holdActivated: false,
  suppressNextClick: false
};

const handleTileSelection = (wx: number, wy: number, clientX: number, clientY: number): void => {
  if (mapInteractionFlags.holdActivated) {
    mapInteractionFlags.holdActivated = false;
    return;
  }
  if (mapInteractionFlags.suppressNextClick) {
    mapInteractionFlags.suppressNextClick = false;
    return;
  }
  hideHoldBuildMenu();
  hideTileActionMenu();

  const clicked = state.tiles.get(key(wx, wy));
  const vis = tileVisibilityStateAt(wx, wy, clicked);
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
  if (vis === "unexplored") {
    state.selected = undefined;
    renderHud();
    return;
  }
  if (vis === "fogged") {
    state.selected = { x: wx, y: wy };
    state.attackPreview = undefined;
    state.attackPreviewPendingKey = "";
    renderHud();
    return;
  }
  if (!clicked) {
    state.selected = { x: wx, y: wy };
    state.attackPreview = undefined;
    state.attackPreviewPendingKey = "";
    renderHud();
    return;
  }

  const to = clicked;
  state.selected = { x: wx, y: wy };
  const adjacentFromOwned = pickOriginForTarget(to.x, to.y);
  const frontierOrigin = pickOriginForTarget(to.x, to.y, false);
  const clickOutcome = neutralTileClickOutcome({
    isLand: to.terrain === "LAND",
    isFogged: Boolean(to.fogged),
    isOwnedByEnemy: Boolean(to.ownerId && to.ownerId !== state.me),
    isOwnedByAlly: isTileOwnedByAlly(to),
    hasAdjacentOwnedOrigin: Boolean(adjacentFromOwned),
    hasFrontierOrigin: Boolean(frontierOrigin),
    hasDock: Boolean(to.dockId),
    isNeutral: !to.ownerId
  });
  if (clickOutcome === "warn-unreachable-enemy") {
    pushFeed("Target is not connected to your border.", "combat", "warn");
    requestAttackPreviewForHover();
    renderHud();
    return;
  }
  if (clickOutcome === "queue-adjacent-neutral") {
    if (!canAffordCost(state.gold, FRONTIER_CLAIM_COST)) {
      notifyInsufficientGoldForFrontierAction("claim");
      requestAttackPreviewForHover();
      renderHud();
      return;
    }
    if (enqueueTarget(to.x, to.y, "normal")) {
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

const isTownSupportNeighbor = (tx: number, ty: number, sx: number, sy: number): boolean => {
  const dx = Math.min(Math.abs(tx - sx), WORLD_WIDTH - Math.abs(tx - sx));
  const dy = Math.min(Math.abs(ty - sy), WORLD_HEIGHT - Math.abs(ty - sy));
  if (dx === 0 && dy === 0) return false;
  return dx <= 1 && dy <= 1;
};

const isTownSupportHighlightableTile = (tile: Tile | undefined): boolean => {
  if (!tile) return false;
  if (tile.terrain !== "LAND") return false;
  if (tile.dockId) return false;
  return true;
};

const supportedOwnedTownsForTile = (tile: Tile): Tile[] => {
  const out: Tile[] = [];
  for (const candidate of state.tiles.values()) {
    if (!candidate.town || candidate.ownerId !== state.me || candidate.ownershipState !== "SETTLED") continue;
    if (candidate.town.populationTier === "SETTLEMENT") continue;
    if (!isTownSupportNeighbor(tile.x, tile.y, candidate.x, candidate.y)) continue;
    out.push(candidate);
  }
  return out.sort((a, b) => a.x - b.x || a.y - b.y);
};

const townHasSupportStructure = (
  town: Tile | undefined,
  structureType: "MARKET" | "GRANARY" | "BANK" | "CARAVANARY" | "FUR_SYNTHESIZER" | "IRONWORKS" | "CRYSTAL_SYNTHESIZER" | "FUEL_PLANT"
): boolean => townHasSupportStructureType(state.tiles.values(), town, state.me, structureType);

const supportedOwnedDocksForTile = (tile: Tile): Tile[] => {
  const out: Tile[] = [];
  for (const candidate of state.tiles.values()) {
    if (!candidate.dockId || candidate.ownerId !== state.me || candidate.ownershipState !== "SETTLED") continue;
    if (!isTownSupportNeighbor(tile.x, tile.y, candidate.x, candidate.y)) continue;
    out.push(candidate);
  }
  return out.sort((a, b) => a.x - b.x || a.y - b.y);
};

const hoverTile = (): Tile | undefined => {
  if (!state.hover) return undefined;
  return state.tiles.get(key(state.hover.x, state.hover.y));
};

const isAdjacent = (ax: number, ay: number, bx: number, by: number): boolean => {
  const dx = Math.min(Math.abs(ax - bx), WORLD_WIDTH - Math.abs(ax - bx));
  const dy = Math.min(Math.abs(ay - by), WORLD_HEIGHT - Math.abs(ay - by));
  return dx <= 1 && dy <= 1 && (dx !== 0 || dy !== 0);
};

const isAdjacentCardinal = (ax: number, ay: number, bx: number, by: number): boolean => {
  const dx = Math.min(Math.abs(ax - bx), WORLD_WIDTH - Math.abs(ax - bx));
  const dy = Math.min(Math.abs(ay - by), WORLD_HEIGHT - Math.abs(ay - by));
  return (dx === 1 && dy === 0) || (dx === 0 && dy === 1);
};

const dockDestinationsFor = (dx: number, dy: number): Array<{ x: number; y: number }> => {
  const out: Array<{ x: number; y: number }> = [];
  const seen = new Set<string>();
  for (const pair of state.dockPairs) {
    if (pair.ax === dx && pair.ay === dy) {
      const k = key(pair.bx, pair.by);
      if (!seen.has(k)) {
        seen.add(k);
        out.push({ x: pair.bx, y: pair.by });
      }
    }
    if (pair.bx === dx && pair.by === dy) {
      const k = key(pair.ax, pair.ay);
      if (!seen.has(k)) {
        seen.add(k);
        out.push({ x: pair.ax, y: pair.ay });
      }
    }
  }
  return out;
};

const pickDockOriginForTarget = (
  tx: number,
  ty: number,
  allowAdjacentToDock = true,
  allowOptimisticExpandOrigin = true
): Tile | undefined => {
  for (const t of state.tiles.values()) {
    if (
      t.ownerId !== state.me ||
      t.terrain !== "LAND" ||
      t.fogged ||
      !t.dockId ||
      (!allowOptimisticExpandOrigin && t.optimisticPending === "expand")
    ) continue;
    const linked = dockDestinationsFor(t.x, t.y);
    for (const d of linked) {
      if ((d.x === tx && d.y === ty) || (allowAdjacentToDock && isAdjacent(d.x, d.y, tx, ty))) return t;
    }
  }
  return undefined;
};

const pickOriginForTarget = (
  tx: number,
  ty: number,
  allowAdjacentToDock = true,
  allowOptimisticExpandOrigin = true
): Tile | undefined => {
  const candidates = [
    state.tiles.get(key(wrapX(tx), wrapY(ty - 1))),
    state.tiles.get(key(wrapX(tx + 1), wrapY(ty))),
    state.tiles.get(key(wrapX(tx), wrapY(ty + 1))),
    state.tiles.get(key(wrapX(tx - 1), wrapY(ty))),
    state.tiles.get(key(wrapX(tx - 1), wrapY(ty - 1))),
    state.tiles.get(key(wrapX(tx + 1), wrapY(ty - 1))),
    state.tiles.get(key(wrapX(tx + 1), wrapY(ty + 1))),
    state.tiles.get(key(wrapX(tx - 1), wrapY(ty + 1)))
  ].filter((t): t is Tile => Boolean(t));
  const adjacent = candidates.find((t) => t.ownerId === state.me && (allowOptimisticExpandOrigin || t.optimisticPending !== "expand"));
  if (adjacent) return adjacent;
  return pickDockOriginForTarget(tx, ty, allowAdjacentToDock, allowOptimisticExpandOrigin);
};

const startingExpansionArrowTargets = (): Array<{ x: number; y: number; dx: number; dy: number }> => {
  if (!state.homeTile) return [];
  if (state.actionInFlight || state.capture || state.actionQueue.length > 0 || state.settleProgressByTile.size > 0) return [];
  const homeKey = key(state.homeTile.x, state.homeTile.y);
  const home = state.tiles.get(homeKey);
  if (!home || home.fogged || home.ownerId !== state.me || home.ownershipState !== "SETTLED") return [];
  for (const tile of state.tiles.values()) {
    if (tile.ownerId !== state.me) continue;
    if (key(tile.x, tile.y) === homeKey) continue;
    if (tile.ownershipState === "FRONTIER" || tile.ownershipState === "SETTLED") return [];
  }

  const dirs = [
    { dx: 0, dy: -1 },
    { dx: 1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 0 },
    { dx: -1, dy: -1 },
    { dx: 1, dy: -1 },
    { dx: 1, dy: 1 },
    { dx: -1, dy: 1 }
  ];
  const out: Array<{ x: number; y: number; dx: number; dy: number }> = [];
  for (const dir of dirs) {
    const x = wrapX(state.homeTile.x + dir.dx);
    const y = wrapY(state.homeTile.y + dir.dy);
    const tile = state.tiles.get(key(x, y));
    if (!tile || tile.fogged || tile.terrain !== "LAND" || tile.ownerId) continue;
    if (!pickOriginForTarget(x, y, false)) continue;
    out.push({ x, y, dx: dir.dx, dy: dir.dy });
  }
  return out;
};

const renderCaptureProgress = (): void =>
  renderCaptureProgressFromModule(state, {
    keyFor: key,
    formatCooldownShort,
    showCaptureAlert,
    pushFeed,
    finalizePredictedCombat: (result) => applyCombatOutcomeMessage(result, { predicted: true }),
    captureCardEl,
    captureWrapEl,
    captureCancelBtn,
    captureCloseBtn,
    captureBarEl,
    captureTitleEl,
    captureTimeEl,
    captureTargetEl
  });

const renderShardAlert = (): void =>
  renderShardAlertFromModule(state, {
    shardAlertOverlayEl,
    shardAlertTitleEl,
    shardAlertDetailEl
  });

const drawStartingExpansionArrow = (px: number, py: number, size: number, dx: number, dy: number): void =>
  drawStartingExpansionArrowFromModule(ctx, px, py, size, dx, dy);

const triangularWave = (t: number): number => triangularWaveFromModule(t);

const settlePixelSeed = (wx: number, wy: number, i: number, salt: number): number =>
  settlePixelSeedFromModule(wx, wy, i, salt);

const settlePixelWaypoint = (wx: number, wy: number, i: number, step: number, axis: "x" | "y"): number =>
  settlePixelWaypointFromModule(wx, wy, i, step, axis);

const settlePixelWanderPoint = (nowMs: number, wx: number, wy: number, i: number): { x: number; y: number } =>
  settlePixelWanderPointFromModule(nowMs, wx, wy, i);
const defensibilityPctFromTE = (t: number | undefined, e: number | undefined): number => {
  if (typeof t !== "number" || Number.isNaN(t) || typeof e !== "number" || Number.isNaN(e)) return state.defensibilityPct;
  return Math.max(0, Math.min(100, defensivenessMultiplier(t, e) * 100));
};

const techTier = (id: string, byId: Map<string, TechInfo>, memo: Map<string, number>): number => {
  const cached = memo.get(id);
  if (typeof cached === "number") return cached;
  const t = byId.get(id);
  if (!t) return 1;
  const parents = t.prereqIds && t.prereqIds.length > 0 ? t.prereqIds : t.requires ? [t.requires] : [];
  if (parents.length === 0) {
    memo.set(id, 1);
    return 1;
  }
  const parentTier = Math.max(...parents.map((p) => techTier(p, byId, memo)));
  const tier = parentTier + 1;
  memo.set(id, tier);
  return tier;
};

const techPrereqIds = (tech: Pick<TechInfo, "prereqIds" | "requires">): string[] =>
  tech.prereqIds && tech.prereqIds.length > 0 ? tech.prereqIds : tech.requires ? [tech.requires] : [];

const orderedTechIdsByTier = (catalog: TechInfo[]): string[] => {
  const byId = new Map(catalog.map((tech) => [tech.id, tech]));
  const tierMemo = new Map<string, number>();
  const tiers = new Map<number, string[]>();
  const childrenById = new Map<string, string[]>();

  for (const tech of catalog) {
    const tier = techTier(tech.id, byId, tierMemo);
    const ids = tiers.get(tier) ?? [];
    ids.push(tech.id);
    tiers.set(tier, ids);
    for (const prereqId of techPrereqIds(tech)) {
      const children = childrenById.get(prereqId) ?? [];
      children.push(tech.id);
      childrenById.set(prereqId, children);
    }
  }

  const tierNumbers = [...tiers.keys()].sort((a, b) => a - b);
  for (const tier of tierNumbers) {
    const ids = tiers.get(tier);
    if (!ids) continue;
    ids.sort((a, b) => {
      const techA = byId.get(a);
      const techB = byId.get(b);
      return (techA?.tier ?? 999) - (techB?.tier ?? 999) || (techA?.name ?? a).localeCompare(techB?.name ?? b);
    });
  }

  const positionMap = (): Map<string, number> => {
    const map = new Map<string, number>();
    for (const tier of tierNumbers) {
      const ids = tiers.get(tier) ?? [];
      ids.forEach((id, index) => map.set(id, index));
    }
    return map;
  };

  const meanPosition = (ids: string[], positions: Map<string, number>): number | null => {
    const values = ids.map((id) => positions.get(id)).filter((value): value is number => typeof value === "number");
    if (values.length === 0) return null;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  };

  const sortTier = (tier: number, anchorsFor: (id: string) => string[]): void => {
    const ids = tiers.get(tier);
    if (!ids || ids.length < 2) return;
    const positions = positionMap();
    ids.sort((a, b) => {
      const anchorA = meanPosition(anchorsFor(a), positions);
      const anchorB = meanPosition(anchorsFor(b), positions);
      if (anchorA !== null && anchorB !== null && anchorA !== anchorB) return anchorA - anchorB;
      if (anchorA !== null && anchorB === null) return -1;
      if (anchorA === null && anchorB !== null) return 1;
      const childA = meanPosition(childrenById.get(a) ?? [], positions);
      const childB = meanPosition(childrenById.get(b) ?? [], positions);
      if (childA !== null && childB !== null && childA !== childB) return childA - childB;
      if (childA !== null && childB === null) return -1;
      if (childA === null && childB !== null) return 1;
      const techA = byId.get(a);
      const techB = byId.get(b);
      return (techA?.tier ?? 999) - (techB?.tier ?? 999) || (techA?.name ?? a).localeCompare(techB?.name ?? b);
    });
  };

  for (let sweep = 0; sweep < 4; sweep += 1) {
    for (const tier of tierNumbers.slice(1)) sortTier(tier, (id) => techPrereqIds(byId.get(id) ?? {}));
    for (const tier of [...tierNumbers].reverse().slice(1)) sortTier(tier, (id) => childrenById.get(id) ?? []);
  }

  return tierNumbers.flatMap((tier) => tiers.get(tier) ?? []);
};

const titleCaseFromId = (value: string): string =>
  value
    .split("-")
    .map((part) => (part ? part[0]!.toUpperCase() + part.slice(1) : part))
    .join(" ");

const techNameList = (ids: string[]): string =>
  ids
    .map((id) => state.techCatalog.find((t) => t.id === id)?.name ?? titleCaseFromId(id))
    .join(", ");

const unlockedByTech = (techId: string): TechInfo[] =>
  state.techCatalog
    .filter((candidate) => {
      const prereqs =
        candidate.prereqIds && candidate.prereqIds.length > 0 ? candidate.prereqIds : candidate.requires ? [candidate.requires] : [];
      return prereqs.includes(techId);
    })
    .sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name));

const effectiveOwnedTechIds = (): string[] => {
  if (!state.pendingTechUnlockId || state.techIds.includes(state.pendingTechUnlockId)) return state.techIds;
  return [...state.techIds, state.pendingTechUnlockId];
};

const effectiveTechChoices = (): string[] =>
  state.pendingTechUnlockId ? state.techChoices.filter((id) => id !== state.pendingTechUnlockId) : state.techChoices;

const isPendingTechUnlock = (techId: string): boolean => state.pendingTechUnlockId === techId;

const renderTechChoiceGrid = (): string =>
  renderTechChoiceGridFromModule({
    state,
    effectiveOwnedTechIds,
    effectiveTechChoices,
    orderedTechIdsByTier,
    techTier,
    techPrereqIds,
    techNameList,
    isPendingTechUnlock,
    formatCooldownShort,
    titleCaseFromId,
    viewportHeight: viewportSize().height,
    isMobile: isMobile()
  });

const selectedTechInfo = (): TechInfo | undefined =>
  selectedTechInfoFromModule({
    techUiSelectedId: state.techUiSelectedId,
    desktopPickValue: techPickEl.value,
    mobilePickValue: mobileTechPickEl.value,
    techCatalog: state.techCatalog
  });

const renderTechDetailPrompt = (): string => renderTechDetailPromptFromModule();

const renderTechDetailCard = (): string =>
  renderTechDetailCardFromModule({
    tech: selectedTechInfo(),
    techDetailOpen: state.techDetailOpen,
    techCatalog: state.techCatalog,
    techPrereqIds,
    unlockedByTech,
    isPendingTechUnlock,
    pendingTechUnlockId: state.pendingTechUnlockId,
    techNameList,
    structureInfoButtonHtml,
    techTier
  });

const renderStructureInfoOverlay = (): string => renderStructureInfoOverlayFromModule(state.structureInfoKey, structureInfoForKey);

const renderTechDetailModal = (): string => {
  const tech = selectedTechInfo();
  if (!tech) return "";
  return renderTechDetailModalFromModule({
    tech,
    techCatalog: state.techCatalog,
    techPrereqIds,
    unlockedByTech,
    isPendingTechUnlock,
    pendingTechUnlockId: state.pendingTechUnlockId,
    techNameList,
    structureInfoButtonHtml,
    techTier,
    formatTechBenefitSummary
  });
};

const techDetailsUseOverlay = (): boolean => isMobile();

const renderDomainChoiceGrid = (): string =>
  renderDomainChoiceGridFromModule({
    domainCatalog: state.domainCatalog,
    domainIds: state.domainIds,
    domainUiSelectedId: state.domainUiSelectedId,
    domainChoices: state.domainChoices,
    techNameList
  });

const renderDomainProgressCard = (): string =>
  renderDomainProgressCardFromModule({
    tiles: state.tiles.values(),
    shardStock: state.strategicResources.SHARD ?? 0,
    domainCatalog: state.domainCatalog,
    domainChoices: state.domainChoices,
    domainIds: state.domainIds
  });

const renderTechDetailOverlay = (): string => {
  if (!state.techDetailOpen) return "";
  return renderTechDetailModal();
};

const renderDomainDetailCard = (): string =>
  renderDomainDetailCardFromModule({
    domainCatalog: state.domainCatalog,
    domainUiSelectedId: state.domainUiSelectedId,
    domainIds: state.domainIds,
    domainChoices: state.domainChoices,
    techNameList
  });

const renderTechChoiceDetails = (): string => {
  return "";
};

const affordableTechChoicesCount = (): number => {
  const catalogById = new Map(state.techCatalog.map((t) => [t.id, t]));
  let n = 0;
  for (const id of effectiveTechChoices()) {
    const t = catalogById.get(id);
    if (t && t.requirements.canResearch) n += 1;
  }
  return n;
};

// HUD and auth flow are wired below after socket setup.

const defaultWsUrl = (() => {
  const isLocalHost =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1" ||
    window.location.hostname === "0.0.0.0";
  if (isLocalHost) return `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.hostname}:3001/ws`;
  return "wss://border-empires.fly.dev/ws";
})();
const wsUrl = (import.meta.env.VITE_WS_URL as string | undefined) ?? defaultWsUrl;
const ws = new WebSocket(wsUrl);
const authFlow = createClientAuthFlow({
  state,
  dom: {
    allianceBreakBtn,
    allianceBreakIdEl,
    alliancePlayerInspectEl,
    allianceRequestsEl,
    allianceSendBtn,
    allianceTargetEl,
    alliesListEl,
    authColorPresetButtons,
    authBusyCopyEl,
    authBusyModalEl,
    authBusyTitleEl,
    authDisplayNameEl,
    authEmailEl,
    authEmailLinkBtn,
    authEmailResetBtn,
    authEmailSentAddressEl,
    authGoogleBtn,
    authLoginBtn,
    authOverlayEl,
    authPanelEl,
    authPasswordEl,
    authProfileColorEl,
    authProfileNameEl,
    authProfileSaveBtn,
    authRegisterBtn,
    authStatusEl,
    canvas,
    captureBarEl,
    captureCancelBtn,
    captureCloseBtn,
    captureCardEl,
    captureTargetEl,
    captureTimeEl,
    captureTitleEl,
    captureWrapEl,
    centerMeBtn,
    centerMeDesktopBtn,
    collectVisibleDesktopBtn,
    collectVisibleDesktopMetaEl,
    collectVisibleMobileBtn,
    collectVisibleMobileMetaEl,
    ctx,
    feedEl,
    guideOverlayEl,
    holdBuildMenuEl,
    hoverEl,
    hud,
    leaderboardEl,
    mapLoadingMetaEl,
    mapLoadingOverlayEl,
    mapLoadingRowEl,
    mapLoadingSpinnerEl,
    mapLoadingTitleEl,
    miniMapBase,
    miniMapCtx,
    miniMapEl,
    miniMapLabelEl,
    miniMapWrapEl,
    missionsEl,
    mobileAllianceBreakBtn,
    mobileAllianceBreakIdEl,
    mobileAlliancePlayerInspectEl,
    mobileAllianceRequestsEl,
    mobileAllianceSendBtn,
    mobileAllianceTargetEl,
    mobileAlliesListEl,
    mobileCoreEl,
    mobileCoreHelpEl,
    mobilePanelDefensibilityEl,
    mobileFeedEl,
    mobileLeaderboardEl,
    mobilePanelCoreEl,
    mobilePanelEconomyEl,
    mobilePanelManpowerEl,
    mobilePanelIntelEl,
    mobilePanelDomainsEl,
    mobilePanelMissionsEl,
    mobilePanelSocialEl,
    mobilePanelTechEl,
    mobileSheetEl,
    mobileSheetHeadEl,
    mobileTechChoiceDetailsEl,
    mobileTechChoicesGridEl,
    mobileTechChooseBtn,
    mobileTechCurrentModsEl,
    mobileTechDetailCardEl,
    mobileTechOwnedEl,
    mobileTechPickEl,
    mobileTechPointsEl,
    mobileTechTreeExpandToggleEl,
    panelActionButtons,
    panelAllianceEl,
    panelCloseBtn,
    panelDomainsEl,
    panelDomainsContentEl,
    panelDefensibilityEl,
    panelEconomyEl,
    panelManpowerEl,
    panelFeedEl,
    panelLeaderboardEl,
    panelMissionsEl,
    panelTechEl,
    panelTitleEl,
    selectedEl,
    shardAlertCardEl,
    shardAlertCloseBtn,
    shardAlertDetailEl,
    shardAlertOverlayEl,
    shardAlertTitleEl,
    sidePanelBodyEl,
    sidePanelEl,
    statsChipsEl,
    structureInfoOverlayEl,
    techDetailOverlayEl,
    targetingOverlayEl,
    techChoiceDetailsEl,
    techChoicesGridEl,
    techChooseBtn,
    techCurrentModsEl,
    techDetailCardEl,
    techOwnedEl,
    techPickEl,
    techPointsEl,
    techTreeExpandToggleEl,
    tileActionMenuEl
  },
  firebaseAuth,
  googleProvider,
  ws,
  wsUrl,
  requireAuthedSession: (message?: string) => requireAuthedSession(message),
  renderHud: () => renderHud()
});
const { authSession, setAuthStatus, syncAuthPanelState, syncAuthOverlay, authLabelForUser, seedProfileSetupFields, authenticateSocket } = authFlow;
const renderHud = (): void =>
  renderClientHud({
    state,
    dom: {
      alliancePlayerInspectEl,
      allianceRequestsEl,
      alliesListEl,
      authOverlayEl,
      canvas,
      collectVisibleDesktopBtn,
      collectVisibleDesktopMetaEl,
      collectVisibleMobileBtn,
      collectVisibleMobileMetaEl,
      feedEl,
      guideOverlayEl,
      hoverEl,
      hud,
      leaderboardEl,
      mapLoadingMetaEl,
      mapLoadingOverlayEl,
      mapLoadingTitleEl,
      miniMapLabelEl,
      missionsEl,
      mobileAlliancePlayerInspectEl,
      mobileAllianceRequestsEl,
      mobileAlliesListEl,
      mobileCoreHelpEl,
      mobilePanelDefensibilityEl,
      mobileFeedEl,
      mobileLeaderboardEl,
      mobilePanelDomainsEl,
      mobilePanelEconomyEl,
      mobilePanelManpowerEl,
      mobilePanelMissionsEl,
      mobilePanelTechEl,
      mobileTechChoiceDetailsEl,
      mobileTechChoicesGridEl,
      mobileTechChooseBtn,
      mobileTechCurrentModsEl,
      mobileTechDetailCardEl,
      mobileTechOwnedEl,
      mobileTechPickEl,
      mobileTechPointsEl,
      mobileTechTreeExpandToggleEl,
      panelActionButtons,
      panelDefensibilityEl,
      panelDomainsEl,
      panelDomainsContentEl,
      panelEconomyEl,
      panelManpowerEl,
      panelTechEl,
      selectedEl,
      statsChipsEl,
      structureInfoOverlayEl,
      techDetailOverlayEl,
      targetingOverlayEl,
      techChoiceDetailsEl,
      techChoicesGridEl,
      techChooseBtn,
      techCurrentModsEl,
      techDetailCardEl,
      techOwnedEl,
      techPickEl,
      techPointsEl,
      techTreeExpandToggleEl,
      tileActionMenuEl,
      mapLoadingRowEl,
      mapLoadingSpinnerEl,
      shardAlertCardEl,
      shardAlertCloseBtn,
      shardAlertDetailEl,
      shardAlertOverlayEl,
      shardAlertTitleEl
    },
    miniMapReplayEl,
    wsUrl,
    firebaseAuth,
    syncAuthOverlay,
    storageSet,
    visibleCollectSummary,
    developmentSlotSummary,
    isMobile,
    rateToneClass,
    formatGoldAmount,
    formatManpowerAmount,
    strategicRibbonHtml,
    formatCooldownShort,
    openEconomyPanel,
    setActivePanel,
    affordableTechChoicesCount,
    mobileNavLabelHtml,
    crystalTargetingTone,
    crystalTargetingTitle,
    clearCrystalTargeting,
    keyFor: key,
    parseKey,
    selectedTile,
    requestTileDetailIfNeeded,
    passiveTileGuidanceHtml,
    renderTileActionMenu,
    tileMenuViewForTile,
    renderCaptureProgress,
    renderShardAlert,
    renderTechChoiceGrid,
    techDetailsUseOverlay,
    renderTechDetailPrompt,
    renderTechDetailCard,
    renderStructureInfoOverlay,
    renderTechDetailOverlay,
    techOwnedHtml,
    effectiveOwnedTechIds,
    isPendingTechUnlock,
    renderTechChoiceDetails,
    techCurrentModsHtml,
    bindTechTreeDragScroll,
    chooseTech,
    renderDomainProgressCard,
    renderDomainChoiceGrid,
    domainOwnedHtml,
    renderDomainDetailCard,
    sendGameMessage,
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
    effectiveTechChoices,
    renderManpowerPanelHtml
  });
const resize = (): void => resizeClientViewport({ dom: { canvas }, viewportSize });
window.addEventListener("resize", resize);
window.visualViewport?.addEventListener("resize", resize);
resize();
authFlow.bindAuthUi();
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
const sendGameMessage = (payload: unknown, message?: string): boolean => {
  if (!requireAuthedSession(message)) return false;
  ws.send(JSON.stringify(payload));
  return true;
};
const requestTileDetailIfNeeded = (tile: Tile | undefined): void => {
  if (!tile || tile.fogged || tile.detailLevel === "full") return;
  if (ws.readyState !== ws.OPEN || !state.authSessionReady) return;
  const tileKey = key(tile.x, tile.y);
  const lastRequestedAt = state.tileDetailRequestedAt.get(tileKey) ?? 0;
  if (Date.now() - lastRequestedAt < 1500) return;
  ws.send(JSON.stringify({ type: "REQUEST_TILE_DETAIL", x: tile.x, y: tile.y }));
  state.tileDetailRequestedAt.set(tileKey, Date.now());
};

const playerActionDeps = () => ({
  state,
  techPickEl,
  mobileTechPickEl,
  ws,
  wsUrl,
  setAuthStatus,
  syncAuthOverlay,
  pushFeed,
  renderHud,
  sendGameMessage
});

const sendAllianceRequest = (target: string): void => sendAllianceRequestFromUi(target, playerActionDeps());
const sendTruceRequest = (targetPlayerName: string, durationHours: 12 | 24): void =>
  sendTruceRequestFromUi(targetPlayerName, durationHours, playerActionDeps());
const breakAlliance = (target: string): void => breakAllianceFromUi(target, playerActionDeps());
const breakTruce = (targetPlayerId: string): void => breakTruceFromUi(targetPlayerId, playerActionDeps());
const activeTruceWithPlayer = (playerId?: string | null): ActiveTruceView | undefined =>
  activeTruceWithPlayerFromState(state, playerId);
const chooseTech = (techIdRaw?: string): void => chooseTechFromUi(techIdRaw, playerActionDeps());

const explainActionFailure = (code: string, message: string): string => explainActionFailureFromServer(code, message);

const enqueueTarget = (x: number, y: number, mode: "normal" | "breakthrough" = "normal"): boolean =>
  enqueueTargetFromModule(state, x, y, key, mode);

const worldTileRawFromPointer = (offsetX: number, offsetY: number): { gx: number; gy: number } =>
  worldTileRawFromPointerFromModule(state, canvas, offsetX, offsetY);

const computeDragPreview = (): void =>
  computeDragPreviewFromModule({ state, canvas, wrapX, wrapY, keyFor: key, hasCollectableYield });

const buildFrontierQueue = (
  candidates: string[],
  enqueue: (x: number, y: number) => boolean
): { queued: number; skipped: number; queuedKeys: string[] } =>
  buildFrontierQueueFromModule(state, candidates, { keyFor: key, parseKey, wrapX, wrapY, enqueue });
const queueDragSelection = (): { queued: number; skipped: number } =>
  buildFrontierQueue([...state.dragPreviewKeys], (x, y) => enqueueTarget(x, y));

const applyPendingSettlementsFromServer = (
  entries: Array<{ x: number; y: number; startedAt: number; resolvesAt: number }> | undefined
): void =>
  applyPendingSettlementsFromServerFromModule(state, entries, {
    keyFor: key,
    syncOptimisticSettlementTile,
    clearOptimisticTileState,
    requestViewRefresh
  });

const queueSpecificTargets = (
  targetKeys: string[],
  mode: "normal" | "breakthrough"
): { queued: number; skipped: number; queuedKeys: string[] } =>
  queueSpecificTargetsFromModule(state, targetKeys, mode, {
    parseKey,
    keyFor: key,
    isTileOwnedByAlly,
    pickOriginForTarget,
    enqueueTarget,
    buildFrontierQueue
  });

const attackQueueFailureReason = (tile: Tile, mode: "normal" | "breakthrough"): string =>
  attackQueueFailureReasonFromModule(state, tile, mode, { ownerSpawnShieldActive, hasBreakthroughCapability, pickOriginForTarget });

const dropQueuedTargetKeyIfAbsent = (targetKey: string): void => dropQueuedTargetKeyIfAbsentFromModule(state, targetKey, { keyFor: key });

const reconcileActionQueue = (): void =>
  reconcileActionQueueFromModule(state, { keyFor: key, pickOriginForTarget, clearOptimisticTileState });

const requestSettlement = (
  x: number,
  y: number,
  opts?: { allowQueueWhenBusy?: boolean; fromQueue?: boolean; suppressWarnings?: boolean }
): boolean =>
  requestSettlementFromModule(state, x, y, {
    keyFor: key,
    pushFeed,
    renderHud,
    queueDevelopmentAction,
    developmentSlotSummary,
    developmentSlotReason,
    sendGameMessage,
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
    keyFor: key,
    queueDevelopmentAction,
    developmentSlotSummary,
    developmentSlotReason,
    pushFeed,
    renderHud,
    sendGameMessage
  });

const processDevelopmentQueue = (): boolean =>
  processDevelopmentQueueFromModule(state, {
    ws,
    authSessionReady: state.authSessionReady,
    developmentSlotSummary,
    requestSettlement: (x, y, opts) => requestSettlement(x, y, opts),
    sendDevelopmentBuild: (payload, optimistic, opts) => sendDevelopmentBuild(payload, optimistic, opts),
    applyOptimisticStructureBuild,
    pushFeed,
    renderHud
  });

const processActionQueue = (): boolean =>
  processActionQueueFromModule(state, {
    ws,
    authSessionReady: state.authSessionReady,
    keyFor: key,
    isAdjacent,
    pickOriginForTarget,
    notifyInsufficientGoldForFrontierAction,
    applyOptimisticTileState,
    pushFeed,
    renderHud
  });

const applyCombatOutcomeMessage = (msg: Record<string, unknown>, opts?: { predicted?: boolean }): void => {
  const target = msg.target as { x: number; y: number } | undefined;
  const targetBefore = (() => (target ? state.tiles.get(key(target.x, target.y)) : undefined))();
  const originBefore = (() => {
    const origin = msg.origin as { x: number; y: number } | undefined;
    return origin ? state.tiles.get(key(origin.x, origin.y)) : undefined;
  })();
  const changes =
    (msg.changes as Array<{ x: number; y: number; ownerId?: string; ownershipState?: "FRONTIER" | "SETTLED" | "BARBARIAN"; breachShockUntil?: number }>) ??
    [];
  const resolvedCaptureTargetKey = state.capture ? key(state.capture.target.x, state.capture.target.y) : "";
  for (const c of changes) {
    const tileKey = key(c.x, c.y);
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
    const merged = mergeServerTileWithOptimisticState(incoming);
    if (!merged.optimisticPending) clearOptimisticTileState(tileKey);
    state.tiles.set(tileKey, merged);
  }
  const resultAlert = combatResolutionAlert(msg, {
    targetTileBefore: targetBefore,
    originTileBefore: originBefore
  });
  const resultTargetKey = target ? key(target.x, target.y) : "";
  const predictedAlreadyShown = Boolean(
    (state.pendingCombatReveal &&
      state.pendingCombatReveal.targetKey === resultTargetKey &&
      state.pendingCombatReveal.revealed &&
      state.pendingCombatReveal.title === resultAlert.title &&
      state.pendingCombatReveal.detail === resultAlert.detail) ||
      (resultTargetKey && wasPredictedCombatAlreadyShown(state.revealedPredictedCombatByKey, resultTargetKey, resultAlert.title, resultAlert.detail))
  );
  if (!predictedAlreadyShown) {
    pushFeed(resultAlert.detail, "combat", resultAlert.tone === "success" ? "success" : "warn");
    showCaptureAlert(resultAlert.title, resultAlert.detail, resultAlert.tone, resultAlert.manpowerLoss);
  }
  if (resultTargetKey) {
    if (opts?.predicted) state.revealedPredictedCombatByKey.set(resultTargetKey, { title: resultAlert.title, detail: resultAlert.detail });
    else state.revealedPredictedCombatByKey.delete(resultTargetKey);
  }
  if (state.pendingCombatReveal && state.pendingCombatReveal.targetKey === resultTargetKey) state.pendingCombatReveal = undefined;
  const resolvedCurrentKey = state.actionCurrent ? key(state.actionCurrent.x, state.actionCurrent.y) : "";
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

const requestAttackPreviewForHover = (): void =>
  requestAttackPreviewForHoverFromModule(state, {
    ws,
    authSessionReady: state.authSessionReady,
    keyFor: key
  });

const requestAttackPreviewForTarget = (to: Tile): void =>
  requestAttackPreviewForTargetFromModule(state, to, {
    ws,
    authSessionReady: state.authSessionReady,
    keyFor: key,
    pickOriginForTarget
  });

const attackPreviewDetailForTarget = (to: Tile, mode: "normal" | "breakthrough" = "normal"): string | undefined =>
  attackPreviewDetailForTargetFromModule(state, to, { keyFor: key, pickOriginForTarget }, mode);
const buildFortOnSelected = (): void => buildFortOnSelectedFromModule(state, { pushFeed, renderHud, sendGameMessage });
const settleSelected = (): void => settleSelectedFromModule(state, { keyFor: key, pushFeed, renderHud, requestSettlement });
const buildSiegeOutpostOnSelected = (): void => buildSiegeOutpostOnSelectedFromModule(state, { pushFeed, renderHud, sendGameMessage });
const uncaptureSelected = (): void => uncaptureSelectedFromModule(state, { keyFor: key, pushFeed, renderHud, sendGameMessage });
const cancelOngoingCapture = (): void => cancelOngoingCaptureFromModule(state, sendGameMessage);
const collectVisibleYield = (): void =>
  collectVisibleYieldFromModule(state, {
    formatCooldownShort,
    showCollectVisibleCooldownAlert,
    pushFeed,
    renderHud,
    applyOptimisticVisibleCollect,
    sendGameMessage
  });
const collectSelectedYield = (): void =>
  collectSelectedYieldFromModule(state, { keyFor: key, renderHud, applyOptimisticTileCollect, sendGameMessage });

const collectSelectedShard = (): void =>
  collectSelectedShardFromModule(state, { keyFor: key, renderHud, sendGameMessage });

const hideHoldBuildMenu = (): void => hideHoldBuildMenuFromModule(holdBuildMenuEl);

const hideTileActionMenu = (): void => hideTileActionMenuFromModule(state, tileActionMenuEl);

const tileActionIsCrystal = (id: TileActionDef["id"]): boolean => tileActionIsCrystalFromModule(id);

const tileActionIsBuilding = (id: TileActionDef["id"]): boolean => tileActionIsBuildingFromModule(id);

const requiredTechForTileAction = (actionId: TileActionDef["id"]): string | undefined => requiredTechForTileActionFromModule(actionId);

const hideTechLockedTileAction = (action: TileActionDef): boolean => hideTechLockedTileActionFromModule(action, state);

const splitTileActionsIntoTabs = (actions: TileActionDef[]): Pick<TileMenuView, "actions" | "buildings" | "crystal"> =>
  splitTileActionsIntoTabsFromModule(actions, state);
const isTileOwnedByAlly = (tile: Tile): boolean => isTileOwnedByAllyFromModule(tile, state);

const chebyshevDistanceClient = (ax: number, ay: number, bx: number, by: number): number =>
  chebyshevDistanceClientFromModule(ax, ay, bx, by);

const hostileObservatoryProtectingTile = (tile: Tile): Tile | undefined => hostileObservatoryProtectingTileFromModule(state, tile);

const developmentSlotSummary = (): DevelopmentSlotSummary => developmentSlotSummaryFromModule(state, { busyDevelopmentProcessCount });

const developmentSlotReason = (summary = developmentSlotSummary()): string => developmentSlotReasonFromModule(summary);

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

const abilityCooldownRemainingMs = (
  abilityId: "aether_bridge" | "siphon" | "reveal_empire" | "create_mountain" | "remove_mountain"
): number =>
  Math.max(0, (state.abilityCooldowns[abilityId] ?? 0) - Date.now());

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
  clearSettlementProgressForTileFromModule(state, x, y, { keyFor: key, clearSettlementProgressByKey });

type QueuedDevelopmentAction = ClientState["developmentQueue"][number];

const queueDevelopmentAction = (entry: QueuedDevelopmentAction): boolean =>
  queueDevelopmentActionFromModule(state, entry, { pushFeed, renderHud });

const syncOptimisticSettlementTile = (x: number, y: number, awaitingServerConfirm: boolean): void =>
  syncOptimisticSettlementTileFromModule(state, x, y, awaitingServerConfirm, { applyOptimisticTileState });

const settlementProgressForTile = (x: number, y: number): TileTimedProgress | undefined =>
  settlementProgressForTileFromModule(state, x, y, { keyFor: key, syncOptimisticSettlementTile, requestViewRefresh });

const queuedDevelopmentEntryForTile = (tileKey: string): QueuedDevelopmentAction | undefined =>
  queuedDevelopmentEntryForTileFromModule(state, tileKey);

const queuedSettlementIndexForTile = (tileKey: string): number => queuedSettlementIndexForTileFromModule(state, tileKey);

const cancelQueuedSettlement = (tileKey: string): boolean => cancelQueuedSettlementFromModule(state, tileKey, { pushFeed, renderHud });

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
  if (tile.observatory?.status === "under_construction" && typeof tile.observatory.completesAt === "number") {
    return `Building Observatory... ${formatCountdownClock(tile.observatory.completesAt - Date.now())}`;
  }
  if (tile.siegeOutpost?.status === "under_construction" && typeof tile.siegeOutpost.completesAt === "number") {
    return `Building Siege Camp... ${formatCountdownClock(tile.siegeOutpost.completesAt - Date.now())}`;
  }
  if (tile.economicStructure?.status === "under_construction" && typeof tile.economicStructure.completesAt === "number") {
    return `Building ${economicStructureName(tile.economicStructure.type)}... ${formatCountdownClock(tile.economicStructure.completesAt - Date.now())}`;
  }
  return "";
};

const constructionRemainingMsForTile = (tile: Tile): number | undefined => {
  const completesAt =
    tile.fort?.status === "under_construction"
      ? tile.fort.completesAt
      : tile.observatory?.status === "under_construction"
        ? tile.observatory.completesAt
        : tile.siegeOutpost?.status === "under_construction"
          ? tile.siegeOutpost.completesAt
          : tile.economicStructure?.status === "under_construction"
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
    keyFor: key,
    queuedDevelopmentEntryForTile,
    queuedSettlementIndexForTile
  });

const menuOverviewForTile = (tile: Tile): TileOverviewLine[] =>
  menuOverviewForTileFromModule(tile, {
    state,
    prettyToken,
    terrainLabel,
    displayTownGoldPerMinute,
    populationPerMinuteLabel,
    townNextGrowthEtaLabel,
    supportedOwnedTownsForTile,
    hostileObservatoryProtectingTile,
    constructionCountdownLineForTile,
    tileHistoryLines,
    isTileOwnedByAlly,
    growthModifierPercentLabel
  });

const tileMenuViewForTile = (tile: Tile): TileMenuView =>
  tileMenuViewForTileFromModule(tile, {
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
    constructionProgressForTile,
    menuOverviewForTile,
    prettyToken,
    terrainLabel,
    isTileOwnedByAlly,
    state
  });

const tileActionLogicDeps = () => ({
  keyFor: key,
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
  hideHoldBuildMenu,
  selectedTile,
  renderHud,
  requireAuthedSession,
  ws,
  attackPreviewDetailForTarget,
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
  ownerSpawnShieldActive
});

const hasRevealCapability = (): boolean => hasRevealCapabilityFromModule(state);
const hasBreakthroughCapability = (): boolean => hasBreakthroughCapabilityFromModule(state);
const hasAetherBridgeCapability = (): boolean => hasAetherBridgeCapabilityFromModule(state);
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
  sendGameMessage,
  applyOptimisticStructureCancel,
  renderHud,
  requestAttackPreviewForTarget,
  keyFor: key,
  hasBreakthroughCapability,
  isTileOwnedByAlly
});

const renderTileActionMenu = (view: TileMenuView, clientX: number, clientY: number): void =>
  renderTileActionMenuFromModule(state, view, clientX, clientY, tileActionMenuUiDeps());

const openSingleTileActionMenu = (tile: Tile, clientX: number, clientY: number): void =>
  openSingleTileActionMenuFromModule(state, tile, clientX, clientY, tileActionMenuUiDeps());

const openBulkTileActionMenu = (targetKeys: string[], clientX: number, clientY: number): void =>
  openBulkTileActionMenuFromModule(state, targetKeys, clientX, clientY, tileActionMenuUiDeps());

const handleTileAction = (actionId: string, targetKeyOverride?: string, originKeyOverride?: string): void => {
  const singleTargetKey = state.tileActionMenu.mode === "single" ? state.tileActionMenu.currentTileKey : "";
  const selected = singleTargetKey
    ? state.tiles.get(singleTargetKey)
    : state.selected
      ? state.tiles.get(key(state.selected.x, state.selected.y))
      : undefined;
  const bulkKeys = state.tileActionMenu.mode === "bulk" ? state.tileActionMenu.bulkKeys : [];
  const fromBulk = bulkKeys.length > 0;
  const targets = fromBulk ? bulkKeys : selected ? [key(selected.x, selected.y)] : [];
  if (targets.length === 0) {
    hideTileActionMenu();
    return;
  }

  if (actionId === "settle_land") {
    if (fromBulk) {
      const neutralTargets = targets.filter((k) => {
        const t = state.tiles.get(k);
        return t && t.terrain === "LAND" && !t.ownerId;
      });
      const out = queueSpecificTargets(neutralTargets, "normal");
      if (out.queued > 0) processActionQueue();
      pushFeed(
        out.queued > 0
          ? `Queued ${out.queued} frontier captures${out.skipped > 0 ? ` (${out.skipped} unreachable)` : ""}.`
          : "No frontier claims queued. Targets must touch your territory and you need enough gold.",
        "combat",
        out.queued > 0 ? "info" : "warn"
      );
    } else if (selected) {
      const k = key(selected.x, selected.y);
      if (!selected.ownerId) {
        const out = queueSpecificTargets([k], "normal");
        if (out.queued > 0) {
          processActionQueue();
          pushFeed(`Queued frontier capture at (${selected.x}, ${selected.y}).`, "combat", "info");
        } else {
          pushFeed("Cannot claim this tile yet. It must touch your territory and you need enough gold.", "combat", "warn");
        }
      } else if (selected.ownerId === state.me && selected.ownershipState === "FRONTIER") {
        if (requestSettlement(selected.x, selected.y)) pushFeed(`Settlement started at (${selected.x}, ${selected.y}).`, "combat", "info");
      }
      state.autoSettleTargets.delete(k);
    }
    hideTileActionMenu();
    return;
  }
  if (actionId === "launch_attack" || actionId === "launch_breach_attack") {
    const enemyTargets = targets.filter((k) => {
      const t = state.tiles.get(k);
      return t && t.terrain === "LAND" && t.ownerId && t.ownerId !== state.me && !isTileOwnedByAlly(t);
    });
    const mode = actionId === "launch_breach_attack" ? "breakthrough" : "normal";
    const out = queueSpecificTargets(enemyTargets, mode);
    if (out.queued > 0) processActionQueue();
    if (out.queued > 0) {
      pushFeed(`Queued ${out.queued} attacks${out.skipped > 0 ? ` (${out.skipped} unreachable)` : ""}.`, "combat", "warn");
    } else {
      const singleTile = !fromBulk && selected ? selected : undefined;
      const failureMessage = singleTile
        ? attackQueueFailureReason(singleTile, mode)
        : `Cannot launch ${mode === "breakthrough" ? "breakthrough " : ""}attack for one or more selected tiles.`;
      showCaptureAlert(`${mode === "breakthrough" ? "Breach attack" : "Attack"} failed`, failureMessage, "warn");
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
  if (actionId === "collect_yield") collectSelectedYield();
  if (actionId === "collect_shard") collectSelectedShard();
  if (actionId === "build_fortification")
    sendDevelopmentBuild({ type: "BUILD_FORT", x: selected.x, y: selected.y }, () => applyOptimisticStructureBuild(selected.x, selected.y, "FORT"), {
      x: selected.x,
      y: selected.y,
      label: `Fortification at (${selected.x}, ${selected.y})`,
      optimisticKind: "FORT"
    });
  if (actionId === "build_wooden_fort")
    sendDevelopmentBuild(
      { type: "BUILD_ECONOMIC_STRUCTURE", x: selected.x, y: selected.y, structureType: "WOODEN_FORT" },
      () => applyOptimisticStructureBuild(selected.x, selected.y, "WOODEN_FORT"),
      { x: selected.x, y: selected.y, label: `Wooden Fort at (${selected.x}, ${selected.y})`, optimisticKind: "WOODEN_FORT" }
    );
  if (actionId === "build_observatory")
    sendDevelopmentBuild({ type: "BUILD_OBSERVATORY", x: selected.x, y: selected.y }, () => applyOptimisticStructureBuild(selected.x, selected.y, "OBSERVATORY"), {
      x: selected.x,
      y: selected.y,
      label: `Observatory at (${selected.x}, ${selected.y})`,
      optimisticKind: "OBSERVATORY"
    });
  if (
    actionId === "build_farmstead"
  )
    sendDevelopmentBuild(
      { type: "BUILD_ECONOMIC_STRUCTURE", x: selected.x, y: selected.y, structureType: "FARMSTEAD" },
      () => applyOptimisticStructureBuild(selected.x, selected.y, "FARMSTEAD"),
      { x: selected.x, y: selected.y, label: `Farmstead at (${selected.x}, ${selected.y})`, optimisticKind: "FARMSTEAD" }
    );
  if (actionId === "build_camp")
    sendDevelopmentBuild({ type: "BUILD_ECONOMIC_STRUCTURE", x: selected.x, y: selected.y, structureType: "CAMP" }, () => applyOptimisticStructureBuild(selected.x, selected.y, "CAMP"), {
      x: selected.x,
      y: selected.y,
      label: `Camp at (${selected.x}, ${selected.y})`,
      optimisticKind: "CAMP"
    });
  if (actionId === "build_mine")
    sendDevelopmentBuild({ type: "BUILD_ECONOMIC_STRUCTURE", x: selected.x, y: selected.y, structureType: "MINE" }, () => applyOptimisticStructureBuild(selected.x, selected.y, "MINE"), {
      x: selected.x,
      y: selected.y,
      label: `Mine at (${selected.x}, ${selected.y})`,
      optimisticKind: "MINE"
    });
  if (actionId === "build_market")
    sendDevelopmentBuild({ type: "BUILD_ECONOMIC_STRUCTURE", x: selected.x, y: selected.y, structureType: "MARKET" }, () => applyOptimisticStructureBuild(selected.x, selected.y, "MARKET"), {
      x: selected.x,
      y: selected.y,
      label: `Market at (${selected.x}, ${selected.y})`,
      optimisticKind: "MARKET"
    });
  if (actionId === "build_granary")
    sendDevelopmentBuild({ type: "BUILD_ECONOMIC_STRUCTURE", x: selected.x, y: selected.y, structureType: "GRANARY" }, () => applyOptimisticStructureBuild(selected.x, selected.y, "GRANARY"), {
      x: selected.x,
      y: selected.y,
      label: `Granary at (${selected.x}, ${selected.y})`,
      optimisticKind: "GRANARY"
    });
  if (actionId === "build_bank")
    sendDevelopmentBuild({ type: "BUILD_ECONOMIC_STRUCTURE", x: selected.x, y: selected.y, structureType: "BANK" }, () => applyOptimisticStructureBuild(selected.x, selected.y, "BANK"), {
      x: selected.x,
      y: selected.y,
      label: `Bank at (${selected.x}, ${selected.y})`,
      optimisticKind: "BANK"
    });
  if (actionId === "build_airport")
    sendDevelopmentBuild({ type: "BUILD_ECONOMIC_STRUCTURE", x: selected.x, y: selected.y, structureType: "AIRPORT" }, () => applyOptimisticStructureBuild(selected.x, selected.y, "AIRPORT"), {
      x: selected.x,
      y: selected.y,
      label: `Airport at (${selected.x}, ${selected.y})`,
      optimisticKind: "AIRPORT"
    });
  if (actionId === "build_caravanary")
    sendDevelopmentBuild({ type: "BUILD_ECONOMIC_STRUCTURE", x: selected.x, y: selected.y, structureType: "CARAVANARY" }, () => applyOptimisticStructureBuild(selected.x, selected.y, "CARAVANARY"), {
      x: selected.x,
      y: selected.y,
      label: `Caravanary at (${selected.x}, ${selected.y})`,
      optimisticKind: "CARAVANARY"
    });
  if (actionId === "build_fur_synthesizer")
    sendDevelopmentBuild({ type: "BUILD_ECONOMIC_STRUCTURE", x: selected.x, y: selected.y, structureType: "FUR_SYNTHESIZER" }, () => applyOptimisticStructureBuild(selected.x, selected.y, "FUR_SYNTHESIZER"), {
      x: selected.x,
      y: selected.y,
      label: `Fur Synthesizer at (${selected.x}, ${selected.y})`,
      optimisticKind: "FUR_SYNTHESIZER"
    });
  if (actionId === "upgrade_fur_synthesizer")
    sendDevelopmentBuild(
      { type: "BUILD_ECONOMIC_STRUCTURE", x: selected.x, y: selected.y, structureType: "ADVANCED_FUR_SYNTHESIZER" },
      () => applyOptimisticStructureBuild(selected.x, selected.y, "ADVANCED_FUR_SYNTHESIZER"),
      { x: selected.x, y: selected.y, label: `Advanced Fur Synthesizer at (${selected.x}, ${selected.y})`, optimisticKind: "ADVANCED_FUR_SYNTHESIZER" }
    );
  if (actionId === "build_ironworks")
    sendDevelopmentBuild({ type: "BUILD_ECONOMIC_STRUCTURE", x: selected.x, y: selected.y, structureType: "IRONWORKS" }, () => applyOptimisticStructureBuild(selected.x, selected.y, "IRONWORKS"), {
      x: selected.x,
      y: selected.y,
      label: `Ironworks at (${selected.x}, ${selected.y})`,
      optimisticKind: "IRONWORKS"
    });
  if (actionId === "upgrade_ironworks")
    sendDevelopmentBuild(
      { type: "BUILD_ECONOMIC_STRUCTURE", x: selected.x, y: selected.y, structureType: "ADVANCED_IRONWORKS" },
      () => applyOptimisticStructureBuild(selected.x, selected.y, "ADVANCED_IRONWORKS"),
      { x: selected.x, y: selected.y, label: `Advanced Ironworks at (${selected.x}, ${selected.y})`, optimisticKind: "ADVANCED_IRONWORKS" }
    );
  if (actionId === "build_crystal_synthesizer")
    sendDevelopmentBuild(
      { type: "BUILD_ECONOMIC_STRUCTURE", x: selected.x, y: selected.y, structureType: "CRYSTAL_SYNTHESIZER" },
      () => applyOptimisticStructureBuild(selected.x, selected.y, "CRYSTAL_SYNTHESIZER"),
      { x: selected.x, y: selected.y, label: `Crystal Synthesizer at (${selected.x}, ${selected.y})`, optimisticKind: "CRYSTAL_SYNTHESIZER" }
    );
  if (actionId === "upgrade_crystal_synthesizer")
    sendDevelopmentBuild(
      { type: "BUILD_ECONOMIC_STRUCTURE", x: selected.x, y: selected.y, structureType: "ADVANCED_CRYSTAL_SYNTHESIZER" },
      () => applyOptimisticStructureBuild(selected.x, selected.y, "ADVANCED_CRYSTAL_SYNTHESIZER"),
      { x: selected.x, y: selected.y, label: `Advanced Crystal Synthesizer at (${selected.x}, ${selected.y})`, optimisticKind: "ADVANCED_CRYSTAL_SYNTHESIZER" }
    );
  if (actionId === "build_fuel_plant")
    sendDevelopmentBuild({ type: "BUILD_ECONOMIC_STRUCTURE", x: selected.x, y: selected.y, structureType: "FUEL_PLANT" }, () => applyOptimisticStructureBuild(selected.x, selected.y, "FUEL_PLANT"), {
      x: selected.x,
      y: selected.y,
      label: `Fuel Plant at (${selected.x}, ${selected.y})`,
      optimisticKind: "FUEL_PLANT"
    });
  if (actionId === "build_foundry")
    sendDevelopmentBuild({ type: "BUILD_ECONOMIC_STRUCTURE", x: selected.x, y: selected.y, structureType: "FOUNDRY" }, () => applyOptimisticStructureBuild(selected.x, selected.y, "FOUNDRY"), {
      x: selected.x,
      y: selected.y,
      label: `Foundry at (${selected.x}, ${selected.y})`,
      optimisticKind: "FOUNDRY"
    });
  if (actionId === "build_garrison_hall")
    sendDevelopmentBuild({ type: "BUILD_ECONOMIC_STRUCTURE", x: selected.x, y: selected.y, structureType: "GARRISON_HALL" }, () => applyOptimisticStructureBuild(selected.x, selected.y, "GARRISON_HALL"), {
      x: selected.x,
      y: selected.y,
      label: `Garrison Hall at (${selected.x}, ${selected.y})`,
      optimisticKind: "GARRISON_HALL"
    });
  if (actionId === "build_customs_house")
    sendDevelopmentBuild({ type: "BUILD_ECONOMIC_STRUCTURE", x: selected.x, y: selected.y, structureType: "CUSTOMS_HOUSE" }, () => applyOptimisticStructureBuild(selected.x, selected.y, "CUSTOMS_HOUSE"), {
      x: selected.x,
      y: selected.y,
      label: `Customs House at (${selected.x}, ${selected.y})`,
      optimisticKind: "CUSTOMS_HOUSE"
    });
  if (actionId === "build_governors_office")
    sendDevelopmentBuild(
      { type: "BUILD_ECONOMIC_STRUCTURE", x: selected.x, y: selected.y, structureType: "GOVERNORS_OFFICE" },
      () => applyOptimisticStructureBuild(selected.x, selected.y, "GOVERNORS_OFFICE"),
      { x: selected.x, y: selected.y, label: `Governor's Office at (${selected.x}, ${selected.y})`, optimisticKind: "GOVERNORS_OFFICE" }
    );
  if (actionId === "build_radar_system")
    sendDevelopmentBuild({ type: "BUILD_ECONOMIC_STRUCTURE", x: selected.x, y: selected.y, structureType: "RADAR_SYSTEM" }, () => applyOptimisticStructureBuild(selected.x, selected.y, "RADAR_SYSTEM"), {
      x: selected.x,
      y: selected.y,
      label: `Radar System at (${selected.x}, ${selected.y})`,
      optimisticKind: "RADAR_SYSTEM"
    });
  if (actionId === "build_siege_camp")
    sendDevelopmentBuild({ type: "BUILD_SIEGE_OUTPOST", x: selected.x, y: selected.y }, () => applyOptimisticStructureBuild(selected.x, selected.y, "SIEGE_OUTPOST"), {
      x: selected.x,
      y: selected.y,
      label: `Siege Camp at (${selected.x}, ${selected.y})`,
      optimisticKind: "SIEGE_OUTPOST"
    });
  if (actionId === "build_light_outpost")
    sendDevelopmentBuild(
      { type: "BUILD_ECONOMIC_STRUCTURE", x: selected.x, y: selected.y, structureType: "LIGHT_OUTPOST" },
      () => applyOptimisticStructureBuild(selected.x, selected.y, "LIGHT_OUTPOST"),
      { x: selected.x, y: selected.y, label: `Light Outpost at (${selected.x}, ${selected.y})`, optimisticKind: "LIGHT_OUTPOST" }
    );
  if (actionId === "overload_fur_synthesizer") sendGameMessage({ type: "OVERLOAD_SYNTHESIZER", x: selected.x, y: selected.y });
  if (actionId === "overload_ironworks") sendGameMessage({ type: "OVERLOAD_SYNTHESIZER", x: selected.x, y: selected.y });
  if (actionId === "overload_crystal_synthesizer") sendGameMessage({ type: "OVERLOAD_SYNTHESIZER", x: selected.x, y: selected.y });
  if (actionId === "create_mountain") sendGameMessage({ type: "CREATE_MOUNTAIN", x: selected.x, y: selected.y });
  if (actionId === "remove_mountain") sendGameMessage({ type: "REMOVE_MOUNTAIN", x: selected.x, y: selected.y });
  if (actionId === "abandon_territory") sendGameMessage({ type: "UNCAPTURE_TILE", x: selected.x, y: selected.y });
  if (actionId === "offer_truce_12h" && selected.ownerId && selected.ownerId !== state.me && selected.ownerId !== "barbarian") {
    const targetName = playerNameForOwner(selected.ownerId);
    if (targetName) sendTruceRequest(targetName, 12);
  }
  if (actionId === "offer_truce_24h" && selected.ownerId && selected.ownerId !== state.me && selected.ownerId !== "barbarian") {
    const targetName = playerNameForOwner(selected.ownerId);
    if (targetName) sendTruceRequest(targetName, 24);
  }
  if (actionId === "break_truce" && selected.ownerId && selected.ownerId !== state.me && selected.ownerId !== "barbarian") {
    breakTruce(selected.ownerId);
  }
  if (actionId === "reveal_empire" && selected.ownerId && selected.ownerId !== state.me && selected.ownerId !== "barbarian") {
    sendGameMessage({ type: "REVEAL_EMPIRE", targetPlayerId: selected.ownerId });
  }
  if (actionId === "aether_bridge") beginCrystalTargeting("aether_bridge");
  if (actionId === "siphon_tile") beginCrystalTargeting("siphon");
  if (actionId === "purge_siphon") sendGameMessage({ type: "PURGE_SIPHON", x: selected.x, y: selected.y });
  hideTileActionMenu();
};

const showHoldBuildMenu = (x: number, y: number, clientX: number, clientY: number): void =>
  showClientHoldBuildMenu(
    {
      state,
      holdBuildMenuEl,
      keyFor: key,
      hideHoldBuildMenu,
      developmentSlotSummary,
      structureGoldCost,
      isOwnedBorderTile,
      structureCostText,
      viewportSize,
      requestSettlement,
      sendDevelopmentBuild,
      applyOptimisticStructureBuild,
      renderHud
    },
    x,
    y,
    clientX,
    clientY
  );

bindClientUiControls({
  state,
  hud,
  allianceSendBtn,
  mobileAllianceSendBtn,
  allianceBreakBtn,
  mobileAllianceBreakBtn,
  allianceTargetEl,
  mobileAllianceTargetEl,
  allianceBreakIdEl,
  mobileAllianceBreakIdEl,
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
  captureTimeEl,
  shardAlertCloseBtn,
  panelCloseBtn,
  panelActionButtons,
  authColorPresetButtons,
  authProfileColorEl,
  authEmailEl,
  authEmailLinkBtn,
  authProfileNameEl,
  authProfileSaveBtn,
  sendAllianceRequest,
  breakAlliance,
  chooseTech,
  renderHud,
  centerOnOwnedTile,
  requestViewRefresh,
  collectVisibleYield,
  cancelOngoingCapture,
  hideShardAlert,
  renderShardAlert,
  renderCaptureProgress,
  setActivePanel,
  syncAuthPanelState
});
bindClientNetwork({
  state,
  ws,
  wsUrl,
  firebaseAuth,
  keyFor: key,
  renderHud,
  setAuthStatus,
  syncAuthOverlay,
  authenticateSocket,
  pushFeed,
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
  playerNameForOwner,
  settlementProgressForTile,
  COLLECT_VISIBLE_COOLDOWN_MS,
  shouldResetFrontierActionStateForError
});

authFlow.bindFirebaseAuth();

startClientRuntimeLoop(state, {
  canvas,
  ctx,
  initTerrainTextures,
  isMobile,
  keyFor: key,
  wrapX,
  wrapY,
  parseKey,
  selectedTile,
  settlementProgressForTile,
  tileVisibilityStateAt,
  crystalTargetingTone,
  startingExpansionArrowTargets,
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
  resourceColor,
  shardOverlayForTile,
  drawShardFallback,
  drawTownOverlay,
  hasCollectableYield,
  structureAccentColor,
  structureOverlayImages,
  constructionRemainingMsForTile,
  formatCountdownClock,
  drawStartingExpansionArrow,
  drawBarbarianSkullOverlay,
  shouldDrawOwnershipBorder,
  borderColorForOwner,
  isTileOwnedByAlly,
  borderLineWidthForOwner,
  drawExposedTileBorder,
  isTownSupportNeighbor,
  isTownSupportHighlightableTile,
  drawIncomingAttackOverlay,
  settlePixelWanderPoint,
  worldToScreen,
  isDockRouteVisibleForPlayer,
  computeDockSeaRoute,
  toroidDelta,
  drawAetherBridgeLane,
  drawMiniMap,
  maybeRefreshForCamera,
  renderHud,
  renderCaptureProgress,
  renderShardAlert,
  cleanupExpiredSettlementProgress,
  processDevelopmentQueue,
  clearOptimisticTileState,
  dropQueuedTargetKeyIfAbsent,
  pushFeed,
  processActionQueue,
  shouldPreserveOptimisticExpandByKey,
  requestViewRefresh,
  reconcileActionQueue
});

bindClientMapInput(state, {
  canvas,
  miniMapEl,
  holdBuildMenuEl,
  tileActionMenuEl,
  wrapX,
  wrapY,
  keyFor: key,
  worldTileRawFromPointer,
  computeDragPreview,
  requestViewRefresh,
  maybeRefreshForCamera,
  handleTileSelection,
  cancelOngoingCapture,
  hideHoldBuildMenu,
  hideTileActionMenu,
  clearCrystalTargeting,
  renderMobilePanels,
  queueSpecificTargets,
  processActionQueue,
  pushFeed,
  openBulkTileActionMenu,
  isTileOwnedByAlly,
  requestAttackPreviewForHover,
  interactionFlags: mapInteractionFlags
});
