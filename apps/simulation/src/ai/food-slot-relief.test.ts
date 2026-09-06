import { describe, expect, it } from "vitest";

import { chooseFoodConsumingStructureToDisable, chooseLowValueBeaconToDisable, foodSlotReliefFromPlannerInput } from "./food-slot-relief.js";
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

describe("chooseFoodConsumingStructureToDisable", () => {
  it("returns undefined when this player owns no FOOD-consuming structure", () => {
    expect(chooseFoodConsumingStructureToDisable([tile(1, 1, { type: "FARMSTEAD" })], PLAYER_ID, undefined)).toBeUndefined();
  });

  it("prefers a FOOD-dormant structure over an equally-eligible non-dormant one", () => {
    const dormant = new Set(["2,3"]);
    const notDormant = tile(1, 1, { type: "GRANARY" });
    const dormantStructure = tile(2, 3, { type: "GRANARY" });
    const result = chooseFoodConsumingStructureToDisable([notDormant, dormantStructure], PLAYER_ID, dormant);
    expect(result).toEqual({ x: 2, y: 3 });
  });

  it("falls back to any active FOOD-consuming structure when none is dormant", () => {
    // supply === demand (exactly full) never marks anything dormant, so
    // requiring dormancy used to leave the AI with no fallback target here.
    const structure = tile(4, 5, { type: "MINE" });
    expect(chooseFoodConsumingStructureToDisable([structure], PLAYER_ID, new Set())).toEqual({ x: 4, y: 5 });
    expect(chooseFoodConsumingStructureToDisable([structure], PLAYER_ID, undefined)).toEqual({ x: 4, y: 5 });
  });

  it("skips a structure type with no FOOD slot requirement (e.g. FARMSTEAD)", () => {
    expect(chooseFoodConsumingStructureToDisable([tile(1, 1, { type: "FARMSTEAD" })], PLAYER_ID, new Set(["1,1"]))).toBeUndefined();
  });

  it("skips RELAY_BEACON — that's chooseLowValueBeaconToDisable's job, not this fallback's", () => {
    expect(chooseFoodConsumingStructureToDisable([tile(1, 1)], PLAYER_ID, new Set(["1,1"]))).toBeUndefined();
  });

  it("ignores a structure belonging to a different player", () => {
    const enemyTile = tile(2, 3, { type: "GRANARY", ownerId: "ai-2" });
    expect(chooseFoodConsumingStructureToDisable([enemyTile], PLAYER_ID, new Set(["2,3"]))).toBeUndefined();
  });

  it("skips a structure already mid-removal, under construction, or already manually disabled", () => {
    const removing = tile(2, 3, { type: "GRANARY", status: "removing" });
    const underConstruction = tile(4, 5, { type: "GRANARY", status: "under_construction" });
    const alreadyDisabled = tile(6, 6, { type: "GRANARY", status: "inactive", inactiveReason: "manual" });
    expect(chooseFoodConsumingStructureToDisable([removing, underConstruction, alreadyDisabled], PLAYER_ID, undefined)).toBeUndefined();
  });

  it("picks deterministically (lowest x, then y) among multiple candidates", () => {
    const tiles = [tile(5, 5, { type: "GRANARY" }), tile(1, 9, { type: "GRANARY" }), tile(1, 2, { type: "GRANARY" })];
    expect(chooseFoodConsumingStructureToDisable(tiles, PLAYER_ID, undefined)).toEqual({ x: 1, y: 2 });
  });
});

describe("chooseLowValueBeaconToDisable", () => {
  it("returns undefined without a tile lookup (can't evaluate reach value)", () => {
    expect(chooseLowValueBeaconToDisable([tile(1, 1)], PLAYER_ID, undefined)).toBeUndefined();
  });

  it("returns undefined when this player owns no active beacon", () => {
    expect(chooseLowValueBeaconToDisable([], PLAYER_ID, new Map())).toBeUndefined();
  });

  it("picks an active beacon whose reach box holds no resource/dock/town tile", () => {
    const beacon = tile(10, 10);
    const emptyLand = { x: 11, y: 10, terrain: "LAND" as const };
    const tiles = [beacon, emptyLand];
    expect(chooseLowValueBeaconToDisable(tiles, PLAYER_ID, tilesByKeyOf(tiles))).toEqual({ x: 10, y: 10 });
  });

  it("still picks the only beacon even though its reach holds a FOOD tile it's the sole anchor over", () => {
    // No zero-value candidate exists any more, but requiring one used to
    // leave FREE_FOOD_SLOT with no target at all — picking the least-bad
    // option (here, the only option) is strictly better than staying stuck.
    const beacon = tile(10, 10);
    const farm = { x: 11, y: 10, terrain: "LAND" as const, resource: "FARM" as const };
    const tiles = [beacon, farm];
    expect(chooseLowValueBeaconToDisable(tiles, PLAYER_ID, tilesByKeyOf(tiles))).toEqual({ x: 10, y: 10 });
  });

  it("prefers the beacon whose FARM/FISH reach is redundantly covered by another anchor over one that solely holds it", () => {
    const solelyCoveredFarm = { x: 1, y: 0, terrain: "LAND" as const, resource: "FARM" as const };
    const soleBeacon = tile(0, 0); // only anchor reaching (1,0)
    const redundantFarm = { x: 21, y: 20, terrain: "LAND" as const, resource: "FARM" as const };
    const redundantBeacon = tile(20, 20); // reaches (21,20), but so does the town below
    const town: AutomationPlannerTile = {
      x: 22,
      y: 20,
      ownerId: PLAYER_ID,
      ownershipState: "SETTLED",
      terrain: "LAND",
      town: { populationTier: "SETTLEMENT" }
    };
    const tiles = [soleBeacon, solelyCoveredFarm, redundantBeacon, redundantFarm, town];
    expect(chooseLowValueBeaconToDisable(tiles, PLAYER_ID, tilesByKeyOf(tiles))).toEqual({ x: 20, y: 20 });
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

  it("prefers the low-value beacon over the FOOD-consuming-structure fallback", () => {
    const beacon = tile(2, 3);
    const dormant = new Set(["2,3"]);
    const result = foodSlotReliefFromPlannerInput([beacon], PLAYER_ID, dormant, tilesByKeyOf([beacon]), 3, 3);
    expect(result).toEqual({ disableTarget: { x: 2, y: 3 }, exhausted: true });
  });

  it("falls back to the FOOD-consuming-structure target when there's no beacon at all", () => {
    const structure = tile(2, 3, { type: "GRANARY" });
    const result = foodSlotReliefFromPlannerInput([structure], PLAYER_ID, new Set(), undefined, 3, 3);
    expect(result).toEqual({ disableTarget: { x: 2, y: 3 }, exhausted: true });
  });
});
