import { describe, expect, it, vi } from "vitest";
import { SimulationRuntime } from "./runtime.js";
import { buildAiOpponent, buildPlayer } from "./runtime.test-helpers.js";

// Regression: tile shedding, Aether Lance and airport bombardment all clear a
// tile's owner but never re-ran the connectivity check, so frontier tiles that
// hung off the lost tile stayed owned forever (out-of-reach decay never stamps
// them while they sit inside the owner's reach, and encirclement only fires on
// the paths that call applyEncirclement). Each path now runs it for the victim.

const ownerOf = (runtime: SimulationRuntime, key: string): string | undefined =>
  runtime.wireDeltaForTileKey(key, "player-1")?.ownerId;

describe("encirclement after non-combat tile loss", () => {
  it("cuts off frontier tiles stranded by tile shedding, for a player with nobody subscribed", async () => {
    let now = 1_000;
    const runtime = new SimulationRuntime({
      now: () => now,
      initialPlayers: new Map([["player-1", buildPlayer("player-1", { points: 0, manpower: 100 })]]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          { x: 30, y: 30, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
          { x: 31, y: 30, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
          { x: 32, y: 30, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" }
        ],
        activeLocks: []
      }
    });
    expect(ownerOf(runtime, "32,30")).toBe("player-1");

    now = 60_000;
    await runtime.tickTileShedding(now);

    expect(ownerOf(runtime, "30,30")).toBeUndefined();
    expect(ownerOf(runtime, "31,30")).toBeUndefined();
    expect(ownerOf(runtime, "32,30")).toBeUndefined();
  });

  it("keeps frontier tiles that are still connected to another settled tile after a shed", async () => {
    let now = 1_000;
    const runtime = new SimulationRuntime({
      now: () => now,
      initialPlayers: new Map([["player-1", buildPlayer("player-1", { points: 0, manpower: 100 })]]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          { x: 30, y: 30, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
          { x: 31, y: 30, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
          { x: 32, y: 30, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" }
        ],
        activeLocks: []
      }
    });
    // Make (30,30) the newest settle so it is the tile shed first.
    (runtime as unknown as { tileSettledAtByKey: Map<string, number> }).tileSettledAtByKey.set("30,30", 5_000);

    now = 60_000;
    await runtime.tickTileShedding(now);

    expect(ownerOf(runtime, "30,30")).toBeUndefined();
    expect(ownerOf(runtime, "31,30")).toBe("player-1");
  });

  it("cuts off the defender's stranded frontier tiles when Aether Lance purges the tile they hung off", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      seedTiles: new Map(),
      initialPlayers: new Map([
        [
          "player-1",
          buildPlayer("player-1", {
            points: 5_000,
            manpower: 10_000,
            techIds: new Set<string>(["crystal-lattices"]),
            strategicResources: { CRYSTAL: 500 }
          })
        ],
        ["player-2", buildAiOpponent({ manpower: 100 })]
      ]),
      initialState: {
        tiles: [
          { x: 0, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", observatory: { ownerId: "player-1", status: "active" } },
          { x: 20, y: 20, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" },
          { x: 5, y: 0, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" },
          { x: 6, y: 0, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" },
          { x: 7, y: 0, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" }
        ] as never,
        activeLocks: []
      }
    });
    runtime.submitCommand({
      commandId: "lance-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "AETHER_LANCE",
      payloadJson: JSON.stringify({ x: 5, y: 0 })
    });
    await Promise.resolve();

    expect(ownerOf(runtime, "5,0")).toBeUndefined();
    expect(ownerOf(runtime, "6,0")).toBeUndefined();
    expect(ownerOf(runtime, "7,0")).toBeUndefined();
  });

  it("cuts off a victim's stranded frontier tiles when airport bombardment strips the tiles they hung off", async () => {
    const randSpy = vi.spyOn(Math, "random").mockReturnValue(1);
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1", { points: 20_000, manpower: 10_000, strategicResources: { CRYSTAL: 200 } })],
        ["player-2", buildAiOpponent()]
      ]),
      initialState: {
        tiles: [
          { x: 0, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", economicStructure: { ownerId: "player-1", type: "AIRPORT", status: "active" } },
          { x: 1, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", economicStructure: { ownerId: "player-1", type: "AETHER_TOWER", status: "active" } },
          { x: 2, y: 20, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED", town: { type: "MARKET", populationTier: "SETTLEMENT" } },
          { x: 2, y: 21, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" },
          // Outside the 3x3 bombardment footprint; only connected via the bombed (2,21).
          { x: 2, y: 22, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" },
          { x: 2, y: 23, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" },
          // Same CRYSTAL/FOOD supply as runtime-airport-bombardment.test.ts so the structures aren't dormant.
          { x: 3, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" },
          { x: 4, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" },
          { x: 6, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" },
          { x: 7, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" },
          { x: 5, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FISH" }
        ],
        activeLocks: []
      }
    });
    runtime.submitCommand({
      commandId: "bombard-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "AIRPORT_BOMBARD",
      payloadJson: JSON.stringify({ fromX: 0, fromY: 0, toX: 2, toY: 20 })
    });
    await Promise.resolve();
    randSpy.mockRestore();

    expect(ownerOf(runtime, "2,20")).toBeUndefined();
    expect(ownerOf(runtime, "2,21")).toBeUndefined();
    expect(ownerOf(runtime, "2,22")).toBeUndefined();
    expect(ownerOf(runtime, "2,23")).toBeUndefined();
  });

  it("cuts off the previous owner's stranded frontier tiles when Create Mountain turns their tile to rock", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      seedTiles: new Map(),
      initialPlayers: new Map([
        [
          "player-1",
          buildPlayer("player-1", {
            points: 5_000,
            manpower: 10_000,
            techIds: new Set<string>(["terrain-engineering"]),
            strategicResources: { CRYSTAL: 500 }
          })
        ],
        ["player-2", buildAiOpponent({ manpower: 100 })]
      ]),
      initialState: {
        tiles: [
          { x: 0, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", observatory: { ownerId: "player-1", status: "active" } },
          { x: 3, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
          { x: 20, y: 20, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" },
          { x: 5, y: 0, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" },
          { x: 6, y: 0, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" },
          { x: 7, y: 0, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" },
          { x: 4, y: 1, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" },
          { x: 4, y: 2, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" }
        ] as never,
        activeLocks: []
      }
    });
    runtime.submitCommand({
      commandId: "mountain-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "CREATE_MOUNTAIN",
      payloadJson: JSON.stringify({ x: 5, y: 0 })
    });
    await Promise.resolve();

    expect(runtime.wireDeltaForTileKey("5,0", "player-1")?.terrain).toBe("MOUNTAIN");
    // (4,1),(4,2) only reached settled land through the tile that is now rock.
    expect(ownerOf(runtime, "4,1")).toBeUndefined();
    expect(ownerOf(runtime, "4,2")).toBeUndefined();
    // (6,0) still borders player-2's settled (7,0).
    expect(ownerOf(runtime, "6,0")).toBe("player-2");
    expect(ownerOf(runtime, "7,0")).toBe("player-2");
  });
});
