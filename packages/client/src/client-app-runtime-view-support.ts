import {
  notifyInsufficientGoldForFrontierAction as notifyInsufficientGoldForFrontierActionFromModule,
  pushFeed as pushFeedFromModule,
  pushFeedEntry as pushFeedEntryFromModule,
  showCaptureAlert as showCaptureAlertFromModule
} from "./client-alerts/client-alerts.js";
import { createMultiplexWebSocket } from "./client-multiplex-websocket/client-multiplex-websocket.js";
import {
  bindTechTreeDragScroll as bindTechTreeDragScrollFromModule,
  renderMobilePanels as renderMobilePanelsFromModule,
  setActivePanel as setActivePanelFromModule,
  viewportSize as viewportSizeFromModule
} from "./client-panel-nav/client-panel-nav.js";
import type { ClientState } from "./client-state/client-state.js";
import type { FeedEntry, FeedSeverity, FeedType } from "./client-types.js";
import {
  centerOnOwnedTile as centerOnOwnedTileFromModule,
  maybeRefreshForCamera as maybeRefreshForCameraFromModule,
  requestViewRefresh as requestViewRefreshFromModule
} from "./client-view-refresh.js";
import type { ClientAppDom } from "./client-app-runtime-dom.js";

export const createClientViewSupport = (deps: {
  state: ClientState;
  dom: ClientAppDom;
  ws: ReturnType<typeof createMultiplexWebSocket>;
  fullMapChunkRadius: number;
}) => {
  const { state, dom, ws, fullMapChunkRadius } = deps;

  const pushFeed = (msg: string, type: FeedType = "info", severity: FeedSeverity = "info"): void =>
    pushFeedFromModule(state, msg, type, severity);
  const pushFeedEntry = (entry: FeedEntry): void => pushFeedEntryFromModule(state, entry);
  const showCaptureAlert = (
    title: string,
    detail: string,
    tone: "success" | "error" | "warn" = "error",
    manpowerLoss?: number,
    focus?: { x: number; y: number; actionLabel?: string }
  ): void => showCaptureAlertFromModule(state, title, detail, tone, manpowerLoss, focus);
  const notifyInsufficientGoldForFrontierAction = (action: "claim" | "attack"): void =>
    notifyInsufficientGoldForFrontierActionFromModule(state, action);
  const centerOnOwnedTile = (): void => centerOnOwnedTileFromModule(state);
  const requestViewRefresh = (radius = 2, force = false): void =>
    requestViewRefreshFromModule(state, { ws, fullMapChunkRadius, radius, force });
  const maybeRefreshForCamera = (force = false): void =>
    maybeRefreshForCameraFromModule(state, { ws, requestViewRefresh, force });
  const viewportSize = (): { width: number; height: number } => viewportSizeFromModule();
  const renderMobilePanels = (): void =>
    renderMobilePanelsFromModule(state, {
      sidePanelBodyEl: dom.sidePanelBodyEl,
      sidePanelEl: dom.sidePanelEl,
      panelTitleEl: dom.panelTitleEl
    });
  const setActivePanel = (panel: typeof state.activePanel): void => setActivePanelFromModule(state, panel, { renderMobilePanels });
  const bindTechTreeDragScroll = (): void => bindTechTreeDragScrollFromModule(state, dom.hud);

  return {
    pushFeed,
    pushFeedEntry,
    showCaptureAlert,
    notifyInsufficientGoldForFrontierAction,
    centerOnOwnedTile,
    requestViewRefresh,
    maybeRefreshForCamera,
    viewportSize,
    renderMobilePanels,
    setActivePanel,
    bindTechTreeDragScroll
  };
};
