import { COLLECT_VISIBLE_COOLDOWN_MS } from "./client-constants.js";
import { hideShardAlert as hideShardAlertFromModule, maybeAnnounceShardSite as maybeAnnounceShardSiteFromModule, notifyInsufficientGoldForFrontierAction as notifyInsufficientGoldForFrontierActionFromModule, pushFeed as pushFeedFromModule, pushFeedEntry as pushFeedEntryFromModule, shardAlertKeyForPayload as shardAlertKeyForPayloadFromModule, showCaptureAlert as showCaptureAlertFromModule, showCollectVisibleCooldownAlert as showCollectVisibleCooldownAlertFromModule, showShardAlert as showShardAlertFromModule } from "./client-alerts.js";
import { applyOptimisticTileCollect as applyOptimisticTileCollectFromModule, applyOptimisticVisibleCollect as applyOptimisticVisibleCollectFromModule, clearPendingCollectTileDelta as clearPendingCollectTileDeltaFromModule, clearPendingCollectVisibleDelta as clearPendingCollectVisibleDeltaFromModule, hasCollectableYield as hasCollectableYieldFromModule, revertOptimisticTileCollectDelta as revertOptimisticTileCollectDeltaFromModule, revertOptimisticVisibleCollectDelta as revertOptimisticVisibleCollectDeltaFromModule, visibleCollectSummary as visibleCollectSummaryFromModule } from "./client-collect-optimism.js";
import { createClientMapFacade } from "./client-map-facade.js";
import { createClientMapMath } from "./client-map-math.js";
import { builtResourceOverlayForTile, dockOverlayVariants, economicStructureOverlayAlpha, overlayVariantIndexAt, resourceOverlayForTile, resourceOverlayScaleForTile, shardOverlayForTile, structureOverlayImages } from "./client-map-render.js";
import { renderManpowerPanelHtml, renderSocialInspectCardHtml } from "./client-side-panel-html.js";
import { resourceColor, resourceIconForKey, resourceLabel, structureInfoButtonHtml as structureInfoButtonHtmlFromModule, structureInfoForKey as structureInfoForKeyFromModule, economicStructureName } from "./client-map-display.js";
import { domainOwnedHtml, techCurrentModsHtml, techOwnedHtml } from "./client-tech-html.js";
import { bindTechTreeDragScroll as bindTechTreeDragScrollFromModule, isMobile as isMobileFromModule, mobileNavLabelHtml as mobileNavLabelHtmlFromModule, panelTitle as panelTitleFromModule, renderMobilePanels as renderMobilePanelsFromModule, setActivePanel as setActivePanelFromModule, viewportSize as viewportSizeFromModule } from "./client-panel-nav.js";
import { centerOnOwnedTile as centerOnOwnedTileFromModule, maybeRefreshForCamera as maybeRefreshForCameraFromModule, requestViewRefresh as requestViewRefreshFromModule } from "./client-view-refresh.js";
import { hostileObservatoryProtectingTile as hostileObservatoryProtectingTileFromModule, isTileOwnedByAlly as isTileOwnedByAllyFromModule } from "./client-tile-action-support.js";
import { shardRainAlertDetail, type ClientShardRainAlert } from "./client-shard-alert.js";
import type { FeedEntry, FeedSeverity, FeedType, Tile } from "./client-types.js";
import type { EconomyFocusKey } from "./client-economy-model.js";
import type { ClientAppEnv } from "./client-app-env.js";

export const createClientAppRenderDeps = (env: ClientAppEnv) => {
  const isTileOwnedByAlly = (tile: Tile): boolean => isTileOwnedByAllyFromModule(tile, env.state);
  const hostileObservatoryProtectingTile = (tile: Tile): Tile | undefined => hostileObservatoryProtectingTileFromModule(env.state, tile);
  const mapFacade = createClientMapFacade({
    state: env.state,
    ctx: env.dom.ctx,
    canvas: env.dom.canvas,
    miniMapEl: env.dom.miniMapEl,
    miniMapCtx: env.dom.miniMapCtx,
    miniMapBase: env.dom.miniMapBase,
    miniMapBaseCtx: env.miniMapBaseCtx,
    keyFor: env.key,
    parseKey: env.parseKey,
    terrainAt: env.terrainAt,
    wrapX: env.wrapX,
    wrapY: env.wrapY,
    resourceColor,
    hasCollectableYield: (tile) => hasCollectableYield(tile)
  });
  const mapMath = createClientMapMath({ state: env.state });
  const hasCollectableYield = (tile: Tile | undefined): boolean => hasCollectableYieldFromModule(tile);
  const visibleCollectSummary = () =>
    visibleCollectSummaryFromModule({ tiles: env.state.tiles.values(), me: env.state.me, tileVisibilityStateAt: mapFacade.tileVisibilityStateAt });
  const clearPendingCollectVisibleDelta = (): void => clearPendingCollectVisibleDeltaFromModule(env.state);
  const clearPendingCollectTileDelta = (tileKey?: string): void => clearPendingCollectTileDeltaFromModule(env.state, tileKey);
  const revertOptimisticVisibleCollectDelta = (): void => revertOptimisticVisibleCollectDeltaFromModule(env.state);
  const revertOptimisticTileCollectDelta = (tileKey: string): void => revertOptimisticTileCollectDeltaFromModule(env.state, tileKey);
  const applyOptimisticVisibleCollect = (): number =>
    applyOptimisticVisibleCollectFromModule({ state: env.state, tilesIterable: env.state.tiles.values(), tileVisibilityStateAt: mapFacade.tileVisibilityStateAt, keyFor: env.key });
  const applyOptimisticTileCollect = (tile: Tile): boolean => applyOptimisticTileCollectFromModule({ state: env.state, keyFor: env.key }, tile);
  const pushFeed = (msg: string, type: FeedType = "info", severity: FeedSeverity = "info"): void =>
    pushFeedFromModule(env.state, msg, type, severity);
  const pushFeedEntry = (entry: FeedEntry): void => pushFeedEntryFromModule(env.state, entry);
  const maybeAnnounceShardSite = (previous: Tile | undefined, next: Tile): void => maybeAnnounceShardSiteFromModule(previous, next);
  const shardAlertKeyForPayload = (phase: "upcoming" | "started", startsAt: number): string => shardAlertKeyForPayloadFromModule(phase, startsAt);
  const showShardAlert = (alert: ClientShardRainAlert): void => showShardAlertFromModule(env.state, alert);
  const hideShardAlert = (): void => hideShardAlertFromModule(env.state);
  const showCaptureAlert = (title: string, detail: string, tone: "success" | "error" | "warn" = "error", manpowerLoss?: number): void =>
    showCaptureAlertFromModule(env.state, title, detail, tone, manpowerLoss);
  const notifyInsufficientGoldForFrontierAction = (action: "claim" | "attack"): void =>
    notifyInsufficientGoldForFrontierActionFromModule(env.state, action);
  const showCollectVisibleCooldownAlert = (): void => showCollectVisibleCooldownAlertFromModule(env.state, env.formatCooldownShort);
  const requestViewRefresh = (radius = 2, force = false): void =>
    requestViewRefreshFromModule(env.state, { ws: env.ws, fullMapChunkRadius: env.fullMapChunkRadius, radius, force });
  const maybeRefreshForCamera = (force = false): void => maybeRefreshForCameraFromModule(env.state, { ws: env.ws, requestViewRefresh, force });
  const isMobile = (): boolean => isMobileFromModule();
  const panelTitle = (panel: NonNullable<typeof env.state.activePanel>): string => panelTitleFromModule(panel);
  const mobileNavLabelHtml = (panel: typeof env.state.mobilePanel, opts?: { techReady?: boolean; attackAlertUnread?: boolean }): string =>
    mobileNavLabelHtmlFromModule(panel, opts);
  const viewportSize = (): { width: number; height: number } => viewportSizeFromModule();
  const setActivePanel = (panel: typeof env.state.activePanel): void => setActivePanelFromModule(env.state, panel, { renderMobilePanels });
  const renderMobilePanels = (): void => renderMobilePanelsFromModule(env.state, { hud: env.dom.hud, panelActionButtons: env.dom.panelActionButtons, sidePanelBodyEl: env.dom.sidePanelBodyEl, sidePanelEl: env.dom.sidePanelEl, panelTitleEl: env.dom.panelTitleEl, mobileSheetEl: env.dom.mobileSheetEl, mobileCoreEl: env.dom.mobileCoreEl, mobilePanelCoreEl: env.dom.mobilePanelCoreEl, mobilePanelMissionsEl: env.dom.mobilePanelMissionsEl, mobilePanelTechEl: env.dom.mobilePanelTechEl, mobilePanelDomainsEl: env.dom.mobilePanelDomainsEl, mobilePanelSocialEl: env.dom.mobilePanelSocialEl, mobilePanelDefensibilityEl: env.dom.mobilePanelDefensibilityEl, mobilePanelEconomyEl: env.dom.mobilePanelEconomyEl, mobilePanelManpowerEl: env.dom.mobilePanelManpowerEl, mobilePanelLeaderboardEl: env.dom.mobilePanelLeaderboardEl, mobilePanelFeedEl: env.dom.mobilePanelFeedEl, mobileSheetHeadEl: env.dom.mobileSheetHeadEl });
  const bindTechTreeDragScroll = (): void => bindTechTreeDragScrollFromModule(env.state, env.dom.hud);
  const openEconomyPanel = (focus: EconomyFocusKey = "ALL"): void => {
    env.state.economyFocus = focus;
    setActivePanel("economy");
  };
  const structureInfoForKey = (type: any) => structureInfoForKeyFromModule(type, { formatCooldownShort: env.formatCooldownShort, prettyToken: env.prettyToken });
  const structureInfoButtonHtml = (type: any, label?: string): string =>
    structureInfoButtonHtmlFromModule(type, { formatCooldownShort: env.formatCooldownShort, prettyToken: env.prettyToken }, label);

  return {
    ...mapFacade,
    ...mapMath,
    isTileOwnedByAlly,
    hostileObservatoryProtectingTile,
    hasCollectableYield,
    visibleCollectSummary,
    clearPendingCollectVisibleDelta,
    clearPendingCollectTileDelta,
    revertOptimisticVisibleCollectDelta,
    revertOptimisticTileCollectDelta,
    applyOptimisticVisibleCollect,
    applyOptimisticTileCollect,
    pushFeed,
    pushFeedEntry,
    maybeAnnounceShardSite,
    shardAlertKeyForPayload,
    showShardAlert,
    hideShardAlert,
    shardRainAlertDetail,
    showCaptureAlert,
    notifyInsufficientGoldForFrontierAction,
    showCollectVisibleCooldownAlert,
    requestViewRefresh,
    maybeRefreshForCamera,
    centerOnOwnedTile: () => centerOnOwnedTileFromModule(env.state),
    isMobile,
    panelTitle,
    mobileNavLabelHtml,
    viewportSize,
    setActivePanel,
    renderMobilePanels,
    bindTechTreeDragScroll,
    openEconomyPanel,
    structureInfoForKey,
    structureInfoButtonHtml,
    domainOwnedHtml,
    techOwnedHtml,
    techCurrentModsHtml,
    renderManpowerPanelHtml,
    renderSocialInspectCardHtml,
    economicStructureName,
    resourceIconForKey,
    resourceLabel,
    resourceColor,
    overlayVariantIndexAt,
    dockOverlayVariants,
    builtResourceOverlayForTile,
    resourceOverlayForTile,
    economicStructureOverlayAlpha,
    resourceOverlayScaleForTile,
    shardOverlayForTile,
    structureOverlayImages,
    COLLECT_VISIBLE_COOLDOWN_MS
  };
};
