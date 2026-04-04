import "./style.css";
import { getApps, initializeApp, type FirebaseOptions } from "firebase/app";
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  isSignInWithEmailLink,
  onAuthStateChanged,
  sendSignInLinkToEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithEmailLink,
  signInWithPopup,
  signOut,
  updateProfile,
  type User
} from "firebase/auth";
import {
  CHUNK_SIZE,
  DEVELOPMENT_PROCESS_LIMIT,
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
  isForestTile,
  settleDurationMsForTile
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
  authLabelForUser as authLabelForUserFromModule,
  seedProfileSetupFields as seedProfileSetupFieldsFromModule,
  setAuthStatus as setAuthStatusFromModule,
  syncAuthOverlay as syncAuthOverlayFromModule,
  syncAuthPanelState as syncAuthPanelStateFromModule
} from "./client-auth-ui.js";
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
import { renderEconomyPanelHtml, type EconomyFocusKey } from "./client-economy-html.js";
import { shouldHideCaptureOverlayAfterTimer, shouldPreserveOptimisticExpand } from "./client-frontier-overlay.js";
import { shouldFinalizePredictedCombat, wasPredictedCombatAlreadyShown } from "./client-predicted-combat.js";
import {
  firstCaptureGuidanceTarget as firstCaptureGuidanceTargetFromModule,
  inspectionHtmlForTile as inspectionHtmlForTileFromModule,
  passiveTileGuidanceHtml as passiveTileGuidanceHtmlFromModule,
  tileHistoryLines as tileHistoryLinesFromModule
} from "./client-hover-html.js";
import { busyDevelopmentProcessCount, hasQueuedSettlementForTile } from "./client-development-queue.js";
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
let authToken = "";
let authUid = "";
let authEmailLinkSentTo = "";
let authEmailLinkPending = false;
const EMAIL_LINK_STORAGE_KEY = "be_auth_email_link";
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

const setAuthStatus = (message: string, tone: "normal" | "error" = "normal"): void =>
  setAuthStatusFromModule(state, authStatusEl, message, tone);

const syncAuthPanelState = (): void =>
  syncAuthPanelStateFromModule(state, {
    authEmailLinkSentTo,
    authPanelEl,
    authEmailSentAddressEl,
    authProfileColorEl,
    authColorPresetButtons
  });

const syncAuthOverlay = (): void =>
  syncAuthOverlayFromModule(state, {
    authOverlayEl,
    authBusyModalEl,
    authLoginBtn,
    authRegisterBtn,
    authEmailLinkBtn,
    authGoogleBtn,
    authEmailEl,
    authPasswordEl,
    authDisplayNameEl,
    authEmailResetBtn,
    authProfileNameEl,
    authProfileColorEl,
    authProfileSaveBtn,
    authBusyTitleEl,
    authBusyCopyEl,
    authStatusEl,
    syncAuthPanelState,
    setAuthStatus
  });

const authLabelForUser = (user: User): string => authLabelForUserFromModule(user);

const seedProfileSetupFields = (name?: string, color?: string): void =>
  seedProfileSetupFieldsFromModule(
    {
      authProfileNameEl,
      authProfileColorEl,
      syncAuthPanelState
    },
    name,
    color
  );

const authenticateSocket = async (forceRefresh = false): Promise<void> => {
  if (!firebaseAuth?.currentUser || ws.readyState !== ws.OPEN) return;
  authToken = await firebaseAuth.currentUser.getIdToken(forceRefresh);
  authUid = firebaseAuth.currentUser.uid;
  ws.send(JSON.stringify({ type: "AUTH", token: authToken }));
};

const completeEmailLinkSignIn = async (emailRaw: string): Promise<void> => {
  if (!firebaseAuth) return;
  const email = emailRaw.trim();
  if (!email) {
    setAuthStatus("Enter the email address that received the sign-in link.", "error");
    syncAuthOverlay();
    return;
  }
  state.authBusy = true;
  setAuthStatus("Completing email link sign-in...");
  syncAuthOverlay();
  try {
    await signInWithEmailLink(firebaseAuth, email, window.location.href);
    authEmailLinkPending = false;
    authEmailLinkSentTo = "";
    window.localStorage.removeItem(EMAIL_LINK_STORAGE_KEY);
    const cleanUrl = new URL(window.location.href);
    cleanUrl.search = "";
    cleanUrl.hash = "";
    window.history.replaceState({}, document.title, cleanUrl.toString());
  } catch (error) {
    setAuthStatus(error instanceof Error ? error.message : "Email link sign-in failed.", "error");
  } finally {
    state.authBusy = false;
    syncAuthOverlay();
  }
};

const replayToolbarHtml = (): string => {
  return `<div class="mini-map-toolbar">
    <span>Minimap (${state.camX}, ${state.camY})</span>
  </div>`;
};

const replayPanelHtml = (): string => "";

const renderHud = (): void => {
  if (
    !state.guide.completed &&
    !state.guide.autoOpened &&
    state.connection === "initialized" &&
    state.firstChunkAt > 0 &&
    authOverlayEl.style.display !== "grid"
  ) {
    state.guide.open = true;
    state.guide.autoOpened = true;
    storageSet(GUIDE_AUTO_OPEN_STORAGE_KEY, "1");
  }
  const collectVisibleCooldownRemaining = Math.max(0, state.collectVisibleCooldownUntil - Date.now());
  const collectVisibleReady = collectVisibleCooldownRemaining <= 0;
  const collectSummary = visibleCollectSummary();
  const development = developmentSlotSummary();
  const mobile = isMobile();
  const connClass = state.connection === "disconnected" ? "warning" : "normal";
  const pointsClass =
    Date.now() < state.goldAnimUntil ? (state.goldAnimDir > 0 ? " delta-up" : state.goldAnimDir < 0 ? " delta-down" : "") : "";
  const defClass =
    Date.now() < state.defensibilityAnimUntil
      ? state.defensibilityAnimDir > 0
        ? " delta-up"
        : state.defensibilityAnimDir < 0
          ? " delta-down"
          : ""
      : "";
  const netGoldPerMinute = state.incomePerMinute - state.upkeepPerMinute.gold;
  const goldRateText = `${netGoldPerMinute > 0 ? "+" : ""}${netGoldPerMinute.toFixed(1)}/m`;
  const mobileGoldRateText = `${netGoldPerMinute > 0 ? "+" : ""}${netGoldPerMinute.toFixed(0)}/m`;
  const goldRateClass = rateToneClass(netGoldPerMinute);
  const manpowerRateText = `${state.manpowerRegenPerMinute > 0 ? "+" : ""}${state.manpowerRegenPerMinute.toFixed(0)}/m`;
  const showManpowerRate = state.manpower + 0.001 < state.manpowerCap;
  const manpowerRateClass = rateToneClass(state.manpowerRegenPerMinute);
  statsChipsEl.innerHTML = `
    ${mobile ? "" : `<div class="stat-chip stat-chip-player ${connClass}"><span>Player</span><strong>${state.meName || "Player"}</strong></div>`}
    <button class="stat-chip stat-chip-gold${pointsClass}" type="button" data-economy-open="GOLD"><span>Gold</span><strong>${formatGoldAmount(state.gold)} <em class="stat-chip-rate ${goldRateClass}">${mobile ? mobileGoldRateText : goldRateText}</em></strong></button>
    <button class="stat-chip stat-chip-manpower" type="button" data-panel="manpower" title="Manpower gates attacks. Tap for cap and regen breakdown."><span>${mobile ? "MP" : "Manpower"}</span><strong>${formatManpowerAmount(state.manpower)}/${formatManpowerAmount(state.manpowerCap)} ${showManpowerRate ? `<em class="stat-chip-rate ${manpowerRateClass}">${manpowerRateText}</em>` : ""}</strong></button>
    <button class="stat-chip stat-chip-def${defClass}" type="button" data-defensibility-open="true" title="Compact shapes with fewer exposed borders defend better. Tap for a breakdown."><span>${mobile ? "Def" : "Defensibility"}</span><strong>${Math.round(state.defensibilityPct)}%</strong></button>
    <div class="stat-chip stat-chip-dev${development.available === 0 ? " is-full" : ""}" title="Development slots limit how many settles and constructions can run at once.">
      <span>${mobile ? "Dev" : "Development"}</span>
      <strong>${development.busy}/${development.limit}</strong>
    </div>
    ${state.showWeakDefensibility ? `<button class="stat-chip stat-chip-weak-def" type="button" data-toggle-weak-def="true"><span>Def</span><strong>Hide Weak</strong></button>` : ""}
    ${strategicRibbonHtml(
      state.strategicResources,
      state.strategicProductionPerMinute,
      state.upkeepPerMinute,
      state.strategicAnim,
      rateToneClass
    )}
  `;
  collectVisibleDesktopBtn.disabled = !collectVisibleReady;
  collectVisibleMobileBtn.disabled = !collectVisibleReady;
  const collectReady = collectVisibleReady && collectSummary.tileCount > 0;
  const collectMeta = !collectVisibleReady ? `Cooldown ${formatCooldownShort(collectVisibleCooldownRemaining)}` : collectReady ? "Ready to collect" : "Tap to gather";
  collectVisibleDesktopMetaEl.textContent = collectMeta;
  collectVisibleMobileMetaEl.textContent = collectMeta;
  collectVisibleDesktopBtn.classList.toggle("is-attention", collectReady);
  collectVisibleMobileBtn.classList.toggle("is-attention", collectReady);
  const economyButtons = statsChipsEl.querySelectorAll<HTMLButtonElement>("[data-economy-open]");
  economyButtons.forEach((btn) => {
    btn.onclick = () => {
      const focus = btn.dataset.economyOpen as EconomyFocusKey | undefined;
      openEconomyPanel(focus ?? "ALL");
    };
  });
  const defensibilityButtons = statsChipsEl.querySelectorAll<HTMLButtonElement>("[data-defensibility-open]");
  defensibilityButtons.forEach((btn) => {
    btn.onclick = () => {
      setActivePanel("defensibility");
    };
  });
  const statPanelButtons = statsChipsEl.querySelectorAll<HTMLButtonElement>("[data-panel]");
  statPanelButtons.forEach((btn) => {
    btn.onclick = () => {
      const panel = btn.dataset.panel as typeof state.activePanel;
      if (!panel) return;
      setActivePanel(panel);
    };
  });
  const techReady = state.availableTechPicks > 0 && affordableTechChoicesCount() > 0;
  const attackAlertUnread = state.unreadAttackAlerts > 0;
  panelActionButtons.forEach((btn) => {
    if (btn.dataset.panel === "tech") {
      btn.innerHTML = techReady
        ? '<span class="tab-icon">⚡</span><span class="tech-ready-dot" aria-label="upgrade available"></span>'
        : '<span class="tab-icon">⚡</span>';
      return;
    }
    if (btn.dataset.panel === "feed") {
      btn.innerHTML = attackAlertUnread
        ? '<span class="tab-icon">🔔</span><span class="attack-alert-dot" aria-label="under attack">🔥</span>'
        : '<span class="tab-icon">🔔</span>';
    }
  });
  const coreMobileBtn = hud.querySelector<HTMLButtonElement>("#mobile-nav button[data-mobile-panel='core']");
  if (coreMobileBtn) coreMobileBtn.innerHTML = mobileNavLabelHtml("core");
  const missionsMobileBtn = hud.querySelector<HTMLButtonElement>("#mobile-nav button[data-mobile-panel='missions']");
  if (missionsMobileBtn) missionsMobileBtn.innerHTML = mobileNavLabelHtml("missions");
  const techMobileBtn = hud.querySelector<HTMLButtonElement>("#mobile-nav button[data-mobile-panel='tech']");
  if (techMobileBtn) techMobileBtn.innerHTML = mobileNavLabelHtml("tech", { techReady });
  const socialMobileBtn = hud.querySelector<HTMLButtonElement>("#mobile-nav button[data-mobile-panel='social']");
  if (socialMobileBtn) socialMobileBtn.innerHTML = mobileNavLabelHtml("social");
  const intelMobileBtn = hud.querySelector<HTMLButtonElement>("#mobile-nav button[data-mobile-panel='intel']");
  if (intelMobileBtn) intelMobileBtn.innerHTML = mobileNavLabelHtml("intel", { attackAlertUnread });

  if (state.crystalTargeting.active) {
    const ability = state.crystalTargeting.ability;
    const selectedKey = state.selected ? key(state.selected.x, state.selected.y) : "";
    const selectedOriginKey = selectedKey ? state.crystalTargeting.originByTarget.get(selectedKey) : undefined;
    const selectedOrigin = selectedOriginKey ? parseKey(selectedOriginKey) : undefined;
    const validCount = state.crystalTargeting.validTargets.size;
    const detail =
      ability === "aether_bridge"
        ? "Pick a coastal land tile. The server links the nearest settled coast and opens a temporary sea lane."
        : "Pick an enemy town or resource tile to siphon 50% of its output for 30 minutes.";
    const status = selectedOrigin
      ? `Origin ${selectedOrigin.x}, ${selectedOrigin.y} → Target ${state.selected?.x}, ${state.selected?.y}`
      : `Valid targets in view: ${validCount}`;
    targetingOverlayEl.innerHTML = `
      <div class="targeting-card tone-${crystalTargetingTone(ability)}">
        <div class="targeting-kicker">Crystal Action Armed</div>
        <div class="targeting-title">${crystalTargetingTitle(ability)}</div>
        <div class="targeting-detail">${detail}</div>
        <div class="targeting-status">${status}</div>
        <button id="targeting-cancel" class="targeting-cancel-btn" type="button">Cancel</button>
      </div>
    `;
    targetingOverlayEl.style.display = "block";
    const cancelBtn = targetingOverlayEl.querySelector<HTMLButtonElement>("#targeting-cancel");
    if (cancelBtn) {
      cancelBtn.onclick = () => {
        clearCrystalTargeting();
        renderHud();
      };
    }
  } else {
    targetingOverlayEl.style.display = "none";
    targetingOverlayEl.innerHTML = "";
  }

  const selected = selectedTile();
  if (selected) requestTileDetailIfNeeded(selected);
  selectedEl.innerHTML = passiveTileGuidanceHtml();
  if (state.tileActionMenu.visible && state.tileActionMenu.mode === "single" && state.tileActionMenu.currentTileKey) {
    const menuTile = state.tiles.get(state.tileActionMenu.currentTileKey);
    if (menuTile) renderTileActionMenu(tileMenuViewForTile(menuTile), state.tileActionMenu.x, state.tileActionMenu.y);
  }
  hoverEl.innerHTML = "";
  hoverEl.style.display = "none";

  mobileCoreHelpEl.innerHTML = `
    <div class="mobile-context-block">
      <div class="mobile-context-label">Tile</div>
      <div class="mobile-context-value">${passiveTileGuidanceHtml()}</div>
    </div>
  `;

  renderCaptureProgress();
  renderShardAlert();
  state.replayActive = false;
  state.replayPlaying = false;
  miniMapLabelEl.innerHTML = replayToolbarHtml();
  miniMapReplayEl.innerHTML = replayPanelHtml();
  const loadingActive = state.connection !== "initialized" || state.firstChunkAt === 0;
  if (loadingActive) {
    mapLoadingOverlayEl.style.display = "grid";
    if (state.connection === "disconnected") {
      mapLoadingTitleEl.textContent = "Disconnected from server";
      mapLoadingMetaEl.textContent = "Retrying connection...";
    } else if (state.connection === "connecting") {
      mapLoadingTitleEl.textContent = "Connecting to server...";
      mapLoadingMetaEl.textContent = "Retrying connection...";
    } else if (state.connection === "connected" || (state.connection === "initialized" && state.firstChunkAt === 0)) {
      const startAt = state.mapLoadStartedAt || Date.now();
      const elapsed = ((Date.now() - startAt) / 1000).toFixed(1);
      mapLoadingTitleEl.textContent = state.authSessionReady ? "Loading nearby land..." : "Syncing empire...";
      mapLoadingMetaEl.textContent = state.authSessionReady ? `Elapsed ${elapsed}s · chunks ${state.chunkFullCount}` : `Connected to ${wsUrl}`;
    } else {
      mapLoadingTitleEl.textContent = "Loading world...";
      mapLoadingMetaEl.textContent = "Finalizing map render...";
    }
  } else {
    mapLoadingOverlayEl.style.display = "none";
  }

  const visibleTechChoices = effectiveTechChoices();
  const choicesSig = `${state.availableTechPicks}|${visibleTechChoices.join("|")}|${state.techCatalog.length}|${state.pendingTechUnlockId}`;
  const focused = document.activeElement === techPickEl || document.activeElement === mobileTechPickEl;
  const catalogById = new Map(state.techCatalog.map((t) => [t.id, t]));
  if (choicesSig !== state.techChoicesSig && !focused) {
    const previous = state.techUiSelectedId?.trim() || techPickEl.value || mobileTechPickEl.value;
    techPickEl.innerHTML = "";
    mobileTechPickEl.innerHTML = "";
    for (const choice of visibleTechChoices) {
      const opt = document.createElement("option");
      opt.value = choice;
      const info = catalogById.get(choice);
      opt.textContent = info ? `${info.name}${info.requirements.canResearch ? "" : " (blocked)"}` : choice;
      techPickEl.append(opt);
      mobileTechPickEl.append(opt.cloneNode(true));
    }
    if (visibleTechChoices.length === 0) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent =
        state.pendingTechUnlockId
          ? "Unlock pending..."
          : state.techIds.length > 0
            ? "No further techs in your current branch this season"
            : "No available tech choices";
      techPickEl.append(opt);
      mobileTechPickEl.append(opt.cloneNode(true));
    }
    const fallback = state.pendingTechUnlockId || visibleTechChoices[0] || state.techCatalog[0]?.id || "";
    const nextSelected = previous && catalogById.has(previous) ? previous : fallback;
    const nextPickerValue = visibleTechChoices.includes(nextSelected) ? nextSelected : state.pendingTechUnlockId || visibleTechChoices[0] || "";
    techPickEl.value = nextPickerValue;
    mobileTechPickEl.value = nextPickerValue;
    state.techUiSelectedId = nextSelected;
    state.techChoicesSig = choicesSig;
  } else if (!focused) {
    const selected = state.techUiSelectedId || techPickEl.value || mobileTechPickEl.value;
    if (selected && catalogById.has(selected)) state.techUiSelectedId = selected;
  }
  techPointsEl.textContent = "Tech unlocks use gold + strategic resources";
  mobileTechPointsEl.textContent = "Tech unlocks use gold + strategic resources";
  techCurrentModsEl.innerHTML = techCurrentModsHtml(state.mods, state.expandedModKey, state.modBreakdown);
  mobileTechCurrentModsEl.innerHTML = techCurrentModsHtml(state.mods, state.expandedModKey, state.modBreakdown);
  techChoicesGridEl.innerHTML = renderTechChoiceGrid();
  mobileTechChoicesGridEl.innerHTML = renderTechChoiceGrid();
  techDetailCardEl.innerHTML = techDetailsUseOverlay() ? renderTechDetailPrompt() : renderTechDetailCard();
  mobileTechDetailCardEl.innerHTML = renderTechDetailPrompt();
  structureInfoOverlayEl.innerHTML = renderStructureInfoOverlay();
  structureInfoOverlayEl.style.display = state.structureInfoKey ? "grid" : "none";
  techDetailOverlayEl.innerHTML = techDetailsUseOverlay() ? renderTechDetailOverlay() : "";
  techDetailOverlayEl.style.display = techDetailsUseOverlay() && state.techDetailOpen ? "grid" : "none";
  techOwnedEl.innerHTML = techOwnedHtml(state.techCatalog, effectiveOwnedTechIds(), isPendingTechUnlock);
  mobileTechOwnedEl.innerHTML = techOwnedHtml(state.techCatalog, effectiveOwnedTechIds(), isPendingTechUnlock);
  techChoiceDetailsEl.innerHTML = renderTechChoiceDetails();
  mobileTechChoiceDetailsEl.innerHTML = renderTechChoiceDetails();
  const techResearchSectionEl = document.querySelector<HTMLDivElement>("#tech-research-section");
  const mobileTechResearchSectionEl = document.querySelector<HTMLDivElement>("#mobile-tech-research-section");
  if (techResearchSectionEl) techResearchSectionEl.style.display = "grid";
  if (mobileTechResearchSectionEl) mobileTechResearchSectionEl.style.display = "grid";
  panelTechEl.classList.toggle("tech-tree-expanded", state.techTreeExpanded);
  panelTechEl.classList.toggle("tech-detail-open", state.techDetailOpen && !techDetailsUseOverlay());
  mobilePanelTechEl.classList.toggle("tech-tree-expanded", state.techTreeExpanded);
  panelDomainsEl.classList.toggle("domain-detail-open", state.domainDetailOpen && !isMobile());
  hud.classList.toggle("desktop-side-panel-open", !isMobile() && state.activePanel !== null);
  techTreeExpandToggleEl.textContent = state.techTreeExpanded ? "Collapse Tree" : "Expand Tree";
  mobileTechTreeExpandToggleEl.textContent = state.techTreeExpanded ? "Collapse Tree" : "Expand Tree";
  techTreeExpandToggleEl.classList.toggle("active", state.techTreeExpanded);
  mobileTechTreeExpandToggleEl.classList.toggle("active", state.techTreeExpanded);
  techTreeExpandToggleEl.onclick = () => {
    state.techTreeExpanded = !state.techTreeExpanded;
    renderHud();
  };
  mobileTechTreeExpandToggleEl.onclick = () => {
    state.techTreeExpanded = !state.techTreeExpanded;
    renderHud();
  };
  bindTechTreeDragScroll();
  const structureInfoButtons = hud.querySelectorAll<HTMLButtonElement>("[data-structure-info]");
  structureInfoButtons.forEach((btn) => {
    btn.onclick = () => {
      const type = btn.dataset.structureInfo as StructureInfoKey | undefined;
      if (!type) return;
      state.structureInfoKey = type;
      renderHud();
    };
  });
  const structureInfoCloseButtons = hud.querySelectorAll<HTMLElement>("[data-structure-info-close]");
  structureInfoCloseButtons.forEach((btn) => {
    btn.onclick = () => {
      state.structureInfoKey = "";
      renderHud();
    };
  });
  const techDetailCloseButtons = hud.querySelectorAll<HTMLElement>("[data-tech-detail-close]");
  techDetailCloseButtons.forEach((btn) => {
    btn.onclick = () => {
      state.techDetailOpen = false;
      renderHud();
    };
  });
  const selectedTech = state.techCatalog.find((t) => t.id === state.techUiSelectedId);
  const canPick = Boolean(selectedTech && selectedTech.requirements.canResearch && !state.pendingTechUnlockId);
  techChooseBtn.disabled = !canPick;
  mobileTechChooseBtn.disabled = !canPick;

  const techCardButtons = hud.querySelectorAll<HTMLButtonElement>("[data-tech-card]");
  techCardButtons.forEach((btn) => {
    btn.onclick = () => {
      const id = btn.dataset.techCard;
      if (!id) return;
      state.techUiSelectedId = id;
      state.techDetailOpen = true;
      state.domainDetailOpen = false;
      if (visibleTechChoices.includes(id)) {
        techPickEl.value = id;
        mobileTechPickEl.value = id;
      }
      renderHud();
    };
  });
  const techUnlockButtons = hud.querySelectorAll<HTMLButtonElement>("[data-tech-unlock]");
  techUnlockButtons.forEach((btn) => {
    btn.onclick = () => {
      const id = btn.dataset.techUnlock;
      if (!id) return;
      chooseTech(id);
    };
  });
  const domainCardButtons = hud.querySelectorAll<HTMLButtonElement>("[data-domain-card]");
  domainCardButtons.forEach((btn) => {
    btn.onclick = () => {
      const id = btn.dataset.domainCard;
      if (!id) return;
      state.domainUiSelectedId = id;
      state.domainDetailOpen = true;
      state.techDetailOpen = false;
      renderHud();
    };
  });
  const domainDetailCloseButtons = hud.querySelectorAll<HTMLElement>("[data-domain-detail-close]");
  domainDetailCloseButtons.forEach((btn) => {
    btn.onclick = () => {
      state.domainDetailOpen = false;
      renderHud();
    };
  });
  const domainUnlockButtons = hud.querySelectorAll<HTMLButtonElement>("[data-domain-unlock]");
  domainUnlockButtons.forEach((btn) => {
    btn.onclick = () => {
      const id = btn.dataset.domainUnlock;
      if (!id) return;
      sendGameMessage({ type: "CHOOSE_DOMAIN", domainId: id }, "Finish sign-in before choosing a domain.");
    };
  });
  alliesListEl.innerHTML = `<h4>Current Allies</h4>${alliesHtml(state.allies, playerNameForOwner)}<h4>Active Truces</h4>${activeTrucesHtml(state.activeTruces, playerNameForOwner)}`;
  mobileAlliesListEl.innerHTML = `<h4>Current Allies</h4>${alliesHtml(state.allies, playerNameForOwner)}<h4>Active Truces</h4>${activeTrucesHtml(state.activeTruces, playerNameForOwner)}`;
  allianceRequestsEl.innerHTML = `<h4>Incoming Alliance Requests</h4>${allianceRequestsHtml(state.incomingAllianceRequests, playerNameForOwner)}<h4>Incoming Truces</h4>${truceRequestsHtml(state.incomingTruceRequests, playerNameForOwner)}`;
  mobileAllianceRequestsEl.innerHTML = `<h4>Incoming Alliance Requests</h4>${allianceRequestsHtml(state.incomingAllianceRequests, playerNameForOwner)}<h4>Incoming Truces</h4>${truceRequestsHtml(state.incomingTruceRequests, playerNameForOwner)}`;
  const socialInspectCardHtml = renderSocialInspectCardHtml({
    socialInspectPlayerId: state.socialInspectPlayerId,
    leaderboardOverall: state.leaderboard.overall,
    allies: state.allies,
    playerNameForOwner
  });
  alliancePlayerInspectEl.innerHTML = socialInspectCardHtml;
  mobileAlliancePlayerInspectEl.innerHTML = socialInspectCardHtml;

  missionsEl.innerHTML = missionCardsHtml(state.missions);
  mobilePanelMissionsEl.innerHTML = missionCardsHtml(state.missions);
  const defensibilityPanelHtml = renderDefensibilityPanelHtml({
    tiles: state.tiles,
    me: state.me,
    defensibilityPct: state.defensibilityPct,
    showWeakDefensibility: state.showWeakDefensibility,
    keyFor: key,
    wrapX,
    wrapY,
    terrainAt
  });
  panelDefensibilityEl.innerHTML = defensibilityPanelHtml;
  mobilePanelDefensibilityEl.innerHTML = defensibilityPanelHtml;
  const weakDefButtons = hud.querySelectorAll<HTMLButtonElement>("[data-toggle-weak-def]");
  weakDefButtons.forEach((btn) => {
    btn.onclick = () => {
      state.showWeakDefensibility = !state.showWeakDefensibility;
      const weakTileCount = [...state.tiles.values()].filter((tile) => {
        if (tile.ownerId !== state.me || tile.terrain !== "LAND" || tile.ownershipState !== "SETTLED" || tile.fogged) return false;
        return (
          exposedSidesForTile(tile, {
            tiles: state.tiles,
            me: state.me,
            keyFor: key,
            wrapX,
            wrapY,
            terrainAt
          }).length >= 2
        );
      }).length;
      pushFeed(
        state.showWeakDefensibility
          ? `Weak defensibility overlay enabled (${weakTileCount} tiles highlighted).`
          : "Weak defensibility overlay hidden.",
        "info",
        "info"
      );
      if (isMobile() && state.mobilePanel === "defensibility") {
        state.mobilePanel = "core";
        state.activePanel = null;
      }
      requestViewRefresh();
      renderHud();
    };
  });
  const economyPanelHtml = renderEconomyPanelHtml({
    focus: state.economyFocus,
    gold: state.gold,
    me: state.me,
    incomePerMinute: state.incomePerMinute,
    strategicResources: state.strategicResources,
    strategicProductionPerMinute: state.strategicProductionPerMinute,
    upkeepPerMinute: state.upkeepPerMinute,
    upkeepLastTick: state.upkeepLastTick,
    activeRevealTargetsCount: state.activeRevealTargets.length,
    tiles: state.tiles.values(),
    isMobile: window.matchMedia("(max-width: 900px)").matches,
    prettyToken,
    resourceIconForKey,
    rateToneClass,
    resourceLabel,
    economicStructureName
  });
  panelEconomyEl.innerHTML = economyPanelHtml;
  mobilePanelEconomyEl.innerHTML = economyPanelHtml;
  const manpowerPanelHtml = renderManpowerPanelHtml({
    manpower: state.manpower,
    manpowerCap: state.manpowerCap,
    manpowerRegenPerMinute: state.manpowerRegenPerMinute,
    manpowerBreakdown: state.manpowerBreakdown,
    formatManpowerAmount,
    rateToneClass
  });
  panelManpowerEl.innerHTML = manpowerPanelHtml;
  mobilePanelManpowerEl.innerHTML = manpowerPanelHtml;
  leaderboardEl.innerHTML = leaderboardHtml(state.leaderboard, state.seasonVictory, state.seasonWinner);
  mobileLeaderboardEl.innerHTML = leaderboardHtml(state.leaderboard, state.seasonVictory, state.seasonWinner);
  feedEl.innerHTML = feedHtml(state.feed);
  mobileFeedEl.innerHTML = feedHtml(state.feed);

  panelDomainsContentEl.innerHTML = `
    <div id="domains-overview-content">
      ${renderDomainProgressCard()}
      ${renderDomainChoiceGrid()}
      ${domainOwnedHtml(state.domainCatalog, state.domainIds)}
      <div class="card auth-settings-card">
        <p>Signed in as ${state.authUserLabel || "Guest"}.</p>
        <button id="auth-logout" class="panel-btn" ${state.authReady ? "" : "disabled"}>Log Out</button>
      </div>
    </div>
    <div id="domains-detail-content">
      ${renderDomainDetailCard()}
    </div>
  `;
  mobilePanelDomainsEl.innerHTML = panelDomainsContentEl.innerHTML;

  const acceptButtons = hud.querySelectorAll<HTMLButtonElement>(".accept-request");
  acceptButtons.forEach((btn) => {
    btn.onclick = () => {
      const id = btn.dataset.requestId;
      if (!id) return;
      sendGameMessage({ type: "ALLIANCE_ACCEPT", requestId: id }, "Finish sign-in before responding to alliance requests.");
    };
  });
  const breakButtons = hud.querySelectorAll<HTMLButtonElement>(".break-ally");
  breakButtons.forEach((btn) => {
    btn.onclick = () => {
      const id = btn.dataset.allyId;
      if (!id) return;
      sendGameMessage({ type: "ALLIANCE_BREAK", targetPlayerId: id }, "Finish sign-in before changing alliances.");
    };
  });
  const acceptTruceButtons = hud.querySelectorAll<HTMLButtonElement>(".accept-truce");
  acceptTruceButtons.forEach((btn) => {
    btn.onclick = () => {
      const id = btn.dataset.truceRequestId;
      if (!id) return;
      sendGameMessage({ type: "TRUCE_ACCEPT", requestId: id }, "Finish sign-in before responding to truces.");
    };
  });
  const breakTruceButtons = hud.querySelectorAll<HTMLButtonElement>(".break-truce");
  breakTruceButtons.forEach((btn) => {
    btn.onclick = () => {
      const id = btn.dataset.trucePlayerId;
      if (!id) return;
      sendGameMessage({ type: "TRUCE_BREAK", targetPlayerId: id }, "Finish sign-in before changing truces.");
    };
  });

  const authLogoutBtn = document.querySelector<HTMLButtonElement>("#auth-logout");
  if (authLogoutBtn) {
    authLogoutBtn.onclick = async () => {
      if (!firebaseAuth) return;
      await signOut(firebaseAuth);
      window.location.reload();
    };
  }
  const economyFocusButtons = hud.querySelectorAll<HTMLButtonElement>("[data-economy-focus]");
  economyFocusButtons.forEach((btn) => {
    btn.onclick = () => {
      const focus = btn.dataset.economyFocus as EconomyFocusKey | undefined;
      if (!focus) return;
      state.economyFocus = focus;
      renderHud();
    };
  });
  const canShowGuide = state.guide.open && state.authSessionReady && !state.profileSetupRequired;
  guideOverlayEl.style.display = canShowGuide ? "grid" : "none";
  if (canShowGuide) {
    const step = guideSteps[Math.min(state.guide.stepIndex, guideSteps.length - 1)]!;
    guideOverlayEl.innerHTML = `
      <div class="guide-backdrop" id="guide-backdrop"></div>
      <div class="guide-modal card" role="dialog" aria-modal="true" aria-labelledby="guide-title">
        <button id="guide-close" class="guide-close-btn" type="button" aria-label="Close guide">×</button>
        <div class="guide-modal-scroll">
          <div class="guide-kicker">Step ${state.guide.stepIndex + 1} of ${guideSteps.length}</div>
          <h2 id="guide-title" class="guide-title">${step.title}</h2>
          <p class="guide-body">${step.body}</p>
          <div class="guide-progress">
            ${guideSteps.map((_, index) => `<span class="guide-progress-segment${index <= state.guide.stepIndex ? " is-active" : ""}"></span>`).join("")}
          </div>
          <div class="guide-actions">
            <button id="guide-skip" class="guide-link-btn" type="button">Skip Tutorial</button>
            <div class="guide-actions-right">
              ${state.guide.stepIndex > 0 ? '<button id="guide-back" class="panel-btn guide-secondary-btn" type="button">Back</button>' : ""}
              <button id="guide-next" class="panel-btn guide-primary-btn" type="button">${state.guide.stepIndex === guideSteps.length - 1 ? "Get Started" : "Next"}</button>
            </div>
          </div>
        </div>
      </div>
    `;
    const closeGuide = (markComplete: boolean): void => {
      state.guide.open = false;
      if (markComplete) {
        state.guide.completed = true;
        storageSet(GUIDE_STORAGE_KEY, "1");
      }
      renderHud();
    };
    const guideCloseBtn = guideOverlayEl.querySelector<HTMLButtonElement>("#guide-close");
    const guideBackdropBtn = guideOverlayEl.querySelector<HTMLDivElement>("#guide-backdrop");
    const guideSkipBtn = guideOverlayEl.querySelector<HTMLButtonElement>("#guide-skip");
    const guideBackBtn = guideOverlayEl.querySelector<HTMLButtonElement>("#guide-back");
    const guideNextBtn = guideOverlayEl.querySelector<HTMLButtonElement>("#guide-next");
    if (guideCloseBtn) guideCloseBtn.onclick = () => closeGuide(true);
    if (guideBackdropBtn) guideBackdropBtn.onclick = () => closeGuide(true);
    if (guideSkipBtn) guideSkipBtn.onclick = () => closeGuide(true);
    if (guideBackBtn) {
      guideBackBtn.onclick = () => {
        state.guide.stepIndex = Math.max(0, state.guide.stepIndex - 1);
        renderHud();
      };
    }
    if (guideNextBtn) {
      guideNextBtn.onclick = () => {
        if (state.guide.stepIndex >= guideSteps.length - 1) {
          closeGuide(true);
          return;
        }
        state.guide.stepIndex += 1;
        renderHud();
      };
    }
  } else if (guideOverlayEl.innerHTML) {
    guideOverlayEl.innerHTML = "";
  }

  syncAuthOverlay();
  renderMobilePanels();
};

const resize = (): void => {
  const { width, height } = viewportSize();
  canvas.width = width;
  canvas.height = height;
};
window.addEventListener("resize", resize);
window.visualViewport?.addEventListener("resize", resize);
resize();

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
let reconnectReloadTimer: number | undefined;
let authReconnectTimer: number | undefined;
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
    void authenticateSocket(forceRefresh).catch((error) => {
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

const sendAllianceRequest = (target: string): void => {
  const t = target.trim();
  if (!t) return;
  sendGameMessage({ type: "ALLIANCE_REQUEST", targetPlayerName: t }, "Finish sign-in before sending alliance requests.");
};
const sendTruceRequest = (targetPlayerName: string, durationHours: 12 | 24): void => {
  const t = targetPlayerName.trim();
  if (!t) return;
  sendGameMessage({ type: "TRUCE_REQUEST", targetPlayerName: t, durationHours }, "Finish sign-in before sending truce offers.");
};
const breakAlliance = (target: string): void => {
  const t = target.trim();
  if (!t) return;
  sendGameMessage({ type: "ALLIANCE_BREAK", targetPlayerId: t }, "Finish sign-in before breaking alliances.");
};
const breakTruce = (targetPlayerId: string): void => {
  const t = targetPlayerId.trim();
  if (!t) return;
  sendGameMessage({ type: "TRUCE_BREAK", targetPlayerId: t }, "Finish sign-in before breaking truces.");
};
const activeTruceWithPlayer = (playerId?: string | null): ActiveTruceView | undefined =>
  playerId ? state.activeTruces.find((truce) => truce.otherPlayerId === playerId && truce.endsAt > Date.now()) : undefined;
const currentTechPickId = (): string => {
  const byState = state.techUiSelectedId?.trim();
  if (byState) return byState;
  const byDesktop = techPickEl.value?.trim();
  if (byDesktop) return byDesktop;
  const byMobile = mobileTechPickEl.value?.trim();
  if (byMobile) return byMobile;
  return "";
};
const chooseTech = (techIdRaw?: string): void => {
  const techId = (techIdRaw ?? "").trim() || currentTechPickId();
  if (!techId) {
    console.error("[tech] choose blocked: empty tech id", {
      stateTechUiSelectedId: state.techUiSelectedId,
      desktopValue: techPickEl.value,
      mobileValue: mobileTechPickEl.value,
      choices: state.techChoices
    });
    pushFeed("No tech selected.", "tech", "warn");
    return;
  }
  if (ws.readyState !== ws.OPEN) {
    console.error("[tech] choose blocked: websocket not open", { techId, readyState: ws.readyState });
    pushFeed("Cannot choose tech while disconnected.", "tech", "error");
    return;
  }
  if (!state.authSessionReady) {
    setAuthStatus("Finish sign-in before choosing a technology.", "error");
    syncAuthOverlay();
    return;
  }
  if (state.pendingTechUnlockId) {
    pushFeed("Already unlocking a technology. Waiting for server confirmation...", "tech", "warn");
    return;
  }
  const tech = state.techCatalog.find((item) => item.id === techId);
  if (!tech) {
    pushFeed("That technology is no longer available.", "tech", "warn");
    return;
  }
  state.techUiSelectedId = techId;
  state.pendingTechUnlockId = techId;
  console.info("[tech] sending CHOOSE_TECH", { techId });
  ws.send(JSON.stringify({ type: "CHOOSE_TECH", techId }));
  pushFeed(`Unlocking: ${tech.name}.`, "tech", "info");
  renderHud();
};

const explainActionFailure = (code: string, message: string): string => {
  if (code === "INSUFFICIENT_GOLD") return `Action blocked: ${message}.`;
  if (code === "SETTLE_INVALID") return `Cannot settle: ${message}.`;
  if (code === "FORT_BUILD_INVALID") return `Cannot build fort: ${message}.`;
  if (code === "OBSERVATORY_BUILD_INVALID") return `Cannot build observatory: ${message}.`;
  if (code === "SIEGE_OUTPOST_BUILD_INVALID") return `Cannot build siege outpost: ${message}.`;
  if (code === "ECONOMIC_STRUCTURE_BUILD_INVALID") return `Cannot build structure: ${message}.`;
  if (code === "REVEAL_EMPIRE_INVALID") return `Cannot reveal empire: ${message}.`;
  if (code === "SIPHON_INVALID") return `Cannot siphon tile: ${message}.`;
  if (code === "PURGE_SIPHON_INVALID") return `Cannot purge siphon: ${message}.`;
  if (code === "AETHER_BRIDGE_INVALID") return `Cannot cast Aether Bridge: ${message}.`;
  if (code === "CREATE_MOUNTAIN_INVALID") return `Cannot create mountain: ${message}.`;
  if (code === "REMOVE_MOUNTAIN_INVALID") return `Cannot remove mountain: ${message}.`;
  if (code === "NOT_ADJACENT") return "Action blocked: target must border your territory or a linked dock.";
  if (code === "NOT_OWNER") return "Action blocked: you need to launch from one of your own tiles.";
  if (code === "LOCKED") return "Action blocked: the tile is already in combat.";
  if (code === "BARRIER") return "Action blocked: only land tiles can be claimed or attacked.";
  if (code === "SHIELDED") return "Action blocked: that empire is still under spawn protection.";
  if (code === "ALLY_TARGET") return "Action blocked: you cannot attack an allied or truced empire.";
  if (code === "BREAKTHROUGH_TARGET_INVALID") return `Cannot launch breach attack: ${message}.`;
  if (code === "EXPAND_TARGET_OWNED") return "Frontier claim failed: that tile is already owned.";
  if (message.includes("development slots are busy")) return `Cannot start development: ${message}. You can run up to ${DEVELOPMENT_PROCESS_LIMIT} at once.`;
  return `Error ${code}: ${message}`;
};

const enqueueTarget = (x: number, y: number, mode: "normal" | "breakthrough" = "normal"): boolean =>
  enqueueTargetFromModule(state, x, y, key, mode);

const worldTileRawFromPointer = (offsetX: number, offsetY: number): { gx: number; gy: number } => {
  const size = state.zoom;
  const halfW = Math.floor(canvas.width / size / 2);
  const halfH = Math.floor(canvas.height / size / 2);
  return {
    gx: Math.floor(offsetX / size) - halfW + state.camX,
    gy: Math.floor(offsetY / size) - halfH + state.camY
  };
};

const computeDragPreview = (): void => {
  const start = state.boxSelectStart;
  const cur = state.boxSelectCurrent;
  state.dragPreviewKeys.clear();
  if (!start || !cur) return;
  const minX = Math.min(start.gx, cur.gx);
  const maxX = Math.max(start.gx, cur.gx);
  const minY = Math.min(start.gy, cur.gy);
  const maxY = Math.max(start.gy, cur.gy);
  const area = (maxX - minX + 1) * (maxY - minY + 1);
  if (area > 2500) return;
  for (let gy = minY; gy <= maxY; gy += 1) {
    for (let gx = minX; gx <= maxX; gx += 1) {
      const wx = wrapX(gx);
      const wy = wrapY(gy);
      const t = state.tiles.get(key(wx, wy));
      if (!t || t.fogged || t.terrain !== "LAND") continue;
      if (t.ownerId === state.me) {
        if (!hasCollectableYield(t)) continue;
      }
      state.dragPreviewKeys.add(key(wx, wy));
    }
  }
};

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

const showHoldBuildMenu = (x: number, y: number, clientX: number, clientY: number): void => {
  const tile = state.tiles.get(key(x, y));
  if (!tile || tile.ownerId !== state.me || tile.terrain !== "LAND") {
    hideHoldBuildMenu();
    return;
  }
  state.selected = { x, y };
  const development = developmentSlotSummary();
  const hasDevelopmentSlot = development.available > 0;
  const queueableWhenBusy = !hasDevelopmentSlot;
  const hasBlockingStructure = Boolean(tile.fort || tile.siegeOutpost || tile.observatory || tile.economicStructure);
  const canUpgradeWoodenFort = tile.economicStructure?.type === "WOODEN_FORT" && state.techIds.includes("masonry");
  const canUpgradeLightOutpost = tile.economicStructure?.type === "LIGHT_OUTPOST" && state.techIds.includes("leatherworking");
  const fortGoldCost = structureGoldCost("FORT");
  const siegeGoldCost = structureGoldCost("SIEGE_OUTPOST");
  const woodenFortGoldCost = structureGoldCost("WOODEN_FORT");
  const lightOutpostGoldCost = structureGoldCost("LIGHT_OUTPOST");
  const observatoryGoldCost = structureGoldCost("OBSERVATORY");
  const isBorderOrDock = Boolean(tile.dockId || isOwnedBorderTile(x, y));
  const isBorderTileOnly = isOwnedBorderTile(x, y);
  const canBuildStarterWoodenFort =
    tile.ownerId === state.me &&
    tile.ownershipState === "SETTLED" &&
    isBorderOrDock &&
    !tile.fort &&
    !tile.siegeOutpost &&
    !tile.observatory &&
    !tile.economicStructure &&
    !tile.resource &&
    !tile.town &&
    state.gold >= woodenFortGoldCost;
  const canBuildAdvancedFort =
    tile.ownerId === state.me &&
    tile.ownershipState === "SETTLED" &&
    isBorderOrDock &&
    !tile.fort &&
    !tile.siegeOutpost &&
    !tile.observatory &&
    (!tile.economicStructure || canUpgradeWoodenFort) &&
    state.techIds.includes("masonry") &&
    state.gold >= fortGoldCost &&
    (state.strategicResources.IRON ?? 0) >= 45;
  const canBuildStarterLightOutpost =
    tile.ownerId === state.me &&
    tile.ownershipState === "SETTLED" &&
    isBorderTileOnly &&
    !tile.fort &&
    !tile.siegeOutpost &&
    !tile.observatory &&
    !tile.economicStructure &&
    !tile.resource &&
    !tile.town &&
    !tile.dockId &&
    state.gold >= lightOutpostGoldCost;
  const canBuildAdvancedSiegeOutpost =
    tile.ownerId === state.me &&
    tile.ownershipState === "SETTLED" &&
    isBorderTileOnly &&
    !tile.siegeOutpost &&
    !tile.fort &&
    !tile.observatory &&
    (!tile.economicStructure || canUpgradeLightOutpost) &&
    state.techIds.includes("leatherworking") &&
    state.gold >= siegeGoldCost &&
    (state.strategicResources.SUPPLY ?? 0) >= 45;
  const canAffordFort = canBuildStarterWoodenFort || canBuildAdvancedFort;
  const canAffordSiege = canBuildStarterLightOutpost || canBuildAdvancedSiegeOutpost;
  const canAffordObservatory =
    tile.ownershipState === "SETTLED" &&
    !tile.fort &&
    !tile.siegeOutpost &&
    !tile.observatory &&
    !tile.economicStructure &&
    state.techIds.includes("cartography") &&
    state.gold >= observatoryGoldCost &&
    (state.strategicResources.CRYSTAL ?? 0) >= 45;
  const canBuildFarmstead =
    tile.ownershipState === "SETTLED" &&
    !hasBlockingStructure &&
    (tile.resource === "FARM" || tile.resource === "FISH") &&
    state.techIds.includes("agriculture") &&
    state.gold >= 700 &&
    (state.strategicResources.FOOD ?? 0) >= 20;
  const canBuildCamp =
    tile.ownershipState === "SETTLED" &&
    !hasBlockingStructure &&
    (tile.resource === "WOOD" || tile.resource === "FUR") &&
    state.techIds.includes("leatherworking") &&
    state.gold >= 800 &&
    (state.strategicResources.SUPPLY ?? 0) >= 30;
  const canBuildMine =
    tile.ownershipState === "SETTLED" &&
    !hasBlockingStructure &&
    (tile.resource === "IRON" || tile.resource === "GEMS") &&
    state.techIds.includes("mining") &&
    state.gold >= 800 &&
    (state.strategicResources[tile.resource === "IRON" ? "IRON" : "CRYSTAL"] ?? 0) >= 30;
  const canBuildMarket =
    tile.ownershipState === "SETTLED" &&
    !hasBlockingStructure &&
    Boolean(tile.town) &&
    tile.town?.populationTier !== "SETTLEMENT" &&
    state.techIds.includes("trade") &&
    state.gold >= 1200 &&
    (state.strategicResources.CRYSTAL ?? 0) >= 40;
  const canBuildGranary =
    tile.ownershipState === "SETTLED" &&
    !hasBlockingStructure &&
    Boolean(tile.town) &&
    tile.town?.populationTier !== "SETTLEMENT" &&
    state.techIds.includes("pottery") &&
    state.gold >= 700 &&
    (state.strategicResources.FOOD ?? 0) >= 40;
  const settlementQueued = hasQueuedSettlementForTile(state.developmentQueue, key(x, y));
  holdBuildMenuEl.innerHTML = `
    <div class="hold-menu-card">
      <div class="hold-menu-title">Build on (${x}, ${y})</div>
      <button class="hold-menu-btn" data-build="settle" ${tile.ownershipState === "FRONTIER" && canAffordCost(state.gold, SETTLE_COST) && !settlementQueued ? "" : "disabled"}>
        <span>Settle Tile</span>
        <small>${SETTLE_COST} gold • ${(settleDurationMsForTile(x, y) / 1000).toFixed(0)}s${isForestTile(x, y) ? " (Forest)" : ""} • converts frontier to settled${settlementQueued ? " • already queued" : queueableWhenBusy && tile.ownershipState === "FRONTIER" ? " • queues" : ""}</small>
      </button>
      <button class="hold-menu-btn" data-build="fort" ${canAffordFort ? "" : "disabled"}>
        <span>${canUpgradeWoodenFort ? "Upgrade to Fort" : state.techIds.includes("masonry") ? "Fort" : "Wooden Fort"}</span>
        <small>${state.techIds.includes("masonry") ? `${structureCostText("FORT")} • ${(FORT_BUILD_MS / 1000).toFixed(0)}s • def x${FORT_DEFENSE_MULT.toFixed(2)}` : `${structureCostText("WOODEN_FORT")} • ${(WOODEN_FORT_BUILD_MS / 1000).toFixed(0)}s • def x${WOODEN_FORT_DEFENSE_MULT.toFixed(2)}`} • 1 gold / min${queueableWhenBusy ? " • queues" : ""}</small>
      </button>
      <button class="hold-menu-btn" data-build="observatory" ${canAffordObservatory ? "" : "disabled"}>
        <span>Observatory</span>
        <small>${structureCostText("OBSERVATORY")} • +5 local vision • 0.025 crystal / min${queueableWhenBusy && canAffordObservatory ? " • queues" : ""}</small>
      </button>
      <button class="hold-menu-btn" data-build="farmstead" ${canBuildFarmstead ? "" : "disabled"}>
        <span>Farmstead</span>
        <small>700 gold + 20 FOOD • +50% food output • 1 gold / 10m${queueableWhenBusy && canBuildFarmstead ? " • queues" : ""}</small>
      </button>
      <button class="hold-menu-btn" data-build="camp" ${canBuildCamp ? "" : "disabled"}>
        <span>Camp</span>
        <small>800 gold + 30 SUPPLY • +50% supply output • 1.2 gold / 10m${queueableWhenBusy && canBuildCamp ? " • queues" : ""}</small>
      </button>
      <button class="hold-menu-btn" data-build="mine" ${canBuildMine ? "" : "disabled"}>
        <span>Mine</span>
        <small>800 gold + 30 matching resource • +50% iron or crystal • 1.2 gold / 10m${queueableWhenBusy && canBuildMine ? " • queues" : ""}</small>
      </button>
      <button class="hold-menu-btn" data-build="market" ${canBuildMarket ? "" : "disabled"}>
        <span>Market</span>
        <small>1200 gold + 40 CRYSTAL • +50% fed town gold • +50% town cap • 0.05 crystal / min${queueableWhenBusy && canBuildMarket ? " • queues" : ""}</small>
      </button>
      <button class="hold-menu-btn" data-build="granary" ${canBuildGranary ? "" : "disabled"}>
        <span>Granary</span>
        <small>700 gold + 40 FOOD • +50% town gold cap • 1 gold / 10m${queueableWhenBusy && canBuildGranary ? " • queues" : ""}</small>
      </button>
      <button class="hold-menu-btn" data-build="siege" ${canAffordSiege ? "" : "disabled"}>
        <span>${canUpgradeLightOutpost ? "Upgrade to Siege Outpost" : state.techIds.includes("leatherworking") ? "Siege Outpost" : "Light Outpost"}</span>
        <small>${state.techIds.includes("leatherworking") ? `${structureCostText("SIEGE_OUTPOST")} • ${(SIEGE_OUTPOST_BUILD_MS / 1000).toFixed(0)}s • atk x${SIEGE_OUTPOST_ATTACK_MULT.toFixed(2)}` : `${structureCostText("LIGHT_OUTPOST")} • ${(LIGHT_OUTPOST_BUILD_MS / 1000).toFixed(0)}s • atk x${LIGHT_OUTPOST_ATTACK_MULT.toFixed(2)}`} • 1 gold / min${queueableWhenBusy ? " • queues" : ""}</small>
      </button>
    </div>
  `;
  const { width: vw, height: vh } = viewportSize();
  const menuW = Math.min(290, vw - 16);
  const menuH = 168;
  const left = Math.max(8, Math.min(vw - menuW - 8, clientX + 8));
  const top = Math.max(84, Math.min(vh - menuH - 8, clientY + 8));
  holdBuildMenuEl.style.width = `${menuW}px`;
  holdBuildMenuEl.style.left = `${left}px`;
  holdBuildMenuEl.style.top = `${top}px`;
  holdBuildMenuEl.style.display = "block";

  const settleBtn = holdBuildMenuEl.querySelector<HTMLButtonElement>("button[data-build='settle']");
  const fortBtn = holdBuildMenuEl.querySelector<HTMLButtonElement>("button[data-build='fort']");
  const observatoryBtn = holdBuildMenuEl.querySelector<HTMLButtonElement>("button[data-build='observatory']");
  const farmsteadBtn = holdBuildMenuEl.querySelector<HTMLButtonElement>("button[data-build='farmstead']");
  const campBtn = holdBuildMenuEl.querySelector<HTMLButtonElement>("button[data-build='camp']");
  const mineBtn = holdBuildMenuEl.querySelector<HTMLButtonElement>("button[data-build='mine']");
  const marketBtn = holdBuildMenuEl.querySelector<HTMLButtonElement>("button[data-build='market']");
  const granaryBtn = holdBuildMenuEl.querySelector<HTMLButtonElement>("button[data-build='granary']");
  const siegeBtn = holdBuildMenuEl.querySelector<HTMLButtonElement>("button[data-build='siege']");
  if (settleBtn) {
    settleBtn.onclick = () => {
      requestSettlement(x, y);
      hideHoldBuildMenu();
    };
  }
  if (fortBtn) {
    fortBtn.onclick = () => {
      if (canBuildAdvancedFort) {
        sendDevelopmentBuild({ type: "BUILD_FORT", x, y }, () => applyOptimisticStructureBuild(x, y, "FORT"), {
          x,
          y,
          label: `${canUpgradeWoodenFort ? "Fort upgrade" : "Fort"} at (${x}, ${y})`,
          optimisticKind: "FORT"
        });
      } else if (canBuildStarterWoodenFort) {
        sendDevelopmentBuild({ type: "BUILD_ECONOMIC_STRUCTURE", x, y, structureType: "WOODEN_FORT" }, () => applyOptimisticStructureBuild(x, y, "WOODEN_FORT"), {
          x,
          y,
          label: `Wooden Fort at (${x}, ${y})`,
          optimisticKind: "WOODEN_FORT"
        });
      }
      hideHoldBuildMenu();
    };
  }
  if (siegeBtn) {
    siegeBtn.onclick = () => {
      if (canBuildAdvancedSiegeOutpost) {
        sendDevelopmentBuild({ type: "BUILD_SIEGE_OUTPOST", x, y }, () => applyOptimisticStructureBuild(x, y, "SIEGE_OUTPOST"), {
          x,
          y,
          label: `${canUpgradeLightOutpost ? "Siege outpost upgrade" : "Siege outpost"} at (${x}, ${y})`,
          optimisticKind: "SIEGE_OUTPOST"
        });
      } else if (canBuildStarterLightOutpost) {
        sendDevelopmentBuild({ type: "BUILD_ECONOMIC_STRUCTURE", x, y, structureType: "LIGHT_OUTPOST" }, () => applyOptimisticStructureBuild(x, y, "LIGHT_OUTPOST"), {
          x,
          y,
          label: `Light Outpost at (${x}, ${y})`,
          optimisticKind: "LIGHT_OUTPOST"
        });
      }
      hideHoldBuildMenu();
    };
  }
  if (observatoryBtn) {
    observatoryBtn.onclick = () => {
      sendDevelopmentBuild({ type: "BUILD_OBSERVATORY", x, y }, () => applyOptimisticStructureBuild(x, y, "OBSERVATORY"), {
        x,
        y,
        label: `Observatory at (${x}, ${y})`,
        optimisticKind: "OBSERVATORY"
      });
      hideHoldBuildMenu();
    };
  }
  if (farmsteadBtn) {
    farmsteadBtn.onclick = () => {
      sendDevelopmentBuild({ type: "BUILD_ECONOMIC_STRUCTURE", x, y, structureType: "FARMSTEAD" }, () => applyOptimisticStructureBuild(x, y, "FARMSTEAD"), {
        x,
        y,
        label: `Farmstead at (${x}, ${y})`,
        optimisticKind: "FARMSTEAD"
      });
      hideHoldBuildMenu();
    };
  }
  if (campBtn) {
    campBtn.onclick = () => {
      sendDevelopmentBuild({ type: "BUILD_ECONOMIC_STRUCTURE", x, y, structureType: "CAMP" }, () => applyOptimisticStructureBuild(x, y, "CAMP"), {
        x,
        y,
        label: `Camp at (${x}, ${y})`,
        optimisticKind: "CAMP"
      });
      hideHoldBuildMenu();
    };
  }
  if (mineBtn) {
    mineBtn.onclick = () => {
      sendDevelopmentBuild({ type: "BUILD_ECONOMIC_STRUCTURE", x, y, structureType: "MINE" }, () => applyOptimisticStructureBuild(x, y, "MINE"), {
        x,
        y,
        label: `Mine at (${x}, ${y})`,
        optimisticKind: "MINE"
      });
      hideHoldBuildMenu();
    };
  }
  if (marketBtn) {
    marketBtn.onclick = () => {
      sendDevelopmentBuild({ type: "BUILD_ECONOMIC_STRUCTURE", x, y, structureType: "MARKET" }, () => applyOptimisticStructureBuild(x, y, "MARKET"), {
        x,
        y,
        label: `Market at (${x}, ${y})`,
        optimisticKind: "MARKET"
      });
      hideHoldBuildMenu();
    };
  }
  if (granaryBtn) {
    granaryBtn.onclick = () => {
      sendDevelopmentBuild({ type: "BUILD_ECONOMIC_STRUCTURE", x, y, structureType: "GRANARY" }, () => applyOptimisticStructureBuild(x, y, "GRANARY"), {
        x,
        y,
        label: `Granary at (${x}, ${y})`,
        optimisticKind: "GRANARY"
      });
      hideHoldBuildMenu();
    };
  }
  renderHud();
};

allianceSendBtn.onclick = () => {
  sendAllianceRequest(allianceTargetEl.value);
};
mobileAllianceSendBtn.onclick = () => {
  sendAllianceRequest(mobileAllianceTargetEl.value);
};
allianceBreakBtn.onclick = () => {
  breakAlliance(allianceBreakIdEl.value);
};
mobileAllianceBreakBtn.onclick = () => {
  breakAlliance(mobileAllianceBreakIdEl.value);
};
techChooseBtn.onclick = () => {
  chooseTech();
};
mobileTechChooseBtn.onclick = () => {
  chooseTech();
};
techPickEl.onchange = () => {
  state.techUiSelectedId = techPickEl.value;
  mobileTechPickEl.value = techPickEl.value;
  renderHud();
};
mobileTechPickEl.onchange = () => {
  state.techUiSelectedId = mobileTechPickEl.value;
  techPickEl.value = mobileTechPickEl.value;
  renderHud();
};
centerMeBtn.onclick = () => {
  centerOnOwnedTile();
  requestViewRefresh(2, true);
};
centerMeDesktopBtn.onclick = () => {
  centerOnOwnedTile();
  requestViewRefresh(2, true);
};
collectVisibleDesktopBtn.onclick = () => {
  collectVisibleYield();
};

collectVisibleMobileBtn.onclick = () => {
  collectVisibleYield();
};
captureCancelBtn.onclick = () => cancelOngoingCapture();
captureCloseBtn.onclick = () => {
  state.captureAlert = undefined;
  captureTimeEl.classList.remove("capture-loss");
  renderCaptureProgress();
};
shardAlertCloseBtn.onclick = () => {
  hideShardAlert();
  renderShardAlert();
};
panelCloseBtn.onclick = () => {
  state.activePanel = null;
  renderHud();
};

panelActionButtons.forEach((btn) => {
  btn.onclick = () => {
    const p = btn.dataset.panel as typeof state.activePanel;
    if (!p) return;
    setActivePanel(p);
  };
});

authColorPresetButtons.forEach((btn) => {
  btn.onclick = () => {
    const color = btn.dataset.color;
    if (!color) return;
    authProfileColorEl.value = color;
    syncAuthPanelState();
  };
});

authProfileColorEl.oninput = () => {
  syncAuthPanelState();
};

authEmailEl.onkeydown = (event) => {
  if (event.key === "Enter" && !state.profileSetupRequired) {
    event.preventDefault();
    authEmailLinkBtn.click();
  }
};

authProfileNameEl.onkeydown = (event) => {
  if (event.key === "Enter" && state.profileSetupRequired) {
    event.preventDefault();
    authProfileSaveBtn.click();
  }
};

const mobileNavButtons = hud.querySelectorAll<HTMLButtonElement>("#mobile-nav button[data-mobile-panel]");
mobileNavButtons.forEach((btn) => {
  btn.onclick = () => {
    const p = btn.dataset.mobilePanel as typeof state.mobilePanel | undefined;
    if (!p) return;
    state.mobilePanel = p;
    if (p === "intel") state.unreadAttackAlerts = 0;
    renderHud();
  };
});

ws.addEventListener("open", () => {
  state.connection = "connected";
  if (!state.mapLoadStartedAt) state.mapLoadStartedAt = Date.now();
  clearReconnectReloadTimer();
  clearAuthReconnectTimer();
  if (state.authReady && !state.authSessionReady) {
    state.authBusy = true;
    setAuthStatus(`Connected to the game server. Syncing ${state.authUserLabel || "empire"}...`);
  }
  renderHud();
  void authenticateSocket();
});
ws.addEventListener("close", () => {
  const currentActionKey = state.actionCurrent ? key(state.actionCurrent.x, state.actionCurrent.y) : "";
  state.connection = "disconnected";
  state.actionInFlight = false;
  state.combatStartAck = false;
  state.actionStartedAt = 0;
  state.actionTargetKey = "";
  state.actionCurrent = undefined;
  if (currentActionKey) clearOptimisticTileState(currentActionKey, true);
  pushFeed("Connection lost. Retrying...", "error", "warn");
  if (state.authReady && !state.authSessionReady) {
    state.authBusy = true;
    setAuthStatus(`Signed into Firebase. Reconnecting to the game server at ${wsUrl}...`);
  }
  clearAuthReconnectTimer();
  scheduleReconnectReload();
  renderHud();
});
ws.addEventListener("error", () => {
  const currentActionKey = state.actionCurrent ? key(state.actionCurrent.x, state.actionCurrent.y) : "";
  state.connection = "disconnected";
  state.actionInFlight = false;
  state.combatStartAck = false;
  state.actionStartedAt = 0;
  state.actionTargetKey = "";
  state.actionCurrent = undefined;
  if (currentActionKey) clearOptimisticTileState(currentActionKey, true);
  pushFeed("Server unreachable. Retrying...", "error", "warn");
  if (state.authReady && !state.authSessionReady) {
    state.authBusy = true;
    setAuthStatus(`Signed into Firebase. Waiting for the game server at ${wsUrl}...`);
  }
  clearAuthReconnectTimer();
  scheduleReconnectReload();
  renderHud();
});

ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data as string) as Record<string, unknown>;
  if (msg.type === "INIT") {
    state.connection = "initialized";
    state.authSessionReady = true;
    state.hasEverInitialized = true;
    state.authBusy = false;
    state.authRetrying = false;
    clearAuthReconnectTimer();
    state.mapLoadStartedAt = Date.now();
    state.firstChunkAt = 0;
    state.chunkFullCount = 0;
    state.hasOwnedTileInCache = false;
    const p = msg.player as Record<string, unknown>;
    state.me = p.id as string;
    state.meName = p.name as string;
    state.playerNames.set(state.me, state.meName);
    state.profileSetupRequired = Boolean(p.profileNeedsSetup);
    setAuthStatus(`Signed in as ${state.authUserLabel || (p.name as string)}.`);
    state.gold = (p.gold as number | undefined) ?? (p.points as number);
    state.level = p.level as number;
    state.mods = (p.mods as typeof state.mods) ?? state.mods;
    state.modBreakdown = (p.modBreakdown as typeof state.modBreakdown | undefined) ?? state.modBreakdown;
    state.incomePerMinute = (p.incomePerMinute as number) ?? state.incomePerMinute;
    state.strategicResources =
      (p.strategicResources as typeof state.strategicResources | undefined) ?? state.strategicResources;
    state.strategicProductionPerMinute =
      (p.strategicProductionPerMinute as typeof state.strategicProductionPerMinute | undefined) ?? state.strategicProductionPerMinute;
    state.stamina = p.stamina as number;
    state.manpower = (p.manpower as number | undefined) ?? state.manpower;
    state.manpowerCap = (p.manpowerCap as number | undefined) ?? state.manpowerCap;
    state.manpowerRegenPerMinute = (p.manpowerRegenPerMinute as number | undefined) ?? state.manpowerRegenPerMinute;
    state.territoryT = (p.T as number) ?? state.territoryT;
    state.exposureE = (p.E as number) ?? state.exposureE;
    state.settledT = (p.Ts as number) ?? state.settledT;
    state.settledE = (p.Es as number) ?? state.settledE;
    const initDefensibility = defensibilityPctFromTE(
      (p.Ts as number | undefined) ?? (p.T as number | undefined),
      (p.Es as number | undefined) ?? (p.E as number | undefined)
    );
    state.defensibilityPct = initDefensibility;
    state.defensibilityAnimDir = 0;
    state.defensibilityAnimUntil = 0;
    state.availableTechPicks = (p.availableTechPicks as number) ?? 0;
    state.techRootId = p.techRootId as string | undefined;
    state.techIds = (p.techIds as string[]) ?? [];
    state.currentResearch = (p.currentResearch as typeof state.currentResearch | undefined) ?? undefined;
    state.pendingTechUnlockId = "";
    state.domainIds = (p.domainIds as string[]) ?? [];
    state.revealCapacity = (p.revealCapacity as number) ?? state.revealCapacity;
    state.activeRevealTargets = (p.activeRevealTargets as string[]) ?? state.activeRevealTargets;
    state.abilityCooldowns =
      (p.abilityCooldowns as typeof state.abilityCooldowns | undefined) ?? state.abilityCooldowns;
    state.manpowerBreakdown =
      (p.manpowerBreakdown as typeof state.manpowerBreakdown | undefined) ?? state.manpowerBreakdown;
    applyPendingSettlementsFromServer(
      (p.pendingSettlements as Array<{ x: number; y: number; startedAt: number; resolvesAt: number }> | undefined) ?? []
    );
    state.allies = (p.allies as string[]) ?? [];
    state.outgoingAllianceRequests = (msg.outgoingAllianceRequests as AllianceRequest[] | undefined) ?? [];
    const myTileColor = p.tileColor as string | undefined;
    if (myTileColor) {
      state.playerColors.set(state.me, myTileColor);
      authProfileColorEl.value = myTileColor;
    }
    const myVisualStyle = p.visualStyle as EmpireVisualStyle | undefined;
    if (myVisualStyle) state.playerVisualStyles.set(state.me, myVisualStyle);
    seedProfileSetupFields((p.name as string) || state.authUserLabel, myTileColor ?? authProfileColorEl.value);
    for (const s of ((msg.playerStyles as Array<{ id: string; name?: string; tileColor?: string; visualStyle?: EmpireVisualStyle; shieldUntil?: number }>) ?? [])) {
      if (s.name) state.playerNames.set(s.id, s.name);
      if (s.tileColor) state.playerColors.set(s.id, s.tileColor);
      if (s.visualStyle) state.playerVisualStyles.set(s.id, s.visualStyle);
      if (typeof s.shieldUntil === "number") state.playerShieldUntil.set(s.id, s.shieldUntil);
    }
    const homeTile = p.homeTile as { x: number; y: number } | undefined;
    if (homeTile) {
      state.homeTile = homeTile;
      state.camX = homeTile.x;
      state.camY = homeTile.y;
      state.selected = homeTile;
    }
    state.techChoices = (msg.techChoices as string[]) ?? [];
    state.techCatalog = (msg.techCatalog as TechInfo[]) ?? [];
    state.domainChoices = (msg.domainChoices as string[]) ?? [];
    state.domainCatalog = (msg.domainCatalog as DomainInfo[]) ?? [];
    if (!state.domainUiSelectedId && state.domainChoices.length > 0) state.domainUiSelectedId = state.domainChoices[0]!;
    state.missions = (msg.missions as MissionState[]) ?? [];
    state.leaderboard =
      (msg.leaderboard as {
        overall: LeaderboardOverallEntry[];
        selfOverall: LeaderboardOverallEntry | undefined;
        byTiles: LeaderboardMetricEntry[];
        byIncome: LeaderboardMetricEntry[];
        byTechs: LeaderboardMetricEntry[];
      }) ?? state.leaderboard;
    state.seasonVictory = (msg.seasonVictory as SeasonVictoryObjectiveView[] | undefined) ?? state.seasonVictory;
    state.seasonWinner = (msg.seasonWinner as SeasonWinnerView | undefined) ?? state.seasonWinner;
    if (state.profileSetupRequired) {
      setAuthStatus("Choose a display name and nation color to begin.");
    }
    state.incomingAllianceRequests = (msg.allianceRequests as AllianceRequest[]) ?? [];
    state.activeTruces = (msg.activeTruces as ActiveTruceView[]) ?? [];
    state.incomingTruceRequests = (msg.truceRequests as TruceRequest[]) ?? [];
    state.activeAetherBridges = (msg.activeAetherBridges as ActiveAetherBridgeView[]) ?? [];
    state.strategicReplayEvents = (p.strategicReplayEvents as StrategicReplayEvent[] | undefined) ?? [];
    resetStrategicReplayState();
    const cfg = (msg.config as { season?: { seasonId: string; worldSeed?: number }; fogDisabled?: boolean } | undefined) ?? {};
    const season = cfg.season;
    if (typeof season?.worldSeed === "number") {
      setWorldSeed(season.worldSeed);
      clearRenderCaches();
      buildMiniMapBase();
    }
    state.fogDisabled = Boolean(cfg.fogDisabled);
    const mapMeta = (msg.mapMeta as { dockCount?: number; dockPairCount?: number; clusterCount?: number; townCount?: number; dockPairs?: DockPair[] } | undefined) ?? {};
    const shardRainNotice =
      (msg.shardRainNotice as
        | { phase?: "upcoming" | "started"; startsAt?: number; expiresAt?: number; siteCount?: number }
        | undefined) ?? undefined;
    state.discoveredTiles.clear();
    state.discoveredDockTiles.clear();
    state.dockPairs = mapMeta.dockPairs ?? [];
    state.dockRouteCache.clear();
    pushFeed(`Spawned. ${season?.seasonId ? `Season ${season.seasonId}.` : ""} Your tile is centered.`, "info", "success");
    if (cfg.fogDisabled) pushFeed("Fog of war is disabled for this server session.", "info", "warn");
    if (typeof mapMeta.dockCount === "number") {
      pushFeed(
        `Map features: ${mapMeta.dockCount} docks (${mapMeta.dockPairCount ?? Math.floor(mapMeta.dockCount / 2)} pairs), ${mapMeta.clusterCount ?? 0} clusters.`,
        "info",
        "info"
      );
      if (typeof mapMeta.townCount === "number") {
        pushFeed(`Towns on world: ${mapMeta.townCount}.`, "info", "info");
      }
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
    requestViewRefresh();
    syncAuthOverlay();
    renderHud();
  }
  const applyChunkTiles = (tiles: Tile[]): void => {
    state.chunkFullCount += 1;
    if (state.firstChunkAt === 0) state.firstChunkAt = Date.now();
    let sawVisibleTile = false;
    let sawOwnedTile = false;
    for (const t of tiles) {
      const existing = state.tiles.get(key(t.x, t.y));
      const mergedTile = mergeServerTileWithOptimisticState(mergeIncomingTileDetail(existing, t));
      state.tiles.set(key(mergedTile.x, mergedTile.y), mergedTile);
      maybeAnnounceShardSite(existing, mergedTile);
      if (!mergedTile.optimisticPending) clearOptimisticTileState(key(mergedTile.x, mergedTile.y));
      markDockDiscovered(mergedTile);
      if (!mergedTile.fogged) state.discoveredTiles.add(key(mergedTile.x, mergedTile.y));
      if (!mergedTile.fogged) sawVisibleTile = true;
      if (mergedTile.ownerId === state.me) sawOwnedTile = true;
    }
    if (sawOwnedTile) {
      state.hasOwnedTileInCache = true;
    } else if (!state.hasOwnedTileInCache) {
      centerOnOwnedTile();
    }
    renderHud();
  };
  if (msg.type === "CHUNK_FULL") {
    applyChunkTiles(msg.tilesMaskedByFog as Tile[]);
  }
  if (msg.type === "CHUNK_BATCH") {
    const chunks = (msg.chunks as Array<{ cx: number; cy: number; tilesMaskedByFog: Tile[] }>) ?? [];
    for (const chunk of chunks) applyChunkTiles(chunk.tilesMaskedByFog);
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
    state.strategicResources =
      (msg.strategicResources as typeof state.strategicResources | undefined) ?? state.strategicResources;
    state.strategicProductionPerMinute =
      (msg.strategicProductionPerMinute as typeof state.strategicProductionPerMinute | undefined) ?? state.strategicProductionPerMinute;
    state.manpower = (msg.manpower as number | undefined) ?? state.manpower;
    state.manpowerCap = (msg.manpowerCap as number | undefined) ?? state.manpowerCap;
    state.manpowerRegenPerMinute = (msg.manpowerRegenPerMinute as number | undefined) ?? state.manpowerRegenPerMinute;
    state.upkeepPerMinute =
      (msg.upkeepPerMinute as typeof state.upkeepPerMinute | undefined) ?? state.upkeepPerMinute;
    state.upkeepLastTick =
      (msg.upkeepLastTick as typeof state.upkeepLastTick | undefined) ?? state.upkeepLastTick;
    state.manpowerBreakdown =
      (msg.manpowerBreakdown as typeof state.manpowerBreakdown | undefined) ?? state.manpowerBreakdown;
    applyPendingSettlementsFromServer(
      (msg.pendingSettlements as Array<{ x: number; y: number; startedAt: number; resolvesAt: number }> | undefined) ?? []
    );
    state.incomingAllianceRequests =
      (msg.incomingAllianceRequests as AllianceRequest[] | undefined) ?? state.incomingAllianceRequests;
    state.outgoingAllianceRequests =
      (msg.outgoingAllianceRequests as AllianceRequest[] | undefined) ?? state.outgoingAllianceRequests;
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
    for (const k of ["FOOD", "IRON", "CRYSTAL", "SUPPLY", "SHARD", "OIL"] as const) {
      const prev = prevStrategic[k] ?? 0;
      const next = state.strategicResources[k] ?? 0;
      if (next > prev) {
        state.strategicAnim[k].until = Date.now() + 350;
        state.strategicAnim[k].dir = 1;
      } else if (next < prev) {
        state.strategicAnim[k].until = Date.now() + 350;
        state.strategicAnim[k].dir = -1;
      } else if (Date.now() >= state.strategicAnim[k].until) {
        state.strategicAnim[k].dir = 0;
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
    state.techChoices = (msg.techChoices as string[]) ?? state.techChoices;
    state.techCatalog = (msg.techCatalog as TechInfo[]) ?? state.techCatalog;
    state.currentResearch = (msg.currentResearch as typeof state.currentResearch | undefined) ?? undefined;
    if (typeof msg.profileNeedsSetup === "boolean") state.profileSetupRequired = msg.profileNeedsSetup;
    state.domainIds = (msg.domainIds as string[]) ?? state.domainIds;
    state.domainChoices = (msg.domainChoices as string[]) ?? state.domainChoices;
    state.domainCatalog = (msg.domainCatalog as DomainInfo[]) ?? state.domainCatalog;
    state.revealCapacity = (msg.revealCapacity as number) ?? state.revealCapacity;
    state.activeRevealTargets = (msg.activeRevealTargets as string[]) ?? state.activeRevealTargets;
    state.abilityCooldowns =
      (msg.abilityCooldowns as typeof state.abilityCooldowns | undefined) ?? state.abilityCooldowns;
    state.missions = (msg.missions as MissionState[]) ?? state.missions;
    state.leaderboard =
      (msg.leaderboard as {
        overall: LeaderboardOverallEntry[];
        selfOverall: LeaderboardOverallEntry | undefined;
        byTiles: LeaderboardMetricEntry[];
        byIncome: LeaderboardMetricEntry[];
        byTechs: LeaderboardMetricEntry[];
      }) ?? state.leaderboard;
    state.seasonVictory = (msg.seasonVictory as SeasonVictoryObjectiveView[] | undefined) ?? state.seasonVictory;
    state.seasonWinner = (msg.seasonWinner as SeasonWinnerView | undefined) ?? state.seasonWinner;
    const myTileColor = msg.tileColor as string | undefined;
    if (myTileColor) {
      state.playerColors.set(state.me, myTileColor);
      authProfileColorEl.value = myTileColor;
    }
    const myVisualStyle = msg.visualStyle as EmpireVisualStyle | undefined;
    if (myVisualStyle) state.playerVisualStyles.set(state.me, myVisualStyle);
    syncAuthOverlay();
    renderHud();
  }
  if (msg.type === "GLOBAL_STATUS_UPDATE") {
    state.leaderboard =
      (msg.leaderboard as {
        overall: LeaderboardOverallEntry[];
        selfOverall: LeaderboardOverallEntry | undefined;
        byTiles: LeaderboardMetricEntry[];
        byIncome: LeaderboardMetricEntry[];
        byTechs: LeaderboardMetricEntry[];
      }) ?? state.leaderboard;
    state.seasonVictory = (msg.seasonVictory as SeasonVictoryObjectiveView[] | undefined) ?? state.seasonVictory;
    state.seasonWinner = (msg.seasonWinner as SeasonWinnerView | undefined) ?? state.seasonWinner;
    renderHud();
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
    applyCombatOutcomeMessage(msg as Record<string, unknown>);
  }
  if (msg.type === "COMBAT_START") {
    const target = msg.target as { x: number; y: number };
    const resolvesAt = msg.resolvesAt as number;
    state.combatStartAck = true;
    const existingCapture =
      state.capture && state.capture.target.x === target.x && state.capture.target.y === target.y ? state.capture : undefined;
    const startAt = existingCapture?.startAt ?? Date.now();
    state.capture = { startAt, resolvesAt, target };
    const predictedResult = msg.predictedResult as Record<string, unknown> | undefined;
    if (predictedResult) {
      const predictedAlert = combatResolutionAlert(predictedResult, {
        targetTileBefore: state.tiles.get(key(target.x, target.y)),
        originTileBefore: (() => {
          const origin = predictedResult.origin as { x: number; y: number } | undefined;
          return origin ? state.tiles.get(key(origin.x, origin.y)) : undefined;
        })()
      });
      state.pendingCombatReveal = {
        targetKey: key(target.x, target.y),
        title: predictedAlert.title,
        detail: predictedAlert.detail,
        tone: predictedAlert.tone,
        ...(typeof predictedAlert.manpowerLoss === "number" ? { manpowerLoss: predictedAlert.manpowerLoss } : {}),
        result: predictedResult,
        revealed: false
      };
    } else if (state.pendingCombatReveal?.targetKey === key(target.x, target.y)) {
      state.pendingCombatReveal = undefined;
    }
    state.actionInFlight = true;
    if (!state.actionStartedAt) state.actionStartedAt = startAt;
    state.actionTargetKey = key(target.x, target.y);
    renderHud();
  }
  if (msg.type === "ATTACK_ALERT") {
    const attackerName = (msg.attackerName as string | undefined) || (msg.attackerId as string | undefined) || "Unknown attacker";
    const x = Number(msg.x ?? -1);
    const y = Number(msg.y ?? -1);
    const resolvesAt = Number(msg.resolvesAt ?? Date.now() + 3000);
    const fromX = typeof msg.fromX === "number" ? Number(msg.fromX) : undefined;
    const fromY = typeof msg.fromY === "number" ? Number(msg.fromY) : undefined;
    if (x >= 0 && y >= 0) {
      state.incomingAttacksByTile.set(key(x, y), { attackerName, resolvesAt });
    }
    state.unreadAttackAlerts += 1;
    pushFeed(
      `Under attack: ${attackerName} is striking (${x}, ${y})${fromX !== undefined && fromY !== undefined ? ` from (${fromX}, ${fromY})` : ""}.`,
      "combat",
      "error"
    );
    renderHud();
  }
  if (msg.type === "COMBAT_CANCELLED") {
    const cancelledCurrentKey = state.actionCurrent ? key(state.actionCurrent.x, state.actionCurrent.y) : "";
    state.capture = undefined;
    if (state.pendingCombatReveal?.targetKey === cancelledCurrentKey) state.pendingCombatReveal = undefined;
    state.actionInFlight = false;
    state.combatStartAck = false;
    state.actionStartedAt = 0;
    state.actionTargetKey = "";
    state.actionCurrent = undefined;
    if (cancelledCurrentKey) state.queuedTargetKeys.delete(cancelledCurrentKey);
    if (cancelledCurrentKey) clearOptimisticTileState(cancelledCurrentKey, true);
    state.autoSettleTargets.clear();
    pushFeed(`Capture cancelled (${(msg.count as number | undefined) ?? 1})`, "combat", "warn");
    renderHud();
  }
  if (msg.type === "FOG_UPDATE") {
    state.fogDisabled = Boolean(msg.fogDisabled);
    pushFeed(`Fog of war ${state.fogDisabled ? "disabled" : "enabled"}.`, "info", "info");
    requestViewRefresh(2, true);
    renderHud();
  }
  if (msg.type === "TILE_DELTA") {
    const updates = (msg.updates as Array<Tile>) ?? [];
    let resolvedQueuedFrontierCapture = false;
    for (const update of updates) {
      const updateKey = key(update.x, update.y);
      state.incomingAttacksByTile.delete(updateKey);
      state.pendingCollectVisibleKeys.delete(key(update.x, update.y));
      const existing = state.tiles.get(key(update.x, update.y));
      const merged: Tile = existing ?? { x: update.x, y: update.y, terrain: update.terrain ?? "LAND" };
      if (update.terrain) merged.terrain = update.terrain;
      if ("detailLevel" in update) merged.detailLevel = update.detailLevel;
      if (update.fogged !== undefined) merged.fogged = update.fogged;
      if (update.resource !== undefined) merged.resource = update.resource;
      if (update.ownerId) merged.ownerId = update.ownerId;
      else delete merged.ownerId;
      if ("ownershipState" in update) {
        if (update.ownershipState) merged.ownershipState = update.ownershipState;
        else delete merged.ownershipState;
      }
      if ("capital" in update) {
        if (update.capital) merged.capital = update.capital;
        else delete merged.capital;
      }
      if ("breachShockUntil" in update) {
        if (typeof update.breachShockUntil === "number") merged.breachShockUntil = update.breachShockUntil;
        else delete merged.breachShockUntil;
      }
      if ("ownerId" in update && !update.ownerId) delete merged.ownershipState;
      if (update.clusterId !== undefined) merged.clusterId = update.clusterId;
      if (update.clusterType !== undefined) merged.clusterType = update.clusterType;
      if (update.regionType !== undefined) merged.regionType = update.regionType;
      if (update.dockId !== undefined) merged.dockId = update.dockId;
      if ("shardSite" in update) {
        if (update.shardSite) merged.shardSite = update.shardSite;
        else delete merged.shardSite;
      }
      if (update.town !== undefined) merged.town = update.town;
      if ("town" in update && !update.town) delete merged.town;
      if (update.fort !== undefined) merged.fort = update.fort;
      if (!update.fort) delete merged.fort;
      if ("observatory" in update) {
        if (update.observatory) merged.observatory = update.observatory;
        else delete merged.observatory;
      }
      if ("economicStructure" in update) {
        if (update.economicStructure) merged.economicStructure = update.economicStructure;
        else delete merged.economicStructure;
      }
      if (update.siegeOutpost !== undefined) merged.siegeOutpost = update.siegeOutpost;
      if (!update.siegeOutpost) delete merged.siegeOutpost;
      if ("sabotage" in update) {
        if (update.sabotage) merged.sabotage = update.sabotage;
        else delete merged.sabotage;
      }
      if ("yield" in update) {
        if (update.yield) merged.yield = update.yield;
        else delete merged.yield;
      }
      if ("yieldRate" in update) {
        if (update.yieldRate) merged.yieldRate = update.yieldRate;
        else delete merged.yieldRate;
      }
      if ("yieldCap" in update) {
        if (update.yieldCap) merged.yieldCap = update.yieldCap;
        else delete merged.yieldCap;
      }
      if ("history" in update) {
        if (update.history) merged.history = update.history;
        else delete merged.history;
      }
      const resolved = mergeServerTileWithOptimisticState(mergeIncomingTileDetail(existing, merged));
      state.tiles.set(updateKey, resolved);
      maybeAnnounceShardSite(existing, resolved);
      if (!resolved.optimisticPending) clearOptimisticTileState(updateKey);
      markDockDiscovered(resolved);
      if (!resolved.fogged) state.discoveredTiles.add(updateKey);
      if (
        settlementProgressForTile(update.x, update.y) &&
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
      const resolvedCurrentKey = state.actionCurrent ? key(state.actionCurrent.x, state.actionCurrent.y) : "";
      state.capture = undefined;
      if (state.pendingCombatReveal?.targetKey === state.actionTargetKey) state.pendingCombatReveal = undefined;
      state.actionInFlight = false;
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
  }
  if (msg.type === "TECH_UPDATE") {
    console.info("[tech] TECH_UPDATE received", {
      status: msg.status,
      techRootId: msg.techRootId,
      ownedTechs: (msg.techIds as string[])?.length ?? 0,
      nextChoices: (msg.nextChoices as string[])?.length ?? 0
    });
    const status = msg.status as "started" | "completed" | undefined;
    state.techRootId = msg.techRootId as string | undefined;
    state.currentResearch = (msg.currentResearch as typeof state.currentResearch | undefined) ?? undefined;
    state.pendingTechUnlockId = "";
    state.techIds = (msg.techIds as string[]) ?? [];
    state.techChoices = (msg.nextChoices as string[]) ?? [];
    state.availableTechPicks = (msg.availableTechPicks as number) ?? state.availableTechPicks;
    state.mods = (msg.mods as typeof state.mods) ?? state.mods;
    state.modBreakdown = (msg.modBreakdown as typeof state.modBreakdown | undefined) ?? state.modBreakdown;
    state.incomePerMinute = (msg.incomePerMinute as number) ?? state.incomePerMinute;
    state.missions = (msg.missions as MissionState[]) ?? state.missions;
    state.techCatalog = (msg.techCatalog as TechInfo[]) ?? state.techCatalog;
    state.domainIds = (msg.domainIds as string[]) ?? state.domainIds;
    state.domainChoices = (msg.domainChoices as string[]) ?? state.domainChoices;
    state.domainCatalog = (msg.domainCatalog as DomainInfo[]) ?? state.domainCatalog;
    state.revealCapacity = (msg.revealCapacity as number) ?? state.revealCapacity;
    state.activeRevealTargets = (msg.activeRevealTargets as string[]) ?? state.activeRevealTargets;
    if (status === "completed") {
      const completedTech = state.techCatalog.find((tech) => tech.id === state.techIds[state.techIds.length - 1]);
      pushFeed(`Research completed: ${completedTech?.name ?? state.techIds[state.techIds.length - 1] ?? "unknown"}.`, "tech", "success");
    }
    renderHud();
  }
  if (msg.type === "DOMAIN_UPDATE") {
    state.domainIds = (msg.domainIds as string[]) ?? state.domainIds;
    state.domainChoices = (msg.domainChoices as string[]) ?? state.domainChoices;
    state.domainCatalog = (msg.domainCatalog as DomainInfo[]) ?? state.domainCatalog;
    state.revealCapacity = (msg.revealCapacity as number) ?? state.revealCapacity;
    state.activeRevealTargets = (msg.activeRevealTargets as string[]) ?? state.activeRevealTargets;
    state.mods = (msg.mods as typeof state.mods) ?? state.mods;
    state.modBreakdown = (msg.modBreakdown as typeof state.modBreakdown | undefined) ?? state.modBreakdown;
    state.incomePerMinute = (msg.incomePerMinute as number) ?? state.incomePerMinute;
    state.missions = (msg.missions as MissionState[]) ?? state.missions;
    pushFeed(`Domain chosen: ${state.domainIds[state.domainIds.length - 1] ?? "unknown"}`, "tech", "success");
    renderHud();
  }
  if (msg.type === "REVEAL_EMPIRE_UPDATE") {
    state.activeRevealTargets = (msg.activeTargets as string[]) ?? state.activeRevealTargets;
    state.revealCapacity = (msg.revealCapacity as number) ?? state.revealCapacity;
    renderHud();
  }
  if (msg.type === "ALLIANCE_REQUEST_INCOMING") {
    const request = (msg.request as AllianceRequest) ?? undefined;
    if (request && !state.incomingAllianceRequests.some((existing) => existing.id === request.id)) {
      const fromName = msg.fromName as string | undefined;
      if (fromName) request.fromName = fromName;
      state.incomingAllianceRequests.push(request);
    }
    pushFeed(`Incoming alliance request${request?.fromName ? ` from ${request.fromName}` : ""}`, "alliance", "info");
    renderHud();
  }
  if (msg.type === "ALLIANCE_REQUESTED") {
    const request = msg.request as AllianceRequest | undefined;
    if (request && !state.outgoingAllianceRequests.some((existing) => existing.id === request.id)) {
      state.outgoingAllianceRequests.push(request);
    }
    const targetName =
      (msg.targetName as string | undefined) ??
      request?.toName ??
      (request ? playerNameForOwner(request.toPlayerId) : undefined);
    pushFeed(`Alliance request sent${targetName ? ` to ${targetName}` : ""}`, "alliance", "success");
    renderHud();
  }
  if (msg.type === "ALLIANCE_UPDATE") {
    state.allies = (msg.allies as string[]) ?? [];
    state.incomingAllianceRequests = (msg.incomingAllianceRequests as AllianceRequest[] | undefined) ?? state.incomingAllianceRequests;
    state.outgoingAllianceRequests = (msg.outgoingAllianceRequests as AllianceRequest[] | undefined) ?? state.outgoingAllianceRequests;
    pushFeed(`Alliances updated (${state.allies.length})`, "alliance", "info");
    renderHud();
  }
  if (msg.type === "TRUCE_REQUEST_INCOMING") {
    const request = (msg.request as TruceRequest | undefined) ?? undefined;
    if (request) {
      const fromName = msg.fromName as string | undefined;
      if (fromName) request.fromName = fromName;
      state.incomingTruceRequests = [...state.incomingTruceRequests.filter((entry) => entry.id !== request.id), request];
    }
    pushFeed(`Incoming truce offer${request?.fromName ? ` from ${request.fromName}` : ""}.`, "alliance", "info");
    renderHud();
  }
  if (msg.type === "TRUCE_REQUESTED") {
    const request = msg.request as TruceRequest | undefined;
    const targetName = (msg.targetName as string | undefined) ?? request?.toName ?? (request ? playerNameForOwner(request.toPlayerId) : undefined);
    pushFeed(`Truce offered${targetName ? ` to ${targetName}` : ""}.`, "alliance", "success");
    renderHud();
  }
  if (msg.type === "TRUCE_UPDATE") {
    state.activeTruces = (msg.activeTruces as ActiveTruceView[]) ?? state.activeTruces;
    state.incomingTruceRequests = (msg.incomingTruceRequests as TruceRequest[]) ?? state.incomingTruceRequests;
    const announcement = msg.announcement as string | undefined;
    if (announcement) pushFeed(announcement, "alliance", "warn");
    renderHud();
  }
  if (msg.type === "AETHER_BRIDGE_UPDATE") {
    state.activeAetherBridges = (msg.bridges as ActiveAetherBridgeView[]) ?? state.activeAetherBridges;
    renderHud();
  }
  if (msg.type === "STRATEGIC_REPLAY_EVENT") {
    const event = (msg.event as StrategicReplayEvent | undefined) ?? undefined;
    if (event) {
      state.strategicReplayEvents.push(event);
      if (!state.replayActive) resetStrategicReplayState();
      else if (!state.replayPlaying && state.replayIndex >= Math.max(0, state.strategicReplayEvents.length - 2)) {
        resetStrategicReplayState();
      }
    }
    renderHud();
  }
  if (msg.type === "SEASON_VICTORY_UPDATE") {
    state.seasonVictory = (msg.objectives as SeasonVictoryObjectiveView[]) ?? state.seasonVictory;
    state.seasonWinner = (msg.seasonWinner as SeasonWinnerView | undefined) ?? state.seasonWinner;
    const announcement = msg.announcement as string | undefined;
    if (announcement) pushFeed(announcement, "info", "warn");
    renderHud();
  }
  if (msg.type === "SEASON_WINNER_CROWNED") {
    state.seasonWinner = (msg.winner as SeasonWinnerView | undefined) ?? state.seasonWinner;
    state.seasonVictory = (msg.objectives as SeasonVictoryObjectiveView[] | undefined) ?? state.seasonVictory;
    state.leaderboard = (msg.leaderboard as typeof state.leaderboard | undefined) ?? state.leaderboard;
    if (state.seasonWinner) {
      pushFeed(`${state.seasonWinner.playerName} was crowned season winner via ${state.seasonWinner.objectiveName}.`, "info", "warn");
      state.activePanel = "leaderboard";
    }
    renderHud();
  }
  if (msg.type === "ERROR") {
    if ((msg.code as string | undefined)?.startsWith("COLLECT")) {
      state.pendingCollectVisibleKeys.clear();
      revertOptimisticVisibleCollectDelta();
      const collectTileKey = typeof msg.x === "number" && typeof msg.y === "number" ? key(Number(msg.x), Number(msg.y)) : "";
      if (collectTileKey) revertOptimisticTileCollectDelta(collectTileKey);
    }
    const failedTargetKey = state.actionTargetKey;
    console.error("[server-error]", {
      code: msg.code,
      message: msg.message,
      actionInFlight: state.actionInFlight,
      actionTargetKey: failedTargetKey,
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
    const errorTileKey =
      typeof msg.x === "number" && typeof msg.y === "number" ? key(Number(msg.x), Number(msg.y)) : state.latestSettleTargetKey;
    if (errorCode === "AUTH_FAIL" || errorCode === "NO_AUTH" || errorCode === "AUTH_UNAVAILABLE" || errorCode === "SERVER_STARTING") {
      state.authSessionReady = false;
      if ((errorCode === "AUTH_UNAVAILABLE" || errorCode === "SERVER_STARTING") && firebaseAuth?.currentUser) {
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
        setAuthStatus("Refreshing Firebase session...");
        syncAuthOverlay();
        void authenticateSocket(true)
          .catch(() => {
            state.authBusy = false;
            state.authRetrying = false;
            setAuthStatus(errorMessage, "error");
            syncAuthOverlay();
          });
        renderHud();
        return;
      }
      state.authBusy = false;
      state.authRetrying = false;
      setAuthStatus(errorMessage, "error");
      syncAuthOverlay();
    }
    const isStructureActionError =
      errorCode === "FORT_BUILD_INVALID" ||
      errorCode === "OBSERVATORY_BUILD_INVALID" ||
      errorCode === "SIEGE_OUTPOST_BUILD_INVALID" ||
      errorCode === "ECONOMIC_STRUCTURE_BUILD_INVALID" ||
      errorCode === "STRUCTURE_CANCEL_INVALID";
    if (errorCode === "INSUFFICIENT_GOLD" && failedTargetKey) {
      notifyInsufficientGoldForFrontierAction(errorMessage === "insufficient gold for frontier claim" ? "claim" : "attack");
    } else if (errorCode === "SETTLE_INVALID") {
      clearOptimisticTileState(errorTileKey, true);
      clearSettlementProgressByKey(errorTileKey);
      showCaptureAlert("Action failed", errorMessage, "warn");
    } else if (isStructureActionError && errorTileKey) {
      clearOptimisticTileState(errorTileKey, true);
      showCaptureAlert("Construction failed", errorMessage, "warn");
    } else if (errorCode === "TOWN_UNFED") {
      showCaptureAlert("Town unfed", errorMessage, "warn");
    }
    if (errorCode === "COLLECT_EMPTY") {
      pushFeed(`Nothing to collect on this tile yet: ${errorMessage}.`, "info", "warn");
    } else if (errorCode === "COLLECT_COOLDOWN") {
      if (state.collectVisibleCooldownUntil <= Date.now()) state.collectVisibleCooldownUntil = Date.now() + COLLECT_VISIBLE_COOLDOWN_MS;
      showCollectVisibleCooldownAlert();
      pushFeed(`Collect visible cooling down for ${formatCooldownShort(state.collectVisibleCooldownUntil - Date.now())}.`, "info", "warn");
    } else if (errorCode === "TOWN_UNFED") {
      pushFeed(errorMessage, "info", "warn");
    } else {
      pushFeed(explainActionFailure(errorCode, errorMessage), "error", "error");
    }
    // LOCKED while we already have an in-flight action is expected occasionally due rapid queue overlap.
    if (errorCode === "LOCKED" && state.actionInFlight) {
      renderHud();
      return;
    }
    const frontierActionError =
      errorCode === "ACTION_INVALID" ||
      errorCode === "NOT_ADJACENT" ||
      errorCode === "NOT_OWNER" ||
      errorCode === "EXPAND_TARGET_OWNED";
    const failedCurrentKey = state.actionCurrent ? key(state.actionCurrent.x, state.actionCurrent.y) : "";
    const shouldResetFrontierAction = shouldResetFrontierActionStateForError(errorCode);
    if (shouldResetFrontierAction) {
      state.capture = undefined;
      if (state.pendingCombatReveal?.targetKey === failedCurrentKey) state.pendingCombatReveal = undefined;
      state.actionInFlight = false;
      state.combatStartAck = false;
      state.actionStartedAt = 0;
      state.actionTargetKey = "";
      state.actionCurrent = undefined;
      if (failedCurrentKey) dropQueuedTargetKeyIfAbsent(failedCurrentKey);
      if (failedCurrentKey) clearOptimisticTileState(failedCurrentKey, true);
      if (failedTargetKey) clearOptimisticTileState(failedTargetKey, true);
      if (failedTargetKey) state.autoSettleTargets.delete(failedTargetKey);
    } else if (failedTargetKey) {
      clearOptimisticTileState(failedTargetKey, true);
    }
    state.attackPreviewPendingKey = "";
    if (frontierActionError || !shouldResetFrontierAction) requestViewRefresh(2, true);
    reconcileActionQueue();
    processActionQueue();
    renderHud();
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
    } = {
      fromKey: key(from.x, from.y),
      toKey: key(to.x, to.y),
      valid: Boolean(msg.valid)
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
    state.attackPreviewPendingKey = "";
    if (state.tileActionMenu.visible && state.tileActionMenu.mode === "single" && state.tileActionMenu.currentTileKey) {
      const selectedTile = state.tiles.get(state.tileActionMenu.currentTileKey);
      if (selectedTile && selectedTile.ownerId && selectedTile.ownerId !== state.me && !isTileOwnedByAlly(selectedTile)) {
        openSingleTileActionMenu(selectedTile, state.tileActionMenu.x, state.tileActionMenu.y);
      }
    }
    renderHud();
  }
  if (msg.type === "PLAYER_STYLE") {
    const pid = msg.playerId as string;
    const color = msg.tileColor as string | undefined;
    const visualStyle = msg.visualStyle as EmpireVisualStyle | undefined;
    const shieldUntil = msg.shieldUntil as number | undefined;
    if (pid && color) {
      state.playerColors.set(pid, color);
      if (pid === state.me) authProfileColorEl.value = color;
    }
    if (pid && visualStyle) state.playerVisualStyles.set(pid, visualStyle);
    if (pid && typeof shieldUntil === "number") state.playerShieldUntil.set(pid, shieldUntil);
  }
  if (msg.type === "COLLECT_RESULT") {
    state.pendingCollectVisibleKeys.clear();
    if ((msg.mode as string | undefined) === "visible") clearPendingCollectVisibleDelta();
    if ((msg.mode as string | undefined) === "tile" && typeof msg.x === "number" && typeof msg.y === "number") {
      clearPendingCollectTileDelta(key(Number(msg.x), Number(msg.y)));
    }
    const gold = Number(msg.gold ?? 0);
    const strategic = (msg.strategic as Record<string, number> | undefined) ?? {};
    const strategicParts = Object.entries(strategic)
      .filter(([, v]) => Number(v) > 0)
      .map(([k, v]) => `${Number(v).toFixed(1)} ${k}`);
    const bits: string[] = [];
    if (gold > 0) bits.push(`${gold.toFixed(1)} gold`);
    bits.push(...strategicParts);
    pushFeed(bits.length > 0 ? `Collected ${bits.join(", ")}.` : "No collectable yield.", "info", bits.length > 0 ? "success" : "warn");
    renderHud();
  }
  if (msg.type === "SEASON_ROLLOVER") {
    state.seasonWinner = undefined;
    state.seasonVictory = [];
    const season = msg.season as { worldSeed?: number } | undefined;
    if (typeof season?.worldSeed === "number") {
      setWorldSeed(season.worldSeed);
      clearRenderCaches();
      buildMiniMapBase();
    }
    state.tiles.clear();
    state.mapLoadStartedAt = Date.now();
    state.firstChunkAt = 0;
    state.chunkFullCount = 0;
    state.hasOwnedTileInCache = false;
    state.dockRouteCache.clear();
    pushFeed("Season rolled over. World and progression reset.", "info", "warn");
    requestViewRefresh();
    renderHud();
  }
  if (msg.type === "WORLD_REGENERATED") {
    const season = msg.season as { worldSeed?: number } | undefined;
    if (typeof season?.worldSeed === "number") {
      setWorldSeed(season.worldSeed);
      clearRenderCaches();
      buildMiniMapBase();
    }
    state.tiles.clear();
    state.mapLoadStartedAt = Date.now();
    state.firstChunkAt = 0;
    state.chunkFullCount = 0;
    state.hasOwnedTileInCache = false;
    state.dockRouteCache.clear();
    pushFeed("World regenerated by admin. Fresh map loaded.", "info", "warn");
    requestViewRefresh();
    renderHud();
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

state.authConfigured = Boolean(firebaseAuth);
syncAuthOverlay();

if (firebaseAuth) {
  void setPersistence(firebaseAuth, browserLocalPersistence);
  onAuthStateChanged(firebaseAuth, async (user) => {
    if (!user) {
      state.authReady = false;
      state.authSessionReady = false;
      state.authUserLabel = "";
      state.profileSetupRequired = false;
      authToken = "";
      authUid = "";
      state.authBusy = false;
      state.authRetrying = false;
      authProfileNameEl.value = "";
      authProfileColorEl.value = "#38b000";
      syncAuthOverlay();
      return;
    }
    authEmailLinkSentTo = "";
    state.authReady = true;
    state.authSessionReady = false;
    state.authBusy = true;
    state.authRetrying = false;
    state.authUserLabel = authLabelForUser(user);
    seedProfileSetupFields(user.displayName ?? user.email?.split("@")[0] ?? "", authProfileColorEl.value);
    setAuthStatus("Authorizing empire...");
    syncAuthOverlay();
    try {
      authToken = await user.getIdToken(true);
      authUid = user.uid;
      setAuthStatus(`Connected to the game server. Syncing ${state.authUserLabel}...`);
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: "AUTH", token: authToken }));
      } else {
        state.authBusy = true;
        setAuthStatus(`Google account connected. Waiting for the game server at ${wsUrl}...`);
      }
    } catch (error) {
      state.authSessionReady = false;
      state.authBusy = false;
      setAuthStatus(error instanceof Error ? error.message : "Could not authorize this session.", "error");
    } finally {
      syncAuthOverlay();
      renderHud();
    }
  });
}

const authEmailAndPassword = async (mode: "login" | "register"): Promise<void> => {
  if (!firebaseAuth) return;
  const email = authEmailEl.value.trim();
  const password = authPasswordEl.value;
  const displayName = authDisplayNameEl.value.trim();
  if (!email || !password) {
    setAuthStatus("Email and password are required.", "error");
    syncAuthOverlay();
    return;
  }
  if (mode === "register" && !displayName) {
    setAuthStatus("Display name is required for new accounts.", "error");
    syncAuthOverlay();
    return;
  }
  state.authBusy = true;
  setAuthStatus(mode === "login" ? "Signing in..." : "Creating account...");
  syncAuthOverlay();
  let authSucceeded = false;
  try {
    if (mode === "login") {
      await signInWithEmailAndPassword(firebaseAuth, email, password);
    } else {
      const cred = await createUserWithEmailAndPassword(firebaseAuth, email, password);
      if (displayName) await updateProfile(cred.user, { displayName });
    }
    authSucceeded = true;
  } catch (error) {
    setAuthStatus(error instanceof Error ? error.message : "Authentication failed.", "error");
  } finally {
    if (!authSucceeded) state.authBusy = false;
    syncAuthOverlay();
  }
};

authLoginBtn.onclick = () => {
  void authEmailAndPassword("login");
};

authRegisterBtn.onclick = () => {
  void authEmailAndPassword("register");
};

authGoogleBtn.onclick = async () => {
  if (!firebaseAuth || !googleProvider) return;
  authEmailLinkSentTo = "";
  state.authBusy = true;
  setAuthStatus("Opening Google sign-in...");
  syncAuthOverlay();
  let authSucceeded = false;
  try {
    await signInWithPopup(firebaseAuth, googleProvider);
    authSucceeded = true;
    setAuthStatus("Google sign-in complete. Authorizing empire...");
  } catch (error) {
    setAuthStatus(error instanceof Error ? error.message : "Google sign-in failed.", "error");
  } finally {
    if (!authSucceeded) state.authBusy = false;
    syncAuthOverlay();
  }
};

authEmailLinkBtn.onclick = async () => {
  if (!firebaseAuth) return;
  const email = authEmailEl.value.trim();
  if (authEmailLinkPending && isSignInWithEmailLink(firebaseAuth, window.location.href)) {
    await completeEmailLinkSignIn(email);
    return;
  }
  if (!email) {
    setAuthStatus("Enter your email first.", "error");
    syncAuthOverlay();
    return;
  }
  state.authBusy = true;
  setAuthStatus("Sending sign-in link...");
  syncAuthOverlay();
  try {
    await sendSignInLinkToEmail(firebaseAuth, email, {
      url: window.location.href,
      handleCodeInApp: true
    });
    window.localStorage.setItem(EMAIL_LINK_STORAGE_KEY, email);
    authEmailLinkSentTo = email;
    setAuthStatus("");
  } catch (error) {
    authEmailLinkSentTo = "";
    setAuthStatus(error instanceof Error ? error.message : "Could not send email link.", "error");
  } finally {
    state.authBusy = false;
    syncAuthOverlay();
  }
};

authEmailResetBtn.onclick = () => {
  authEmailLinkSentTo = "";
  setAuthStatus("");
  authEmailEl.focus();
  syncAuthOverlay();
};

authProfileSaveBtn.onclick = async () => {
  if (!requireAuthedSession("Connection lost. Reconnect before finishing setup.")) {
    syncAuthOverlay();
    return;
  }
  const displayName = authProfileNameEl.value.trim();
  if (displayName.length < 2) {
    setAuthStatus("Display name must be at least 2 characters.", "error");
    syncAuthOverlay();
    return;
  }
  state.authBusy = true;
  setAuthStatus("Raising your banner...");
  syncAuthOverlay();
  try {
    ws.send(JSON.stringify({ type: "SET_PROFILE", displayName, color: authProfileColorEl.value }));
    if (firebaseAuth?.currentUser && firebaseAuth.currentUser.displayName !== displayName) {
      await updateProfile(firebaseAuth.currentUser, { displayName });
    }
  } catch (error) {
    setAuthStatus(error instanceof Error ? error.message : "Could not save your empire profile.", "error");
  } finally {
    state.authBusy = false;
    syncAuthOverlay();
  }
};

if (firebaseAuth && isSignInWithEmailLink(firebaseAuth, window.location.href)) {
  const storedEmail = window.localStorage.getItem(EMAIL_LINK_STORAGE_KEY) ?? authEmailEl.value.trim();
  if (storedEmail) {
    void completeEmailLinkSignIn(storedEmail);
  } else {
    authEmailLinkPending = true;
    authEmailLinkSentTo = "";
    setAuthStatus("Enter the email address that received the sign-in link, then press Continue with Email.");
    syncAuthOverlay();
  }
}

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
