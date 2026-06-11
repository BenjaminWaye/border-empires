import { describe, expect, it } from "vitest";
import { closeActivePanel } from "./client-panel-nav.js";

describe("closeActivePanel", () => {
  it("returns domain detail views to shard overview", () => {
    const state = {
      activePanel: "domains" as const,
      domainDetailOpen: true
    };

    closeActivePanel(state);

    expect(state.activePanel).toBe("domains");
    expect(state.domainDetailOpen).toBe(false);
  });

  it("closes non-detail panels normally", () => {
    const state = {
      activePanel: "tech" as const,
      domainDetailOpen: false
    };

    closeActivePanel(state);

    expect(state.activePanel).toBeNull();
    expect(state.domainDetailOpen).toBe(false);
  });
});
