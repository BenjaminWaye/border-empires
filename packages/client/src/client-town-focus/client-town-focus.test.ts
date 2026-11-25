import { describe, expect, it, vi } from "vitest";
import type { Tile } from "../client-types.js";
import { createInitialState } from "../client-state/client-state.js";
import { townFocusActions } from "./client-town-focus.js";
import { dispatchTileAetherAction } from "../client-afc-upgrades/client-afc-tower-action.js";
import { structureCommandActions } from "../client-structure-command-actions.js";

const townTile = (ownerId: string, focus: Partial<NonNullable<Tile["town"]>> = {}): Tile => ({
  x: 10, y: 10, terrain: "LAND", ownerId, ownershipState: "SETTLED", town: {
    type: "MARKET", name: "Test Town", population: 20_000, maxPopulation: 100_000, populationTier: "TOWN", isFed: true,
    baseGoldPerMinute: 0, goldPerMinute: 0, supportCurrent: 1, supportMax: 8,
    connectedTownCount: 0, connectedTownBonus: 0, hasManufactory: false, manufactoryActive: false, hasIncubationEngine: false, incubationEngineActive: false,
    ...focus
  }
});
const stateFor = (me: string) => { const state = createInitialState(); state.me = me; return state; };

describe("town focus actions (both map renderers share the DOM menu)", () => {
  it("offers four focus rows on an owned town, with Balanced marked current", () => {
    const actions = townFocusActions(stateFor("p"), townTile("p"), 1_000);
    expect(actions.map((action) => action.id)).toEqual(["town_focus_balanced", "town_focus_growth", "town_focus_levy", "town_focus_commerce"]);
    expect(actions[0]).toMatchObject({ disabled: true, disabledReason: "Current focus" });
    expect(actions[2]).toMatchObject({ disabled: false, cost: "Free" });
    expect(actions[2]?.detail).toContain("Manpower regen +20%");
  });

  it("shows nothing on a rival's town", () => {
    expect(townFocusActions(stateFor("p"), townTile("rival"), 1_000)).toEqual([]);
  });

  it("marks a queued focus and lets the player keep the current one instead", () => {
    const actions = townFocusActions(stateFor("p"), townTile("p", { focus: "LEVY", pendingFocus: "GROWTH", pendingFocusAt: 61_000 }), 1_000);
    expect(actions[1]).toMatchObject({ id: "town_focus_growth", disabled: true });
    expect(actions[1]?.disabledReason).toContain("Queued");
    expect(actions[2]).toMatchObject({ id: "town_focus_levy", label: "Keep Levy focus", disabled: false });
  });

  it("is on the tile menu and sends SET_TOWN_FOCUS for the selected town", () => {
    const state = stateFor("p");
    const tile = townTile("p");
    expect(structureCommandActions(state, tile).some((action) => action.id === "town_focus_commerce")).toBe(true);
    const send = vi.fn(() => true);
    dispatchTileAetherAction("town_focus_commerce", tile, { aetherLanceFxQueue: [] }, send);
    expect(send).toHaveBeenCalledWith({ type: "SET_TOWN_FOCUS", tiles: [{ x: 10, y: 10 }], focus: "COMMERCE" });
  });
});
