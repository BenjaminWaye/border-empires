import { describe, expect, it } from "vitest";

import { SimulationRuntime } from "./runtime.js";

// Regression for the 2026-09-17 prod CPU-throttle incident: tickPopulationGrowth
// used to drop economySnapshotCacheByPlayer / tileYieldContextCacheByPlayer for
// every player whose town population grew -- i.e. every minute for every
// empire with a fed town -- even though nothing in the economy snapshot reads
// raw `population` (only populationTier and isFed). The next passive-income
// tick then paid a full O(settled tiles) economy + town-network rebuild for
// no reason. Only the isFed self-heal is an economy-relevant mutation, so
// only it may invalidate.
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
const makeFoodTile = (ownerId: string, x = 11, y = 10) => [
  { x, y, terrain: "LAND" as const, ownerId, ownershipState: "SETTLED" as const, resource: "FISH" as const },
  { x: x + 1, y, terrain: "LAND" as const, ownerId, ownershipState: "SETTLED" as const, resource: "FISH" as const }
];

const buildRuntime = (tiles: ReturnType<typeof makeTownTile>[] | Array<ReturnType<typeof makeTownTile> | ReturnType<typeof makeFoodTile>[number]>) => {
  const rebuildCount: Record<string, number> = {};
  let now = 1_000;
  const runtime = new SimulationRuntime({
    now: () => now,
    initialPlayers: new Map([["p1", makePlayer("p1")]]),
    initialState: { tiles, activeLocks: [] },
    trackSyncMainThreadTask: (phase, _details, task) => {
      rebuildCount[phase] = (rebuildCount[phase] ?? 0) + 1;
      return task();
    }
  });
  return { runtime, rebuildCount, setNow: (nextNowMs: number) => { now = nextNowMs; } };
};

const populationOf = (tile: { townJson?: string }): number | undefined =>
  tile.townJson ? (JSON.parse(tile.townJson) as { population?: number }).population : undefined;

describe("SimulationRuntime tickPopulationGrowth — economy cache invalidation", () => {
  it("does not drop the economy snapshot cache when a town merely grows (isFed unchanged)", () => {
    const { runtime, rebuildCount, setNow } = buildRuntime([makeTownTile(10, 10, "p1", true), ...makeFoodTile("p1")]);

    // Seed lastIncomeTickAt and the town's growth timestamp, then warm the
    // economy snapshot cache.
    runtime.applyPassiveIncome(1_000, 999_999_999);
    runtime.tickPopulationGrowth(1_000);
    setNow(16_000);
    runtime.applyPassiveIncome(16_000, 999_999_999);
    expect(rebuildCount["cached_economy_snapshot_rebuild"]).toBe(1);

    // A minute later the town grows (isFed already correct, so no self-heal).
    setNow(76_000);
    runtime.tickPopulationGrowth(76_000);
    const grown = runtime.exportState().tiles.find((t) => t.x === 10 && t.y === 10);
    expect(populationOf(grown!)).toBeGreaterThan(TOWN_POP);

    // The following income tick must hit the warm cache -- growth alone is
    // not an economy-relevant mutation.
    runtime.applyPassiveIncome(76_000, 999_999_999);
    expect(rebuildCount["cached_economy_snapshot_rebuild"]).toBe(1);
  });

  it("still drops the economy snapshot cache when the tick self-heals a stale isFed", () => {
    // Stale isFed:false with real supply covering it -> the tick flips it to
    // true, which does change income and must invalidate.
    const { runtime, rebuildCount, setNow } = buildRuntime([makeTownTile(10, 10, "p1", false), ...makeFoodTile("p1")]);

    runtime.applyPassiveIncome(1_000, 999_999_999);
    setNow(16_000);
    runtime.applyPassiveIncome(16_000, 999_999_999);
    expect(rebuildCount["cached_economy_snapshot_rebuild"]).toBe(1);

    // First growth tick: isFed flips false -> true (self-heal).
    setNow(76_000);
    runtime.tickPopulationGrowth(76_000);
    runtime.applyPassiveIncome(76_000, 999_999_999);
    expect(rebuildCount["cached_economy_snapshot_rebuild"]).toBe(2);
  });
});
