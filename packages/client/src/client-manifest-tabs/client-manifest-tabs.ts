// Manifest panel tabs: "Available" (what you can take next), "Owned" (the
// Manifests you hold plus the bonuses they give you) and "Tree" (the full
// expanded tree). Which sections show is pure CSS keyed off the panel's
// data-manifest-tab attribute (client-manifest-tabs.css); this module only
// syncs state onto the desktop and mobile panels and wires the buttons.
//
// Tree is the existing techTreeExpanded mode, not a third techSection value:
// leaving it returns to whichever list tab you pick.
import type { ClientState } from "../client-state/client-state.js";

export type ManifestTab = ClientState["techSection"] | "tree";

export type ManifestTabsDom = {
  panelTechEl: HTMLElement;
  mobilePanelTechEl: HTMLElement;
};

type ManifestTabsState = Pick<ClientState, "techSection" | "techTreeExpanded">;

export const activeManifestTab = (state: ManifestTabsState): ManifestTab => (state.techTreeExpanded ? "tree" : state.techSection);

export const manifestTabLabel = (tab: ManifestTab, ownedCount: number): string =>
  tab === "owned" ? `Owned (${ownedCount})` : tab === "tree" ? "Tree" : "Available";

const tabFromButton = (btn: HTMLElement): ManifestTab => {
  const tab = btn.dataset.manifestTabBtn;
  return tab === "owned" || tab === "tree" ? tab : "available";
};

const selectManifestTab = (state: ManifestTabsState, tab: ManifestTab): void => {
  state.techTreeExpanded = tab === "tree";
  if (tab !== "tree") state.techSection = tab;
};

export const syncManifestPanelTabs = (
  dom: ManifestTabsDom,
  state: ManifestTabsState,
  ownedCount: number,
  rerender: () => void
): void => {
  const active = activeManifestTab(state);
  for (const panel of [dom.panelTechEl, dom.mobilePanelTechEl]) {
    panel.dataset.manifestTab = active;
    panel.classList.toggle("tech-tree-expanded", state.techTreeExpanded);
    panel.querySelectorAll<HTMLButtonElement>("[data-manifest-tab-btn]").forEach((btn) => {
      const tab = tabFromButton(btn);
      btn.classList.toggle("active", tab === active);
      btn.setAttribute("aria-selected", String(tab === active));
      btn.textContent = manifestTabLabel(tab, ownedCount);
      btn.onclick = () => {
        if (activeManifestTab(state) === tab) return;
        selectManifestTab(state, tab);
        rerender();
      };
    });
  }
};
