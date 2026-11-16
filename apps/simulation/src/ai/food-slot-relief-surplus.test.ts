import { describe, expect, it } from "vitest";
import type { AutomationPlannerTile } from "./automation-command-planner-types.js";
import { foodSlotReliefFromPlannerInput } from "./food-slot-relief.js";
import {
  chooseManuallyDisabledFoodConsumerToReenable,
  chooseSurplusProducerToDisable,
  resourceSlotHeadroomFrom,
  withOneSpareFoodSlot
} from "./food-slot-relief-surplus.js";

const PLAYER_ID = "ai-1";

type Structure = NonNullable<AutomationPlannerTile["economicStructure"]>;

const building = (x: number, y: number, structure: Partial<Structure>, extra: Partial<AutomationPlannerTile> = {}): AutomationPlannerTile => ({
  x,
  y,
  ownerId: PLAYER_ID,
  ownershipState: "SETTLED",
  terrain: "LAND",
  economicStructure: { ownerId: PLAYER_ID, status: "active", ...structure },
  ...extra
});

const lookup = (tiles: readonly AutomationPlannerTile[]): ReadonlyMap<string, AutomationPlannerTile> =>
  new Map(tiles.map((t) => [`${t.x},${t.y}`, t]));

// Beacons far apart so each holds its own reach (not redundant).
const isolatedBeacons = (count: number): AutomationPlannerTile[] =>
  Array.from({ length: count }, (_, i) => building(100 + i * 40, 100, { type: "RELAY_BEACON" }));

describe("chooseSurplusProducerToDisable", () => {
  // Staging season-41: ai-10 ran 9 Umbrite Rigs (1 FOOD each) at UMBRITE 31/1;
  // refineries are the FOOD-using producers now. A refinery can add up to
  // 8 tiles x 3 slots, so only a surplus that large lets it go.
  const refinery = building(10, 10, { type: "UMBRITE_REFINERY" });

  it("picks a FOOD-using refinery whose resource is well in surplus", () => {
    expect(chooseSurplusProducerToDisable([refinery], PLAYER_ID, { UMBRITE: 30 })).toEqual({ x: 10, y: 10, kind: "disable" });
  });

  it("keeps a refinery when its resource has less headroom than a full field could add", () => {
    expect(chooseSurplusProducerToDisable([refinery], PLAYER_ID, { UMBRITE: 23 })).toBeUndefined();
    expect(chooseSurplusProducerToDisable([refinery], PLAYER_ID, undefined)).toBeUndefined();
  });

  it("maps a Crystal Refinery to CRYSTAL slots", () => {
    const crystal = building(4, 4, { type: "CRYSTAL_REFINERY" });
    expect(chooseSurplusProducerToDisable([crystal], PLAYER_ID, { CRYSTAL: 30, TITANIUM: 0 })).toEqual({ x: 4, y: 4, kind: "disable" });
    expect(chooseSurplusProducerToDisable([crystal], PLAYER_ID, { CRYSTAL: 0, TITANIUM: 30 })).toBeUndefined();
  });
});

describe("foodSlotReliefFromPlannerInput — expansion-first order", () => {
  const manufactory = building(50, 50, { type: "MANUFACTORY" });

  it("switches off a surplus refinery before any beacon, even at exactly-full FOOD", () => {
    const refinery = building(10, 10, { type: "UMBRITE_REFINERY" });
    const tiles = [refinery, manufactory, ...isolatedBeacons(6)];
    const result = foodSlotReliefFromPlannerInput(tiles, PLAYER_ID, undefined, lookup(tiles), 10, 10, false, 6, 0, { UMBRITE: 30 });
    expect(result.reliefTarget).toEqual({ x: 10, y: 10, kind: "disable" });
  });

  it("at exactly-full FOOD with nothing free to give up, leaves working buildings and land-holding beacons alone", () => {
    const tiles = [manufactory, ...isolatedBeacons(6)];
    const result = foodSlotReliefFromPlannerInput(tiles, PLAYER_ID, new Set(), lookup(tiles), 10, 10, false, 6);
    expect(result.exhausted).toBe(true);
    expect(result.reliefTarget).toBeUndefined();
  });

  it("at exactly-full FOOD, does free a slot when a beacon site is waiting on it — working building first", () => {
    const tiles = [manufactory, ...isolatedBeacons(6)];
    const result = foodSlotReliefFromPlannerInput(tiles, PLAYER_ID, new Set(), lookup(tiles), 10, 10, false, 6, 0, undefined, () => true);
    expect(result.reliefTarget).toEqual({ x: 50, y: 50, kind: "disable" });
  });

  it("only asks whether a beacon is waiting when free relief found nothing", () => {
    const refinery = building(10, 10, { type: "UMBRITE_REFINERY" });
    let asked = false;
    foodSlotReliefFromPlannerInput([refinery], PLAYER_ID, undefined, lookup([refinery]), 10, 10, false, 0, 0, { UMBRITE: 30 }, () => {
      asked = true;
      return true;
    });
    expect(asked).toBe(false);
  });

  it("at exactly-full FOOD, switches off a beacon whose whole reach other anchors already cover", () => {
    // (10,10)'s reach (5..15 square) is fully covered by the four corner beacons;
    // each corner still holds unique outer ground of its own.
    const covered = building(10, 10, { type: "RELAY_BEACON" });
    const corners = [[5, 5], [15, 5], [5, 15], [15, 15]].map(([x, y]) => building(x!, y!, { type: "RELAY_BEACON" }));
    const tiles = [manufactory, covered, ...corners, ...isolatedBeacons(2)];
    const result = foodSlotReliefFromPlannerInput(tiles, PLAYER_ID, new Set(), lookup(tiles), 10, 10, false, 7);
    expect(result.reliefTarget).toEqual({ x: 10, y: 10, kind: "disable" });
  });

  it("in a FOOD deficit, switches off a working building before a land-holding beacon", () => {
    const tiles = [manufactory, ...isolatedBeacons(6)];
    const result = foodSlotReliefFromPlannerInput(tiles, PLAYER_ID, new Set(), lookup(tiles), 9, 10, false, 6);
    expect(result.reliefTarget).toEqual({ x: 50, y: 50, kind: "disable" });
  });
});

describe("re-enabling non-beacon FOOD consumers", () => {
  const disabledManufactory = building(5, 5, { type: "MANUFACTORY", status: "inactive", inactiveReason: "manual" });

  it("re-enables a manually disabled working building once FOOD has room to spare", () => {
    expect(chooseManuallyDisabledFoodConsumerToReenable([disabledManufactory], PLAYER_ID, undefined)).toEqual({ x: 5, y: 5 });
    const result = foodSlotReliefFromPlannerInput([disabledManufactory], PLAYER_ID, undefined, undefined, 12, 10, false, 0);
    expect(result.reenableTarget).toEqual({ x: 5, y: 5 });
  });

  it("waits while re-enabling would land exactly on full", () => {
    const result = foodSlotReliefFromPlannerInput([disabledManufactory], PLAYER_ID, undefined, undefined, 11, 10, false, 0);
    expect(result.reenableTarget).toBeUndefined();
  });

  it("skips a building still in overload recovery, or whose CRYSTAL slot doesn't fit", () => {
    const recovering = building(5, 5, { type: "MANUFACTORY", status: "inactive", inactiveReason: "manual", disabledUntil: 5_000 });
    expect(chooseManuallyDisabledFoodConsumerToReenable([recovering], PLAYER_ID, undefined, 1_000)).toBeUndefined();
    expect(chooseManuallyDisabledFoodConsumerToReenable([recovering], PLAYER_ID, undefined, 6_000)).toEqual({ x: 5, y: 5 });
    const works = building(6, 6, { type: "NEURAL_WORKS", status: "inactive", inactiveReason: "manual" });
    expect(chooseManuallyDisabledFoodConsumerToReenable([works], PLAYER_ID, { CRYSTAL: 0 }, 1_000)).toBeUndefined();
    expect(chooseManuallyDisabledFoodConsumerToReenable([works], PLAYER_ID, { CRYSTAL: 1 }, 1_000)).toEqual({ x: 6, y: 6 });
  });

  it("picks a disabled beacon before a disabled building in the same pass", () => {
    const beacon = building(9, 9, { type: "RELAY_BEACON", status: "inactive", inactiveReason: "manual" });
    const result = foodSlotReliefFromPlannerInput([disabledManufactory, beacon], PLAYER_ID, undefined, undefined, 12, 10, false, 6);
    expect(result.reenableTarget).toEqual({ x: 9, y: 9 });
  });

  it("leaves a surplus producer off while its resource is still in surplus", () => {
    const refinery = building(3, 3, { type: "UMBRITE_REFINERY", status: "inactive", inactiveReason: "manual" });
    expect(chooseManuallyDisabledFoodConsumerToReenable([refinery], PLAYER_ID, { UMBRITE: 30 })).toBeUndefined();
    expect(chooseManuallyDisabledFoodConsumerToReenable([refinery], PLAYER_ID, { UMBRITE: 0 })).toEqual({ x: 3, y: 3 });
  });
});

describe("helpers", () => {
  it("computes non-FOOD headroom from supply and demand", () => {
    expect(resourceSlotHeadroomFrom({ FOOD: 9, UMBRITE: 31, TITANIUM: 3 }, { FOOD: 9, UMBRITE: 1, TITANIUM: 9 })).toEqual({ TITANIUM: -6, CRYSTAL: 0, UMBRITE: 30 });
    expect(resourceSlotHeadroomFrom(undefined, undefined)).toBeUndefined();
  });

  it("adds exactly one FOOD slot of supply", () => {
    expect(withOneSpareFoodSlot({ slotSupplyByResource: { FOOD: 10, UMBRITE: 2 } }).slotSupplyByResource).toEqual({ FOOD: 11, UMBRITE: 2 });
  });
});
