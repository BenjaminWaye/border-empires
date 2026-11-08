// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import { renderAfcUpgradePanels } from "./client-afc-upgrades.js";

describe("single-level AFC upgrade management", () => {
  beforeEach(() => { document.body.innerHTML = '<div id="panel"></div>'; });
  const setup = () => {
    const state = createInitialState();
    state.me = "me"; state.techIds = ["trade"]; state.gold = 40;
    state.domainCatalog = ["first", "second"].map(id => ({
      id, name: id, tier: 1, requiresTechId: "trade", description: "The headquarters coordinates this programme.",
      mods: {}, effects: { settlementSpeedMult: 2 }, requirements: { gold: 40, resources: {}, canResearch: true }
    }));
    state.domainChoices = ["first", "second"];
    const panel = document.getElementById("panel")!;
    const install = vi.fn();
    renderAfcUpgradePanels(state, panel, install);
    return { state, panel, install };
  };
  it("shows inline details without a sub-tab bar or a second screen", () => {
    const { panel, install } = setup();
    expect(panel.querySelector('[role="tablist"]')).toBeNull();
    expect(panel.querySelector(".afc-upgrade-detail")).toBeNull();
    panel.querySelector<HTMLButtonElement>('[data-afc-upgrade-card="first"]')!.click();
    expect(panel.querySelector('[data-afc-upgrade-card="first"]')?.getAttribute("aria-expanded")).toBe("true");
    expect(panel.querySelectorAll(".afc-upgrade-option")).toHaveLength(2);
    expect(panel.querySelector(".afc-upgrade-detail")?.parentElement?.contains(panel.querySelector('[data-afc-upgrade-card="first"]'))).toBe(true);
    expect(install).not.toHaveBeenCalled();
    panel.querySelector<HTMLButtonElement>('[data-domain-unlock="first"]')!.click();
    expect(install).toHaveBeenCalledTimes(1);
    expect(install).toHaveBeenCalledWith("first");
  });
  it("shows current choices directly without tier browsing or a repeated panel title", () => {
    const { panel } = setup();
    for (const root of [panel]) {
      expect(root.querySelector("select, [data-afc-upgrade-step], [role=tablist]")).toBeNull();
      expect(Array.from(root.querySelectorAll("h1, h2, h3")).some(heading => heading.textContent === "AFC Upgrades")).toBe(false);
      expect(root.querySelectorAll(".afc-upgrade-card")).toHaveLength(2);
      expect(root.querySelector(".afc-upgrade-history")).toBeNull();
    }
  });
  it("lists installed upgrades by tier above only the earliest current choices", () => {
    const { state, panel, install } = setup();
    state.domainCatalog.push({ ...state.domainCatalog[0]!, id: "next", tier: 2 },
      { ...state.domainCatalog[0]!, id: "third", tier: 3 }, { ...state.domainCatalog[0]!, id: "last", tier: 4 });
    state.domainCatalog.reverse();
    state.domainIds = ["next", "first"]; state.domainChoices = ["third", "last"];
    renderAfcUpgradePanels(state, panel, install);
    expect(Array.from(panel.querySelectorAll("[data-afc-upgrade-installed]"), row => row.getAttribute("data-afc-upgrade-installed"))).toEqual(["first", "next"]);
    expect(panel.querySelector(".afc-upgrade-history")?.textContent).toContain("Tier I");
    expect(panel.querySelector(".afc-upgrade-history")?.textContent).toContain("Tier II");
    expect(panel.querySelector(".afc-upgrades")?.children[1]).toBe(panel.querySelector(".afc-upgrade-history"));
    expect(Array.from(panel.querySelectorAll("[data-afc-upgrade-card]"), card => card.getAttribute("data-afc-upgrade-card"))).toEqual(["third"]);
  });
  it("automatically advances after server acknowledgement and moves the selection into history", () => {
    const { state, panel, install } = setup();
    state.domainCatalog.push({ ...state.domainCatalog[0]!, id: "next", tier: 2 });
    renderAfcUpgradePanels(state, panel, install);
    panel.querySelector<HTMLButtonElement>('[data-afc-upgrade-card="first"]')!.click();
    const action = panel.querySelector<HTMLButtonElement>('[data-domain-unlock="first"]')!;
    action.focus(); action.click();
    expect(panel.querySelector('[data-afc-upgrade-installed="first"]')).toBeNull();
    state.domainIds = ["first"]; state.domainChoices = ["next"];
    renderAfcUpgradePanels(state, panel, install);
    expect(panel.querySelector('[data-afc-upgrade-installed="first"]')).not.toBeNull();
    expect(panel.querySelector("[data-afc-upgrade-current-tier]")?.getAttribute("data-afc-upgrade-current-tier")).toBe("2");
    expect(panel.querySelector(".afc-upgrade-detail")).toBeNull();
    expect(document.activeElement).toBe(panel.querySelector("[data-afc-upgrade-current-tier]"));
    expect(install).toHaveBeenCalledTimes(1);
  });
  it("shows the next milestone without unavailable options, then a complete configuration", () => {
    const { state, panel, install } = setup();
    state.domainCatalog.push({ ...state.domainCatalog[0]!, id: "next", tier: 2 });
    state.domainIds = ["first"]; state.domainChoices = [];
    renderAfcUpgradePanels(state, panel, install);
    expect(panel.querySelectorAll(".afc-upgrade-card")).toHaveLength(0);
    expect(panel.textContent).toContain("Next: Upgrade II");
    state.domainIds.push("next");
    renderAfcUpgradePanels(state, panel, install);
    expect(panel.textContent).toContain("Campaign configuration complete");
    expect(panel.querySelectorAll("[data-afc-upgrade-installed]")).toHaveLength(2);
    expect(panel.querySelectorAll(".afc-upgrade-card")).toHaveLength(0);
  });
  it("keeps delegation and selection through live HUD rerenders, without launching an overlay", () => {
    const { state, panel, install } = setup();
    panel.querySelector<HTMLButtonElement>('[data-afc-upgrade-card="first"]')!.click();
    const mountedDetail = panel.querySelector(".afc-upgrade-detail");
    renderAfcUpgradePanels(state, panel, install);
    expect(panel.querySelector(".afc-upgrade-detail")).toBe(mountedDetail);
    expect(state.domainDetailOpen).toBe(false);
    panel.querySelector<HTMLButtonElement>('[data-domain-unlock="first"]')!.click();
    expect(install).toHaveBeenCalledWith("first");
    state.pendingDomainUnlockId = "first";
    renderAfcUpgradePanels(state, panel, install);
    expect(panel.querySelector<HTMLButtonElement>('[data-domain-unlock="first"]')!.disabled).toBe(true);
    expect(panel.textContent).toContain("Installing");
  });
  it("closes details with Escape and restores focus without closing the management screen", () => {
    const { panel } = setup();
    panel.querySelector<HTMLButtonElement>('[data-afc-upgrade-card="first"]')!.click();
    panel.querySelector(".afc-upgrade-detail")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(panel.querySelector(".afc-upgrade-detail")).toBeNull();
    expect(document.activeElement).toBe(panel.querySelector('[data-afc-upgrade-card="first"]'));
    expect(panel.querySelectorAll(".afc-upgrade-option")).toHaveLength(2);
  });
  it("opens the actual unclaimed tier when the catalogue arrives after the first HUD render", () => {
    const { state, panel, install } = setup();
    const catalogue = state.domainCatalog;
    state.domainCatalog = []; state.domainChoices = [];
    renderAfcUpgradePanels(state, panel, install);
    state.domainCatalog = catalogue.map(upgrade => ({ ...upgrade, tier: 3 }));
    state.domainChoices = ["first", "second"];
    renderAfcUpgradePanels(state, panel, install);
    expect(panel.querySelector("[data-afc-upgrade-current-tier]")?.getAttribute("data-afc-upgrade-current-tier")).toBe("3");
    expect(panel.querySelectorAll(".afc-upgrade-card")).toHaveLength(2);
  });
  it("resets the reviewed tier when INIT changes season or player identity", () => {
    const { state, panel, install } = setup();
    state.domainCatalog.push({ ...state.domainCatalog[0]!, id: "next", tier: 2 });
    state.domainIds = ["first"]; state.domainChoices = ["next"];
    state.joinSeasonId = "next-season";
    renderAfcUpgradePanels(state, panel, install);
    expect(panel.querySelector("[data-afc-upgrade-current-tier]")?.getAttribute("data-afc-upgrade-current-tier")).toBe("2");
    state.domainIds = []; state.domainChoices = ["first", "second"]; state.me = "another-house";
    renderAfcUpgradePanels(state, panel, install);
    expect(panel.querySelector("[data-afc-upgrade-current-tier]")?.getAttribute("data-afc-upgrade-current-tier")).toBe("1");
  });
  it("keeps legacy costs truthful and never offers an alternative from an installed tier", () => {
    const { state, panel, install } = setup();
    panel.querySelector<HTMLButtonElement>('[data-afc-upgrade-card="first"]')!.click();
    expect(panel.textContent).toContain("40 coin");
    expect(panel.textContent).not.toContain("free installation");
    state.domainIds = ["second"];
    renderAfcUpgradePanels(state, panel, install);
    expect(panel.querySelectorAll("[data-afc-upgrade-card], [data-domain-unlock]")).toHaveLength(0);
    expect(panel.querySelector('[data-afc-upgrade-installed="second"]')).not.toBeNull();
    expect(install).not.toHaveBeenCalled();
  });
});
