import { describe, expect, it } from "vitest";

import type { Tile } from "./client-types.js";
import { townHasSupportStructureType } from "./client-support-structures.js";

const townTile = (x: number, y: number): Tile => ({
  x,
  y,
  terrain: "LAND",
  ownerId: "me",
  ownershipState: "SETTLED",
  town: {
    type: "MARKET",
    baseGoldPerMinute: 1,
    supportCurrent: 0,
    supportMax: 8,
    goldPerMinute: 1,
    cap: 100,
    isFed: true,
    population: 12000,
    maxPopulation: 100000,
    populationTier: "TOWN",
    connectedTownCount: 0,
    connectedTownBonus: 0,
    hasMarket: false,
    marketActive: false,
    hasGranary: false,
    granaryActive: false,
    hasBank: false,
    bankActive: false
  }
});

const supportTile = (x: number, y: number, type: NonNullable<Tile["economicStructure"]>["type"], status: NonNullable<Tile["economicStructure"]>["status"]): Tile => ({
  x,
  y,
  terrain: "LAND",
  ownerId: "me",
  ownershipState: "SETTLED",
  economicStructure: {
    ownerId: "me",
    type,
    status
  }
});

describe("townHasSupportStructureType", () => {
  it("treats under-construction support buildings as occupying the town slot", () => {
    const town = townTile(10, 10);
    const tiles = [town, supportTile(11, 10, "FUR_SYNTHESIZER", "under_construction")];
    expect(townHasSupportStructureType(tiles, town, "me", "FUR_SYNTHESIZER")).toBe(true);
  });

  it("treats advanced variants as occupying the same base support-building slot", () => {
    const town = townTile(10, 10);
    const tiles = [town, supportTile(10, 11, "ADVANCED_CRYSTAL_SYNTHESIZER", "active")];
    expect(townHasSupportStructureType(tiles, town, "me", "CRYSTAL_SYNTHESIZER")).toBe(true);
  });

  it("ignores unrelated support structures", () => {
    const town = townTile(10, 10);
    const tiles = [town, supportTile(11, 11, "MARKET", "active")];
    expect(townHasSupportStructureType(tiles, town, "me", "FUR_SYNTHESIZER")).toBe(false);
  });
});
