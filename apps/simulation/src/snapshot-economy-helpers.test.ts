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

describe("buildStrategicProductionByPlayer — Hydrogarden food (snapshot/subscribe path)", () => {
  it("adds no Hydrogarden food to the empire-wide FOOD total (§5.4: FOOD is slot-based, not yield-based)", () => {
    const withoutHydrogarden = buildStrategicProductionByPlayer(runtimeWith([farmTile()]) as never).get("p1")!.FOOD;
    const withHydrogarden = buildStrategicProductionByPlayer(runtimeWith([farmTile("HYDROGARDEN")]) as never).get("p1")!.FOOD;
    expect(withHydrogarden).toBe(withoutHydrogarden);
    expect(withHydrogarden).toBe(0);
  });

  it("an active Hydroworks still adds no FOOD production (§5.4: FOOD is slot-based, not yield-based)", () => {
    const hydroworks = { x: 12, y: 10, terrain: "LAND", ownerId: "p1", ownershipState: "SETTLED", economicStructureJson: JSON.stringify({ type: "HYDROWORKS", status: "active", ownerId: "p1" }) };
    const base = buildStrategicProductionByPlayer(runtimeWith([farmTile()]) as never).get("p1")!.FOOD;
    const boosted = buildStrategicProductionByPlayer(runtimeWith([farmTile("HYDROGARDEN"), hydroworks]) as never).get("p1")!.FOOD;
    expect(boosted).toBe(base);
    expect(boosted).toBe(0);
  });

  it("gives no Hydrogarden food bonus on a FISH tile", () => {
    const fishBase = buildStrategicProductionByPlayer(runtimeWith([farmTile(undefined, "FISH")]) as never).get("p1")!.FOOD;
    const fishHydrogarden = buildStrategicProductionByPlayer(runtimeWith([farmTile("HYDROGARDEN", "FISH")]) as never).get("p1")!.FOOD;
    expect(fishHydrogarden).toBeCloseTo(fishBase, 6);
  });
});
