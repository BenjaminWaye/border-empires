// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { closeActivePanel, renderSidePanel } from "./client-panel-nav.js";

describe("closeActivePanel", () => {
  it("returns domain detail views to the domain overview", () => {
    const state = {
      activePanel: "domains" as const,
      domainDetailOpen: true,
      settingsSubPage: null
    };

    closeActivePanel(state);

    expect(state.activePanel).toBe("domains");
    expect(state.domainDetailOpen).toBe(false);
  });

  it("closes non-detail panels normally", () => {
    const state = {
      activePanel: "tech" as const,
      domainDetailOpen: false,
      settingsSubPage: null
    };

    closeActivePanel(state);

    expect(state.activePanel).toBeNull();
    expect(state.domainDetailOpen).toBe(false);
  });

  it("returns a settings sub-page to the hub before closing", () => {
    const state = {
      activePanel: "settings" as const,
      domainDetailOpen: false,
      settingsSubPage: "account" as const
    };

    closeActivePanel(state);

    expect(state.activePanel).toBe("settings");
    expect(state.settingsSubPage).toBeNull();
  });

  it("closes the settings panel normally once at the hub", () => {
    const state = {
      activePanel: "settings" as const,
      domainDetailOpen: false,
      settingsSubPage: null
    };

    closeActivePanel(state);

    expect(state.activePanel).toBeNull();
  });
});

describe("renderSidePanel", () => {
  it("uses Campaign Loadout as the AFC panel title", () => {
    const deps = {
      sidePanelBodyEl: document.createElement("div"),
      sidePanelEl: document.createElement("aside"),
      panelTitleEl: document.createElement("h3")
    };
    renderSidePanel({ activePanel: "domains", techTreeExpanded: false, domainDetailOpen: false }, deps);
    expect(deps.panelTitleEl.textContent).toBe("Campaign Loadout");
    expect(deps.sidePanelEl.classList.contains("afc-upgrades-panel")).toBe(true);
    renderSidePanel({ activePanel: "towns", techTreeExpanded: false, domainDetailOpen: false }, deps);
    expect(deps.panelTitleEl.textContent).toBe("Towns");
    expect(deps.sidePanelEl.classList.contains("afc-upgrades-panel")).toBe(false);
  });

  // Regression: Settings first drew as the right-hand panel, then jumped to the centre on the HUD's next tick.
  it("marks the side panel as Settings in the same render that opens it", () => {
    const el = (): HTMLElement => document.createElement("div");
    const sidePanelEl = el();
    const deps = { sidePanelBodyEl: el(), sidePanelEl, panelTitleEl: el() };
    const state = {
      activePanel: "settings" as const, techTreeExpanded: false, domainDetailOpen: false
    };
    renderSidePanel(state, deps);
    expect(sidePanelEl.classList.contains("settings-panel-active")).toBe(true);
    renderSidePanel({ ...state, activePanel: null }, deps);
    expect(sidePanelEl.classList.contains("settings-panel-active")).toBe(false);
  });

  // Owner 2026-11-18: hover titles don't exist on a phone, so each panel says what it is in visible text.
  it("shows a one-line explanation under the manpower and Integrity titles, and a ? instead on House Charges", () => {
    const head = document.createElement("div");
    head.innerHTML = '<h3 id="panel-title">Panel</h3><button id="panel-help" hidden>?</button><p id="panel-hint" class="panel-hint" hidden></p>';
    const help = head.querySelector<HTMLElement>("#panel-help")!;
    const panelTitleEl = head.querySelector<HTMLElement>("#panel-title")!;
    const hint = head.querySelector<HTMLElement>("#panel-hint")!;
    const deps = { sidePanelBodyEl: document.createElement("div"), sidePanelEl: document.createElement("aside"), panelTitleEl };
    const base = { techTreeExpanded: false, domainDetailOpen: false };
    renderSidePanel({ ...base, activePanel: "manpower" }, deps);
    expect(hint.hidden).toBe(false);
    expect(hint.textContent).toBe("Expand, garrison, build, attack · refills every 4h");
    renderSidePanel({ ...base, activePanel: "defensibility" }, deps);
    expect(hint.textContent).toContain("Compact garrisoned land");
    expect(help.hidden).toBe(true);
    // Owner 2026-11-20: no line above the charge cards, only a ? beside the title.
    renderSidePanel({ ...base, activePanel: "charges" }, deps);
    expect(hint.hidden).toBe(true);
    expect(help.hidden).toBe(false);
    // Owner 2026-11-19: on desktop the charges float side by side; the class lets the panel widen and lose its frame.
    expect(deps.sidePanelEl.classList.contains("charges-panel-active")).toBe(true);
    renderSidePanel({ ...base, activePanel: "settings" }, deps);
    expect(hint.hidden).toBe(true);
    expect(help.hidden).toBe(true);
    expect(deps.sidePanelEl.classList.contains("charges-panel-active")).toBe(false);
  });
});
