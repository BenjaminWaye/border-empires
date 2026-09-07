import { describe, expect, it, vi } from "vitest";
import { SimulationRuntime } from "./runtime.js";
import { buildAiOpponent, buildPlayer } from "./runtime.test-helpers.js";

// §5.4 gap: isStructurePowered (runtime-ability-helpers.ts) only checks
// Aether Tower proximity — it has no knowledge of resource-slot dormancy.
// handleImperialExchangeLevyCommand/handleAegisLockCommand/
// handleAstralDockLaunchCommand/handleAirportBombardCommand/
// handleWorldEngineStrikeCommand, plus the passive
// isTileShieldedByEnemyAegisDome/isTileBombardBlockedByRadar checks, all
// gated only on isStructurePowered — so a dormant (slot-starved) monument
// could still fire its ability, or still shield/block, even though every
// other consumer of dormancy (combat, garrison, muster, support-structure
// bonuses) already treats it as inert. These tests build a structure with
// an active status and a powering Aether Tower, but with zero CRYSTAL (and,
// for the radar, FOOD) slot supply, so the structure is dormant per
// resourceSlotDormancyForPlayer — and assert the ability/shield/block no
// longer works.

const player1 = (overrides: Parameters<typeof buildPlayer>[1] = {}) =>
  buildPlayer("player-1", { manpower: 10_000, points: 20_000, strategicResources: { CRYSTAL: 1_000 }, ...overrides });

describe("§5.4 ability dormancy gate", () => {
  it("AIRPORT_BOMBARD rejects a dormant airport even when Aether Tower-powered", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        ["player-1", player1()],
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
            economicStructure: { ownerId: "player-1", type: "AIRPORT", status: "active" }
          },
          {
            x: 1,
            y: 0,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            economicStructure: { ownerId: "player-1", type: "AETHER_TOWER", status: "active" }
          },
          { x: 2, y: 20, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED", town: { type: "MARKET", populationTier: "SETTLEMENT" } },
          // 1 CRYSTAL spares the tower (key tie-break), leaves AIRPORT dormant; FISH spares the tower's FOOD slot.
          { x: 3, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" },
          { x: 4, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FISH" }
        ],
        activeLocks: []
      }
    });
    const events: Array<Record<string, unknown>> = [];
    runtime.onEvent((event) => events.push(event as unknown as Record<string, unknown>));
    runtime.submitCommand({
      commandId: "bombard-dormant",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "AIRPORT_BOMBARD",
      payloadJson: JSON.stringify({ fromX: 0, fromY: 0, toX: 2, toY: 20 })
    });
    await Promise.resolve();
    expect(events).toContainEqual(expect.objectContaining({
      eventType: "COMMAND_REJECTED",
      commandId: "bombard-dormant",
      code: "AIRPORT_BOMBARD_INVALID",
      message: "airport has no free resource slot"
    }));
    expect(events.some((event) => event["eventType"] === "TILE_DELTA_BATCH" && event["commandId"] === "bombard-dormant")).toBe(false);
  });

  it("is not blocked by a dormant enemy Radar System", async () => {
    const randSpy = vi.spyOn(Math, "random").mockReturnValue(1);
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        ["player-1", player1({ strategicResources: { CRYSTAL: 200 } })],
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
            economicStructure: { ownerId: "player-1", type: "AIRPORT", status: "active" }
          },
          {
            x: 1,
            y: 0,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            economicStructure: { ownerId: "player-1", type: "AETHER_TOWER", status: "active" }
          },
          // AIRPORT demands 3 CRYSTAL slots and AETHER_TOWER another 1 (see
          // packages/shared/src/structure-slots/structure-slots.ts) — 4 GEMS
          // tiles needed so player-1's own airport/tower stay powered (this
          // test is about player-2's radar being dormant, not player-1's).
          { x: 3, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" },
          { x: 4, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" },
          { x: 6, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" },
          { x: 7, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" },
          { x: 5, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FISH" }, // spares player-1's own tower's FOOD slot
          { x: 2, y: 20, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED", town: { type: "MARKET", populationTier: "SETTLEMENT" } },
          {
            x: 3,
            y: 20,
            terrain: "LAND",
            ownerId: "player-2",
            ownershipState: "SETTLED",
            economicStructure: { ownerId: "player-2", type: "RADAR_SYSTEM", status: "active" }
          },
          {
            x: 4,
            y: 20,
            terrain: "LAND",
            ownerId: "player-2",
            ownershipState: "SETTLED",
            economicStructure: { ownerId: "player-2", type: "AETHER_TOWER", status: "active" }
          }
          // No FOOD/CRYSTAL supply for player-2: RADAR_SYSTEM demands both.
        ],
        activeLocks: []
      }
    });
    const events: Array<Record<string, unknown>> = [];
    runtime.onEvent((event) => events.push(event as unknown as Record<string, unknown>));
    runtime.submitCommand({
      commandId: "bombard-past-dormant-radar",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "AIRPORT_BOMBARD",
      payloadJson: JSON.stringify({ fromX: 0, fromY: 0, toX: 2, toY: 20 })
    });
    await Promise.resolve();
    randSpy.mockRestore();
    expect(events).not.toContainEqual(expect.objectContaining({
      eventType: "COMMAND_REJECTED",
      commandId: "bombard-past-dormant-radar",
      code: "AIRPORT_BOMBARD_INVALID",
      message: "blocked by a Resonance Grid"
    }));
    expect(events.some((event) => event["eventType"] === "TILE_DELTA_BATCH" && event["commandId"] === "bombard-past-dormant-radar")).toBe(true);
  });

  it("IMPERIAL_EXCHANGE_LEVY rejects a dormant Imperial Exchange even when Aether Tower-powered", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        ["player-1", player1({ techIds: new Set(["exchange-levy"]) })],
        ["player-2", buildPlayer("player-2", { isAi: true, manpower: 100, strategicResources: { FOOD: 100 } })]
      ]),
      initialState: {
        tiles: [
          { x: 0, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", economicStructure: { ownerId: "player-1", type: "IMPERIAL_EXCHANGE", status: "active" } },
          { x: 1, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", economicStructure: { ownerId: "player-1", type: "AETHER_TOWER", status: "active" } },
          // 1 CRYSTAL spares the tower (key tie-break), leaves the exchange dormant; FISH spares the tower's FOOD slot.
          { x: 3, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" },
          { x: 4, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FISH" },
          { x: 10, y: 0, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" } // levy target tile
        ],
        activeLocks: []
      }
    });
    const events: Array<Record<string, unknown>> = [];
    runtime.onEvent((event) => events.push(event as unknown as Record<string, unknown>));
    runtime.submitCommand({
      commandId: "levy-dormant",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "IMPERIAL_EXCHANGE_LEVY",
      payloadJson: JSON.stringify({ fromX: 0, fromY: 0, toX: 10, toY: 0 })
    });
    await Promise.resolve();
    expect(events).toContainEqual(expect.objectContaining({
      eventType: "COMMAND_REJECTED",
      commandId: "levy-dormant",
      code: "IMPERIAL_EXCHANGE_LEVY_INVALID",
      message: "Imperial Exchange has no free resource slot"
    }));
    const p2 = runtime.exportState().players.find((p) => p.id === "player-2");
    expect(p2?.points).toBe(100);
  });

  it("WORLD_ENGINE_STRIKE rejects a dormant World Engine even when Aether Tower-powered", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        ["player-1", player1({ techIds: new Set(["worldbreaker-fire"]) })],
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
            economicStructure: { ownerId: "player-1", type: "WORLD_ENGINE", status: "active" }
          },
          {
            x: 1,
            y: 0,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            economicStructure: { ownerId: "player-1", type: "AETHER_TOWER", status: "active" }
          },
          {
            x: 50,
            y: 50,
            terrain: "LAND",
            ownerId: "player-2",
            ownershipState: "SETTLED",
            town: { type: "MARKET", populationTier: "CITY", population: 1_000 }
          },
          // 1 CRYSTAL spares the tower (key tie-break), leaves World Engine dormant; FISH spares the tower's FOOD slot.
          { x: 3, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" },
          { x: 4, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FISH" }
        ],
        activeLocks: []
      }
    });
    const events: Array<Record<string, unknown>> = [];
    runtime.onEvent((event) => events.push(event as unknown as Record<string, unknown>));
    runtime.submitCommand({
      commandId: "strike-dormant",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "WORLD_ENGINE_STRIKE",
      payloadJson: JSON.stringify({ fromX: 0, fromY: 0, toX: 50, toY: 50 })
    });
    await Promise.resolve();
    expect(events).toContainEqual(expect.objectContaining({
      eventType: "COMMAND_REJECTED",
      commandId: "strike-dormant",
      code: "WORLD_ENGINE_STRIKE_INVALID",
      message: "World Engine has no free resource slot"
    }));
    const target = runtime.exportState().tiles.find((tile) => tile.x === 50 && tile.y === 50);
    const town = target?.townJson ? (JSON.parse(target.townJson) as { population?: number }) : undefined;
    expect(town?.population).toBe(1_000);
  });

  // true: 2 CRYSTAL (dome + tower). false: 1 CRYSTAL spares the tower (key tie-break), leaves AEGIS_DOME dormant. FISH covers the tower's FOOD slot.
  const aegisDomeTiles = (options: { includeCrystalSupply: boolean }): Array<Record<string, unknown>> => [
    {
      x: 0,
      y: 0,
      terrain: "LAND",
      ownerId: "player-1",
      ownershipState: "SETTLED",
      economicStructure: { ownerId: "player-1", type: "AEGIS_DOME", status: "active" }
    },
    {
      x: 1,
      y: 0,
      terrain: "LAND",
      ownerId: "player-1",
      ownershipState: "SETTLED",
      economicStructure: { ownerId: "player-1", type: "AETHER_TOWER", status: "active" }
    },
    { x: 4, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FISH" },
    // AEGIS_DOME now demands 4 CRYSTAL slots (bumped from 1: it consumes
    // its 3 Parts on completion, so its own slot cost absorbs what they
    // used to occupy) plus 1 for the Aether Tower — 5 total when supplied.
    ...(options.includeCrystalSupply
      ? [
          { x: 3, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" },
          { x: 5, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" },
          { x: 6, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" },
          { x: 7, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" },
          { x: 8, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" }
        ]
      : [{ x: 3, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" }])
  ];

  it("AEGIS_LOCK activates when powered and slot-supplied", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        ["player-1", player1()],
        ["player-2", buildAiOpponent()]
      ]),
      initialState: { tiles: aegisDomeTiles({ includeCrystalSupply: true }) as never, activeLocks: [] }
    });
    const events: Array<Record<string, unknown>> = [];
    runtime.onEvent((event) => events.push(event as unknown as Record<string, unknown>));
    runtime.submitCommand({
      commandId: "aegis-lock-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "AEGIS_LOCK",
      payloadJson: JSON.stringify({ fromX: 0, fromY: 0 })
    });
    await Promise.resolve();
    expect(events).toContainEqual(expect.objectContaining({
      eventType: "PLAYER_MESSAGE",
      commandId: "aegis-lock-1",
      messageType: "AEGIS_LOCK_ACTIVATED"
    }));
  });

  it("AEGIS_LOCK rejects a dormant Aegis Dome even when Aether Tower-powered", async () => {
    // No CRYSTAL supply tile: AEGIS_DOME demands 1 CRYSTAL slot it can't get.
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        ["player-1", player1()],
        ["player-2", buildAiOpponent()]
      ]),
      initialState: { tiles: aegisDomeTiles({ includeCrystalSupply: false }) as never, activeLocks: [] }
    });
    const events: Array<Record<string, unknown>> = [];
    runtime.onEvent((event) => events.push(event as unknown as Record<string, unknown>));
    runtime.submitCommand({
      commandId: "aegis-lock-dormant",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "AEGIS_LOCK",
      payloadJson: JSON.stringify({ fromX: 0, fromY: 0 })
    });
    await Promise.resolve();
    expect(events).toContainEqual(expect.objectContaining({
      eventType: "COMMAND_REJECTED",
      commandId: "aegis-lock-dormant",
      code: "AEGIS_LOCK_INVALID",
      message: "Aegis Dome has no free resource slot"
    }));
  });

  it("is not shielded by a dormant enemy Aegis Dome", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        ["player-1", player1({ manpower: 10_000, points: 5_000, techIds: new Set(["crystal-lattices"]), strategicResources: { CRYSTAL: 500 } })],
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
            economicStructure: { ownerId: "player-2", type: "GRANARY", status: "active" }
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
            economicStructure: { ownerId: "player-2", type: "AETHER_TOWER", status: "active" }
          },
          // §5.4: CRYSTAL supply so player-1's own Observatory isn't dormant
          // (Aether Lance is cast via a picked Observatory). player-2 gets
          // none: AEGIS_DOME demands 1 CRYSTAL slot it can't get.
          { x: 20, y: 20, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" }
        ],
        activeLocks: []
      }
    });
    const events: Array<Record<string, unknown>> = [];
    runtime.onEvent((event) => events.push(event as unknown as Record<string, unknown>));
    runtime.submitCommand({
      commandId: "aether-lance-dormant-aegis",
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
      commandId: "aether-lance-dormant-aegis",
      code: "AETHER_LANCE_INVALID",
      message: "blocked by an Aegis Dome"
    }));
    const target = runtime.exportState().tiles.find((tile) => tile.x === 5 && tile.y === 0);
    expect(target?.ownerId).toBeUndefined();
  });

  const astralDockTiles = (options: { includeCrystalSupply: boolean }): Array<Record<string, unknown>> => [
    {
      x: 0,
      y: 0,
      terrain: "LAND",
      ownerId: "player-1",
      ownershipState: "SETTLED",
      economicStructure: { ownerId: "player-1", type: "ASTRAL_DOCK", status: "active" }
    },
    {
      x: 1,
      y: 0,
      terrain: "LAND",
      ownerId: "player-1",
      ownershipState: "SETTLED",
      economicStructure: { ownerId: "player-1", type: "AETHER_TOWER", status: "active" }
    },
    { x: 4, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FISH" },
    // ASTRAL_DOCK now demands 4 CRYSTAL slots (bumped from 1: it consumes
    // its 3 Parts on completion, so its own slot cost absorbs what they
    // used to occupy) plus 1 for the Aether Tower — 5 total when supplied.
    ...(options.includeCrystalSupply
      ? [
          { x: 3, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" },
          { x: 5, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" },
          { x: 6, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" },
          { x: 7, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" },
          { x: 8, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" }
        ]
      : [{ x: 3, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" }])
  ];

  it("ASTRAL_DOCK_LAUNCH activates when powered and slot-supplied", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        ["player-1", player1()],
        ["player-2", buildAiOpponent()]
      ]),
      initialState: { tiles: astralDockTiles({ includeCrystalSupply: true }) as never, activeLocks: [] }
    });
    const events: Array<Record<string, unknown>> = [];
    runtime.onEvent((event) => events.push(event as unknown as Record<string, unknown>));
    runtime.submitCommand({
      commandId: "astral-dock-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "ASTRAL_DOCK_LAUNCH",
      payloadJson: JSON.stringify({ fromX: 0, fromY: 0 })
    });
    await Promise.resolve();
    expect(events).toContainEqual(expect.objectContaining({
      eventType: "PLAYER_MESSAGE",
      commandId: "astral-dock-1",
      messageType: "ASTRAL_DOCK_LAUNCH_ACTIVATED"
    }));
  });

  it("ASTRAL_DOCK_LAUNCH rejects a dormant Astral Dock even when Aether Tower-powered", async () => {
    // No CRYSTAL supply tile: ASTRAL_DOCK demands 1 CRYSTAL slot it can't get.
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        ["player-1", player1()],
        ["player-2", buildAiOpponent()]
      ]),
      initialState: { tiles: astralDockTiles({ includeCrystalSupply: false }) as never, activeLocks: [] }
    });
    const events: Array<Record<string, unknown>> = [];
    runtime.onEvent((event) => events.push(event as unknown as Record<string, unknown>));
    runtime.submitCommand({
      commandId: "astral-dock-dormant",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "ASTRAL_DOCK_LAUNCH",
      payloadJson: JSON.stringify({ fromX: 0, fromY: 0 })
    });
    await Promise.resolve();
    expect(events).toContainEqual(expect.objectContaining({
      eventType: "COMMAND_REJECTED",
      commandId: "astral-dock-dormant",
      code: "ASTRAL_DOCK_LAUNCH_INVALID",
      message: "Astral Dock has no free resource slot"
    }));
  });
});
