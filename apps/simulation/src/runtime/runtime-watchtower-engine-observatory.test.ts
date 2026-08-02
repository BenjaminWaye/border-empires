import { describe, expect, it } from "vitest";
import { SimulationRuntime } from "./runtime.js";
import { buildAiOpponent, buildPlayer } from "./runtime.test-helpers.js";

// The Watchtower Engine wonder tile acts as its controller's Observatory:
// eligible to cast crystal abilities (pickReadyOwnedObservatoryForTarget),
// gated by the same per-tile cooldown, but exempt from the CRYSTAL slot
// demand a real Observatory registers — "no upkeep" is the wonder's whole
// point (see syncWatchtowerObservatory, runtime-natural-wonders.ts).
describe("Watchtower Engine acts as an Observatory", () => {
  const tiles = (): Array<Record<string, unknown>> => [
    // player-1 owns the wonder and nothing else observatory-like, with
    // zero CRYSTAL supply — a real Observatory here would be dormant.
    {
      x: 0,
      y: 0,
      terrain: "LAND",
      ownerId: "player-1",
      ownershipState: "SETTLED",
      naturalWonder: { type: "WATCHTOWER_ENGINE" }
    },
    { x: 5, y: 0, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" },
    { x: 6, y: 0, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" }
  ];

  it("casts AETHER_LANCE with zero CRYSTAL supply and no built Observatory", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1", { manpower: 10_000, points: 20_000, techIds: new Set(["signal-fires"]) })],
        ["player-2", buildAiOpponent()]
      ]),
      initialState: { tiles: tiles() as never, activeLocks: [] }
    });
    const events: Array<Record<string, unknown>> = [];
    runtime.onEvent((event) => events.push(event as unknown as Record<string, unknown>));
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
    expect(events).not.toContainEqual(expect.objectContaining({ eventType: "COMMAND_REJECTED", commandId: "lance-1" }));
    expect(events).toContainEqual(expect.objectContaining({ eventType: "COMMAND_RESOLVED", commandId: "lance-1" }));
  });

  it("rejects a second cast while the wonder's observatory is on cooldown", async () => {
    let clock = 1_000;
    const runtime = new SimulationRuntime({
      now: () => clock,
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1", { manpower: 10_000, points: 20_000, techIds: new Set(["signal-fires"]) })],
        ["player-2", buildAiOpponent()]
      ]),
      initialState: { tiles: tiles() as never, activeLocks: [] }
    });
    const events: Array<Record<string, unknown>> = [];
    runtime.onEvent((event) => events.push(event as unknown as Record<string, unknown>));
    runtime.submitCommand({
      commandId: "lance-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: clock,
      type: "AETHER_LANCE",
      payloadJson: JSON.stringify({ x: 5, y: 0 })
    });
    await Promise.resolve();
    clock += 1_000;
    runtime.submitCommand({
      commandId: "lance-2",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 2,
      issuedAt: clock,
      type: "AETHER_LANCE",
      payloadJson: JSON.stringify({ x: 6, y: 0 })
    });
    await Promise.resolve();
    expect(events).toContainEqual(expect.objectContaining({
      eventType: "COMMAND_REJECTED",
      commandId: "lance-2",
      code: "AETHER_LANCE_INVALID",
      message: "no ready observatory in range"
    }));
  });

  it("reaches a target beyond a base (untechd) Observatory's range", async () => {
    // Base OBSERVATORY_CAST_RADIUS is 20; the wonder's fixed +10 puts it at
    // 30. A target at distance 25 is out of reach for a plain, tech-free
    // Observatory but within the wonder's fixed range.
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1", { manpower: 10_000, points: 20_000, techIds: new Set(["signal-fires"]) })],
        ["player-2", buildAiOpponent()]
      ]),
      initialState: {
        tiles: [
          { x: 0, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", naturalWonder: { type: "WATCHTOWER_ENGINE" } },
          { x: 25, y: 0, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" }
        ] as never,
        activeLocks: []
      }
    });
    const events: Array<Record<string, unknown>> = [];
    runtime.onEvent((event) => events.push(event as unknown as Record<string, unknown>));
    runtime.submitCommand({
      commandId: "lance-far",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "AETHER_LANCE",
      payloadJson: JSON.stringify({ x: 25, y: 0 })
    });
    await Promise.resolve();
    expect(events).toContainEqual(expect.objectContaining({ eventType: "COMMAND_RESOLVED", commandId: "lance-far" }));
  });

  it("does NOT stack its fixed +10 with observatory-range techs", async () => {
    // beacon-towers + grand-cartography each grant observatoryRangeBonus: 5,
    // which would put a REAL Observatory at 20+10=30. If the wonder's range
    // stacked with tech it would reach 30+10=40; it must not — a target at
    // distance 35 (beyond the wonder's fixed 30, but within what a
    // "tech-boosted observatory + 10" would wrongly reach) must be rejected.
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1", { manpower: 10_000, points: 20_000, techIds: new Set(["signal-fires", "beacon-towers", "grand-cartography"]) })],
        ["player-2", buildAiOpponent()]
      ]),
      initialState: {
        tiles: [
          { x: 0, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", naturalWonder: { type: "WATCHTOWER_ENGINE" } },
          { x: 35, y: 0, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" }
        ] as never,
        activeLocks: []
      }
    });
    const events: Array<Record<string, unknown>> = [];
    runtime.onEvent((event) => events.push(event as unknown as Record<string, unknown>));
    runtime.submitCommand({
      commandId: "lance-too-far",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "AETHER_LANCE",
      payloadJson: JSON.stringify({ x: 35, y: 0 })
    });
    await Promise.resolve();
    expect(events).toContainEqual(expect.objectContaining({
      eventType: "COMMAND_REJECTED",
      commandId: "lance-too-far",
      code: "AETHER_LANCE_INVALID",
      message: "no ready observatory in range"
    }));
  });

  it("rejects a REMOVE_STRUCTURE attempt against the wonder's observatory", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", buildPlayer("player-1", { manpower: 10_000, points: 20_000 })]]),
      initialState: { tiles: tiles() as never, activeLocks: [] }
    });
    const events: Array<Record<string, unknown>> = [];
    runtime.onEvent((event) => events.push(event as unknown as Record<string, unknown>));
    runtime.submitCommand({
      commandId: "remove-wonder-observatory",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "REMOVE_STRUCTURE",
      payloadJson: JSON.stringify({ x: 0, y: 0 })
    });
    await Promise.resolve();
    expect(events).toContainEqual(expect.objectContaining({
      eventType: "COMMAND_REJECTED",
      commandId: "remove-wonder-observatory",
      code: "STRUCTURE_REMOVE_INVALID"
    }));
    const wonderTile = runtime.exportState().tiles.find((tile) => tile.x === 0 && tile.y === 0);
    expect(wonderTile?.observatoryJson).toBeDefined();
  });
});
