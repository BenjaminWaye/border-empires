import { describe, expect, it } from "vitest";

import { SimulationRuntime } from "./runtime.js";

// Split out of runtime.population-growth.test.ts (already at the repo's
// 500-line soft cap) rather than grown further -- see that file's own
// "makeFoodTile" comment for the FOOD-slot fixture convention this reuses.
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

// Two FISH tiles = 4 FOOD supply (BASE_SLOTS_BY_TILE_RESOURCE), enough for
// exactly one TOWN-tier town's 4-slot demand (townFoodSlotDemandForTier).
const makeFoodTile = (ownerId: string, x = 11, y = 10) => [
  { x, y, terrain: "LAND" as const, ownerId, ownershipState: "SETTLED" as const, resource: "FISH" as const },
  { x: x + 1, y, terrain: "LAND" as const, ownerId, ownershipState: "SETTLED" as const, resource: "FISH" as const }
];

const isFedOf = (tile: { townJson?: string }): boolean | undefined =>
  tile.townJson ? (JSON.parse(tile.townJson) as { isFed?: boolean }).isFed : undefined;

describe("SimulationRuntime tickPopulationGrowth — isFed self-heal", () => {
  // Regression: a town's persisted isFed only used to refresh as a side
  // effect of some OTHER mutation touching that exact tile -- it was never
  // proactively re-pushed when the shared FOOD-slot dormancy set shifted for
  // a reason elsewhere in the empire (e.g. settling a second town pushes
  // total FOOD demand over supply), so an unrelated town could sit showing
  // stale "fed" (or "unfed") indefinitely. This tick already recomputes
  // fedTownKeys fresh for every owned town every tick, so it now self-heals
  // isFed on every town, not just ones growth itself touches this tick.
  it("self-heals a stale isFed on every owned town, every tick, even towns that don't grow", () => {
    // Both towns' starting isFed is deliberately wrong: real FOOD supply
    // (one town's worth) only covers one of the two towns' 4-slot demand, so
    // a fresh recompute must land on the opposite of each fixture's stale
    // start value, proving this heals both directions, not just one.
    const staleUnfed = makeTownTile(10, 10, "p1", false);
    const staleFed = makeTownTile(20, 20, "p1", true);
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["p1", makePlayer("p1")]]),
      initialState: { tiles: [staleUnfed, staleFed, ...makeFoodTile("p1")], activeLocks: [] }
    });

    runtime.tickPopulationGrowth(1_000);
    const exported = runtime.exportState();
    const tileA = exported.tiles.find((t) => t.x === 10 && t.y === 10);
    const tileB = exported.tiles.find((t) => t.x === 20 && t.y === 20);
    // Newest-first with no settledAtByTileKey (these towns bypass the
    // SETTLE-command tile-shedding stamp, coming straight from initialState):
    // both fall back to activatedAt 0 and tie-break lexicographically on
    // tile key, so (10,10) sorts first in the dormancy loop -- it's the one
    // that goes dormant, regardless of its stale isFed:false start value.
    expect(isFedOf(tileA!)).toBe(false);
    expect(isFedOf(tileB!)).toBe(true);
  });
});
