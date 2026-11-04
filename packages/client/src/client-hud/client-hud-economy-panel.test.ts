// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";

import { createInitialState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { hudEconomyPanelHtml } from "./client-hud-economy-panel.js";

const deps = {
  prettyToken: (token: string) => token,
  resourceIconHtml: () => "",
  rateToneClass: () => "",
  resourceLabel: (resource: string) => resource,
  economicStructureName: (type: string) => type,
  hasRevealedResourceCategory: () => true
};

describe("hudEconomyPanelHtml", () => {
  it("passes tiles every section can walk, not a single-use iterator", () => {
    const state = createInitialState();
    state.me = "me";
    state.economyFocus = "ALL";
    const town: Tile = {
      x: 3,
      y: 4,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      town: {
        name: "Ashford",
        type: "MARKET",
        baseGoldPerMinute: 1,
        supportCurrent: 0,
        supportMax: 0,
        goldPerMinute: 1,
        cap: 0,
        isFed: true,
        population: 4000,
        maxPopulation: 8000,
        populationTier: "TOWN",
        connectedTownCount: 0,
        connectedTownBonus: 0,
        hasManufactory: false,
        manufactoryActive: false,
        hasIncubationEngine: false,
        incubationEngineActive: false
      }
    };
    state.tiles.set("3,4", town);
    // The GOLD card walks the tiles before the FOOD slot card does; with a
    // spent values() iterator FOOD's "Occupied by" list came out empty.
    const html = hudEconomyPanelHtml(state, deps);
    expect(html).toContain("Town support");
  });
});
