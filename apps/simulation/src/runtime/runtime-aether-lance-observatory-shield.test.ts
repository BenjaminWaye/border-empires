import { describe, expect, it } from "vitest";
import { SimulationRuntime } from "./runtime.js";
import { buildAiOpponent, buildPlayer, collectEvents } from "./runtime.test-helpers.js";

// Server-side counterpart of client-observatory-cooldown.ts's
// hostileObservatoryProtectingTileAt: that client function only decides what
// a well-behaved client greys out as targetable, so without a matching
// server check a modified client (or any direct command) could ignore it.
// AETHER_LANCE ("Aether Purge") must reject when the target is within an
// enemy Observatory's protection radius, the same three gates the client
// already applies: active, off cooldown, not resource-slot dormant.
describe("AETHER_LANCE is blocked by a defending Observatory", () => {
  const baseTiles = (defenderObservatory: Record<string, unknown>): Array<Record<string, unknown>> => [
    { x: 0, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", observatory: { ownerId: "player-1", status: "active" } },
    // §5.4: CRYSTAL supply so player-1's own Observatory isn't dormant.
    { x: 30, y: 30, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" },
    { x: 5, y: 0, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" },
    { x: 6, y: 0, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED", observatory: defenderObservatory },
    // §5.4: CRYSTAL supply so player-2's Observatory isn't dormant.
    { x: 31, y: 31, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED", resource: "GEMS" }
  ];

  it("rejects when the target is within range of an active, off-cooldown enemy Observatory", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1", { points: 5_000, manpower: 10_000, techIds: new Set<string>(["crystal-lattices"]), strategicResources: { CRYSTAL: 500 } })],
        ["player-2", buildAiOpponent()]
      ]),
      initialState: { tiles: baseTiles({ ownerId: "player-2", status: "active" }) as never, activeLocks: [] }
    });
    const events = collectEvents(runtime);
    runtime.submitCommand({
      commandId: "aether-lance-observatory-shield",
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
      commandId: "aether-lance-observatory-shield",
      code: "AETHER_LANCE_INVALID",
      message: "blocked by an Aether Tower"
    }));
    const target = runtime.exportState().tiles.find((tile) => tile.x === 5 && tile.y === 0);
    expect(target?.ownerId).toBe("player-2");
  });

  it("does not reject when the defending Observatory is still on cooldown", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1", { points: 5_000, manpower: 10_000, techIds: new Set<string>(["crystal-lattices"]), strategicResources: { CRYSTAL: 500 } })],
        ["player-2", buildAiOpponent()]
      ]),
      initialState: { tiles: baseTiles({ ownerId: "player-2", status: "active", cooldownUntil: 5_000 }) as never, activeLocks: [] }
    });
    const events = collectEvents(runtime);
    runtime.submitCommand({
      commandId: "aether-lance-observatory-cooldown",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "AETHER_LANCE",
      payloadJson: JSON.stringify({ x: 5, y: 0 })
    });
    await Promise.resolve();
    expect(events).not.toContainEqual(expect.objectContaining({ eventType: "COMMAND_REJECTED", commandId: "aether-lance-observatory-cooldown" }));
    expect(events).toContainEqual(expect.objectContaining({ eventType: "COMMAND_RESOLVED", commandId: "aether-lance-observatory-cooldown" }));
  });
});
