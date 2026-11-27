// Binds the HUD's fixed controls (tech picker, capture/alert card, placement,
// victory banner, panel close, auth profile) for client-bootstrap.ts, which is
// over the line cap. The elements are read from the same places the call in
// client-bootstrap.ts read them (the bootstrap deps, or the DOM bundle); the
// callbacks, including requestViewRefresh for the alert card's map overlays
// (the Integrity drop notice's Fix), are handed in.

import type { initClientDom } from "../client-dom.js";
import { bindClientUiControls } from "../client-ui-controls/client-ui-controls.js";

type UiControlsDeps = Parameters<typeof bindClientUiControls>[0];

type ClientDom = ReturnType<typeof initClientDom>;
/** The bootstrap's own deps record, which carries most of the control elements. */
type ElementSource = Pick<
  UiControlsDeps,
  | "techChooseBtn"
  | "techPickEl"
  | "captureCancelBtn"
  | "captureCloseBtn"
  | "captureTimeEl"
  | "panelCloseBtn"
  | "authColorPresetButtons"
  | "authProfileColorEl"
  | "authEmailEl"
  | "authEmailLinkBtn"
  | "authProfileNameEl"
  | "authProfileSaveBtn"
>;

export type BootstrapUiControlsDeps = Pick<
  UiControlsDeps,
  | "state"
  | "actionFlow"
  | "renderHud"
  | "acknowledgeVictoryHoldAlert"
  | "renderVictoryHoldAlert"
  | "renderCaptureProgress"
  | "setActivePanel"
  | "syncAuthPanelState"
  | "requestViewRefresh"
>;

export const bindBootstrapUiControls = (
  dom: Pick<ClientDom, "captureDismissBtn" | "captureReportBugBtn" | "placementCancelBtn" | "placementConfirmBtn" | "victoryAlertCollapseBtn" | "victoryAlertBannerBtn">,
  elements: ElementSource,
  deps: BootstrapUiControlsDeps
): void =>
  bindClientUiControls({
    ...deps,
    techChooseBtn: elements.techChooseBtn,
    techPickEl: elements.techPickEl,
    captureCancelBtn: elements.captureCancelBtn,
    captureDismissBtn: dom.captureDismissBtn,
    captureCloseBtn: elements.captureCloseBtn,
    captureReportBugBtn: dom.captureReportBugBtn,
    captureTimeEl: elements.captureTimeEl,
    placementCancelBtn: dom.placementCancelBtn,
    placementConfirmBtn: dom.placementConfirmBtn,
    victoryAlertCollapseBtn: dom.victoryAlertCollapseBtn,
    victoryAlertBannerBtn: dom.victoryAlertBannerBtn,
    panelCloseBtn: elements.panelCloseBtn,
    authColorPresetButtons: elements.authColorPresetButtons,
    authProfileColorEl: elements.authProfileColorEl,
    authEmailEl: elements.authEmailEl,
    authEmailLinkBtn: elements.authEmailLinkBtn,
    authProfileNameEl: elements.authProfileNameEl,
    authProfileSaveBtn: elements.authProfileSaveBtn
  });
