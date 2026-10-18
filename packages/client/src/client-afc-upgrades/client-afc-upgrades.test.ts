// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import { renderAfcUpgradePanels } from "./client-afc-upgrades.js";

describe("single-level AFC upgrade management", () => {
  beforeEach(() => { document.body.innerHTML = '<div id="desktop"></div><div id="mobile"></div>'; });
  const setup = () => {
    const state = createInitialState();
    state.me = "me"; state.techIds = ["trade"]; state.gold = 40;
    state.domainCatalog = ["first", "second"].map(id => ({
      id, name: id, tier: 1, requiresTechId: "trade", description: "The headquarters coordinates this programme.",
      mods: {}, effects: { settlementSpeedMult: 2 }, requirements: { gold: 40, resources: {}, canResearch: true }
    }));
    state.domainChoices = ["first", "second"];
    const desktop = document.getElementById("desktop")!;
    const mobile = document.getElementById("mobile")!;
    const install = vi.fn();
    renderAfcUpgradePanels(state, desktop, mobile, install);
    return { state, desktop, mobile, install };
  };
  it("shows inline details without a sub-tab bar or a second screen", () => {
    const { mobile, install } = setup();
    expect(mobile.querySelector('[role="tablist"]')).toBeNull();
    expect(mobile.querySelector(".afc-upgrade-detail")).toBeNull();
    mobile.querySelector<HTMLButtonElement>('[data-afc-upgrade-card="first"]')!.click();
    expect(mobile.querySelector('[data-afc-upgrade-card="first"]')?.getAttribute("aria-expanded")).toBe("true");
    expect(mobile.querySelectorAll(".afc-upgrade-option")).toHaveLength(2);
    expect(mobile.querySelector(".afc-upgrade-detail")?.parentElement?.contains(mobile.querySelector('[data-afc-upgrade-card="first"]'))).toBe(true);
    expect(install).not.toHaveBeenCalled();
    mobile.querySelector<HTMLButtonElement>('[data-domain-unlock="first"]')!.click();
    expect(install).toHaveBeenCalledTimes(1);
    expect(install).toHaveBeenCalledWith("first");
  });
  it("shows current choices directly without tier browsing or a repeated panel title", () => {
    const { desktop, mobile } = setup();
    for (const root of [desktop, mobile]) {
      expect(root.querySelector("select, [data-afc-upgrade-step], [role=tablist]")).toBeNull();
      expect(Array.from(root.querySelectorAll("h1, h2, h3")).some(heading => heading.textContent === "AFC Upgrades")).toBe(false);
      expect(root.querySelectorAll(".afc-upgrade-card")).toHaveLength(2);
      expect(root.querySelector(".afc-upgrade-history")).toBeNull();
    }
  });
  it("lists installed upgrades by tier above only the earliest current choices", () => {
    const { state, desktop, mobile, install } = setup();
    state.domainCatalog.push({ ...state.domainCatalog[0]!, id: "next", tier: 2 },
      { ...state.domainCatalog[0]!, id: "third", tier: 3 }, { ...state.domainCatalog[0]!, id: "last", tier: 4 });
    state.domainCatalog.reverse();
    state.domainIds = ["next", "first"]; state.domainChoices = ["third", "last"];
    renderAfcUpgradePanels(state, desktop, mobile, install);
    expect(Array.from(mobile.querySelectorAll("[data-afc-upgrade-installed]"), row => row.getAttribute("data-afc-upgrade-installed"))).toEqual(["first", "next"]);
    expect(mobile.querySelector(".afc-upgrade-history")?.textContent).toContain("Tier I");
    expect(mobile.querySelector(".afc-upgrade-history")?.textContent).toContain("Tier II");
    expect(mobile.querySelector(".afc-upgrades")?.children[1]).toBe(mobile.querySelector(".afc-upgrade-history"));
    expect(Array.from(mobile.querySelectorAll("[data-afc-upgrade-card]"), card => card.getAttribute("data-afc-upgrade-card"))).toEqual(["third"]);
  });
  it("automatically advances after server acknowledgement and moves the selection into history", () => {
    const { state, desktop, mobile, install } = setup();
    state.domainCatalog.push({ ...state.domainCatalog[0]!, id: "next", tier: 2 });
    renderAfcUpgradePanels(state, desktop, mobile, install);
    mobile.querySelector<HTMLButtonElement>('[data-afc-upgrade-card="first"]')!.click();
    const action = mobile.querySelector<HTMLButtonElement>('[data-domain-unlock="first"]')!;
    action.focus(); action.click();
    expect(mobile.querySelector('[data-afc-upgrade-installed="first"]')).toBeNull();
    state.domainIds = ["first"]; state.domainChoices = ["next"];
    renderAfcUpgradePanels(state, desktop, mobile, install);
    expect(mobile.querySelector('[data-afc-upgrade-installed="first"]')).not.toBeNull();
    expect(mobile.querySelector("[data-afc-upgrade-current-tier]")?.getAttribute("data-afc-upgrade-current-tier")).toBe("2");
    expect(mobile.querySelector(".afc-upgrade-detail")).toBeNull();
    expect(document.activeElement).toBe(mobile.querySelector("[data-afc-upgrade-current-tier]"));
    expect(install).toHaveBeenCalledTimes(1);
  });
  it("shows the next milestone without unavailable options, then a complete configuration", () => {
    const { state, desktop, mobile, install } = setup();
    state.domainCatalog.push({ ...state.domainCatalog[0]!, id: "next", tier: 2 });
    state.domainIds = ["first"]; state.domainChoices = [];
    renderAfcUpgradePanels(state, desktop, mobile, install);
    expect(mobile.querySelectorAll(".afc-upgrade-card")).toHaveLength(0);
    expect(mobile.textContent).toContain("Next: Upgrade II");
    state.domainIds.push("next");
    renderAfcUpgradePanels(state, desktop, mobile, install);
    expect(mobile.textContent).toContain("Campaign configuration complete");
    expect(mobile.querySelectorAll("[data-afc-upgrade-installed]")).toHaveLength(2);
    expect(mobile.querySelectorAll(".afc-upgrade-card")).toHaveLength(0);
  });
  it("keeps delegation and selection through live HUD rerenders, without launching an overlay", () => {
    const { state, desktop, mobile, install } = setup();
    mobile.querySelector<HTMLButtonElement>('[data-afc-upgrade-card="first"]')!.click();
    const mountedDetail = mobile.querySelector(".afc-upgrade-detail");
    renderAfcUpgradePanels(state, desktop, mobile, install);
    expect(mobile.querySelector(".afc-upgrade-detail")).toBe(mountedDetail);
    expect(state.domainDetailOpen).toBe(false);
    mobile.querySelector<HTMLButtonElement>('[data-domain-unlock="first"]')!.click();
    expect(install).toHaveBeenCalledWith("first");
    state.pendingDomainUnlockId = "first";
    renderAfcUpgradePanels(state, desktop, mobile, install);
    expect(mobile.querySelector<HTMLButtonElement>('[data-domain-unlock="first"]')!.disabled).toBe(true);
    expect(mobile.textContent).toContain("Installing");
  });
  it("closes details with Escape and restores focus without closing the management screen", () => {
    const { mobile } = setup();
    mobile.querySelector<HTMLButtonElement>('[data-afc-upgrade-card="first"]')!.click();
    mobile.querySelector(".afc-upgrade-detail")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(mobile.querySelector(".afc-upgrade-detail")).toBeNull();
    expect(document.activeElement).toBe(mobile.querySelector('[data-afc-upgrade-card="first"]'));
    expect(mobile.querySelectorAll(".afc-upgrade-option")).toHaveLength(2);
  });
  it("opens the actual unclaimed tier when the catalogue arrives after the first HUD render", () => {
    const { state, desktop, mobile, install } = setup();
    const catalogue = state.domainCatalog;
    state.domainCatalog = []; state.domainChoices = [];
    renderAfcUpgradePanels(state, desktop, mobile, install);
    state.domainCatalog = catalogue.map(upgrade => ({ ...upgrade, tier: 3 }));
    state.domainChoices = ["first", "second"];
    renderAfcUpgradePanels(state, desktop, mobile, install);
    expect(mobile.querySelector("[data-afc-upgrade-current-tier]")?.getAttribute("data-afc-upgrade-current-tier")).toBe("3");
    expect(mobile.querySelectorAll(".afc-upgrade-card")).toHaveLength(2);
  });
  it("resets the reviewed tier when INIT changes season or player identity", () => {
    const { state, desktop, mobile, install } = setup();
    state.domainCatalog.push({ ...state.domainCatalog[0]!, id: "next", tier: 2 });
    state.domainIds = ["first"]; state.domainChoices = ["next"];
    state.joinSeasonId = "next-season";
    renderAfcUpgradePanels(state, desktop, mobile, install);
    expect(mobile.querySelector("[data-afc-upgrade-current-tier]")?.getAttribute("data-afc-upgrade-current-tier")).toBe("2");
    state.domainIds = []; state.domainChoices = ["first", "second"]; state.me = "another-house";
    renderAfcUpgradePanels(state, desktop, mobile, install);
    expect(mobile.querySelector("[data-afc-upgrade-current-tier]")?.getAttribute("data-afc-upgrade-current-tier")).toBe("1");
  });
  it("keeps legacy costs truthful and never offers an alternative from an installed tier", () => {
    const { state, desktop, mobile, install } = setup();
    mobile.querySelector<HTMLButtonElement>('[data-afc-upgrade-card="first"]')!.click();
    expect(mobile.textContent).toContain("40 coin");
    expect(mobile.textContent).not.toContain("free installation");
    state.domainIds = ["second"];
    renderAfcUpgradePanels(state, desktop, mobile, install);
    expect(mobile.querySelectorAll("[data-afc-upgrade-card], [data-domain-unlock]")).toHaveLength(0);
    expect(mobile.querySelector('[data-afc-upgrade-installed="second"]')).not.toBeNull();
    expect(install).not.toHaveBeenCalled();
  });
});
