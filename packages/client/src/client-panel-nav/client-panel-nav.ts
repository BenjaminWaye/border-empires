import { markAllFeedEntriesRead } from "../client-alerts/client-alerts.js";
import type { ClientState } from "../client-state/client-state.js";
import { MANIFEST_PANEL_TITLE } from "../client-manifest-detail/client-manifest-labels.js";

import { isPhoneViewport } from "./client-phone-viewport.js";

export { isPhoneViewport };

export const panelTitle = (panel: NonNullable<ClientState["activePanel"]>): string => {
  if (panel === "tech") return MANIFEST_PANEL_TITLE;
  if (panel === "domains") return "Campaign Loadout";
  if (panel === "alliance") return "Alliances";
  if (panel === "economy") return "Economy";
  if (panel === "manpower") return "Manpower";
  if (panel === "development") return "Development";
  if (panel === "towns") return "Towns";
  if (panel === "defensibility") return "Empire Integrity";
  if (panel === "leaderboard") return "Leaderboard";
  if (panel === "feed") return "Alerts";
  if (panel === "settings") return "Settings";
  return "Player Identity";
};

export const viewportSize = (): { width: number; height: number } => {
  const vv = window.visualViewport;
  if (vv) return { width: Math.round(vv.width), height: Math.round(vv.height) };
  return { width: window.innerWidth, height: window.innerHeight };
};

export const setActivePanel = (
  state: Pick<ClientState, "activePanel" | "unreadAttackAlerts" | "feedUnreadCount" | "feedAttentionUntil" | "feed">,
  panel: ClientState["activePanel"],
  deps: {
    renderSidePanel: () => void;
  }
): void => {
  if (state.activePanel === panel) {
    state.activePanel = null;
    deps.renderSidePanel();
    return;
  }
  state.activePanel = panel;
  if (panel === "feed") {
    state.unreadAttackAlerts = 0;
    state.feedUnreadCount = 0;
    state.feedAttentionUntil = 0;
    markAllFeedEntriesRead(state);
  }
  deps.renderSidePanel();
};

export const closeActivePanel = (state: Pick<ClientState, "activePanel" | "domainDetailOpen" | "settingsSubPage">): void => {
  if (state.activePanel === "domains" && state.domainDetailOpen) {
    state.domainDetailOpen = false;
    return;
  }
  if (state.activePanel === "settings" && state.settingsSubPage) {
    state.settingsSubPage = null;
    return;
  }
  state.activePanel = null;
};

export const renderSidePanel = (
  state: Pick<ClientState, "activePanel" | "techTreeExpanded" | "domainDetailOpen">,
  deps: {
    sidePanelBodyEl: HTMLElement;
    sidePanelEl: HTMLElement;
    panelTitleEl: HTMLElement;
  }
): void => {
  const sideSections = deps.sidePanelBodyEl.querySelectorAll<HTMLElement>(".panel-body");
  sideSections.forEach((section) => {
    section.style.display = section.id === `panel-${state.activePanel}` ? "grid" : "none";
  });
  deps.sidePanelEl.classList.toggle("tech-panel-active", state.activePanel === "tech" && state.techTreeExpanded);
  deps.sidePanelEl.classList.toggle("tech-panel-open", state.activePanel === "tech"); // scopes the Manifest detail no-scroll rule
  deps.sidePanelEl.classList.toggle("domain-panel-active", state.activePanel === "domains" && state.domainDetailOpen);
  deps.sidePanelEl.classList.toggle("afc-upgrades-panel", state.activePanel === "domains");
  deps.sidePanelEl.classList.toggle("settings-panel-active", state.activePanel === "settings"); // centres Settings from its first frame
  deps.sidePanelEl.style.display = state.activePanel ? "grid" : "none";
  if (state.activePanel) deps.panelTitleEl.textContent = panelTitle(state.activePanel);
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
