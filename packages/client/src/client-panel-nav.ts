import type { ClientState } from "./client-state.js";

export const isMobile = (): boolean => window.matchMedia("(max-width: 900px)").matches;

export const panelTitle = (panel: NonNullable<ClientState["activePanel"]>): string => {
  if (panel === "missions") return "Missions";
  if (panel === "tech") return "Technology Tree";
  if (panel === "domains") return "Sharding";
  if (panel === "alliance") return "Alliances";
  if (panel === "economy") return "Economy";
  if (panel === "manpower") return "Manpower";
  if (panel === "defensibility") return "Defensibility";
  if (panel === "leaderboard") return "Leaderboard";
  if (panel === "feed") return "Activity Feed";
  return "Player Identity";
};

export const panelToMobile = (panel: NonNullable<ClientState["activePanel"]>): ClientState["mobilePanel"] => {
  if (panel === "missions") return "missions";
  if (panel === "tech") return "tech";
  if (panel === "domains") return "domains";
  if (panel === "alliance") return "social";
  if (panel === "defensibility") return "defensibility";
  if (panel === "economy") return "economy";
  if (panel === "manpower") return "manpower";
  return "intel";
};

export const mobileNavLabelHtml = (
  panel: ClientState["mobilePanel"],
  opts?: { techReady?: boolean; attackAlertUnread?: boolean }
): string => {
  if (panel === "core") return '<span class="tab-icon">⌂</span>';
  if (panel === "missions") return '<span class="tab-icon">◎</span>';
  if (panel === "tech") {
    return opts?.techReady
      ? '<span class="tab-icon">⚡</span><span class="tech-ready-dot" aria-label="upgrade available"></span>'
      : '<span class="tab-icon">⚡</span>';
  }
  if (panel === "domains") return '<span class="tab-icon">✦</span>';
  if (panel === "social") return '<span class="tab-icon">👥</span>';
  return opts?.attackAlertUnread
    ? '<span class="tab-icon">🔔</span><span class="attack-alert-dot" aria-label="under attack">🔥</span>'
    : '<span class="tab-icon">🔔</span>';
};

export const viewportSize = (): { width: number; height: number } => {
  const vv = window.visualViewport;
  if (vv) return { width: Math.round(vv.width), height: Math.round(vv.height) };
  return { width: window.innerWidth, height: window.innerHeight };
};

export const setActivePanel = (
  state: Pick<ClientState, "activePanel" | "mobilePanel" | "unreadAttackAlerts">,
  panel: ClientState["activePanel"],
  deps: {
    renderMobilePanels: () => void;
  }
): void => {
  if (state.activePanel === panel) {
    state.activePanel = null;
    deps.renderMobilePanels();
    return;
  }
  state.activePanel = panel;
  if (panel === "feed") state.unreadAttackAlerts = 0;
  if (isMobile() && panel) {
    state.mobilePanel = panelToMobile(panel);
    if (state.mobilePanel === "intel") state.unreadAttackAlerts = 0;
  }
  deps.renderMobilePanels();
};

export const renderMobilePanels = (
  state: Pick<ClientState, "activePanel" | "mobilePanel" | "techTreeExpanded" | "domainDetailOpen">,
  deps: {
    hud: HTMLElement;
    panelActionButtons: NodeListOf<HTMLButtonElement>;
    sidePanelBodyEl: HTMLElement;
    sidePanelEl: HTMLElement;
    panelTitleEl: HTMLElement;
    mobileSheetEl: HTMLElement;
    mobileCoreEl: HTMLElement;
    mobilePanelCoreEl: HTMLElement;
    mobilePanelMissionsEl: HTMLElement;
    mobilePanelTechEl: HTMLElement;
    mobilePanelDomainsEl: HTMLElement;
    mobilePanelSocialEl: HTMLElement;
    mobilePanelDefensibilityEl: HTMLElement;
    mobilePanelEconomyEl: HTMLElement;
    mobilePanelManpowerEl: HTMLElement;
    mobilePanelIntelEl: HTMLElement;
    mobileSheetHeadEl: HTMLElement;
  }
): void => {
  const nav = deps.hud.querySelector<HTMLDivElement>("#mobile-nav");
  if (!nav) return;

  deps.panelActionButtons.forEach((btn) => {
    const panel = btn.dataset.panel as ClientState["activePanel"];
    btn.classList.toggle("active", panel === state.activePanel);
  });

  const sideSections = deps.sidePanelBodyEl.querySelectorAll<HTMLElement>(".panel-body");
  sideSections.forEach((section) => {
    section.style.display = section.id === `panel-${state.activePanel}` ? "grid" : "none";
  });
  deps.sidePanelEl.classList.toggle("tech-panel-active", state.activePanel === "tech" && state.techTreeExpanded);
  deps.sidePanelEl.classList.toggle("domain-panel-active", state.activePanel === "domains" && state.domainDetailOpen && !isMobile());
  deps.mobileSheetEl.classList.toggle("tech-panel-active", state.mobilePanel === "tech" && state.techTreeExpanded);

  if (!isMobile()) {
    nav.style.display = "none";
    deps.mobileSheetEl.style.display = "none";
    deps.mobileCoreEl.style.display = "none";
    deps.sidePanelEl.style.display = state.activePanel ? "grid" : "none";
    if (state.activePanel) deps.panelTitleEl.textContent = panelTitle(state.activePanel);
    return;
  }

  deps.sidePanelEl.style.display = "none";
  nav.style.display = "grid";
  deps.mobileCoreEl.style.display = state.mobilePanel === "core" ? "grid" : "none";
  deps.mobileSheetEl.style.display = state.mobilePanel === "core" ? "none" : "grid";

  const mobileSections: Array<[HTMLElement, ClientState["mobilePanel"]]> = [
    [deps.mobilePanelCoreEl, "core"],
    [deps.mobilePanelMissionsEl, "missions"],
    [deps.mobilePanelTechEl, "tech"],
    [deps.mobilePanelDomainsEl, "domains"],
    [deps.mobilePanelSocialEl, "social"],
    [deps.mobilePanelDefensibilityEl, "defensibility"],
    [deps.mobilePanelEconomyEl, "economy"],
    [deps.mobilePanelManpowerEl, "manpower"],
    [deps.mobilePanelIntelEl, "intel"]
  ];
  for (const [element, panel] of mobileSections) {
    element.style.display = panel === state.mobilePanel ? "grid" : "none";
  }

  if (state.mobilePanel === "missions") deps.mobileSheetHeadEl.textContent = "Missions";
  else if (state.mobilePanel === "tech") deps.mobileSheetHeadEl.textContent = "Technology Tree";
  else if (state.mobilePanel === "domains") deps.mobileSheetHeadEl.textContent = "Sharding";
  else if (state.mobilePanel === "social") deps.mobileSheetHeadEl.textContent = "Alliances";
  else if (state.mobilePanel === "defensibility") deps.mobileSheetHeadEl.textContent = "Defensibility";
  else if (state.mobilePanel === "economy") deps.mobileSheetHeadEl.textContent = "Economy";
  else if (state.mobilePanel === "manpower") deps.mobileSheetHeadEl.textContent = "Manpower";
  else if (state.mobilePanel === "intel") deps.mobileSheetHeadEl.textContent = "Intel";
  else deps.mobileSheetHeadEl.textContent = "Core";

  const buttons = nav.querySelectorAll<HTMLButtonElement>("button[data-mobile-panel]");
  buttons.forEach((button) => {
    const panel = button.dataset.mobilePanel as ClientState["mobilePanel"] | undefined;
    if (panel) button.innerHTML = mobileNavLabelHtml(panel);
    button.classList.toggle("active", panel === state.mobilePanel);
  });
};

export const bindTechTreeDragScroll = (
  state: Pick<ClientState, "techTreeScrollLeft" | "techTreeScrollTop">,
  hud: HTMLElement
): void => {
  const scrollRegions = hud.querySelectorAll<HTMLElement>("[data-tech-tree-scroll]");
  scrollRegions.forEach((region) => {
    if (region.dataset.dragBound === "1") return;
    region.dataset.dragBound = "1";
    region.scrollLeft = state.techTreeScrollLeft;
    region.scrollTop = state.techTreeScrollTop;
    let pointerId = -1;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;
    const release = (): void => {
      if (pointerId !== -1) {
        try {
          region.releasePointerCapture(pointerId);
        } catch {
          // Ignore if pointer capture was not established.
        }
      }
      pointerId = -1;
      region.classList.remove("dragging");
    };
    region.onpointerdown = (event) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      const target = event.target;
      if (event.pointerType === "mouse" && target instanceof Element && target.closest("[data-tech-card]")) return;
      pointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      startLeft = region.scrollLeft;
      startTop = region.scrollTop;
      region.classList.add("dragging");
      region.setPointerCapture(event.pointerId);
      if (event.pointerType !== "mouse") event.preventDefault();
    };
    region.onpointermove = (event) => {
      if (event.pointerId !== pointerId) return;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      region.scrollLeft = startLeft - dx;
      region.scrollTop = startTop - dy;
      state.techTreeScrollLeft = region.scrollLeft;
      state.techTreeScrollTop = region.scrollTop;
      if (event.pointerType !== "mouse") event.preventDefault();
    };
    region.onscroll = () => {
      state.techTreeScrollLeft = region.scrollLeft;
      state.techTreeScrollTop = region.scrollTop;
    };
    region.onpointerup = release;
    region.onpointercancel = release;
    region.onlostpointercapture = release;
  });
};
