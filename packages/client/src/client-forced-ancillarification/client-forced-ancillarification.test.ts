import { describe, expect, it, vi } from "vitest";
import type { Tile } from "../client-types.js";
import { createInitialState } from "../client-state/client-state.js";
import { forcedAncillarificationActions } from "./client-forced-ancillarification.js";
import { dispatchTileAetherAction } from "../client-afc-upgrades/client-afc-tower-action.js";

function setup() {
  const factory: Tile = { x: 11, y: 10, terrain: "LAND", ownerId: "p", ownershipState: "SETTLED", economicStructure: { ownerId: "p", type: "ANCILLARY_FACTORY", status: "active" } };
  const town: Tile = { x: 10, y: 10, terrain: "LAND", ownerId: "p", ownershipState: "SETTLED", town: {
    type: "MARKET", name: "Test Town", population: 20_000, maxPopulation: 100_000, populationTier: "TOWN", isFed: true,
    baseGoldPerMinute: 0, goldPerMinute: 0, supportCurrent: 1, supportMax: 8, cap: 300,
    connectedTownCount: 0, connectedTownBonus: 0, hasManufactory: false, manufactoryActive: false, hasIncubationEngine: false, incubationEngineActive: false
  } };
  const state = createInitialState(); state.me = "p"; state.tiles = new Map([["11,10", factory], ["10,10", town]]);
  return { factory, town, state };
}

describe("Forced Ancillarification factory action (both map renderers)", () => {
  it("previews the actual cost and sends factory coordinates", () => {
    const { state, factory, town } = setup();
    expect(forcedAncillarificationActions(state, factory, 1000)[0]).toMatchObject({ disabled: false, cost: "400 population → +100 manpower" });
    const action = forcedAncillarificationActions(state, factory, 1000)[0]!;
    expect(action.detail).toContain("400 residents from Test Town");
    expect(`${action.detail} ${action.cost}`).not.toContain("%");
    town.town!.population = 1_000_000;
    expect(forcedAncillarificationActions(state, factory, 1000)[0]?.cost).toBe("20,000 population → +100 manpower");
    const send = vi.fn(() => true);
    dispatchTileAetherAction("forced_ancillarification", factory, { aetherLanceFxQueue: [] }, send);
    expect(send).toHaveBeenCalledWith({ type: "FORCED_ANCILLARIFICATION", x: 11, y: 10 });
  });
  it("disables unavailable factories, population and town cooldowns, and hides foreign/fogged factories", () => {
    const { state, factory, town } = setup();
    town.town!.forcedAncillarificationCooldownUntil = 61_000;
    expect(forcedAncillarificationActions(state, factory, 1000)[0]).toMatchObject({ disabled: true, disabledReason: "Town recovering · 1m" });
    delete town.town!.forcedAncillarificationCooldownUntil;
    town.town!.population = 10_000;
    expect(forcedAncillarificationActions(state, factory, 1000)[0]?.disabled).toBe(true);
    town.town!.population = 20_000;
    state.dormantStructures = [{ key: "11,10:economicStructure", resources: ["FOOD"] }];
    expect(forcedAncillarificationActions(state, factory, 1000)[0]?.disabledReason).toContain("FOOD");
    expect(forcedAncillarificationActions(state, { ...factory, fogged: true }, 1000)).toEqual([]);
    expect(forcedAncillarificationActions(state, { ...factory, ownerId: "enemy" }, 1000)).toEqual([]);
  });
});
