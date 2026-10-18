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
    expect(mobile.querySelector("select")?.value).toBe("3");
    expect(mobile.querySelectorAll(".afc-upgrade-card")).toHaveLength(2);
  });
  it("resets the reviewed tier when INIT changes season or player identity", () => {
    const { state, desktop, mobile, install } = setup();
    state.domainCatalog.push({ ...state.domainCatalog[0]!, id: "next", tier: 2 });
    state.domainIds = ["first"]; state.domainChoices = ["next"];
    state.joinSeasonId = "next-season";
    renderAfcUpgradePanels(state, desktop, mobile, install);
    expect(mobile.querySelector("select")?.value).toBe("2");
    state.domainIds = []; state.domainChoices = ["first", "second"]; state.me = "another-house";
    renderAfcUpgradePanels(state, desktop, mobile, install);
    expect(mobile.querySelector("select")?.value).toBe("1");
  });
  it("keeps legacy costs truthful and prevents installing another choice in a filled tier", () => {
    const { state, desktop, mobile, install } = setup();
    state.domainIds = ["second"];
    renderAfcUpgradePanels(state, desktop, mobile, install);
    mobile.querySelector<HTMLButtonElement>('[data-afc-upgrade-card="first"]')!.click();
    expect(mobile.querySelector<HTMLButtonElement>('[data-domain-unlock="first"]')!.disabled).toBe(true);
    expect(mobile.textContent).toContain("40 coin");
    expect(mobile.textContent).not.toContain("free installation");
    mobile.querySelector<HTMLButtonElement>('[data-domain-unlock="first"]')!.click();
    expect(install).not.toHaveBeenCalled();
  });
});
