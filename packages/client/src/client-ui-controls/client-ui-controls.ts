import type { initClientDom } from "../client-dom.js";
import { closeActivePanel, setActivePanel } from "../client-panel-nav/client-panel-nav.js";
import type { ClientState } from "../client-state/client-state.js";

type ClientDom = ReturnType<typeof initClientDom>;

type UiControlsDeps = {
  state: ClientState;
  hud: ClientDom["hud"];
  allianceSendBtn: ClientDom["allianceSendBtn"];
  mobileAllianceSendBtn: ClientDom["mobileAllianceSendBtn"];
  allianceTargetEl: ClientDom["allianceTargetEl"];
  mobileAllianceTargetEl: ClientDom["mobileAllianceTargetEl"];
  techChooseBtn: ClientDom["techChooseBtn"];
  mobileTechChooseBtn: ClientDom["mobileTechChooseBtn"];
  techPickEl: ClientDom["techPickEl"];
  mobileTechPickEl: ClientDom["mobileTechPickEl"];
  centerMeBtn: ClientDom["centerMeBtn"];
  centerMeDesktopBtn: ClientDom["centerMeDesktopBtn"];
  collectVisibleDesktopBtn: ClientDom["collectVisibleDesktopBtn"];
  collectVisibleMobileBtn: ClientDom["collectVisibleMobileBtn"];
  captureCancelBtn: ClientDom["captureCancelBtn"];
  captureCloseBtn: ClientDom["captureCloseBtn"];
  captureDownloadDebugBtn: ClientDom["captureDownloadDebugBtn"];
  captureTimeEl: ClientDom["captureTimeEl"];
  placementCancelBtn: ClientDom["placementCancelBtn"];
  placementConfirmBtn: ClientDom["placementConfirmBtn"];
  shardAlertCloseBtn: ClientDom["shardAlertCloseBtn"];
  panelCloseBtn: ClientDom["panelCloseBtn"];
  panelActionButtons: ClientDom["panelActionButtons"];
  authColorPresetButtons: ClientDom["authColorPresetButtons"];
  authProfileColorEl: ClientDom["authProfileColorEl"];
  authEmailEl: ClientDom["authEmailEl"];
  authEmailLinkBtn: ClientDom["authEmailLinkBtn"];
  authProfileNameEl: ClientDom["authProfileNameEl"];
  authProfileSaveBtn: ClientDom["authProfileSaveBtn"];
  sendAllianceRequest: (target: string) => void;
  chooseTech: (techIdRaw?: string) => void;
  chooseDomain: (domainIdRaw?: string) => void;
  renderHud: () => void;
  centerOnOwnedTile: () => void;
  requestViewRefresh: (priorityBoost?: number, immediate?: boolean) => void;
  collectVisibleYield: () => void;
  cancelOngoingCapture: () => void;
  confirmBuildingPlacement: () => void;
  cancelBuildingPlacement: () => void;
  hideShardAlert: () => void;
  renderShardAlert: () => void;
  renderCaptureProgress: () => void;
  downloadDebugBundle: () => void | Promise<void>;
  setActivePanel: (panel: ClientState["activePanel"]) => void;
  syncAuthPanelState: () => void;
};

export const bindClientUiControls = (deps: UiControlsDeps): void => {
  const {
    state,
    hud,
    allianceSendBtn,
    mobileAllianceSendBtn,
    allianceTargetEl,
    mobileAllianceTargetEl,
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
    captureDownloadDebugBtn,
    captureTimeEl,
    placementCancelBtn,
    placementConfirmBtn,
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
    chooseTech,
    renderHud,
    centerOnOwnedTile,
    requestViewRefresh,
    collectVisibleYield,
    cancelOngoingCapture,
    confirmBuildingPlacement,
    cancelBuildingPlacement,
    hideShardAlert,
    renderShardAlert,
    renderCaptureProgress,
    downloadDebugBundle,
    setActivePanel,
    syncAuthPanelState
  } = deps;

  allianceSendBtn.onclick = () => {
    sendAllianceRequest(allianceTargetEl.value);
  };
  mobileAllianceSendBtn.onclick = () => {
    sendAllianceRequest(mobileAllianceTargetEl.value);
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
  placementCancelBtn.onclick = () => cancelBuildingPlacement();
  placementConfirmBtn.onclick = () => confirmBuildingPlacement();
  captureCloseBtn.onclick = () => {
    state.captureAlert = undefined;
    captureTimeEl.classList.remove("capture-loss");
    renderCaptureProgress();
  };
  captureDownloadDebugBtn.onclick = () => {
    void downloadDebugBundle();
  };
  shardAlertCloseBtn.onclick = () => {
    hideShardAlert();
    renderShardAlert();
  };
  panelCloseBtn.onclick = () => {
    closeActivePanel(state);
    renderHud();
  };

  panelActionButtons.forEach((btn: HTMLButtonElement) => {
    btn.onclick = () => {
      if (btn.hidden) return;
      const panel = btn.dataset.panel as typeof state.activePanel;
      if (!panel) return;
      setActivePanel(panel);
    };
  });

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

  const mobileNavButtons = hud.querySelectorAll<HTMLButtonElement>("#mobile-nav button[data-mobile-panel]");
  mobileNavButtons.forEach((btn) => {
    btn.onclick = () => {
      if (btn.hidden) return;
      const panel = btn.dataset.mobilePanel as typeof state.mobilePanel | undefined;
      if (!panel) return;
      state.mobilePanel = panel;
      if (panel === "feed") {
        state.unreadAttackAlerts = 0;
        state.feedUnreadCount = 0;
        state.feedAttentionUntil = 0;
      }
      renderHud();
    };
  });
};
