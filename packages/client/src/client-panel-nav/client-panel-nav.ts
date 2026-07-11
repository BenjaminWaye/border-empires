import type { ClientState } from "../client-state/client-state.js";

export const isMobile = (): boolean => window.matchMedia("(max-width: 900px)").matches;

// Touch-capable device detection for performance-sensitive decisions (distinct from the viewport-width isMobile check).
export const isMobileDevice = (): boolean =>
  typeof window !== "undefined" &&
  (navigator.maxTouchPoints > 0 || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent));

export const panelTitle = (panel: NonNullable<ClientState["activePanel"]>): string => {
  if (panel === "tech") return "Technology Tree";
  if (panel === "domains") return "Sharding";
  if (panel === "alliance") return "Alliances";
  if (panel === "economy") return "Economy";
  if (panel === "manpower") return "Manpower";
  if (panel === "development") return "Development";
  if (panel === "defensibility") return "Empire Integrity";
  if (panel === "leaderboard") return "Leaderboard";
  if (panel === "feed") return "Activity Feed";
  if (panel === "settings") return "Settings";
  return "Player Identity";
};

export const panelToMobile = (panel: NonNullable<ClientState["activePanel"]>): ClientState["mobilePanel"] => {
  if (panel === "tech") return "tech";
  if (panel === "domains") return "domains";
  if (panel === "alliance") return "social";
  if (panel === "defensibility") return "defensibility";
  if (panel === "economy") return "economy";
  if (panel === "manpower") return "manpower";
  if (panel === "development") return "development";
  if (panel === "leaderboard") return "leaderboard";
  if (panel === "settings") return "settings";
  return "feed";
};

export const mobileNavLabelHtml = (
  panel: ClientState["mobilePanel"],
  opts?: { techReady?: boolean; attackAlertUnread?: boolean; feedUnreadCount?: number }
): string => {
  if (panel === "core") return '<span class="tab-icon">⌂</span>';
  if (panel === "tech") {
    return opts?.techReady
      ? '<span class="tab-icon">⚡</span><span class="tech-ready-dot" aria-label="upgrade available"></span>'
      : '<span class="tab-icon">⚡</span>';
  }
  if (panel === "domains") return '<span class="tab-icon">✦</span>';
  if (panel === "social") return '<span class="tab-icon">👥</span>';
  if (panel === "leaderboard") return '<span class="tab-icon">🏆</span>';
  if (panel === "settings") return '<span class="tab-icon">⚙</span>';
  const feedUnreadCount = opts?.feedUnreadCount ?? 0;
  return opts?.attackAlertUnread || feedUnreadCount > 0
    ? `<span class="tab-icon">🔔</span><span class="feed-alert-dot" aria-label="${opts?.attackAlertUnread ? "under attack" : "new activity"}">${opts?.attackAlertUnread ? "!" : Math.min(9, feedUnreadCount)}</span>`
    : '<span class="tab-icon">🔔</span>';
};

export const viewportSize = (): { width: number; height: number } => {
  const vv = window.visualViewport;
  if (vv) return { width: Math.round(vv.width), height: Math.round(vv.height) };
  return { width: window.innerWidth, height: window.innerHeight };
};

export const setActivePanel = (
  state: Pick<ClientState, "activePanel" | "mobilePanel" | "unreadAttackAlerts" | "feedUnreadCount" | "feedAttentionUntil">,
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
  if (panel === "feed") {
    state.unreadAttackAlerts = 0;
    state.feedUnreadCount = 0;
    state.feedAttentionUntil = 0;
  }
  if (isMobile() && panel) {
    state.mobilePanel = panelToMobile(panel);
    if (state.mobilePanel === "feed") {
      state.unreadAttackAlerts = 0;
      state.feedUnreadCount = 0;
      state.feedAttentionUntil = 0;
    }
  }
  deps.renderMobilePanels();
};

export const closeActivePanel = (state: Pick<ClientState, "activePanel" | "domainDetailOpen">): void => {
  if (state.activePanel === "domains" && state.domainDetailOpen) {
    state.domainDetailOpen = false;
    return;
  }
  state.activePanel = null;
};

export const renderMobilePanels = (
  state: Pick<
    ClientState,
    "activePanel" | "mobilePanel" | "techTreeExpanded" | "domainDetailOpen" | "unreadAttackAlerts" | "feedUnreadCount"
  >,
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
    mobilePanelDevelopmentEl: HTMLElement;
    mobilePanelLeaderboardEl: HTMLElement;
    mobilePanelFeedEl: HTMLElement;
    mobilePanelSettingsEl: HTMLElement;
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
    [deps.mobilePanelTechEl, "tech"],
    [deps.mobilePanelDomainsEl, "domains"],
    [deps.mobilePanelSocialEl, "social"],
    [deps.mobilePanelDefensibilityEl, "defensibility"],
    [deps.mobilePanelEconomyEl, "economy"],
    [deps.mobilePanelManpowerEl, "manpower"],
    [deps.mobilePanelDevelopmentEl, "development"],
    [deps.mobilePanelLeaderboardEl, "leaderboard"],
    [deps.mobilePanelFeedEl, "feed"],
    [deps.mobilePanelSettingsEl, "settings"]
  ];
  for (const [element, panel] of mobileSections) {
    element.style.display = panel === state.mobilePanel ? "grid" : "none";
  }

  if (state.mobilePanel === "tech") deps.mobileSheetHeadEl.textContent = "Technology Tree";
  else if (state.mobilePanel === "domains") deps.mobileSheetHeadEl.textContent = "Sharding";
  else if (state.mobilePanel === "social") deps.mobileSheetHeadEl.textContent = "Alliances";
  else if (state.mobilePanel === "defensibility") deps.mobileSheetHeadEl.textContent = "Empire Integrity";
  else if (state.mobilePanel === "economy") deps.mobileSheetHeadEl.textContent = "Economy";
  else if (state.mobilePanel === "manpower") deps.mobileSheetHeadEl.textContent = "Manpower";
  else if (state.mobilePanel === "development") deps.mobileSheetHeadEl.textContent = "Development";
  else if (state.mobilePanel === "leaderboard") deps.mobileSheetHeadEl.textContent = "Leaderboard";
  else if (state.mobilePanel === "feed") deps.mobileSheetHeadEl.textContent = "Activity Feed";
  else if (state.mobilePanel === "settings") deps.mobileSheetHeadEl.textContent = "Settings";
  else deps.mobileSheetHeadEl.textContent = "Core";

  const buttons = nav.querySelectorAll<HTMLButtonElement>("button[data-mobile-panel]");
  buttons.forEach((button) => {
    const panel = button.dataset.mobilePanel as ClientState["mobilePanel"] | undefined;
    if (panel) {
      button.innerHTML = mobileNavLabelHtml(panel, {
        attackAlertUnread: state.unreadAttackAlerts > 0,
        feedUnreadCount: state.feedUnreadCount
      });
    }
    button.classList.toggle("active", panel === state.mobilePanel);
  });
};

export const bindTechTreeDragScroll = (
  state: Pick<ClientState, "techTreeScrollLeft" | "techTreeScrollTop" | "techTreeZoom">,
  hud: HTMLElement
): void => {
  const clampZoom = (value: number): number => Math.max(0.7, Math.min(1.6, Number(value.toFixed(2))));
  const applyZoom = (region: HTMLElement, zoom: number): void => {
    const stage = region.querySelector<HTMLElement>("[data-tech-tree-stage]");
    const canvas = stage?.querySelector<HTMLElement>(".tech-tree-graph-canvas");
    if (!stage || !canvas) return;
    const intrinsicWidth = Number(canvas.dataset.stageWidth ?? canvas.style.width.replace("px", ""));
    const intrinsicHeight = Number(canvas.dataset.stageHeight ?? canvas.style.height.replace("px", ""));
    const viewportHeight = Math.max(region.clientHeight, intrinsicHeight * zoom);
    stage.style.width = `${Math.round(intrinsicWidth * zoom)}px`;
    stage.style.height = `${Math.round(intrinsicHeight * zoom)}px`;
    stage.style.minHeight = `${Math.round(viewportHeight)}px`;
    canvas.style.transform = `scale(${zoom})`;
    const shell = region.closest<HTMLElement>("[data-tech-tree-shell]");
    const readout = shell?.querySelector<HTMLElement>("[data-tech-tree-zoom='reset']");
    if (readout) readout.textContent = `${Math.round(zoom * 100)}%`;
  };
  const syncZoomAcrossRegions = (): void => {
    const regions = hud.querySelectorAll<HTMLElement>("[data-tech-tree-scroll]");
    regions.forEach((region) => applyZoom(region, state.techTreeZoom));
  };
  const zoomRegion = (region: HTMLElement, direction: "in" | "out" | "reset"): void => {
    const previous = state.techTreeZoom;
    const next =
      direction === "reset" ? 1 : direction === "in" ? clampZoom(previous + 0.1) : clampZoom(previous - 0.1);
    if (Math.abs(next - previous) < 0.001) return;
    const centerX = region.scrollLeft + region.clientWidth / 2;
    const centerY = region.scrollTop + region.clientHeight / 2;
    state.techTreeZoom = next;
    syncZoomAcrossRegions();
    const ratio = next / previous;
    region.scrollLeft = Math.max(0, centerX * ratio - region.clientWidth / 2);
    region.scrollTop = Math.max(0, centerY * ratio - region.clientHeight / 2);
    state.techTreeScrollLeft = region.scrollLeft;
    state.techTreeScrollTop = region.scrollTop;
  };
  const scrollRegions = hud.querySelectorAll<HTMLElement>("[data-tech-tree-scroll]");
  scrollRegions.forEach((region) => {
    if (region.dataset.dragBound === "1") return;
    region.dataset.dragBound = "1";
    region.scrollLeft = state.techTreeScrollLeft;
    region.scrollTop = state.techTreeScrollTop;
    applyZoom(region, state.techTreeZoom);
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
      if (target instanceof Element && target.closest("[data-tech-card], [data-tech-tree-zoom]")) return;
      pointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      startLeft = region.scrollLeft;
      startTop = region.scrollTop;
      region.classList.add("dragging");
      region.setPointerCapture(event.pointerId);
      event.preventDefault();
    };
    region.onpointermove = (event) => {
      if (event.pointerId !== pointerId) return;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      region.scrollLeft = startLeft - dx;
      region.scrollTop = startTop - dy;
      state.techTreeScrollLeft = region.scrollLeft;
      state.techTreeScrollTop = region.scrollTop;
      event.preventDefault();
    };
    region.onscroll = () => {
      state.techTreeScrollLeft = region.scrollLeft;
      state.techTreeScrollTop = region.scrollTop;
    };
    region.onwheel = (event) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      zoomRegion(region, event.deltaY < 0 ? "in" : "out");
    };
    region.onpointerup = release;
    region.onpointercancel = release;
    region.onlostpointercapture = release;
    region.onselectstart = (event) => {
      if (pointerId === -1) return;
      event.preventDefault();
    };
    region.ondragstart = (event) => {
      if (pointerId === -1) return;
      event.preventDefault();
    };
  });
  const zoomButtons = hud.querySelectorAll<HTMLButtonElement>("[data-tech-tree-zoom]");
  zoomButtons.forEach((button) => {
    if (button.dataset.zoomBound === "1") return;
    button.dataset.zoomBound = "1";
    button.onclick = () => {
      const direction = button.dataset.techTreeZoom;
      if (direction !== "in" && direction !== "out" && direction !== "reset") return;
      const region = button.closest<HTMLElement>("[data-tech-tree-shell]")?.querySelector<HTMLElement>("[data-tech-tree-scroll]");
      if (!region) return;
      zoomRegion(region, direction);
    };
  });
  syncZoomAcrossRegions();
};
