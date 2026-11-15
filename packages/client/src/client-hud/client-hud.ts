import { renderAfcRecovery } from "../client-afc-recovery/client-afc-recovery.js";
import { bindRequestActionButtons } from "./client-hud-request-actions.js";
import { renderAfcUpgradePanels } from "../client-afc-upgrades/client-afc-upgrades.js";
import { updateManifestDetail } from "../client-manifest-detail/client-manifest-detail-dom.js";
import type { Auth } from "firebase/auth";
import { bindAccountSettingsControls } from "./client-account-settings-controls.js";
import { type ChosenTrickleResource } from "@border-empires/shared";
import { renderCrystalAbilityInfoOverlay, type CrystalAbilityInfoKey } from "../client-crystal-ability-info/client-crystal-ability-info.js";
import { revealEmpireStatsDossierHtml, wireEmpireIntelOverlay } from "../client-empire-intel/client-empire-intel.js";
import { fetchActivePlayerProfileData, wirePlayerNameLinks } from "../client-player-profile/client-player-profile.js";
import { announceDebugTileState, debugEnabledForAccount, debugTileLoggingEnabled, setDebugTileKey, setDebugTileLoggingEnabled } from "../client-debug/client-debug.js";
import { renderDefensibilityPanels } from "./client-hud-defensibility-panel.js";
import { bindWeakDefensibilityToggle } from "./client-hud-weak-defensibility-toggle.js";
import { renderHouseChargesPanel } from "../client-house-charges/client-house-charges-panel.js";
import type { initClientDom } from "../client-dom.js";
import { bindHudEconomyPanelControls, hudEconomyPanelHtml } from "./client-hud-economy-panel.js";
import { renderHudTownsPanel } from "./client-hud-towns-panel.js";
import { renderDevelopmentPanelHtml, deriveDevelopmentPanelData } from "../client-development-panel/client-development-html.js";
import { buildDiagnosticsBundle, downloadDiagnosticsBundle } from "../client-diagnostics.js";
import { buildDisconnectHistoryBundle } from "../client-connection-diagnostics/client-connection-diagnostics.js";
import { renderBugReportOverlay } from "../client-bug-report/client-bug-report-hud.js";
import { buildMapLoadingView, isMapLoadingOverlayActive } from "../client-map-loading-view/client-map-loading-view.js";
import { renderHudManpowerPanel } from "./client-hud-manpower-panel.js";
import { renderRespawnOverlay } from "../client-respawn-overlay.js";
import { renderJoinSeasonOverlay } from "../client-join-season-overlay.js";
import { renderSeasonEndOverlay, seasonStartSenders } from "../client-season-end-overlay.js"; import { openGuestSavePanel } from "../client-guest-save/client-guest-save-panel.js";
import { bindAdminSettingsControls } from "./client-hud-admin-settings.js"; import { bindPhotoModeSettingsControls } from "../client-photo-mode/client-photo-mode.js"; // combined onto one line: client-hud.ts is already over the file-line cap and must not grow (AGENTS.md)
import { bindBreakAllianceButton } from "./client-hud-break-alliance-button.js";
import { bindAuthDebugCopyButton } from "./client-hud-debug.js";
import { settingsPanelHtml } from "./client-hud-settings-panel.js";
import { renderProfileEditOverlay } from "./client-hud-profile-edit-overlay.js";
import { bindAudioSettingsControls } from "../client-audio/client-audio-settings-ui.js"; import { bindHintsSettingsControls } from "../client-discovery-tips/client-hints-settings-ui.js"; import { bindEmailNotificationsSettingsControls } from "../client-email-notifications/client-email-notifications-settings-ui.js";
import { bindRendererSettingsControls } from "../client-renderer-switch/client-renderer-settings-ui.js";
import { renderRendererPromptOverlay } from "../client-renderer-prompt/client-renderer-prompt-overlay.js";
import { renderAllianceLists } from "./client-hud-alliance-lists.js";
import { bindProposeButtons } from "../client-alliance/client-alliance-propose-buttons.js";
import { bindMetPlayerRowToggles } from "../client-alliance/client-alliance-row-toggle.js";
import { syncManifestPanelTabs } from "../client-manifest-tabs/client-manifest-tabs.js";
import { sovereignSiegeEngineStrikeRecordToFeedEntry, SOVEREIGN_SIEGE_ENGINE_STRIKE_HISTORY_WINDOW_MS } from "../client-sovereign-siege-engine-strike-history/client-sovereign-siege-engine-strike-history.js";
import type { ClientState, storageSet } from "../client-state/client-state.js";
import { refreshLiveTechRequirements } from "../client-tech-live-requirements/client-tech-live-requirements.js";
import { bindStructureInfoActions } from "../client-structure-info-overlay/client-structure-info-actions.js";
import type { DevelopmentSlotSummary } from "../client-queue-logic/client-queue-logic.js";
import type { DomainInfo, PlayerRespawnNotice, TechInfo, Tile, TileMenuView } from "../client-types.js";

type ClientDom = ReturnType<typeof initClientDom>;

type HudDeps = {
  state: ClientState;
  dom: ClientDom;
  miniMapReplayEl: HTMLDivElement;
  wsUrl: string;
  firebaseAuth?: Auth;
  syncAuthOverlay: () => void;
  storageSet: typeof storageSet;
  developmentSlotSummary: () => DevelopmentSlotSummary;
  rateToneClass: (value: number) => string;
  formatManpowerAmount: (value: number) => string;
  hasRevealedResourceCategory: (
    category: "FOOD" | "TITANIUM" | "CRYSTAL" | "UMBRITE",
    techIds: readonly string[],
    techCatalog: readonly ClientState["techCatalog"][number][]
  ) => boolean;
  formatCooldownShort: (ms: number) => string;
  setActivePanel: (panel: ClientState["activePanel"]) => void;
  crystalTargetingTone: (ability: ClientState["crystalTargeting"]["ability"]) => string;
  crystalTargetingTitle: (ability: ClientState["crystalTargeting"]["ability"]) => string;
  clearCrystalTargeting: () => void;
  keyFor: (x: number, y: number) => string;
  parseKey: (key: string) => { x: number; y: number };
  selectedTile: () => Tile | undefined;
  requestTileDetailIfNeeded: (tile: Tile | undefined) => void;
  renderTileActionMenu: (view: TileMenuView, clientX: number, clientY: number) => void;
  tileMenuViewForTile: (tile: Tile) => TileMenuView;
  renderCaptureProgress: () => void;
  renderVictoryHoldAlert: () => void;
  renderTechChoiceGrid: () => string;
  renderTechDetailCard: () => string;
  renderStructureInfoOverlay: () => string;
  techOwnedHtml: (catalog: TechInfo[], ownedIds: string[], isPendingTechUnlock?: (techId: string) => boolean) => string;
  effectiveOwnedTechIds: () => string[];
  isPendingTechUnlock: (techId: string) => boolean;
  renderTechChoiceDetails: () => string;
  techCurrentModsHtml: (
    mods: ClientState["mods"],
    expandedKey: ClientState["expandedModKey"],
    breakdown: ClientState["modBreakdown"],
    activeBonusContext?: {
      techCatalog: TechInfo[];
      ownedTechIds: string[];
      domainCatalog: DomainInfo[];
      domainIds: string[];
    }
  ) => string;
  bindTechTreeDragScroll: () => void;
  chooseTech: (techIdRaw?: string) => void;
  chooseDomain: (domainIdRaw?: string) => void;
  renderDomainProgressCard: () => string;
  renderDomainChoiceGrid: () => string;
  domainOwnedHtml: (catalog: DomainInfo[], ownedIds: string[], chosenTrickleResource?: ChosenTrickleResource) => string;
  renderDomainDetailCard: () => string;
  sendGameMessage: (payload: unknown, message?: string) => boolean;
  renderSocialInspectCardHtml: typeof import("../client-side-panel-html/client-side-panel-html.js").renderSocialInspectCardHtml;
  playerNameForOwner: (ownerId?: string | null) => string;
  wrapX: (x: number) => number;
  wrapY: (y: number) => number;
  terrainAt: (x: number, y: number) => Tile["terrain"];
  pushFeed: (message: string, type: import("../client-types.js").FeedType, severity?: import("../client-types.js").FeedSeverity) => void;
  requestViewRefresh: (priorityBoost?: number, immediate?: boolean) => void;
  prettyToken: (token: string) => string;
  resourceIconHtml: (key: string) => string;
  resourceLabel: (resource: string) => string;
  economicStructureName: (structureType: string) => string;
  leaderboardHtml: typeof import("../client-panel-html/client-panel-html.js").leaderboardHtml;
  feedHtml: typeof import("../client-panel-html/client-panel-html.js").feedHtml;
  renderSidePanel: () => void;
  effectiveTechChoices: () => string[];
  renderManpowerPanelHtml: typeof import("../client-side-panel-html/client-side-panel-html.js").renderManpowerPanelHtml;
  retryBootstrapNow: () => void;
  centerOnOwnedTile: () => void;
  downloadRespawnBugReport: (args: { notice: PlayerRespawnNotice }) => Promise<void>;
};

export const renderClientHud = (deps: HudDeps): void => {
  renderAfcRecovery({ state: deps.state, send: deps.sendGameMessage, rerender: () => renderClientHud(deps), placementOverlayEl: deps.dom.placementOverlayEl, placementLabelEl: deps.dom.placementLabelEl });
  const {
    state,
    dom,
    wsUrl,
    firebaseAuth,
    syncAuthOverlay,
    storageSet,
    rateToneClass,
    formatManpowerAmount,
    hasRevealedResourceCategory,
    formatCooldownShort,
    setActivePanel,
    crystalTargetingTone,
    crystalTargetingTitle,
    clearCrystalTargeting,
    keyFor,
    parseKey,
    selectedTile,
    requestTileDetailIfNeeded,
    renderTileActionMenu,
    tileMenuViewForTile,
    renderCaptureProgress, renderVictoryHoldAlert,
    renderTechChoiceGrid,
    bindTechTreeDragScroll,
    chooseTech,
    chooseDomain,
    sendGameMessage,
    renderSocialInspectCardHtml,
    playerNameForOwner,
    wrapX,
    wrapY,
    terrainAt,
    pushFeed,
    requestViewRefresh,
    prettyToken,
    resourceIconHtml,
    resourceLabel,
    economicStructureName,
    leaderboardHtml,
    feedHtml,
    retryBootstrapNow,
    centerOnOwnedTile,
    downloadRespawnBugReport
  } = deps;

  refreshLiveTechRequirements(state);

  const safeValue = <T>(label: string, fallback: T, render: () => T): T => {
    try {
      return render();
    } catch (error) {
      console.error(`[hud-render-error] ${label}`, error);
      return fallback;
    }
  };

  const fallbackCard = (label: string): string =>
    `<article class="card"><p>${label} is temporarily unavailable.</p></article>`;

  const replayToolbarHtml = (): string => {
    return `<div class="mini-map-toolbar">
      <span>Minimap (${state.camX}, ${state.camY})</span>
    </div>`;
  };

  const replayPanelHtml = (): string => "";

  if (state.aetherWallTargeting.active) {
    const status = state.selected ? `Origin ${state.selected.x}, ${state.selected.y}` : `Valid origins in view: ${state.aetherWallTargeting.validOrigins.size}`;
    dom.targetingOverlayEl.innerHTML = `
      <div class="targeting-card tone-amber">
        <div class="targeting-kicker">Crystal Action Armed</div>
        <div class="targeting-title">Aether Wall</div>
        <div class="targeting-detail">Select one of your garrisoned border tiles, then cast. If more than one facing is valid, tap one of the glowing map arrows.</div>
        <div class="targeting-status">${status}</div>
        <button id="targeting-cancel" class="targeting-cancel-btn" type="button">Cancel</button>
      </div>
    `;
    dom.targetingOverlayEl.style.display = "block";
    const cancelBtn = dom.targetingOverlayEl.querySelector("#targeting-cancel") as HTMLButtonElement | null;
    if (cancelBtn) {
      cancelBtn.onclick = () => {
        clearCrystalTargeting();
        renderClientHud(deps);
      };
    }
  } else if (state.crystalTargeting.active) {
    const ability = state.crystalTargeting.ability;
    const selectedKey = state.selected ? keyFor(state.selected.x, state.selected.y) : "";
    const selectedOriginKey = selectedKey ? state.crystalTargeting.originByTarget.get(selectedKey) : undefined;
    const selectedOrigin = selectedOriginKey ? parseKey(selectedOriginKey) : undefined;
    const validCount = state.crystalTargeting.validTargets.size;
    const detail =
      ability === "aether_bridge"
        ? "Pick a coastal land tile. The server links the nearest garrisoned coast and opens a temporary sea lane. Enemy land glowing red inside a red outline is shielded by an Aether Tower and can't be landed on."
        : ability === "siphon"
          ? "Pick an enemy town or resource tile. One of your Aether Towers drains the 3x3 around it (resource slots move to you) until you cancel it from that tower. Land glowing red inside a red outline is shielded by an enemy Aether Tower and can't be siphoned."
          : "Pick an enemy land tile to shatter into mountain and erase whatever was built there.";
    const status = selectedOrigin
      ? `Origin ${selectedOrigin.x}, ${selectedOrigin.y} → Target ${state.selected?.x}, ${state.selected?.y}`
      : `Valid targets in view: ${validCount}`;
    dom.targetingOverlayEl.innerHTML = `
      <div class="targeting-card tone-${crystalTargetingTone(ability)}">
        <div class="targeting-kicker">Crystal Action Armed</div>
        <div class="targeting-title">${crystalTargetingTitle(ability)}</div>
        <div class="targeting-detail">${detail}</div>
        <div class="targeting-status">${status}</div>
        <button id="targeting-cancel" class="targeting-cancel-btn" type="button">Cancel</button>
      </div>
    `;
    dom.targetingOverlayEl.style.display = "block";
    const cancelBtn = dom.targetingOverlayEl.querySelector("#targeting-cancel") as HTMLButtonElement | null;
    if (cancelBtn) {
      cancelBtn.onclick = () => {
        clearCrystalTargeting();
        renderClientHud(deps);
      };
    }
  } else {
    dom.targetingOverlayEl.style.display = "none";
    dom.targetingOverlayEl.innerHTML = "";
  }

  const selected = selectedTile();
  if (selected) requestTileDetailIfNeeded(selected);
  if (state.tileActionMenu.visible && state.tileActionMenu.mode === "single" && state.tileActionMenu.currentTileKey) {
    const menuTile = state.tiles.get(state.tileActionMenu.currentTileKey);
    if (menuTile) renderTileActionMenu(tileMenuViewForTile(menuTile), state.tileActionMenu.x, state.tileActionMenu.y);
  }


  safeValue("renderCaptureProgress", undefined, () => renderCaptureProgress());
  safeValue("renderVictoryHoldAlert", undefined, () => renderVictoryHoldAlert());
  state.replayActive = false;
  state.replayPlaying = false;
  dom.miniMapLabelEl.innerHTML = replayToolbarHtml();
  deps.miniMapReplayEl.innerHTML = replayPanelHtml();
  const loadingActive = isMapLoadingOverlayActive(state);
  if (loadingActive) {
    const loadingView = buildMapLoadingView(state, wsUrl);
    dom.mapLoadingOverlayEl.style.display = "grid";
    dom.mapLoadingOverlayEl.dataset.tone = loadingView.tone;
    dom.mapLoadingTitleEl.textContent = loadingView.title;
    dom.mapLoadingMetaEl.textContent = loadingView.meta;
    const anyAction = loadingView.showRetry || loadingView.showReload || loadingView.showDiagnostics;
    dom.mapLoadingActionsEl.dataset.visible = anyAction ? "true" : "false";
    dom.mapLoadingRetryBtn.style.display = loadingView.showRetry ? "" : "none";
    dom.mapLoadingReloadBtn.style.display = loadingView.showReload ? "" : "none";
    dom.mapLoadingDiagnosticsBtn.style.display = loadingView.showDiagnostics ? "" : "none";
    dom.mapLoadingRetryBtn.onclick = () => retryBootstrapNow();
    dom.mapLoadingReloadBtn.onclick = () => window.location.reload();
    dom.mapLoadingDiagnosticsBtn.onclick = () => {
      try {
        const bundle = buildDiagnosticsBundle(state, wsUrl);
        downloadDiagnosticsBundle(bundle);
      } catch (error) {
        console.error("[diagnostics] download button failed", error);
        window.alert(`Diagnostics download failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    };
  } else {
    dom.mapLoadingOverlayEl.style.display = "none";
    dom.mapLoadingOverlayEl.dataset.tone = "normal";
    dom.mapLoadingActionsEl.dataset.visible = "false";
  }

  const visibleTechChoices = deps.effectiveTechChoices();
  const choicesSig = `${state.availableTechPicks}|${visibleTechChoices.join("|")}|${state.techCatalog.length}|${state.pendingTechUnlockId}`;
  const focused = document.activeElement === dom.techPickEl;
  const catalogById = new Map(state.techCatalog.map((tech) => [tech.id, tech] as const));
  if (choicesSig !== state.techChoicesSig && !focused) {
    const previous = state.techUiSelectedId?.trim() || dom.techPickEl.value;
    dom.techPickEl.innerHTML = "";
    for (const choice of visibleTechChoices) {
      const opt = document.createElement("option");
      opt.value = choice;
      const info = catalogById.get(choice);
      opt.textContent = info ? `${info.name}${info.requirements.canResearch ? "" : " (blocked)"}` : choice;
      dom.techPickEl.append(opt);
    }
    if (visibleTechChoices.length === 0) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent =
        state.pendingTechUnlockId
          ? "Unlock pending..."
          : state.techIds.length > 0
            ? "No further Manifests in your current branch this Sector Contest"
            : "No available Manifest choices";
      dom.techPickEl.append(opt);
    }
    const fallback = state.pendingTechUnlockId || visibleTechChoices[0] || state.techCatalog[0]?.id || "";
    const nextSelected = previous && catalogById.has(previous) ? previous : fallback;
    const nextPickerValue = visibleTechChoices.includes(nextSelected) ? nextSelected : state.pendingTechUnlockId || visibleTechChoices[0] || "";
    dom.techPickEl.value = nextPickerValue;
    state.techUiSelectedId = nextSelected;
    state.techChoicesSig = choicesSig;
  } else if (!focused) {
    const selectedTechValue = state.techUiSelectedId || dom.techPickEl.value;
    if (selectedTechValue && catalogById.has(selectedTechValue)) state.techUiSelectedId = selectedTechValue;
  }

  dom.techPointsEl.textContent = "Manifests cost coin + strategic resources";
  dom.techCurrentModsEl.innerHTML = safeValue(
    "techCurrentModsHtml",
    fallbackCard("Manifest bonuses"),
    () =>
      deps.techCurrentModsHtml(state.mods, state.expandedModKey, state.modBreakdown, {
        techCatalog: state.techCatalog,
        ownedTechIds: deps.effectiveOwnedTechIds(),
        domainCatalog: state.domainCatalog,
        domainIds: state.domainIds
      })
  );
  dom.techChoicesGridEl.innerHTML = safeValue("renderTechChoiceGrid", fallbackCard("Manifest choices"), () => renderTechChoiceGrid());
  updateManifestDetail(dom.techDetailCardEl, safeValue(
    "renderTechDetailCard",
    fallbackCard("Manifest details"),
    () => deps.renderTechDetailCard()
  ));
  dom.structureInfoOverlayEl.innerHTML = state.structureInfoKey
    ? deps.renderStructureInfoOverlay()
    : state.crystalAbilityInfoKey
      ? renderCrystalAbilityInfoOverlay(state.crystalAbilityInfoKey, { formatCooldownShort })
      : "";
  dom.structureInfoOverlayEl.style.display = state.structureInfoKey || state.crystalAbilityInfoKey ? "grid" : "none";
  dom.intelOverlayEl.innerHTML = state.activeRevealEmpireStatsPopup ? revealEmpireStatsDossierHtml(state.activeRevealEmpireStatsPopup) : "";
  dom.intelOverlayEl.style.display = state.activeRevealEmpireStatsPopup ? "grid" : "none";
  fetchActivePlayerProfileData(state, wsUrl, () => renderClientHud(deps));
  dom.techOwnedEl.innerHTML = safeValue(
    "techOwnedHtml",
    fallbackCard("Your Manifests"),
    () => deps.techOwnedHtml(state.techCatalog, deps.effectiveOwnedTechIds(), deps.isPendingTechUnlock)
  );
  dom.techChoiceDetailsEl.innerHTML = safeValue("renderTechChoiceDetails", "", () => deps.renderTechChoiceDetails());
  const techResearchSectionEl = document.querySelector("#tech-research-section") as HTMLDivElement | null;
  if (techResearchSectionEl) techResearchSectionEl.style.display = "grid";
  syncManifestPanelTabs(dom, state, deps.effectiveOwnedTechIds().length, () => renderClientHud(deps));
  dom.panelTechEl.classList.toggle("tech-detail-open", state.techDetailOpen && !state.techTreeExpanded);
  dom.panelDomainsEl.classList.remove("domain-detail-open");
  dom.hud.classList.toggle("desktop-side-panel-open", state.activePanel !== null);
  dom.hud.classList.toggle("tech-tree-overlay-active", state.activePanel === "tech" && state.techTreeExpanded);
  bindTechTreeDragScroll();
  const techTreeZoomButtons = dom.hud.querySelectorAll("[data-tech-tree-zoom]") as NodeListOf<HTMLButtonElement>;
  techTreeZoomButtons.forEach((btn: HTMLButtonElement) => {
    btn.onclick = () => {
      const action = btn.dataset.techTreeZoom;
      if (action === "in") state.techTreeZoom = Math.min(1.6, Math.round((state.techTreeZoom + 0.15) * 100) / 100);
      else if (action === "out") state.techTreeZoom = Math.max(0.7, Math.round((state.techTreeZoom - 0.15) * 100) / 100);
      else state.techTreeZoom = 1;
      renderClientHud(deps);
    };
  });
  bindStructureInfoActions(dom.hud, { state, renderHud: () => renderClientHud(deps) });
  const crystalAbilityInfoButtons = dom.hud.querySelectorAll("[data-crystal-ability-info]") as NodeListOf<HTMLButtonElement>;
  crystalAbilityInfoButtons.forEach((btn: HTMLButtonElement) => {
    btn.onclick = () => {
      const key = btn.dataset.crystalAbilityInfo as CrystalAbilityInfoKey | undefined;
      if (!key) return;
      state.crystalAbilityInfoKey = key;
      state.structureInfoKey = "";
      renderClientHud(deps);
    };
  });
  const crystalAbilityInfoCloseButtons = dom.hud.querySelectorAll("[data-crystal-ability-info-close]") as NodeListOf<HTMLElement>;
  crystalAbilityInfoCloseButtons.forEach((btn: HTMLElement) => {
    btn.onclick = () => {
      state.crystalAbilityInfoKey = "";
      renderClientHud(deps);
    };
  });
  wireEmpireIntelOverlay(dom, state, () => renderClientHud(deps));
  const techDetailCloseButtons = dom.hud.querySelectorAll("[data-tech-detail-close]") as NodeListOf<HTMLElement>;
  techDetailCloseButtons.forEach((btn: HTMLElement) => {
    btn.onclick = () => {
      state.techDetailOpen = false;
      renderClientHud(deps);
    };
  });
  const selectedTech = state.techCatalog.find((tech) => tech.id === state.techUiSelectedId);
  const canPick = Boolean(selectedTech && selectedTech.requirements.canResearch && !state.pendingTechUnlockId);
  dom.techChooseBtn.disabled = !canPick;

  const techCardButtons = dom.hud.querySelectorAll("[data-tech-card]") as NodeListOf<HTMLButtonElement>;
  techCardButtons.forEach((btn: HTMLButtonElement) => {
    btn.onclick = () => {
      const id = btn.dataset.techCard;
      if (!id) return;
      state.techUiSelectedId = id;
      state.techDetailOpen = true;
      state.domainDetailOpen = false;
      if (visibleTechChoices.includes(id)) {
        dom.techPickEl.value = id;
      }
      renderClientHud(deps);
    };
  });
  const techUnlockButtons = dom.hud.querySelectorAll("[data-tech-unlock]") as NodeListOf<HTMLButtonElement>;
  techUnlockButtons.forEach((btn: HTMLButtonElement) => {
    btn.onclick = () => {
      const id = btn.dataset.techUnlock;
      if (!id) return;
      chooseTech(id);
    };
  });
  const upgradesRendered = safeValue("renderAfcUpgradePanels", false, () => {
    renderAfcUpgradePanels(state, dom.panelDomainsContentEl, chooseDomain, { send: sendGameMessage });
    return true;
  });
  if (!upgradesRendered) {
    dom.panelDomainsContentEl.innerHTML = fallbackCard("AFC upgrades");
  }
  renderAllianceLists(state, dom, safeValue, fallbackCard("Alliances"));
  // Single Copy button for the merged connection + account debug card (was
  // two separate cards each with their own Copy button/payload).
  bindAuthDebugCopyButton(dom.hud, { state, wsUrl, firebaseAuth, pushFeed, onCopied: () => renderClientHud(deps) });
  const socialInspectCardHtml = safeValue("renderSocialInspectCardHtml", "", () =>
    renderSocialInspectCardHtml({
      socialInspectPlayerId: state.socialInspectPlayerId,
      leaderboardOverall: state.leaderboard.overall,
      allies: state.allies,
      playerNameForOwner
    })
  );
  dom.alliancePlayerInspectEl.innerHTML = socialInspectCardHtml;

  renderHouseChargesPanel(state, { root: dom.hud, panelEl: dom.panelChargesEl, rerender: () => renderClientHud(deps), requestViewRefresh, sendGameMessage, wrapX, wrapY, now: Date.now });
  renderDefensibilityPanels(state, dom, { keyFor, wrapX, wrapY, terrainAt, safeValue, fallbackCard });
  bindWeakDefensibilityToggle(dom.hud, state, { keyFor, wrapX, wrapY, terrainAt, pushFeed, requestViewRefresh, rerender: () => renderClientHud(deps) });

  const economyPanelHtml = safeValue("renderEconomyPanelHtml", fallbackCard("Economy"), () =>
    hudEconomyPanelHtml(state, { prettyToken, resourceIconHtml, rateToneClass, resourceLabel, economicStructureName, hasRevealedResourceCategory })
  );
  dom.panelEconomyEl.innerHTML = economyPanelHtml;
  dom.panelDevelopmentEl.innerHTML = safeValue("developmentPanelHtml", fallbackCard("Development"), () => {
    const development = deps.developmentSlotSummary();
    return renderDevelopmentPanelHtml(deriveDevelopmentPanelData(state.tiles, state.me, state.settleProgressByTile, state.developmentQueue, development.busy, development.limit));
  });
  renderHudManpowerPanel({
    state, dom, renderManpowerPanelHtml: deps.renderManpowerPanelHtml, formatManpowerAmount, rateToneClass, wrapX, wrapY, requestViewRefresh, sendGameMessage,
    rerender: () => renderClientHud(deps), safeHtml: safeValue, fallbackHtml: fallbackCard("Manpower")
  });
  dom.leaderboardEl.innerHTML = safeValue(
    "leaderboardHtml",
    fallbackCard("Leaderboard"),
    () => leaderboardHtml(state.leaderboard, state.seasonVictory, state.seasonWinner, state.playerColors, state.dukePlayers)
  );
  dom.feedEl.innerHTML = safeValue("feedHtml", fallbackCard("Activity feed"), () => {
    const liveFeedHtml = feedHtml(state.feed, {
      visible: debugEnabledForAccount(),
      enabled: debugTileLoggingEnabled(),
      selectedTileKey: state.selected ? `${state.selected.x},${state.selected.y}` : undefined
    });
    // Sovereign Siege Engine strikes stay discoverable here for up to 12h even after
    // they've scrolled off the live feed above (see client-network.ts's
    // silent history backfill and SOVEREIGN_SIEGE_ENGINE_STRIKE_ANNOUNCEMENT handling).
    // Filtered by age here (not just capped by count) since live-received
    // entries are never locally expired — a long-lived connected session
    // would otherwise keep showing strikes well past the "last 12h" label.
    const recentStrikes = state.sovereignSiegeEngineStrikeAnnouncements.filter(
      (entry) => Date.now() - entry.occurredAt <= SOVEREIGN_SIEGE_ENGINE_STRIKE_HISTORY_WINDOW_MS
    );
    if (recentStrikes.length === 0) return liveFeedHtml;
    const worldEventsHtml = feedHtml(recentStrikes.map(sovereignSiegeEngineStrikeRecordToFeedEntry));
    return `${liveFeedHtml}<h4 class="feed-section-heading">World Events (last 12h)</h4>${worldEventsHtml}`;
  });
  const feedFocusButtons = dom.hud.querySelectorAll("[data-feed-focus-x][data-feed-focus-y]") as NodeListOf<HTMLButtonElement>;
  feedFocusButtons.forEach((btn: HTMLButtonElement) => {
    btn.onclick = () => {
      const x = Number(btn.dataset.feedFocusX);
      const y = Number(btn.dataset.feedFocusY);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      state.camX = wrapX(x); state.camY = wrapY(y);
      state.camSubX = 0; state.camSubY = 0;
      state.selected = { x: wrapX(x), y: wrapY(y) };
      requestViewRefresh();
      renderClientHud(deps);
    };
  });
  const debugTileButtons = dom.hud.querySelectorAll("[data-debug-tile-toggle]") as NodeListOf<HTMLButtonElement>;
  debugTileButtons.forEach((btn: HTMLButtonElement) => {
    btn.onclick = () => {
      if (!debugEnabledForAccount()) return;
      const enabled = debugTileLoggingEnabled();
      if (enabled) {
        setDebugTileLoggingEnabled(false);
        setDebugTileKey(undefined);
        announceDebugTileState("tile debug disabled");
      } else {
        if (!state.selected) return;
        setDebugTileLoggingEnabled(true);
        setDebugTileKey(undefined);
        announceDebugTileState("tile debug enabled", {
          target: `${state.selected.x},${state.selected.y}`,
          mode: "follow-selected-tile"
        });
      }
      renderClientHud(deps);
    };
  });


  // Settings is a hub + sub-pages (Account / Gameplay / Diagnostics &
  // Support) instead of one flat card; the name/colour editor lives in its
  // own overlay (renderProfileEditOverlay below), so nothing here is typed
  // into between renders and no focus-preserving guard is needed.
  dom.panelSettingsEl.innerHTML = settingsPanelHtml(state, wsUrl, firebaseAuth);

  bindRequestActionButtons(dom.hud, sendGameMessage, ".accept-request", "requestId", (id) => ({ type: "ALLIANCE_ACCEPT", requestId: id, confirmedResourceSupply: true }), "Finish sign-in before responding to alliance requests.");
  bindRequestActionButtons(dom.hud, sendGameMessage, ".reject-request", "requestId", (id) => ({ type: "ALLIANCE_REJECT", requestId: id }), "Finish sign-in before responding to alliance requests.");
  bindRequestActionButtons(dom.hud, sendGameMessage, ".cancel-request", "requestId", (id) => ({ type: "ALLIANCE_CANCEL", requestId: id }), "Finish sign-in before changing alliance requests.");
  bindRequestActionButtons(dom.hud, sendGameMessage, ".accept-truce", "truceRequestId", (id) => ({ type: "TRUCE_ACCEPT", requestId: id, confirmedResourceSupply: true }), "Finish sign-in before responding to truces.");
  bindRequestActionButtons(dom.hud, sendGameMessage, ".reject-truce", "truceRequestId", (id) => ({ type: "TRUCE_REJECT", requestId: id }), "Finish sign-in before responding to truces.");
  bindRequestActionButtons(dom.hud, sendGameMessage, ".cancel-truce", "truceRequestId", (id) => ({ type: "TRUCE_CANCEL", requestId: id }), "Finish sign-in before changing truce requests.");

  bindProposeButtons(dom.hud, { playerNameForOwner, sendGameMessage, state });
  bindMetPlayerRowToggles(dom.hud, state);
  const breakAllianceButtons = dom.hud.querySelectorAll(".break-alliance") as NodeListOf<HTMLButtonElement>;
  breakAllianceButtons.forEach((btn: HTMLButtonElement) => bindBreakAllianceButton(btn, sendGameMessage));

  bindAccountSettingsControls(dom.hud, firebaseAuth, state, wsUrl, () => renderClientHud(deps));
  renderProfileEditOverlay({ state, dom, sendGameMessage, pushFeed, firebaseAuth, renderHud: () => renderClientHud(deps) });
  bindAudioSettingsControls(dom.hud, () => renderClientHud(deps)); bindHintsSettingsControls(dom.hud, state.authEmail); bindRendererSettingsControls(dom.hud); bindEmailNotificationsSettingsControls(dom.hud); bindPhotoModeSettingsControls(dom.hud, state, () => renderClientHud(deps)); bindAdminSettingsControls(dom.hud, { state, sendGameMessage, requestViewRefresh, rerender: () => renderClientHud(deps), openPanel: setActivePanel });
  bindHudEconomyPanelControls(dom.hud, state, () => renderClientHud(deps));
  renderHudTownsPanel(state, {
    root: dom.hud, panelEl: dom.panelTownsEl, rerender: () => renderClientHud(deps),
    requestViewRefresh, wrapX, wrapY, safeHtml: safeValue, fallbackHtml: fallbackCard("Towns")
  });
  // Shared binder for the settings panel's JSON-bundle download buttons.
  // Wrapped in try/catch: an uncaught exception inside an onclick handler is
  // swallowed by the browser with no visible feedback at all — a bug in
  // buildBundle() (or in the download itself) would just look like "nothing
  // happens" when the button is pressed, rather than surfacing the actual
  // failure. Report it through the feed instead so it's visible and the
  // console still has the real error for follow-up.
  const bindBundleDownloadButton = (selector: string, buildBundle: () => Record<string, unknown>): void =>
    (dom.hud.querySelectorAll(selector) as NodeListOf<HTMLButtonElement>).forEach((btn) => {
      btn.onclick = (): void => {
        try {
          downloadDiagnosticsBundle(buildBundle());
        } catch (error) {
          console.error("[diagnostics] download button failed", error);
          pushFeed(
            `Diagnostics download failed: ${error instanceof Error ? error.message : String(error)}`,
            "error",
            "warn"
          );
        }
      };
    });
  bindBundleDownloadButton("[data-settings-download-diagnostics]", () => buildDiagnosticsBundle(state, wsUrl));
  bindBundleDownloadButton("[data-settings-download-disconnect-history]", buildDisconnectHistoryBundle);

  // Bug report overlay
  renderBugReportOverlay({ state, dom, wsUrl, renderHud: () => renderClientHud(deps) });

  renderRendererPromptOverlay({ state, overlayEl: dom.rendererPromptOverlayEl, wsUrl, storageSet, renderHud: () => renderClientHud(deps) });

  renderRespawnOverlay({
    state, overlayEl: dom.respawnOverlayEl, renderHud: () => renderClientHud(deps),
    centerOnOwnedTile, pushFeed, downloadRespawnBugReport
  });
  renderJoinSeasonOverlay({
    state, overlayEl: dom.joinSeasonOverlayEl, renderHud: () => renderClientHud(deps),
    joinSeason: () => sendGameMessage({ type: "JOIN_SEASON" }, "Finish sign-in before joining the Sector Contest."),
    pushFeed
  });
  renderSeasonEndOverlay({
    state, overlayEl: dom.seasonEndOverlayEl, renderHud: () => renderClientHud(deps),
    ...seasonStartSenders(sendGameMessage), openGuestSave: () => openGuestSavePanel("next-contest"), wsUrl
  });

  syncAuthOverlay();
  deps.renderSidePanel();
  // Wired last: player names (leaderboard, alliances) are
  // rendered at various points above and into dom.hud, so this needs to run
  // after everything (including renderSidePanel) has set its innerHTML.
  wirePlayerNameLinks(dom, state, () => renderClientHud(deps));
};

export const resizeClientViewport = (deps: { dom: Pick<ClientDom, "canvas">; viewportSize: () => { width: number; height: number } }): void => {
  const { width, height } = deps.viewportSize();
  deps.dom.canvas.width = width;
  deps.dom.canvas.height = height;
};
