import { describe, expect, it } from "vitest";

import { chooseFoodSlotReliefRemoval, foodSlotReliefFromPlannerInput } from "./food-slot-relief.js";
import type { AutomationPlannerTile } from "./automation-command-planner-types.js";
import type { NeedVector } from "./build/build-need-vector.js";

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

describe("chooseFoodSlotReliefRemoval", () => {
  it("returns undefined when there are no FOOD-dormant structures", () => {
    expect(chooseFoodSlotReliefRemoval([tile(1, 1)], PLAYER_ID, new Set())).toBeUndefined();
    expect(chooseFoodSlotReliefRemoval([tile(1, 1)], PLAYER_ID, undefined)).toBeUndefined();
  });

  it("picks the FOOD-dormant structure this player owns", () => {
    const dormant = new Set(["2,3"]);
    const result = chooseFoodSlotReliefRemoval([tile(1, 1), tile(2, 3)], PLAYER_ID, dormant);
    expect(result).toEqual({ x: 2, y: 3 });
  });

  it("ignores a dormant key belonging to a structure this player doesn't own", () => {
    const dormant = new Set(["2,3"]);
    const enemyTile = tile(2, 3, { ownerId: "ai-2" });
    expect(chooseFoodSlotReliefRemoval([enemyTile], PLAYER_ID, dormant)).toBeUndefined();
  });

  it("skips a structure already mid-removal or still under construction", () => {
    const dormant = new Set(["2,3", "4,5"]);
    const removing = tile(2, 3, { status: "removing" });
    const underConstruction = tile(4, 5, { status: "under_construction" });
    expect(chooseFoodSlotReliefRemoval([removing, underConstruction], PLAYER_ID, dormant)).toBeUndefined();
  });

  it("picks deterministically (lowest x, then y) among multiple dormant candidates", () => {
    const dormant = new Set(["5,5", "1,9", "1,2"]);
    const result = chooseFoodSlotReliefRemoval([tile(5, 5), tile(1, 9), tile(1, 2)], PLAYER_ID, dormant);
    expect(result).toEqual({ x: 1, y: 2 });
  });
});

describe("foodSlotReliefFromPlannerInput", () => {
  const needVector = (foodSlots: number): NeedVector => ({
    MANPOWER_THROUGHPUT: 0,
    MANPOWER_CEILING: 0,
    FOOD_SLOTS: foodSlots,
    TITANIUM_SLOTS: 0,
    UMBRITE_SLOTS: 0,
    CRYSTAL_SLOTS: 0,
    GOLD: 0,
    DEFENSE: 0,
    OFFENSE: 0,
    VICTORY: 0
  });

  it("reports exhausted only when FOOD_SLOTS deficit is at its max", () => {
    expect(foodSlotReliefFromPlannerInput([], PLAYER_ID, undefined, needVector(1)).exhausted).toBe(true);
    expect(foodSlotReliefFromPlannerInput([], PLAYER_ID, undefined, needVector(0.5)).exhausted).toBe(false);
    expect(foodSlotReliefFromPlannerInput([], PLAYER_ID, undefined, undefined).exhausted).toBe(false);
  });

  it("bundles the removal candidate alongside the exhausted flag", () => {
    const dormant = new Set(["2,3"]);
    const result = foodSlotReliefFromPlannerInput([tile(2, 3)], PLAYER_ID, dormant, needVector(1));
    expect(result).toEqual({ removal: { x: 2, y: 3 }, exhausted: true });
  });
});
