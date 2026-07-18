import { describe, expect, it } from "vitest";

import { buildStrategicProductionByPlayer } from "./snapshot-economy-helpers.js";

// Distinct runtimeState objects per case — buildStrategicProductionByPlayer is
// memoised on the runtimeState reference.
const runtimeWith = (tiles: Array<Record<string, unknown>>) => ({
  terrainEpoch: Math.floor(Math.random() * 1_000_000),
  tiles,
  players: [{ id: "p1" }]
});

const farmTile = (structureType?: string, resource: string = "FARM") => ({
  x: 10,
  y: 10,
  terrain: "LAND",
  ownerId: "p1",
  ownershipState: "SETTLED",
  resource,
  ...(structureType ? { economicStructureJson: JSON.stringify({ type: structureType, status: "active", ownerId: "p1" }) } : {})
});

const FARMSTEAD_FOOD_PER_MIN = (48 * 0.5) / 1440;

describe("buildStrategicProductionByPlayer — Farmstead food (snapshot/subscribe path)", () => {
  it("adds Farmstead's +50% food to the empire-wide FOOD total", () => {
    const withoutFarmstead = buildStrategicProductionByPlayer(runtimeWith([farmTile()]) as never).get("p1")!.FOOD;
    const withFarmstead = buildStrategicProductionByPlayer(runtimeWith([farmTile("FARMSTEAD")]) as never).get("p1")!.FOOD;
    expect(withFarmstead - withoutFarmstead).toBeCloseTo(FARMSTEAD_FOOD_PER_MIN, 6);
  });

  it("doubles the Farmstead bonus when within radius of an active Waterworks", () => {
    const waterworks = { x: 12, y: 10, terrain: "LAND", ownerId: "p1", ownershipState: "SETTLED", economicStructureJson: JSON.stringify({ type: "WATERWORKS", status: "active", ownerId: "p1" }) };
    const base = buildStrategicProductionByPlayer(runtimeWith([farmTile()]) as never).get("p1")!.FOOD;
    const boosted = buildStrategicProductionByPlayer(runtimeWith([farmTile("FARMSTEAD"), waterworks]) as never).get("p1")!.FOOD;
    expect(boosted - base).toBeCloseTo(FARMSTEAD_FOOD_PER_MIN * 2, 6);
  });

  it("gives no Farmstead food bonus on a FISH tile", () => {
    const fishBase = buildStrategicProductionByPlayer(runtimeWith([farmTile(undefined, "FISH")]) as never).get("p1")!.FOOD;
    const fishFarmstead = buildStrategicProductionByPlayer(runtimeWith([farmTile("FARMSTEAD", "FISH")]) as never).get("p1")!.FOOD;
    expect(fishFarmstead).toBeCloseTo(fishBase, 6);
  });
});
