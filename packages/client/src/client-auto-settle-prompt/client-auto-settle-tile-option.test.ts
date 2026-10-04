// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { loadedAutoSettleState } from "./client-auto-settle-prefs.js";
import {
  autoSettleOptionForTile,
  autoSettleOptionHtml,
  installAutoSettleTileOptionBinding,
  settleOutcomeText
} from "./client-auto-settle-tile-option.js";

const tile = (extra: Partial<Tile>): Tile => ({ x: 5, y: 5, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER", ...extra }) as Tile;

describe("settleOutcomeText", () => {
  it("states food-slot upkeep for a town, and how short it would leave you", () => {
    const state = createInitialState();
    state.resourceSlots.supply.FOOD = 1;
    state.resourceSlots.demand.FOOD = 0;
    const text = settleOutcomeText(state, tile({ town: { populationTier: "TOWN" } as never }));
    expect(text).toMatch(/^Gain: \+ Coin, \+ Manpower\. Upkeep: \d+ food slots? \(\d+ short/);
  });

  it("says upkeep is none for farms, fish, resources and docks", () => {
    const state = createInitialState();
    expect(settleOutcomeText(state, tile({ resource: "FARM" }))).toBe("Gain: +1 food slot. Upkeep: none.");
    expect(settleOutcomeText(state, tile({ resource: "FISH" }))).toBe("Gain: +2 food slots. Upkeep: none.");
    expect(settleOutcomeText(state, tile({ resource: "TITANIUM" }))).toBe("Gain: +1 titanium slot. Upkeep: none.");
    expect(settleOutcomeText(state, tile({ dockId: "d1" }))).toBe("Gain: + Coin. Upkeep: none.");
  });

  it("stays silent for a plain tile", () => {
    expect(settleOutcomeText(createInitialState(), tile({}))).toBe("");
  });
});

describe("auto-settle checkbox", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    (document as { __autoSettleTileOptionBound?: boolean }).__autoSettleTileOptionBound = false;
  });

  it("is hidden until prefs load, then reflects the tile's category", () => {
    const state = createInitialState();
    expect(autoSettleOptionForTile(state, tile({ resource: "FARM" }))).toBeUndefined();
    state.autoSettle = loadedAutoSettleState({ answered: true, towns: false, food: true, resources: false });
    expect(autoSettleOptionForTile(state, tile({ resource: "FARM" }))).toMatchObject({ category: "food", checked: true });
    expect(autoSettleOptionForTile(state, tile({ resource: "GEMS" }))).toMatchObject({ category: "resources", checked: false });
    expect(autoSettleOptionForTile(state, tile({ dockId: "d" }))).toMatchObject({ category: "towns", checked: false });
  });

  it("is not offered on a natural wonder (it would fall into the towns setting)", () => {
    const state = createInitialState();
    state.autoSettle = loadedAutoSettleState({ answered: true, towns: true, food: true, resources: true });
    expect(autoSettleOptionForTile(state, tile({ naturalWonder: { type: "QUICKFORGE" } }))).toBeUndefined();
  });

  it("toggling sends all three prefs with only that category changed", () => {
    const state = createInitialState();
    state.autoSettle = loadedAutoSettleState({ answered: false, towns: false, food: true, resources: false });
    const send = vi.fn(() => true);
    installAutoSettleTileOptionBinding(state, send);
    document.body.innerHTML = autoSettleOptionHtml(autoSettleOptionForTile(state, tile({ dockId: "d" }))!);
    const box = document.querySelector<HTMLInputElement>("[data-tile-auto-settle]")!;
    box.click();
    expect(send).toHaveBeenCalledWith({ type: "SET_AUTO_SETTLE_PREFS", towns: true, food: true, resources: false });
    expect(state.autoSettle).toEqual(loadedAutoSettleState({ answered: true, towns: true, food: true, resources: false }));
  });

  it("un-ticks itself when the message could not be sent", () => {
    const state = createInitialState();
    state.autoSettle = loadedAutoSettleState({ answered: true, towns: false, food: false, resources: false });
    installAutoSettleTileOptionBinding(state, () => false);
    document.body.innerHTML = autoSettleOptionHtml(autoSettleOptionForTile(state, tile({ resource: "FARM" }))!);
    const box = document.querySelector<HTMLInputElement>("[data-tile-auto-settle]")!;
    box.click();
    expect(box.checked).toBe(false);
    expect(state.autoSettle).toEqual(loadedAutoSettleState({ answered: true, towns: false, food: false, resources: false }));
  });
});
