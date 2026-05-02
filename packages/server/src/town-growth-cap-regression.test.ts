import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { TOWN_MANPOWER_BY_TIER } from "./server-game-constants.js";
import type { TownDefinition } from "./server-shared-types.js";
import { createServerTownSupport } from "./server-town-support.js";

const key = (x: number, y: number): `${number},${number}` => `${x},${y}`;

describe("town growth cap regression", () => {
  it("backfills a stable initial growth cap for legacy towns", () => {
    const town: TownDefinition = {
      townId: "town-1",
      tileKey: key(1, 1),
      type: "MARKET",
      population: 50_000,
      maxPopulation: 10_000_000,
      connectedTownCount: 0,
      connectedTownBonus: 0,
      lastGrowthTickAt: 0
    };
    const townsByTile = new Map([[town.tileKey, town]]);
    const runtime = createServerTownSupport({
      now: () => 0,
      parseKey: (tileKey) => tileKey.split(",").map(Number) as [number, number],
      key,
      wrapX: (x) => x,
      wrapY: (y) => y,
      chebyshevDistance: () => 0,
      WORLD_WIDTH: 10,
      WORLD_HEIGHT: 10,
      POPULATION_TOWN_MIN: 10_000,
      MANPOWER_EPSILON: 1e-6,
      TOWN_MANPOWER_BY_TIER,
      townsByTile,
      ownership: new Map(),
      ownershipStateByTile: new Map(),
      townGrowthShockUntilByTile: new Map(),
      townCaptureShockUntilByTile: new Map(),
      terrainAt: () => "LAND",
      ownedTownKeysForPlayer: () => [],
      isTownFedForOwner: () => true
    });

    expect(runtime.townPopulationTierForTown(town)).toBe("TOWN");
    expect(town.growthTierCap).toBe("TOWN");

    town.population = 120_000;
    expect(runtime.townPopulationTierForTown(town)).toBe("TOWN");

    town.growthTierCap = "CITY";
    expect(runtime.townPopulationTierForTown(town)).toBe("CITY");
  });


  it("does not downgrade legacy founded cities that still carry isSettlement", () => {
    const town: TownDefinition = {
      townId: "town-2",
      tileKey: key(2, 2),
      type: "MARKET",
      population: 150_000,
      maxPopulation: 10_000_000,
      connectedTownCount: 0,
      connectedTownBonus: 0,
      lastGrowthTickAt: 0,
      isSettlement: true
    };
    const townsByTile = new Map([[town.tileKey, town]]);
    const runtime = createServerTownSupport({
      now: () => 0,
      parseKey: (tileKey) => tileKey.split(",").map(Number) as [number, number],
      key,
      wrapX: (x) => x,
      wrapY: (y) => y,
      chebyshevDistance: () => 0,
      WORLD_WIDTH: 10,
      WORLD_HEIGHT: 10,
      POPULATION_TOWN_MIN: 10_000,
      MANPOWER_EPSILON: 1e-6,
      TOWN_MANPOWER_BY_TIER,
      townsByTile,
      ownership: new Map(),
      ownershipStateByTile: new Map(),
      townGrowthShockUntilByTile: new Map(),
      townCaptureShockUntilByTile: new Map(),
      terrainAt: () => "LAND",
      ownedTownKeysForPlayer: () => [],
      isTownFedForOwner: () => true
    });

    expect(runtime.townPopulationTierForTown(town)).toBe("CITY");
    expect(town.growthTierCap).toBe("CITY");
  });

  it("keeps town income tied to the capped growth tier", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(resolve(here, "./server-town-economy-runtime.ts"), "utf8");
    expect(source).toContain("townPopulationMultiplier(town.population, town.growthTierCap)");
  });
});
