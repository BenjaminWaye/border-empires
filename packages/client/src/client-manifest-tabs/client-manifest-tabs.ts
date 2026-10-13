// Manifest panel tabs: "Available" (what you can take next) and "Owned"
// (the Manifests you hold plus the bonuses they give you). The Expand Tree
// toggle shares the same row. Which sections show is pure CSS keyed off the
// panel's data-manifest-tab attribute (client-manifest-tabs.css); this module
// only syncs state onto the desktop and mobile panels and wires the buttons.
import type { ClientState } from "../client-state/client-state.js";

export type ManifestTab = ClientState["techSection"];

export type ManifestTabsDom = {
  panelTechEl: HTMLElement;
  mobilePanelTechEl: HTMLElement;
  techTreeExpandToggleEl: HTMLButtonElement;
  mobileTechTreeExpandToggleEl: HTMLButtonElement;
};

export const manifestTabLabel = (tab: ManifestTab, ownedCount: number): string =>
  tab === "owned" ? `Owned (${ownedCount})` : "Available";

const tabFromButton = (btn: HTMLElement): ManifestTab => (btn.dataset.manifestTabBtn === "owned" ? "owned" : "available");

export const syncManifestPanelTabs = (
  dom: ManifestTabsDom,
  state: Pick<ClientState, "techSection" | "techTreeExpanded">,
  ownedCount: number,
  rerender: () => void
): void => {
  for (const panel of [dom.panelTechEl, dom.mobilePanelTechEl]) {
    panel.dataset.manifestTab = state.techSection;
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
  }
  for (const toggle of [dom.techTreeExpandToggleEl, dom.mobileTechTreeExpandToggleEl]) {
    toggle.textContent = state.techTreeExpanded ? "Collapse Tree" : "Expand Tree";
    toggle.classList.toggle("active", state.techTreeExpanded);
    toggle.onclick = () => {
      state.techTreeExpanded = !state.techTreeExpanded;
      rerender();
    };
  }
};
