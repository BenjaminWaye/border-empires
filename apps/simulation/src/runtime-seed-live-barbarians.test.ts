import { describe, expect, it } from "vitest";
import { SimulationRuntime } from "./runtime.js";

const makePlayer = (id: string, vision = 1) => [
  id,
  {
    id,
    isAi: id.startsWith("ai-"),
    points: 100,
    manpower: 150,
    techIds: new Set<string>(),
    domainIds: new Set<string>(),
    mods: { attack: 1, defense: 1, income: 1, vision },
    techRootId: "rewrite-local",
    allies: new Set<string>()
  }
] as const;

// A square block of LAND tiles, with player-1 owning the top-left corner.
const buildLandWorld = (size: number) => {
  const tiles = [] as Array<{ x: number; y: number; terrain: "LAND"; ownerId?: string; ownershipState?: "SETTLED" }>;
  for (let x = 0; x < size; x += 1) {
    for (let y = 0; y < size; y += 1) {
      if (x === 0 && y === 0) {
        tiles.push({ x, y, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" });
      } else {
        tiles.push({ x, y, terrain: "LAND" });
      }
    }
  }
  return tiles;
};

const barbCoords = (runtime: SimulationRuntime): Array<{ x: number; y: number }> =>
  runtime
    .exportState()
    .tiles.filter((t) => t.ownerId === "barbarian-1")
    .map((t) => ({ x: t.x, y: t.y }));

const cheb = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

describe("runtime.seedLiveBarbarians", () => {
  it("places the requested number of barbs on unowned LAND away from players", () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([makePlayer("player-1"), makePlayer("barbarian-1")]),
      seedTiles: new Map(),
      initialState: { tiles: buildLandWorld(30), activeLocks: [] }
    });

    const result = runtime.seedLiveBarbarians(5, "test-seed-a");
    expect(result.placed).toBe(5);
    expect(result.barbTilesAfter).toBe(5);

    const barbs = barbCoords(runtime);
    expect(barbs.length).toBe(5);
    // Every barb sits >= 8 from the only player tile (0,0)…
    for (const barb of barbs) {
      expect(cheb(barb, { x: 0, y: 0 })).toBeGreaterThanOrEqual(8);
      // …and never lands on an already-owned tile.
      expect(barb.x === 0 && barb.y === 0).toBe(false);
    }
    // …and respects min separation from each other.
    for (let i = 0; i < barbs.length; i += 1) {
      for (let j = i + 1; j < barbs.length; j += 1) {
        expect(cheb(barbs[i]!, barbs[j]!)).toBeGreaterThanOrEqual(4);
      }
    }
  });

  it("is a no-op when there is no barbarian-1 player record", () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([makePlayer("player-1")]),
      seedTiles: new Map(),
      initialState: { tiles: buildLandWorld(20), activeLocks: [] }
    });

    const result = runtime.seedLiveBarbarians(5);
    expect(result.placed).toBe(0);
    expect(barbCoords(runtime)).toEqual([]);
  });

  it("returns zero for a non-positive request without mutating the world", () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([makePlayer("player-1"), makePlayer("barbarian-1")]),
      seedTiles: new Map(),
      initialState: { tiles: buildLandWorld(20), activeLocks: [] }
    });

    expect(runtime.seedLiveBarbarians(0).placed).toBe(0);
    expect(barbCoords(runtime)).toEqual([]);
  });

  it("respects separation from barbs that already exist", () => {
    const tiles = buildLandWorld(40);
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([makePlayer("player-1"), makePlayer("barbarian-1")]),
      seedTiles: new Map(),
      initialState: {
        tiles: [...tiles, { x: 20, y: 20, terrain: "LAND" as const }].map((t) =>
          t.x === 20 && t.y === 20 ? { ...t, ownerId: "barbarian-1", ownershipState: "SETTLED" as const } : t
        ),
        activeLocks: []
      }
    });

    const before = barbCoords(runtime);
    expect(before.length).toBe(1);
    const result = runtime.seedLiveBarbarians(3, "test-seed-sep");
    expect(result.placed).toBe(3);
    const after = barbCoords(runtime);
    // Newly placed barbs keep their distance from the pre-existing one at (20,20).
    for (const barb of after) {
      if (barb.x === 20 && barb.y === 20) continue;
      expect(cheb(barb, { x: 20, y: 20 })).toBeGreaterThanOrEqual(4);
    }
  });
});
