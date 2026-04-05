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
  hideShardAlert as hideShardAlertFromModule,
  maybeAnnounceShardSite as maybeAnnounceShardSiteFromModule,
  notifyInsufficientGoldForFrontierAction as notifyInsufficientGoldForFrontierActionFromModule,
  pushFeed as pushFeedFromModule,
  shardAlertKeyForPayload as shardAlertKeyForPayloadFromModule,
  showCaptureAlert as showCaptureAlertFromModule,
  showCollectVisibleCooldownAlert as showCollectVisibleCooldownAlertFromModule,
  showShardAlert as showShardAlertFromModule
} from "./client-alerts.js";
import { bootstrapClientApp } from "./client-bootstrap.js";
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
import type { EconomyFocusKey } from "./client-economy-model.js";
import { renderEconomyPanelHtml } from "./client-economy-html.js";
import { createClientInspectionFlow } from "./client-inspection-flow.js";
import { createClientMapFacade } from "./client-map-facade.js";
import { createClientMapMath } from "./client-map-math.js";
import { createClientOptimisticStateController } from "./client-optimistic-state.js";
import { createClientOriginSelection } from "./client-origin-selection.js";
import { shouldHideCaptureOverlayAfterTimer, shouldPreserveOptimisticExpand } from "./client-frontier-overlay.js";
import { shouldFinalizePredictedCombat, wasPredictedCombatAlreadyShown } from "./client-predicted-combat.js";
import { showClientHoldBuildMenu } from "./client-ui-controls.js";
import { busyDevelopmentProcessCount } from "./client-development-queue.js";
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
  hostileObservatoryProtectingTile as hostileObservatoryProtectingTileFromModule,
  isTileOwnedByAlly as isTileOwnedByAllyFromModule
} from "./client-tile-action-support.js";
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
import { createInitialState, storageSet, type ClientState } from "./client-state.js";
import { domainOwnedHtml, techCurrentModsHtml, techOwnedHtml } from "./client-tech-html.js";
import { createClientTechPanelFlow } from "./client-tech-panel-flow.js";
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
  drawTerrainTile,
  drawForestOverlay,
  drawBarbarianSkullOverlay,
  drawIncomingAttackOverlay,
  drawTownOverlay,
  drawCenteredOverlay,
  drawCenteredOverlayWithAlpha,
  drawResourceCornerMarker,
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
  ctx,
  canvas,
  miniMapEl,
  miniMapCtx,
  miniMapBase,
  miniMapBaseCtx,
  keyFor: key,
  parseKey,
  terrainAt,
  wrapX,
  wrapY,
  resourceColor,
  hasCollectableYield: (tile) => hasCollectableYield(tile)
});
const economicStructureIcon = (type: Tile["economicStructure"] extends infer T ? T extends { type: infer U } ? U : never : never): string => {
  if (type === "FARMSTEAD") return "▥";
  if (type === "CAMP") return "⛺";
  if (type === "MINE") return "⛏";
  if (type === "GRANARY") return "◫";
  return "▣";
};
const { ownedSpecialSiteCount, wrappedTileDistance, toroidDelta, worldToScreen, manhattanToroid } = createClientMapMath({ state });

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
const openEconomyPanel = (focus: EconomyFocusKey = "ALL"): void => {
  state.economyFocus = focus;
  setActivePanel("economy");
};

const rateToneClass = (rate: number): string => {
  if (rate > 0.001) return "positive";
  if (rate < -0.001) return "negative";
  return "neutral";
};
const formatCooldownShort = (remainingMs: number): string => {
  const seconds = Math.max(1, Math.ceil(remainingMs / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remSeconds = seconds % 60;
  if (minutes < 60) return remSeconds > 0 ? `${minutes}m ${remSeconds}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  return remMinutes > 0 ? `${hours}h ${remMinutes}m` : `${hours}h`;
};
const prettyToken = (value: string): string =>
  value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
const structureInfoForKey = (type: StructureInfoKey) =>
  structureInfoForKeyFromModule(type, { formatCooldownShort, prettyToken });
const structureInfoButtonHtml = (type: StructureInfoKey, label?: string): string =>
  structureInfoButtonHtmlFromModule(type, { formatCooldownShort, prettyToken }, label);
const terrainLabel = (x: number, y: number, terrain: Tile["terrain"]): string => {
  if (terrain !== "LAND") return terrain;
  const biome = landBiomeAt(x, y);
  if (biome === "GRASS") return isForestTile(x, y) ? "FOREST" : "GRASS";
  return "SAND";
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
const {
  selectedTile,
  applyOptimisticTileState,
  clearOptimisticTileState,
  applyOptimisticStructureBuild,
  applyOptimisticStructureCancel,
  shouldPreserveOptimisticExpandByKey,
  mergeServerTileWithOptimisticState,
  mergeIncomingTileDetail
} = createClientOptimisticStateController({
  state,
  keyFor: key,
  terrainAt,
  tileVisibilityStateAt
});
const originSelection = createClientOriginSelection({
  state,
  keyFor: key,
  wrapX,
  wrapY
});
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
const inspectionFlow = createClientInspectionFlow({
  state,
  prettyToken,
  playerNameForOwner,
  terrainLabel,
  populationPerMinuteLabel,
  isTileOwnedByAlly,
  hostileObservatoryProtectingTile,
  pickOriginForTarget,
  keyFor: key,
  terrainAt,
  resourceLabel
});
const {
  tileHistoryLines,
  displayTownGoldPerMinute,
  inspectionHtmlForTile,
  passiveTileGuidanceHtml,
  growthModifierPercentLabel,
  combatResolutionAlert
} = inspectionFlow;

const techFlow = createClientTechPanelFlow({
  state,
  techPickEl,
  mobileTechPickEl,
  viewportSize,
  isMobile,
  formatCooldownShort,
  structureInfoForKey,
  structureInfoButtonHtml
});
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
bootstrapClientApp({
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
  passiveTileGuidanceHtml,
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
  holdBuildMenuEl,
  tileActionMenuEl,
  authColorPresetButtons,
  authProfileColorEl,
  authEmailEl,
  authEmailLinkBtn,
  authProfileNameEl,
  authProfileSaveBtn,
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
