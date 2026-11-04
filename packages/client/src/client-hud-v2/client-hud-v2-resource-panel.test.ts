import { describe, expect, it } from "vitest";
import { applyResourceChip, type ResourcePanelState } from "./client-hud-v2-resource-panel.js";

describe("resource chips", () => {
  it("opens Economy on the chip's resource, and a second tap on the bar closes it", () => {
    const state: ResourcePanelState = { activePanel: null, economyFocus: "ALL" };
    applyResourceChip(state, "food", "toggle");
    expect(state).toEqual({ activePanel: "economy", economyFocus: "FOOD" });
    applyResourceChip(state, "food", "toggle");
    expect(state.activePanel).toBeNull();
  });

  it("switches resource without closing when a different chip is tapped", () => {
    const state: ResourcePanelState = { activePanel: "economy", economyFocus: "FOOD" };
    applyResourceChip(state, "coin", "toggle");
    expect(state).toEqual({ activePanel: "economy", economyFocus: "GOLD" });
  });

  // Regression: a Treasury row toggled like a bar chip, so tapping Food in the Treasury while Economy was already on
  // Food closed Economy instead of showing the Food breakdown.
  it("a Treasury row only ever opens its breakdown", () => {
    const state: ResourcePanelState = { activePanel: "economy", economyFocus: "FOOD" };
    applyResourceChip(state, "food", "open");
    expect(state).toEqual({ activePanel: "economy", economyFocus: "FOOD" });
  });

  it("Integrity opens its own panel", () => {
    const state: ResourcePanelState = { activePanel: null, economyFocus: "ALL" };
    applyResourceChip(state, "integrity", "open");
    expect(state.activePanel).toBe("defensibility");
  });
});
