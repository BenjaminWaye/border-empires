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
import { createClientActionFlow } from "./client-action-flow.js";
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
import { createClientOptimisticStateController } from "./client-optimistic-state.js";
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
import { townHasSupportStructureType } from "./client-support-structures.js";
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
  renderDomainDetailOverlay as renderDomainDetailOverlayFromModule,
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
const effectiveColor = (ownerId: string): string => resolveOwnerColor(ownerId, state.playerColors, ownerColor);
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
  effectiveOverlayColorFromModule(ownerId, { ownerColor: effectiveColor, visualStyleForOwner });
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

const renderDomainDetailOverlay = (): string =>
  renderDomainDetailOverlayFromModule({
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
    renderDomainDetailOverlay,
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
    renderMobilePanels,
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
const worldTileRawFromPointer = (offsetX: number, offsetY: number): { gx: number; gy: number } =>
  worldTileRawFromPointerFromModule(state, canvas, offsetX, offsetY);

const computeDragPreview = (): void =>
  computeDragPreviewFromModule({ state, canvas, wrapX, wrapY, keyFor: key, hasCollectableYield });

const {
  sendGameMessage,
  requestTileDetailIfNeeded,
  sendAllianceRequest,
  breakAlliance,
  chooseTech,
  explainActionFailure,
  applyPendingSettlementsFromServer,
  queueSpecificTargets,
  dropQueuedTargetKeyIfAbsent,
  reconcileActionQueue,
  processDevelopmentQueue,
  processActionQueue,
  requestSettlement,
  sendDevelopmentBuild,
  applyCombatOutcomeMessage,
  requestAttackPreviewForHover,
  requestAttackPreviewForTarget,
  attackPreviewDetailForTarget,
  buildFortOnSelected,
  settleSelected,
  buildSiegeOutpostOnSelected,
  uncaptureSelected,
  cancelOngoingCapture,
  collectVisibleYield,
  collectSelectedYield,
  collectSelectedShard,
  hideHoldBuildMenu,
  hideTileActionMenu,
  isTileOwnedByAlly,
  hostileObservatoryProtectingTile,
  developmentSlotSummary,
  shouldResetFrontierActionStateForError,
  formatCooldownShort,
  formatCountdownClock,
  clearSettlementProgressByKey,
  clearSettlementProgressForTile,
  settlementProgressForTile,
  cancelQueuedSettlement,
  cleanupExpiredSettlementProgress,
  constructionRemainingMsForTile,
  crystalTargetingTitle,
  crystalTargetingTone,
  clearCrystalTargeting,
  renderTileActionMenu,
  tileMenuViewForTile,
  openSingleTileActionMenu,
  openBulkTileActionMenu,
  showHoldBuildMenu,
  handleTileSelection,
  mapInteractionFlags,
} = createClientActionFlow({
  state,
  ws,
  wsUrl,
  canvas,
  techPickEl,
  mobileTechPickEl,
  tileActionMenuEl,
  holdBuildMenuEl,
  keyFor: key,
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
  renderHud: () => renderHud(),
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
  structureCostText,
  busyDevelopmentProcessCount,
  wasPredictedCombatAlreadyShown,
  combatResolutionAlert,
  applyOptimisticVisibleCollect,
  applyOptimisticTileCollect,
  economicStructureName,
  populationPerMinuteLabel,
  townNextGrowthEtaLabel,
  tileVisibilityStateAt
});

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
