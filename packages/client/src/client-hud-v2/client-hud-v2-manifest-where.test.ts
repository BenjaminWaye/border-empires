// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import type { TechInfo } from "../client-types.js";
import { screen, type HudV2Deps } from "./client-hud-v2-context.js";
import { manifestDetailHtml } from "./client-hud-v2-manifest.js";
import { structureBuildWhere } from "./client-hud-v2-manifest-where.js";
import { screenClick } from "./client-hud-v2-screens.js";

const tech = (id: string, effects: Record<string, unknown>): TechInfo => ({
  id, name: id, tier: 1, branch: "economy", prereqIds: [], description: "", mods: {}, effects, requirements: { gold: 40, resources: {} }
});
const detail = (t: TechInfo): string =>
  manifestDetailHtml({ techs: [t], owned: new Set([t.id]), selectedId: t.id, closedLanes: new Set(), gold: 0, choices: new Set(), afcTier: 0 });

// 2026-11-14 playtest: after commissioning Hyperfeed Seedstock a newcomer looked for the Hydrogarden in every
// town build menu, and "Reveal Titanium" gave no hint that it only marks explored land in the Resources lens.
describe("Manifest detail says where its unlocks are used", () => {
  afterEach(() => {
    screen.id = null;
    document.body.innerHTML = "";
  });

  it("names the tile a resource improvement goes on, and the town for town buildings", () => {
    expect(structureBuildWhere("HYDROGARDEN")).toBe("Hydrogarden: build on a garrisoned grain tile");
    expect(structureBuildWhere("MANUFACTORY")).toBe("Manufactory: build from a town's Build tab");
    expect(detail(tech("hyperfeed", { unlockHydrogarden: true }))).toContain("Hydrogarden: build on a garrisoned grain tile");
  });

  // Review of #2782: siege outposts can go up on frontier tiles, so "garrisoned tile" was wrong for them.
  it("does not ask for a garrisoned tile for siege outposts", () => {
    expect(structureBuildWhere("SIEGE_BATTERY")).toBe("Siege Battery: build on a tile you hold");
  });

  it("explains Reveal and opens the Resources lens from its chip", () => {
    const html = detail(tech("titanium-forge", { revealResource: "titanium" }));
    expect(html).toContain("Reveal Titanium: marks deposits on tiles in sight, in the Resources lens");
    document.body.innerHTML = `<div id="hud-v2-screen">${html}</div>`;
    const state = createInitialState();
    state.showDiplomacyOverlay = true;
    const deps = { state, renderHud: vi.fn(), requestViewRefresh: vi.fn(), actionFlow: { hideTileActionMenu: vi.fn() } } as unknown as HudV2Deps;
    screen.id = "manifest";
    const chip = document.querySelector("[data-v2-manifest-lens]");
    expect(chip).not.toBeNull();
    expect(screenClick(deps, chip as Element)).toBe(true);
    expect(state.showResourceOverlay).toBe(true);
    expect(state.showDiplomacyOverlay).toBe(false);
    expect(screen.id).toBeNull();
  });
});
