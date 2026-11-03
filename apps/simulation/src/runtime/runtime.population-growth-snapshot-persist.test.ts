import { describe, expect, it } from "vitest";

import { applySimulationEventsToRecoveredState } from "../event-recovery/event-recovery.js";
import { SimulationRuntime } from "./runtime.js";

// Fixture conventions mirror runtime.population-growth-rate-stamp.test.ts.
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
  strategicResources: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 }
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
const makeFoodTiles = (ownerId: string) => [
  { x: 11, y: 10, terrain: "LAND" as const, ownerId, ownershipState: "SETTLED" as const, resource: "FISH" as const },
  { x: 12, y: 10, terrain: "LAND" as const, ownerId, ownershipState: "SETTLED" as const, resource: "FISH" as const }
];

// Checkpoints save through the async export, which reads the prebuilt
// snapshot tile cache rather than the live tile map.
const exportForCheckpoint = (runtime: SimulationRuntime) => runtime.exportSnapshotSectionsAsync(async () => {});

const snapshotTown = async (runtime: SimulationRuntime, x: number, y: number) =>
  (await exportForCheckpoint(runtime)).initialState.tiles.find((tile) => tile.x === x && tile.y === y)?.town;

describe("SimulationRuntime tickPopulationGrowth — snapshot persistence", () => {
  // Regression: the growth tick wrote grown towns into the live tile map but
  // not the runtime's snapshot tile cache, which is what checkpoints save. The
  // shutdown checkpoint on every deploy marks all events applied, so nothing
  // was replayed on boot and every town came back at its boot-time population.
  // Staging towns sat at their worldgen population for a whole season.
  it("saves grown population in the snapshot and restores it", async () => {
    let now = 1_000;
    const runtime = new SimulationRuntime({
      now: () => now,
      initialPlayers: new Map([["p1", makePlayer("p1")]]),
      initialState: { tiles: [makeTownTile(10, 10, "p1", true), ...makeFoodTiles("p1")], activeLocks: [] }
    });

    runtime.tickPopulationGrowth(now);
    now = 61_000;
    runtime.tickPopulationGrowth(now);

    const sections = await exportForCheckpoint(runtime);
    const saved = sections.initialState.tiles.find((tile) => tile.x === 10 && tile.y === 10)?.town;
    expect(saved?.population).toBeGreaterThan(TOWN_POP);
    expect(saved?.populationGrowthPerMinute).toBeGreaterThan(0);

    const restored = applySimulationEventsToRecoveredState(sections.initialState, []);
    const restoredTown = restored.tiles.find((tile) => tile.x === 10 && tile.y === 10)?.town;
    expect(restoredTown?.population).toBe(saved?.population);
  });

  it("saves the isFed self-heal in the snapshot", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["p1", makePlayer("p1")]]),
      // One town's worth of FOOD for two towns: (10,10) goes unfed.
      initialState: { tiles: [makeTownTile(10, 10, "p1", true), makeTownTile(20, 20, "p1", true), ...makeFoodTiles("p1")], activeLocks: [] }
    });

    runtime.tickPopulationGrowth(1_000);

    expect((await snapshotTown(runtime, 10, 10))?.isFed).toBe(false);
  });
});
