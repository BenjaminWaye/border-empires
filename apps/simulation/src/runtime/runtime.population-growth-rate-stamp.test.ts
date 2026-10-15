import { describe, expect, it } from "vitest";

import { SimulationRuntime } from "./runtime.js";

// Fixture conventions mirror runtime.population-growth-isfed-heal.test.ts.
const TOWN_POP = 50_000;
const TOWN_MAX = 5_000_000;

const makePlayer = (id: string) => ({
  id,
  isAi: false,
  points: 500,
  manpower: 100,
  techIds: new Set<string>(),
  domainIds: new Set<string>(),
  mods: { attack: 1, defense: 1, income: 1, vision: 5 },
  techRootId: "rewrite-local",
  allies: new Set<string>(),
  strategicResources: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 }
});

const makeTownTile = (x: number, y: number, ownerId: string, isFed: boolean) => ({
  x,
  y,
  terrain: "LAND" as const,
  ownerId,
  ownershipState: "SETTLED" as const,
  town: { type: "FARMING" as const, populationTier: "TOWN" as const, population: TOWN_POP, maxPopulation: TOWN_MAX, isFed }
});

// Two FISH tiles = 4 FOOD supply, exactly one TOWN-tier town's demand.
const makeFoodTiles = (ownerId: string, x = 11, y = 10) => [
  { x, y, terrain: "LAND" as const, ownerId, ownershipState: "SETTLED" as const, resource: "FISH" as const },
  { x: x + 1, y, terrain: "LAND" as const, ownerId, ownershipState: "SETTLED" as const, resource: "FISH" as const }
];

const townOf = (tile: { townJson?: string } | undefined): { population?: number; populationGrowthPerMinute?: number; isFed?: boolean } =>
  tile?.townJson ? (JSON.parse(tile.townJson) as { population?: number; populationGrowthPerMinute?: number; isFed?: boolean }) : {};

describe("SimulationRuntime tickPopulationGrowth — growth-rate stamp", () => {
  // Regression: the growth tick re-sends every growing town's stored record
  // as a tile delta each minute, and the client replaces its whole town
  // summary with it. Seeded towns never had populationGrowthPerMinute on
  // that record, so each tick wiped the rate and the town overview read
  // "0.00/m — growth paused" until the next tile-detail fetch.
  it("stamps the applied growth rate on a town it grows", () => {
    let now = 1_000;
    const runtime = new SimulationRuntime({
      now: () => now,
      initialPlayers: new Map([["p1", makePlayer("p1")]]),
      initialState: { tiles: [makeTownTile(10, 10, "p1", true), ...makeFoodTiles("p1")], activeLocks: [] }
    });

    runtime.tickPopulationGrowth(now);
    now = 61_000;
    runtime.tickPopulationGrowth(now);

    const town = townOf(runtime.exportState().tiles.find((t) => t.x === 10 && t.y === 10));
    expect(town.population).toBeGreaterThan(TOWN_POP);
    expect(town.populationGrowthPerMinute).toBeGreaterThan(0);
    expect(town.populationGrowthPerMinute).toBeCloseTo((town.population ?? 0) - TOWN_POP, 3);
  });

  it("stamps a zero rate when the self-heal marks a town unfed", () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["p1", makePlayer("p1")]]),
      // One town's worth of FOOD for two towns: (10,10) sorts first in the
      // dormancy loop and goes unfed (see the isFed self-heal test).
      initialState: { tiles: [makeTownTile(10, 10, "p1", true), makeTownTile(20, 20, "p1", true), ...makeFoodTiles("p1")], activeLocks: [] }
    });

    runtime.tickPopulationGrowth(1_000);

    const town = townOf(runtime.exportState().tiles.find((t) => t.x === 10 && t.y === 10));
    expect(town.isFed).toBe(false);
    expect(town.populationGrowthPerMinute).toBe(0);
  });
});
