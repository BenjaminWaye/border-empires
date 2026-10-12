import { describe, expect, it } from "vitest";
import { SimulationRuntime } from "./runtime.js";
import { buildAiOpponent, buildPlayer } from "./runtime.test-helpers.js";

// §5.4 gap, one level upstream of the two already fixed this PR (monument
// abilities, then Observatory abilities): isStructurePowered's Aether Tower
// proximity check only verified `tower.status === "active"` — it never
// checked whether the tower itself is slot-dormant (AMBARIC_TRANSFORMER demands a
// FOOD slot + a CRYSTAL slot, STRUCTURE_SLOT_REQUIREMENTS.AMBARIC_TRANSFORMER, and
// isn't in the SYNTHESIZER_STRUCTURE_TYPES exclusion list, so it can go
// dormant like any other structure). A dormant tower still "powered" every
// Sky Dock/monument ability and the Aegis Dome/Radar passive shield/block
// checks that depend on isStructurePowered. These tests give the powered
// structure itself full resource-slot supply (so its own dormancy check
// would pass) but leave the Aether Tower with zero FOOD supply, isolating
// the tower's own dormancy as the only reason the ability/shield should now
// fail.
describe("§5.4 Aether Tower dormancy gate", () => {
  it("SKY_DOCK_BOMBARD rejects when the powering Aether Tower is FOOD-dormant, even with a fully-supplied sky dock", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      seedTiles: new Map(),
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1", { manpower: 10_000, points: 20_000, strategicResources: { CRYSTAL: 1_000 } })],
        ["player-2", buildAiOpponent()]
      ]),
      initialState: {
        tiles: [
          {
            x: 0,
            y: 0,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            economicStructure: { ownerId: "player-1", type: "SKY_DOCK", status: "active" }
          },
          {
            x: 1,
            y: 0,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            economicStructure: { ownerId: "player-1", type: "AMBARIC_TRANSFORMER", status: "active" }
          },
          // Full CRYSTAL supply for SKY_DOCK(1) + AMBARIC_TRANSFORMER(1) — neither
          // is CRYSTAL-dormant. No FOOD supply anywhere (seedTiles: new
          // Map() opts out of the default seed world, so there's no hidden
          // Nauticus town either — SETTLEMENT-tier towns net 0 FOOD demand,
          // §5.3, so leaving it in would just donate its FARM tile's spare
          // FOOD slot to the tower instead of isolating it), so
          // AMBARIC_TRANSFORMER's separate 1 FOOD slot demand is unmet against 0
          // supply and it goes FOOD-dormant.
          { x: 3, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" },
          { x: 4, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" },
          { x: 2, y: 2, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED", town: { type: "MARKET", populationTier: "SETTLEMENT" } }
        ],
        activeLocks: []
      }
    });
    const events: Array<Record<string, unknown>> = [];
    runtime.onEvent((event) => events.push(event as unknown as Record<string, unknown>));
    runtime.submitCommand({
      commandId: "bombard-dormant-tower",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "SKY_DOCK_BOMBARD",
      payloadJson: JSON.stringify({ fromX: 0, fromY: 0, toX: 2, toY: 2 })
    });
    await Promise.resolve();
    expect(events).toContainEqual(expect.objectContaining({
      eventType: "COMMAND_REJECTED",
      commandId: "bombard-dormant-tower",
      code: "SKY_DOCK_BOMBARD_INVALID",
      message: "sky dock requires a nearby Ambaric Transformer"
    }));
    expect(events.some((event) => event["eventType"] === "TILE_DELTA_BATCH" && event["commandId"] === "bombard-dormant-tower")).toBe(false);
  });

  it("does not shield a target from an enemy Aegis Dome whose own Aether Tower is FOOD-dormant, even with a fully-supplied dome", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1", { manpower: 10_000, points: 5_000, techIds: new Set(["crystal-lattices"]), strategicResources: { CRYSTAL: 500 } })],
        ["player-2", buildPlayer("player-2", { isAi: true, manpower: 100 })]
      ]),
      initialState: {
        tiles: [
          { x: 0, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", observatory: { ownerId: "player-1", status: "active" } },
          {
            x: 5,
            y: 0,
            terrain: "LAND",
            ownerId: "player-2",
            ownershipState: "SETTLED",
            economicStructure: { ownerId: "player-2", type: "INCUBATION_ENGINE", status: "active" }
          },
          {
            x: 6,
            y: 0,
            terrain: "LAND",
            ownerId: "player-2",
            ownershipState: "SETTLED",
            economicStructure: { ownerId: "player-2", type: "AEGIS_DOME", status: "active" }
          },
          {
            x: 7,
            y: 0,
            terrain: "LAND",
            ownerId: "player-2",
            ownershipState: "SETTLED",
            economicStructure: { ownerId: "player-2", type: "AMBARIC_TRANSFORMER", status: "active" }
          },
          // Full CRYSTAL supply for AEGIS_DOME(1) + AMBARIC_TRANSFORMER(1) — neither
          // is CRYSTAL-dormant. Deliberately no FOOD supply for player-2:
          // AMBARIC_TRANSFORMER's separate 1 FOOD slot demand is unmet (player-2
          // has no seed-world town), so it goes FOOD-dormant on its own.
          { x: 8, y: 0, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED", resource: "GEMS" },
          { x: 9, y: 0, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED", resource: "GEMS" },
          // CRYSTAL supply so player-1's own Observatory isn't dormant.
          { x: 20, y: 20, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" }
        ],
        activeLocks: []
      }
    });
    const events: Array<Record<string, unknown>> = [];
    runtime.onEvent((event) => events.push(event as unknown as Record<string, unknown>));
    runtime.submitCommand({
      commandId: "aether-lance-dormant-tower",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "AETHER_LANCE",
      payloadJson: JSON.stringify({ x: 5, y: 0 })
    });
    await Promise.resolve();
    expect(events).not.toContainEqual(expect.objectContaining({
      eventType: "COMMAND_REJECTED",
      commandId: "aether-lance-dormant-tower",
      code: "AETHER_LANCE_INVALID",
      message: "blocked by an Aegis Dome"
    }));
    const target = runtime.exportState().tiles.find((tile) => tile.x === 5 && tile.y === 0);
    expect(target?.ownerId).toBeUndefined();
  });
});
