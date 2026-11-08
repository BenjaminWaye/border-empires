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
});
