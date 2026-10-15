import {
  setWorldSeed,
  terrainAt
} from "@border-empires/shared";
import { formatGoldAmount } from "./client-constants.js";
import { bootstrapClientApp } from "./client-bootstrap/client-bootstrap.js";
import { hasCollectableYield } from "./client-collect-optimism.js";
import { createClientRuntimeDisplaySupport } from "./client-app-runtime-display-support/client-app-runtime-display-support.js";
import {
  computeDragPreview as computeDragPreviewFromModule,
  worldTileRawFromPointer as worldTileRawFromPointerFromModule
} from "./client-drag-selection.js";
import type { EconomyFocusKey } from "./client-economy-model.js";
import { createClientAppRuntimeDom } from "./client-app-runtime-dom.js";
import { createClientFirebaseSetup, createClientSocketSetup } from "./client-app-runtime-env/client-app-runtime-env.js";
import { startClientAcquisitionFunnel } from "./client-acquisition-funnel/client-acquisition-funnel.js";
import { resolveDevAuthPlayerId } from "./client-app-runtime-env/client-dev-auth-bypass.js";
import { createClientRuntimeFlowSupport } from "./client-app-runtime-flow-support.js";
import { createClientViewSupport } from "./client-app-runtime-view-support.js";
import { formatCooldownShort, formatManpowerAmount, FULL_MAP_CHUNK_RADIUS, keyForTile, parseTileKey, prettyToken, rateToneClass, wrapTileX, wrapTileY } from "./client-app-runtime-utils.js";
import { createClientMapFacade } from "./client-map-facade.js";
import { createClientMapMath } from "./client-map-math.js";
import { wasPredictedCombatAlreadyShown } from "./client-predicted-combat/client-predicted-combat.js";
import { busyDevelopmentProcessCount } from "./client-development-queue/client-development-queue.js";
import { renderManpowerPanelHtml, renderSocialInspectCardHtml } from "./client-side-panel-html/client-side-panel-html.js";
import { populationPerMinuteLabel, townNextGrowthEtaLabel } from "./client-town-growth/client-town-growth.js";
import { feedHtml, leaderboardHtml, missionCardsHtml, strategicRibbonHtml } from "./client-panel-html/client-panel-html.js";
import {
  economicStructureName,
  resourceColor,
  resourceLabel
} from "./client-map-display.js";
import { resourceIconHtml } from "./client-resource-icons/client-resource-icons.js";
import {
  builtResourceOverlayForTile,
  dockOverlayVariants,
  economicStructureOverlayAlpha,
  initTerrainTextures,
  overlayVariantIndexAt,
  resourceOverlayForTile,
  resourceOverlayScaleForTile,
  shardOverlayForTile,
  structureOverlayImages
} from "./client-map-render/client-map-render.js";
import { createInitialState, storageSet } from "./client-state/client-state.js";
import { initClientAudio } from "./client-audio/client-audio.js";
import { clearUrlTileFocus } from "./client-state/client-camera-storage.js";
import { startPhotoMode } from "./client-photo-mode/client-photo-mode.js";
import { domainOwnedHtml, hasRevealedResourceCategory, techCurrentModsHtml } from "./client-tech-html/client-tech-html.js";
import { techOwnedHtml } from "./client-manifest-detail/client-manifest-owned-html.js";

const state = createInitialState();
// Consumes the ?x=&y= deep-link (already read into state.camX/camY/selected
// above) so a later reload restores the last-viewed camera instead of
// re-jumping to a stale linked tile.
clearUrlTileFocus();
const { dom, miniMapReplayEl } = createClientAppRuntimeDom(state);
startPhotoMode(state, window.location.search); // ?photo=1 — clean-capture mode, see client-photo-mode.ts
const { firebaseAuth, googleProvider, twitchProvider, discordProvider, analytics } = createClientFirebaseSetup();
const { ws, wsUrl } = createClientSocketSetup(state);
startClientAcquisitionFunnel({ firebaseAuth, analytics, wsUrl, methodButtons: [{ button: dom.authGoogleBtn, method: "google.com" }, { button: dom.authTwitchBtn, method: "oidc.twitch" }, { button: dom.authDiscordBtn, method: "oidc.discord" }, { button: dom.authEmailLinkBtn, method: "email-link" }, { button: dom.authLoginBtn, method: "password-login" }, { button: dom.authRegisterBtn, method: "password-register" }] });
const devAuthPlayerId = resolveDevAuthPlayerId(window.location.hostname, window.location.search);

dom.miniMapBase.width = dom.miniMapEl.width;
dom.miniMapBase.height = dom.miniMapEl.height;
const miniMapBaseCtx = dom.miniMapBase.getContext("2d");
if (!miniMapBaseCtx) throw new Error("missing minimap base context");

const key = keyForTile, parseKey = parseTileKey, wrapX = wrapTileX, wrapY = wrapTileY;
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
  drawHillsOverlay,
  drawPlanetaryDefenseOverlay,
  drawIncomingAttackOverlay,
  drawTownOverlay,
  drawTownMarker,
  drawDockMarker,
  drawCenteredOverlay,
  drawCenteredOverlayWithAlpha,
  drawResourceCornerMarker,
  drawRoadOverlay,
  fortificationOverlayImageFor,
  drawShardFallback,
  resolveDockSeaRoute,
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
  wrapX,
  wrapY,
  resourceColor,
  hasCollectableYield: (tile) => hasCollectableYield(tile)
});
const { toroidDelta, worldToScreen } = createClientMapMath({ state });

const {
  pushFeed,
  pushFeedEntry,
  maybeAnnounceShardSite,
  shardAlertKeyForPayload,
  showShardAlert,
  hideShardAlert,
  showCaptureAlert,
  notifyInsufficientGoldForFrontierAction,
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
  fullMapChunkRadius: FULL_MAP_CHUNK_RADIUS
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
  supportedOwnedTownsForTile,
  townHasSupportStructure,
  supportedOwnedDocksForTile
} = originSelection;
const {
  tileHistoryLines,
  displayTownGoldPerMinute,
  growthModifierPercentLabel,
  combatResolutionAlert
} = inspectionFlow;

initClientAudio();

// HUD and auth flow are wired below after socket setup.
bootstrapClientApp({
  state,
  dom,
  miniMapReplayEl,
  ws,
  wsUrl,
  firebaseAuth,
  googleProvider,
  twitchProvider,
  discordProvider,
  analytics,
  devAuthPlayerId,
  storageSet,
  isMobile,
  rateToneClass,
  formatGoldAmount,
  formatManpowerAmount,
  structureInfoButtonHtml,
  strategicRibbonHtml,
  hasRevealedResourceCategory,
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
  resourceIconHtml,
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
  drawHillsOverlay,
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
  resolveDockSeaRoute,
  toroidDelta,
  drawAetherBridgeLane,
  drawAetherWallSegment,
  clearOptimisticTileState,
  mergeIncomingTileDetail,
  mergeServerTileWithOptimisticState,
  maybeAnnounceShardSite,
  markDockDiscovered,
  centerOnOwnedTile,
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
  tileActionMenuEl: dom.tileActionMenuEl,
  authColorPresetButtons: dom.authColorPresetButtons,
  authProfileColorEl: dom.authProfileColorEl,
  authEmailEl: dom.authEmailEl,
  authEmailLinkBtn: dom.authEmailLinkBtn,
  authProfileNameEl: dom.authProfileNameEl,
  authProfileSaveBtn: dom.authProfileSaveBtn,
  techChooseBtn: dom.techChooseBtn,
  mobileTechChooseBtn: dom.mobileTechChooseBtn,
  centerMeBtn: dom.centerMeBtn,
  centerMeDesktopBtn: dom.centerMeDesktopBtn,
  captureCancelBtn: dom.captureCancelBtn,
  captureCloseBtn: dom.captureCloseBtn,
  captureTimeEl: dom.captureTimeEl,
  shardAlertCloseBtn: dom.shardAlertCloseBtn,
  victoryAlertCollapseBtn: dom.victoryAlertCollapseBtn,
  victoryAlertBannerBtn: dom.victoryAlertBannerBtn,
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
  drawPlanetaryDefenseOverlay,
  drawIncomingAttackOverlay
});
