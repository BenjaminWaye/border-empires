import { describe, expect, it } from "vitest";

import { chooseDormantFoodStructureToDisable, chooseLowValueBeaconToDisable, foodSlotReliefFromPlannerInput } from "./food-slot-relief.js";
import type { AutomationPlannerTile } from "./automation-command-planner-types.js";

const PLAYER_ID = "ai-1";

const tile = (
  x: number,
  y: number,
  overrides: Partial<NonNullable<AutomationPlannerTile["economicStructure"]>> = {}
): AutomationPlannerTile => ({
  x,
  y,
  ownerId: PLAYER_ID,
  ownershipState: "SETTLED",
  terrain: "LAND",
  economicStructure: { ownerId: PLAYER_ID, type: "RELAY_BEACON", status: "active", ...overrides }
});

const tilesByKeyOf = (tiles: readonly AutomationPlannerTile[]): ReadonlyMap<string, AutomationPlannerTile> =>
  new Map(tiles.map((t) => [`${t.x},${t.y}`, t]));

describe("chooseDormantFoodStructureToDisable", () => {
  it("returns undefined when there are no FOOD-dormant structures", () => {
    expect(chooseDormantFoodStructureToDisable([tile(1, 1)], PLAYER_ID, new Set())).toBeUndefined();
    expect(chooseDormantFoodStructureToDisable([tile(1, 1)], PLAYER_ID, undefined)).toBeUndefined();
  });

  it("picks the FOOD-dormant structure this player owns", () => {
    const dormant = new Set(["2,3"]);
    const result = chooseDormantFoodStructureToDisable([tile(1, 1), tile(2, 3)], PLAYER_ID, dormant);
    expect(result).toEqual({ x: 2, y: 3 });
  });

  it("ignores a dormant key belonging to a structure this player doesn't own", () => {
    const dormant = new Set(["2,3"]);
    const enemyTile = tile(2, 3, { ownerId: "ai-2" });
    expect(chooseDormantFoodStructureToDisable([enemyTile], PLAYER_ID, dormant)).toBeUndefined();
  });

  it("skips a structure already mid-removal, under construction, or already manually disabled", () => {
    const dormant = new Set(["2,3", "4,5", "6,6"]);
    const removing = tile(2, 3, { status: "removing" });
    const underConstruction = tile(4, 5, { status: "under_construction" });
    const alreadyDisabled = tile(6, 6, { status: "inactive", inactiveReason: "manual" });
    expect(chooseDormantFoodStructureToDisable([removing, underConstruction, alreadyDisabled], PLAYER_ID, dormant)).toBeUndefined();
  });

  it("picks deterministically (lowest x, then y) among multiple dormant candidates", () => {
    const dormant = new Set(["5,5", "1,9", "1,2"]);
    const result = chooseDormantFoodStructureToDisable([tile(5, 5), tile(1, 9), tile(1, 2)], PLAYER_ID, dormant);
    expect(result).toEqual({ x: 1, y: 2 });
  });
});

describe("chooseLowValueBeaconToDisable", () => {
  it("returns undefined without a tile lookup (can't evaluate reach value)", () => {
    expect(chooseLowValueBeaconToDisable([tile(1, 1)], PLAYER_ID, undefined)).toBeUndefined();
  });

  it("picks an active beacon whose reach box holds no resource/dock/town tile", () => {
    const beacon = tile(10, 10);
    const emptyLand = { x: 11, y: 10, terrain: "LAND" as const };
    const tiles = [beacon, emptyLand];
    expect(chooseLowValueBeaconToDisable(tiles, PLAYER_ID, tilesByKeyOf(tiles))).toEqual({ x: 10, y: 10 });
  });

  it("skips a beacon whose reach box holds a resource tile", () => {
    const beacon = tile(10, 10);
    const farm = { x: 11, y: 10, terrain: "LAND" as const, resource: "FARM" as const };
    const tiles = [beacon, farm];
    expect(chooseLowValueBeaconToDisable(tiles, PLAYER_ID, tilesByKeyOf(tiles))).toBeUndefined();
  });

  it("skips a beacon that's already manually disabled, under construction, or not this player's", () => {
    const disabled = tile(10, 10, { status: "inactive", inactiveReason: "manual" });
    const building = tile(20, 20, { status: "under_construction" });
    const enemy = tile(30, 30, { ownerId: "ai-2" });
    const tiles = [disabled, building, enemy];
    expect(chooseLowValueBeaconToDisable(tiles, PLAYER_ID, tilesByKeyOf(tiles))).toBeUndefined();
  });

  it("picks deterministically (lowest x, then y) among multiple zero-value beacons", () => {
    const tiles = [tile(5, 5), tile(1, 9), tile(1, 2)];
    expect(chooseLowValueBeaconToDisable(tiles, PLAYER_ID, tilesByKeyOf(tiles))).toEqual({ x: 1, y: 2 });
  });
});

describe("foodSlotReliefFromPlannerInput", () => {
  it("reports exhausted when supply has zero or negative headroom over demand", () => {
    // Over-committed: supply < demand.
    expect(foodSlotReliefFromPlannerInput([], PLAYER_ID, undefined, undefined, 0, 3).exhausted).toBe(true);
    // Exactly full: supply === demand, zero free slots — this is the case
    // needVector.FOOD_SLOTS (clamp01(1 - supply/demand)) used to miss, since
    // that ratio reads 0 ("no deficit") here even though the next FOOD-slot
    // build is rejected with INSUFFICIENT_SLOT.
    expect(foodSlotReliefFromPlannerInput([], PLAYER_ID, undefined, undefined, 3, 3).exhausted).toBe(true);
    // Headroom left: supply > demand.
    expect(foodSlotReliefFromPlannerInput([], PLAYER_ID, undefined, undefined, 4, 3).exhausted).toBe(false);
    // No FOOD demand at all — nothing to be exhausted from.
    expect(foodSlotReliefFromPlannerInput([], PLAYER_ID, undefined, undefined, 0, 0).exhausted).toBe(false);
    expect(foodSlotReliefFromPlannerInput([], PLAYER_ID, undefined, undefined, undefined, undefined).exhausted).toBe(false);
  });

  it("prefers the zero-value beacon over the dormant-structure fallback", () => {
    const beacon = tile(2, 3);
    const dormant = new Set(["2,3"]);
    const result = foodSlotReliefFromPlannerInput([beacon], PLAYER_ID, dormant, tilesByKeyOf([beacon]), 3, 3);
    expect(result).toEqual({ disableTarget: { x: 2, y: 3 }, exhausted: true });
  });

  it("falls back to the dormant-structure target when there's no zero-value beacon", () => {
    const dormantStructure = tile(2, 3, { type: "FARMSTEAD" });
    const dormant = new Set(["2,3"]);
    const result = foodSlotReliefFromPlannerInput([dormantStructure], PLAYER_ID, dormant, undefined, 3, 3);
    expect(result).toEqual({ disableTarget: { x: 2, y: 3 }, exhausted: true });
  });
});
