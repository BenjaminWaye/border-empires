import { describe, expect, it, beforeEach } from "vitest";

import { SimulationRuntime } from "./runtime.js";
import { POPULATION_GROWTH_BASE_RATE, POPULATION_MAX } from "@border-empires/game-domain";

const TOWN_POP = 50_000;
const TOWN_MAX = 5_000_000;

type TestPlayer = {
  id: string;
  isAi: boolean;
  points: number;
  manpower: number;
  techIds: Set<string>;
  domainIds: Set<string>;
  mods: { attack: number; defense: number; income: number; vision: number };
  techRootId: string;
  allies: Set<string>;
  strategicResources: Partial<Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD" | "OIL", number>>;
};

const makePlayer = (id: string): TestPlayer => ({
  id,
  isAi: false,
  points: 500,
  manpower: 100,
  techIds: new Set<string>(),
  domainIds: new Set<string>(),
  mods: { attack: 1, defense: 1, income: 1, vision: 5 },
  techRootId: "rewrite-local",
  allies: new Set<string>(),
  strategicResources: { FOOD: 100, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0, OIL: 0 }
});

const makeTownTile = (
  x: number,
  y: number,
  ownerId: string,
  overrides: Partial<{
    type: "FARMING" | "MARKET";
    populationTier: "SETTLEMENT" | "TOWN" | "CITY" | "GREAT_CITY" | "METROPOLIS";
    population: number;
    maxPopulation: number;
    isFed: boolean;
    captureShockUntil: number;
  }> = {}
) => ({
  x,
  y,
  terrain: "LAND" as const,
  ownerId,
  ownershipState: "SETTLED" as const,
  town: {
    type: (overrides.type ?? "FARMING") as "FARMING",
    populationTier: (overrides.populationTier ?? "TOWN") as "TOWN",
    population: overrides.population ?? TOWN_POP,
    maxPopulation: overrides.maxPopulation ?? TOWN_MAX,
    isFed: overrides.isFed ?? true,
    ...(overrides.captureShockUntil ? { captureShockUntil: overrides.captureShockUntil } : {})
  }
});

/** Parse townJson from an exportState tile. */
const townPop = (tile: { townJson?: string; townPopulationTier?: string }): number | undefined => {
  if (!tile.townJson) return undefined;
  const town = JSON.parse(tile.townJson) as { population?: number };
  return town.population;
};

describe("SimulationRuntime tickPopulationGrowth", () => {
  let runtime: SimulationRuntime;
  let now: number;

  beforeEach(() => {
    now = 1_700_000_000_000;
    const player = makePlayer("p1");
    const tile = makeTownTile(10, 10, "p1");
    runtime = new SimulationRuntime({
      now: () => now,
      initialPlayers: new Map([["p1", player]]),
      initialState: {
        tiles: [tile],
        activeLocks: []
      }
    });
  });

  it("does not grow population on the first tick (zero elapsed)", () => {
    runtime.tickPopulationGrowth(now);
    const exported = runtime.exportState();
    const tile = exported.tiles.find((t) => t.x === 10 && t.y === 10);
    expect(tile).toBeDefined();
    expect(townPop(tile!)).toBe(TOWN_POP);
  });

  it("grows population after elapsed minutes", () => {
    // First tick seeds the timer (zero elapsed).
    runtime.tickPopulationGrowth(now);
    // Advance time by 60 minutes and tick again.
    now += 60 * 60_000;
    runtime.tickPopulationGrowth(now);
    const exported = runtime.exportState();
    const tile = exported.tiles.find((t) => t.x === 10 && t.y === 10);
    expect(tile).toBeDefined();
    const pop = townPop(tile!)!;

    const logistic = 1 - TOWN_POP / TOWN_MAX;
    const expectedPerMin = TOWN_POP * POPULATION_GROWTH_BASE_RATE * logistic;
    const expectedGrowth = expectedPerMin * 60;
    expect(pop).toBeGreaterThan(TOWN_POP);
    expect(pop).toBeLessThanOrEqual(TOWN_POP + expectedGrowth * 1.01);
    expect(pop).toBeGreaterThan(TOWN_POP + expectedGrowth * 0.99);
  });

  it("skips settlement-tier towns", () => {
    const settlementTile = {
      x: 11,
      y: 11,
      terrain: "LAND" as const,
      ownerId: "p1",
      ownershipState: "SETTLED" as const,
      town: {
        type: "FARMING" as const,
        populationTier: "SETTLEMENT" as const,
        population: 5000,
        maxPopulation: POPULATION_MAX,
        isFed: true
      }
    };
    const player = makePlayer("p1");
    runtime = new SimulationRuntime({
      now: () => now,
      initialPlayers: new Map([["p1", player]]),
      initialState: {
        tiles: [makeTownTile(10, 10, "p1"), settlementTile],
        activeLocks: []
      }
    });

    now += 60 * 60_000;
    runtime.tickPopulationGrowth(now);
    const exported = runtime.exportState();
    const settlement = exported.tiles.find((t) => t.x === 11 && t.y === 11);
    expect(settlement).toBeDefined();
    expect(townPop(settlement!)).toBe(5000);
  });

  it("skips towns in capture shock", () => {
    const shockedTile = makeTownTile(10, 10, "p1", {
      captureShockUntil: now + 300_000
    });
    const player = makePlayer("p1");
    runtime = new SimulationRuntime({
      now: () => now,
      initialPlayers: new Map([["p1", player]]),
      initialState: {
        tiles: [shockedTile],
        activeLocks: []
      }
    });

    now += 60 * 60_000;
    runtime.tickPopulationGrowth(now);
    const exported = runtime.exportState();
    const tile = exported.tiles.find((t) => t.x === 10 && t.y === 10);
    expect(townPop(tile!)).toBe(TOWN_POP);
  });

  it("caps population at maxPopulation", () => {
    const nearCapTile = makeTownTile(10, 10, "p1", {
      population: TOWN_MAX - 100_000,
      maxPopulation: TOWN_MAX
    });
    const player = makePlayer("p1");
    runtime = new SimulationRuntime({
      now: () => now,
      initialPlayers: new Map([["p1", player]]),
      initialState: {
        tiles: [nearCapTile],
        activeLocks: []
      }
    });

    // Seed timer.
    runtime.tickPopulationGrowth(now);
    // Advance far enough to cap out.
    now += 365 * 24 * 60 * 60_000;
    runtime.tickPopulationGrowth(now);
    const exported = runtime.exportState();
    const tile = exported.tiles.find((t) => t.x === 10 && t.y === 10);
    expect(townPop(tile!)).toBe(TOWN_MAX);
  });

  it("upgrades population tier when crossing thresholds", () => {
    const almostCityTile = makeTownTile(10, 10, "p1", {
      population: 99_900,
      maxPopulation: POPULATION_MAX
    });
    const player = makePlayer("p1");
    runtime = new SimulationRuntime({
      now: () => now,
      initialPlayers: new Map([["p1", player]]),
      initialState: {
        tiles: [almostCityTile],
        activeLocks: []
      }
    });

    // Seed timer.
    runtime.tickPopulationGrowth(now);
    // Advance enough to cross 100k CITY threshold.
    now += 24 * 60 * 60_000;
    runtime.tickPopulationGrowth(now);
    const exported = runtime.exportState();
    const tile = exported.tiles.find((t) => t.x === 10 && t.y === 10);
    expect(tile!.townPopulationTier).toBe("CITY");
  });

  it("does not grow when at max cap (logistic factor = 0)", () => {
    const cappedTile = makeTownTile(10, 10, "p1", {
      population: TOWN_MAX,
      maxPopulation: TOWN_MAX
    });
    const player = makePlayer("p1");
    runtime = new SimulationRuntime({
      now: () => now,
      initialPlayers: new Map([["p1", player]]),
      initialState: {
        tiles: [cappedTile],
        activeLocks: []
      }
    });

    now += 60 * 60_000;
    runtime.tickPopulationGrowth(now);
    const exported = runtime.exportState();
    const tile = exported.tiles.find((t) => t.x === 10 && t.y === 10);
    expect(townPop(tile!)).toBe(TOWN_MAX);
  });

  it("skips barbarian players", () => {
    const barbTile = { ...makeTownTile(10, 10, "barbarian-1"), town: { type: "FARMING" as const, populationTier: "TOWN" as const, population: TOWN_POP, maxPopulation: TOWN_MAX, isFed: true } };
    const barbPlayer = { ...makePlayer("barbarian-1"), id: "barbarian-1", strategicResources: {} };
    runtime = new SimulationRuntime({
      now: () => now,
      initialPlayers: new Map([["barbarian-1", barbPlayer]]),
      initialState: {
        tiles: [barbTile],
        activeLocks: []
      }
    });

    now += 60 * 60_000;
    runtime.tickPopulationGrowth(now);
    const exported = runtime.exportState();
    const tile = exported.tiles.find((t) => t.x === 10 && t.y === 10);
    expect(townPop(tile!)).toBe(TOWN_POP);
  });

  it("skips unfed towns", () => {
    const unfedTile = {
      x: 10,
      y: 10,
      terrain: "LAND" as const,
      ownerId: "p1",
      ownershipState: "SETTLED" as const,
      town: {
        type: "FARMING" as const,
        populationTier: "TOWN" as const,
        population: TOWN_POP,
        maxPopulation: TOWN_MAX,
        isFed: false
      }
    };
    const player = { ...makePlayer("p1"), strategicResources: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0, OIL: 0 } };
    runtime = new SimulationRuntime({
      now: () => now,
      initialPlayers: new Map([["p1", player]]),
      initialState: {
        tiles: [unfedTile],
        activeLocks: []
      }
    });

    now += 60 * 60_000;
    runtime.tickPopulationGrowth(now);
    const exported = runtime.exportState();
    const tile = exported.tiles.find((t) => t.x === 10 && t.y === 10);
    expect(townPop(tile!)).toBe(TOWN_POP);
  });
});
