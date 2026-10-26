// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import type { TechInfo } from "../client-types.js";
import { screen, type HudV2Deps } from "./client-hud-v2-context.js";
import { manifestDetailHtml } from "./client-hud-v2-manifest.js";
import { screenClick } from "./client-hud-v2-screens.js";

const fortTech: TechInfo = {
  id: "fortification",
  name: "Fortification",
  tier: 1,
  branch: "war",
  prereqIds: [],
  description: "",
  mods: {},
  effects: { unlockForts: true },
  requirements: { gold: 40, resources: {} }
};

describe("manifest building chips", () => {
  afterEach(() => {
    screen.id = null;
    document.body.innerHTML = "";
  });

  // Regression: pressing a building in the tech tree did nothing.
  it("opens the building's info card", () => {
    const html = manifestDetailHtml({ techs: [fortTech], owned: new Set(), selectedId: "fortification", closedLanes: new Set(), gold: 100, choices: new Set(["fortification"]), afcTier: 0 });
    expect(html).toContain('data-v2-info-structure="FORT"');
    document.body.innerHTML = `<div id="hud-v2-screen">${html}</div>`;
    let rendered = 0;
    const state = createInitialState();
    const deps = { state, renderHud: () => { rendered += 1; } } as unknown as HudV2Deps;
    screen.id = "manifest";
    const chip = document.querySelector('[data-v2-info-structure="FORT"]');
    expect(chip).not.toBeNull();
    expect(screenClick(deps, chip as Element)).toBe(true);
    expect(state.structureInfoKey).toBe("FORT");
    expect(state.crystalAbilityInfoKey).toBe("");
    expect(rendered).toBe(1);
  });
});
