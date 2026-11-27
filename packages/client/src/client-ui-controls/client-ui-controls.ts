import type { createClientActionFlow } from "../client-action-flow.js";
import { openBugReportFromCaptureAlert } from "../client-capture-effects/client-capture-report-bug.js";
import type { initClientDom } from "../client-dom.js";
import { closeActivePanel } from "../client-panel-nav/client-panel-nav.js";
import { bindProfileNameField, writeFoundingNameDraft } from "../client-profile-name-field/client-profile-name-field.js";
import { dismissOngoingCapture } from "../client-selected-actions/client-selected-actions.js";
import type { ClientState } from "../client-state/client-state.js";

type ClientDom = ReturnType<typeof initClientDom>;

/**
 * The alert card's panel action: opens that panel (never toggles it shut) and clears the card. True when handled.
 * "integrity" (the Integrity drop notice's Fix) opens the Integrity panel with weak tiles and holes highlighted.
 */
export const openPanelFromCaptureAlert = (
  state: Pick<ClientState, "activePanel" | "captureAlert"> & Partial<Pick<ClientState, "showWeakDefensibility">>,
  panel: string | undefined,
  deps: { setActivePanel: (panel: ClientState["activePanel"]) => void; renderCaptureProgress: () => void; renderHud: () => void; requestViewRefresh?: () => void }
): boolean => {
  if (panel !== "charges" && panel !== "integrity") return false;
  const target = panel === "integrity" ? "defensibility" : "charges";
  if (panel === "integrity" && !state.showWeakDefensibility) {
    state.showWeakDefensibility = true; // the 2D and 3D map overlays redraw on the next view refresh
    deps.requestViewRefresh?.();
  }
  if (state.activePanel !== target) deps.setActivePanel(target);
  state.captureAlert = undefined;
  deps.renderCaptureProgress();
  deps.renderHud();
  return true;
};
type UiActionFlow = Pick<
  ReturnType<typeof createClientActionFlow>,
  "chooseTech" | "chooseDomain" | "cancelOngoingCapture" | "confirmBuildingPlacement" | "cancelBuildingPlacement" | "openSingleTileActionMenu"
>;

type UiControlsDeps = {
  state: ClientState;
  techChooseBtn: ClientDom["techChooseBtn"];
  techPickEl: ClientDom["techPickEl"];
  captureCancelBtn: ClientDom["captureCancelBtn"];
  captureDismissBtn: ClientDom["captureDismissBtn"];
  captureCloseBtn: ClientDom["captureCloseBtn"];
  captureReportBugBtn: ClientDom["captureReportBugBtn"];
  /** Optional: client-bootstrap.ts is at its line cap, so it is found by id beside the close button when not passed. */
  captureGotoBtn?: ClientDom["captureGotoBtn"];
  captureTimeEl: ClientDom["captureTimeEl"];
  placementCancelBtn: ClientDom["placementCancelBtn"];
  placementConfirmBtn: ClientDom["placementConfirmBtn"];
  victoryAlertCollapseBtn: ClientDom["victoryAlertCollapseBtn"];
  victoryAlertBannerBtn: ClientDom["victoryAlertBannerBtn"];
  panelCloseBtn: ClientDom["panelCloseBtn"];
  authColorPresetButtons: ClientDom["authColorPresetButtons"];
  authProfileColorEl: ClientDom["authProfileColorEl"];
  authEmailEl: ClientDom["authEmailEl"];
  authEmailLinkBtn: ClientDom["authEmailLinkBtn"];
  authProfileNameEl: ClientDom["authProfileNameEl"];
  authProfileSaveBtn: ClientDom["authProfileSaveBtn"];
  actionFlow: UiActionFlow;
  renderHud: () => void;
  acknowledgeVictoryHoldAlert: () => void;
  renderVictoryHoldAlert: () => void;
  renderCaptureProgress: () => void;
  setActivePanel: (panel: ClientState["activePanel"]) => void;
  syncAuthPanelState: () => void;
  /** Redraws the map after the alert card turns a map overlay on (the Integrity drop notice's Fix). */
  requestViewRefresh?: () => void;
};

export const bindClientUiControls = (deps: UiControlsDeps): void => {
  const {
    state,
    techChooseBtn,
    techPickEl,
    captureCancelBtn,
    captureDismissBtn,
    captureCloseBtn,
    captureReportBugBtn,
    captureGotoBtn,
    captureTimeEl,
    placementCancelBtn,
    placementConfirmBtn,
    victoryAlertCollapseBtn,
    victoryAlertBannerBtn,
    panelCloseBtn,
    authColorPresetButtons,
    authProfileColorEl,
    authEmailEl,
    authEmailLinkBtn,
    authProfileNameEl,
    authProfileSaveBtn,
    actionFlow,
    renderHud,
    acknowledgeVictoryHoldAlert,
    renderVictoryHoldAlert,
    renderCaptureProgress,
    setActivePanel,
    syncAuthPanelState,
    requestViewRefresh
  } = deps;
  const { chooseTech, cancelOngoingCapture, confirmBuildingPlacement, cancelBuildingPlacement } = actionFlow;

  techChooseBtn.onclick = () => {
    chooseTech();
  };
  techPickEl.onchange = () => {
    state.techUiSelectedId = techPickEl.value;
    renderHud();
  };
  captureCancelBtn.onclick = () => cancelOngoingCapture();
  captureDismissBtn.onclick = () => {
    dismissOngoingCapture(state);
    renderCaptureProgress();
  };
  placementCancelBtn.onclick = () => cancelBuildingPlacement();
  placementConfirmBtn.onclick = () => confirmBuildingPlacement();
  captureCloseBtn.onclick = () => {
    state.captureAlert = undefined;
    captureTimeEl.classList.remove("capture-loss");
    renderCaptureProgress();
  };
  captureReportBugBtn.onclick = () => openBugReportFromCaptureAlert(state, { renderCaptureProgress, renderHud });
  // An alert whose action opens a panel ("Manage charges"). A listener, not onclick: client-hud.ts owns
  // onclick for the map-centring alerts, and its handler ignores a button without focus coordinates.
  const gotoBtn = captureGotoBtn ?? captureCloseBtn.ownerDocument.querySelector<HTMLButtonElement>("#capture-goto");
  gotoBtn?.addEventListener("click", () => openPanelFromCaptureAlert(state, gotoBtn.dataset.captureOpenPanel, { setActivePanel, renderCaptureProgress, renderHud, ...(requestViewRefresh ? { requestViewRefresh } : {}) }));
  victoryAlertCollapseBtn.onclick = () => {
    acknowledgeVictoryHoldAlert();
    renderVictoryHoldAlert();
  };
  victoryAlertBannerBtn.onclick = () => {
    setActivePanel("leaderboard");
    renderHud();
  };
  panelCloseBtn.onclick = () => {
    closeActivePanel(state);
    renderHud();
  };

  authColorPresetButtons.forEach((btn: HTMLButtonElement) => {
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

  bindProfileNameField(authProfileNameEl, { onUserInput: writeFoundingNameDraft });
  authProfileNameEl.onkeydown = (event) => {
    if (event.key === "Enter" && state.profileSetupRequired) {
      event.preventDefault();
      authProfileSaveBtn.click();
    }
  };

};
