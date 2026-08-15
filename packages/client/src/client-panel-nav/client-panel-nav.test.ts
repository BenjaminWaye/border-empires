import { describe, expect, it } from "vitest";
import { closeActivePanel } from "./client-panel-nav.js";

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
