import { describe, expect, it } from "vitest";
import { SimulationRuntime } from "./runtime.js";
import { buildAiOpponent, buildPlayer } from "./runtime.test-helpers.js";

// §5.4 gap (same family as runtime-ability-dormancy-gate.test.ts): an
// Observatory demands a CRYSTAL slot (STRUCTURE_SLOT_REQUIREMENTS.OBSERVATORY)
// and can go dormant, but nothing that reads observatory.status === "active"
// ever checked dormancy — pickReadyOwnedObservatoryForTarget/
// pickReadyOwnedObservatoryAny (which feed Terrain Shaping, Aether Lance,
// Aether Bridge, Aether Wall, Siphon Tile, and Reveal Empire Stats) and
// handleSurveySweepCommand's own direct status check all only cared whether
// the observatory was "active", not whether its own CRYSTAL slot was
// covered by supply. These tests build an active, un-cooled-down observatory
// with zero CRYSTAL slot supply, so it's dormant per
// resourceSlotDormancyForPlayer, and assert the ability can no longer use it.

const player1 = (overrides: Parameters<typeof buildPlayer>[1] = {}) =>
  buildPlayer("player-1", { manpower: 10_000, points: 20_000, techIds: new Set(["surveying"]), strategicResources: { CRYSTAL: 1_000 }, ...overrides });

describe("§5.4 observatory dormancy gate", () => {
  it("SURVEY_SWEEP rejects a dormant Observatory even when active", async () => {
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
            observatory: { ownerId: "player-1", status: "active" }
          }
          // No CRYSTAL supply tile: OBSERVATORY demands 1 CRYSTAL slot.
        ],
        activeLocks: []
      }
    });
    const events: Array<Record<string, unknown>> = [];
    runtime.onEvent((event) => events.push(event as unknown as Record<string, unknown>));
    runtime.submitCommand({
      commandId: "survey-sweep-dormant",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "SURVEY_SWEEP",
      payloadJson: JSON.stringify({ x: 0, y: 0 })
    });
    await Promise.resolve();
    expect(events).toContainEqual(expect.objectContaining({
      eventType: "COMMAND_REJECTED",
      commandId: "survey-sweep-dormant",
      code: "SURVEY_SWEEP_INVALID",
      message: "observatory has no free resource slot"
    }));
  });

  it("SURVEY_SWEEP succeeds once the Observatory has real CRYSTAL supply", async () => {
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
            observatory: { ownerId: "player-1", status: "active" }
          },
          { x: 1, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" }
        ],
        activeLocks: []
      }
    });
    const events: Array<Record<string, unknown>> = [];
    runtime.onEvent((event) => events.push(event as unknown as Record<string, unknown>));
    runtime.submitCommand({
      commandId: "survey-sweep-supplied",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "SURVEY_SWEEP",
      payloadJson: JSON.stringify({ x: 0, y: 0 })
    });
    await Promise.resolve();
    expect(events).not.toContainEqual(expect.objectContaining({
      eventType: "COMMAND_REJECTED",
      commandId: "survey-sweep-supplied"
    }));
    expect(events).toContainEqual(expect.objectContaining({
      eventType: "PLAYER_MESSAGE",
      commandId: "survey-sweep-supplied"
    }));
  });

  it("REVEAL_EMPIRE_STATS rejects when the only Observatory is dormant (picker skips it)", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        ["player-1", player1({ techIds: new Set(["cryptography", "surveying"]) })],
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
            observatory: { ownerId: "player-1", status: "active" }
          },
          { x: 5, y: 5, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED", town: { type: "MARKET", populationTier: "SETTLEMENT" } }
          // No CRYSTAL supply tile: OBSERVATORY demands 1 CRYSTAL slot.
        ],
        activeLocks: []
      }
    });
    const events: Array<Record<string, unknown>> = [];
    runtime.onEvent((event) => events.push(event as unknown as Record<string, unknown>));
    runtime.submitCommand({
      commandId: "reveal-stats-dormant",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "REVEAL_EMPIRE_STATS",
      payloadJson: JSON.stringify({ targetPlayerId: "player-2" })
    });
    await Promise.resolve();
    expect(events).toContainEqual(expect.objectContaining({
      eventType: "COMMAND_REJECTED",
      commandId: "reveal-stats-dormant",
      code: "REVEAL_EMPIRE_STATS_INVALID",
      message: "no ready observatory available"
    }));
  });

  it("AETHER_LANCE rejects when the only Observatory is dormant (picker skips it)", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        ["player-1", player1({ techIds: new Set(["signal-fires"]) })],
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
            observatory: { ownerId: "player-1", status: "active" }
          },
          {
            x: 5,
            y: 0,
            terrain: "LAND",
            ownerId: "player-2",
            ownershipState: "SETTLED",
            economicStructure: { ownerId: "player-2", type: "GRANARY", status: "active" }
          }
          // No CRYSTAL supply tile: OBSERVATORY demands 1 CRYSTAL slot.
        ],
        activeLocks: []
      }
    });
    const events: Array<Record<string, unknown>> = [];
    runtime.onEvent((event) => events.push(event as unknown as Record<string, unknown>));
    runtime.submitCommand({
      commandId: "aether-lance-observatory-dormant",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "AETHER_LANCE",
      payloadJson: JSON.stringify({ x: 5, y: 0 })
    });
    await Promise.resolve();
    expect(events).toContainEqual(expect.objectContaining({
      eventType: "COMMAND_REJECTED",
      commandId: "aether-lance-observatory-dormant",
      code: "AETHER_LANCE_INVALID"
    }));
    const target = runtime.exportState().tiles.find((tile) => tile.x === 5 && tile.y === 0);
    expect(target?.economicStructureJson).toContain("\"GRANARY\"");
  });
});
