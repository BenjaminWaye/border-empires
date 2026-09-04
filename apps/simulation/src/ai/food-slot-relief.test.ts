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

  // Regression: a beacon with an empty reach box used to be picked purely on
  // resource/dock/town absence -- even if it was the AI's only presence near
  // an active front. It must not be treated as low-value while any tile in
  // its reach box borders enemy territory, matching the user's requirement
  // to spare beacons that matter "from a war perspective."
  it("skips a resource-empty beacon whose reach box borders enemy territory", () => {
    const beacon = tile(10, 10);
    const emptyBorderLand = { x: 11, y: 10, terrain: "LAND" as const };
    const enemyNeighbor = { x: 12, y: 10, terrain: "LAND" as const, ownerId: "ai-2" };
    const tiles = [beacon, emptyBorderLand, enemyNeighbor];
    expect(chooseLowValueBeaconToDisable(tiles, PLAYER_ID, tilesByKeyOf(tiles))).toBeUndefined();
  });

  it("still picks a resource-empty beacon when no tile in its reach box borders the enemy", () => {
    const beacon = tile(10, 10);
    const emptyInteriorLand = { x: 11, y: 10, terrain: "LAND" as const };
    // Far enough away that it isn't a neighbor of any reach-box tile.
    const distantEnemy = { x: 50, y: 50, terrain: "LAND" as const, ownerId: "ai-2" };
    const tiles = [beacon, emptyInteriorLand, distantEnemy];
    expect(chooseLowValueBeaconToDisable(tiles, PLAYER_ID, tilesByKeyOf(tiles))).toEqual({ x: 10, y: 10 });
  });
});

describe("foodSlotReliefFromPlannerInput", () => {
  // Regression: this used to key off needVector.FOOD_SLOTS (a smoothed 0-1
  // ratio) reaching exactly 1, which only happens once supply hits zero
  // entirely. A player can already be hard-rejected with INSUFFICIENT_SLOT
  // well before that -- e.g. 99 supply vs 100 demand still leaves zero free
  // slots for a relay beacon's 1-slot cost. Confirmed against live staging
  // data: players with FOOD_SLOTS deficits of 0.056/0.20/0.25/0.92 were all
  // hitting real INSUFFICIENT_SLOT rejections, none reaching >=1.
  it("reports exhausted once free FOOD-slot capacity drops below what one more build costs", () => {
    expect(foodSlotReliefFromPlannerInput([], PLAYER_ID, undefined, undefined, 100, 100).exhausted).toBe(true);
    expect(foodSlotReliefFromPlannerInput([], PLAYER_ID, undefined, undefined, 99, 100).exhausted).toBe(true);
    expect(foodSlotReliefFromPlannerInput([], PLAYER_ID, undefined, undefined, 8, 100).exhausted).toBe(true);
  });

  it("does not report exhausted while at least one free FOOD slot remains", () => {
    expect(foodSlotReliefFromPlannerInput([], PLAYER_ID, undefined, undefined, 101, 100).exhausted).toBe(false);
    expect(foodSlotReliefFromPlannerInput([], PLAYER_ID, undefined, undefined, 51, 50).exhausted).toBe(false);
  });

  it("does not report exhausted with no FOOD demand at all, or with missing data", () => {
    expect(foodSlotReliefFromPlannerInput([], PLAYER_ID, undefined, undefined, 0, 0).exhausted).toBe(false);
    expect(foodSlotReliefFromPlannerInput([], PLAYER_ID, undefined, undefined, undefined, undefined).exhausted).toBe(false);
  });

  it("prefers the zero-value beacon over the dormant-structure fallback", () => {
    const beacon = tile(2, 3);
    const dormant = new Set(["2,3"]);
    const result = foodSlotReliefFromPlannerInput([beacon], PLAYER_ID, dormant, tilesByKeyOf([beacon]), 4, 4);
    expect(result).toEqual({ disableTarget: { x: 2, y: 3 }, exhausted: true });
  });

  it("falls back to the dormant-structure target when there's no zero-value beacon", () => {
    const dormantStructure = tile(2, 3, { type: "FARMSTEAD" });
    const dormant = new Set(["2,3"]);
    const result = foodSlotReliefFromPlannerInput([dormantStructure], PLAYER_ID, dormant, undefined, 4, 4);
    expect(result).toEqual({ disableTarget: { x: 2, y: 3 }, exhausted: true });
  });
});
