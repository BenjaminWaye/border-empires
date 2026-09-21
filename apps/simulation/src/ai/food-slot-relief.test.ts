import { describe, expect, it } from "vitest";

import {
  chooseFoodConsumingStructureToDisable,
  chooseLowValueBeaconToAbandon,
  chooseLowValueBeaconToDisable,
  chooseManuallyDisabledBeaconToReenable,
  chooseTownToAbandon,
  foodSlotReliefFromPlannerInput
} from "./food-slot-relief.js";
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
    expect(result).toEqual({ x: 2, y: 3, kind: "disable" });
  });

  it("falls back to any active FOOD-consuming structure when none is dormant", () => {
    // supply === demand (exactly full) never marks anything dormant, so
    // requiring dormancy used to leave the AI with no fallback target here.
    const structure = tile(4, 5, { type: "MINE" });
    expect(chooseFoodConsumingStructureToDisable([structure], PLAYER_ID, new Set())).toEqual({ x: 4, y: 5, kind: "disable" });
    expect(chooseFoodConsumingStructureToDisable([structure], PLAYER_ID, undefined)).toEqual({ x: 4, y: 5, kind: "disable" });
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
    expect(chooseFoodConsumingStructureToDisable(tiles, PLAYER_ID, undefined)).toEqual({ x: 1, y: 2, kind: "disable" });
  });
});

// Padding beacons along a single row (y fixed well under WORLD_HEIGHT=320),
// spaced 40 tiles apart on x (well past OUTPOST_REACH_RADIUS = 5, so none of
// them overlaps reach with each other or with a test's own tiles, and well
// within WORLD_WIDTH=640 so tileKeysInReach's coordinate wrapping can't fold
// them back into each other or off the fixed row), used to push a scenario's
// *total* active beacon count above RELAY_BEACON_FREE_FOOD_SLOT_COUNT (5) —
// chooseLowValueBeaconToDisable only ever picks a target once disabling one
// could actually free a FOOD slot, i.e. once the player owns more than the
// free-waiver count. Each sits on empty land so it never itself becomes the
// picked (lowest-value) target.
const PADDING_ROW_Y = 100;
const paddingBeacons = (count: number, startAtX = 200): AutomationPlannerTile[] =>
  Array.from({ length: count }, (_, i) => tile(startAtX + i * 40, PADDING_ROW_Y));

describe("chooseLowValueBeaconToDisable", () => {
  it("returns undefined without a tile lookup (can't evaluate reach value)", () => {
    expect(chooseLowValueBeaconToDisable([tile(1, 1), ...paddingBeacons(5)], PLAYER_ID, undefined)).toBeUndefined();
  });

  it("returns undefined when this player owns no active beacon", () => {
    expect(chooseLowValueBeaconToDisable([], PLAYER_ID, new Map())).toBeUndefined();
  });

  it("returns undefined when the player owns RELAY_BEACON_FREE_FOOD_SLOT_COUNT (5) or fewer active beacons — disabling any of them frees no FOOD slot, they're all within the free waiver", () => {
    // This is the exact bug behind the 2026-09-20 ai-2/Sigrid incident: with
    // only 1 beacon (well under the waiver count), the old logic disabled it
    // anyway, gaining zero FOOD relief and losing the only reach anchor she
    // had — permanently, since nothing ever re-enables a "manual" disable.
    const oneBeacon = [tile(10, 10)];
    expect(chooseLowValueBeaconToDisable(oneBeacon, PLAYER_ID, tilesByKeyOf(oneBeacon))).toBeUndefined();
    const fiveBeacons = paddingBeacons(5);
    expect(chooseLowValueBeaconToDisable(fiveBeacons, PLAYER_ID, tilesByKeyOf(fiveBeacons))).toBeUndefined();
  });

  it("picks an active beacon whose reach box holds no resource/dock/town tile, once beacon count exceeds the free waiver", () => {
    const beacon = tile(10, 10);
    const emptyLand = { x: 11, y: 10, terrain: "LAND" as const };
    const tiles = [beacon, emptyLand, ...paddingBeacons(5)];
    expect(chooseLowValueBeaconToDisable(tiles, PLAYER_ID, tilesByKeyOf(tiles))).toEqual({ x: 10, y: 10, kind: "disable" });
  });

  it("still picks the least-bad beacon even when every candidate's reach holds a FOOD tile it's the sole anchor over", () => {
    // No zero-value candidate exists at all (every beacon, including the
    // padding ones, is the sole anchor over an adjacent FARM), but requiring
    // one used to leave FREE_FOOD_SLOT with no target at all — picking the
    // least-bad option (lowest x, then y, once all foodLoss scores tie) is
    // strictly better than staying stuck.
    const beacon = tile(10, 10);
    const farm = { x: 11, y: 10, terrain: "LAND" as const, resource: "FARM" as const };
    const padding = paddingBeacons(5);
    const paddingFarms = padding.map((p) => ({ x: p.x + 1, y: p.y, terrain: "LAND" as const, resource: "FARM" as const }));
    const tiles = [beacon, farm, ...padding, ...paddingFarms];
    expect(chooseLowValueBeaconToDisable(tiles, PLAYER_ID, tilesByKeyOf(tiles))).toEqual({ x: 10, y: 10, kind: "disable" });
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
    const tiles = [soleBeacon, solelyCoveredFarm, redundantBeacon, redundantFarm, town, ...paddingBeacons(4)];
    expect(chooseLowValueBeaconToDisable(tiles, PLAYER_ID, tilesByKeyOf(tiles))).toEqual({ x: 20, y: 20, kind: "disable" });
  });

  it("skips a beacon that's already manually disabled, under construction, or not this player's", () => {
    const disabled = tile(10, 10, { status: "inactive", inactiveReason: "manual" });
    const building = tile(20, 20, { status: "under_construction" });
    const enemy = tile(30, 30, { ownerId: "ai-2" });
    const tiles = [disabled, building, enemy, ...paddingBeacons(5)];
    expect(chooseLowValueBeaconToDisable(tiles, PLAYER_ID, tilesByKeyOf(tiles))).toBeUndefined();
  });

  it("picks deterministically (lowest x, then y) among multiple zero-value beacons, once beacon count exceeds the free waiver", () => {
    const tiles = [tile(5, 5), tile(1, 9), tile(1, 2), ...paddingBeacons(5)];
    expect(chooseLowValueBeaconToDisable(tiles, PLAYER_ID, tilesByKeyOf(tiles))).toEqual({ x: 1, y: 2, kind: "disable" });
  });
});

describe("chooseLowValueBeaconToAbandon", () => {
  it("returns undefined without a tile lookup (can't evaluate reach value)", () => {
    expect(chooseLowValueBeaconToAbandon([tile(1, 1)], PLAYER_ID, undefined)).toBeUndefined();
  });

  it("returns undefined when this player owns no active beacon", () => {
    expect(chooseLowValueBeaconToAbandon([], PLAYER_ID, new Map())).toBeUndefined();
  });

  it("returns undefined when the player owns more than RELAY_BEACON_FREE_FOOD_SLOT_COUNT (5) active beacons — that's chooseLowValueBeaconToDisable's job, since disabling one of those actually helps", () => {
    const sixBeacons = paddingBeacons(6);
    expect(chooseLowValueBeaconToAbandon(sixBeacons, PLAYER_ID, tilesByKeyOf(sixBeacons))).toBeUndefined();
  });

  it("abandons the least-valuable beacon's tile when disabling it couldn't free a FOOD slot (5 or fewer owned)", () => {
    const beacon = tile(10, 10);
    const emptyLand = { x: 11, y: 10, terrain: "LAND" as const };
    const tiles = [beacon, emptyLand];
    expect(chooseLowValueBeaconToAbandon(tiles, PLAYER_ID, tilesByKeyOf(tiles))).toEqual({ x: 10, y: 10, kind: "abandon_beacon" });
  });

  it("picks the same least-bad beacon chooseLowValueBeaconToDisable would have, just as an abandon target", () => {
    const solelyCoveredFarm = { x: 1, y: 0, terrain: "LAND" as const, resource: "FARM" as const };
    const soleBeacon = tile(0, 0);
    const redundantFarm = { x: 21, y: 20, terrain: "LAND" as const, resource: "FARM" as const };
    const redundantBeacon = tile(20, 20);
    const town: AutomationPlannerTile = {
      x: 22,
      y: 20,
      ownerId: PLAYER_ID,
      ownershipState: "SETTLED",
      terrain: "LAND",
      town: { populationTier: "SETTLEMENT" }
    };
    const tiles = [soleBeacon, solelyCoveredFarm, redundantBeacon, redundantFarm, town];
    expect(chooseLowValueBeaconToAbandon(tiles, PLAYER_ID, tilesByKeyOf(tiles))).toEqual({ x: 20, y: 20, kind: "abandon_beacon" });
  });
});

describe("chooseManuallyDisabledBeaconToReenable", () => {
  it("returns undefined when no beacon is manually disabled", () => {
    expect(chooseManuallyDisabledBeaconToReenable([tile(10, 10)], PLAYER_ID)).toBeUndefined();
  });

  it("finds a manually-disabled beacon owned by this player", () => {
    const disabled = tile(10, 10, { status: "inactive", inactiveReason: "manual" });
    expect(chooseManuallyDisabledBeaconToReenable([disabled], PLAYER_ID)).toEqual({ x: 10, y: 10 });
  });

  it("ignores a beacon disabled for upkeep (not manual), or belonging to another player", () => {
    const upkeepDisabled = tile(10, 10, { status: "inactive", inactiveReason: "upkeep" });
    const enemyDisabled = tile(20, 20, { status: "inactive", inactiveReason: "manual", ownerId: "ai-2" });
    expect(chooseManuallyDisabledBeaconToReenable([upkeepDisabled, enemyDisabled], PLAYER_ID)).toBeUndefined();
  });

  it("ignores a non-beacon structure that happens to be manually disabled", () => {
    const disabledGranary = tile(10, 10, { type: "GRANARY", status: "inactive", inactiveReason: "manual" });
    expect(chooseManuallyDisabledBeaconToReenable([disabledGranary], PLAYER_ID)).toBeUndefined();
  });

  it("picks deterministically (lowest x, then y) among multiple manually-disabled beacons", () => {
    const a = tile(5, 5, { status: "inactive", inactiveReason: "manual" });
    const b = tile(1, 9, { status: "inactive", inactiveReason: "manual" });
    const c = tile(1, 2, { status: "inactive", inactiveReason: "manual" });
    expect(chooseManuallyDisabledBeaconToReenable([a, b, c], PLAYER_ID)).toEqual({ x: 1, y: 2 });
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

  it("abandons the low-value beacon (not disable — 1 beacon is within the free waiver) over the FOOD-consuming-structure fallback", () => {
    const beacon = tile(2, 3);
    const dormant = new Set(["2,3"]);
    const result = foodSlotReliefFromPlannerInput([beacon], PLAYER_ID, dormant, tilesByKeyOf([beacon]), 3, 3);
    expect(result).toEqual({ reliefTarget: { x: 2, y: 3, kind: "abandon_beacon" }, exhausted: true, reenableTarget: undefined });
  });

  it("prefers disabling the low-value beacon over the FOOD-consuming-structure fallback once beacon count exceeds the free waiver", () => {
    const beacon = tile(2, 3);
    const padding = paddingBeacons(5);
    const allTiles = [beacon, ...padding];
    const dormant = new Set(["2,3"]);
    const result = foodSlotReliefFromPlannerInput(allTiles, PLAYER_ID, dormant, tilesByKeyOf(allTiles), 3, 3);
    expect(result).toEqual({ reliefTarget: { x: 2, y: 3, kind: "disable" }, exhausted: true, reenableTarget: undefined });
  });

  it("falls back to the FOOD-consuming-structure target when there's no beacon at all", () => {
    const structure = tile(2, 3, { type: "GRANARY" });
    const result = foodSlotReliefFromPlannerInput([structure], PLAYER_ID, new Set(), undefined, 3, 3);
    expect(result).toEqual({ reliefTarget: { x: 2, y: 3, kind: "disable" }, exhausted: true, reenableTarget: undefined });
  });

  it("falls all the way back to abandoning a town when no structure exists to disable either", () => {
    // Mirrors a player whose entire FOOD demand comes from town population,
    // not any structure — e.g. only 2 techs in, no beacon or economic
    // structure built yet.
    const capital: AutomationPlannerTile = {
      x: 1,
      y: 1,
      ownerId: PLAYER_ID,
      ownershipState: "SETTLED",
      terrain: "LAND",
      town: { populationTier: "SETTLEMENT" }
    };
    const secondTown: AutomationPlannerTile = {
      x: 2,
      y: 2,
      ownerId: PLAYER_ID,
      ownershipState: "SETTLED",
      terrain: "LAND",
      town: { populationTier: "TOWN" }
    };
    const result = foodSlotReliefFromPlannerInput([capital, secondTown], PLAYER_ID, undefined, undefined, 3, 3);
    expect(result).toEqual({ reliefTarget: { x: 2, y: 2, kind: "abandon_town" }, exhausted: true, reenableTarget: undefined });
  });

  it("returns a reenable target instead of a relief target once FOOD has headroom again and a beacon was manually disabled", () => {
    const disabledBeacon = tile(4, 5, { status: "inactive", inactiveReason: "manual" });
    const result = foodSlotReliefFromPlannerInput([disabledBeacon], PLAYER_ID, undefined, undefined, 10, 3, false, 1);
    expect(result).toEqual({ reliefTarget: undefined, exhausted: false, reenableTarget: { x: 4, y: 5 } });
  });

  it("reports no reenable target once FOOD has headroom but nothing is manually disabled", () => {
    const result = foodSlotReliefFromPlannerInput([], PLAYER_ID, undefined, undefined, 10, 3, false, 1);
    expect(result).toEqual({ reliefTarget: undefined, exhausted: false, reenableTarget: undefined });
  });

  it("never reports a reenable target while still exhausted, even if a beacon is manually disabled", () => {
    const disabledBeacon = tile(4, 5, { status: "inactive", inactiveReason: "manual" });
    const result = foodSlotReliefFromPlannerInput([disabledBeacon], PLAYER_ID, undefined, undefined, 3, 3, false, 1);
    expect(result.reenableTarget).toBeUndefined();
    expect(result.exhausted).toBe(true);
  });

  it("skips the reenable scan entirely (cheap ownedRelayBeaconCount pre-check) when the caller doesn't report owning any RELAY_BEACON — the AI CPU guardrail path", () => {
    // Mirrors automation-command-planner-owned-tile-scaling.test.ts: most
    // players own zero beacons at any given time, so this must be an O(1)
    // check, never a scan of ownedTiles, for that common case. A stale
    // ownedStructureCounts (beacon built this exact tick, count not yet
    // incremented) just means a one-tick-late reenable, not a correctness
    // bug — see the JSDoc above foodSlotReliefFromPlannerInput.
    const disabledBeacon = tile(4, 5, { status: "inactive", inactiveReason: "manual" });
    const result = foodSlotReliefFromPlannerInput([disabledBeacon], PLAYER_ID, undefined, undefined, 10, 3, false, 0);
    expect(result).toEqual({ reliefTarget: undefined, exhausted: false, reenableTarget: undefined });
    const resultUndefinedCount = foodSlotReliefFromPlannerInput([disabledBeacon], PLAYER_ID, undefined, undefined, 10, 3);
    expect(resultUndefinedCount.reenableTarget).toBeUndefined();
  });
});

describe("chooseTownToAbandon", () => {
  const town = (x: number, y: number, populationTier: NonNullable<AutomationPlannerTile["town"]>["populationTier"]): AutomationPlannerTile => ({
    x,
    y,
    ownerId: PLAYER_ID,
    ownershipState: "SETTLED",
    terrain: "LAND",
    town: { populationTier }
  });

  it("returns undefined when this player owns one settled town or none", () => {
    expect(chooseTownToAbandon([], PLAYER_ID)).toBeUndefined();
    expect(chooseTownToAbandon([town(1, 1, "SETTLEMENT")], PLAYER_ID)).toBeUndefined();
    expect(chooseTownToAbandon([town(1, 1, "CITY")], PLAYER_ID)).toBeUndefined();
  });

  it("never picks the SETTLEMENT-tier capital, even as the only eligible-looking candidate", () => {
    // handleUncaptureTileCommand rejects abandoning the SETTLEMENT tier
    // outright ("cannot abandon your settlement") — mirror that here rather
    // than issuing a command that's guaranteed to be rejected.
    const capital = town(1, 1, "SETTLEMENT");
    const alsoSettlement = town(2, 2, "SETTLEMENT");
    expect(chooseTownToAbandon([capital, alsoSettlement], PLAYER_ID)).toBeUndefined();
  });

  it("picks the least-developed non-SETTLEMENT town among several", () => {
    const capital = town(1, 1, "SETTLEMENT");
    const city = town(5, 5, "CITY");
    const smallTown = town(9, 9, "TOWN");
    const metropolis = town(3, 3, "METROPOLIS");
    expect(chooseTownToAbandon([capital, city, smallTown, metropolis], PLAYER_ID)).toEqual({ x: 9, y: 9, kind: "abandon_town" });
  });

  it("picks deterministically (lowest x, then y) among equally-developed towns", () => {
    const capital = town(0, 0, "SETTLEMENT");
    const townA = town(5, 5, "TOWN");
    const townB = town(1, 9, "TOWN");
    const townC = town(1, 2, "TOWN");
    expect(chooseTownToAbandon([capital, townA, townB, townC], PLAYER_ID)).toEqual({ x: 1, y: 2, kind: "abandon_town" });
  });

  it("ignores a town belonging to a different player or not currently SETTLED, even with another eligible town present", () => {
    const capital = town(1, 1, "SETTLEMENT");
    const ownTown = town(4, 4, "TOWN");
    const enemyTown = { ...town(2, 2, "TOWN"), ownerId: "ai-2" };
    const frontierTown = { ...town(3, 3, "TOWN"), ownershipState: "FRONTIER" as const };
    expect(chooseTownToAbandon([capital, ownTown, enemyTown, frontierTown], PLAYER_ID)).toEqual({ x: 4, y: 4, kind: "abandon_town" });
  });
});
