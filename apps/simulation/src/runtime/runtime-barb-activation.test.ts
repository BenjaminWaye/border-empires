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

describe("runtime.exportBarbActivationVisibleUnion", () => {
  // The union only ever gets queried against barb-owned tile keys (see
  // system-job-barbarian-planner.ts), so it is computed from the barb side:
  // for each barb-owned tile, is it within some non-barb player's vision
  // radius? Non-barb-owned tiles are never barb-owned and so can never
  // appear in the result, regardless of whose fog covers them.
  it("includes only barb-owned tiles that fall within a non-barb player's vision radius", () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        makePlayer("player-1"),
        makePlayer("player-2"),
        makePlayer("barbarian-1")
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          { x: 50, y: 50, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
          { x: 200, y: 200, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" },
          // Within player-1's radius-4 bubble (distance 2) — must be visible.
          { x: 52, y: 52, terrain: "LAND", ownerId: "barbarian-1", ownershipState: "SETTLED" },
          // Far from every non-barb player — must not be visible.
          { x: 100, y: 100, terrain: "LAND", ownerId: "barbarian-1", ownershipState: "SETTLED" }
        ],
        activeLocks: []
      }
    });

    const union = runtime.exportBarbActivationVisibleUnion();
    expect(union.keys).toContain("52,52");
    expect(union.keys).not.toContain("100,100");
    // Non-barb-owned tiles never appear, even though they're the ones whose
    // vision makes barb tiles eligible.
    expect(union.keys).not.toContain("50,50");
    expect(union.keys).not.toContain("200,200");
    expect(union.keys.length).toBe(1);
  });

  it("returns a stable signature when nothing changes (cache hit)", () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([makePlayer("player-1"), makePlayer("barbarian-1")]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          { x: 5, y: 5, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" }
        ],
        activeLocks: []
      }
    });

    const a = runtime.exportBarbActivationVisibleUnion();
    const b = runtime.exportBarbActivationVisibleUnion();
    expect(b.signature).toBe(a.signature);
    expect(b.keys.length).toBe(a.keys.length);
    // Same cache hit via cheap signature method too.
    expect(runtime.getBarbActivationVisionSignature()).toBe(a.signature);
  });

  it("excludes all barbarian-prefixed players from the union", () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([makePlayer("barbarian-1"), makePlayer("barbarian-2" as never)]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          { x: 10, y: 10, terrain: "LAND", ownerId: "barbarian-1", ownershipState: "SETTLED" },
          { x: 20, y: 20, terrain: "LAND", ownerId: "barbarian-2", ownershipState: "SETTLED" }
        ],
        activeLocks: []
      }
    });

    const { keys, signature } = runtime.exportBarbActivationVisibleUnion();
    expect(keys).toEqual([]);
    expect(signature).toBe("");
  });
});
