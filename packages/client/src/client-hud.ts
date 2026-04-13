import { signOut, type Auth } from "firebase/auth";
import { CLIENT_BUILD_VERSION } from "./client-build-version.js";
import { renderClientChangelogOverlay } from "./client-changelog.js";
import { renderCrystalAbilityInfoOverlay, type CrystalAbilityInfoKey } from "./client-crystal-ability-info.js";
import { GUIDE_AUTO_OPEN_STORAGE_KEY, GUIDE_STORAGE_KEY, guideSteps } from "./client-constants.js";
import { announceDebugTileState, debugEnabledForAccount, debugTileLoggingEnabled, setDebugTileKey, setDebugTileLoggingEnabled } from "./client-debug.js";
import { exposedSidesForTile, renderDefensibilityPanelHtml } from "./client-defensibility-html.js";
import type { initClientDom } from "./client-dom.js";
import { renderEconomyPanelHtml } from "./client-economy-html.js";
import type { EconomyFocusKey } from "./client-economy-model.js";
import type { ClientState, storageSet } from "./client-state.js";
import type { StructureInfoKey } from "./client-map-display.js";
import type { DevelopmentSlotSummary } from "./client-queue-logic.js";
import type { DomainInfo, TechInfo, Tile, TileMenuView } from "./client-types.js";

type ClientDom = ReturnType<typeof initClientDom>;
type VisibleCollectSummary = {
  tileCount: number;
  totalGold: number;
  totalShards: number;
  totalResources: Record<string, number>;
};

type HudDeps = {
  state: ClientState;
  dom: ClientDom;
  miniMapReplayEl: HTMLDivElement;
  wsUrl: string;
  firebaseAuth?: Auth;
  syncAuthOverlay: () => void;
  storageSet: typeof storageSet;
  visibleCollectSummary: () => VisibleCollectSummary;
  developmentSlotSummary: () => DevelopmentSlotSummary;
  isMobile: () => boolean;
  rateToneClass: (value: number) => string;
  formatGoldAmount: (value: number) => string;
  formatManpowerAmount: (value: number) => string;
  strategicRibbonHtml: (
    strategicResources: ClientState["strategicResources"],
    strategicProductionPerMinute: ClientState["strategicProductionPerMinute"],
    upkeepPerMinute: ClientState["upkeepPerMinute"],
    strategicAnim: ClientState["strategicAnim"],
    rateToneClass: (value: number) => string
  ) => string;
  formatCooldownShort: (ms: number) => string;
  openEconomyPanel: (focus?: EconomyFocusKey) => void;
  setActivePanel: (panel: ClientState["activePanel"]) => void;
  affordableTechChoicesCount: () => number;
  mobileNavLabelHtml: (panel: ClientState["mobilePanel"], opts?: { techReady?: boolean; attackAlertUnread?: boolean }) => string;
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
  renderShardAlert: () => void;
  renderTechChoiceGrid: () => string;
  techDetailsUseOverlay: () => boolean;
  renderTechDetailPrompt: () => string;
  renderTechDetailCard: () => string;
  renderStructureInfoOverlay: () => string;
  renderTechDetailOverlay: () => string;
  renderDomainDetailOverlay: () => string;
  techOwnedHtml: (catalog: TechInfo[], ownedIds: string[], isPendingTechUnlock?: (techId: string) => boolean) => string;
  effectiveOwnedTechIds: () => string[];
  isPendingTechUnlock: (techId: string) => boolean;
  renderTechChoiceDetails: () => string;
  techCurrentModsHtml: (mods: ClientState["mods"], expandedKey: ClientState["expandedModKey"], breakdown: ClientState["modBreakdown"]) => string;
  bindTechTreeDragScroll: () => void;
  chooseTech: (techIdRaw?: string) => void;
  chooseDomain: (domainIdRaw?: string) => void;
  renderDomainProgressCard: () => string;
  renderDomainChoiceGrid: () => string;
  domainOwnedHtml: (catalog: DomainInfo[], ownedIds: string[]) => string;
  renderDomainDetailCard: () => string;
  sendGameMessage: (payload: unknown, message?: string) => boolean;
  alliesHtml: typeof import("./client-panel-html.js").alliesHtml;
  activeTrucesHtml: typeof import("./client-panel-html.js").activeTrucesHtml;
  allianceRequestsHtml: typeof import("./client-panel-html.js").allianceRequestsHtml;
  truceRequestsHtml: typeof import("./client-panel-html.js").truceRequestsHtml;
  renderSocialInspectCardHtml: typeof import("./client-side-panel-html.js").renderSocialInspectCardHtml;
  missionCardsHtml: typeof import("./client-panel-html.js").missionCardsHtml;
  playerNameForOwner: (ownerId?: string | null) => string;
  wrapX: (x: number) => number;
  wrapY: (y: number) => number;
  terrainAt: (x: number, y: number) => Tile["terrain"];
  pushFeed: (message: string, type: import("./client-types.js").FeedType, severity?: import("./client-types.js").FeedSeverity) => void;
  requestViewRefresh: (priorityBoost?: number, immediate?: boolean) => void;
  prettyToken: (token: string) => string;
  resourceIconForKey: (key: string) => string;
  resourceLabel: (resource: string) => string;
  economicStructureName: (structureType: string) => string;
  leaderboardHtml: typeof import("./client-panel-html.js").leaderboardHtml;
  feedHtml: typeof import("./client-panel-html.js").feedHtml;
  renderMobilePanels: () => void;
  effectiveTechChoices: () => string[];
  renderManpowerPanelHtml: typeof import("./client-side-panel-html.js").renderManpowerPanelHtml;
};

export const renderClientHud = (deps: HudDeps): void => {
  const {
    state,
    dom,
    wsUrl,
    firebaseAuth,
    syncAuthOverlay,
    storageSet,
    visibleCollectSummary,
    developmentSlotSummary,
    isMobile,
    rateToneClass,
    formatGoldAmount,
    formatManpowerAmount,
    strategicRibbonHtml,
    formatCooldownShort,
    openEconomyPanel,
    setActivePanel,
    affordableTechChoicesCount,
    mobileNavLabelHtml,
    crystalTargetingTone,
    crystalTargetingTitle,
    clearCrystalTargeting,
    keyFor,
    parseKey,
    selectedTile,
    requestTileDetailIfNeeded,
    renderTileActionMenu,
    tileMenuViewForTile,
    renderCaptureProgress,
    renderShardAlert,
    renderTechChoiceGrid,
    techDetailsUseOverlay,
    renderTechDetailPrompt,
    renderTechDetailCard,
    renderStructureInfoOverlay,
    renderTechDetailOverlay,
    renderDomainDetailOverlay,
    techOwnedHtml,
    effectiveOwnedTechIds,
    isPendingTechUnlock,
    renderTechChoiceDetails,
    techCurrentModsHtml,
    bindTechTreeDragScroll,
    chooseTech,
    chooseDomain,
    renderDomainProgressCard,
    renderDomainChoiceGrid,
    domainOwnedHtml,
    renderDomainDetailCard,
    sendGameMessage,
    alliesHtml,
    activeTrucesHtml,
    allianceRequestsHtml,
    truceRequestsHtml,
    renderSocialInspectCardHtml,
    missionCardsHtml,
    playerNameForOwner,
    wrapX,
    wrapY,
    terrainAt,
    pushFeed,
    requestViewRefresh,
    prettyToken,
    resourceIconForKey,
    resourceLabel,
    economicStructureName,
    leaderboardHtml,
    feedHtml
  } = deps;

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

  if (
    !state.guide.completed &&
    !state.guide.autoOpened &&
    state.connection === "initialized" &&
    state.firstChunkAt > 0 &&
    dom.authOverlayEl.style.display !== "grid"
  ) {
    state.guide.open = true;
    state.guide.autoOpened = true;
    storageSet(GUIDE_AUTO_OPEN_STORAGE_KEY, "1");
  }

  const collectVisibleCooldownRemaining = Math.max(0, state.collectVisibleCooldownUntil - Date.now());
  const collectVisibleReady = collectVisibleCooldownRemaining <= 0;
  const collectSummary = safeValue(
    "visibleCollectSummary",
    { tileCount: 0, totalGold: 0, totalShards: 0, totalResources: {} },
    () => visibleCollectSummary()
  );
  const development = safeValue("developmentSlotSummary", { busy: 0, limit: 0, available: 0 }, () => developmentSlotSummary());
  const mobile = isMobile();
  const connClass = state.connection === "disconnected" ? "warning" : "normal";
  const pointsClass =
    Date.now() < state.goldAnimUntil ? (state.goldAnimDir > 0 ? " delta-up" : state.goldAnimDir < 0 ? " delta-down" : "") : "";
  const defClass =
    Date.now() < state.defensibilityAnimUntil
      ? state.defensibilityAnimDir > 0
        ? " delta-up"
        : state.defensibilityAnimDir < 0
          ? " delta-down"
          : ""
      : "";
  const netGoldPerMinute = state.incomePerMinute - state.upkeepPerMinute.gold;
  const goldRateText = `${netGoldPerMinute > 0 ? "+" : ""}${netGoldPerMinute.toFixed(1)}/m`;
  const mobileGoldRateText = `${netGoldPerMinute > 0 ? "+" : ""}${netGoldPerMinute.toFixed(0)}/m`;
  const goldRateClass = rateToneClass(netGoldPerMinute);
  const manpowerRateText = `${state.manpowerRegenPerMinute > 0 ? "+" : ""}${state.manpowerRegenPerMinute.toFixed(0)}/m`;
  const showManpowerRate = state.manpower + 0.001 < state.manpowerCap;
  const manpowerRateClass = rateToneClass(state.manpowerRegenPerMinute);
  dom.statsChipsEl.innerHTML = `
    ${mobile ? "" : `<div class="stat-chip stat-chip-player ${connClass}"><span>Player</span><strong>${state.meName || "Player"}</strong></div>`}
    <button class="stat-chip stat-chip-gold${pointsClass}" type="button" data-economy-open="GOLD"><span>Gold</span><strong>${formatGoldAmount(state.gold)} <em class="stat-chip-rate ${goldRateClass}">${mobile ? mobileGoldRateText : goldRateText}</em></strong></button>
    <button class="stat-chip stat-chip-manpower" type="button" data-panel="manpower" title="Manpower gates attacks. Tap for cap and regen breakdown."><span>${mobile ? "MP" : "Manpower"}</span><strong>${formatManpowerAmount(state.manpower)}/${formatManpowerAmount(state.manpowerCap)} ${showManpowerRate ? `<em class="stat-chip-rate ${manpowerRateClass}">${manpowerRateText}</em>` : ""}</strong></button>
    <button class="stat-chip stat-chip-def${defClass}" type="button" data-defensibility-open="true" title="Compact shapes with fewer exposed borders defend better. Tap for a breakdown."><span>${mobile ? "Def" : "Defensibility"}</span><strong>${Math.round(state.defensibilityPct)}%</strong></button>
    <div class="stat-chip stat-chip-dev${development.available === 0 ? " is-full" : ""}" title="Development slots limit how many settles and constructions can run at once.">
      <span>${mobile ? "Dev" : "Development"}</span>
      <strong>${development.busy}/${development.limit}</strong>
    </div>
    ${state.showWeakDefensibility ? `<button class="stat-chip stat-chip-weak-def" type="button" data-toggle-weak-def="true"><span>Def</span><strong>Hide Weak</strong></button>` : ""}
    ${strategicRibbonHtml(
      state.strategicResources,
      state.strategicProductionPerMinute,
      state.upkeepPerMinute,
      state.strategicAnim,
      rateToneClass
    )}
  `;
  dom.collectVisibleDesktopBtn.disabled = !collectVisibleReady;
  dom.collectVisibleMobileBtn.disabled = !collectVisibleReady;
  const collectReady = collectVisibleReady && collectSummary.tileCount > 0;
  const collectMeta = !collectVisibleReady ? `Cooldown ${formatCooldownShort(collectVisibleCooldownRemaining)}` : collectReady ? "Ready to collect" : "Tap to gather";
  dom.collectVisibleDesktopMetaEl.textContent = collectMeta;
  dom.collectVisibleMobileMetaEl.textContent = collectMeta;
  dom.collectVisibleDesktopBtn.classList.toggle("is-attention", collectReady);
  dom.collectVisibleMobileBtn.classList.toggle("is-attention", collectReady);
  const economyButtons = dom.statsChipsEl.querySelectorAll("[data-economy-open]") as NodeListOf<HTMLButtonElement>;
  economyButtons.forEach((btn: HTMLButtonElement) => {
    btn.onclick = () => {
      const focus = btn.dataset.economyOpen as EconomyFocusKey | undefined;
      openEconomyPanel(focus ?? "ALL");
      renderClientHud(deps);
    };
  });
  const defensibilityButtons = dom.statsChipsEl.querySelectorAll("[data-defensibility-open]") as NodeListOf<HTMLButtonElement>;
  defensibilityButtons.forEach((btn: HTMLButtonElement) => {
    btn.onclick = () => {
      setActivePanel("defensibility");
    };
  });
  const statPanelButtons = dom.statsChipsEl.querySelectorAll("[data-panel]") as NodeListOf<HTMLButtonElement>;
  statPanelButtons.forEach((btn: HTMLButtonElement) => {
    btn.onclick = () => {
      const panel = btn.dataset.panel as typeof state.activePanel;
      if (!panel) return;
      setActivePanel(panel);
    };
  });
  const techReady = state.availableTechPicks > 0 && affordableTechChoicesCount() > 0;
  const attackAlertUnread = state.unreadAttackAlerts > 0;
  dom.panelActionButtons.forEach((btn: HTMLButtonElement) => {
    if (btn.dataset.panel === "tech") {
      btn.innerHTML = techReady
        ? '<span class="tab-icon">⚡</span><span class="tech-ready-dot" aria-label="upgrade available"></span>'
        : '<span class="tab-icon">⚡</span>';
      return;
    }
    if (btn.dataset.panel === "feed") {
      btn.innerHTML = attackAlertUnread
        ? '<span class="tab-icon">🔔</span><span class="attack-alert-dot" aria-label="under attack">🔥</span>'
        : '<span class="tab-icon">🔔</span>';
    }
  });
  const coreMobileBtn = dom.hud.querySelector("#mobile-nav button[data-mobile-panel='core']") as HTMLButtonElement | null;
  if (coreMobileBtn) coreMobileBtn.innerHTML = mobileNavLabelHtml("core");
  const missionsMobileBtn = dom.hud.querySelector("#mobile-nav button[data-mobile-panel='missions']") as HTMLButtonElement | null;
  if (missionsMobileBtn) missionsMobileBtn.innerHTML = mobileNavLabelHtml("missions");
  const techMobileBtn = dom.hud.querySelector("#mobile-nav button[data-mobile-panel='tech']") as HTMLButtonElement | null;
  if (techMobileBtn) techMobileBtn.innerHTML = mobileNavLabelHtml("tech", { techReady });
  const leaderboardMobileBtn = dom.hud.querySelector("#mobile-nav button[data-mobile-panel='leaderboard']") as HTMLButtonElement | null;
  if (leaderboardMobileBtn) leaderboardMobileBtn.innerHTML = mobileNavLabelHtml("leaderboard");
  const socialMobileBtn = dom.hud.querySelector("#mobile-nav button[data-mobile-panel='social']") as HTMLButtonElement | null;
  if (socialMobileBtn) socialMobileBtn.innerHTML = mobileNavLabelHtml("social");
  const feedMobileBtn = dom.hud.querySelector("#mobile-nav button[data-mobile-panel='feed']") as HTMLButtonElement | null;
  if (feedMobileBtn) feedMobileBtn.innerHTML = mobileNavLabelHtml("feed", { attackAlertUnread });

  if (state.aetherWallTargeting.active) {
    const status = state.selected ? `Origin ${state.selected.x}, ${state.selected.y}` : `Valid origins in view: ${state.aetherWallTargeting.validOrigins.size}`;
    dom.targetingOverlayEl.innerHTML = `
      <div class="targeting-card tone-amber">
        <div class="targeting-kicker">Crystal Action Armed</div>
        <div class="targeting-title">Aether Wall</div>
        <div class="targeting-detail">Select one of your settled border tiles, then cast. If more than one facing is valid, tap one of the glowing map arrows.</div>
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
        ? "Pick a coastal land tile. The server links the nearest settled coast and opens a temporary sea lane."
        : "Pick an enemy town or resource tile to siphon 50% of its output for 30 minutes.";
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
  dom.selectedEl.innerHTML = "";
  if (state.tileActionMenu.visible && state.tileActionMenu.mode === "single" && state.tileActionMenu.currentTileKey) {
    const menuTile = state.tiles.get(state.tileActionMenu.currentTileKey);
    if (menuTile) renderTileActionMenu(tileMenuViewForTile(menuTile), state.tileActionMenu.x, state.tileActionMenu.y);
  }
  dom.hoverEl.innerHTML = "";
  dom.hoverEl.style.display = "none";

  dom.mobileCoreHelpEl.innerHTML = "";
  dom.mobileCoreHelpEl.style.display = "none";

  safeValue("renderCaptureProgress", undefined, () => renderCaptureProgress());
  safeValue("renderShardAlert", undefined, () => renderShardAlert());
  state.replayActive = false;
  state.replayPlaying = false;
  dom.miniMapLabelEl.innerHTML = replayToolbarHtml();
  deps.miniMapReplayEl.innerHTML = replayPanelHtml();
  const loadingActive = state.connection !== "initialized" || state.firstChunkAt === 0;
  if (loadingActive) {
    dom.mapLoadingOverlayEl.style.display = "grid";
    if (state.connection === "disconnected") {
      dom.mapLoadingTitleEl.textContent = "Disconnected from server";
      dom.mapLoadingMetaEl.textContent = "Retrying connection...";
    } else if (state.connection === "connecting") {
      dom.mapLoadingTitleEl.textContent = "Connecting to server...";
      dom.mapLoadingMetaEl.textContent = "Retrying connection...";
    } else if (state.connection === "connected" || (state.connection === "initialized" && state.firstChunkAt === 0)) {
      const startAt = state.mapLoadStartedAt || Date.now();
      const elapsed = ((Date.now() - startAt) / 1000).toFixed(1);
      dom.mapLoadingTitleEl.textContent = state.authSessionReady ? "Loading nearby land..." : "Syncing empire...";
      dom.mapLoadingMetaEl.textContent = state.authSessionReady ? `Elapsed ${elapsed}s · chunks ${state.chunkFullCount}` : `Connected to ${wsUrl}`;
    } else {
      dom.mapLoadingTitleEl.textContent = "Loading world...";
      dom.mapLoadingMetaEl.textContent = "Finalizing map render...";
    }
  } else {
    dom.mapLoadingOverlayEl.style.display = "none";
  }

  const visibleTechChoices = deps.effectiveTechChoices();
  const choicesSig = `${state.availableTechPicks}|${visibleTechChoices.join("|")}|${state.techCatalog.length}|${state.pendingTechUnlockId}`;
  const focused = document.activeElement === dom.techPickEl || document.activeElement === dom.mobileTechPickEl;
  const catalogById = new Map(state.techCatalog.map((tech) => [tech.id, tech] as const));
  if (choicesSig !== state.techChoicesSig && !focused) {
    const previous = state.techUiSelectedId?.trim() || dom.techPickEl.value || dom.mobileTechPickEl.value;
    dom.techPickEl.innerHTML = "";
    dom.mobileTechPickEl.innerHTML = "";
    for (const choice of visibleTechChoices) {
      const opt = document.createElement("option");
      opt.value = choice;
      const info = catalogById.get(choice);
      opt.textContent = info ? `${info.name}${info.requirements.canResearch ? "" : " (blocked)"}` : choice;
      dom.techPickEl.append(opt);
      dom.mobileTechPickEl.append(opt.cloneNode(true));
    }
    if (visibleTechChoices.length === 0) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent =
        state.pendingTechUnlockId
          ? "Unlock pending..."
          : state.techIds.length > 0
            ? "No further techs in your current branch this season"
            : "No available tech choices";
      dom.techPickEl.append(opt);
      dom.mobileTechPickEl.append(opt.cloneNode(true));
    }
    const fallback = state.pendingTechUnlockId || visibleTechChoices[0] || state.techCatalog[0]?.id || "";
    const nextSelected = previous && catalogById.has(previous) ? previous : fallback;
    const nextPickerValue = visibleTechChoices.includes(nextSelected) ? nextSelected : state.pendingTechUnlockId || visibleTechChoices[0] || "";
    dom.techPickEl.value = nextPickerValue;
    dom.mobileTechPickEl.value = nextPickerValue;
    state.techUiSelectedId = nextSelected;
    state.techChoicesSig = choicesSig;
  } else if (!focused) {
    const selectedTechValue = state.techUiSelectedId || dom.techPickEl.value || dom.mobileTechPickEl.value;
    if (selectedTechValue && catalogById.has(selectedTechValue)) state.techUiSelectedId = selectedTechValue;
  }

  dom.techPointsEl.textContent = "Tech unlocks use gold + strategic resources";
  dom.mobileTechPointsEl.textContent = "Tech unlocks use gold + strategic resources";
  dom.techCurrentModsEl.innerHTML = safeValue(
    "techCurrentModsHtml",
    fallbackCard("Technology modifiers"),
    () => deps.techCurrentModsHtml(state.mods, state.expandedModKey, state.modBreakdown)
  );
  dom.mobileTechCurrentModsEl.innerHTML = dom.techCurrentModsEl.innerHTML;
  dom.techChoicesGridEl.innerHTML = safeValue("renderTechChoiceGrid", fallbackCard("Technology choices"), () => renderTechChoiceGrid());
  dom.mobileTechChoicesGridEl.innerHTML = dom.techChoicesGridEl.innerHTML;
  dom.techDetailCardEl.innerHTML = safeValue(
    "renderTechDetailCard",
    fallbackCard("Technology detail"),
    () => (deps.techDetailsUseOverlay() ? deps.renderTechDetailPrompt() : deps.renderTechDetailCard())
  );
  dom.mobileTechDetailCardEl.innerHTML = safeValue("renderTechDetailPrompt", fallbackCard("Technology detail"), () => deps.renderTechDetailPrompt());
  dom.structureInfoOverlayEl.innerHTML = state.structureInfoKey
    ? deps.renderStructureInfoOverlay()
    : state.crystalAbilityInfoKey
      ? renderCrystalAbilityInfoOverlay(state.crystalAbilityInfoKey, { formatCooldownShort })
      : "";
  dom.structureInfoOverlayEl.style.display = state.structureInfoKey || state.crystalAbilityInfoKey ? "grid" : "none";
  const mobileDetailOverlayHtml = deps.techDetailsUseOverlay()
    ? state.techDetailOpen
      ? deps.renderTechDetailOverlay()
      : state.domainDetailOpen
        ? deps.renderDomainDetailOverlay()
        : ""
    : "";
  dom.techDetailOverlayEl.innerHTML = mobileDetailOverlayHtml;
  dom.techDetailOverlayEl.style.display = deps.techDetailsUseOverlay() && mobileDetailOverlayHtml ? "grid" : "none";
  dom.techOwnedEl.innerHTML = safeValue(
    "techOwnedHtml",
    fallbackCard("Owned technologies"),
    () => deps.techOwnedHtml(state.techCatalog, deps.effectiveOwnedTechIds(), deps.isPendingTechUnlock)
  );
  dom.mobileTechOwnedEl.innerHTML = dom.techOwnedEl.innerHTML;
  dom.techChoiceDetailsEl.innerHTML = safeValue("renderTechChoiceDetails", "", () => deps.renderTechChoiceDetails());
  dom.mobileTechChoiceDetailsEl.innerHTML = dom.techChoiceDetailsEl.innerHTML;
  const techResearchSectionEl = document.querySelector("#tech-research-section") as HTMLDivElement | null;
  const mobileTechResearchSectionEl = document.querySelector("#mobile-tech-research-section") as HTMLDivElement | null;
  if (techResearchSectionEl) techResearchSectionEl.style.display = "grid";
  if (mobileTechResearchSectionEl) mobileTechResearchSectionEl.style.display = "grid";
  dom.panelTechEl.classList.toggle("tech-tree-expanded", state.techTreeExpanded);
  dom.panelTechEl.classList.toggle("tech-detail-open", state.techDetailOpen && !deps.techDetailsUseOverlay() && !state.techTreeExpanded);
  dom.mobilePanelTechEl.classList.toggle("tech-tree-expanded", state.techTreeExpanded);
  dom.panelDomainsEl.classList.toggle("domain-detail-open", state.domainDetailOpen && !isMobile());
  dom.hud.classList.toggle("desktop-side-panel-open", !isMobile() && state.activePanel !== null);
  dom.techTreeExpandToggleEl.textContent = state.techTreeExpanded ? "Collapse Tree" : "Expand Tree";
  dom.mobileTechTreeExpandToggleEl.textContent = state.techTreeExpanded ? "Collapse Tree" : "Expand Tree";
  dom.techTreeExpandToggleEl.classList.toggle("active", state.techTreeExpanded);
  dom.mobileTechTreeExpandToggleEl.classList.toggle("active", state.techTreeExpanded);
  dom.techTreeExpandToggleEl.onclick = () => {
    state.techTreeExpanded = !state.techTreeExpanded;
    renderClientHud(deps);
  };
  dom.mobileTechTreeExpandToggleEl.onclick = () => {
    state.techTreeExpanded = !state.techTreeExpanded;
    renderClientHud(deps);
  };
  bindTechTreeDragScroll();
  const structureInfoButtons = dom.hud.querySelectorAll("[data-structure-info]") as NodeListOf<HTMLButtonElement>;
  structureInfoButtons.forEach((btn: HTMLButtonElement) => {
    btn.onclick = () => {
      const type = btn.dataset.structureInfo as StructureInfoKey | undefined;
      if (!type) return;
      state.structureInfoKey = type;
      state.crystalAbilityInfoKey = "";
      renderClientHud(deps);
    };
  });
  const structureInfoCloseButtons = dom.hud.querySelectorAll("[data-structure-info-close]") as NodeListOf<HTMLElement>;
  structureInfoCloseButtons.forEach((btn: HTMLElement) => {
    btn.onclick = () => {
      state.structureInfoKey = "";
      renderClientHud(deps);
    };
  });
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
  dom.mobileTechChooseBtn.disabled = !canPick;

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
        dom.mobileTechPickEl.value = id;
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
  const openDomainDetail = (id: string): void => {
    state.domainUiSelectedId = id;
    state.activePanel = "domains";
    state.mobilePanel = "domains";
    state.domainDetailOpen = true;
    state.techDetailOpen = false;
    renderClientHud(deps);
  };
  const bindDomainPanelInteraction = (panel: HTMLElement): void => {
    panel.onclick = (event: MouseEvent) => {
      const trigger = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-domain-card]");
      const id = trigger?.dataset.domainCard;
      if (!id) return;
      event.preventDefault();
      openDomainDetail(id);
    };
    panel.onpointerup = (event: PointerEvent) => {
      const trigger = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-domain-card]");
      const id = trigger?.dataset.domainCard;
      if (!id) return;
      event.preventDefault();
      openDomainDetail(id);
    };
  };
  bindDomainPanelInteraction(dom.panelDomainsContentEl);
  bindDomainPanelInteraction(dom.mobilePanelDomainsEl);
  const domainDetailCloseButtons = dom.hud.querySelectorAll(
    "#panel-domains [data-domain-detail-close], #mobile-panel-domains [data-domain-detail-close]"
  ) as NodeListOf<HTMLElement>;
  domainDetailCloseButtons.forEach((btn: HTMLElement) => {
    btn.onclick = () => {
      state.domainDetailOpen = false;
      renderClientHud(deps);
    };
  });
  const domainUnlockButtons = dom.hud.querySelectorAll(
    "#panel-domains [data-domain-unlock], #mobile-panel-domains [data-domain-unlock]"
  ) as NodeListOf<HTMLButtonElement>;
  domainUnlockButtons.forEach((btn: HTMLButtonElement) => {
    btn.onclick = () => {
      const id = btn.dataset.domainUnlock;
      if (!id) return;
      chooseDomain(id);
    };
  });
  dom.techDetailOverlayEl.onclick = (event: MouseEvent) => {
    const target = event.target as HTMLElement | null;
    const domainCloseTrigger = target?.closest<HTMLElement>("[data-domain-detail-close]");
    if (domainCloseTrigger) {
      event.preventDefault();
      state.domainDetailOpen = false;
      renderClientHud(deps);
      return;
    }
    const domainUnlockTrigger = target?.closest<HTMLButtonElement>("[data-domain-unlock]");
    if (domainUnlockTrigger) {
      event.preventDefault();
      const id = domainUnlockTrigger.dataset.domainUnlock;
      if (!id) return;
      chooseDomain(id);
      return;
    }
  };
  dom.alliesListEl.innerHTML = safeValue(
    "alliesHtml",
    fallbackCard("Alliances"),
    () => {
      const nowMs = Date.now();
      return `<section class="alliance-section-block">
        <h4 class="alliance-section-title">Current Allies</h4>
        <div class="alliance-card-stack">${alliesHtml(state.allies, playerNameForOwner)}</div>
      </section>
      <section class="alliance-section-block">
        <h4 class="alliance-section-title">Active Truces</h4>
        <div class="alliance-card-stack">${activeTrucesHtml(state.activeTruces, playerNameForOwner, nowMs)}</div>
      </section>`;
    }
  );
  dom.mobileAlliesListEl.innerHTML = dom.alliesListEl.innerHTML;
  dom.allianceRequestsEl.innerHTML = safeValue(
    "allianceRequestsHtml",
    fallbackCard("Alliance requests"),
    () => {
      const nowMs = Date.now();
      return `<section class="alliance-section-block">
        <h4 class="alliance-section-title">Incoming Alliance Requests</h4>
        <div class="alliance-card-stack">${allianceRequestsHtml(state.incomingAllianceRequests, playerNameForOwner, "incoming", nowMs)}</div>
      </section>
      <section class="alliance-section-block">
        <h4 class="alliance-section-title">Incoming Truces</h4>
        <div class="alliance-card-stack">${truceRequestsHtml(state.incomingTruceRequests, playerNameForOwner, nowMs)}</div>
      </section>`;
    }
  );
  dom.mobileAllianceRequestsEl.innerHTML = dom.allianceRequestsEl.innerHTML;
  const socialInspectCardHtml = safeValue("renderSocialInspectCardHtml", "", () =>
    renderSocialInspectCardHtml({
      socialInspectPlayerId: state.socialInspectPlayerId,
      leaderboardOverall: state.leaderboard.overall,
      allies: state.allies,
      playerNameForOwner
    })
  );
  dom.alliancePlayerInspectEl.innerHTML = socialInspectCardHtml;
  dom.mobileAlliancePlayerInspectEl.innerHTML = socialInspectCardHtml;

  dom.missionsEl.innerHTML = safeValue("missionCardsHtml", fallbackCard("Missions"), () => deps.missionCardsHtml(state.missions));
  dom.mobilePanelMissionsEl.innerHTML = dom.missionsEl.innerHTML;
  const defensibilityPanelHtml = safeValue("renderDefensibilityPanelHtml", fallbackCard("Defensibility"), () =>
    renderDefensibilityPanelHtml({
      tiles: state.tiles,
      me: state.me,
      defensibilityPct: state.defensibilityPct,
      showWeakDefensibility: state.showWeakDefensibility,
      keyFor,
      wrapX,
      wrapY,
      terrainAt
    })
  );
  dom.panelDefensibilityEl.innerHTML = defensibilityPanelHtml;
  dom.mobilePanelDefensibilityEl.innerHTML = defensibilityPanelHtml;
  const weakDefButtons = dom.hud.querySelectorAll("[data-toggle-weak-def]") as NodeListOf<HTMLButtonElement>;
  weakDefButtons.forEach((btn: HTMLButtonElement) => {
    btn.onclick = () => {
      state.showWeakDefensibility = !state.showWeakDefensibility;
      const weakTileCount = [...state.tiles.values()].filter((tile) => {
        if (tile.ownerId !== state.me || tile.terrain !== "LAND" || tile.ownershipState !== "SETTLED" || tile.fogged) return false;
        return exposedSidesForTile(tile, {
          tiles: state.tiles,
          me: state.me,
          keyFor,
          wrapX,
          wrapY,
          terrainAt
        }).length >= 2;
      }).length;
      pushFeed(
        state.showWeakDefensibility
          ? `Weak defensibility overlay enabled (${weakTileCount} tiles highlighted).`
          : "Weak defensibility overlay hidden.",
        "info",
        "info"
      );
      if (isMobile() && state.mobilePanel === "defensibility") {
        state.mobilePanel = "core";
        state.activePanel = null;
      }
      requestViewRefresh();
      renderClientHud(deps);
    };
  });

  const economyPanelHtml = safeValue("renderEconomyPanelHtml", fallbackCard("Economy"), () =>
    renderEconomyPanelHtml({
      focus: state.economyFocus,
      gold: state.gold,
      me: state.me,
      incomePerMinute: state.incomePerMinute,
      strategicResources: state.strategicResources,
      strategicProductionPerMinute: state.strategicProductionPerMinute,
      economyBreakdown: state.economyBreakdown,
      upkeepPerMinute: state.upkeepPerMinute,
      upkeepLastTick: state.upkeepLastTick,
      activeRevealTargetsCount: state.activeRevealTargets.length,
      tiles: state.tiles.values(),
      isMobile: window.matchMedia("(max-width: 900px)").matches,
      prettyToken,
      resourceIconForKey,
      rateToneClass,
      resourceLabel,
      economicStructureName
    })
  );
  dom.panelEconomyEl.innerHTML = economyPanelHtml;
  dom.mobilePanelEconomyEl.innerHTML = economyPanelHtml;
  const manpowerPanelHtml = safeValue("renderManpowerPanelHtml", fallbackCard("Manpower"), () =>
    deps.renderManpowerPanelHtml({
      manpower: state.manpower,
      manpowerCap: state.manpowerCap,
      manpowerRegenPerMinute: state.manpowerRegenPerMinute,
      manpowerBreakdown: state.manpowerBreakdown,
      formatManpowerAmount,
      rateToneClass
    })
  );
  dom.panelManpowerEl.innerHTML = manpowerPanelHtml;
  dom.mobilePanelManpowerEl.innerHTML = manpowerPanelHtml;
  dom.leaderboardEl.innerHTML = safeValue(
    "leaderboardHtml",
    fallbackCard("Leaderboard"),
    () => leaderboardHtml(state.leaderboard, state.seasonVictory, state.seasonWinner)
  );
  dom.mobileLeaderboardEl.innerHTML = dom.leaderboardEl.innerHTML;
  dom.feedEl.innerHTML = safeValue("feedHtml", fallbackCard("Activity feed"), () =>
    feedHtml(state.feed, {
      visible: debugEnabledForAccount(),
      enabled: debugTileLoggingEnabled(),
      selectedTileKey: state.selected ? `${state.selected.x},${state.selected.y}` : undefined
    })
  );
  dom.mobileFeedEl.innerHTML = dom.feedEl.innerHTML;
  const feedFocusButtons = dom.hud.querySelectorAll("[data-feed-focus-x][data-feed-focus-y]") as NodeListOf<HTMLButtonElement>;
  feedFocusButtons.forEach((btn: HTMLButtonElement) => {
    btn.onclick = () => {
      const x = Number(btn.dataset.feedFocusX);
      const y = Number(btn.dataset.feedFocusY);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      state.camX = wrapX(x);
      state.camY = wrapY(y);
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

  dom.panelDomainsContentEl.innerHTML = `
    <div id="domains-overview-content">
      ${safeValue("renderDomainProgressCard", fallbackCard("Sharding progress"), () => deps.renderDomainProgressCard())}
      ${safeValue("renderDomainChoiceGrid", fallbackCard("Sharding choices"), () => deps.renderDomainChoiceGrid())}
      ${safeValue("domainOwnedHtml", fallbackCard("Owned shards"), () => deps.domainOwnedHtml(state.domainCatalog, state.domainIds))}
      <div class="card auth-settings-card">
        <p>Signed in as ${state.authUserLabel || "Guest"}.</p>
        <p class="client-build-version">Client build ${CLIENT_BUILD_VERSION}</p>
        <button id="auth-logout" class="panel-btn" ${state.authReady ? "" : "disabled"}>Log Out</button>
      </div>
    </div>
    <div id="domains-detail-content">
      ${safeValue("renderDomainDetailCard", fallbackCard("Shard detail"), () => deps.renderDomainDetailCard())}
    </div>
  `;
  dom.mobilePanelDomainsEl.innerHTML = dom.panelDomainsContentEl.innerHTML;

  const acceptButtons = dom.hud.querySelectorAll(".accept-request") as NodeListOf<HTMLButtonElement>;
  acceptButtons.forEach((btn: HTMLButtonElement) => {
    btn.onclick = () => {
      const id = btn.dataset.requestId;
      if (!id) return;
      sendGameMessage({ type: "ALLIANCE_ACCEPT", requestId: id }, "Finish sign-in before responding to alliance requests.");
    };
  });
  const rejectButtons = dom.hud.querySelectorAll(".reject-request") as NodeListOf<HTMLButtonElement>;
  rejectButtons.forEach((btn: HTMLButtonElement) => {
    btn.onclick = () => {
      const id = btn.dataset.requestId;
      if (!id) return;
      sendGameMessage({ type: "ALLIANCE_REJECT", requestId: id }, "Finish sign-in before responding to alliance requests.");
    };
  });
  const acceptTruceButtons = dom.hud.querySelectorAll(".accept-truce") as NodeListOf<HTMLButtonElement>;
  acceptTruceButtons.forEach((btn: HTMLButtonElement) => {
    btn.onclick = () => {
      const id = btn.dataset.truceRequestId;
      if (!id) return;
      sendGameMessage({ type: "TRUCE_ACCEPT", requestId: id }, "Finish sign-in before responding to truces.");
    };
  });
  const rejectTruceButtons = dom.hud.querySelectorAll(".reject-truce") as NodeListOf<HTMLButtonElement>;
  rejectTruceButtons.forEach((btn: HTMLButtonElement) => {
    btn.onclick = () => {
      const id = btn.dataset.truceRequestId;
      if (!id) return;
      sendGameMessage({ type: "TRUCE_REJECT", requestId: id }, "Finish sign-in before responding to truces.");
    };
  });

  const authLogoutBtn = document.querySelector("#auth-logout") as HTMLButtonElement | null;
  if (authLogoutBtn) {
    authLogoutBtn.onclick = async () => {
      if (!firebaseAuth) return;
      await signOut(firebaseAuth);
      window.location.reload();
    };
  }
  const economyFocusButtons = dom.hud.querySelectorAll("[data-economy-focus]") as NodeListOf<HTMLButtonElement>;
  economyFocusButtons.forEach((btn: HTMLButtonElement) => {
    btn.onclick = () => {
      const focus = btn.dataset.economyFocus as EconomyFocusKey | undefined;
      if (!focus) return;
      state.economyFocus = focus;
      renderClientHud(deps);
    };
  });

  renderClientChangelogOverlay({
    state,
    changelogOverlayEl: dom.changelogOverlayEl,
    buildVersion: CLIENT_BUILD_VERSION,
    persistSeenVersion: storageSet,
    renderHud: () => renderClientHud(deps)
  });

  const canShowGuide = state.guide.open && state.authSessionReady && !state.profileSetupRequired && !state.changelog.open;
  dom.guideOverlayEl.style.display = canShowGuide ? "grid" : "none";
  if (canShowGuide) {
    const step = guideSteps[Math.min(state.guide.stepIndex, guideSteps.length - 1)]!;
    dom.guideOverlayEl.innerHTML = `
      <div class="guide-backdrop" id="guide-backdrop"></div>
      <div class="guide-modal card" role="dialog" aria-modal="true" aria-labelledby="guide-title">
        <button id="guide-close" class="guide-close-btn" type="button" aria-label="Close guide">×</button>
        <div class="guide-modal-scroll">
          <div class="guide-kicker">Step ${state.guide.stepIndex + 1} of ${guideSteps.length}</div>
          <h2 id="guide-title" class="guide-title">${step.title}</h2>
          <p class="guide-body">${step.body}</p>
          <div class="guide-progress">
            ${guideSteps.map((_, index) => `<span class="guide-progress-segment${index <= state.guide.stepIndex ? " is-active" : ""}"></span>`).join("")}
          </div>
          <div class="guide-actions">
            <button id="guide-skip" class="guide-link-btn" type="button">Skip Tutorial</button>
            <div class="guide-actions-right">
              ${state.guide.stepIndex > 0 ? '<button id="guide-back" class="panel-btn guide-secondary-btn" type="button">Back</button>' : ""}
              <button id="guide-next" class="panel-btn guide-primary-btn" type="button">${state.guide.stepIndex === guideSteps.length - 1 ? "Get Started" : "Next"}</button>
            </div>
          </div>
        </div>
      </div>
    `;
    const closeGuide = (markComplete: boolean): void => {
      state.guide.open = false;
      if (markComplete) {
        state.guide.completed = true;
        storageSet(GUIDE_STORAGE_KEY, "1");
      }
      renderClientHud(deps);
    };
    const guideCloseBtn = dom.guideOverlayEl.querySelector("#guide-close") as HTMLButtonElement | null;
    const guideBackdropBtn = dom.guideOverlayEl.querySelector("#guide-backdrop") as HTMLDivElement | null;
    const guideSkipBtn = dom.guideOverlayEl.querySelector("#guide-skip") as HTMLButtonElement | null;
    const guideBackBtn = dom.guideOverlayEl.querySelector("#guide-back") as HTMLButtonElement | null;
    const guideNextBtn = dom.guideOverlayEl.querySelector("#guide-next") as HTMLButtonElement | null;
    if (guideCloseBtn) guideCloseBtn.onclick = () => closeGuide(true);
    if (guideBackdropBtn) guideBackdropBtn.onclick = () => closeGuide(true);
    if (guideSkipBtn) guideSkipBtn.onclick = () => closeGuide(true);
    if (guideBackBtn) {
      guideBackBtn.onclick = () => {
        state.guide.stepIndex = Math.max(0, state.guide.stepIndex - 1);
        renderClientHud(deps);
      };
    }
    if (guideNextBtn) {
      guideNextBtn.onclick = () => {
        if (state.guide.stepIndex >= guideSteps.length - 1) {
          closeGuide(true);
          return;
        }
        state.guide.stepIndex += 1;
        renderClientHud(deps);
      };
    }
  } else if (dom.guideOverlayEl.innerHTML) {
    dom.guideOverlayEl.innerHTML = "";
  }

  syncAuthOverlay();
  deps.renderMobilePanels();
};

export const resizeClientViewport = (deps: { dom: Pick<ClientDom, "canvas">; viewportSize: () => { width: number; height: number } }): void => {
  const { width, height } = deps.viewportSize();
  deps.dom.canvas.width = width;
  deps.dom.canvas.height = height;
};
