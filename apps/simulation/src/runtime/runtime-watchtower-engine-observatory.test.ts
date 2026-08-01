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
