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
  it("includes only non-barb players' fog and grows when a second player joins far away", () => {
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
          { x: 100, y: 100, terrain: "LAND", ownerId: "barbarian-1", ownershipState: "SETTLED" }
        ],
        activeLocks: []
      }
    });

    const union = runtime.exportBarbActivationVisibleUnion();
    expect(union.keys).toContain("50,50");
    expect(union.keys).toContain("54,54"); // within vision radius of player-1
    expect(union.keys).toContain("200,200");
    expect(union.keys).toContain("204,204"); // within vision radius of player-2
    expect(union.keys).not.toContain("100,100"); // barb-only territory must not contribute
    expect(union.keys).not.toContain("100,104");
    // Two disjoint 9×9 bubbles → 162 keys total.
    expect(union.keys.length).toBe(162);
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
