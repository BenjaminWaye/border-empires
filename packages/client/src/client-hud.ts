import { signOut } from "firebase/auth";
import { renderCrystalAbilityInfoOverlay, type CrystalAbilityInfoKey } from "./client-crystal-ability-info.js";
import { GUIDE_AUTO_OPEN_STORAGE_KEY, GUIDE_STORAGE_KEY, guideSteps } from "./client-constants.js";
import { exposedSidesForTile, renderDefensibilityPanelHtml } from "./client-defensibility-html.js";
import { renderEconomyPanelHtml } from "./client-economy-html.js";
import type { EconomyFocusKey } from "./client-economy-model.js";
import type { ClientState, storageSet } from "./client-state.js";
import type { StructureInfoKey } from "./client-map-display.js";

type HudDeps = Record<string, any> & {
  state: ClientState;
  dom: any;
  miniMapReplayEl: HTMLDivElement;
  wsUrl: string;
  firebaseAuth?: any;
  syncAuthOverlay: () => void;
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
    passiveTileGuidanceHtml,
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
  const collectSummary = visibleCollectSummary();
  const development = developmentSlotSummary();
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
  const socialMobileBtn = dom.hud.querySelector("#mobile-nav button[data-mobile-panel='social']") as HTMLButtonElement | null;
  if (socialMobileBtn) socialMobileBtn.innerHTML = mobileNavLabelHtml("social");
  const intelMobileBtn = dom.hud.querySelector("#mobile-nav button[data-mobile-panel='intel']") as HTMLButtonElement | null;
  if (intelMobileBtn) intelMobileBtn.innerHTML = mobileNavLabelHtml("intel", { attackAlertUnread });

  if (state.crystalTargeting.active) {
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
  dom.selectedEl.innerHTML = passiveTileGuidanceHtml();
  if (state.tileActionMenu.visible && state.tileActionMenu.mode === "single" && state.tileActionMenu.currentTileKey) {
    const menuTile = state.tiles.get(state.tileActionMenu.currentTileKey);
    if (menuTile) renderTileActionMenu(tileMenuViewForTile(menuTile), state.tileActionMenu.x, state.tileActionMenu.y);
  }
  dom.hoverEl.innerHTML = "";
  dom.hoverEl.style.display = "none";

  dom.mobileCoreHelpEl.innerHTML = mobile
    ? ""
    : `
    <div class="mobile-context-block">
      <div class="mobile-context-label">Tile</div>
      <div class="mobile-context-value">${passiveTileGuidanceHtml()}</div>
    </div>
  `;
  dom.mobileCoreHelpEl.style.display = mobile ? "none" : "";

  renderCaptureProgress();
  renderShardAlert();
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
  const catalogById = new Map(state.techCatalog.map((t: any) => [t.id, t]));
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
  dom.techCurrentModsEl.innerHTML = deps.techCurrentModsHtml(state.mods, state.expandedModKey, state.modBreakdown);
  dom.mobileTechCurrentModsEl.innerHTML = deps.techCurrentModsHtml(state.mods, state.expandedModKey, state.modBreakdown);
  dom.techChoicesGridEl.innerHTML = renderTechChoiceGrid();
  dom.mobileTechChoicesGridEl.innerHTML = renderTechChoiceGrid();
  dom.techDetailCardEl.innerHTML = deps.techDetailsUseOverlay() ? deps.renderTechDetailPrompt() : deps.renderTechDetailCard();
  dom.mobileTechDetailCardEl.innerHTML = deps.renderTechDetailPrompt();
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
  dom.techOwnedEl.innerHTML = deps.techOwnedHtml(state.techCatalog, deps.effectiveOwnedTechIds(), deps.isPendingTechUnlock);
  dom.mobileTechOwnedEl.innerHTML = deps.techOwnedHtml(state.techCatalog, deps.effectiveOwnedTechIds(), deps.isPendingTechUnlock);
  dom.techChoiceDetailsEl.innerHTML = deps.renderTechChoiceDetails();
  dom.mobileTechChoiceDetailsEl.innerHTML = deps.renderTechChoiceDetails();
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
  const selectedTech = state.techCatalog.find((t: any) => t.id === state.techUiSelectedId);
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
  const domainCardButtons = dom.hud.querySelectorAll("[data-domain-card]") as NodeListOf<HTMLButtonElement>;
  domainCardButtons.forEach((btn: HTMLButtonElement) => {
    btn.onclick = () => {
      const id = btn.dataset.domainCard;
      if (!id) return;
      state.domainUiSelectedId = id;
      state.domainDetailOpen = true;
      state.techDetailOpen = false;
      renderClientHud(deps);
    };
  });
  const domainDetailCloseButtons = dom.hud.querySelectorAll("[data-domain-detail-close]") as NodeListOf<HTMLElement>;
  domainDetailCloseButtons.forEach((btn: HTMLElement) => {
    btn.onclick = () => {
      state.domainDetailOpen = false;
      renderClientHud(deps);
    };
  });
  const domainUnlockButtons = dom.hud.querySelectorAll("[data-domain-unlock]") as NodeListOf<HTMLButtonElement>;
  domainUnlockButtons.forEach((btn: HTMLButtonElement) => {
    btn.onclick = () => {
      const id = btn.dataset.domainUnlock;
      if (!id) return;
      sendGameMessage({ type: "CHOOSE_DOMAIN", domainId: id }, "Finish sign-in before choosing a domain.");
    };
  });
  dom.alliesListEl.innerHTML = `<h4>Current Allies</h4>${alliesHtml(state.allies, playerNameForOwner)}<h4>Active Truces</h4>${activeTrucesHtml(state.activeTruces, playerNameForOwner)}`;
  dom.mobileAlliesListEl.innerHTML = `<h4>Current Allies</h4>${alliesHtml(state.allies, playerNameForOwner)}<h4>Active Truces</h4>${activeTrucesHtml(state.activeTruces, playerNameForOwner)}`;
  dom.allianceRequestsEl.innerHTML = `<h4>Incoming Alliance Requests</h4>${allianceRequestsHtml(state.incomingAllianceRequests, playerNameForOwner)}<h4>Incoming Truces</h4>${truceRequestsHtml(state.incomingTruceRequests, playerNameForOwner)}`;
  dom.mobileAllianceRequestsEl.innerHTML = `<h4>Incoming Alliance Requests</h4>${allianceRequestsHtml(state.incomingAllianceRequests, playerNameForOwner)}<h4>Incoming Truces</h4>${truceRequestsHtml(state.incomingTruceRequests, playerNameForOwner)}`;
  const socialInspectCardHtml = renderSocialInspectCardHtml({
    socialInspectPlayerId: state.socialInspectPlayerId,
    leaderboardOverall: state.leaderboard.overall,
    allies: state.allies,
    playerNameForOwner
  });
  dom.alliancePlayerInspectEl.innerHTML = socialInspectCardHtml;
  dom.mobileAlliancePlayerInspectEl.innerHTML = socialInspectCardHtml;

  dom.missionsEl.innerHTML = deps.missionCardsHtml(state.missions);
  dom.mobilePanelMissionsEl.innerHTML = deps.missionCardsHtml(state.missions);
  const defensibilityPanelHtml = renderDefensibilityPanelHtml({
    tiles: state.tiles,
    me: state.me,
    defensibilityPct: state.defensibilityPct,
    showWeakDefensibility: state.showWeakDefensibility,
    keyFor,
    wrapX,
    wrapY,
    terrainAt
  });
  dom.panelDefensibilityEl.innerHTML = defensibilityPanelHtml;
  dom.mobilePanelDefensibilityEl.innerHTML = defensibilityPanelHtml;
  const weakDefButtons = dom.hud.querySelectorAll("[data-toggle-weak-def]") as NodeListOf<HTMLButtonElement>;
  weakDefButtons.forEach((btn: HTMLButtonElement) => {
    btn.onclick = () => {
      state.showWeakDefensibility = !state.showWeakDefensibility;
      const weakTileCount = [...state.tiles.values()].filter((tile: any) => {
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

  const economyPanelHtml = renderEconomyPanelHtml({
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
  });
  dom.panelEconomyEl.innerHTML = economyPanelHtml;
  dom.mobilePanelEconomyEl.innerHTML = economyPanelHtml;
  const manpowerPanelHtml = deps.renderManpowerPanelHtml({
    manpower: state.manpower,
    manpowerCap: state.manpowerCap,
    manpowerRegenPerMinute: state.manpowerRegenPerMinute,
    manpowerBreakdown: state.manpowerBreakdown,
    formatManpowerAmount,
    rateToneClass
  });
  dom.panelManpowerEl.innerHTML = manpowerPanelHtml;
  dom.mobilePanelManpowerEl.innerHTML = manpowerPanelHtml;
  dom.leaderboardEl.innerHTML = leaderboardHtml(state.leaderboard, state.seasonVictory, state.seasonWinner);
  dom.mobileLeaderboardEl.innerHTML = leaderboardHtml(state.leaderboard, state.seasonVictory, state.seasonWinner);
  dom.feedEl.innerHTML = feedHtml(state.feed);
  dom.mobileFeedEl.innerHTML = feedHtml(state.feed);

  dom.panelDomainsContentEl.innerHTML = `
    <div id="domains-overview-content">
      ${deps.renderDomainProgressCard()}
      ${deps.renderDomainChoiceGrid()}
      ${deps.domainOwnedHtml(state.domainCatalog, state.domainIds)}
      <div class="card auth-settings-card">
        <p>Signed in as ${state.authUserLabel || "Guest"}.</p>
        <button id="auth-logout" class="panel-btn" ${state.authReady ? "" : "disabled"}>Log Out</button>
      </div>
    </div>
    <div id="domains-detail-content">
      ${deps.renderDomainDetailCard()}
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
  const breakButtons = dom.hud.querySelectorAll(".break-ally") as NodeListOf<HTMLButtonElement>;
  breakButtons.forEach((btn: HTMLButtonElement) => {
    btn.onclick = () => {
      const id = btn.dataset.allyId;
      if (!id) return;
      sendGameMessage({ type: "ALLIANCE_BREAK", targetPlayerId: id }, "Finish sign-in before changing alliances.");
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
  const breakTruceButtons = dom.hud.querySelectorAll(".break-truce") as NodeListOf<HTMLButtonElement>;
  breakTruceButtons.forEach((btn: HTMLButtonElement) => {
    btn.onclick = () => {
      const id = btn.dataset.trucePlayerId;
      if (!id) return;
      sendGameMessage({ type: "TRUCE_BREAK", targetPlayerId: id }, "Finish sign-in before changing truces.");
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

  const canShowGuide = state.guide.open && state.authSessionReady && !state.profileSetupRequired;
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

export const resizeClientViewport = (deps: { dom: any; viewportSize: () => { width: number; height: number } }): void => {
  const { width, height } = deps.viewportSize();
  deps.dom.canvas.width = width;
  deps.dom.canvas.height = height;
};
