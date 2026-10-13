// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { syncManifestPanelTabs, type ManifestTab } from "./client-manifest-tabs.js";

const panelHtml = `
  <div class="tech-section-tabs">
    <button data-manifest-tab-btn="available">Available</button>
    <button data-manifest-tab-btn="owned">Owned</button>
    <button data-manifest-tab-btn="tree">Tree</button>
  </div>`;

const makeDom = () => {
  const panelTechEl = document.createElement("section");
  const mobilePanelTechEl = document.createElement("section");
  panelTechEl.innerHTML = panelHtml;
  mobilePanelTechEl.innerHTML = panelHtml;
  return { panelTechEl, mobilePanelTechEl };
};

const tabButton = (panel: HTMLElement, tab: ManifestTab): HTMLButtonElement =>
  panel.querySelector(`[data-manifest-tab-btn="${tab}"]`) as HTMLButtonElement;

describe("syncManifestPanelTabs", () => {
  it("marks the active tab on both panels and shows the owned count", () => {
    const dom = makeDom();
    const state = { techSection: "owned" as "available" | "owned", techTreeExpanded: false };
    syncManifestPanelTabs(dom, state, 7, () => undefined);
    for (const panel of [dom.panelTechEl, dom.mobilePanelTechEl]) {
      expect(panel.dataset.manifestTab).toBe("owned");
      expect(tabButton(panel, "owned").classList.contains("active")).toBe(true);
      expect(tabButton(panel, "owned").getAttribute("aria-selected")).toBe("true");
      expect(tabButton(panel, "available").classList.contains("active")).toBe(false);
      expect(tabButton(panel, "owned").textContent).toBe("Owned (7)");
    }
  });

  it("switches tab on click and re-renders", () => {
    const dom = makeDom();
    const state = { techSection: "available" as "available" | "owned", techTreeExpanded: false };
    const rerender = vi.fn();
    syncManifestPanelTabs(dom, state, 2, rerender);
    tabButton(dom.mobilePanelTechEl, "owned").click();
    expect(state.techSection).toBe("owned");
    expect(rerender).toHaveBeenCalledTimes(1);
    tabButton(dom.mobilePanelTechEl, "owned").click();
    expect(rerender).toHaveBeenCalledTimes(1);
  });

  it("Tree is a tab: it expands the tree and the list tabs collapse it again", () => {
    const dom = makeDom();
    const state = { techSection: "owned" as "available" | "owned", techTreeExpanded: false };
    const rerender = vi.fn();
    syncManifestPanelTabs(dom, state, 0, rerender);
    tabButton(dom.panelTechEl, "tree").click();
    expect(state.techTreeExpanded).toBe(true);
    syncManifestPanelTabs(dom, state, 0, rerender);
    expect(dom.panelTechEl.dataset.manifestTab).toBe("tree");
    expect(dom.panelTechEl.classList.contains("tech-tree-expanded")).toBe(true);
    expect(tabButton(dom.mobilePanelTechEl, "tree").classList.contains("active")).toBe(true);
    expect(tabButton(dom.mobilePanelTechEl, "owned").classList.contains("active")).toBe(false);
    tabButton(dom.panelTechEl, "available").click();
    expect(state.techTreeExpanded).toBe(false);
    expect(state.techSection).toBe("available");
    expect(rerender).toHaveBeenCalledTimes(2);
  });
});
