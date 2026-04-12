import {
  hideShardAlert as hideShardAlertFromModule,
  maybeAnnounceShardSite as maybeAnnounceShardSiteFromModule,
  notifyInsufficientGoldForFrontierAction as notifyInsufficientGoldForFrontierActionFromModule,
  pushFeed as pushFeedFromModule,
  pushFeedEntry as pushFeedEntryFromModule,
  shardAlertKeyForPayload as shardAlertKeyForPayloadFromModule,
  showCaptureAlert as showCaptureAlertFromModule,
  showCollectVisibleCooldownAlert as showCollectVisibleCooldownAlertFromModule,
  showShardAlert as showShardAlertFromModule
} from "./client-alerts.js";
import { createMultiplexWebSocket } from "./client-multiplex-websocket.js";
import {
  bindTechTreeDragScroll as bindTechTreeDragScrollFromModule,
  isMobile as isMobileFromModule,
  mobileNavLabelHtml as mobileNavLabelHtmlFromModule,
  renderMobilePanels as renderMobilePanelsFromModule,
  setActivePanel as setActivePanelFromModule,
  viewportSize as viewportSizeFromModule
} from "./client-panel-nav.js";
import type { ClientState } from "./client-state.js";
import type { FeedEntry, FeedSeverity, FeedType, Tile } from "./client-types.js";
import {
  centerOnOwnedTile as centerOnOwnedTileFromModule,
  maybeRefreshForCamera as maybeRefreshForCameraFromModule,
  requestViewRefresh as requestViewRefreshFromModule
} from "./client-view-refresh.js";
import type { ClientAppDom } from "./client-app-runtime-dom.js";
import type { ClientShardRainAlert } from "./client-shard-alert.js";

export const createClientViewSupport = (deps: {
  state: ClientState;
  dom: ClientAppDom;
  ws: ReturnType<typeof createMultiplexWebSocket>;
  fullMapChunkRadius: number;
  formatCooldownShort: (remainingMs: number) => string;
}) => {
  const { state, dom, ws, fullMapChunkRadius, formatCooldownShort } = deps;

  const pushFeed = (msg: string, type: FeedType = "info", severity: FeedSeverity = "info"): void =>
    pushFeedFromModule(state, msg, type, severity);
  const pushFeedEntry = (entry: FeedEntry): void => pushFeedEntryFromModule(state, entry);
  const maybeAnnounceShardSite = (previous: Tile | undefined, next: Tile): void => maybeAnnounceShardSiteFromModule(state, previous, next);
  const shardAlertKeyForPayload = (phase: "upcoming" | "started", startsAt: number): string =>
    shardAlertKeyForPayloadFromModule(phase, startsAt);
  const showShardAlert = (alert: ClientShardRainAlert): void => showShardAlertFromModule(state, alert);
  const hideShardAlert = (): void => hideShardAlertFromModule(state);
  const showCaptureAlert = (title: string, detail: string, tone: "success" | "error" | "warn" = "error", manpowerLoss?: number): void =>
    showCaptureAlertFromModule(state, title, detail, tone, manpowerLoss);
  const notifyInsufficientGoldForFrontierAction = (action: "claim" | "attack"): void =>
    notifyInsufficientGoldForFrontierActionFromModule(state, action);
  const showCollectVisibleCooldownAlert = (): void => showCollectVisibleCooldownAlertFromModule(state, formatCooldownShort);
  const centerOnOwnedTile = (): void => centerOnOwnedTileFromModule(state);
  const requestViewRefresh = (radius = 2, force = false): void =>
    requestViewRefreshFromModule(state, { ws, fullMapChunkRadius, radius, force });
  const maybeRefreshForCamera = (force = false): void =>
    maybeRefreshForCameraFromModule(state, { ws, requestViewRefresh, force });
  const isMobile = (): boolean => isMobileFromModule();
  const mobileNavLabelHtml = (panel: typeof state.mobilePanel, opts?: { techReady?: boolean; attackAlertUnread?: boolean }): string =>
    mobileNavLabelHtmlFromModule(panel, opts);
  const viewportSize = (): { width: number; height: number } => viewportSizeFromModule();
  const renderMobilePanels = (): void =>
    renderMobilePanelsFromModule(state, {
      hud: dom.hud,
      panelActionButtons: dom.panelActionButtons,
      sidePanelBodyEl: dom.sidePanelBodyEl,
      sidePanelEl: dom.sidePanelEl,
      panelTitleEl: dom.panelTitleEl,
      mobileSheetEl: dom.mobileSheetEl,
      mobileCoreEl: dom.mobileCoreEl,
      mobilePanelCoreEl: dom.mobilePanelCoreEl,
      mobilePanelMissionsEl: dom.mobilePanelMissionsEl,
      mobilePanelTechEl: dom.mobilePanelTechEl,
      mobilePanelDomainsEl: dom.mobilePanelDomainsEl,
      mobilePanelSocialEl: dom.mobilePanelSocialEl,
      mobilePanelDefensibilityEl: dom.mobilePanelDefensibilityEl,
      mobilePanelEconomyEl: dom.mobilePanelEconomyEl,
      mobilePanelManpowerEl: dom.mobilePanelManpowerEl,
      mobilePanelLeaderboardEl: dom.mobilePanelLeaderboardEl,
      mobilePanelFeedEl: dom.mobilePanelFeedEl,
      mobileSheetHeadEl: dom.mobileSheetHeadEl
    });
  const setActivePanel = (panel: typeof state.activePanel): void => setActivePanelFromModule(state, panel, { renderMobilePanels });
  const bindTechTreeDragScroll = (): void => bindTechTreeDragScrollFromModule(state, dom.hud);

  return {
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
  };
};
