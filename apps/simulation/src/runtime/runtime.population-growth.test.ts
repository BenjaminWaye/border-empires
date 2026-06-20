import { describe, expect, it, beforeEach } from "vitest";

import { SimulationRuntime } from "./runtime.js";
import {
  POPULATION_GROWTH_BASE_RATE,
  POPULATION_MAX,
  LONG_PEACE_GROWTH_MULT,
  LONG_PEACE_MS,
  NEARBY_WAR_PAUSE_MS
} from "@border-empires/game-domain";

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
  strategicResources: Partial<Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD", number>>;
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
  strategicResources: { FOOD: 999_999, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0 }
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
    nearbyWarPausedUntil: number;
    nearbyWarLastAt: number;
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
    ...(overrides.captureShockUntil ? { captureShockUntil: overrides.captureShockUntil } : {}),
    ...(overrides.nearbyWarPausedUntil ? { nearbyWarPausedUntil: overrides.nearbyWarPausedUntil } : {}),
    ...(overrides.nearbyWarLastAt ? { nearbyWarLastAt: overrides.nearbyWarLastAt } : {})
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

  it("grows population after elapsed minutes (long-peace applies — no prior war)", () => {
    // First tick seeds the timer (zero elapsed).
    runtime.tickPopulationGrowth(now);
    // Advance time by 60 minutes and tick again.
    now += 60 * 60_000;
    runtime.tickPopulationGrowth(now);
    const exported = runtime.exportState();
    const tile = exported.tiles.find((t) => t.x === 10 && t.y === 10);
    expect(tile).toBeDefined();
    const pop = townPop(tile!)!;

    // No nearbyWarLastAt → long-peace multiplier is active.
    const logistic = 1 - TOWN_POP / TOWN_MAX;
    const expectedPerMin = TOWN_POP * POPULATION_GROWTH_BASE_RATE * logistic * LONG_PEACE_GROWTH_MULT;
    const expectedGrowth = expectedPerMin * 60;
    expect(pop).toBeGreaterThan(TOWN_POP);
    expect(pop).toBeLessThanOrEqual(TOWN_POP + expectedGrowth * 1.01);
    expect(pop).toBeGreaterThan(TOWN_POP + expectedGrowth * 0.99);
  });

  it("suppresses growth and stamps pause when an ATTACK lock is within 10 tiles", () => {
    runtime.tickPopulationGrowth(now);
    // Place an ATTACK lock at (15, 15) — 5 tiles from town at (10, 10).
    const lockNear = {
      commandId: "cmd-near-war",
      playerId: "p2",
      actionType: "ATTACK" as const,
      manpowerCost: 0,
      originX: 15, originY: 15,
      targetX: 16, targetY: 16,
      originKey: "15,15",
      targetKey: "16,16",
      resolvesAt: now + 30_000,
      source: "player" as const
    };
    const player = makePlayer("p1");
    runtime = new SimulationRuntime({
      now: () => now,
      initialPlayers: new Map([["p1", player]]),
      initialState: {
        tiles: [makeTownTile(10, 10, "p1")],
        activeLocks: [lockNear]
      }
    });

    now += 60 * 60_000;
    runtime.tickPopulationGrowth(now);
    const exported = runtime.exportState();
    const tile = exported.tiles.find((t) => t.x === 10 && t.y === 10)!;
    // Growth suppressed — population unchanged.
    expect(townPop(tile)).toBe(TOWN_POP);
    // Pause timestamp stamped on the town.
    const town = JSON.parse(tile.townJson!) as { nearbyWarPausedUntil?: number };
    expect(town.nearbyWarPausedUntil).toBeGreaterThan(now);
  });

  it("suppresses growth during the 60-min pause window even after lock resolves", () => {
    // Stamp a pause that expires 30 min from now.
    const halfPauseMs = NEARBY_WAR_PAUSE_MS / 2;
    const pausedTile = makeTownTile(10, 10, "p1", {
      nearbyWarPausedUntil: now + halfPauseMs,
      nearbyWarLastAt: now - halfPauseMs
    });
    const player = makePlayer("p1");
    runtime = new SimulationRuntime({
      now: () => now,
      initialPlayers: new Map([["p1", player]]),
      initialState: {
        tiles: [pausedTile],
        activeLocks: []           // no active lock — pause persists from timestamp
      }
    });

    now += 30 * 60_000; // still inside the 60-min window
    runtime.tickPopulationGrowth(now);
    const exported = runtime.exportState();
    const tile = exported.tiles.find((t) => t.x === 10 && t.y === 10);
    expect(townPop(tile!)).toBe(TOWN_POP);
  });

  it("does not apply long-peace multiplier when war was recent (< 24 h)", () => {
    // nearbyWarLastAt = 1 h ago — inside the 24-h window.
    const recentWarTile = makeTownTile(10, 10, "p1", {
      nearbyWarLastAt: now - 60 * 60_000
    });
    const player = makePlayer("p1");
    runtime = new SimulationRuntime({
      now: () => now,
      initialPlayers: new Map([["p1", player]]),
      initialState: {
        tiles: [recentWarTile],
        activeLocks: []
      }
    });

    runtime.tickPopulationGrowth(now);
    now += 60 * 60_000;
    runtime.tickPopulationGrowth(now);
    const exported = runtime.exportState();
    const tile = exported.tiles.find((t) => t.x === 10 && t.y === 10);
    const pop = townPop(tile!)!;

    // No long-peace multiplier — base rate only.
    const logistic = 1 - TOWN_POP / TOWN_MAX;
    const expectedPerMin = TOWN_POP * POPULATION_GROWTH_BASE_RATE * logistic;
    const expectedGrowth = expectedPerMin * 60;
    expect(pop).toBeGreaterThan(TOWN_POP + expectedGrowth * 0.99);
    expect(pop).toBeLessThanOrEqual(TOWN_POP + expectedGrowth * 1.01);
  });

  it("applies long-peace multiplier after 24 h of no nearby combat", () => {
    // nearbyWarLastAt = 25 h ago — outside the 24-h window.
    const longPeaceTile = makeTownTile(10, 10, "p1", {
      nearbyWarLastAt: now - (LONG_PEACE_MS + 60 * 60_000)
    });
    const player = makePlayer("p1");
    runtime = new SimulationRuntime({
      now: () => now,
      initialPlayers: new Map([["p1", player]]),
      initialState: {
        tiles: [longPeaceTile],
        activeLocks: []
      }
    });

    runtime.tickPopulationGrowth(now);
    now += 60 * 60_000;
    runtime.tickPopulationGrowth(now);
    const exported = runtime.exportState();
    const tile = exported.tiles.find((t) => t.x === 10 && t.y === 10);
    const pop = townPop(tile!)!;

    const logistic = 1 - TOWN_POP / TOWN_MAX;
    const expectedPerMin = TOWN_POP * POPULATION_GROWTH_BASE_RATE * logistic * LONG_PEACE_GROWTH_MULT;
    const expectedGrowth = expectedPerMin * 60;
    expect(pop).toBeGreaterThan(TOWN_POP + expectedGrowth * 0.99);
    expect(pop).toBeLessThanOrEqual(TOWN_POP + expectedGrowth * 1.01);
  });

  it("resumes growth after pause expires and clears nearbyWarPausedUntil", () => {
    // Pause already expired 1 ms ago; war was > 24 h ago so long-peace applies.
    const expiredPauseTile = makeTownTile(10, 10, "p1", {
      nearbyWarPausedUntil: now - 1,
      nearbyWarLastAt: now - (LONG_PEACE_MS + 60 * 60_000)
    });
    const player = makePlayer("p1");
    runtime = new SimulationRuntime({
      now: () => now,
      initialPlayers: new Map([["p1", player]]),
      initialState: {
        tiles: [expiredPauseTile],
        activeLocks: []
      }
    });

    runtime.tickPopulationGrowth(now);
    now += 60 * 60_000;
    runtime.tickPopulationGrowth(now);
    const exported = runtime.exportState();
    const tile = exported.tiles.find((t) => t.x === 10 && t.y === 10)!;

    // Growth resumed.
    const pop = townPop(tile)!;
    expect(pop).toBeGreaterThan(TOWN_POP);

    // Stale pause timestamp cleared from the tile JSON.
    const town = JSON.parse(tile.townJson!) as { nearbyWarPausedUntil?: number };
    expect(town.nearbyWarPausedUntil).toBeUndefined();
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

  it("grows population past tier threshold without auto-promoting", () => {
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
    // Population grows past the threshold, but tier stays TOWN (manual upgrade only).
    expect(townPop(tile!)).toBeGreaterThan(100_000);
    expect(tile!.townPopulationTier).toBe("TOWN");
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
    const player = { ...makePlayer("p1"), strategicResources: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0 } };
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
