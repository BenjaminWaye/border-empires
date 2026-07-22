import { hudMarkup } from "./client-dom-markup/client-dom-markup.js";

const requireElement = <T extends Element>(selector: string, root: ParentNode = document): T => {
  const element = root.querySelector(selector);
  if (!element) throw new Error(`missing required element: ${selector}`);
  return element as T;
};

export const initClientDom = () => {
  const canvas = requireElement<HTMLCanvasElement>("#game");
  const hud = requireElement<HTMLDivElement>("#hud");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("missing 2d context");
  hud.innerHTML = hudMarkup;

  const statsChipsEl = requireElement<HTMLDivElement>("#stats-chips");
  const selectedEl = requireElement<HTMLDivElement>("#selected");
  const hoverEl = requireElement<HTMLDivElement>("#hover");
  const mobileCoreHelpEl = requireElement<HTMLDivElement>("#mobile-core-help");
  const miniMapWrapEl = requireElement<HTMLDivElement>("#mini-map-wrap");
  const miniMapEl = requireElement<HTMLCanvasElement>("#mini-map");
  const miniMapLabelEl = requireElement<HTMLDivElement>("#mini-map-label");
  const captureCancelBtn = requireElement<HTMLButtonElement>("#capture-cancel");
  const captureCloseBtn = requireElement<HTMLButtonElement>("#capture-close");
  const captureDownloadDebugBtn = requireElement<HTMLButtonElement>("#capture-download-debug");
  const captureCardEl = requireElement<HTMLDivElement>("#capture-card");
  const captureWrapEl = requireElement<HTMLDivElement>("#capture-wrap");
  const captureBarEl = requireElement<HTMLDivElement>("#capture-bar");
  const captureTitleEl = requireElement<HTMLDivElement>("#capture-title");
  const captureTimeEl = requireElement<HTMLDivElement>("#capture-time");
  const captureTargetEl = requireElement<HTMLDivElement>("#capture-target");
  const placementOverlayEl = requireElement<HTMLDivElement>("#placement-overlay");
  const placementLabelEl = requireElement<HTMLDivElement>("#placement-label");
  const placementCancelBtn = requireElement<HTMLButtonElement>("#placement-cancel");
  const placementConfirmBtn = requireElement<HTMLButtonElement>("#placement-confirm");
  const shardAlertOverlayEl = requireElement<HTMLDivElement>("#shard-alert-overlay");
  const shardAlertCardEl = requireElement<HTMLDivElement>("#shard-alert-card");
  const shardAlertTitleEl = requireElement<HTMLDivElement>("#shard-alert-title");
  const shardAlertDetailEl = requireElement<HTMLDivElement>("#shard-alert-detail");
  const shardAlertCloseBtn = requireElement<HTMLButtonElement>("#shard-alert-close");
  const mapLoadingOverlayEl = requireElement<HTMLDivElement>("#map-loading-overlay");
  const mapLoadingRowEl = requireElement<HTMLDivElement>("#map-loading-row");
  const mapLoadingSpinnerEl = requireElement<HTMLDivElement>("#map-loading-spinner");
  const mapLoadingTitleEl = requireElement<HTMLDivElement>("#map-loading-title");
  const mapLoadingMetaEl = requireElement<HTMLDivElement>("#map-loading-meta");
  const mapLoadingActionsEl = requireElement<HTMLDivElement>("#map-loading-actions");
  const mapLoadingRetryBtn = requireElement<HTMLButtonElement>("#map-loading-retry");
  const mapLoadingReloadBtn = requireElement<HTMLButtonElement>("#map-loading-reload");
  const mapLoadingDiagnosticsBtn = requireElement<HTMLButtonElement>("#map-loading-diagnostics");
  const authOverlayEl = requireElement<HTMLDivElement>("#auth-overlay");
  const authDisplayNameEl = requireElement<HTMLInputElement>("#auth-display-name");
  const authEmailEl = requireElement<HTMLInputElement>("#auth-email");
  const authPasswordEl = requireElement<HTMLInputElement>("#auth-password");
  const authLoginBtn = requireElement<HTMLButtonElement>("#auth-login");
  const authRegisterBtn = requireElement<HTMLButtonElement>("#auth-register");
  const authEmailLinkBtn = requireElement<HTMLButtonElement>("#auth-email-link");
  const authGoogleBtn = requireElement<HTMLButtonElement>("#auth-google");
  const authStatusEl = requireElement<HTMLDivElement>("#auth-status");
  const authDebugRouteEl = requireElement<HTMLDivElement>("#auth-debug-route");
  const authPanelEl = requireElement<HTMLElement>(".auth-panel");
  const authBusyModalEl = requireElement<HTMLDivElement>("#auth-busy-modal");
  const authBusyTitleEl = requireElement<HTMLElement>("#auth-busy-title");
  const authBusyCopyEl = requireElement<HTMLParagraphElement>("#auth-busy-copy");
  const authBusyDiagnosticsBtn = requireElement<HTMLButtonElement>("#auth-busy-diagnostics");
  const authEmailSentAddressEl = requireElement<HTMLSpanElement>("#auth-email-sent-address");
  const authEmailResetBtn = requireElement<HTMLButtonElement>("#auth-email-reset");
  const authProfileNameEl = requireElement<HTMLInputElement>("#auth-profile-name");
  const authProfileColorEl = requireElement<HTMLInputElement>("#auth-profile-color");
  const authProfileSaveBtn = requireElement<HTMLButtonElement>("#auth-profile-save");
  const authColorPresetButtons = document.querySelectorAll<HTMLButtonElement>("#auth-color-presets .auth-color-swatch");
  const tileActionMenuEl = requireElement<HTMLDivElement>("#tile-action-menu");
  const targetingOverlayEl = requireElement<HTMLDivElement>("#targeting-overlay");
  const sidePanelEl = requireElement<HTMLElement>("#side-panel");
  const sidePanelBodyEl = requireElement<HTMLDivElement>("#side-panel-body");
  const panelTitleEl = requireElement<HTMLHeadingElement>("#panel-title");
  const panelCloseBtn = requireElement<HTMLButtonElement>("#panel-close");
  const panelActionButtons = document.querySelectorAll<HTMLButtonElement>("#panel-actions button[data-panel]");
  const panelMissionsEl = requireElement<HTMLDivElement>("#panel-missions"), panelTechEl = requireElement<HTMLDivElement>("#panel-tech"), panelAllianceEl = requireElement<HTMLDivElement>("#panel-alliance"),
    panelDefensibilityEl = requireElement<HTMLDivElement>("#panel-defensibility"), panelEconomyEl = requireElement<HTMLDivElement>("#panel-economy"), panelManpowerEl = requireElement<HTMLDivElement>("#panel-manpower"),
    panelDevelopmentEl = requireElement<HTMLDivElement>("#panel-development"), panelLeaderboardEl = requireElement<HTMLDivElement>("#panel-leaderboard"), panelFeedEl = requireElement<HTMLDivElement>("#panel-feed");
  const panelDomainsEl = requireElement<HTMLDivElement>("#panel-domains");
  const panelDomainsContentEl = requireElement<HTMLDivElement>("#panel-domains-content"), panelSettingsEl = requireElement<HTMLDivElement>("#panel-settings");
  const feedEl = requireElement<HTMLDivElement>("#feed");
  const techPickEl = requireElement<HTMLSelectElement>("#tech-pick");
  const techPointsEl = requireElement<HTMLDivElement>("#tech-points");
  const techCurrentModsEl = requireElement<HTMLDivElement>("#tech-current-mods");
  const techChoicesGridEl = requireElement<HTMLDivElement>("#tech-choices-grid");
  const techDetailCardEl = requireElement<HTMLDivElement>("#tech-detail-card");
  const techOwnedEl = requireElement<HTMLDivElement>("#tech-owned");
  const techChoiceDetailsEl = requireElement<HTMLDivElement>("#tech-choice-details");
  const allianceTargetEl = requireElement<HTMLInputElement>("#alliance-target");
  const allianceTargetOptionsEl = requireElement<HTMLDataListElement>("#alliance-target-options");
  const alliesListEl = requireElement<HTMLDivElement>("#allies-list");
  const allianceRequestsEl = requireElement<HTMLDivElement>("#alliance-requests");
  const alliancePlayerInspectEl = requireElement<HTMLDivElement>("#alliance-player-inspect");
  const missionsEl = requireElement<HTMLDivElement>("#panel-missions");
  const leaderboardEl = requireElement<HTMLDivElement>("#leaderboard");
  const allianceSendBtn = requireElement<HTMLButtonElement>("#alliance-send");
  const techChooseBtn = requireElement<HTMLButtonElement>("#tech-choose");
  const techTreeExpandToggleEl = requireElement<HTMLButtonElement>("#tech-tree-expand-toggle");
  const mobileSheetEl = requireElement<HTMLDivElement>("#mobile-sheet");
  const mobileSheetHeadEl = requireElement<HTMLDivElement>("#mobile-sheet-head");
  const mobileCoreEl = requireElement<HTMLDivElement>("#mobile-core");
  const mobilePanelCoreEl = requireElement<HTMLDivElement>("#mobile-panel-core");
  const mobilePanelMissionsEl = requireElement<HTMLDivElement>("#mobile-panel-missions"), mobilePanelTechEl = requireElement<HTMLDivElement>("#mobile-panel-tech"), mobilePanelDomainsEl = requireElement<HTMLDivElement>("#mobile-panel-domains"),
    mobilePanelSocialEl = requireElement<HTMLDivElement>("#mobile-panel-social"), mobilePanelDefensibilityEl = requireElement<HTMLDivElement>("#mobile-panel-defensibility"), mobilePanelEconomyEl = requireElement<HTMLDivElement>("#mobile-panel-economy"),
    mobilePanelManpowerEl = requireElement<HTMLDivElement>("#mobile-panel-manpower"), mobilePanelDevelopmentEl = requireElement<HTMLDivElement>("#mobile-panel-development"), mobilePanelLeaderboardEl = requireElement<HTMLDivElement>("#mobile-panel-leaderboard"),
    mobilePanelFeedEl = requireElement<HTMLDivElement>("#mobile-panel-feed"), mobilePanelSettingsEl = requireElement<HTMLDivElement>("#mobile-panel-settings");
  const mobileFeedEl = requireElement<HTMLDivElement>("#mobile-feed");
  const mobileLeaderboardEl = requireElement<HTMLDivElement>("#mobile-leaderboard");
  const mobileTechPickEl = requireElement<HTMLSelectElement>("#mobile-tech-pick");
  const mobileTechChooseBtn = requireElement<HTMLButtonElement>("#mobile-tech-choose");
  const mobileTechTreeExpandToggleEl = requireElement<HTMLButtonElement>("#mobile-tech-tree-expand-toggle");
  const mobileTechPointsEl = requireElement<HTMLDivElement>("#mobile-tech-points");
  const mobileTechCurrentModsEl = requireElement<HTMLDivElement>("#mobile-tech-current-mods");
  const mobileTechChoicesGridEl = requireElement<HTMLDivElement>("#mobile-tech-choices-grid");
  const mobileTechDetailCardEl = requireElement<HTMLDivElement>("#mobile-tech-detail-card");
  const mobileTechOwnedEl = requireElement<HTMLDivElement>("#mobile-tech-owned");
  const mobileTechChoiceDetailsEl = requireElement<HTMLDivElement>("#mobile-tech-choice-details");
  const mobileAllianceTargetEl = requireElement<HTMLInputElement>("#mobile-alliance-target");
  const mobileAllianceSendBtn = requireElement<HTMLButtonElement>("#mobile-alliance-send");
  const mobileAllianceRequestsEl = requireElement<HTMLDivElement>("#mobile-alliance-requests");
  const mobileAlliesListEl = requireElement<HTMLDivElement>("#mobile-allies-list");
  const mobileAlliancePlayerInspectEl = requireElement<HTMLDivElement>("#mobile-alliance-player-inspect");
  const centerMeBtn = requireElement<HTMLButtonElement>("#center-me");
  const collectVisibleMobileBtn = requireElement<HTMLButtonElement>("#collect-visible-mobile");
  const centerMeDesktopBtn = requireElement<HTMLButtonElement>("#center-me-desktop");
  const collectVisibleDesktopBtn = requireElement<HTMLButtonElement>("#collect-visible-desktop");
  const collectVisibleDesktopMetaEl = requireElement<HTMLSpanElement>("#collect-visible-desktop-meta");
  const collectVisibleMobileMetaEl = requireElement<HTMLSpanElement>("#collect-visible-mobile-meta");
  const changelogOverlayEl = requireElement<HTMLDivElement>("#changelog-overlay");
  const guideOverlayEl = requireElement<HTMLDivElement>("#guide-overlay");
  const respawnOverlayEl = requireElement<HTMLDivElement>("#respawn-overlay");
  const seasonEndOverlayEl = requireElement<HTMLDivElement>("#season-end-overlay");
  const intelOverlayEl = requireElement<HTMLDivElement>("#intel-overlay");
  const rendererPromptOverlayEl = requireElement<HTMLDivElement>("#renderer-prompt-overlay");
  const structureInfoOverlayEl = requireElement<HTMLDivElement>("#structure-info-overlay");
  const techDetailOverlayEl = requireElement<HTMLDivElement>("#tech-detail-overlay");
  const miniMapCtx = miniMapEl.getContext("2d");
  if (!miniMapCtx) throw new Error("missing minimap context");
  const miniMapBase = document.createElement("canvas");

  return {
    alliancePlayerInspectEl,
    allianceRequestsEl,
    allianceSendBtn,
    allianceTargetEl,
    allianceTargetOptionsEl,
    alliesListEl,
    authColorPresetButtons,
    authDisplayNameEl,
    authEmailEl,
    authEmailLinkBtn,
    authEmailResetBtn,
    authEmailSentAddressEl,
    authGoogleBtn,
    authLoginBtn,
    authBusyCopyEl,
    authBusyDiagnosticsBtn,
    authBusyModalEl,
    authBusyTitleEl,
    authOverlayEl,
    authPanelEl,
    authPasswordEl,
    authProfileColorEl,
    authProfileNameEl,
    authProfileSaveBtn,
    authRegisterBtn,
    authStatusEl,
    authDebugRouteEl,
    canvas,
    captureBarEl,
    captureCancelBtn,
    captureCloseBtn,
    captureDownloadDebugBtn,
    captureCardEl,
    captureTargetEl,
    captureTimeEl,
    captureTitleEl,
    captureWrapEl,
    placementOverlayEl,
    placementLabelEl,
    placementCancelBtn,
    placementConfirmBtn,
    centerMeBtn,
    centerMeDesktopBtn,
    changelogOverlayEl,
    collectVisibleDesktopBtn,
    collectVisibleDesktopMetaEl,
    collectVisibleMobileBtn,
    collectVisibleMobileMetaEl,
    ctx,
    feedEl,
    guideOverlayEl,
    hoverEl,
    hud,
    intelOverlayEl,
    leaderboardEl,
    mapLoadingMetaEl,
    mapLoadingOverlayEl,
    mapLoadingActionsEl,
    mapLoadingDiagnosticsBtn,
    mapLoadingReloadBtn,
    mapLoadingRowEl,
    mapLoadingRetryBtn,
    mapLoadingSpinnerEl,
    mapLoadingTitleEl,
    miniMapBase,
    miniMapCtx,
    miniMapEl,
    miniMapLabelEl,
    miniMapWrapEl,
    missionsEl,
    mobileAlliancePlayerInspectEl,
    mobileAllianceRequestsEl,
    mobileAllianceSendBtn,
    mobileAllianceTargetEl,
    mobileAlliesListEl,
    mobileCoreEl,
    mobileCoreHelpEl,
    mobilePanelDefensibilityEl,
    mobilePanelFeedEl, mobilePanelSettingsEl,
    mobileFeedEl,
    mobileLeaderboardEl,
    mobilePanelCoreEl,
    mobilePanelEconomyEl,
    mobilePanelDevelopmentEl,
    mobilePanelLeaderboardEl,
    mobilePanelManpowerEl,
    mobilePanelMissionsEl,
    mobilePanelSocialEl,
    mobilePanelTechEl,
    mobilePanelDomainsEl,
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
    panelActionButtons,
    panelAllianceEl,
    panelCloseBtn,
    panelDefensibilityEl,
    panelEconomyEl,
    panelManpowerEl,
    panelDevelopmentEl,
    panelFeedEl,
    panelLeaderboardEl,
    panelDomainsContentEl,
    panelDomainsEl, panelSettingsEl,
    panelMissionsEl,
    panelTechEl,
    panelTitleEl,
    rendererPromptOverlayEl,
    respawnOverlayEl,
    seasonEndOverlayEl,
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
    techTreeExpandToggleEl,
    techOwnedEl,
    techPickEl,
    techPointsEl,
    tileActionMenuEl,
    mobileTechTreeExpandToggleEl
  };
};
