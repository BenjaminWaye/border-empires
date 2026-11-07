import type { createClientActionFlow } from "../client-action-flow.js";
import { openBugReportFromCaptureAlert } from "../client-capture-effects/client-capture-report-bug.js";
import type { initClientDom } from "../client-dom.js";
import { closeActivePanel } from "../client-panel-nav/client-panel-nav.js";
import { dismissOngoingCapture } from "../client-selected-actions/client-selected-actions.js";
import type { ClientState } from "../client-state/client-state.js";

type ClientDom = ReturnType<typeof initClientDom>;
type UiActionFlow = Pick<
  ReturnType<typeof createClientActionFlow>,
  "chooseTech" | "chooseDomain" | "cancelOngoingCapture" | "confirmBuildingPlacement" | "cancelBuildingPlacement" | "openSingleTileActionMenu"
>;

type UiControlsDeps = {
  state: ClientState;
  hud: ClientDom["hud"];
  techChooseBtn: ClientDom["techChooseBtn"];
  techPickEl: ClientDom["techPickEl"];
  captureCancelBtn: ClientDom["captureCancelBtn"];
  captureDismissBtn: ClientDom["captureDismissBtn"];
  captureCloseBtn: ClientDom["captureCloseBtn"];
  captureReportBugBtn: ClientDom["captureReportBugBtn"];
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
  centerOnOwnedTile: () => void;
  requestViewRefresh: (priorityBoost?: number, immediate?: boolean) => void;
  acknowledgeVictoryHoldAlert: () => void;
  renderVictoryHoldAlert: () => void;
  renderCaptureProgress: () => void;
  setActivePanel: (panel: ClientState["activePanel"]) => void;
  syncAuthPanelState: () => void;
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
    syncAuthPanelState
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

  authProfileNameEl.onkeydown = (event) => {
    if (event.key === "Enter" && state.profileSetupRequired) {
      event.preventDefault();
      authProfileSaveBtn.click();
    }
  };

};
