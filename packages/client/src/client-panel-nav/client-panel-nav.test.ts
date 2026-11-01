// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { closeActivePanel, renderMobilePanels } from "./client-panel-nav.js";

describe("closeActivePanel", () => {
  it("returns domain detail views to shard overview", () => {
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

describe("renderMobilePanels", () => {
  // Regression: under ?hud=v2 Settings first drew as the right-hand panel, then jumped to the centre on the HUD's next tick.
  it("marks the side panel as Settings in the same render that opens it", () => {
    document.body.innerHTML = `<div id="hud"><div id="mobile-nav"></div></div>`;
    const el = (): HTMLElement => document.createElement("div");
    const sidePanelEl = el();
    const deps = {
      hud: document.getElementById("hud") as HTMLElement,
      panelActionButtons: document.querySelectorAll<HTMLButtonElement>("button"),
      sidePanelBodyEl: el(), sidePanelEl, panelTitleEl: el(), mobileSheetEl: el(), mobileCoreEl: el(), mobilePanelCoreEl: el(),
      mobilePanelMissionsEl: el(), mobilePanelTechEl: el(), mobilePanelDomainsEl: el(), mobilePanelSocialEl: el(),
      mobilePanelDefensibilityEl: el(), mobilePanelEconomyEl: el(), mobilePanelManpowerEl: el(), mobilePanelDevelopmentEl: el(), mobilePanelTownsEl: el(),
      mobilePanelLeaderboardEl: el(), mobilePanelFeedEl: el(), mobilePanelSettingsEl: el(), mobileSheetTitleEl: el()
    };
    const state = {
      activePanel: "settings" as const, mobilePanel: "core" as const, techTreeExpanded: false, domainDetailOpen: false,
      unreadAttackAlerts: 0, feedUnreadCount: 0, incomingAllianceRequests: [], incomingTruceRequests: []
    };
    renderMobilePanels(state, deps);
    expect(sidePanelEl.classList.contains("settings-panel-active")).toBe(true);
    renderMobilePanels({ ...state, activePanel: null }, deps);
    expect(sidePanelEl.classList.contains("settings-panel-active")).toBe(false);
  });
});
