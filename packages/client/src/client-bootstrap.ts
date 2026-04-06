import { createClientAuthFlow } from "./client-auth-flow.js";
import { createClientActionFlow } from "./client-action-flow.js";
import { settlePixelWanderPoint as settlePixelWanderPointFromModule } from "./client-capture-effects.js";
import { createClientBootstrapRender } from "./client-bootstrap-render.js";
import { bindClientBootstrap } from "./client-bootstrap-bindings.js";

type BootstrapDeps = Record<string, any>;

export const bootstrapClientApp = (deps: BootstrapDeps): void => {
  const { state, dom, ws, wsUrl, firebaseAuth, googleProvider } = deps;
  let renderHudImpl = (): void => {};
  let requireAuthedSessionImpl = (_message?: string): boolean => false;

  const authFlow = createClientAuthFlow({
    state,
    dom,
    firebaseAuth,
    googleProvider,
    ws,
    wsUrl,
    requireAuthedSession: (message?: string) => requireAuthedSessionImpl(message),
    renderHud: () => renderHudImpl()
  });
  const { setAuthStatus, syncAuthPanelState, syncAuthOverlay, seedProfileSetupFields, authenticateSocket } = authFlow;

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
  requireAuthedSessionImpl = requireAuthedSession;

  const actionFlow = createClientActionFlow({
    ...deps,
    setAuthStatus,
    syncAuthOverlay,
    renderHud: () => renderHudImpl()
  } as any);

  const hudDom = {
    alliancePlayerInspectEl: dom.alliancePlayerInspectEl,
    allianceRequestsEl: dom.allianceRequestsEl,
    alliesListEl: dom.alliesListEl,
    authOverlayEl: dom.authOverlayEl,
    canvas: dom.canvas,
    collectVisibleDesktopBtn: dom.collectVisibleDesktopBtn,
    collectVisibleDesktopMetaEl: dom.collectVisibleDesktopMetaEl,
    collectVisibleMobileBtn: dom.collectVisibleMobileBtn,
    collectVisibleMobileMetaEl: dom.collectVisibleMobileMetaEl,
    feedEl: dom.feedEl,
    guideOverlayEl: dom.guideOverlayEl,
    hoverEl: dom.hoverEl,
    hud: dom.hud,
    leaderboardEl: dom.leaderboardEl,
    mapLoadingMetaEl: dom.mapLoadingMetaEl,
    mapLoadingOverlayEl: dom.mapLoadingOverlayEl,
    mapLoadingTitleEl: dom.mapLoadingTitleEl,
    miniMapLabelEl: dom.miniMapLabelEl,
    missionsEl: dom.missionsEl,
    mobileAlliancePlayerInspectEl: dom.mobileAlliancePlayerInspectEl,
    mobileAllianceRequestsEl: dom.mobileAllianceRequestsEl,
    mobileAlliesListEl: dom.mobileAlliesListEl,
    mobileCoreHelpEl: dom.mobileCoreHelpEl,
    mobilePanelDefensibilityEl: dom.mobilePanelDefensibilityEl,
    mobilePanelDomainsEl: dom.mobilePanelDomainsEl,
    mobilePanelEconomyEl: dom.mobilePanelEconomyEl,
    mobilePanelFeedEl: dom.mobilePanelFeedEl,
    mobileFeedEl: dom.mobileFeedEl,
    mobileLeaderboardEl: dom.mobileLeaderboardEl,
    mobilePanelLeaderboardEl: dom.mobilePanelLeaderboardEl,
    mobilePanelManpowerEl: dom.mobilePanelManpowerEl,
    mobilePanelMissionsEl: dom.mobilePanelMissionsEl,
    mobilePanelTechEl: dom.mobilePanelTechEl,
    mobileTechChoiceDetailsEl: dom.mobileTechChoiceDetailsEl,
    mobileTechChoicesGridEl: dom.mobileTechChoicesGridEl,
    mobileTechChooseBtn: dom.mobileTechChooseBtn,
    mobileTechCurrentModsEl: dom.mobileTechCurrentModsEl,
    mobileTechDetailCardEl: dom.mobileTechDetailCardEl,
    mobileTechOwnedEl: dom.mobileTechOwnedEl,
    mobileTechPickEl: dom.mobileTechPickEl,
    mobileTechPointsEl: dom.mobileTechPointsEl,
    mobileTechTreeExpandToggleEl: dom.mobileTechTreeExpandToggleEl,
    panelActionButtons: dom.panelActionButtons,
    panelDefensibilityEl: dom.panelDefensibilityEl,
    panelDomainsEl: dom.panelDomainsEl,
    panelDomainsContentEl: dom.panelDomainsContentEl,
    panelEconomyEl: dom.panelEconomyEl,
    panelManpowerEl: dom.panelManpowerEl,
    panelTechEl: dom.panelTechEl,
    selectedEl: dom.selectedEl,
    statsChipsEl: dom.statsChipsEl,
    structureInfoOverlayEl: dom.structureInfoOverlayEl,
    techDetailOverlayEl: dom.techDetailOverlayEl,
    targetingOverlayEl: dom.targetingOverlayEl,
    techChoiceDetailsEl: dom.techChoiceDetailsEl,
    techChoicesGridEl: dom.techChoicesGridEl,
    techChooseBtn: dom.techChooseBtn,
    techCurrentModsEl: dom.techCurrentModsEl,
    techDetailCardEl: dom.techDetailCardEl,
    techOwnedEl: dom.techOwnedEl,
    techPickEl: dom.techPickEl,
    techPointsEl: dom.techPointsEl,
    techTreeExpandToggleEl: dom.techTreeExpandToggleEl,
    tileActionMenuEl: dom.tileActionMenuEl,
    mapLoadingRowEl: dom.mapLoadingRowEl,
    mapLoadingSpinnerEl: dom.mapLoadingSpinnerEl,
    shardAlertCardEl: dom.shardAlertCardEl,
    shardAlertCloseBtn: dom.shardAlertCloseBtn,
    shardAlertDetailEl: dom.shardAlertDetailEl,
    shardAlertOverlayEl: dom.shardAlertOverlayEl,
    shardAlertTitleEl: dom.shardAlertTitleEl
  };

  const renderFlow = createClientBootstrapRender({
    ...deps,
    state,
    dom,
    wsUrl,
    firebaseAuth,
    syncAuthOverlay,
    setAuthStatus,
    actionFlow,
    authFlow,
    techFlow: deps.techFlow,
    hudDom
  });
  renderHudImpl = renderFlow.renderHud;

  bindClientBootstrap({
    ...deps,
    state,
    dom,
    ws,
    wsUrl,
    firebaseAuth,
    authFlow,
    actionFlow,
    techFlow: deps.techFlow,
    setAuthStatus,
    syncAuthOverlay,
    syncAuthPanelState,
    authenticateSocket,
    seedProfileSetupFields: deps.seedProfileSetupFields ?? seedProfileSetupFields,
    renderHud: renderFlow.renderHud,
    renderCaptureProgress: renderFlow.renderCaptureProgress,
    renderShardAlert: renderFlow.renderShardAlert,
    drawStartingExpansionArrow: renderFlow.drawStartingExpansionArrow,
    settlePixelWanderPoint: settlePixelWanderPointFromModule
  });
};
