// Manifest panel tabs and view toggle.
//
// Tabs: "Available" (what you can take next) and "Owned" (the Manifests you
// hold plus the bonuses they give you). The view toggle in the panel header
// switches between those list tabs and the full tree (the existing
// techTreeExpanded mode); the tree already shows every Manifest, so the tabs
// step aside while it is open and leaving it returns to the same tab.
//
// Which sections show is pure CSS keyed off the panel's data-manifest-tab
// attribute (client-manifest-tabs.css); this module only syncs state onto the
// panel and wires the buttons.
import type { ClientState } from "../client-state/client-state.js";

export type ManifestTab = ClientState["techSection"];

export type ManifestTabsDom = {
  panelTechEl: HTMLElement;
  techViewToggleEl: HTMLButtonElement;
};

type ManifestTabsState = Pick<ClientState, "techSection" | "techTreeExpanded">;

export const manifestTabLabel = (tab: ManifestTab, ownedCount: number): string =>
  tab === "owned" ? `Owned (${ownedCount})` : "Available";

// The toggle names the view it switches to.
export const manifestViewToggleLabel = (treeExpanded: boolean): string => (treeExpanded ? "List view" : "Tree view");

const tabFromButton = (btn: HTMLElement): ManifestTab => (btn.dataset.manifestTabBtn === "owned" ? "owned" : "available");

export const syncManifestPanelTabs = (
  dom: ManifestTabsDom,
  state: ManifestTabsState,
  ownedCount: number,
  rerender: () => void
): void => {
  const panel = dom.panelTechEl;
  panel.dataset.manifestTab = state.techTreeExpanded ? "tree" : state.techSection;
  panel.classList.toggle("tech-tree-expanded", state.techTreeExpanded);
  panel.querySelectorAll<HTMLButtonElement>("[data-manifest-tab-btn]").forEach((btn) => {
    const tab = tabFromButton(btn);
    const active = tab === state.techSection;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", String(active));
    btn.textContent = manifestTabLabel(tab, ownedCount);
    btn.onclick = () => {
      if (state.techSection === tab) return;
      state.techSection = tab;
      rerender();
    };
  });
  const toggle = dom.techViewToggleEl;
  toggle.textContent = manifestViewToggleLabel(state.techTreeExpanded);
  toggle.setAttribute("aria-pressed", String(state.techTreeExpanded));
  toggle.onclick = () => {
    state.techTreeExpanded = !state.techTreeExpanded;
    rerender();
  };
};
